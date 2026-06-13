# siSuite — Campi personalizzati (dynamic fields) + priorità demo fibra — brief per Claude Code (parte 3)

> **Data:** 13/06/2026 · Complemento ai documenti `2026-06-13_decisioni_e_brief_per_claude_code.md` (parte 1)
> e `2026-06-13_demo_data_packs_e_chiave_ai_per_claude_code.md` (parte 2).
> Verificato contro lo schema reale e `db/migrations/004_field_definition.sql` / `005_field_definition_rls.sql`.

---

## 1. Decisioni confermate dal titolare

1. **Primo demo = FIBRA.** Priorità assoluta: rendere **perfetto** il pack `fiber.json` e le schermate che servono
   alla storia fibra (vista tecnico mobile + dettaglio commessa + cattura/racconto AI), fedeli ai mockup.
2. **Si entra anche come TECNICO** nel demo → servono **utenze di login reali** per i tecnici del pack fibra
   (provisioning GoTrue, password demo es. `Demo123!`). Confermato l'approccio già previsto in parte 2 §1.3.
3. **Aggiungere i campi su misura anche per la fibra** + costruire il **meccanismo di gestione** dei campi
   personalizzabili per cliente (questo documento).

---

## 2. Il meccanismo dei campi dinamici — come funziona (stato attuale)

Fonte: `field_definition` (migrazione 004). Il commento nello schema lo dice già: questo catalogo **guida due cose
da un'unica fonte** — (1) il backend genera la validazione (zod) di `attributes`; (2) il frontend genera
**automaticamente** i campi del form (`EntityForm`), raggruppati/ordinati, con label nella lingua dell'utente.

**Colonne chiave** di `field_definition`:
`tenant_id` (NULL = sistema/domain-pack; valorizzato = override del tenant), `vertical`, `entity`
(`company|asset|engagement|activity|resource|material|company_contact`), `key` (la chiave dentro `attributes`),
`label` jsonb per-locale, `data_type` (`text|textarea|number|integer|money|date|boolean|email|phone|url|select|multiselect`),
`required`, `options` jsonb (per select), `validation` jsonb, `unit`, `placeholder`, `group_key` (sezione del form),
`sequence` (ordine), `active`. Unicità: `UNIQUE(tenant_id, vertical, entity, key)` + indice unico di sistema per `tenant_id IS NULL`.

**Due livelli:**
- **Sistema** (`tenant_id NULL`, per `vertical`): i campi di default di un mestiere (es. asset `pools` → `volume_m3`).
- **Per tenant** (`tenant_id` = cliente): campi extra/override che valgono solo per quel cliente.

**Stato verificato:**
- ✅ ESISTE il **lato lettura/rendering**: `GET /field-definitions?entity=` + `EntityForm` che disegna i campi +
  generazione validazione zod nel backend.
- ❌ MANCA il **lato gestione**: niente `POST/PATCH/DELETE /field-definitions`, niente schermata per definire campi
  personalizzati senza codice.

---

## 3. Da costruire — gestione dei campi personalizzati (design)

Obiettivo: il proprietario **o** un tenant admin può **aggiungere/modificare/disattivare** campi personalizzati
**senza programmare**, e le maschere li mostrano **da sole**.

### 3.1 Backend — endpoint di scrittura (NUOVI)
- `POST /field-definitions` · `PATCH /field-definitions/:id` · `DELETE /field-definitions/:id`
  (o soft via `active=false`, preferibile per non perdere dati storici in `attributes`).
- **Permesso:** `settings:manage` (il catalogo permessi ha già `settings:{read,manage}` — copre stati/etichette/
  numerazioni/orari/domain pack; i campi rientrano qui). Non serve un permesso nuovo.
- Validazione input (zod) sui campi del record stesso: `entity` ∈ insieme ammesso, `data_type` ∈ insieme ammesso,
  `key` formato sicuro (`^[a-z][a-z0-9_]*$`), `label` con almeno il locale di default, `options` obbligatorio se
  `data_type ∈ {select,multiselect}`.

