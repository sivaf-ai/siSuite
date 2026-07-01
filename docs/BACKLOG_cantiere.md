# BACKLOG / CANTIERE siSuite — cose da fare (NON dimenticare)

> Elenco vivo di tutto ciò che è stato approvato/proposto ma non ancora completato.
> Aggiornare a ogni sessione: spuntare ✅ quando fatto, aggiungere nuove voci.
> Ultimo aggiornamento: **30/06/2026** (chat 01.06).

## ▶ In corso / prossimo immediato
- [x] **WMS Ubicazioni — Fase 1**: coordinate (corsia/scaffale/ripiano/posizione) + **generatore massivo** (piatto+gerarchico) — FATTO (migr 063). (proposta: `analisi/2026-06-30_PROPOSTA_WMS_ubicazioni_professionali.md`)
- [x] **Campi di SISTEMA personalizzabili dal tenant** (B+E) — FATTO (migr 064): override label(ml)/obbligatorio/attivo/ordine/segnaposto/aiuto + "Ripristina default". I campi di sistema sono cliccabili in Campi personalizzati.
- [x] **Vertical del tenant** selezionabile in Generale — FATTO (30/06, no migr). PATCH `/settings/vertical`, `<select>` software/fiber/pools in Generale, effetto immediato senza relogin (i form rileggono il verticale dal tenant). Risolve "non vedo i campi fibra".

## 🏬 WMS Magazzino (vendibile standalone) — proposta `analisi/2026-06-30_PROPOSTA_WMS_ubicazioni_professionali.md`
- [x] **Fase 1** — coordinate + generatore massivo + tipo bin — FATTO (migr 063).
- [x] **Fase 2** — **capacità/spazio** per ubicazione — FATTO (migr 065). Criterio volume(m³)/peso(kg)/quantità + massimo + **blocco/avviso** al superamento; **% riempimento** (barra colorata) nella scheda nodo e nel rowMeta dell'albero; **volume unitario articolo** (+ peso) nel form materiale. Enforcement centralizzato nei carichi (movimenti + conferma documenti). **UDC/posti-pallet** rinviato (serve il modello "unità di carico").
- [x] **Fase 3** — **mappa occupazione** visiva (heatmap per scaffale/zona) come tab del magazzino — FATTO (solo FE, riusa `subtreeOf`). Tab «Mappa occupazione»: tiles colorati per % pieno (vuoto→verde→giallo→arancio→rosso>100%), roll-up aggregato per gruppo, KPI (bin con limite/medio/quasi pieni/in eccesso), legenda, toggle «solo con limite».
- [ ] **Fase 4** (opzionale) — putaway/prelievo ottimizzati (regole di stoccaggio, percorso FIFO/FEFO).

## 🧩 Campi configurabili per contesto — proposta `analisi/2026-06-30_PROPOSTA_campi_configurabili_per_contesto.md`
- [x] Asse B — campi per **variante/Tipo** di record (work_order/asset) — FATTO (migr 061).
- [x] Asse A — **Paese del tenant** (migr 062) + UI in Generale — FATTO.
- [ ] Estendere il selettore **Tipo** ad altre entità tipizzate (oltre work_order/asset) se servono.
- [ ] Estendere i **Paesi** oltre IT/AR (ES, …) — è solo dato (field_definition di sistema).
- [ ] Validazione **required stretta** anche in PATCH (update) degli ordini (oggi enforce su create; verificare update).

## 🌳 Entità ad albero (EntityTree)
- [x] Standard + pilota Categorie + Siti + Ubicazioni — FATTO.
- [ ] **WBS commessa ad albero**: specializzazione EntityTree con colonne economiche (ore/margine per ramo) — `sivaf-standards/tree/SPEC_WBS_commessa_v1_1_01_05.md`.
- [ ] Upload **immagine** nodo categoria su MinIO (oggi solo URL/icona).

## 🔌 Porting dati legacy
- [ ] **ETL** dal vecchio DBCompanyManagement (5432) al nuovo schema — analisi fatta, esecuzione da fare (memory `project_porting_legacy`).

## 🤖 Hub AI
- [ ] Nuove funzioni oltre "Filtro intelligente" e "Trova doppioni" (es. estrazione campi da testo/voce sui campi configurabili).

## 🏬 WMS professionale (documenti/giacenze) — proposta `analisi/2026-07-01_PROPOSTA_WMS_documenti_giacenze_professionali.md`
- [x] Codice ubicazione **univoco per padre** + **auto-codice** + **catena** (`pathLabel`) — FATTO (migr 066).
- [x] Movimenti: selezione ubicazione + **prelievo intelligente** (solo dove l'articolo c'è) — FATTO.
- [x] Consultazione giacenze **per bin** (subtreeOf) + riordino nel tab Articoli&Giacenze — FATTO.
- [x] **Fase A** — ubicazioni a livello di **riga** nei documenti (origine/destinazione per riga, default dalla testata; conferma con pre-pass di validazione per riga, atomica) — FATTO (DDT/Carico/Trasferimento/Rettifica). Pick list line-level = follow-up.
- [x] **Fase B** — putaway/pick **guidati** — FATTO (movimenti **e righe documento**): prelievo ordinato **FIFO** con «consigliata»; putaway verso bin con **capacità disponibile** (entra/pieno, «consigliata»). Nelle righe DDT: «Preleva da»→prelievo guidato, «Versa in»→putaway guidato.
- [x] **Fase C** — maschera **inquiry** globale `/stock/inquiry` (per articolo: dov'è + espandi ubicazioni; per ubicazione: cosa contiene; report riordino con deficit) — FATTO (solo FE).
- [x] **Fase D** — creazione documenti **assistita/AI** — FATTO. `POST /ai/stock-document` (AI estrae intento → resolver deterministico articoli/ubicazioni/fornitore sotto RLS → bozza + warnings); pulsante «Assistente AI» nella lista Documenti → modale → apre la bozza precompilata da rivedere/confermare. Richiede `ANTHROPIC_API_KEY`.

## 🧰 Debiti minori / rifiniture
- [x] Picker "Articolo" nei movimenti di magazzino → MaterialPicker (D-0) — FATTO.
- [ ] Schede admin config (Numerazioni/Campi/Modelli) eventuale allineamento estetico fine.
- [ ] Indirizzo Sito: editing avanzato (oggi country-driven via field_definition; ok).

## ✅ Fatto di recente (storico sintetico)
- Standard entità ad albero + EntityTree + pick mode (migr 058).
- Tipi configurabili (site/ubicazione) come lookup con **icona+colore** (migr 059-060).
- Campi per **contesto**: country (migr 062) + variant (migr 061) + UI + validazione required.
- Fix UX: modali in portal, doppia barra titolo, AddressField, palette C.
- Picker a lente (D-0) su documenti e flussi tecnico.
