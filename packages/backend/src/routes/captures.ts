/**
 * captures.ts — la pipeline AI-first (Fase 2), end-to-end:
 *   1. CATTURA      POST /captures        (immutabile, status=pending)
 *   2. CONTESTO     (assembla agenda/cataloghi entro la RLS dell'utente)
 *   3. ESTRAZIONE   (LLM propone operazioni risolte sugli ID — fuori transazione)
 *   4. VALIDAZIONE  (deterministica: referenziale + RBAC + business)
 *   5. CONFERMA     POST /captures/:id/apply  (l'utente sceglie; auto le high-confidence)
 *   6. COMMIT       (in transazione, ogni riga legata a source_capture_id)
 * L'AI non scrive mai diretta nel DB: emette intento, il deterministico dispone.
 */
import type { FastifyInstance } from 'fastify';
import {
  createCaptureSchema, applyCaptureSchema, type CaptureDto, type ProposedOperation,
  type PermissionKey,
} from '@sisuite/shared';
import { aiEnabled } from '../config.js';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';
import { assembleContext } from '../ai/context.js';
import { runExtraction } from '../ai/process.js';
import { validateOperations } from '../ai/validator.js';
import { applyOperations } from '../ai/applier.js';
import { putMedia } from '../storage.js';
import { enqueueExtraction } from '../queue.js';
import type { RawOperation } from '../ai/extractionSchema.js';

interface CaptureRow {
  id: string; status: CaptureDto['status']; channel: CaptureDto['channel'];
  raw_text: string; created_at: string; processed_at: string | null; extraction: { operations?: RawOperation[] } | null;
}
function baseDto(r: CaptureRow, operations: ProposedOperation[] = []): CaptureDto {
  return {
    id: r.id, status: r.status, channel: r.channel, rawText: r.raw_text,
    engagementId: null, createdAt: r.created_at, processedAt: r.processed_at, operations,
  };
}

