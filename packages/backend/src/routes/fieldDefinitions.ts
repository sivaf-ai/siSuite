/** fieldDefinitions.ts — field_definition per (entità, verticale tenant):
 *  GET pubblico (form), e CRUD dei CAMPI PERSONALIZZATI del tenant (settings:manage).
 *  Le righe di SISTEMA (tenant_id NULL) sono sola lettura: la RLS (fd_modify) impedisce
 *  al tenant di modificarle (WITH CHECK tenant_id = tenant corrente). */
import type { FastifyInstance } from 'fastify';
import { createFieldDefinitionSchema, updateFieldDefinitionSchema, updateFieldOverrideSchema } from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';
import { loadFieldDefs, loadAllFieldDefs, tenantVertical } from '../fields.js';

export async function fieldDefinitionRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { entity?: string; manage?: string; country?: string; variant?: string } }>(
    '/field-definitions',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const entity = request.query.entity;
      if (!entity) return reply.code(400).send({ error: 'bad_request', message: 'parametro entity obbligatorio', statusCode: 400 });
      // ?manage=1 (Field Builder): include anche i campi disattivati, ma solo per chi gestisce le impostazioni
      const manage = request.query.manage === '1' && request.ctx.permissions.includes('settings:manage');
      const items = await withRls(request.ctx, async (db) => {
        const vertical = await tenantVertical(db, request.ctx.tenantId);
        // ?variant=<tipo>: il form di un record tipizzato carica i campi del suo Tipo (+ universali)
        return manage ? loadAllFieldDefs(db, entity, vertical) : loadFieldDefs(db, entity, vertical, request.query.country, request.query.variant);
      });
      return { items };
    },
  );

  // CREA campo personalizzato del tenant (vertical NULL = vale per il tenant a prescindere dal verticale)
  app.post('/field-definitions', { preHandler: [app.authenticate, requirePermission('settings:manage')] },
    async (request, reply) => {
      const input = createFieldDefinitionSchema.parse(request.body);
      try {
        const out = await withRls(request.ctx, async (db) => {
          // evita doppioni nel form: nessun campo con stessa entità+chiave+paese+variante già visibile
          const dup = await db.query(
            `SELECT 1 FROM field_definition WHERE entity = $1 AND key = $2 AND country IS NOT DISTINCT FROM $3 AND variant IS NOT DISTINCT FROM $4 LIMIT 1`,
            [input.entity, input.key, input.country ?? null, input.variant ?? null]);
          if (dup.rows.length) return { dup: true } as const;
          const r = await db.query(
            `INSERT INTO field_definition (tenant_id, vertical, entity, key, country, variant, label, data_type, required, options, unit, help, placeholder, group_key, sequence, active)
             VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`,
            [request.ctx.tenantId, input.entity, input.key, input.country ?? null, input.variant ?? null, JSON.stringify(input.label), input.dataType,
             input.required ?? false, input.options ? JSON.stringify(input.options) : null,
             input.unit ?? null, input.help ? JSON.stringify(input.help) : null,
             input.placeholder ? JSON.stringify(input.placeholder) : null,
             input.groupKey ?? null, input.sequence ?? 100, input.active ?? true]);
          return { id: r.rows[0].id as string } as const;
        });
        if ('dup' in out) return reply.code(409).send({ error: 'conflict', message: 'Esiste già un campo con questa chiave per l\'entità', statusCode: 409 });
        return reply.code(201).send({ id: out.id });
      } catch (err) {
        if ((err as { code?: string }).code === '23505')
          return reply.code(409).send({ error: 'conflict', message: 'Esiste già un campo con questa chiave per l\'entità', statusCode: 409 });
        throw err;
      }
    });

  // MODIFICA (solo campi del tenant: la RLS esclude le righe di sistema → 0 righe → 404)
  app.patch<{ Params: { id: string } }>('/field-definitions/:id',
    { preHandler: [app.authenticate, requirePermission('settings:manage')] },
    async (request, reply) => {
      const input = updateFieldDefinitionSchema.parse(request.body);
      const ok = await withRls(request.ctx, async (db) => {
        const r = await db.query(
          `UPDATE field_definition SET
             label = COALESCE($2, label), data_type = COALESCE($3, data_type), required = COALESCE($4, required),
             options = $5, unit = $6, help = $7, group_key = $8, sequence = COALESCE($9, sequence),
             placeholder = $11, active = COALESCE($12, active)
           WHERE id = $1 AND tenant_id = $10 RETURNING id`,
          [request.params.id,
           input.label ? JSON.stringify(input.label) : null,
           input.dataType ?? null, input.required ?? null,
           input.options !== undefined ? (input.options ? JSON.stringify(input.options) : null) : null,
           input.unit !== undefined ? input.unit : null,
           input.help !== undefined ? (input.help ? JSON.stringify(input.help) : null) : null,
           input.groupKey !== undefined ? input.groupKey : null,
           input.sequence ?? null, request.ctx.tenantId,
           input.placeholder !== undefined ? (input.placeholder ? JSON.stringify(input.placeholder) : null) : null,
           input.active ?? null]);
        return r.rows.length > 0;
      });
      if (!ok) return reply.code(404).send({ error: 'not_found', message: 'Campo non trovato o di sistema (non modificabile)', statusCode: 404 });
      return { ok: true };
    });

  app.delete<{ Params: { id: string } }>('/field-definitions/:id',
    { preHandler: [app.authenticate, requirePermission('settings:manage')] },
    async (request, reply) => {
      await withRls(request.ctx, (db) => db.query(`DELETE FROM field_definition WHERE id = $1 AND tenant_id = $2`, [request.params.id, request.ctx.tenantId]));
      return reply.code(204).send();
    });

  // PERSONALIZZA un campo di SISTEMA (override per-tenant: label/obbligatorio/attivo/
  // ordine/segnaposto/aiuto/unità). La riga di sistema condivisa NON viene toccata.
  app.put<{ Params: { id: string } }>('/field-definitions/:id/override',
    { preHandler: [app.authenticate, requirePermission('settings:manage')] },
    async (request, reply) => {
      const input = updateFieldOverrideSchema.parse(request.body);
      const out = await withRls(request.ctx, async (db) => {
        const fd = await db.query(`SELECT id FROM field_definition WHERE id = $1`, [request.params.id]);
        if (!fd.rows.length) return null;
        await db.query(
          `INSERT INTO field_definition_override (tenant_id, field_definition_id, label, required, active, sequence, placeholder, help, unit, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (tenant_id, field_definition_id) DO UPDATE SET
             label = EXCLUDED.label, required = EXCLUDED.required, active = EXCLUDED.active, sequence = EXCLUDED.sequence,
             placeholder = EXCLUDED.placeholder, help = EXCLUDED.help, unit = EXCLUDED.unit, updated_at = now(), updated_by = EXCLUDED.updated_by`,
          [request.ctx.tenantId, request.params.id,
           input.label ? JSON.stringify(input.label) : null, input.required ?? null, input.active ?? null, input.sequence ?? null,
           input.placeholder ? JSON.stringify(input.placeholder) : null, input.help ? JSON.stringify(input.help) : null,
           input.unit ?? null, request.ctx.userId]);
        return { ok: true };
      });
      if (!out) return reply.code(404).send({ error: 'not_found', message: 'Campo non trovato', statusCode: 404 });
      return out;
    });

  // RIPRISTINA il default (elimina l'override del tenant).
  app.delete<{ Params: { id: string } }>('/field-definitions/:id/override',
    { preHandler: [app.authenticate, requirePermission('settings:manage')] },
    async (request, reply) => {
      await withRls(request.ctx, (db) => db.query(
        `DELETE FROM field_definition_override WHERE field_definition_id = $1 AND tenant_id = $2`,
        [request.params.id, request.ctx.tenantId]));
      return reply.code(204).send();
    });
}