### 3.2 RLS — regola di scrittura (NUOVA/da verificare in 005)
- Un tenant può **inserire/modificare/cancellare solo righe con `tenant_id = app_current_tenant()`**.
- Le righe **di sistema** (`tenant_id IS NULL`) sono **lette da tutti ma mai modificabili da un tenant**
  (solo `is_platform_admin`). Verificare che `005_field_definition_rls.sql` già imponga questo; se no, aggiungerlo.

### 3.3 Risoluzione dei "campi effettivi" (regola, da confermare nel backend)
Quando si apre il form di una entità, i campi effettivi = unione di:
1. righe **di sistema** con `vertical = <vertical del tenant>` **oppure** `vertical IS NULL` (validi per tutti);
2. righe **del tenant** (`tenant_id = corrente`).
Se un tenant ridefinisce la stessa `(entity, key)` di una riga di sistema, **vince la riga del tenant** (override).
Ordinamento finale per `group_key` poi `sequence`. (Verificare che `GET /field-definitions` applichi già questa unione;
se restituisce solo il sistema, estenderlo.)

### 3.4 Frontend — schermata "Campi personalizzati" (NUOVA)
- Nuova pagina admin (stile `CrudList`) sotto Amministrazione: **"Campi personalizzati"**, visibile con `settings:manage`.
- Permette di creare/modificare un campo scegliendo: `entity` (tendina), `key`, `label` (per-locale), `data_type`,
  `required`, `group_key`, `sequence`, e `options` quando il tipo è select/multiselect.
- Il rendering nei form delle entità **non cambia**: `EntityForm` già consuma `field_definition`, quindi appena salvi
  un campo qui, **compare automaticamente** nel form dell'entità (es. nel form Asset). Questo è il "meccanismo
  automatico" richiesto: si configura il dato, non si programma il campo.
- Mostrare un piccolo avviso quando si cancella un campo che ha già dati in `attributes` (preferire `active=false`).

### 3.5 Riassunto "chi fa cosa" (per spiegarlo al titolare)
- **Campi di un mestiere** (es. tutti i clienti fibra): si aggiungono come **righe di sistema** (`tenant_id NULL`,
  `vertical='fiber'`) — vedi §4. Le fa la piattaforma (voi).
- **Campi di un singolo cliente**: il tenant admin li aggiunge dalla schermata "Campi personalizzati"
  (`tenant_id` = suo). Non tocca gli altri clienti.

---

## 4. Campi su misura per il verticale FIBRA (righe di sistema da seminare)

Aggiungere come **seed di sistema** (`tenant_id NULL`, `vertical='fiber'`). Suggerito: nuova migrazione
`006_fiber_fields.sql` (oppure append al seed di `004`). Entità principale = `asset` (il punto di terminazione).

```sql
-- ASSET fibra (kind 'connection_point')
INSERT INTO field_definition (tenant_id, vertical, entity, key, label, data_type, required, options, unit, group_key, sequence) VALUES
 (NULL, 'fiber', 'asset', 'connection_type', '{"it-IT":"Tipo connessione","en":"Connection type","es-AR":"Tipo de conexión"}', 'select', false,
   '[{"value":"FTTH","label":{"it-IT":"FTTH (fibra fino a casa)","en":"FTTH","es-AR":"FTTH"}},{"value":"FTTB","label":{"it-IT":"FTTB (fibra fino all''edificio)","en":"FTTB","es-AR":"FTTB"}},{"value":"FTTC","label":{"it-IT":"FTTC (fibra fino all''armadio)","en":"FTTC","es-AR":"FTTC"}}]',
   NULL, 'technical', 1),
 (NULL, 'fiber', 'asset', 'socket_id',      '{"it-IT":"ID presa / ROE","en":"Socket/ROE ID","es-AR":"ID de toma"}', 'text',   false, NULL, NULL, 'technical', 2),
 (NULL, 'fiber', 'asset', 'distance_m',     '{"it-IT":"Distanza dalla centrale","en":"Distance from CO","es-AR":"Distancia a central"}', 'number', false, NULL, 'm', 'technical', 3),
 (NULL, 'fiber', 'asset', 'attenuation_db', '{"it-IT":"Attenuazione misurata","en":"Measured attenuation","es-AR":"Atenuación medida"}', 'number', false, NULL, 'dB', 'technical', 4),
 (NULL, 'fiber', 'asset', 'ont_serial',     '{"it-IT":"Seriale ONT","en":"ONT serial","es-AR":"Serie ONT"}', 'text', false, NULL, NULL, 'technical', 5);

-- ENGAGEMENT fibra (riferimento ordine del distributore)
INSERT INTO field_definition (tenant_id, vertical, entity, key, label, data_type, required, group_key, sequence) VALUES
 (NULL, 'fiber', 'engagement', 'work_order_ref', '{"it-IT":"Rif. ordine di lavoro","en":"Work order ref.","es-AR":"Ref. orden de trabajo"}', 'text', false, 'contract', 4);
```

