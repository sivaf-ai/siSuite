# SPEC Code — Identità & Accessi + Auth GoTrue + Immagini materiali + Rifiniture

**Chat:** 01.06 · **Versione:** v1.0 · **Data:** 21 giugno 2026
**Segue:** `SPEC_Code_anagrafiche_magazzino_fiscale_v1_1_01_06.md` (blocchi A→F, migrazioni 041→046, già implementati).
**Schema di partenza:** `2026-06-21_schema_db_completo.md`. **Prossima migrazione libera: 047.**
**Catalogo permessi/ruoli:** `permissions.ts` (sorgente di verità).

> Questo documento è **VINCOLANTE**, si esegue **blocco per blocco** in ordine **G → H → I → J → K**, con i criteri di accettazione del **Blocco L**. Continua la numerazione a lettere della SPEC precedente (che finiva a F).

---

## Regole tassative (identiche alla SPEC precedente)
1. **CLEAN SLATE.** Nessun dato reale. Colonne/tabelle errate si **DROPpano**. Niente shim di compatibilità.
2. **Colonna vs jsonb.** Universale / vincolo-FK / filtrato-ordinato / pilota-logica → colonna. Coda lunga di verticale/paese → jsonb via `field_definition`.
3. **UI UNIFORME.** Tutte le entità standard usano la STESSA Lista (List Report) e la STESSA Scheda (Object Page). Toolbar a sole icone con tooltip; selezione = solo numero; niente icone-funzione sulle righe; "Nuova +" ultimo. Riferimenti: `41_web_aziende_standard.html`, `2026-06-15_STANDARD_UI_liste_e_maschere_v2.md`. Navigazione: `02_navigation_menu.md`.
4. **ID visibili da `number_series`.** UUID mai in UI.
5. **RLS su OGNI tabella nuova:** ENABLE + FORCE + policy tenant identica alle esistenti (`rls_policies.sql`) + GRANT a `sisuite_app` + owner `sisuite_admin`.
6. **NESSUNA FATTURAZIONE.**

## Modalità di esecuzione (autonoma, continua)
- Esegui **tutti i blocchi G→K di seguito, senza fermarti**. Il test è alla fine, sul lavoro totale.
- Migrazioni Flyway da **047**, una per blocco **solo dove serve** (gran parte di questo lavoro è **backend + frontend**, non schema).
- Per ogni blocco scrivi `DONE_<blocco>.md` come traccia, poi prosegui. Se ambiguo: scegli l'opzione più coerente con la SPEC, **annota l'assunzione** e prosegui; fermati solo se davvero impossibile.
- **Prima di toccare l'autenticazione (Blocco I): ispeziona il meccanismo di login attuale** (gli smoke usano `owner@sisuite.local`) e **documentalo** nel DONE. Integra GoTrue **senza rompere** il login di sviluppo esistente.
- Coordinamento: questa chat possiede le migrazioni **047→048** e i moduli Amministrazione (Utenti/Ruoli) + Immagini materiali. Registra nel JOURNAL.

---

## CONTESTO — perché questo giro
Il modello dati di utenti/ruoli/permessi **esiste già** (`app_user`, `role`, `role_permission`, `user_role`, con `data_scope` e il giunto `app_user.auth_user_id` per GoTrue). **Manca il modulo che lo gestisce** (nessuna schermata per creare utenti, assegnare ruoli, definire permessi) e **manca il login reale** (GoTrue non è cablato). Inoltre la tabella `material_image` è stata creata ma **il flusso immagini non è wired**. Questo change-set chiude questi tre buchi + alcune rifiniture.

Distinzione chiave da rispettare in UI: **`resource` ≠ `app_user`**. La risorsa è operativa (persona/veicolo/attrezzatura, può non fare login); l'utente è l'identità di login con i permessi. Il ponte è `resource.user_id` (opzionale). Il modulo Utenti gestisce gli `app_user`; la scheda Risorsa **mostra** (sola lettura) i ruoli dell'utente eventualmente collegato.

---

## BLOCCO G — Gestione Ruoli & Permessi (modulo admin)

**Obiettivo:** schermata in **SISTEMA → Amministrazione → Ruoli** per definire ruoli e i loro permessi. Nessuna migrazione (le tabelle esistono).

### G.1 — Seed/sync ruoli di sistema
- Dai `SYSTEM_ROLES` di `permissions.ts`: upsert dei ruoli con `is_system=true` per ogni tenant (e nel bootstrap dei tenant futuri). I permessi dei ruoli di sistema si popolano da `buildRolePermissionRows()`.
- I ruoli di sistema **non sono eliminabili né rinominabili**; sono **clonabili** per creare un ruolo custom di partenza.

