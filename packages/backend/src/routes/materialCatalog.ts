/** materialCatalog.ts — Catalogo articoli: categorie gerarchiche (Blocco B.2),
 *  fornitori per articolo (B.4), immagini multiple su MinIO (B.3). Tutte le tabelle
 *  hanno tenant_id + RLS già a DB. */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  createMaterialCategorySchema, updateMaterialCategorySchema, treeDeleteMode,
  createMaterialSupplierSchema, updateMaterialSupplierSchema, reorderImagesSchema,
  type MaterialCategoryDto, type MaterialSupplierDto, type MaterialImageDto,
} from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';
import { config } from '../config.js';
import { putObject, presignObject, removeObject } from '../storage.js';

const IMG_BUCKET = config.storage.materialBucket;
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

function categoryDto(r: Record<string, unknown>): MaterialCategoryDto {
  return {
    id: r.id as string,
    parentId: (r.parent_id as string) ?? null,
    name: r.name as string,
    description: (r.description as string) ?? null,
    color: (r.color as string) ?? null,
    icon: (r.icon as string) ?? null,
    imageUrl: (r.image_url as string) ?? null,
    active: (r.active as boolean) ?? false,
    sequence: Number(r.sequence ?? 0),
    isSystem: (r.is_system as boolean) ?? false,
    ...(r.archived_at !== undefined ? { archivedAt: (r.archived_at as string) ?? null } : {}),
    ...(r.direct_count != null ? { directCount: Number(r.direct_count) } : {}),
  };
}
const CAT_COLS = `id, parent_id, name, description, color, icon, image_url, active, sequence, is_system`;

function supplierDto(r: Record<string, unknown>): MaterialSupplierDto {
  return {
    id: r.id as string,
    materialId: r.material_id as string,
    supplierId: r.supplier_id as string,
    supplierName: (r.supplier_name as string) ?? null,
    supplierSku: (r.supplier_sku as string) ?? null,
    purchasePrice: r.purchase_price == null ? null : Number(r.purchase_price),
    currency: (r.currency as string) ?? null,
    leadTimeDays: r.lead_time_days == null ? null : Number(r.lead_time_days),
    isPreferred: (r.is_preferred as boolean) ?? false,
  };
}

function imageDto(r: Record<string, unknown>): MaterialImageDto {
  return {
    id: r.id as string,
    materialId: r.material_id as string,
    objectKey: r.object_key as string,
    isPrimary: (r.is_primary as boolean) ?? false,
    sequence: Number(r.sequence),
  };
}


