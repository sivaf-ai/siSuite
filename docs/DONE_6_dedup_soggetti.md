# DONE_6 — Deduplica Soggetti (flagship)

> Blocco 6 del PIANO. Trova i doppioni nell'anagrafica Soggetti e ne propone la fusione; l'apply è **deterministico, transazionale, idempotente** e ri-punta tutte le FK archiviando (mai cancellando) l'assorbito. Pattern propone→review→apply (come CaptureBarAI): l'AI non scrive mai.

## Scelta di design
La **proposta è deterministica** (normalizzazione nome: lowercase, niente diacritici/punteggiatura, rimozione suffissi societari srl/spa/snc/sas/ltd/llc…), **niente chiave AI** in questa fase. Motivo: l'azione critica (la fusione che tocca molte FK) deve essere affidabile e testata; la proposta AI-assistita è un fast-follow che riusa lo stesso flusso review→apply. (Anche il PIANO mette l'arricchimento AI come fast-follow.)

## Correzione importante allo schema (FK)
Il PIANO elencava **8** FK verso `company`; il Blocco 0 ne aveva verificate **9**; verificando sul **DB live** (`\d company` → "Referenced by") ne risultano **11**. Ne mancavano due in entrambi i conteggi precedenti:
```
app_user.company_id                     SET NULL
asset.company_id                        RESTRICT
company_role.company_id                 CASCADE   (UNIQUE company_id,role)
company_contact.company_id              CASCADE
engagement.company_id                   RESTRICT
price_list_override.company_id          CASCADE
site.company_id                         CASCADE   ← mancava
stock_document.company_id               SET NULL  ← mancava
stock_serial_unit.installed_company_id  SET NULL
subcontract_line.company_id             RESTRICT
work_order.principal_company_id         SET NULL  (UNIQUE tenant,principal_company_id,principal_order_ref)
```

## Backend (`routes/companyDedup.ts`, registrato)
- `POST /companies/dedup/scan` — gate `company:read`. Ritorna `{ groups: DedupGroupDto[] }`: gruppi di ≥2 soggetti non archiviati con chiave-nome normalizzata uguale; superstite suggerito (più relazioni, a parità più vecchio), assorbiti, motivo. **Nessuna scrittura.**
- `POST /companies/merge` — gate `company:delete`. Body `{ survivorId, absorbedIds[] }`. In **una transazione** (`withRls`): valida (stesso tenant, non archiviati, survivor ∉ absorbed); ri-punta le **11** FK assorbito→superstite; gestisce i **conflitti UNIQUE** (company_role: elimina dai assorbiti i ruoli già presenti sul superstite prima del re-point; work_order: re-point solo dove non collide su `principal_order_ref`, le righe in conflitto restano sull'assorbito che viene archiviato → FK sempre valida, nessun orfano); `archived_at = now()` sugli assorbiti. **Idempotente** (riesecuzione = no-op). Ritorna `MergeResultDto { survivorId, absorbed, repointed{tabella:righe} }`. Conflitti→409, input incoerente→400.
- DTO in `@sisuite/shared`: `DedupCandidateDto`, `DedupGroupDto`, `mergeCompaniesSchema`, `MergeCompaniesInput`, `MergeResultDto`.

## Test (`test/companyMerge.test.ts`, DB-backed) — **PASS 2/2**
Seed: tenant + 2 company (A superstite, B assorbito) + FK popolate (engagement, company_role, asset, work_order) → merge A←B → asserisce: tutte le FK puntano ad A, nessuna riga punta più a B, B archiviato, A intatto, conflitto UNIQUE su ruolo gestito; **riesecuzione idempotente** (0 assorbiti, stato invariato). Cleanup seed in afterAll.

## Frontend (`ui/DedupDialog.tsx`, wired su Soggetti)
Azione "**Trova doppioni**" (✨, solo con permesso delete) → modale: scan, per ogni gruppo scegli **superstite** (radio) e i soggetti da **fondere** (checkbox), con motivo; "**Fondi N nel superstite**" applica e rimuove il gruppo, poi ricarica la lista. Niente popup nativi; toast di esito.

## Verifica
- `tsc --noEmit` backend+shared+frontend: pulito. `vitest companyMerge`: **2/2**.
- Backend riavviato; route `/companies/dedup/scan` e `/companies/merge` registrate (401 senza auth = presenti).
- **Da fare sul PC test**: inserisci 2–3 doppioni (es. "Rossi Mario" e "Mario Rossi") → Soggetti › Trova doppioni → conferma fusione → il superstite eredita commesse/ordini/seriali, l'assorbito è archiviato (sparisce dalle liste, non cancellato).

## Aperto (fast-follow)
- Proposta **AI-assistita** (riconoscere doppioni non banali: "Rossi Mario" vs "Mario Rossi SRL") riusando il flusso review→apply, con chiave lato server + quota per tenant.
- Arricchimento anagrafica.

*Fine Blocco 6.*
