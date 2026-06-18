/**
 * companyDedup.ts — Deduplica Soggetti (company).
 *
 *  - POST /companies/dedup/scan  : proposta DETERMINISTICA dei doppioni (no AI).
 *      Normalizza il displayName (lowercase, via punteggiatura, spazi multipli e
 *      suffissi societari) e raggruppa per chiave uguale (gruppi con >=2 membri).
 *  - POST /companies/merge       : FUSIONE transazionale e IDEMPOTENTE.
 *      Ri-punta TUTTE le FK verso company dagli assorbiti al superstite e
 *      ARCHIVIA (mai cancella) gli assorbiti. Una sola transazione, dentro RLS.
 *
 * FK verso company ri-puntate (verificate sul DB live, 11 colonne):
 *   app_user.company_id                    (ON DELETE SET NULL)
 *   asset.company_id                       (ON DELETE RESTRICT)
 *   company_role.company_id                (ON DELETE CASCADE)  UNIQUE(company_id,role)
 *   company_contact.company_id             (ON DELETE CASCADE)
 *   engagement.company_id                  (ON DELETE RESTRICT)
 *   price_list_override.company_id         (ON DELETE CASCADE)
 *   site.company_id                        (ON DELETE CASCADE)  -- non in brief, presente sul DB
 *   stock_document.company_id              (ON DELETE SET NULL) -- non in brief, presente sul DB
 *   stock_serial_unit.installed_company_id (ON DELETE SET NULL)
 *   subcontract_line.company_id            (ON DELETE RESTRICT)
 *   work_order.principal_company_id        (ON DELETE SET NULL) UNIQUE(tenant_id,principal_company_id,principal_order_ref)
 *
 * NIENTE PII nei log. NIENTE AI: la proposta è puramente deterministica.
 */
import type { FastifyInstance } from 'fastify';
import type { PoolClient } from '../db/pool.js';
import { mergeCompaniesSchema, type DedupGroupDto, type MergeResultDto } from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';

/** suffissi societari da rimuovere in coda alla chiave normalizzata (post-strip punteggiatura). */
const COMPANY_SUFFIXES = [
  'srls', 'srl', 'spa', 'sapa', 'sas', 'snc', 'srlsemplificata',
  'ss', 'scarl', 'scrl', 'scpa', 'sc', 'coop',
  'ltd', 'llc', 'inc', 'gmbh', 'sl', 'sa', 'plc', 'bv', 'ag', 'oy', 'ab',
];

/**
 * Normalizza un nome soggetto per il confronto deterministico:
 *  - lowercase + trim
 *  - rimuove diacritici (è→e) per robustezza
 *  - sostituisce ogni carattere non alfanumerico con spazio (toglie & . , - / ' " ecc.)
 *  - collassa spazi multipli
 *  - rimuove i suffissi societari finali (ripetutamente: "alfa s.r.l." e "alfa srl" → "alfa")
 */
