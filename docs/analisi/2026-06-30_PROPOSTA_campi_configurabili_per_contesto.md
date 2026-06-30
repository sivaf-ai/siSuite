# Proposta — Campi configurabili PER CONTESTO (geografia + tipo attività)

- **Data:** 30/06/2026 · **Chat:** 01.06 · **Stato:** proposta (da approvare)
- **Origine:** richiesta del titolare — rendere il software versatile configurando set di campi diversi per Paese (es. indirizzo IT vs AR) e per tipo di attività (es. Ordini Fibra con campi dedicati).

## 1. La buona notizia: la base ESISTE già
La tabella `field_definition` (che alimenta tutti i form via `AddressField`/`AttrFields`/`EntityForm`) ha **già due discriminatori di contesto**:

| Colonna | Significato | Già usata per |
|---|---|---|
| `country` (ISO char 2) | **geografia** | Indirizzo (IT: Via/Civico/CAP… · AR: Calle/Número/CPA…), campi fiscali del Soggetto |
| `vertical` (text) | **dominio/settore** del tenant | pacchetto di settore (es. `fibra`, `software`); oggi è UNO per tenant |

Indici: `field_definition_scope_idx (entity, country, vertical) WHERE active`. Quindi un campo è definito per `(entità, [paese], [verticale])`. **Il meccanismo che immagini è in gran parte già architettato.**

## 2. Cosa ho già attivato (30/06)
- **Indirizzo configurabile da UI**: *Impostazioni › Campi personalizzati › Indirizzo* con **selettore Paese** (IT/AR). Aggiungi/modifichi i campi per Paese; l'AR ha già i suoi 8 campi. Il backend accetta `country` in creazione.
- Stesso selettore Paese disponibile anche per il **Soggetto** (campi fiscali country-driven).

## 3. I due assi di configurazione (proposta)

### Asse A — GEOGRAFIA (per Paese / ISO del Tenant)
**Stato:** quasi completo. Proposte di rifinitura:
1. **Default dal Tenant**: il Tenant ha un Paese (ISO). Le nuove anagrafiche (Soggetti, Siti) **ereditano** quel Paese come default → l'utente vede subito i campi giusti senza sceglierli.
2. **Seeding automatico**: alla creazione di un Tenant con `country = AR`, attivare/copiare il set di campi AR (già seedati come righe di SISTEMA, `tenant_id NULL`). Già funziona perché le righe di sistema sono condivise; serve solo che il Tenant sappia il suo Paese.
3. Estendere la UI Paese ad altri Paesi (oggi IT/AR; aggiungere ES, ecc. è dato, non codice).

### Asse B — TIPO DI ATTIVITÀ / RECORD (per "variante")
È il pezzo NUOVO che chiedi (es. **Ordini Fibra** con campi dedicati diversi da altri ordini). Due strade:

- **B1 — Per tenant (già possibile):** se l'intero tenant fa Fibra, si usa `vertical = 'fibra'`: i campi `work_order` con `vertical='fibra'` compaiono solo per quel tenant. Limite: è tenant-wide, non distingue tipi diversi DENTRO lo stesso tenant.
- **B2 — Per TIPO di record (proposta nuova):** aggiungere un discriminatore **`variant`** a `field_definition` legato al **Tipo** del record (che già gestiamo come `lookup_value`: es. `work_order` ha un Tipo, `asset_kind`, ecc.). Il form, scelto il Tipo, carica i campi di `(entity, variant = tipo_scelto)`. Esempio: Ordine di lavoro Tipo="FTTH" → mostra `seriale_ont`, `potenza_ottica`, `id_borchia`; Tipo="Manutenzione" → altri campi.

**Raccomandazione:** implementare **B2** riusando i Tipi già a catalogo (`lookup_value`), così il titolare configura sia i Tipi (Stati & etichette) sia i campi per Tipo (Campi personalizzati › selettore Tipo, accanto al selettore Paese). Massima versatilità, zero codice per ogni nuovo tipo.

## 4. Visione unificata
Un campo vive in uno **scope**: `(entità, paese?, variante?)`. La UI *Campi personalizzati* avrà fino a due filtri contestuali:
- **Paese** (per entità country-aware: address, company);
- **Tipo/Variante** (per entità con tipologie: work_order, asset, …).

I form già caricano `field_definition` per entità; basta passare anche paese+variante del record. **Niente maschere custom**: tutto resta data-driven (coerente con lo standard "mai campi cablati").

## 5. Lavoro stimato per B2 (se approvato)
1. Migrazione: colonna `variant text` su `field_definition` + indice scope (esiste già `(entity,country,vertical)`; aggiungere variant).
2. Loader backend: filtrare per `variant` (universali + del tipo).
3. Form (work_order/asset…): passare il `variant` = Tipo del record al caricamento campi.
4. UI Campi personalizzati: selettore **Tipo** (da `lookup_value` della categoria del tipo) accanto a Paese.
5. Doc/standard aggiornati.

## 6. Domanda al titolare
- Approvi **B2** (campi per Tipo di record, riusando i Tipi a catalogo)? È ciò che rende l'app "versatile" come descrivi.
- Vuoi anche le rifiniture dell'**Asse A** (default Paese dal Tenant + seeding automatico)?
