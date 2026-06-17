/** serials.ts — unità seriali (stock_serial_unit): ciclo di vita via transizioni
 *  validate (unica via ai cambi di stato, con audit leggero in attributes.history),
 *  + password apparato cifrata applicativamente e sbloccabile solo con
 *  serial:secret_read (brief Blocco C, Decisioni 6.5). Il chiaro non è MAI loggato. */
import type { FastifyInstance } from 'fastify';
import { createSerialSchema, serialTransitionSchema, serialSecretSchema, type SerialStatus } from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';
import { encryptSecret, decryptSecret } from '../crypto.js';

// transizioni ammesse del ciclo di vita seriale (le altre → 409)
const ALLOWED: Record<SerialStatus, SerialStatus[]> = {
  in_stock: ['assigned', 'installed', 'faulty', 'retired'],
  assigned: ['installed', 'in_stock', 'faulty'],
  installed: ['faulty', 'returned', 'retired'],
  faulty: ['returned', 'retired', 'in_stock'],
  returned: ['in_stock', 'retired'],
  retired: [],
};

export async function serialRoutes(app: FastifyInstance): Promise<void> {
  /** Carico di una nuova unità (entra in_stock). */
  app.post('/serials', { preHandler: [app.authenticate, requirePermission('serial:manage')] }, async (request, reply) => {
    const input = createSerialSchema.parse(request.body);
    const ctx = request.ctx;
    const id = await withRls(ctx, async (db) => {
      const r = await db.query(
        `INSERT INTO stock_serial_unit (tenant_id, material_id, serial, status, location_id, note, created_by, updated_by)
         VALUES ($1,$2,$3,'in_stock',$4,$5,$6,$6) RETURNING id`,
        [ctx.tenantId, input.materialId, input.serial, input.locationId ?? null, input.note ?? null, ctx.userId]);
      return r.rows[0].id as string;
    });
    return reply.code(201).send({ id });
  });

  /** Transizione di stato (unica via). Valida la transizione, aggiorna i campi
   *  pertinenti (ubicazione/detentore/ordinativo/installazione) e logga in history. */
  app.post<{ Params: { id: string } }>('/serials/:id/transition', { preHandler: [app.authenticate, requirePermission('serial:manage')] },
    async (request, reply) => {
      const input = serialTransitionSchema.parse(request.body);
      const ctx = request.ctx;
      return withRls(ctx, async (db) => {
        const cur = await db.query(`SELECT status, attributes FROM stock_serial_unit WHERE id = $1`, [request.params.id]);
        if (cur.rows.length === 0) return reply.code(404).send({ error: 'not_found', message: 'Seriale non trovato', statusCode: 404 });
        const from = cur.rows[0].status as SerialStatus;
        if (from !== input.to && !ALLOWED[from].includes(input.to))
          return reply.code(409).send({ error: 'bad_transition', message: `Transizione non ammessa: ${from} → ${input.to}`, statusCode: 409 });
        const hist = ((cur.rows[0].attributes as Record<string, unknown>)?.history as unknown[]) ?? [];
        hist.push({ at: new Date().toISOString(), by: ctx.userId, from, to: input.to, note: input.note ?? null });
        const attrs = { ...(cur.rows[0].attributes as Record<string, unknown>), history: hist };
        await db.query(
          `UPDATE stock_serial_unit SET status=$2,
             location_id        = CASE WHEN $3::uuid IS NOT NULL OR $2='in_stock' THEN $3 ELSE location_id END,
             holder_resource_id = CASE WHEN $2='assigned' THEN $4 WHEN $2='in_stock' THEN NULL ELSE holder_resource_id END,
             work_order_id      = COALESCE($5, work_order_id),
             installed_company_id = CASE WHEN $2='installed' THEN $6 ELSE installed_company_id END,
             installed_on       = CASE WHEN $2='installed' THEN COALESCE($7, CURRENT_DATE) ELSE installed_on END,
             note = COALESCE($8, note), attributes=$9, updated_by=$10
           WHERE id=$1`,
          [request.params.id, input.to, input.locationId ?? null, input.holderResourceId ?? null, input.workOrderId ?? null,
           input.installedCompanyId ?? null, input.installedOn ?? null, input.note ?? null, JSON.stringify(attrs), ctx.userId]);
        return { ok: true, from, to: input.to };
      });
    });

  /** Imposta/aggiorna la password apparato (cifrata lato server, mai in chiaro a DB). */
  app.put<{ Params: { id: string } }>('/serials/:id/secret', { preHandler: [app.authenticate, requirePermission('serial:manage')] },
    async (request) => {
      const { password } = serialSecretSchema.parse(request.body);
      const enc = encryptSecret(password);
      return withRls(request.ctx, async (db) => {
        await db.query(`UPDATE stock_serial_unit SET secrets = jsonb_build_object('password', $2::text), updated_by=$3 WHERE id=$1`,
          [request.params.id, enc, request.ctx.userId]);
        return { ok: true, hasSecret: true };
      });
    });

  /** Sblocca (decifra) la password — gated serial:secret_read. Una-tantum, mai loggata. */
  app.post<{ Params: { id: string } }>('/serials/:id/secret/reveal', { preHandler: [app.authenticate, requirePermission('serial:secret_read')] },
    async (request, reply) => withRls(request.ctx, async (db) => {
      const r = await db.query(`SELECT secrets FROM stock_serial_unit WHERE id=$1`, [request.params.id]);
      if (r.rows.length === 0) return reply.code(404).send({ error: 'not_found', message: 'Seriale non trovato', statusCode: 404 });
      const enc = (r.rows[0].secrets as Record<string, unknown>)?.password as string | undefined;
      if (!enc) return reply.code(404).send({ error: 'no_secret', message: 'Nessuna password impostata', statusCode: 404 });
      try { return { password: decryptSecret(enc) }; }
      catch { return reply.code(500).send({ error: 'decrypt_failed', message: 'Impossibile decifrare il segreto', statusCode: 500 }); }
    }));
}
