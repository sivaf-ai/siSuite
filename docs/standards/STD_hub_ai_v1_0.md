# STD — Hub AI (un'unica icona per tutte le funzioni AI)

**Versione:** 1.0.0 · **Stato:** Normativo (interno siSuite, candidato a standard aziendale) · **Livello:** A (concetti neutri; UI nei binding)

> Come si espongono le **funzioni AI** in una lista/maschera: **una sola icona** (la "stella" AI) che apre un **hub** con tutte le funzioni intelligenti. Mai icone-AI multiple sparse in toolbar. Vale per qualunque stack.
> `⟨termine generico⟩`; esempi *(siSuite)*. Corrisponde alla regola **G-4-bis** di `docs/STANDARD_siSuite.md` e al principio AI-First (`sivaf-standards/ai/01_ai_first_principles.md`).

---

## 1. Principio

Ogni lista/maschera espone **una sola affordance AI**: l'**icona stella** (slot Azioni AI). Premendola si apre un **hub** che raccoglie **tutte** le funzioni AI disponibili per quel contesto. Quando nasce una nuova funzione AI, **entra nell'hub**, non aggiunge una nuova icona.

**Perché:** l'AI deve avere **un solo punto di accesso riconoscibile** e scalabile. Più icone-stella ("Filtro intelligente", "Trova doppioni", domani "Riepiloga"…) confondono e sporcano la toolbar; l'utente non sa quale sia "l'AI".

---

## 2. Comportamento

- **Toolbar:** una sola icona AI (stella), con hint/tooltip.
- **Clic:**
  - se per quel contesto esiste **più di una** funzione AI → si apre l'**hub** (popup centrato) con l'**elenco delle funzioni** (icona + nome + breve descrizione); l'utente sceglie;
  - se esiste **solo** la funzione base (di norma il *Filtro intelligente*) → la stella la apre **direttamente** (niente clic in più per il caso comune).
- Ogni funzione, una volta scelta, apre la propria interfaccia (un pannello, un dialog, un wizard…).

**Estendibilità (neutro):** la lista/maschera **dichiara** le funzioni AI extra; il componente lista le raccoglie automaticamente sotto la stella.
> *(siSuite)* `EntityList` ha la prop `aiActions` (funzioni extra oltre al Filtro intelligente). La stella apre l'hub se `aiActions` è valorizzato, altrimenti il Filtro.

---

## 3. Funzioni AI tipiche dell'hub (esempi)
- **Filtro intelligente** (base, presente quasi ovunque): l'utente **scrive o detta a voce** in linguaggio naturale → l'AI traduce in condizioni di filtro; rifinibili a mano. *(siSuite: pannello AI + builder manuale.)*
- **Trova doppioni**: individua e unisce record duplicati. *(siSuite: dedup Soggetti.)*
- *(future / per-dominio)* Riepiloga selezione · Estrai da documento · Suggerisci classificazione · Compila campi da testo · Spiega/Racconta. **Tutte** vivono nell'hub.

---

## 4. Regole (tassative)
- **Una sola icona AI** per lista/maschera. **Mai** una seconda stella in toolbar per un'altra funzione AI.
- Le funzioni AI extra si raccolgono **sotto la stella** (hub), non come icone separate.
- L'hub è un **popup centrato** in-app (mai popup nativi), con icona + nome + descrizione per voce.
- **AI-first preservato:** lo slot AI è presente su ogni entità; lo strato deterministico resta la fonte di verità ("l'AI propone, il deterministico conferma").
- Hint/tooltip sull'icona stella (e su ogni voce dell'hub).

---

## 5. Definition of Done (nuova funzione AI)
1. Aggiunta come **voce dell'hub** del contesto pertinente (non come nuova icona).
2. Apertura dell'hub solo se ci sono ≥2 funzioni; altrimenti la stella apre direttamente la base.
3. Interfaccia in-app (pannello/dialog), nessun popup nativo.
4. Funziona anche **senza chiave AI** dove ha senso un fallback deterministico (vedi AI-First); altrimenti messaggio chiaro.
5. Test: dalla stella si raggiungono **tutte** le funzioni AI del contesto; nessuna seconda icona-stella presente.

---

## 6. Binding (il COME)
Componente hub, prop di dichiarazione delle funzioni, integrazione col gateway AI e col fallback → nei binding di stack. Questo doc è il **cosa**.