export async function materialCatalogRoutes(app: FastifyInstance): Promise<void> {
  // ── material_category (EntityTree, STANDARD entità ad albero §5) ───────
  // Lista PIATTA con conteggi DIRETTI (articoli non archiviati per nodo); il
  // sottoalbero è sommato client-side da EntityTree. ?includeArchived=true opz.
  app.get<{ Querystring: { includeArchived?: string } }>('/material-categories',
    { preHandler: [app.authenticate, requirePermission('material:read')] },
    async (request) => withRls(request.ctx, async (db) => {
      const includeArchived = request.query.includeArchived === 'true' || request.query.includeArchived === '1';
      const rows = await db.query(
        `SELECT ${CAT_COLS}, mc.archived_at,
                (SELECT count(*) FROM material m WHERE m.category_id = mc.id AND m.archived_at IS NULL)::int AS direct_count
         FROM material_category mc
         WHERE ($1::bool OR mc.archived_at IS NULL)
         ORDER BY mc.sequence, mc.name`,
        [includeArchived]);
      return { items: rows.rows.map(categoryDto) };
    }));

  // Crea (parentId null = radice). Ritorna il NodeDto creato (serve al pick-mode §6.10).
  // Se sequence non indicata → in coda ai fratelli (max+1).
  app.post('/material-categories', { preHandler: [app.authenticate, requirePermission('material:update')] },
    async (request, reply) => {
      const input = createMaterialCategorySchema.parse(request.body);
      const ctx = request.ctx;
      const dto = await withRls(ctx, async (db) => {
        let seq = input.sequence;
        if (seq === undefined) {
          const m = await db.query(
            `SELECT COALESCE(max(sequence), -1) + 1 AS seq FROM material_category
             WHERE tenant_id = $1 AND parent_id IS NOT DISTINCT FROM $2`,
            [ctx.tenantId, input.parentId ?? null]);
          seq = Number(m.rows[0].seq);
        }
        const r = await db.query(
          `INSERT INTO material_category (tenant_id, parent_id, name, description, color, icon, image_url, active, sequence, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
           RETURNING ${CAT_COLS}`,
          [ctx.tenantId, input.parentId ?? null, input.name, input.description ?? null, input.color ?? null,
           input.icon ?? null, input.imageUrl ?? null, input.active ?? true, seq, ctx.userId]);
        return categoryDto(r.rows[0]);
      });
      return reply.code(201).send(dto);
    });

  // Update dinamico dei soli campi presenti. Cambio parentId = spostamento (anti-ciclo a DB).
  app.patch<{ Params: { id: string } }>('/material-categories/:id',
    { preHandler: [app.authenticate, requirePermission('material:update')] },
    async (request, reply) => {
      const input = updateMaterialCategorySchema.parse(request.body);
      const out = await withRls(request.ctx, async (db) => {
        const guard = await db.query(`SELECT is_system FROM material_category WHERE id = $1`, [request.params.id]);
        if (!guard.rows.length) return { notFound: true as const };
        if (guard.rows[0].is_system) return { system: true as const };
        const sets: string[] = []; const vals: unknown[] = [request.params.id];
        const add = (col: string, val: unknown) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };
        if (input.name !== undefined) add('name', input.name);
        if (input.parentId !== undefined) add('parent_id', input.parentId);
        if (input.description !== undefined) add('description', input.description);
        if (input.color !== undefined) add('color', input.color);
        if (input.icon !== undefined) add('icon', input.icon);
        if (input.imageUrl !== undefined) add('image_url', input.imageUrl);
        if (input.sequence !== undefined) add('sequence', input.sequence);
        if (input.active !== undefined) add('active', input.active);
        vals.push(request.ctx.userId); sets.push(`updated_by = $${vals.length}`);
        const r = await db.query(
          `UPDATE material_category SET ${sets.join(', ')} WHERE id = $1 RETURNING ${CAT_COLS}`, vals);
        return { dto: categoryDto(r.rows[0]) };
      });
      if ('notFound' in out) return reply.code(404).send({ error: 'not_found', message: 'Categoria non trovata', statusCode: 404 });
      if ('system' in out) return reply.code(409).send({ error: 'conflict', message: 'Categoria di sistema: non modificabile. Puoi duplicarla.', statusCode: 409 });
      return out.dto;
    });

  // DELETE a TRE MODI (STANDARD §7), tutto in transazione. Conteggi RICORSIVI.
  //  block   : se figli o articoli nel sottoalbero → 409 con conteggi; altrimenti archivia il nodo.
  //  reassign: figli salgono al nonno, articoli del nodo passano al genitore, archivia solo il nodo.
  //  cascade : archivia nodo + discendenti; articoli del sottoalbero → category_id NULL (avviso col numero).
  app.delete<{ Params: { id: string }; Querystring: { mode?: string } }>('/material-categories/:id',
    { preHandler: [app.authenticate, requirePermission('material:update')] },
    async (request, reply) => {
      const mode = treeDeleteMode.catch('block').parse(request.query.mode);
      const id = request.params.id;
      const userId = request.ctx.userId;
      const res = await withRls(request.ctx, async (db) => {
        const cur = await db.query(`SELECT parent_id, is_system FROM material_category WHERE id = $1 AND archived_at IS NULL`, [id]);
        if (!cur.rows.length) return { notFound: true as const };
        if (cur.rows[0].is_system) return { system: true as const };
        const parentId = (cur.rows[0].parent_id as string) ?? null;
        // sottoalbero completo (nodo + discendenti attivi)
        const sub = await db.query(
          `WITH RECURSIVE tree AS (
             SELECT id FROM material_category WHERE id = $1
             UNION ALL
             SELECT c.id FROM material_category c JOIN tree t ON c.parent_id = t.id WHERE c.archived_at IS NULL
           ) SELECT array_agg(id) AS ids FROM tree`, [id]);
        const ids: string[] = sub.rows[0].ids ?? [id];
        const directChildren = (await db.query(
          `SELECT count(*)::int AS n FROM material_category WHERE parent_id = $1 AND archived_at IS NULL`, [id])).rows[0].n as number;
        const subtreeMaterials = (await db.query(
          `SELECT count(*)::int AS n FROM material WHERE category_id = ANY($1) AND archived_at IS NULL`, [ids])).rows[0].n as number;
        const directMaterials = (await db.query(
          `SELECT count(*)::int AS n FROM material WHERE category_id = $1 AND archived_at IS NULL`, [id])).rows[0].n as number;

        if (mode === 'block') {
          const parts: string[] = [];
          if (directChildren) parts.push(`${directChildren} sotto-categorie`);
          if (subtreeMaterials) parts.push(`${subtreeMaterials} articoli`);
          if (parts.length) return { blocked: parts as string[] };
          await db.query(`UPDATE material_category SET archived_at = now(), archived_by = $2, updated_by = $2 WHERE id = $1`, [id, userId]);
          return { result: { ok: true, archivedNodes: 1 } };
        }
        if (mode === 'reassign') {
          // figli diretti → al nonno; articoli del nodo → al genitore; archivia solo il nodo
          await db.query(`UPDATE material_category SET parent_id = $2, updated_by = $3 WHERE parent_id = $1 AND archived_at IS NULL`, [id, parentId, userId]);
          await db.query(`UPDATE material SET category_id = $2, updated_by = $3 WHERE category_id = $1 AND archived_at IS NULL`, [id, parentId, userId]);
          await db.query(`UPDATE material_category SET archived_at = now(), archived_by = $2, updated_by = $2 WHERE id = $1`, [id, userId]);
          return { result: { ok: true, reassigned: directChildren, movedMaterials: directMaterials } };
        }
        // cascade: articoli del sottoalbero → senza categoria; archivia nodo + discendenti
        await db.query(`UPDATE material SET category_id = NULL, updated_by = $2 WHERE category_id = ANY($1) AND archived_at IS NULL`, [ids, userId]);
        await db.query(`UPDATE material_category SET archived_at = now(), archived_by = $2, updated_by = $2 WHERE id = ANY($1) AND archived_at IS NULL`, [ids, userId]);
        return { result: { ok: true, archivedNodes: ids.length, orphanedMaterials: subtreeMaterials } };
      });
      if ('notFound' in res) return reply.code(404).send({ error: 'not_found', message: 'Categoria non trovata', statusCode: 404 });
      if ('system' in res) return reply.code(409).send({ error: 'conflict', message: 'Categoria di sistema: non eliminabile. Puoi duplicarla.', statusCode: 409 });
      if ('blocked' in res && res.blocked) return reply.code(409).send({ error: 'conflict', message: `Impossibile eliminare: la categoria contiene ${res.blocked.join(' e ')}. Scegli «Riassegna» o «Elimina tutto il ramo».`, statusCode: 409 });
      if ('result' in res) return reply.send(res.result);
      return reply.code(500).send({ error: 'internal_error', message: 'Esito eliminazione non determinato', statusCode: 500 });
    });

  // Duplica (regole C/D): copia senza is_system, stesso genitore, suffisso «(copia)» se serve.
  app.post<{ Params: { id: string } }>('/material-categories/:id/duplicate',
    { preHandler: [app.authenticate, requirePermission('material:update')] },
    async (request, reply) => {
      const ctx = request.ctx;
      const dto = await withRls(ctx, async (db) => {
        const src = await db.query(`SELECT ${CAT_COLS} FROM material_category WHERE id = $1`, [request.params.id]);
        if (!src.rows.length) return null;
        const s = src.rows[0] as Record<string, unknown>;
        const parentId = (s.parent_id as string) ?? null;
        // nome libero per livello (archived-aware)
        const taken = new Set((await db.query(
          `SELECT name FROM material_category WHERE tenant_id = $1 AND parent_id IS NOT DISTINCT FROM $2 AND archived_at IS NULL`,
          [ctx.tenantId, parentId])).rows.map((r) => r.name as string));
        let name = s.name as string;
        if (taken.has(name)) { let n = `${name} (copia)`; let i = 2; while (taken.has(n)) n = `${name} (copia ${i++})`; name = n; }
        const seq = Number((await db.query(
          `SELECT COALESCE(max(sequence), -1) + 1 AS seq FROM material_category WHERE tenant_id = $1 AND parent_id IS NOT DISTINCT FROM $2`,
          [ctx.tenantId, parentId])).rows[0].seq);
        const r = await db.query(
          `INSERT INTO material_category (tenant_id, parent_id, name, description, color, icon, image_url, active, sequence, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9,$9) RETURNING ${CAT_COLS}`,
          [ctx.tenantId, parentId, name, s.description ?? null, s.color ?? null, s.icon ?? null, s.image_url ?? null, seq, ctx.userId]);
        return categoryDto(r.rows[0]);
      });
      if (!dto) return reply.code(404).send({ error: 'not_found', message: 'Categoria non trovata', statusCode: 404 });
      return reply.code(201).send(dto);
    });

  // Ripristina (annulla soft-delete).
  app.post<{ Params: { id: string } }>('/material-categories/:id/restore',
    { preHandler: [app.authenticate, requirePermission('material:update')] },
    async (request, reply) => {
      await withRls(request.ctx, (db) => db.query(
        `UPDATE material_category SET archived_at = NULL, archived_by = NULL, updated_by = $2 WHERE id = $1`,
        [request.params.id, request.ctx.userId]));
      return reply.code(204).send();
    });

  // ── material_supplier ─────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/materials/:id/suppliers',
    { preHandler: [app.authenticate, requirePermission('material:read')] },
    async (request) => withRls(request.ctx, async (db) => {
      const rows = await db.query(
        `SELECT ms.id, ms.material_id, ms.supplier_id, ms.supplier_sku, ms.purchase_price,
                ms.currency, ms.lead_time_days, ms.is_preferred, c.display_name AS supplier_name
         FROM material_supplier ms
         LEFT JOIN company c ON c.id = ms.supplier_id
         WHERE ms.material_id = $1
         ORDER BY ms.is_preferred DESC, c.display_name`,
        [request.params.id]);
      return { items: rows.rows.map(supplierDto) };
    }));

  app.post<{ Params: { id: string } }>('/materials/:id/suppliers',
    { preHandler: [app.authenticate, requirePermission('material:update')] },
    async (request, reply) => {
      const input = createMaterialSupplierSchema.parse({ ...(request.body as Record<string, unknown>), materialId: request.params.id });
      const ctx = request.ctx;
      const dto = await withRls(ctx, async (db) => {
        const ins = await db.query(
          `INSERT INTO material_supplier (tenant_id, material_id, supplier_id, supplier_sku, purchase_price,
             currency, lead_time_days, is_preferred, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
           RETURNING id`,
          [ctx.tenantId, request.params.id, input.supplierId, input.supplierSku ?? null, input.purchasePrice ?? null,
           input.currency ?? null, input.leadTimeDays ?? null, input.isPreferred ?? false, ctx.userId]);
        const r = await db.query(
          `SELECT ms.id, ms.material_id, ms.supplier_id, ms.supplier_sku, ms.purchase_price,
                  ms.currency, ms.lead_time_days, ms.is_preferred, c.display_name AS supplier_name
           FROM material_supplier ms
           LEFT JOIN company c ON c.id = ms.supplier_id
           WHERE ms.id = $1`,
          [ins.rows[0].id as string]);
        return supplierDto(r.rows[0]);
      });
      return reply.code(201).send(dto);
    });

  app.patch<{ Params: { sid: string } }>('/material-suppliers/:sid',
    { preHandler: [app.authenticate, requirePermission('material:update')] },
    async (request) => withRls(request.ctx, async (db) => {
      const input = updateMaterialSupplierSchema.parse(request.body);
      const sets: string[] = []; const vals: unknown[] = [request.params.sid];
      const add = (col: string, val: unknown) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };
      if (input.supplierId !== undefined) add('supplier_id', input.supplierId);
      if (input.supplierSku !== undefined) add('supplier_sku', input.supplierSku);
      if (input.purchasePrice !== undefined) add('purchase_price', input.purchasePrice);
      if (input.currency !== undefined) add('currency', input.currency);
      if (input.leadTimeDays !== undefined) add('lead_time_days', input.leadTimeDays);
      if (input.isPreferred !== undefined) add('is_preferred', input.isPreferred);
      vals.push(request.ctx.userId); sets.push(`updated_by = $${vals.length}`);
      await db.query(`UPDATE material_supplier SET ${sets.join(', ')} WHERE id = $1`, vals);
      const r = await db.query(
        `SELECT ms.id, ms.material_id, ms.supplier_id, ms.supplier_sku, ms.purchase_price,
                ms.currency, ms.lead_time_days, ms.is_preferred, c.display_name AS supplier_name
         FROM material_supplier ms
         LEFT JOIN company c ON c.id = ms.supplier_id
         WHERE ms.id = $1`,
        [request.params.sid]);
      return supplierDto(r.rows[0]);
    }));

  app.delete<{ Params: { sid: string } }>('/material-suppliers/:sid',
    { preHandler: [app.authenticate, requirePermission('material:update')] },
    async (request, reply) => {
      await withRls(request.ctx, (db) => db.query(`DELETE FROM material_supplier WHERE id = $1`, [request.params.sid]));
      return reply.code(204).send();
    });

  // ── material_image (MinIO; bucket non pubblico, URL presigned) ─────────
  async function withUrl(r: Record<string, unknown>): Promise<MaterialImageDto> {
    const dto = imageDto(r);
    dto.url = await presignObject(IMG_BUCKET, dto.objectKey).catch(() => null);
    return dto;
  }

  app.get<{ Params: { id: string } }>('/materials/:id/images',
    { preHandler: [app.authenticate, requirePermission('material:read')] },
    async (request) => withRls(request.ctx, async (db) => {
      const rows = await db.query(
        `SELECT id, material_id, object_key, is_primary, sequence FROM material_image
         WHERE material_id = $1 ORDER BY is_primary DESC, sequence`,
        [request.params.id]);
      return { items: await Promise.all(rows.rows.map(withUrl)) };
    }));

  // upload multipart: salva su MinIO + riga material_image. Prima immagine → primaria.
  app.post<{ Params: { id: string } }>('/materials/:id/images',
    { preHandler: [app.authenticate, requirePermission('material:update')] },
    async (request, reply) => {
      const file = await request.file();
      if (!file) return reply.code(400).send({ error: 'bad_request', message: 'File immagine mancante', statusCode: 400 });
      const ctx = request.ctx;
      const buf = await file.toBuffer();
      const ext = EXT[file.mimetype] ?? 'bin';
      const key = `${ctx.tenantId}/${request.params.id}/${randomUUID()}.${ext}`;
      await putObject(IMG_BUCKET, key, buf, file.mimetype || 'application/octet-stream');
      const dto = await withRls(ctx, async (db) => {
        // se è la prima immagine dell'articolo, diventa primaria
        const cnt = await db.query(`SELECT count(*)::int AS n, COALESCE(max(sequence),-1) AS maxseq FROM material_image WHERE material_id = $1`, [request.params.id]);
        const isFirst = (cnt.rows[0].n as number) === 0;
        const seq = (cnt.rows[0].maxseq as number) + 1;
        const ins = await db.query(
          `INSERT INTO material_image (tenant_id, material_id, object_key, is_primary, sequence, created_by)
           VALUES ($1,$2,$3,$4,$5,$6)
           RETURNING id, material_id, object_key, is_primary, sequence`,
          [ctx.tenantId, request.params.id, key, isFirst, seq, ctx.userId]);
        return withUrl(ins.rows[0]);
      });
      return reply.code(201).send(dto);
    });

  // imposta primaria (azzera l'eventuale precedente, transazione)
  app.post<{ Params: { iid: string } }>('/material-images/:iid/set-primary',
    { preHandler: [app.authenticate, requirePermission('material:update')] },
    async (request, reply) => {
      const out = await withRls(request.ctx, async (db) => {
        const cur = await db.query(`SELECT material_id FROM material_image WHERE id = $1`, [request.params.iid]);
        if (!cur.rows.length) return null;
        const materialId = cur.rows[0].material_id as string;
        await db.query(`UPDATE material_image SET is_primary = false WHERE material_id = $1 AND id <> $2`, [materialId, request.params.iid]);
        const r = await db.query(
          `UPDATE material_image SET is_primary = true WHERE id = $1
           RETURNING id, material_id, object_key, is_primary, sequence`, [request.params.iid]);
        return withUrl(r.rows[0]);
      });
      if (!out) return reply.code(404).send({ error: 'not_found', message: 'Immagine non trovata', statusCode: 404 });
      return out;
    });

  // riordino (sequence)
  app.patch<{ Params: { id: string } }>('/materials/:id/images/reorder',
    { preHandler: [app.authenticate, requirePermission('material:update')] },
    async (request) => {
      const input = reorderImagesSchema.parse(request.body);
      return withRls(request.ctx, async (db) => {
        for (const o of input.order) {
          await db.query(`UPDATE material_image SET sequence = $2 WHERE id = $1 AND material_id = $3`,
            [o.id, o.sequence, request.params.id]);
        }
        const rows = await db.query(
          `SELECT id, material_id, object_key, is_primary, sequence FROM material_image
           WHERE material_id = $1 ORDER BY is_primary DESC, sequence`, [request.params.id]);
        return { items: await Promise.all(rows.rows.map(withUrl)) };
      });
    });

  app.delete<{ Params: { iid: string } }>('/material-images/:iid',
    { preHandler: [app.authenticate, requirePermission('material:update')] },
    async (request, reply) => {
      const key = await withRls(request.ctx, async (db) => {
        const r = await db.query(`DELETE FROM material_image WHERE id = $1 RETURNING object_key, is_primary, material_id`, [request.params.iid]);
        if (!r.rows.length) return null;
        // se era la primaria, promuovi la prima rimasta
        if (r.rows[0].is_primary) {
          await db.query(
            `UPDATE material_image SET is_primary = true WHERE id = (
               SELECT id FROM material_image WHERE material_id = $1 ORDER BY sequence LIMIT 1)`,
            [r.rows[0].material_id as string]);
        }
        return r.rows[0].object_key as string;
      });
      if (key) await removeObject(IMG_BUCKET, key);
      return reply.code(204).send();
    });
}
