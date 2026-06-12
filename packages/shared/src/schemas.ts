/**
 * schemas.ts — schemi zod condivisi (validazione input API).
 * Il backend li usa per validare le richieste; il frontend per i form.
 */
import { z } from 'zod';

/** Creazione commessa (engagement). Il `code` lo assegna number_series lato server. */
export const createEngagementSchema = z.object({
  companyId: z.string().uuid('companyId deve essere un UUID valido'),
  type: z.enum(['build', 'maintenance']),
  title: z.string().min(1, 'Il titolo è obbligatorio').max(200),
  /** opzionale: se assente, il server usa lo stato canonico di default 'open'. */
  statusId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  managerId: z.string().uuid().optional(),
  startedOn: z.string().date().optional(),
  attributes: z.record(z.unknown()).optional(),
});
export type CreateEngagementInput = z.infer<typeof createEngagementSchema>;

/** Modifica commessa. */
export const updateEngagementSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  statusId: z.string().uuid().optional(),
  managerId: z.string().uuid().nullable().optional(),
  assetId: z.string().uuid().nullable().optional(),
  startedOn: z.string().date().nullable().optional(),
  endedOn: z.string().date().nullable().optional(),
  attributes: z.record(z.unknown()).optional(),
});
export type UpdateEngagementInput = z.infer<typeof updateEngagementSchema>;

/** Query lista generica: ricerca, ordinamento, paginazione. */
export const listQuerySchema = z.object({
  q: z.string().trim().optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
  limit: z.coerce.number().int().min(1).max(200).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

/** Filtro lista commesse. */
export const listEngagementsSchema = z.object({
  type: z.enum(['build', 'maintenance']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListEngagementsInput = z.infer<typeof listEngagementsSchema>;
