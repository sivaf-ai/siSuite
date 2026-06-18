# Avviare siSuite — guida rapida

L'app gira **tutta in Docker** (database, autenticazione, backend, frontend, storage).
Non devi installare Node, Postgres o altro: serve solo **Docker Desktop**.

## Prerequisito (una volta sola)
1. Installa **Docker Desktop**: https://www.docker.com/products/docker-desktop/
2. Avvialo almeno una volta (l'icona della balena in basso a destra deve essere attiva).

## Avviare l'app
1. Apri la cartella del progetto: `C:\Users\Ricardo\Sivaf\siSuite`
2. **Doppio click su `avvia-siSuite.bat`**

Lo script fa tutto da solo:
- controlla/avvia Docker Desktop,
- crea il file `.env` se manca,
- costruisce e avvia i container (db → auth → migrazioni → backend → frontend),
- aspetta che l'app risponda e **apre il browser** su http://localhost:5173.

> La **prima volta** ci mette qualche minuto (scarica e costruisce le immagini). Le volte successive parte in pochi secondi.

## Accesso
- **Amministratore piattaforma**: `owner@sisuite.local` / `Owner123!`
- **Demo Fibra** (dopo aver caricato i dati demo): `owner@fibra.demo` / `Demo123!`

## Caricare i dati demo "Fibra" (opzionale)
Per riempire l'app con dati di esempio (commesse, ordini di lavoro, magazzino, rapportini…):
- **Doppio click su `carica-demo-fibra.bat`** (con l'app già avviata),
- oppure entra come `owner@sisuite.local` → sezione **Demo / Super admin** → carica il pack `fiber`.

> Attenzione: ricaricare la demo **azzera e ricarica** i dati del tenant Fibra Demo.

## Fermare l'app
- **Doppio click su `ferma-siSuite.bat`** — ferma i container. **I dati restano salvati**: al prossimo avvio ritrovi tutto.

## Indirizzi utili
| Cosa | URL |
|---|---|
| App | http://localhost:5173 |
| API backend | http://localhost:3010 |
| Auth (GoTrue) | http://localhost:9999 |
| MinIO (storage) | http://localhost:9101 |

## Se qualcosa non va
- **"Docker non è in esecuzione"** → apri Docker Desktop e aspetta che sia pronto, poi riavvia `avvia-siSuite.bat`.
- **La pagina non si apre subito** → la prima build è lunga; riprova ad aprire http://localhost:5173 dopo 1-2 minuti.
- **Vuoi ripartire da zero (cancellare tutti i dati)** → da terminale nella cartella del progetto: `docker compose down -v` (⚠️ cancella i volumi/dati), poi `avvia-siSuite.bat`.
- **Log in tempo reale** → `docker compose logs -f backend` (o `frontend`).
