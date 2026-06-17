# Kickoff Claude Code — Moduli POWERCOM (Ordinativi FTTH · Seriali · Produzione)

> ⚠️ **Documento superato.** Da consegnare a Code c'è ora il brief completo e autosufficiente **`BRIEF_Claude_Code_POWERCOM_v1_0_01.03.md`**. Questo file resta solo come indice rapido.

> Chat: 01.03 · 15/06/2026. Leggi PRIMA: `ARCH_moduli_powercom_v1_0_01.03.md` e gli ADR 0001–0004.
> Standard UI vincolanti: `STANDARD_UI_liste_e_maschere_v2`, `02_navigation_menu`, `base.css`, mockup `41/42/43` + i nuovi `44/45`.
> Lavora in autonomia per blocchi logici, test funzionale tra un blocco e l'altro, report `DONE_*.md`. Italiano.

## 0. Regola d'oro
Una sola **Lista** + una sola **Scheda** per entità, riusate ovunque (gestione **e** selezione in pop-up). Header sticky **opaco** senza gap. Niente pattern superati.

## 1. Database (prerequisito)
Applica in ordine, sono immutabili dopo merge:
`024_serial_inventory.sql` → `025_work_orders.sql` → `026_price_list.sql` → `027_production_accounting.sql` → `028_seed_powercom_lookups.sql`.
Dopo l'applicazione, **rigenera** il documento schema (`pg_dump --schema-only`) e sostituisci il riferimento.

## 2. Componenti condivisi (costruisci/riusa UNA volta)
- **AppShellNav2** — rail L1 collassabile + sub-panel L2 + omnibox ⌘K + sibling tab bar (rif. `43`). La sezione **Commesse → Moduli verticali → Ordinativi (FTTH)** è già nella mappa.
- **EntityList** — `mode = manage | pick-single | pick-multi`; righe 1 o 2 livelli; toolbar a sole icone con tooltip; selezione = numero; nessuna icona-funzione sulle righe.
- **ObjectPage** — header sticky opaco con solo Salva/Annulla; label/titoli **nel bordo**; validazione **dentro** il campo; correlate come **tab in fondo**; azioni AI contestuali.
- **CaptureBarAI** — barra cattura vocale: detta → l'AI propone la chiusura strutturata (apparati, seriali, lavorazioni). Riusabile in Ordinativo e Rapportino.

## 3. Maschere da creare/allineare (in ordine di priorità POWERCOM)

> **Mockup di riferimento già pronti** (in `mockups/`, costruiti su `base.css` v5 + standard liste/maschere v2 — usali come verità visiva, non reinventare lo stile):
> `44` Ordinativi FTTH (lista + scheda) · `45` Articoli & seriali (lista + scheda) · `46` Listino voci di capitolato (lista + scheda + ritocchi) · `47` Preventivo–consuntivo (pivot) · `48` Rapportino esteso (Documento, 6 sezioni + cattura vocale) · `49` Lavorazioni + libretto misure (lista + scheda).
> Da questi sei si deriva lo shell condiviso (AppShellNav2), `EntityList`, `ObjectPage`, l'archetipo `Documento`, `CaptureBarAI`, il pattern PII mascherata, il pattern pivot e il libretto misure. Estrai i componenti UNA volta da qui.

### Priorità 1 — Magazzino + Ticket (la sua urgenza, il meet)
1. **Ordinativi FTTH** — *mockup faro `44` (pronto)*. Lista "a pezzi" (righe 2 livelli: codice+ID gestore / intestatario mascherato+indirizzo / stato+squadra) + **viste** (Da assegnare · In lavorazione · Completati · KO). Scheda ordinativo: box Pratica, **Intestatario (PII mascherata)**, Indirizzo, **CaptureBarAI**; tab in fondo: Apparati pianificati, **Seriali installati** (password mascherata), Materiali, Foto, Storico. Tabelle: `work_order` (+`work_order_subject`, `work_order_item`, `stock_serial_unit`).
2. **Articoli & seriali** — *mockup `45` (pronto)*. Lista + Scheda `material` con flag `track_stock`/`tracked_by_serial`; tab in fondo **Unità seriali** (`stock_serial_unit`, con stato/ubicazione/ordinativo = parco installato) e Giacenze. Viste: Tutti · A magazzino · A seriale · Servizi · Scorta bassa.
3. **Allinea agli standard** (mockup da creare riusando lo shell di 44/45): Magazzino (giacenze/movimenti/inventario, base `29`), DDT/Scarico/Trasferimento/Rettifica (base `42` → varianti `stock_document`), Ordinativi legacy (`40` → sostituito da `44`).

### Priorità 2 — Produzione / Contabilità (fase 2)
4. **Voci di capitolato / Listino** — *mockup `46` (pronto)*. Lista + Scheda `price_list_item` (costo/ricavo) + **ritocchi** (`price_list_override`) per gestore/commessa, con regola di risoluzione "più specifico".
5. **Lavorazioni + libretto misure** — *mockup `49` (pronto)*. Riga su voce di capitolato × quantità (lista figlia del rapportino o Documento); misure che sommano alla quantità (`work_line` + `work_line_measure`). Riusa il pattern righe di 44/46.
6. **Rapportino esteso** — *mockup `48` (pronto)*. Sezioni Manodopera/Attrezzature/Materiali/Subappalti/Lavorazioni/Foto (`time_entry` + `equipment_usage` + `subcontract_line` + `material_consumption` + `work_line` + `capture`). Archetipo = Documento (testata + righe) con `CaptureBarAI` in testa.
7. **Preventivo–consuntivo (pivot)** — *mockup `47` (pronto)*. Dalla vista `job_cost_ledger`: Commessa × Fase/WBS × Tipo (dedotto) × Voce, costi/ricavi/margine, KPI in testa, **export Excel/CPM**.


## 4. Regole specifiche del dominio
- **PII**: i dati intestatario (`work_order_subject`) sono mascherati di default; in chiaro solo con permesso `pii.read`; mai loggati. La password apparato (`stock_serial_unit.secrets`) richiede `serial.secret.read`, cifrata, mai in chiaro a UI senza sblocco esplicito.
- **Stato ordinativo**: pill colorata da `lookup_value` (`work_order_status`), rinominabile per tenant via `lookup_override`. Non hardcodare le etichette.
- **Numerazione**: codice ordinativo da `number_series` key `work_order`.
- **Prezzo**: risolvi sempre con override più specifico (commessa → gestore → base).
- **Tipo di costo**: dedotto dalla fonte; nella pivot etichetta/colore da `lookup_value` (`cost_type`).

## 5. Definition of Done (per maschera)
RBAC su UI **e** API; stati vuoto/caricamento/errore; responsive desktop+mobile; densità via `data-density`; numeri tabellari a destra; valuta contabile; icone lucide; colori via token. Dopo la **prima** maschera "metro" (Ordinativi), fermati e mostra prima di replicare.
