/**
 * captures.ts — tipi e schemi della pipeline AI (Fase 2).
 * Cattura immutabile → estrazione PROPOSTA → validazione → conferma → commit.
 * L'LLM propone operazioni tipizzate risolte sugli ID forniti; un livello
 * deterministico valida e applica. L'AI non scrive mai diretta nel DB.
 */
import { z } from 'zod';

export type CaptureChannel = 'text' | 'voice' | 'photo';
export type CaptureStatus = 'pending' | 'proposed' | 'applied' | 'rejected';

/** Tipi di operazione che l'estrazione può proporre (insieme chiuso, noto al validatore). */
export type OperationType =
  | 'log_time'
  | 'log_material'
  | 'set_activity_status'
  | 'check_checklist_item'
  | 'clarify';

/** Creazione cattura (Fase 2: solo testo). */
export const createCaptureSchema = z.object({
  rawText: z.string().min(1, 'Il testo è obbligatorio').max(4000),
  engagementId: z.string().uuid().optional(),
  channel: z.enum(['text', 'voice', 'photo']).default('text'),
});
export type CreateCaptureInput = z.infer<typeof createCaptureSchema>;

/** Selezione delle operazioni da applicare (per indice). Vuoto = tutte le auto-applicabili. */
export const applyCaptureSchema = z.object({
  operationIndexes: z.array(z.number().int().min(0)).optional(),
});

/**
 * Un'operazione proposta, ARRICCHITA dal validatore deterministico:
 * etichette risolte (per la UI), esito di validazione e auto-applicabilità.
 */
export interface ProposedOperation {
  type: OperationType;
  // riferimenti risolti
  activityId: string | null;
  activityTitle: string | null;
  materialId: string | null;
  materialName: string | null;
  // payload (secondo il tipo)
  minutes: number | null;
  typology: string | null;
  quantity: number | null;
  unit: string | null;
  statusCanonical: string | null;
  checklistText: string | null;
  done: boolean | null;
  occurredOn: string | null;
  // metadati AI + validazione
  confidence: number;
  rationale: string;
  valid: boolean;
  reason: string | null;
  autoApplicable: boolean;
  /** esito dopo l'applicazione (solo dopo apply). */
  applied?: boolean;
}

export interface CaptureDto {
  id: string;
  status: CaptureStatus;
  channel: CaptureChannel;
  rawText: string;
  engagementId: string | null;
  createdAt: string;
  processedAt: string | null;
  operations: ProposedOperation[];
  /** messaggio diagnostico (es. AI non configurata). */
  note?: string;
}

/** Etichetta IT dei tipi operazione (per la UI). */
export const OPERATION_LABEL: Record<OperationType, string> = {
  log_time: 'Registra ore',
  log_material: 'Registra materiale',
  set_activity_status: 'Cambia stato attività',
  check_checklist_item: 'Spunta passo checklist',
  clarify: 'Richiesta di chiarimento',
};