### G.2 — Backend (route `roles`)
- CRUD ruoli **custom** (tenant-scoped): create/update/delete (delete solo se non assegnato ad alcun utente, altrimenti errore esplicito).
- Endpoint catalogo permessi: espone `PERMISSION_CATALOG` raggruppato per `Resource` (per la matrice UI) + i valori `DataScope` (`own | team | tenant | customer`).
- Set permessi di un ruolo = scrittura su `role_permission` (`role_id`, `permission_key`). Validare le chiavi contro `ALL_PERMISSION_KEYS` (rifiutare chiavi non in catalogo).
- `data_scope` impostabile per ruolo.

### G.3 — Frontend (Object Page Ruolo)
- **Lista Ruoli** (archetipo Lista standard): nome, descrizione, di sistema (badge), n° permessi, n° utenti, data_scope.
- **Scheda Ruolo** (Object Page): nome, descrizione, `data_scope` (select); **matrice permessi** raggruppata per risorsa (riga = risorsa, colonne = azioni con checkbox), pilotata dal catalogo. Ruoli di sistema in sola lettura (con azione "Duplica per modificare").
- Toolbar standard; tooltip su tutte le icone.

> 「NON FARE」 in G: non hard-codare la lista permessi in FE (leggi dal catalogo backend); non permettere delete di ruoli di sistema o di ruoli assegnati.

### Criteri di accettazione G
- I ruoli di sistema compaiono già popolati con i loro permessi; creo un ruolo custom "Capo cantiere", spunto permessi e imposto `data_scope=team`, lo salvo e lo rileggo correttamente.

---

## BLOCCO H — Gestione Utenti (modulo admin) · migrazione V047

**Obiettivo:** schermata in **SISTEMA → Amministrazione → Utenti** per gestire gli `app_user`, assegnare ruoli, collegare la risorsa, gestire il ciclo di vita.

### H.1 — Migrazione V047 (ciclo di vita utente)
```sql
ALTER TABLE public.app_user
  ADD COLUMN status text NOT NULL DEFAULT 'active',   -- 'invited' | 'active' | 'disabled'
  ADD COLUMN invited_at timestamptz,
  ADD COLUMN last_login_at timestamptz;
-- unicità del giunto di identità esterna (era prevista UNIQUE, nullable)
CREATE UNIQUE INDEX app_user_auth_user_id_uidx
  ON public.app_user (auth_user_id) WHERE auth_user_id IS NOT NULL;
-- codice visibile utente (number_series), se si vuole un ID utente leggibile
ALTER TABLE public.app_user ADD COLUMN code text;
```

### H.2 — Backend (route `users`)
- Lista utenti (tenant-scoped) con: nome, email, stato, ruoli, risorsa collegata, ultimo accesso.
- Create utente con **due modalità** (vedi anche Blocco I):
  1. **Invito via email:** crea `app_user` (`status='invited'`, `invited_at=now()`), poi avvia l'invito GoTrue (Blocco I.3). L'`auth_user_id` si valorizza all'accettazione/primo login.
  2. **Creazione manuale:** crea `app_user` (`status='active'`) e l'utente in GoTrue con password temporanea (Blocco I.4).
- Update: dati anagrafici, **assegnazione ruoli** (scrittura `user_role`), **collegamento risorsa** (`resource.user_id` ↔ questo utente; uno-a-uno), attiva/disattiva (`status`, `active`).
- Disattivazione: `status='disabled'` + `active=false` + disabilita l'utente in GoTrue (no hard-delete: clean-slate riguarda lo schema, non gli utenti reali futuri).

### H.3 — Frontend (Object Page Utente)
- **Lista Utenti** standard.
- **Scheda Utente**: dati (nome, email, telefono, locale, codice), **stato** (badge invited/active/disabled), box **Ruoli** (multi-select dai ruoli del tenant → `user_role`), box **Risorsa collegata** (associa una `resource` persona, o "nessuna"), riepilogo **permessi effettivi** (sola lettura, derivati dai ruoli) e **data_scope effettivo** (lo scope più ampio tra i ruoli). Azione "Invia invito" / "Reimposta password".
- Riusa la **stessa Lista risorse in modalità selezione** per collegare la risorsa (regola "una lista, ovunque").

### H.4 — Scheda Risorsa: ruoli dell'utente collegato (chiude SPEC D.4)
Nella **Scheda Risorsa**, se `resource.user_id` è valorizzato, mostra in sola lettura: utente collegato, stato, **ruoli** e data_scope. Se non collegato, mostra un'azione "Crea/collega utente" che porta alla scheda Utente pre-compilata.

> 「NON FARE」 in H: non duplicare la lista risorse; non mettere ruoli/permessi come colonne su `resource` o `app_user` (restano in `user_role`/`role_permission`); nessuna credenziale/password salvata in `app_user`.

