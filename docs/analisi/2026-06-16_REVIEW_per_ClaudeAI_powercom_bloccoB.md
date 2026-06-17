# siSuite · POWERCOM — Stato lavori per review (Claude AI)

> **A cosa serve questo documento.** È il riepilogo di quello che ho costruito finora (Claude Code) e di quello che intendo fare dopo, da far rivedere a Claude AI prima di andare avanti. È scritto per Ricardo: uso le sigle ma le spiego, con esempi. Allegato consigliato: lo schema DB rigenerato `2026-06-16_schema_db_completo.md`.
>
> Riferimento di lavoro: `BRIEF_Claude_Code_POWERCOM_v1_0_01.03.md`. Le maschere di riferimento sono i mockup `docs/mockup/44..50`.

---

## 0. Glossario lampo (le sigle che userò)

| Sigla / termine | Cosa vuol dire | Esempio pratico |
|---|---|---|
| **FTTH** | *Fiber To The Home*, fibra fino a casa | l'attivazione che fa il tecnico POWERCOM |
| **Ordinativo / work_order** | il "ticket" di una singola attivazione fibra | «Attiva la fibra in Via Roma 14, Napoli» |
| **PII** | *Personally Identifiable Information* = dati personali | nome, telefono, codice fiscale dell'intestatario |
| **RBAC** | *Role-Based Access Control* = permessi per ruolo | il *Tecnico* può vedere gli ordinativi ma non i dati personali in chiaro |
| **RLS** | *Row-Level Security* = sicurezza riga-per-riga del DB | l'azienda A non vede MAI le righe dell'azienda B, lo impone Postgres |
| **Multi-tenant** | un solo software, tanti clienti separati | Fibra Demo, Software Demo… ognuno isolato |
| **tenant** | un cliente/azienda nel sistema | "Fibra Demo" è il tenant di prova fibra |
| **DTO** | *Data Transfer Object* = la "scheda dati" che gira tra server e schermo | l'oggetto Ordinativo con codice, stato, indirizzo… |
| **CRUD** | *Create-Read-Update-Delete* = crea/vedi/modifica/elimina | il ciclo completo di una maschera |
| **field_definition** | tabella che dice *quali campi* ha un'entità | «l'ordinativo ha anche: tipo connessione, seriale ONT…» |
| **lookup_value** | tabella degli stati/etichette colorate | "Assegnato / In lavorazione / Completato / KO" |
| **number_series** | generatore di codici progressivi | l'ordinativo prende `2026-0001`, `2026-0002`… |
| **migrazione** | un file SQL numerato che modifica il DB | `025_work_orders.sql` crea la tabella ordinativi |
| **mockup** | il disegno della schermata-target (HTML) | `44_web_ordinativi-ftth` è il "faro" da copiare |
| **Object Page / scheda** | la pagina di dettaglio di un record | la scheda di un singolo ordinativo |
| **CaptureBarAI** | barra per dettare a voce → l'AI propone | «Montato ONT 7741, attivazione ok» |

**Concetto-chiave del progetto (vale per tutto):** *l'AI propone, il sistema deterministico dispone*. L'intelligenza artificiale **non scrive mai** da sola nel database: produce una **proposta** che l'utente conferma; solo dopo, un pezzo di codice "normale" salva. E ci sono **tre tipi di permesso diversi** che non vanno confusi:
1. **RBAC** = cosa puoi *fare* (es. creare un ordinativo);
2. **entitlement di piano** = cosa il *piano* del cliente abilita;
3. **data_scope** = quali *righe* puoi vedere (le tue / del team / di tutto il tenant).

---

## 1. Da dove sono partito

Il database e l'infrastruttura erano già pronti (Postgres, server, autenticazione, app web React, tutto in Docker). Erano già **scritte ma non ancora applicate** 5 migrazioni nuove (024→028) che creano le tabelle dei moduli POWERCOM:

- **024** — *magazzino a seriali*: ogni apparato (ONT, borchia, splitter…) è un pezzo unico con il suo numero di serie.
- **025** — *ordinativi FTTH*: la tabella `work_order` + i dati personali dell'intestatario in una tabella **separata** (`work_order_subject`) + gli apparati pianificati.
- **026** — *listino*: voci di capitolato con prezzo di costo e di ricavo, più i "ritocchi" per gestore/commessa.
- **027** — *contabilità di produzione*: lavorazioni, libretto misure, mezzi, subappalti + una "vista" unica (`job_cost_ledger`) che somma tutto per la pivot preventivo-consuntivo.
- **028** — *dati di sistema*: gli stati dell'ordinativo, i tipi di costo, la numerazione `2026-NNNN`.

---

## 2. Cosa ho FATTO in questa sessione

### 2.1 Ho preparato il database (era il prerequisito)
- **Applicate** le migrazioni 024→028 e ne ho aggiunta una nuova, la **029** (spiego sotto).
- **Trovato e corretto un bug** nel "lanciatore" delle migrazioni: andava in errore con le migrazioni nuove. *In parole semplici:* le migrazioni nuove si "firmano da sole" nel registro, ma il lanciatore provava a firmarle una seconda volta → conflitto. Ho reso il lanciatore tollerante. (Le migrazioni 024–028 sono "congelate", non le ho toccate: ho corretto solo il lanciatore.)
- **Verificato l'isolamento tra clienti (RLS)**: ho inserito un ordinativo per il cliente A e uno per il cliente B; il cliente A vede **solo** il suo, il cliente B **solo** il suo, un cliente inesistente vede zero. Poi ho cancellato i dati di prova.
- **Rigenerato lo schema** completo del DB → `docs/analisi/2026-06-16_schema_db_completo.md` (quello che allegherai).

### 2.2 Migrazione 029 — i campi tecnici della fibra sull'ordinativo
Il brief chiede che i campi tecnici dell'ordinativo (tipo connessione, ID presa, attenuazione in dB, seriale ONT, riferimento ordine) **non** siano scritti "a mano" nel codice, ma definiti in tabella (`field_definition`), così domani si aggiungono/tolgono senza toccare il programma. Esistevano già per "asset" e "commessa", non per "ordinativo": li ho aggiunti con la migrazione **029**.
*Esempio:* nella scheda ordinativo compare il box "Dati tecnici (fibra)" con il menu a tendina FTTH/FTTB/FTTC: quei campi arrivano da qui.

### 2.3 La maschera "metro": ORDINATIVI FTTH (Blocco B) — il cuore di questa consegna
È la prima maschera "fatta per bene" che fa da metro di paragone per tutte le altre. Due schermate, fedeli al mockup 44:

**A) La LISTA degli ordinativi**
- Righe a **2 livelli** (sopra il dato principale, sotto quello collegato). *Esempio riga:* "Sirti S.p.A. / FEN-10892013" — "Via Roma 14 / Napoli Est 2026" — intestatario mascherato — stato + squadra — data + codice.
- **Viste** in alto (filtri salvati): *Tutti · Da assegnare · In lavorazione · Completati · KO*, ognuna con il suo contatore.
- **Ricerca** per ID pratica, indirizzo, gestore o numero di serie.
- Barra strumenti a **sole icone** con spiegazione al passaggio del mouse (tooltip).

**B) La SCHEDA del singolo ordinativo**
- Intestazione "appiccicata" in alto con il codice (`2026-0001`), lo stato colorato e i pulsanti **Salva / Annulla**.
- Box **Pratica** (gestore, ID pratica, stato, commessa, squadra, data programmata).
- Box **Intestatario** con i **dati personali mascherati** (vedi 2.4).
- Box **Indirizzo di attivazione**.
- Box **Dati tecnici (fibra)** generato dai campi della 029.
- Box **Apparati da installare** (tabella modificabile).
- In fondo, le **tab correlate**: Seriali installati / Materiali / Foto / Storico.
- Una **barra cattura vocale AI** in cima (per ora segnaposto: la logica arriva nel Blocco F).

