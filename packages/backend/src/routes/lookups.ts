/** lookups.ts — stati/etichette/priorità configurabili, per i select del frontend. */
import type { FastifyInstance } from 'fastify';
import type { LookupDto } from '@sisuite/shared';
import { withRls } from '../context/rls.js';

function mapLookup(r: Record<string, unknown>): LookupDto {
  return {
    id: r.id as string,
    category: r.category as string,
    canonical: r.canonical as string,
    code: r.code as string,
    label: (r.label as Record<string, string>) ?? {},
    abbreviation: (r.abbreviation as string) ?? null,
    colorToken: (r.color_token as string) ?? null,
    sequence: (r.sequence as number) ?? 0,
    isDefault: (r.is_default as boolean) ?? false,
  };
}

export async function lookupRoutes(app: FastifyInstance): Promise<void> {
  app.get('/lookups', { preHandler: [app.authenticate] }, async (request) => {
    const rows = await withRls(request.ctx, (db) =>
      db.query(
        `SELECT id, category, canonical, code, label, abbreviation, color_token, sequence, is_default
         FROM lookup_value WHERE active ORDER BY category, sequence`,
      ).then((r) => r.rows),
    );
    return { items: rows.map(mapLookup) };
  });

  app.get<{ Params: { category: string } }>(
    '/lookups/:category',
    { preHandler: [app.authenticate] },
    async (request) => {
      const rows = await withRls(request.ctx, (db) =>
        db.query(
          `SELECT id, category, canonical, code, label, abbreviation, color_token, sequence, is_default
           FROM lookup_value WHERE active AND category = $1 ORDER BY sequence`,
          [request.params.category],
        ).then((r) => r.rows),
      );
      return { items: rows.map(mapLookup) };
    },
  );
}