### Criteri di accettazione H
- Creo un utente "manuale", gli assegno il ruolo "Capo cantiere", lo collego a una risorsa persona → nella scheda Risorsa vedo i suoi ruoli; i permessi effettivi sono coerenti col ruolo.

---

## BLOCCO I — Wiring autenticazione GoTrue (login reale)

**Obiettivo:** login reale via Supabase Auth/GoTrue, con **entrambi** i flussi (invito email + creazione manuale). AuthN su GoTrue; **authZ resta tutta nostra** (RBAC + RLS + entitlement). Nessuna migrazione (il giunto `auth_user_id` esiste già).

### I.1 — Deploy GoTrue
- Aggiungi il servizio **GoTrue** al `docker-compose` (stessa immagine self-hostable della famiglia Supabase Auth), puntato al Postgres esistente (schema dedicato `auth`).
- Config: **JWT asimmetrico** (chiave pubblica esposta via JWKS per validazione **offline**), `SITE_URL`/redirect dell'app, SMTP per le email di invito (vedi I.5). Non mettere segreti in chiaro nel repo: usa env/`.env`.

### I.2 — Validazione token nel backend
- Middleware che valida il JWT GoTrue **offline** (chiave pubblica/JWKS), estrae `sub` (id utente GoTrue).
- Mappa `sub` → `app_user.auth_user_id` → `app_user` → ruoli (`user_role`) → permessi (`role_permission`) → set permessi + `data_scope`. Da qui in poi valgono i guard `can()` e le RLS già esistenti.
- **Provisioning al primo login:** se nessun `app_user` ha quel `auth_user_id`, **match per email**: se esiste un `app_user` con quella email (creato dall'admin), valorizza `auth_user_id`, `status='active'`, `last_login_at`. Se non esiste e il tenant non consente auto-registrazione → rifiuta (nessuna creazione implicita).

### I.3 — Flusso INVITO via email
- L'admin crea l'`app_user` (`status='invited'`) → backend chiama l'**admin API GoTrue** per generare l'invito → GoTrue invia l'email → l'utente imposta la password → al primo login il middleware (I.2) collega `auth_user_id` per email e porta `status='active'`.

### I.4 — Flusso CREAZIONE MANUALE
- L'admin crea l'`app_user` (`status='active'`) → backend chiama l'admin API GoTrue per **createUser** con password temporanea (flag "cambio obbligatorio al primo accesso" se supportato) → l'admin comunica le credenziali → al login `auth_user_id` è già coerente.

### I.5 — SMTP (decisione operativa)
- Se in ambiente di sviluppo **non c'è SMTP**: il flusso **invito** resta predisposto ma in dev usa la **creazione manuale** come default; annota nel DONE che le email di invito richiedono SMTP in staging. **Non bloccare** l'avanzamento per assenza di SMTP.

### I.6 — Non rompere il login attuale
- Mantieni funzionante il login di sviluppo esistente (`owner@sisuite.local`) affiancando GoTrue, o migrando quell'utente in GoTrue. Documenta nel DONE cosa hai trovato e come hai integrato.

> 「NON FARE」 in I: nessuna password/segreto in `app_user` o nel repo; nessuna logica di authZ dentro GoTrue (solo authN); non introdurre auto-registrazione aperta.

### Criteri di accettazione I
- Un utente creato manualmente fa login via GoTrue e riceve i permessi del suo ruolo; un utente "invitato" (se SMTP disponibile, altrimenti simulato) al primo accesso ottiene `auth_user_id` e `status='active'`; un token non valido viene rifiutato; un utente disabilitato non accede.

---

## BLOCCO J — Gestione immagini materiali (inventario visivo) · migrazione V048

**Obiettivo:** rendere reale la gestione immagini articolo (oggi solo la tabella `material_image` esiste). È un punto di vendita del magazzino mobile (riconoscimento visivo in campo).

### J.1 — Migrazione V048 (pulizia + integrità)
```sql
-- L'immagine primaria è material_image WHERE is_primary: primary_image_url è ridondante → clean slate.
ALTER TABLE public.material DROP COLUMN primary_image_url;
-- al massimo UNA primaria per articolo
CREATE UNIQUE INDEX material_image_one_primary_uidx
  ON public.material_image (material_id) WHERE is_primary;
```

### J.2 — Backend (storage MinIO)
- Bucket dedicato (es. `material-images`), chiavi `tenant_id/material_id/<uuid>`.
- Endpoint: **upload** (presigned PUT o upload via backend → salva `object_key` in `material_image`), **list** per articolo, **set-primary** (transazione che azzera l'eventuale primaria precedente), **reorder** (`sequence`), **delete** (rimuove riga + oggetto su MinIO). **URL di lettura presigned** a scadenza (non esporre il bucket pubblicamente).
- L'API articolo restituisce l'immagine primaria risolta (join `material_image WHERE is_primary`) per lista e scheda.

### J.3 — Frontend
- **Scheda Articolo**: box **Galleria** — carica (drag&drop + file picker), miniature ordinabili, "Imposta come primaria" (stella), elimina. Stati di caricamento.
- **Lista Articoli**: miniatura primaria nella riga (fallback placeholder se assente).

> 「NON FARE」 in J: non salvare i binari nel DB (solo `object_key`); non lasciare il bucket pubblico; non reintrodurre `primary_image_url`.

### Criteri di accettazione J
- Carico 3 immagini su un articolo, imposto la primaria, riordino, ne elimino una; la miniatura primaria compare nella lista articoli; l'oggetto eliminato sparisce anche da MinIO.

---

## BLOCCO K — Punch-list rifiniture (chiude i punti aperti del DONE_TOTALE)

Nessuna migrazione (le colonne esistono già). Solo backend/FE.

1. **Tab "Seriali" per-magazzino:** aggiungi l'endpoint seriali **per location** (oggi esiste solo `/materials/:id/serials` per-articolo) e collega il tab della scheda magazzino.
2. **`stock_location` code/note:** estendi la route di update di `stock.ts` per **persistere** `code` e `note` (colonne già a DB da V043); togli il "display-only" in FE.
3. **`company_contact` mobile/department/note:** esponi le colonne (già a DB) nello schema/route contatti e nella scheda contatto in FE.
4. **Pulizia dati di smoke test:** fornisci uno script/azione "wipe demo" per rimuovere i dati di prova (company/material/PO) lasciati nel tenant Sivaf, da usare prima delle demo. Non cancellare dati strutturali.

### Criteri di accettazione K
- Il tab Seriali della scheda magazzino mostra i seriali di quel magazzino; salvo `code`/`note` di un magazzino e li rileggo; aggiungo `mobile`/`department` a un contatto; il wipe demo lascia lo schema intatto e svuota i dati di prova.

---

## BLOCCO L — Criteri di accettazione, DoD e cantiere

### L.1 — DoD trasversale
- Ogni tabella nuova/colonna nuova con RLS+FORCE+policy+GRANT (dove applicabile) e audit.
- Ogni modulo nuovo (Utenti, Ruoli) usa Lista + Scheda secondo lo standard v2; toolbar a icone con tooltip; "Nuova +" ultimo.
- ID visibili da `number_series`; nessun UUID a video.
- AuthN su GoTrue, authZ su RBAC+RLS+entitlement; nessuna credenziale in `app_user`.
- Clean-slate verificato: nessun `primary_image_url` residuo; nessun campo legacy.

### L.2 — Consegna
- Un solo report finale `DONE_TOTALE_2.md`: stato di ogni blocco G→K, criteri di accettazione superati/non, **assunzioni prese** (specie su GoTrue/SMTP), punti aperti. Aggiorna JOURNAL e `2026-06-21_schema_db_completo.md` (rigenera dopo 047/048).

### L.3 — 🚧 CANTIERE — prossime cose da fare (NON dimenticare, allineare a `BACKLOG_futuro.md`)
**Entra in QUESTO giro:** wiring GoTrue (Blocco I), gestione immagini materiali (Blocco J).
**Resta in cantiere dopo questo giro:**
- **Motore sync offline** (PowerSync vs ElectricSQL) — *prerequisito del magazzino mobile vero*; verificare lo stato attuale di entrambi prima di scegliere.
- **Solver di pianificazione** (Timefold vs OR-Tools) — servizio separato, post-MVP.
- **Narrazione AI** (raccontare in linguaggio naturale i dati strutturati) — priorità roadmap.
- **Sottosistema notifiche** — su cui poggiano gli **alert scorta minima**, **scadenza lotti** e **scadenza certificazioni** (i dati ci sono già: `reorder_point`, `stock_lot.expiry_date`, `resource_certification.valid_until`).
- **Export anagrafiche fiscali** verso gestionale esterno — formato/mapping di handoff (deriva dal "non fatturiamo, esportiamo").
- **Stampa/generazione etichette barcode** — feature app magazzino.
- **App mobile** (tecnico + magazzino mobile + scansione barcode + pick list in campo) — progettata a parte.
- **Demo data pack** (fibra/piscine/software) con loader/unloader per-tenant.
- **ADR + documento architetturale** — da scrivere DOPO l'implementazione: ADR "Identità & Accessi (GoTrue authN + RBAC/RLS authZ)"; aggiornamento doc magazzino con la gestione immagini.

### L.4 — Ordine di esecuzione
G → H → I → J → K → (L: accettazione finale). G è prerequisito di H (assegni ruoli che devono esistere). I segue H (admin gestisce gli utenti, GoTrue li fa loggare). J e K sono indipendenti.
