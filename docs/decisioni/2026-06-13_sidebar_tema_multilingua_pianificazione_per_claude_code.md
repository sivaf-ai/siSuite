# siSuite — Sidebar, Tema scuro, Multilingua, Pianificazione — brief per Claude Code (parte 6)

> **Data:** 13/06/2026 · Riscontri dal titolare su uno screenshot dell'app reale.
> Per ognuno: **stato verificato** + **meccanismo consigliato** (migliori pratiche attuali). Vale il protocollo di
> fedeltà delle parti 4/5.

---

## 1. SIDEBAR — richiudibile e responsiva

**Stato/valutazione (onesta):** una sidebar fissa a ~248px è uno **standard moderno** (Linear, Notion, Asana, Jira fanno
così): non è "vecchio". Il punto giusto del titolare non è *toglierla*, ma **renderla richiudibile** per recuperare spazio
quando serve, e gestirla bene sugli schermi stretti. Oggi è sempre aperta e non si può ridurre.

**Da costruire:**
- **Stato `collapsed`** (context o store leggero): la griglia `.app` passa da `grid-template-columns:248px 1fr`
  a `64px 1fr`. Quando collassata: solo icone, testo nascosto, **tooltip** sull'hover; il logo diventa il solo "mark".
- **Pulsante toggle** in cima alla sidebar (icona "panel-left"/chevron). Persisti la scelta in `localStorage`
  (chiave es. `sisuite.sidebar`) e, meglio, anche in `app_user.attributes.ui.sidebar` per seguirlo tra dispositivi.
- **Responsive:** sotto ~1024px → collassa di default; sotto ~768px → diventa un **drawer in overlay** (apri con un
  bottone "menu" nella topbar, chiudi su backdrop). Usa `@media` + il `.backdrop`/`.drawer` già in `base.css`.
- **Larghezza utile dei contenuti:** dai un `max-width` ai contenuti di `.page` (es. 1280–1360px centrati) così su
  schermi larghi non si "stira" e si legge meglio — questo da solo fa sembrare l'app più curata.
- Transizione morbida (`transition` su width ~.18s). Mantieni le classi `.sidebar/.nav-item/.nav-group` di `base.css`.

---

## 2. TEMA SCURO (dark mode)

**Stato verificato:** le **fondamenta ci sono** — `base.css` definisce tutti i colori come **variabili** (`--ink`,
`--paper`, `--card`, `--brand`, …) ed è dichiarato "pronto per tema chiaro/scuro". **Manca** il set di colori scuri e
l'interruttore. Poiché ogni componente usa `var(--token)`, una volta definito il set scuro il tema cambia "da solo".

**Meccanismo consigliato (lo standard attuale: CSS custom properties + attributo sul root — niente librerie pesanti):**
1. **Set di token scuri** in `design-system.css`, sotto un selettore di tema:
   ```css
   :root[data-theme="dark"]{
     --ink:#E7E9EF; --ink-2:#D2D6DF; --ink-soft:#9AA0AD; --ink-faint:#6B7180;
     --paper:#0F1014; --card:#1B1D24; --line:#2A2D37; --line-2:#23252E;
     --brand:#6E61F2; --brand-wash:#241F4D; --brand-ink:#B7AEFF;
     --flow:#2BD4CE; --flow-wash:#0E2E2C;
     --success:#2BB67E; --success-wash:#10302492; /* …e così per warning/danger/info/neutral */
     --shadow-1:0 1px 2px rgba(0,0,0,.4); --shadow-2:0 2px 6px rgba(0,0,0,.5),0 14px 34px rgba(0,0,0,.55);
   }
   ```
   (Valori di partenza: Claude Code li **rifinisce per contrasto WCAG AA** — testo/sfondo ≥ 4.5:1.)
2. **Applicazione:** imposta `document.documentElement.dataset.theme = 'dark' | 'light'`. Tutto il resto usa già le variabili.
3. **Default intelligente:** se l'utente non ha scelto, segui `@media (prefers-color-scheme: dark)`.
4. **Persistenza:** `localStorage` (`sisuite.theme`) + opzionale `app_user.attributes.ui.theme` (segue tra dispositivi).
5. **Interruttore** in **Impostazioni › Generale** (oggi informativo → renderlo attivo) e una **scorciatoia** nel menu
   utente in fondo alla sidebar (icona sole/luna).
6. **Coerenza con i color-token degli stati:** i `lookup_value.color_token` restano gli stessi nomi (success/warning/…);
   cambiano solo i valori nel set scuro. Le `.pill--*` continuano a funzionare senza modifiche.
7. **Immagini/cornice telefono mobile:** verifica le viste `/m` e i gradienti (`--flow-grad`) sul fondo scuro.

> Nota: niente `localStorage` è un limite **solo** negli artifact di anteprima; nell'app reale è la prassi corretta.

---

## 3. MULTILINGUA (i18n: it-IT, en, es-AR)

**Stato verificato:** i **dati** sono già multilingua — etichette per-locale (`lookup_value.label`, `field_definition.label`
sono jsonb `{"it-IT":…,"en":…,"es-AR":…}`), `app_user.locale`, `tenant.default_locale`. **Manca** lo strato UI:
le scritte dell'interfaccia sono cablate in italiano e **non c'è il selettore di lingua**.

