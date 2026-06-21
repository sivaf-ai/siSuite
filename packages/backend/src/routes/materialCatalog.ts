/** materialCatalog.ts — Catalogo articoli: categorie gerarchiche (Blocco B.2),
 *  fornitori per articolo (B.4), immagini multiple su MinIO (B.3). Tutte le tabelle
 *  hanno tenant_id + RLS già a DB. */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createMaterialCategorySchema, updateMaterialCategorySchema,
  createMaterialSupplierSchema, updateMaterialSupplierSchema,
  type MaterialCategoryDto, type MaterialSupplierDto, type MaterialImageDto,
} from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';

function categoryDto(r: Record<string, unknown>): MaterialCategoryDto {
  return {
    id: r.id as string,
    parentId: (r.parent_id as string) ?? null,
    name: r.name as string,
    color: (r.color as string) ?? null,
    active: (r.active as boolean) ?? false,
  };
}

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

const createMaterialImageSchema = z.object({
  objectKey: z.string().min(1),
  isPrimary: z.boolean().optional(),
  sequence: z.coerce.number().int().optional(),
});

export async function materialCatalogRoutes(app: FastifyInstance): Promise<void> {
  // ── material_category ─────────────────────────────────────────────────
  app.get('/material-categories', { preHandler: [app.authenticate, requirePermission('material:read')] },
    async (request) => withRls(request.ctx, async (db) => {
      const rows = await db.query(
        `SELECT id, parent_id, name, color, active FROM material_category
         WHERE archived_at IS NULL ORDER BY name`);
      return { items: rows.rows.map(categoryDto) };
    }));

  app.post('/material-categories', { preHandler: [app.authenticate, requirePermission('material:update')] },
    async (request, reply) => {
      const input = createMaterialCategorySchema.parse(request.body);
      const ctx = request.ctx;
      const dto = await withRls(ctx, async (db) => {
        const r = await db.query(
          `INSERT INTO material_category (tenant_id, parent_id, name, color, active, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$6)
           RETURNING id, parent_id, name, color, active`,
          [ctx.tenantId, input.parentId ?? null, input.name, input.color ?? null, input.active ?? true, ctx.userId]);
        return categoryDto(r.rows[0]);
      });
      return reply.code(201).send(dto);
    });

  app.patch<{ Params: { id: string } }>('/material-categories/:id',
    { preHandler: [app.authenticate, requirePermission('material:update')] },
    async (request) => withRls(request.ctx, async (db) => {
      const input = updateMaterialCategorySchema.parse(request.body);
      const sets: string[] = []; const vals: unknown[] = [request.params.id];
      const add = (col: string, val: unknown) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };
      if (input.name !== undefined) add('name', input.name);
      if (input.parentId !== undefined) add('parent_id', input.parentId);
      if (input.color !== undefined) add('color', input.color);
      if (input.active !== undefined) add('active', input.active);
      vals.push(request.ctx.userId); sets.push(`updated_by = $${vals.length}`);
      const r = await db.query(
        `UPDATE material_category SET ${sets.join(', ')} WHERE id = $1
         RETURNING id, parent_id, name, color, active`, vals);
      return categoryDto(r.rows[0]);
    }));

  app.delete<{ Params: { id: string } }>('/material-categories/:id',
    { preHandler: [app.authenticate, requirePermission('material:update')] },
    async (request, reply) => {
      await withRls(request.ctx, (db) =>
        db.query(`UPDATE material_category SET archived_at = now(), updated_by = $2 WHERE id = $1`,
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

  // ── material_image ────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/materials/:id/images',
    { preHandler: [app.authenticate, requirePermission('material:read')] },
    async (request) => withRls(request.ctx, async (db) => {
      const rows = await db.query(
        `SELECT id, material_id, object_key, is_primary, sequence FROM material_image
         WHERE material_id = $1 ORDER BY sequence`,
        [request.params.id]);
      return { items: rows.rows.map(imageDto) };
    }));

  app.post<{ Params: { id: string } }>('/materials/:id/images',
    { preHandler: [app.authenticate, requirePermission('material:update')] },
    async (request, reply) => {
      const input = createMaterialImageSchema.parse(request.body);
      const ctx = request.ctx;
      const dto = await withRls(ctx, async (db) => {
        const ins = await db.query(
          `INSERT INTO material_image (tenant_id, material_id, object_key, is_primary, sequence, created_by)
           VALUES ($1,$2,$3,$4,$5,$6)
           RETURNING id, material_id, object_key, is_primary, sequence`,
          [ctx.tenantId, request.params.id, input.objectKey, input.isPrimary ?? false, input.sequence ?? 0, ctx.userId]);
        if (input.isPrimary) {
          await db.query(
            `UPDATE material_image SET is_primary = false WHERE material_id = $1 AND id <> $2`,
            [request.params.id, ins.rows[0].id as string]);
          await db.query(
            `UPDATE material SET primary_image_url = $2 WHERE id = $1`,
            [request.params.id, input.objectKey]);
        }
        return imageDto(ins.rows[0]);
      });
      return reply.code(201).send(dto);
    });

  app.delete<{ Params: { iid: string } }>('/material-images/:iid',
    { preHandler: [app.authenticate, requirePermission('material:update')] },
    async (request, reply) => {
      await withRls(request.ctx, (db) => db.query(`DELETE FROM material_image WHERE id = $1`, [request.params.iid]));
      return reply.code(204).send();
    });
}
