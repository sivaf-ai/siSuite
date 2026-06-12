/**
 * gotrueAdmin.ts — provisioning idempotente dell'utente Owner su GoTrue.
 * Usato SOLO dal bootstrap. Non minta token di servizio: usa signup (con
 * autoconfirm in dev) e, se l'utente esiste già, un login password per
 * recuperare il `sub` (= app_user.auth_user_id). Nessuna credenziale finisce
 * mai in app_user: leghiamo solo l'id esterno.
 */
function decodeSub(jwt: string): string | null {
  const parts = jwt.split('.');
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'));
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

function extractUserId(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null;
  const obj = json as Record<string, unknown>;
  if (obj.user && typeof obj.user === 'object') {
    const id = (obj.user as Record<string, unknown>).id;
    if (typeof id === 'string') return id;
  }
  if (typeof obj.id === 'string') return obj.id; // shape admin
  if (typeof obj.access_token === 'string') return decodeSub(obj.access_token);
  return null;
}

async function waitForGoTrue(baseUrl: string, attempts = 40, delayMs = 2000): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) return;
    } catch {
      /* non ancora pronto */
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`GoTrue non raggiungibile su ${baseUrl} dopo ${attempts} tentativi`);
}

export async function ensureAuthUser(opts: {
  baseUrl: string;
  email: string;
  password: string;
}): Promise<string> {
  const { baseUrl, email, password } = opts;
  await waitForGoTrue(baseUrl);

  // 1) prova a registrare (autoconfirm attivo in dev)
  const signup = await fetch(`${baseUrl}/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (signup.ok) {
    const id = extractUserId(await signup.json().catch(() => null));
    if (id) return id;
  }

  // 2) l'utente esiste già (o signup non ha restituito l'id): login per il sub
  const token = await fetch(`${baseUrl}/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!token.ok) {
    const body = await token.text().catch(() => '');
    throw new Error(`Login Owner su GoTrue fallito (${token.status}): ${body}`);
  }
  const id = extractUserId(await token.json().catch(() => null));
  if (!id) throw new Error('Impossibile ricavare il sub dell\'Owner da GoTrue');
  return id;
}
