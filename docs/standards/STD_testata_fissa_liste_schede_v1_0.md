# STD — Testata fissa di liste e schede (sticky, niente buco)

**Versione:** 1.0.0 · **Stato:** Normativo (interno siSuite, candidato a standard aziendale) · **Livello:** A (concetti neutri; CSS/layout nei binding)

> Come si comporta la parte superiore di una **lista** o di una **scheda** durante lo scroll: la testata (titolo + toolbar / barra azioni) resta **fissa e A FILO** del bordo; scorrono **solo i contenuti**. **Mai** uno spazio sopra la barra dove i dati traspaiono. Vale per qualunque stack.
> `⟨termine generico⟩`; esempi *(siSuite)*. Corrisponde alle regole **L-3 / L-3-bis / C-2 / U-1** di `docs/STANDARD_siSuite.md`.

---

## 1. Principio

In ogni lista e in ogni scheda, la **testata operativa** (ciò che serve sempre: titolo/viste, toolbar/azioni, barra Salva/Annulla) resta **ancorata in alto** mentre l'utente scorre. A scorrere è **solo il contenuto** (le righe della lista, o i campi della scheda).

E la testata sta **a filo** del bordo superiore dell'area: **non** deve esserci un margine/“buco” sopra la barra in cui, scrollando, compaiano pezzi di righe tra la barra del titolo e il menu dell'applicazione.

**Perché:** le azioni (filtra/ordina/esporta/nuovo, o salva/annulla) devono essere **sempre raggiungibili** senza tornare in cima; e il "buco" con righe che spuntano sopra la barra è visivamente sbagliato e poco professionale (errore ricorrente se non codificato).

---

## 2. Liste

Sopra le righe, **fissi durante lo scroll**: titolo + viste/contatori, **toolbar** (ricerca, filtra/ordina/colonne/report/AI, azioni di selezione, "Nuovo +"), ed eventuale barra "filtro attivo".
- Scorrono **solo le righe**.
- La testata è **a filo** del bordo superiore dell'area di scroll, a tutta larghezza (sfondo pieno) → nessuna riga visibile sopra di essa.

> *(siSuite)* implementato **centralmente** nel componente lista (`EntityList`): testata avvolta in `.dsx-head` `position: sticky; top: 0`, sfondo pagina, layout "flush" (niente padding-top dello scroll). Vale per tutte le liste senza toccare le singole pagine.

---

## 3. Schede (CRUD / object page)

L'header della scheda è **sticky e opaco, a filo**, con **solo le azioni essenziali** (di norma Salva/Annulla) in alto, e:
- **label nel bordo** dei campi (non label fluttuante che si sovrappone — vedi standard design system);
- validazione **dentro** il campo (campo obbligatorio in evidenza);
- eventuali **tabelle correlate come tab** in fondo alla scheda (non tab-bar a livello pagina).
- Nessun "buco" sopra la barra Salva/Annulla.

> *(siSuite)* `ObjectPage` (`.op-head` sticky, bleed orizzontale, top:0) + `Page` in layout flush per schede e liste.

---

## 4. Meccanismo (neutro)

1. L'area di contenuto **non** ha padding-top che stacchi la testata dal bordo (layout *flush*).
2. La testata è `sticky` ancorata in alto, con **sfondo pieno** a tutta larghezza del contenuto (bleed orizzontale se serve a coprire i margini laterali).
3. Solo il contenitore delle righe/campi scorre sotto la testata fissa.
4. Hint/tooltip su ogni icona della testata (vedi regola hint), perché la barra è sempre visibile e va capita al volo.

---

## 5. Regole (tassative)
- Testata (titolo + toolbar/azioni) **fissa** durante lo scroll; scorre **solo** il contenuto.
- Testata **a filo** del bordo superiore: **MAI** un buco dove le righe compaiano tra la barra e il menu dell'app.
- Vale **sia per le liste sia per le schede**, in modo uniforme.
- Quando si crea una nuova lista/scheda, **non reintrodurre** il gap (usare il layout flush standard del componente).

---

## 6. Definition of Done
1. Scrollando una lista: titolo + toolbar restano fissi; nessuna riga visibile sopra la barra.
2. Scrollando una scheda lunga: header Salva/Annulla resta a filo; nessun buco.
3. Le icone della testata mostrano l'hint.
4. Verificato su desktop e mobile (su mobile le icone mostrano l'etichetta).

---

## 7. Binding (il COME)
CSS `sticky`/flush, classi della testata lista/scheda, gestione del padding dell'area di scroll → nei binding di stack. Questo doc è il **cosa**.