export async function captureRoutes(app: FastifyInstance): Promise<void> {
  // INBOX
  app.get('/captures', { preHandler: [app.authenticate, requirePermission('capture:read')] }, async (request) => {
    const rows = await withRls(request.ctx, (db) =>
      db.query(
        `SELECT id, status, channel, raw_text, created_at, processed_at, extraction
         FROM capture ORDER BY created_at DESC LIMIT 100`,
      ).then((r) => r.rows as CaptureRow[]));
    return { items: rows.map((r) => baseDto(r)) };
  });

  // DETTAGLIO (ricalcola le operazioni validate sul contesto corrente)
  app.get<{ Params: { id: string } }>('/captures/:id',
    { preHandler: [app.authenticate, requirePermission('capture:read')] },
    async (request, reply) => {
      const out = await withRls(request.ctx, async (db) => {
        const r = await db.query(`SELECT id, status, channel, raw_text, created_at, processed_at, extraction FROM capture WHERE id = $1`, [request.params.id]);
        if (!r.rows.length) return null;
        const row = r.rows[0] as CaptureRow;
        const rawOps = row.extraction?.operations ?? [];
        if (rawOps.length === 0) return baseDto(row);
        const context = await assembleContext(db, request.ctx, undefined);
        const perms = new Set<PermissionKey>(request.ctx.permissions as PermissionKey[]);
        const validated = validateOperations(rawOps, context, perms, context.today);
        return baseDto(row, validated);
      });
      if (!out) return reply.code(404).send({ error: 'not_found', message: 'Cattura non trovata', statusCode: 404 });
      return out;
    });

  // CATTURA TESTO + ESTRAZIONE (sincrona: l'utente ha scritto, attende un istante)
  app.post('/captures', { preHandler: [app.authenticate, requirePermission('capture:create')] },
    async (request, reply) => {
      const input = createCaptureSchema.parse(request.body);
      const ctx = request.ctx;

      const row = await withRls(ctx, async (db) => {
        const ins = await db.query(
          `INSERT INTO capture (tenant_id, user_id, channel, raw_text, status)
           VALUES ($1,$2,$3,$4,'pending')
           RETURNING id, status, channel, raw_text, created_at, processed_at, extraction`,
          [ctx.tenantId, ctx.userId, input.channel, input.rawText],
        );
        return ins.rows[0] as CaptureRow;
      });

      if (!aiEnabled()) {
        return reply.code(201).send({ ...baseDto(row), note: 'Pipeline AI non configurata (ANTHROPIC_API_KEY). La cattura è salvata; usa i form per rendicontare.' });
      }

      let operations: ProposedOperation[] = [];
      let status = row.status;
      let note: string | undefined;
      try {
        const r = await runExtraction(ctx, row.id, input.rawText, input.engagementId);
        operations = r.operations;
        status = r.status;
      } catch (err) {
        request.log.error(err);
        note = 'Estrazione AI fallita: ' + (err as Error).message + '. La cattura resta salvata.';
      }
      const dto = baseDto({ ...row, status }, operations);
      return reply.code(201).send(note ? { ...dto, note } : dto);
    });

  // CATTURA VOCE — "cattura-prima/elabora-dopo": salva audio+trascrizione e
  // ritorna SUBITO; un worker (pg-boss) estrae in background. Il client fa
  // polling su GET /captures/:id finché lo stato passa a 'proposed'.
  app.post('/captures/voice', { preHandler: [app.authenticate, requirePermission('capture:create')] },
    async (request, reply) => {
      const ctx = request.ctx;
      const file = await request.file();
      if (!file) return reply.code(400).send({ error: 'bad_request', message: 'File audio mancante', statusCode: 400 });
      const buffer = await file.toBuffer();
      const fields = file.fields as Record<string, { value?: unknown } | undefined>;
      const transcript = fields.transcript?.value ? String(fields.transcript.value) : null;
      const engagementId = fields.engagementId?.value ? String(fields.engagementId.value) : undefined;

      // 1) cattura-prima: archivia l'audio grezzo (tollerante)
      let mediaUrl: string | null = null;
      const notes: string[] = [];
      const key = `${ctx.tenantId}/${Date.now()}-${file.filename || 'audio.webm'}`;
      try {
        mediaUrl = await putMedia(key, buffer, file.mimetype || 'audio/webm');
      } catch (e) {
        notes.push('Audio non archiviato (MinIO non raggiungibile): ' + (e as Error).message);
      }

      const row = await withRls(ctx, async (db) => {
        const ins = await db.query(
          `INSERT INTO capture (tenant_id, user_id, channel, media_url, media_type, raw_text, client_created_at, status)
           VALUES ($1,$2,'voice',$3,$4,$5, now(), 'pending')
           RETURNING id, status, channel, raw_text, created_at, processed_at, extraction`,
          [ctx.tenantId, ctx.userId, mediaUrl, file.mimetype || 'audio/webm', transcript],
        );
        return ins.rows[0] as CaptureRow;
      });

      // 2) elabora-dopo: accoda l'estrazione (o fallback sincrono se la coda è giù)
      let queued = false;
      if (!aiEnabled()) {
        notes.push('Pipeline AI non configurata.');
      } else if (!transcript) {
        notes.push('Nessuna trascrizione: audio salvato, niente da estrarre.');
      } else {
        queued = await enqueueExtraction({ ctx, captureId: row.id, rawText: transcript, engagementId });
        if (!queued) {
          try { await runExtraction(ctx, row.id, transcript, engagementId); }
          catch (e) { notes.push('Estrazione fallita: ' + (e as Error).message); }
        }
      }

      const note = notes.length ? notes.join(' ') : undefined;
      return reply.code(202).send({ ...baseDto(row), queued, ...(note ? { note } : {}) });
    });

  // CONFERMA + COMMIT
  app.post<{ Params: { id: string } }>('/captures/:id/apply',
    { preHandler: [app.authenticate, requirePermission('capture:apply')] },
    async (request, reply) => {
      const body = applyCaptureSchema.parse(request.body ?? {});
      const out = await withRls(request.ctx, async (db) => {
        const r = await db.query(`SELECT id, status, channel, raw_text, created_at, processed_at, extraction FROM capture WHERE id = $1`, [request.params.id]);
        if (!r.rows.length) return null;
        const row = r.rows[0] as CaptureRow;
        const rawOps = row.extraction?.operations ?? [];
        const context = await assembleContext(db, request.ctx, undefined);
        const perms = new Set<PermissionKey>(request.ctx.permissions as PermissionKey[]);
        const validated = validateOperations(rawOps, context, perms, context.today);
        const applied = await applyOperations(db, request.ctx, row.id, validated, body.operationIndexes);
        const status = applied.some((o) => o.applied) && !applied.some((o) => !o.applied && o.valid && o.type !== 'clarify')
          ? 'applied' : (applied.some((o) => o.applied) ? 'proposed' : row.status);
        return baseDto({ ...row, status, processed_at: new Date().toISOString() }, applied);
      });
      if (!out) return reply.code(404).send({ error: 'not_found', message: 'Cattura non trovata', statusCode: 404 });
      return out;
    });

  // RIFIUTA
  app.post<{ Params: { id: string } }>('/captures/:id/reject',
    { preHandler: [app.authenticate, requirePermission('capture:apply')] },
    async (request, reply) => {
      await withRls(request.ctx, (db) => db.query(`UPDATE capture SET status = 'rejected', processed_at = now() WHERE id = $1`, [request.params.id]));
      return reply.code(204).send();
    });
}
