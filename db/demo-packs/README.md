# Demo Data Pack

Set di dati dimostrativi, **un tenant per pack** (es. `Fibra Demo`). I **dati di sistema**
(`tenant_id IS NULL`: ruoli, stati, etichette, piani, campi di sistema) **non si toccano mai**;
"cancella pack" = svuota solo quel tenant. Gli utenti del pack hanno **login reali** (GoTrue).

## File
- `fiber.json` — pack FIBRA (FTTH/FTTB): 4 utenti (Owner/Planner/2 tecnici), 3 clienti, 2 asset
  con campi tecnici fibra, 6 risorse, 6 materiali, 2 commesse (build + maintenance) con fasi,
  attività in catena FS, una attività **fissa**, dipendenze, ore, consumi e catture.
- `pools.json`, `software.json` — da generare (parte 2 §5/§7). Stesso formato.

Formato: **chiavi logiche** (no UUID); il loader genera gli UUID e risolve i riferimenti.
Le dipendenze: `"after": [{ "act": <chiave>, "lag_days": N }]` → `activity_dependency(type='FS', lag_minutes=N*1440)`.

## Comandi (eseguiti dal proprietario sul server — gating: solo CLI)
Gli script vivono in `packages/backend/src/demo/` e girano nel container backend.

```bash
# forma "pnpm" (richiede che l'immagine backend includa gli script: dopo aver
# modificato packages/backend/package.json fai una volta `docker compose build backend`)
docker compose run --rm --no-deps backend pnpm --filter @sisuite/backend demo:load fiber
docker compose run --rm --no-deps backend pnpm --filter @sisuite/backend demo:wipe fiber
docker compose run --rm --no-deps backend pnpm --filter @sisuite/backend demo:list

# forma diretta (funziona sempre, non dipende dagli script in package.json):
docker compose run --rm --no-deps backend sh -c "cd /app/packages/backend && npx tsx src/demo/load.ts fiber"
docker compose run --rm --no-deps backend sh -c "cd /app/packages/backend && npx tsx src/demo/wipe.ts fiber"
docker compose run --rm --no-deps backend sh -c "cd /app/packages/backend && npx tsx src/demo/list.ts"
```

- `load` è idempotente per tenant: se il pack è già caricato, rifiuta (esegui prima `wipe`).
- `wipe` cancella solo il tenant del pack, in ordine FK inverso, e rimuove le identità GoTrue
  (best-effort: richiede `AUTH_JWT_SECRET`; se assente le lascia, innocue, riusate al prossimo load).

## Login del pack fibra (demo)
| Ruolo | Email | Password |
|---|---|---|
| Owner | owner@fibra.demo | Demo123! |
| Planner | planner@fibra.demo | Demo123! |
| Tecnico (giuntista) | marco@fibra.demo | Demo123! |
| Tecnico (installatore) | davide@fibra.demo | Demo123! |
