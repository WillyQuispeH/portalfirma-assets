# Herramientas de prueba (no son pruebas)

Scripts auxiliares que antes estaban sueltos en `test/` y los barridos de pruebas tomaban como pruebas fallidas.

- `make-contrato-fixture.js`, `make-reader-fixture.js`: generan `test/fixtures/contrato_prueba.pdf` y `lector.pdf` (`npx electron test/herramientas/<script>.js`).
- `_temas.js`: capturas de la app en cada tema.
- `_esc-render.js`, `_landing-capture.js`, `_red-render.js`, `_shot.js`: capturas antiguas de la versión Studio (rutas de Linux `/home/claude/...`); se dejan como referencia.
