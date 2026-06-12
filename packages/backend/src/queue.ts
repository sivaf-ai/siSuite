/**
 * queue.ts — coda asincrona (pg-boss su Postgres, niente Redis: "Postgres ovunque").
 * Le capture VOCALI seguono il "cattura-prima/elabora-dopo": l'endpoint salva
 * audio+trascrizione e ritorna subito; un WORKER estrae in background. Così il
 * tecnico sul campo non aspetta la rete/l'LLM.
 *
 * pg-boss usa la connessione ADMIN (crea il proprio schema `pgboss`); il lavoro
 * sui dati gira poi col ruolo applicativo + RLS dentro runExtraction.
 * Tollerante: se la coda non parte, la cattura resta salvata (status pending).
 */
import PgBoss from 'pg-boss';
import type { UserContext } from '@sisuite/shared';
import { config } from './config.js';
import { runExtraction } from './ai/process.js';

const QUEUE = 'extract-capture';
interface ExtractJob { ctx: UserContext; captureId: string; rawText: string | null; engagementId?: string }

let boss: PgBoss | null = null;

export async function startQueue(): Promise<void> {
  if (!config.adminDatabaseUrl) {
    console.warn('[queue] DATABASE_ADMIN_URL mancante: coda disattivata (le capture vocali restano pending).');
    return;
  }
  try {
    boss = new PgBoss({ connectionString: config.adminDatabaseUrl });
    boss.on('error', (e) => console.error('[queue] errore:', e.message));
    await boss.start();
    await boss.createQueue(QUEUE);
    await boss.work<ExtractJob>(QUEUE, async (jobs) => {
      for (const job of jobs) {
        const { ctx, captureId, rawText, engagementId } = job.data;
        try {
          await runExtraction(ctx, captureId, rawText, engagementId);
          console.log('[queue] capture elaborata', captureId);
        } catch (e) {
          console.error('[queue] estrazione fallita', captureId, (e as Error).message);
          throw e; // pg-boss ritenta
        }
      }
    });
    console.log('[queue] pg-boss avviata; worker su', QUEUE);
  } catch (e) {
    console.error('[queue] avvio fallito, coda disattivata:', (e as Error).message);
    boss = null;
  }
}

/** Accoda un'estrazione. Ritorna false se la coda non è attiva (fallback gestito dal chiamante). */
export async function enqueueExtraction(payload: ExtractJob): Promise<boolean> {
  if (!boss) return false;
  await boss.send(QUEUE, payload);
  return true;
}
