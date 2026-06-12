/**
 * verifier.ts — verificatore JWT DUAL-MODE.
 *
 * Principio del brief: Auth = solo "chi sei". Il backend verifica il JWT
 * emesso da GoTrue e ne estrae il `sub` (= app_user.auth_user_id). L'authZ
 * (RBAC + RLS + entitlement) NON sta nel token: resta nostra.
 *
 * Due modalità, scelte da config:
 *   - ASIMMETRICA (target): AUTH_JWKS_URL valorizzato → verifica con chiave
 *     pubblica (JWKS), validabile anche OFFLINE sul dispositivo (Fase 2+).
 *   - SIMMETRICA (dev): AUTH_JWT_SECRET valorizzato → HS256 con segreto
 *     condiviso. Default per il bring-up locale.
 * Lo switch è solo configurazione: il resto del sistema non cambia.
 */
import { jwtVerify, createRemoteJWKSet, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { config } from '../config.js';

export interface VerifiedIdentity {
  /** subject del JWT = identità esterna verificata (app_user.auth_user_id). */
  authUserId: string;
  email: string | null;
  raw: JWTPayload;
}

type KeyResolver = Uint8Array | JWTVerifyGetKey;

let keyResolver: KeyResolver | null = null;
let mode: 'jwks' | 'hs256' | null = null;

function getKeyResolver(): KeyResolver {
  if (keyResolver) return keyResolver;
  if (config.jwt.jwksUrl) {
    mode = 'jwks';
    keyResolver = createRemoteJWKSet(new URL(config.jwt.jwksUrl));
  } else if (config.jwt.secret) {
    mode = 'hs256';
    keyResolver = new TextEncoder().encode(config.jwt.secret);
  } else {
    throw new Error('Auth mal configurata: serve AUTH_JWKS_URL (asimmetrica) o AUTH_JWT_SECRET (HS256).');
  }
  return keyResolver;
}

export function authMode(): string {
  getKeyResolver();
  return mode ?? 'unknown';
}

export async function verifyToken(token: string): Promise<VerifiedIdentity> {
  const key = getKeyResolver();
  const options: Parameters<typeof jwtVerify>[2] = {};
  if (config.jwt.audience) options.audience = config.jwt.audience;
  // l'issuer di GoTrue varia (host interno vs esterno): non lo imponiamo in dev.

  const { payload } = await jwtVerify(token, key as Parameters<typeof jwtVerify>[1], options);
  const sub = payload.sub;
  if (!sub) throw new Error('JWT senza subject (sub).');
  const email = typeof payload.email === 'string' ? payload.email : null;
  return { authUserId: sub, email, raw: payload };
}
