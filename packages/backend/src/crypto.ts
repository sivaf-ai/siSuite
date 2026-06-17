/**
 * crypto.ts — cifratura APPLICATIVA dei segreti (es. password apparato seriale,
 * brief Decisione 6.5). AES-256-GCM con chiave derivata da un segreto di piattaforma.
 * Il valore in chiaro non tocca mai il DB: si salva solo il blob cifrato in
 * stock_serial_unit.secrets; lo si decifra solo dietro permesso serial:secret_read.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

function key(): Buffer {
  // chiave dedicata se presente, altrimenti deriva dal segreto JWT (dev). 32 byte.
  const secret = process.env.SECRETS_ENC_KEY ?? process.env.AUTH_JWT_SECRET ?? 'dev-secrets-key-change-me';
  return scryptSync(secret, 'sisuite.serial.secrets', 32);
}

/** Cifra una stringa → token "v1:iv:tag:ciphertext" (base64). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  const tag = c.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

/** Decifra un token prodotto da encryptSecret. Lancia se manomesso. */
export function decryptSecret(token: string): string {
  const [v, ivB, tagB, dataB] = token.split(':');
  if (v !== 'v1' || !ivB || !tagB || !dataB) throw new Error('token segreto non valido');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB, 'base64'));
  d.setAuthTag(Buffer.from(tagB, 'base64'));
  return Buffer.concat([d.update(Buffer.from(dataB, 'base64')), d.final()]).toString('utf8');
}
