# docs/standards — Standard tematici siSuite (interni, candidati aziendali)

Standard di prodotto **dettagliati e neutri** (il "cosa", riusabili su altri sistemi), tenuti **per ora solo dentro siSuite**. Quando consolidati, sono candidati a salire nel repo aziendale `sivaf-standards/` (fonte di verità cross-sistema).

| Documento | Tema | Regola in `STANDARD_siSuite.md` |
|---|---|---|
| [STD_selezione_riferimenti_picker_lookup_v1_0.md](STD_selezione_riferimenti_picker_lookup_v1_0.md) | Campi che referenziano un'entità → **picker a lente**; classificazioni → **lookup configurabile**. Mai testo libero/combo ad-hoc. | D-0, D-1/D-2 |
| [STD_hub_ai_v1_0.md](STD_hub_ai_v1_0.md) | **Una sola icona AI** (stella) = hub di tutte le funzioni AI. Mai stelle multiple. | G-4-bis |
| [STD_testata_fissa_liste_schede_v1_0.md](STD_testata_fissa_liste_schede_v1_0.md) | Testata (titolo+toolbar / Salva-Annulla) **fissa e a filo** durante lo scroll; scorre solo il contenuto; niente buco. | L-3, L-3-bis, C-2 |

**Riferimenti correlati**
- Raccolta consolidata di tutte le regole siSuite: [`../STANDARD_siSuite.md`](../STANDARD_siSuite.md).
- Standard aziendale **Soft-delete & Archiviazione** (già promosso a cross-sistema): `sivaf-standards/data/02_soft_delete_archiviazione.md`; dettaglio implementativo siSuite: [`../analisi/GESTIONE_soft_delete_v1.md`](../analisi/GESTIONE_soft_delete_v1.md).
- Standard **entità ad albero** (cross-sistema): `sivaf-standards/tree/STANDARD_entita_albero_v1_0_01_05.md`; analisi siSuite: [`../analisi/GESTIONE_ALBERO_categorie_v1.md`](../analisi/GESTIONE_ALBERO_categorie_v1.md).

> Stile: documenti **neutri** (concetti portabili, `⟨termini generici⟩`) con esempi concreti marcati *(siSuite)* — così si copiano/promuovono senza riscriverli.
