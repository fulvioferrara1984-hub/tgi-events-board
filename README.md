# TGI Events Board

Tabellone eventi pubblico stile aeroportuale/ferroviario per TGI Sport
Europa, alimentato da VUsage (il DB interno degli eventi broadcast).

- **Pagina live**: https://fulvioferrara1984-hub.github.io/tgi-events-board/
- **Dati**: `data/events.json`, pubblicato automaticamente da
  `publish_events_board.py` ogni volta che VUsage viene salvato (vedi il
  repository `ProductionEvents/2026-27` per gli script sorgente).
- **Colonne mostrate**: configurabili dal foglio "Display Settings" di
  VUsage_26-27.xlsx (una riga per gli eventi passati, una per i futuri).

Il codice della pagina (`index.html`, `style.css`, `app.js`) e' statico e
va modificato/pubblicato manualmente (`git push`); solo `data/events.json`
viene aggiornato dall'automazione.
