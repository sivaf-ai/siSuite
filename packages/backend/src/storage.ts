/**
 * storage.ts — object storage S3 (MinIO) per i media delle capture vocali.
 * "Cattura-prima": l'audio grezzo si conserva sempre (provenienza), anche se
 * l'elaborazione (STT/estrazione) avviene dopo. Lazy + tollerante: se MinIO non
 * è raggiungibile, la voce fallisce con un errore chiaro ma il resto regge.
 */
import { Client } from 'minio';
import { config } from './config.js';

let client: Client | null = null;
let bucketReady = false;

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

async function ensureBucket(): Promise<void> {
  if (bucketReady) return;
  const c = getClient();
  const exists = await c.bucketExists(config.storage.bucket).catch(() => false);
  if (!exists) await c.makeBucket(config.storage.bucket);
  bucketReady = true;
}

/** Carica un media e restituisce il suo riferimento (object key). */
export async function putMedia(key: string, body: Buffer, contentType: string): Promise<string> {
  await ensureBucket();
  await getClient().putObject(config.storage.bucket, key, body, body.length, { 'Content-Type': contentType });
  return `s3://${config.storage.bucket}/${key}`;
}

/** URL temporaneo per riascoltare il media (riproduzione, opzionale). */
export async function presignMedia(key: string, expirySeconds = 3600): Promise<string> {
  return getClient().presignedGetObject(config.storage.bucket, key, expirySeconds);
}
