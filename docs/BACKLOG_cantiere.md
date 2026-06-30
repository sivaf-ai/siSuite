# BACKLOG / CANTIERE siSuite — cose da fare (NON dimenticare)

> Elenco vivo di tutto ciò che è stato approvato/proposto ma non ancora completato.
> Aggiornare a ogni sessione: spuntare ✅ quando fatto, aggiungere nuove voci.
> Ultimo aggiornamento: **30/06/2026** (chat 01.06).

## ▶ In corso / prossimo immediato
- [ ] **WMS Ubicazioni — Fase 1**: coordinate (corsia/scaffale/ripiano/posizione) + **generatore massivo** di ubicazioni da range + tipo bin. (proposta: `analisi/2026-06-30_PROPOSTA_WMS_ubicazioni_professionali.md`)
- [ ] **Campi di SISTEMA personalizzabili dal tenant** (B+E): override per-tenant di **label (it/en/es)**, **obbligatorio**, **attivo**, ordine/segnaposto — SENZA toccare key/dataType/scope, NON eliminabili. Pattern = `lookup_override`. Serve `field_definition_override` + overlay nei loader + "Ripristina default".

## 🏬 WMS Magazzino (vendibile standalone) — proposta `analisi/2026-06-30_PROPOSTA_WMS_ubicazioni_professionali.md`
- [ ] **Fase 1** — coordinate + generatore massivo + tipo bin (vedi sopra).
- [ ] **Fase 2** — **capacità/spazio** per ubicazione (volume m³ / peso / n° UDC / quantità) + **% riempimento** + avvisi/blocco al superamento + volume unitario articolo.
- [ ] **Fase 3** — **mappa occupazione** visiva (heatmap per scaffale/zona) come tab del magazzino.
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

## 🧰 Debiti minori / rifiniture
- [ ] Picker "Articolo" nei movimenti di magazzino (oggi `<select>`) → MaterialPicker (D-0).
- [ ] Schede admin config (Numerazioni/Campi/Modelli) eventuale allineamento estetico fine.
- [ ] Indirizzo Sito: editing avanzato (oggi country-driven via field_definition; ok).

## ✅ Fatto di recente (storico sintetico)
- Standard entità ad albero + EntityTree + pick mode (migr 058).
- Tipi configurabili (site/ubicazione) come lookup con **icona+colore** (migr 059-060).
- Campi per **contesto**: country (migr 062) + variant (migr 061) + UI + validazione required.
- Fix UX: modali in portal, doppia barra titolo, AddressField, palette C.
- Picker a lente (D-0) su documenti e flussi tecnico.
