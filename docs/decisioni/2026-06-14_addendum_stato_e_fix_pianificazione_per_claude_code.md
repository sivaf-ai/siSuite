# siSuite — Addendum stato 14/06 + fix Pianificazione — per Claude Code (parte 7)

> **Data:** 14/06/2026 · Riscontro su `2026-06-14_stato_sviluppo_per_claude_ai.md` + screenshot griglia Pianificazione.
> Non rifare ciò che è già fatto (vedi §3). Due interventi nuovi (§1, §2), poi si lancia la parte 6 + il residuo FASE 2.

---

## 1. BUG da correggere subito (demo-critico): i blocchi non compaiono nella griglia

**Sintomo (dallo screenshot, settimana 8–12 giu):** la griglia risorse×giorni è **vuota**, ma il rail dice
"11 attività collocate questa settimana / nessun conflitto" e il mini "Attività **6** · Ore pianificate **13h**".
Quindi **i dati esistono ma i `.block` non vengono renderizzati nelle celle**. Non è fedeltà (la struttura è corretta),
è **abbinamento blocco → cella**.

**Cause probabili (in ordine):**
1. **Sfasamento di fuso sulla data** (coerente con la nota "UTC-naive" nel tuo stato): il giorno del blocco
   (`from`/`date`) non combacia con la **chiave colonna** del giorno. Es. un'attività delle 09:00 locali salvata/letta in
   UTC può cadere nel giorno precedente → la cella non la trova.
2. **Mismatch della chiave**: la cella è indicizzata per `(resource_id, 'YYYY-MM-DD')` ma il blocco espone un formato
   diverso (ISO completo, o `resource.id` vs `activity_resource.resource_id`).

**Cosa fare:**
- Allinea la **chiave giorno**: genera per ogni blocco una `dayKey = YYYY-MM-DD` **nello stesso fuso** delle colonne
  (usa il timezone del tenant, non UTC). Le colonne e i blocchi devono usare **la stessa funzione** di derivazione data.
- Allinea la **chiave risorsa**: la riga usa `resource.id`; verifica che il blocco riporti lo stesso `resource_id`.
- **Riconcilia i conteggi**: rail (narrazione), mini ("Attività/Ore") e griglia devono calcolare sullo **stesso `from`**
  e sullo **stesso insieme** di attività della settimana visualizzata. Oggi divergono (vuoto / 6 / 11).
- Aggiungi un **test** che, dato un piano con N blocchi in una settimana, verifica che il conteggio del mini = blocchi
  resi nella griglia (anti-regressione su questo bug).

## 2. Date del Demo Pack **relative a "oggi"** (così la griglia si apre sempre piena)

Oggi le attività fibra cadono intorno al 15/06 (date assolute) mentre la vista si apre sull'8–12 → sembra vuota.
- Nel loader dei demo-pack, interpreta le date come **relative al momento del load** (es. `started_on = oggi-2g`,
  attività distribuite da `oggi-2g` a `oggi+5g`). Nel JSON usa offset (es. `"day_offset": -2`) invece di date fisse,
  oppure il loader ribasa le date assolute su "oggi".
- In alternativa minima: la **Pianificazione si apre sulla settimana che contiene "oggi"** (non su una settimana passata
  vuota) e, se vuota, sulla **prima settimana con attività**.
- Effetto: ogni `demo:wipe`+`demo:load` produce un calendario **già pieno** nella vista di default. Ideale per le demo.

## 3. Mappa "GIÀ FATTO / DA NON RIFARE" (rispetto ai miei brief)

**Già fatto da Claude Code (non rifare):**
- FASE 0, FASE 1 (tutto).
- **FASE 2 nucleo**: scheduler **per-risorsa**, **griglia Pianificazione (03)**, orari **azienda** editabili/persistenti, 14 test. → *parte 4 §3.4/§4 sostanzialmente realizzata* (resta solo §3.4 lato editing per-risorsa, vedi §4 sotto).
- Fedeltà: Dashboard (05), Lista commesse (06), Dettaglio commessa 4 tab (07/24), Impostazioni (15-18), Today mobile (01). → *parte 5 in parte realizzata.*
- ClienteDetail con contatti (mock 19) ✓; `CrudList` + `EntityForm` drawer kit (mock 25/26) ✓; AI in/out; demo-pack+fiber; SUPER Admin; campi fibra.

**Ancora da fare (i miei brief restano validi):**
- §1, §2 di questo documento (bug griglia + date relative).

## 4. Cosa lanciare ADESSO (in quest'ordine)

1. **§1 + §2** di questo documento (bug blocchi + date demo relative) — piccolo, sblocca il "wow" della griglia.
2. **Parte 6** (`2026-06-13_sidebar_tema_multilingua_pianificazione_per_claude_code.md`) — **ancora valida al 100%**,
   nulla di essa è stato fatto: sidebar richiudibile, **tema scuro**, **i18n** (en/es-AR), e **persistenza** degli switch
   di Impostazioni › Generale (oggi tema/notifiche sono "solo locali" → renderli persistiti). *(La griglia Pianificazione
   citata nella parte 6 §4 è ORA fatta: ignora quel punto, resta valido il resto.)*
3. **Residuo FASE 2 — Dettaglio Risorsa (mock 20)** — oggi le risorse sono solo `CrudList`. Serve la **pagina dettaglio
   risorsa** con la striscia `.avail` per **modificare gli orari del singolo tecnico** (`resource.working_hours`) e le
   indisponibilità. Il motore **già li usa** se valorizzati: manca solo l'editing in UI. *(Spec in parte 5 §A.2.)*
4. Poi **FASE 3**: dipendenze (parte semplice, con fix sicurezza visibilità), gestione campi personalizzati,
   template commessa, pack software/piscine, e — più avanti — solver, enforcement quota AI, timezone puntuale, portale,
   notifiche, audit.

## 5. Checklist per Claude Code (questa parte)
- [ ] Fix griglia: `dayKey` nel **fuso del tenant** condiviso tra colonne e blocchi; match `resource_id`; riconcilia rail/mini/griglia sullo stesso `from`; test anti-regressione. *(§1)*
- [ ] Demo-pack con **date relative a oggi** (offset) oppure apertura sulla settimana con dati. *(§2)*
- [ ] Lancia **parte 6** (sidebar/tema/i18n + persistenza Generale), saltando solo il punto "griglia" già fatto. *(§4.2)*
- [ ] **Dettaglio Risorsa (mock 20)** con editing orari per-risorsa. *(§4.3, parte 5 §A.2)*
- [ ] Commit + push su GitHub a fine sessione.

---

*Fine parte 7 — 14/06/2026.*
