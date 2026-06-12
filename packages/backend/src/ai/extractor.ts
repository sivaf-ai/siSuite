/**
 * extractor.ts — passo AI: testo grezzo → operazioni PROPOSTE.
 * Usa l'SDK Anthropic con TOOL USE FORZATO (stabile su ogni versione SDK): il
 * modello DEVE emettere una chiamata allo strumento `emit_operations`, risolvendo
 * la frase sugli ID forniti nel contesto. Non scrive nel DB: propone soltanto.
 * "L'LLM propone, il deterministico dispone": qui c'è solo la proposta.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { anthropic } from './client.js';
import { config } from '../config.js';
import { extractionSchema, type RawOperation } from './extractionSchema.js';
import type { ExtractionContext } from './context.js';

const nullable = (t: string) => ({ type: [t, 'null'] });

const EMIT_TOOL: Anthropic.Tool = {
  name: 'emit_operations',
  description: 'Registra le operazioni strutturate estratte dalla frase del tecnico.',
  input_schema: {
    type: 'object',
    properties: {
      operations: {
        type: 'array',
        description: 'Le operazioni risolte sugli ID del contesto.',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['log_time', 'log_material', 'set_activity_status', 'check_checklist_item', 'clarify'] },
            activityId: nullable('string'),
            minutes: nullable('number'),
            typology: nullable('string'),
            materialId: nullable('string'),
            quantity: nullable('number'),
            statusCanonical: nullable('string'),
            checklistText: nullable('string'),
            done: nullable('boolean'),
            occurredOn: nullable('string'),
            confidence: { type: 'number' },
            rationale: { type: 'string' },
          },
          required: ['type', 'activityId', 'minutes', 'typology', 'materialId', 'quantity',
            'statusCanonical', 'checklistText', 'done', 'occurredOn', 'confidence', 'rationale'],
        },
      },
    },
    required: ['operations'],
  } as Anthropic.Tool['input_schema'],
};

function systemPrompt(c: ExtractionContext): string {
  return [
    'Sei il motore di estrazione di siSuite, gestionale per software house.',
    'Trasformi ciò che un tecnico racconta in linguaggio naturale in OPERAZIONI strutturate,',
    'risolte SOLO sugli ID forniti nel contesto. Chiami sempre lo strumento emit_operations.',
    '',
    'REGOLE TASSATIVE:',
    '- Usa ESCLUSIVAMENTE gli activityId e materialId presenti nel contesto. Non inventare MAI un id.',
    "- Se ambiguo o non mappabile, emetti type='clarify' con la domanda in `rationale` (id a null).",
    '- `confidence` 0..1: alta solo se la risoluzione è certa. Su dati fatturabili, nel dubbio abbassa o usa clarify.',
    '- log_time: activityId + minutes (intero>0) + typology (tra le tipologie note).',
    '- log_material: activityId + materialId + quantity (>0).',
    '- set_activity_status: activityId + statusCanonical tra gli stati noti.',
    '- check_checklist_item: activityId + checklistText (anche parziale) + done.',
    '- occurredOn: ISO YYYY-MM-DD; null = oggi (' + c.today + ').',
    '- Più operazioni per frase sono ammesse. Solo operazioni davvero supportate dal testo.',
    '',
    'CONTESTO (dati REALI):',
    JSON.stringify({
      today: c.today, engagement: c.engagement, activities: c.activities,
      materials: c.materials, typologies: c.typologies, activityStatuses: c.activityStatuses,
    }),
  ].join('\n');
}

export async function extract(rawText: string, context: ExtractionContext): Promise<RawOperation[]> {
  const client = anthropic();
  const res = await client.messages.create({
    model: config.ai.extractionModel,
    max_tokens: 4000,
    tools: [EMIT_TOOL],
    tool_choice: { type: 'tool', name: 'emit_operations' },
    system: systemPrompt(context),
    messages: [{ role: 'user', content: rawText }],
  });
  const block = res.content.find((b) => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') return [];
  const parsed = extractionSchema.safeParse(block.input);
  return parsed.success ? parsed.data.operations : [];
}