**Meccanismo consigliato (standard attuale per React): `i18next` + `react-i18next`** (de-facto, maturo, leggero).
*(Alternative valide: `@lingui` o `react-intl`/FormatJS — ma i18next è il più diffuso e semplice da adottare qui.)*
1. **File di traduzione** per lingua: `src/i18n/{it-IT,en,es-AR}.json` con le chiavi delle scritte UI
   (es. `nav.planning`, `planning.subtitle`, `actions.save`). **es-AR è una lingua a sé** (non spagnolo generico):
   formati e alcuni termini differiscono (memorizzato nelle decisioni di progetto).
2. **Init**: `i18n.use(initReactI18next)`; lingua iniziale risolta in quest'ordine:
   `app_user.locale` → lingua del browser → `tenant.default_locale` → `it-IT` (fallback).
3. **Uso nei componenti**: `const {t}=useTranslation()` → `t('nav.planning')`; per testi con markup `<Trans>`.
4. **Selettore di lingua** nel **menu utente** (sidebar in basso) e in **Impostazioni › Generale**; al cambio,
   salva in `app_user.locale` (così segue l'utente) e aggiorna i18next.
5. **Etichette dei dati** (stati, campi): vengono **già** per-locale dall'API/DB → il frontend sceglie la voce della
   lingua corrente dal jsonb `label`. Assicurarsi che le API che restituiscono `lookup_value`/`field_definition`
   includano tutte le lingue (o accettino la lingua e restituiscano quella giusta).
6. **Date/numeri/valuta**: usa l'**API `Intl`** (`Intl.DateTimeFormat`/`NumberFormat`) con il locale corrente
   (es-AR ha formati diversi da it-IT). Niente formattazioni cablate.
7. **Esternalizzazione**: spostare le scritte cablate nei file di lingua è il grosso del lavoro — è meccanico.
   Farlo **per schermate**, partendo da quelle del **demo** (ma vedi priorità sotto).

---

## 4. PIANIFICAZIONE — perché è un elenco e cosa manca

**Diagnosi (dallo screenshot):** quello che vedi **non è un errore**: è la vista **per-commessa** attuale
(`GET /engagements/:id/schedule`) resa come elenco. E **funziona**: ha pianificato la catena FS della fibra in sequenza
(Giunzione 10:00→11:30 → Borchia 11:30→12:30 → Collaudo 12:30→13:15 → Attivazione 13:15→13:45). Buon segno: dipendenze e
motore reggono.

**Cosa manca = la griglia "calendario" del mock 03** (quella che ti piaceva): **griglia risorse × giorni**, blocchi
fissi/flusso, oggi evidenziato, rail con narrazione AI. È la **FASE 2**, già specificata nella **parte 4 §3.4 e §4**
(richiede il calcolo **per-risorsa** + orari per-tecnico).

**Raccomandazione:**
- Costruisci la **griglia mock 03** come **vista principale** di "Pianificazione" (è il "vedo cosa sto pianificando").
- La vista **per-commessa** attuale (l'elenco/sequenza) spostala come **vista secondaria** o nel **tab "Gantt"** del
  dettaglio commessa (mock 24): lì la sequenza per-commessa ha senso. In Pianificazione, il protagonista è il calendario.
- Aggiungi il selettore vista (settimana-risorse ↔ commessa) se utile, ma il default è la **settimana**.

---

## 5. Priorità consigliata (cosa fare prima)
1. **Griglia Pianificazione (mock 03) + backend per-risorsa (FASE 2)** — il titolare la chiede esplicitamente ed è la
   vista che "vende"; sblocca anche orari per-tecnico. **Priorità alta.**
2. **Sidebar richiudibile + responsive + max-width contenuti** — piccolo, alto impatto percepito ("app più moderna"). **Quick win.**
3. **Tema scuro** — fondamenta pronte; sforzo medio. Bello per l'effetto "moderno", non bloccante per il demo. Dopo 1–2.
4. **Multilingua UI** — impostala **bene da subito** (i18next + file lingua + selettore + risoluzione da `app_user.locale`),
   ma l'esternalizzazione completa **non blocca il primo demo fibra** (che è in italiano). Fai l'impianto + le schermate
   del demo ora; il resto delle scritte a tappe.

---

## 6. Checklist per Claude Code (questa parte)
- [ ] **Sidebar**: stato `collapsed` (248↔64), toggle, tooltip in modalità icone, persistenza (localStorage + `app_user.attributes.ui`), responsive (<1024 collassa, <768 drawer overlay), `max-width` ai contenuti `.page`.
- [ ] **Tema scuro**: set token `:root[data-theme="dark"]` in `design-system.css`; applica via `data-theme` sul root; default da `prefers-color-scheme`; persistenza; interruttore in Impostazioni › Generale + menu utente; rifinitura contrasto WCAG AA.
- [ ] **i18n**: `i18next`+`react-i18next`; file `it-IT/en/es-AR`; risoluzione lingua (`app_user.locale`→browser→tenant→it-IT); selettore lingua (menu utente + Generale) che salva su `app_user.locale`; `Intl` per date/numeri; etichette dati per-locale dal jsonb; esternalizzare le scritte partendo dalle schermate del demo.
- [ ] **Pianificazione**: costruisci la **griglia mock 03** (FASE 2, parte 4 §3.4/§4) come vista principale; sposta la vista per-commessa nel tab Gantt del dettaglio commessa.
- [ ] Impostazioni › Generale: rendi **attivi e persistiti** lingua, tema (e orari azienda, vedi parte 4 §4.4).
- [ ] Conferma prima di toccare lo scheduler; commit + push su GitHub a fine sessione.

---

*Fine parte 6 — 13/06/2026.*