export function normalizeCompanyName(raw: string): string {
  let s = (raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // toglie i diacritici combinanti (è→e)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  // togli i suffissi societari in coda (più di uno, es. "... s p a")
  let changed = true;
  while (changed) {
    changed = false;
    for (const suf of COMPANY_SUFFIXES) {
      if (s === suf) continue; // non azzerare un nome che è SOLO un suffisso
      if (s.endsWith(' ' + suf)) {
        s = s.slice(0, -(suf.length + 1)).trim();
        changed = true;
        break;
      }
    }
  }
  return s;
}

interface ScanRow {
  id: string;
  display_name: string;
  created_at: string;
  relations: number;
}

export type MergeOutcome =
  | { ok: true; survivorId: string; absorbed: number; repointed: Record<string, number> }
  | { ok: false; conflict: string };

/**
 * Core della fusione: DENTRO una transazione/sessione RLS già aperta (db).
 * Ri-punta tutte le FK verso company dagli assorbiti al superstite, gestisce i
 * conflitti UNIQUE (company_role, work_order) e archivia gli assorbiti.
 * IDEMPOTENTE: ri-eseguirla con assorbiti già archiviati è un no-op sicuro.
 * Estratta dall'handler così il test DB-backed può esercitare lo stesso codice.
 */
export async function mergeCompanies(
  db: PoolClient,
  survivorId: string,
  rawAbsorbedIds: string[],
  actingUserId: string,
): Promise<MergeOutcome> {
  const absorbedIds = [...new Set(rawAbsorbedIds)].filter((id) => id !== survivorId);
  if (absorbedIds.length === 0) return { ok: false, conflict: 'no_absorbed' };

  // 1) validazione: superstite esiste e NON archiviato (la RLS filtra già il tenant).
  const surv = await db.query(
    `SELECT id FROM company WHERE id = $1 AND archived_at IS NULL`, [survivorId]);
  if (surv.rows.length === 0) return { ok: false, conflict: 'survivor_not_found' };

  // gli assorbiti possono essere GIÀ archiviati (idempotenza); devono però esistere nel tenant.
  const present = await db.query(
    `SELECT id FROM company WHERE id = ANY($1::uuid[])`, [absorbedIds]);
  const presentIds = new Set((present.rows as { id: string }[]).map((r) => r.id));
  for (const id of absorbedIds) {
    if (!presentIds.has(id)) return { ok: false, conflict: `absorbed_not_found:${id}` };
  }

  const repointed: Record<string, number> = {};
  const repoint = async (table: string, column: string): Promise<void> => {
    const r = await db.query(
      `UPDATE ${table} SET ${column} = $1 WHERE ${column} = ANY($2::uuid[])`,
      [survivorId, absorbedIds],
    );
    if ((r.rowCount ?? 0) > 0) repointed[table] = (repointed[table] ?? 0) + (r.rowCount ?? 0);
  };

  // 2a) company_role: UNIQUE(company_id, role) → togli dagli assorbiti i ruoli che il
  //     superstite già possiede, poi ri-punta i restanti.
  const delRoles = await db.query(
    `DELETE FROM company_role ar
       WHERE ar.company_id = ANY($1::uuid[])
         AND EXISTS (SELECT 1 FROM company_role sr
                      WHERE sr.company_id = $2 AND sr.role = ar.role)`,
    [absorbedIds, survivorId],
  );
  if ((delRoles.rowCount ?? 0) > 0) repointed['company_role_dup_removed'] = delRoles.rowCount ?? 0;
  await repoint('company_role', 'company_id');

  // 2b) work_order: UNIQUE(tenant_id, principal_company_id, principal_order_ref).
  //     Ri-punta solo le righe che NON collidono; le altre restano sull'assorbito
  //     (archiviato, non cancellato → nessun orfano, FK valida).
  const woRes = await db.query(
    `UPDATE work_order w SET principal_company_id = $1
       WHERE w.principal_company_id = ANY($2::uuid[])
         AND NOT EXISTS (
           SELECT 1 FROM work_order s
            WHERE s.tenant_id = w.tenant_id
              AND s.principal_company_id = $1
              AND s.principal_order_ref IS NOT DISTINCT FROM w.principal_order_ref
         )`,
    [survivorId, absorbedIds],
  );
  if ((woRes.rowCount ?? 0) > 0) repointed['work_order'] = woRes.rowCount ?? 0;

  // 2c) tutte le altre FK (nessun UNIQUE su company → update diretto)
  await repoint('app_user', 'company_id');
  await repoint('asset', 'company_id');
  await repoint('company_contact', 'company_id');
  await repoint('engagement', 'company_id');
  await repoint('price_list_override', 'company_id');
  await repoint('site', 'company_id');
  await repoint('stock_document', 'company_id');
  await repoint('stock_serial_unit', 'installed_company_id');
  await repoint('subcontract_line', 'company_id');

  // 3) archivia gli assorbiti (solo i non-già-archiviati → idempotente)
  const arch = await db.query(
    `UPDATE company SET archived_at = now(), updated_by = $2
       WHERE id = ANY($1::uuid[]) AND archived_at IS NULL`,
    [absorbedIds, actingUserId],
  );

  return { ok: true, survivorId, absorbed: arch.rowCount ?? 0, repointed };
}

export async function companyDedupRoutes(app: FastifyInstance): Promise<void> {
  // ── PROPOSTA (sola lettura, nessuna scrittura) ───────────────────────
  app.post('/companies/dedup/scan',
    { preHandler: [app.authenticate, requirePermission('company:read')] },
    async (request) => {
      return withRls(request.ctx, async (db) => {
        // conteggio relazioni = euristica per scegliere il superstite (più "ricco" vince)
        const res = await db.query(
          `SELECT c.id, c.display_name, c.created_at,
                  ( (SELECT count(*) FROM company_role     r WHERE r.company_id = c.id)
                  + (SELECT count(*) FROM engagement       e WHERE e.company_id = c.id)
                  + (SELECT count(*) FROM company_contact ct WHERE ct.company_id = c.id)
                  + (SELECT count(*) FROM asset            a WHERE a.company_id = c.id)
                  + (SELECT count(*) FROM work_order       w WHERE w.principal_company_id = c.id)
                  )::int AS relations
           FROM company c
           WHERE c.archived_at IS NULL`,
        );
        const groups = new Map<string, ScanRow[]>();
        for (const r of res.rows as ScanRow[]) {
          const key = normalizeCompanyName(r.display_name);
          if (!key) continue; // nome vuoto/solo-rumore: non raggruppabile
          (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
        }
        const out: DedupGroupDto[] = [];
        for (const [key, members] of groups) {
          if (members.length < 2) continue;
          // superstite suggerito: più relazioni; a parità, il più vecchio (created_at asc)
          const sorted = [...members].sort((a, b) =>
            b.relations - a.relations ||
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          const survivor = sorted[0]!; // members.length >= 2 garantito sopra
          const absorbed = sorted.slice(1);
          out.push({
            normalizedKey: key,
            suggestedSurvivorId: survivor.id,
            absorbedIds: absorbed.map((m) => m.id),
            members: sorted.map((m) => ({
              id: m.id, displayName: m.display_name, createdAt: m.created_at, relations: m.relations,
            })),
            reason: `${members.length} soggetti con nome equivalente ("${key}"). `
              + `Superstite suggerito: "${survivor.display_name}" (${survivor.relations} relazioni, il più completo/anziano).`,
          });
        }
        // gruppi più "voluminosi" prima
        out.sort((a, b) => b.members.length - a.members.length || a.normalizedKey.localeCompare(b.normalizedKey));
        return { groups: out };
      });
    });

  // ── FUSIONE (transazionale, idempotente) ─────────────────────────────
  app.post('/companies/merge',
    { preHandler: [app.authenticate, requirePermission('company:delete')] },
    async (request, reply) => {
      const input = mergeCompaniesSchema.parse(request.body);
      // tutta la fusione in UNA transazione (withRls apre BEGIN/COMMIT)
      const result = await withRls(request.ctx, (db) =>
        mergeCompanies(db, input.survivorId, input.absorbedIds, request.ctx.userId));

      if (!result.ok) {
        const code = result.conflict.startsWith('survivor') || result.conflict === 'no_absorbed' ? 400 : 409;
        return reply.code(code).send({
          error: code === 400 ? 'bad_request' : 'conflict',
          message: `Fusione non eseguibile: ${result.conflict}`,
          statusCode: code,
        });
      }
      const out: MergeResultDto = {
        survivorId: result.survivorId, absorbed: result.absorbed, repointed: result.repointed,
      };
      return out;
    });
}
