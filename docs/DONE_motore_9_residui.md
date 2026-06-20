# DONE_motore_9 — Residui (§9 del PIANO_motore)

Chiusura dei residui di rifinitura dopo il completamento del motore (blocchi 1→8).

## Fatto
- **Saldo assenze su DELETE** ✅ — `DELETE /absences/:id`: se l'assenza era **approvata**, ripristina `absence_balance.used` (`GREATEST(0, used - quantità)`) prima di cancellare. Niente più saldi sovrastimati.
- **Conteggi delle viste (chip) che rispettano il filtro attivo** ✅ — i conteggi sui chip ora applicano la stessa `buildFilter` (ricerca **+ filtro Gruppo/AI**) su: **companies, materials, resources, work-orders, engagements** (aggiunti i join necessari per i campi-filtro). Bonus: corretta un'interpolazione diretta di `engagementId` nel conteggio work-orders → ora **param-bind** (no injection).
- **i18n header colonne** ✅ — nuovo namespace **`cols.*`** (it/en/es-AR) + cablaggio degli `header`/`sub` delle colonne su **Soggetti, Articoli, Commesse, Ordini, Risorse, Asset**. Le tabelle cambiano lingua anche nelle intestazioni. Traduzioni standard (es-AR incluso): **adattabili su tua segnalazione** (terminologia).

## Non-blocking (alternativa funzionante già in essere)
- **Documenti magazzino come DetailPage-archetipo** — oggi il **drawer** di creazione (testata + righe, salva bozza / salva e conferma) e l'azione **Conferma** in lista sono **pienamente funzionanti**, con le transizioni di stato draft→confirmed intatte. La versione "scheda-archetipo dedicata" (vedere/editare una bozza esistente in una pagina invece che nel drawer) è un refactor estetico a basso valore/rischio sul flusso esistente: rimandato, non blocca nulla.
- **Render Report server-side / PDF nativo** — oggi l'anteprima è **HTML vero** e l'export avviene via **Stampa / Salva come PDF del browser** (apre il documento in finestra e lancia il print). Un endpoint `/reports/render` server-side (PDF generato dal server) è un'aggiunta opzionale; la strada attuale copre stampa e PDF.

## Verifica
- `tsc --noEmit` FE+BE+shared pulito; **77 test backend verdi**; migrazioni **001→039**; backend health 200; tutto pushato su GitHub.

## Stato finale
**`PIANO_motore_liste_e_magazzino` completato** (blocchi 1→8 + residui §9). Le uniche due voci aperte sono rifiniture con alternativa funzionante già attiva. La terminologia delle traduzioni (cols.*/glossario) è l'unica cosa che potrà richiedere un tuo passaggio di revisione.
