/**
 * config.ts — lettura e validazione delle variabili d'ambiente.
 * Fail-fast: se manca qualcosa di critico, il processo non parte.
 */
function req(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) throw new Error(`Variabile d'ambiente mancante: ${name}`);
  return v;
}
function opt(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export const config = {
  nodeEnv: opt('NODE_ENV', 'development'),
  port: Number(opt('BACKEND_PORT', '3010')),
  databaseUrl: req('DATABASE_URL'),
  cors: {
    origin: opt('CORS_ORIGIN', 'http://localhost:5173'),
  },
  /** URL interno di GoTrue (provisioning utenti dal pannello admin). */
  authInternalUrl: opt('AUTH_INTERNAL_URL', 'http://auth:9999'),
  jwt: {
    /** se valorizzato → verifica asimmetrica via JWKS (RS256/ES256), offline-capable. */
    jwksUrl: opt('AUTH_JWKS_URL'),
    /** altrimenti → verifica simmetrica HS256 con questo segreto (modalità dev). */
    secret: opt('AUTH_JWT_SECRET'),
    audience: opt('JWT_AUD', 'authenticated'),
    issuer: opt('JWT_ISSUER'),
  },
  /** URL admin (privilegiato): la coda pg-boss crea il proprio schema. */
  adminDatabaseUrl: opt('DATABASE_ADMIN_URL'),
  storage: {
    endpoint: opt('MINIO_ENDPOINT', 'minio'),
    port: Number(opt('MINIO_PORT', '9000')),
    useSSL: opt('MINIO_USE_SSL', 'false') === 'true',
    accessKey: opt('MINIO_ROOT_USER', 'sisuite'),
    secretKey: opt('MINIO_ROOT_PASSWORD', ''),
    bucket: opt('MINIO_BUCKET', 'captures'),
    /** bucket dedicato alle immagini articolo (Blocco J). */
    materialBucket: opt('MINIO_MATERIAL_BUCKET', 'material-images'),
    /** endpoint PUBBLICO (raggiungibile dal browser) per gli URL presigned di lettura.
     *  In dev = host mappato (localhost:9100). In prod = dominio pubblico dello storage. */
    publicEndpoint: opt('MINIO_PUBLIC_ENDPOINT', 'localhost'),
    publicPort: Number(opt('MINIO_PUBLIC_PORT', '9100')),
    publicUseSSL: opt('MINIO_PUBLIC_USE_SSL', 'false') === 'true',
  },
  ai: {
    /** chiave API Anthropic; se vuota la pipeline AI è disattivata (resta il percorso form). */
    apiKey: opt('ANTHROPIC_API_KEY'),
    /** modello per l'estrazione. Default capace; l'MVP suggerisce un modello piccolo per la frequenza. */
    extractionModel: opt('EXTRACTION_MODEL', 'claude-opus-4-8'),
    /** soglia di confidenza sopra la quale un'operazione è auto-applicabile (basso rischio). */
    autoApplyThreshold: Number(opt('AI_AUTOAPPLY_THRESHOLD', '0.85')),
  },
} as const;

export function aiEnabled(): boolean {
  return config.ai.apiKey.length > 0;
}

export type Config = typeof config;
