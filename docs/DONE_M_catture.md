# DONE — Blocco M · Catture → storico su EntityList v2

Data: 17/06/2026.

## Frontend
- `pages/CapturePage.tsx`: lo **Storico catture** (prima `IonList` di righe) è ora un `EntityList` (`CaptureHistory`): viste per stato (Tutte/In attesa/Proposte/Applicate/Rifiutate) con conteggi (filtro client-side), ricerca nel testo, righe pulite a 2 livelli senza icone-azione, click riga → riapre la proposta AI. Rimossi import inutilizzati (`IonList`/`IonLabel`/`Loading`).
- Il **composer di cattura** (textarea + voce + Estrai + Proposta AI) resta invariato: è il cuore del Blocco F (CaptureBarAI), che lo rifinisce end-to-end.

## Test
- Typecheck frontend pulito. (Endpoint `/captures` invariato.)

## Nota
- Le viste/ricerca sono client-side (inbox piccola). Se la lista crescesse, spostare il filtro server-side come per le altre liste.