> Nota: questi campi sono **anche** la base per popolare il pack fibra in modo realistico (vedi §5).

---

## 5. Aggiornamento del pack fibra (parte 2 §6)

Gli `asset` del pack `fiber.json` devono valorizzare i nuovi `attributes`, così la demo **mostra i campi su misura
pieni**. Esempi:
```json
{ "key": "borchia_dante_int5", "company": "cond_via_dante", "kind": "connection_point",
  "label": "Borchia Via Dante 8 int.5",
  "attributes": { "connection_type": "FTTH", "socket_id": "ROE-MI-00482", "distance_m": 320, "attenuation_db": 0.42, "ont_serial": "ONT-7H2K9" } },
{ "key": "borchia_beta", "company": "azienda_beta", "kind": "connection_point",
  "label": "Borchia Beta Logistica - sede",
  "attributes": { "connection_type": "FTTB", "socket_id": "ROE-MI-00913", "distance_m": 540, "attenuation_db": 0.61 } }
```
E la commessa fibra può portare `attributes.work_order_ref` (es. `"WO-2026-7781"`).

**Utenti del pack fibra (login reali per il demo):** Owner + Planner + due tecnici (giuntista/installatore), tutti con
identità GoTrue e password demo, così si può **entrare come tecnico** e mostrare il telefono in cantiere
(vista mobile su PC, parte 1 §4).

---

## 6. Checklist per Claude Code (questa parte)

- [ ] **Priorità:** finalizzare e testare per primo il pack `fiber.json` + le schermate della storia fibra
      (vista tecnico mobile su PC, dettaglio commessa, cattura/racconto AI), fedeli ai mockup. *(§1, §5)*
- [ ] Utenti login reali (GoTrue) per i tecnici del pack fibra. *(§5)*
- [ ] Seed campi di sistema fibra (`006_fiber_fields.sql` o append a 004). *(§4)*
- [ ] Backend: endpoint `POST/PATCH/DELETE /field-definitions` con `settings:manage`. *(§3.1)*
- [ ] RLS: scrittura solo su righe `tenant_id = corrente`; sistema (`NULL`) non modificabile dal tenant
      (verificare/estendere `005`). *(§3.2)*
- [ ] Verificare/estendere `GET /field-definitions` perché unisca sistema (vertical del tenant + NULL) + righe del tenant,
      con override del tenant. *(§3.3)*
- [ ] Frontend: pagina admin "Campi personalizzati" (CrudList) sotto Amministrazione, `settings:manage`. *(§3.4)*
- [ ] Verificare che `EntityForm` mostri i nuovi campi senza altro lavoro (è il meccanismo automatico). *(§3.4)*
- [ ] Popolare gli `asset` del pack fibra con i nuovi `attributes`. *(§5)*
- [ ] Commit + push su **GitHub** a fine sessione.

---

*Fine parte 3 — 13/06/2026.*
