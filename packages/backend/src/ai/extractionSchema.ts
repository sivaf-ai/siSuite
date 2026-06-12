/**
 * extractionSchema.ts — il CONTRATTO di output strutturato dell'estrazione.
 * Lo passiamo al modello come structured output: il modello NON genera testo
 * libero, ma risolve la frase in operazioni tipizzate riferite agli ID forniti.
 * Tipi piatti e nullable (niente vincoli numerici/string): compatibili con i
 * structured outputs dell'API.
 */
import { z } from 'zod';

export const rawOperationSchema = z.object({
  type: z.enum(['log_time', 'log_material', 'set_activity_status', 'check_checklist_item', 'clarify']),
  /** id attività risolto dal contesto, o null se non determinabile. */
  activityId: z.string().nullable(),
  /** log_time */
  minutes: z.number().nullable(),
  typology: z.string().nullable(),
  /** log_material */
  materialId: z.string().nullable(),
  quantity: z.number().nullable(),
  /** set_activity_status: codice canonico (es. 'in_progress', 'done'). */
  statusCanonical: z.string().nullable(),
  /** check_checklist_item */
  checklistText: z.string().nullable(),
  done: z.boolean().nullable(),
  /** data evento ISO (YYYY-MM-DD); null = oggi. */
  occurredOn: z.string().nullable(),
  /** confidenza 0..1 e breve motivazione. */
  confidence: z.number(),
  rationale: z.string(),
});
export type RawOperation = z.infer<typeof rawOperationSchema>;

export const extractionSchema = z.object({
  operations: z.array(rawOperationSchema),
});
export type Extraction = z.infer<typeof extractionSchema>;
