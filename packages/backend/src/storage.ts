/**
 * storage.ts — object storage S3 (MinIO) per i media delle capture vocali.
 * "Cattura-prima": l'audio grezzo si conserva sempre (provenienza), anche se
 * l'elaborazione (STT/estrazione) avviene dopo. Lazy + tollerante: se MinIO non
 * è raggiungibile, la voce fallisce con un errore chiaro ma il resto regge.
 */
import { Client } from 'minio';
import { config } from './config.js';

let client: Client | null = null;
let publicClient: Client | null = null;
const readyBuckets = new Set<string>();

function getClient(): Client {
  if (!client) {
    client = new Client({
      endPoint: config.storage.endpoint,
      port: config.storage.port,
      useSSL: config.storage.useSSL,
      accessKey: config.storage.accessKey,
      secretKey: config.storage.secretKey,
    });
  }
  return client;
}

/** Client con endpoint PUBBLICO: gli URL presigned devono essere raggiungibili
 *  dal browser (l'endpoint interno 'minio' non lo è). La firma è calcolata per
 *  l'host pubblico, quindi il GET dal browser combacia. */
function getPublicClient(): Client {
  if (!publicClient) {
    publicClient = new Client({
      endPoint: config.storage.publicEndpoint,
      port: config.storage.publicPort,
      useSSL: config.storage.publicUseSSL,
      accessKey: config.storage.accessKey,
      secretKey: config.storage.secretKey,
      region: 'us-east-1',   // esplicita → il presign NON fa lookup di rete (endpoint pubblico non raggiungibile dal backend)
    });
  }
  return publicClient;
}

/** Crea il bucket se manca (idempotente, cache per-bucket). */
export async function ensureBucketNamed(bucket: string): Promise<void> {
  if (readyBuckets.has(bucket)) return;
  const c = getClient();
  const exists = await c.bucketExists(bucket).catch(() => false);
  if (!exists) await c.makeBucket(bucket);
  readyBuckets.add(bucket);
}

/** Carica un oggetto in un bucket arbitrario; ritorna l'object key. */
export async function putObject(bucket: string, key: string, body: Buffer, contentType: string): Promise<string> {
  await ensureBucketNamed(bucket);
  await getClient().putObject(bucket, key, body, body.length, { 'Content-Type': contentType });
  return key;
}

/** URL di lettura temporaneo (presigned GET) con endpoint PUBBLICO (browser-safe). */
export async function presignObject(bucket: string, key: string, expirySeconds = 3600): Promise<string> {
  return getPublicClient().presignedGetObject(bucket, key, expirySeconds);
}

/** Rimuove un oggetto da un bucket (idempotente: ignora "not found"). */
export async function removeObject(bucket: string, key: string): Promise<void> {
  try { await getClient().removeObject(bucket, key); } catch { /* già assente */ }
}

/** Carica un media (capture) e restituisce il riferimento s3://. */
export async function putMedia(key: string, body: Buffer, contentType: string): Promise<string> {
  await putObject(config.storage.bucket, key, body, contentType);
  return `s3://${config.storage.bucket}/${key}`;
}

/** URL temporaneo per riascoltare il media (riproduzione, opzionale). */
export async function presignMedia(key: string, expirySeconds = 3600): Promise<string> {
  return presignObject(config.storage.bucket, key, expirySeconds);
}