### 2.4 Privacy "by design" — il punto che POWERCOM tiene di più
I dati personali dell'intestatario (nome, telefono, codice fiscale) sono **mascherati di default**. Si vedono in chiaro **solo** se hai il permesso `pii.read`, e la decisione la prende il **server**: se non hai il permesso, il dato in chiaro **non arriva nemmeno** allo schermo (non basta "nascondere col CSS", che è aggirabile).

*Prova reale che ho fatto:*
- **Owner** (ha `pii.read`): vede `Mario Rossi`, telefono `3331234567`.
- **Tecnico** (Marco, NON ha `pii.read`): vede `M•••• R••••`, telefono `••• ••• •• 67`.

### 2.5 Permessi e menu
Ho creato i nuovi permessi: `work_order:*` (crea/vedi/modifica/elimina/assegna/importa), `serial:*` (seriali), `pii:read` (sblocco dati personali). Li ho assegnati ai ruoli giusti: l'Owner ha tutto; il Tecnico vede ordinativi e seriali ma **non** i dati personali in chiaro. Aggiunta la voce di menu **Lavoro → Ordinativi (FTTH)**.

### 2.6 Import da CSV (con controllo doppioni)
C'è l'endpoint che importa ordinativi da file del gestore. Siccome ogni ordinativo del gestore ha un ID univoco, se provi a importarne uno già presente lo **segnala come doppione** invece di duplicarlo. *Provato:* 2 righe importate → 1 creata, 1 doppione segnalato. (L'interfaccia per scegliere "quale colonna del CSV va in quale campo" è il piccolo step successivo.)

### 2.7 Verifiche fatte
- Migrazioni applicate (log OK), isolamento clienti OK, schema rigenerato.
- Server: creazione/elenco/dettaglio/mascheramento/import **provati davvero** via chiamate reali.
- Schermo: controllo del codice (typecheck) pulito su tutto; tutte le pagine nuove si compilano senza errori. La verifica **visiva** l'hai fatta tu (le maschere ci sono).

### 2.8 Decisioni che ho preso da solo (il brief me lo chiedeva, §12)
1. **Rapportino**: la tabella esiste già (riuso, non ne creo una nuova).
2. **Import CSV**: nessun tracciato standard fornito → mappatura **configurabile** lato schermo.
3. **Login/autenticazione**: già pronta, niente da rifare.
4. **Password apparati (seriali)**: cifratura gestita dal server (non in chiaro) → la completo nel Blocco C.
5. **Export verso TeamSystem CPM**: nessun formato fornito → parto con un **Excel generico** per WBS/voce.

### 2.9 Una scelta di metodo importante (da validare con Claude AI)
Il brief prevedeva un "Blocco A" di componenti di base da costruire prima. **Gran parte esisteva già** nel design system attuale (tabelle, form generati dai campi, etichette colorate, formattazione numeri). Quindi ho **riusato** quelli e costruito solo il davvero-nuovo (il campo mascherato PII + la maschera Ordinativi). Ho **rimandato** ai loro blocchi le parti pesanti non necessarie ora:
- il **menu a 2 livelli completo** in stile SAP Fiori (mock 43): oggi il menu è a 1 livello raggruppato, funzionante;
- la **lista riusabile in modalità "scelta da popup"**;
- la **pivot** e la funzione **prezzo "più specifico"** (arrivano nei blocchi D e G).

👉 **Domanda per Claude AI:** va bene questo approccio "riuso il design system esistente + costruisco solo il nuovo, rimando il menu 2-livelli", oppure vuoi che il menu a 2 livelli (mock 43) venga fatto subito come parte del Blocco A?

---

## 3. Cosa penso di fare DOPO (in ordine)

> Continuo a lavorare **a blocchi**: ogni blocco si chiude con un test reale e un report `DONE_<blocco>.md`. Mi fermo ai checkpoint per la tua review.

1. **Blocco B-bis (rifinitura ordinativi)** — interfaccia per la mappatura del CSV, azioni "di gruppo" (assegna/esporta più ordinativi insieme), selezione multipla nelle righe. *Risultato:* import e gestione massiva completi.

2. **Blocco C — Articoli & seriali (mock 45)** — il ciclo di vita di un apparato: *in magazzino → assegnato → installato*; il "parco installato" presso il cliente; la **password apparato** cifrata e sbloccabile solo con permesso. *Esempio:* scansioni il seriale dell'ONT, lo installi sull'ordinativo, e compare nel parco installato di quell'indirizzo.

3. **Blocco A "vero" (se confermato)** — menu a 2 livelli (mock 43) + lista in modalità "scelta da popup".

4. **Blocco D — Listino + prezzo "più specifico" (mock 46)** — la regola: prima il prezzo della commessa, poi quello del gestore, poi il prezzo base. Funzione scritta **una volta** e riusata ovunque.

5. **Blocco E — Lavorazioni + libretto misure (mock 49)** — registri le quantità di lavoro (es. "scavo 40 m") con il dettaglio delle misure che le compongono.

6. **Blocco F — Rapportino + CaptureBarAI (mock 48)** — il rapporto di giornata (manodopera, mezzi, materiali, subappalti, lavorazioni, foto) **e** la dettatura vocale: parli, l'AI propone le righe, tu confermi, il sistema salva.

7. **Blocco G — Pivot preventivo-consuntivo (mock 47)** — la tabella ad albero Commessa → Fase → Voce con costi, ricavi e margine, più l'export Excel/CPM.

8. **Blocco H — Allineamenti magazzino + dati demo "fibra"** — documenti di magazzino (DDT, scarico…) e un pacchetto dati demo realistico per il meet (gestore Sirti, commessa "Napoli Est 2026", ~30 ordinativi su vari stati, ecc.).

---

## 4. Domande aperte per Claude AI (le più utili da rivedere)

1. **Approccio Blocco A** (vedi §2.9): riuso + rimando menu 2-livelli, o menu 2-livelli subito?
2. **Mascheramento PII**: ti torna che l'indirizzo di attivazione resti **visibile** (serve al tecnico per andare sul posto) mentre nome/telefono/CF sono mascherati? O vuoi mascherare anche l'indirizzo?
3. **Import CSV**: confermi la mappatura configurabile lato schermo, o esiste un tracciato Sirti fisso da cablare?
4. **Password apparati**: cifratura applicativa lato server (come ho deciso) o preferisci `pgcrypto` lato DB?
5. **Export CPM**: c'è un formato file atteso da TeamSystem CPM, o procedo con l'Excel generico?
6. **Ordine dei blocchi**: tengo C (seriali) subito dopo la rifinitura ordinativi, o anticipi qualcos'altro per il meet?

---

## 5. Come provare di persona (browser)

1. App: `http://localhost:5173` → login **owner@fibra.demo / Demo123!** (cliente di prova "Fibra Demo").
2. Menu **Lavoro → Ordinativi (FTTH)**: trovi 2 ordinativi demo; clic su una riga apre la scheda; "Nuovo ordinativo" funziona.
3. Per vedere il mascheramento dati personali: esci e rientra come **marco@fibra.demo / Demo123!** (è un *Tecnico*): nome e telefono dell'intestatario appaiono mascherati e il pulsante "Mostra" è bloccato.

## 6. File principali toccati (per chi guarda il codice)
- DB: `db/migrations/029_work_order_fields.sql`; fix `packages/backend/src/migrate.ts`.
- Condivisi: `packages/shared/src/{permissions,menu,entities}.ts`.
- Server: `packages/backend/src/routes/workOrders.ts` (nuovo) + registrazione in `index.ts`.
- Schermo: `packages/frontend/src/pages/{OrdinativiPage,OrdinativoDetailPage}.tsx`, `components/MaskedField.tsx`, `pages/ordinativi.css`, `ui/icons.ts`, `shell/AppShell.tsx`.
- Documenti: schema DB rigenerato + `docs/DONE_B_ordinativi_ftth.md` (report tecnico dettagliato) + `JOURNAL.md` (coordinamento sessioni).
