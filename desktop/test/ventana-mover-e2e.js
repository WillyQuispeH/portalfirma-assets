// Las ventanas (modales) se mueven arrastrando su encabezado, como en Windows: siguen al puntero, no se salen de la pantalla,
// doble clic las devuelve al centro y al cerrarla y abrirla de nuevo vuelve a aparecer centrada.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfvm-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfvm-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir, PF_NO_TOURS: '1' } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const caja = () => w.locator('#modalCard').boundingBox();
  try {
    await w.setViewportSize({ width: 1280, height: 860 });
    await w.waitForSelector('#view-agente .ag.ag-full', { timeout: 15000 });
    await w.click('#nav [data-view="inicio"]'); await w.waitForSelector('#view-inicio .hoy');
    await w.click('#view-inicio [data-do="importar"]'); await w.waitForSelector('text=Cartera actualizada', { timeout: 15000 });
    await w.waitForSelector('#modalCard .mdl-cab');
    const a = await caja(); const cab = await w.locator('#modalCard .mdl-cab').boundingBox();
    const x0 = cab.x + cab.width / 2; const y0 = cab.y + 12;
    await w.mouse.move(x0, y0); await w.mouse.down(); await w.mouse.move(x0 - 300, y0 + 120, { steps: 6 });
    ok(await w.evaluate(() => document.querySelector('#modalCard').classList.contains('arrastrando')), 'mientras se arrastra, la ventana lo indica (fondo más claro)');
    await w.mouse.up();
    const b = await caja(); ok(Math.abs(b.x - (a.x - 300)) <= 2 && Math.abs(b.y - (a.y + 120)) <= 2, 'la ventana sigue al puntero (se movió 300 a la izquierda y 120 abajo)');
    await w.mouse.move(b.x + b.width / 2, b.y + 12); await w.mouse.down(); await w.mouse.move(5000, 5000, { steps: 4 }); await w.mouse.up();
    const c = await caja(); ok(c.x < 1280 - 80 && c.y < 860 - 40 && c.x + c.width > 80, 'no se puede sacar de la pantalla: el encabezado siempre queda a la vista');
    await w.mouse.dblclick(c.x + 30, c.y + 12);
    const d = await caja(); ok(Math.abs(d.x - a.x) <= 2 && Math.abs(d.y - a.y) <= 2, 'doble clic en el encabezado la devuelve al centro');
    await w.mouse.move(d.x + d.width / 2, d.y + 12); await w.mouse.down(); await w.mouse.move(d.x + d.width / 2 + 200, d.y + 90, { steps: 4 }); await w.mouse.up();
    await w.click('#mOk');
    ok(await w.evaluate(() => { const c = document.querySelector('#modalCard'); return !c.style.translate && !c.dataset.dx; }), 'al cerrarla se olvida la posición: la próxima ventana aparece centrada');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK ventanas movibles');
  } catch (er) { console.error(er.message); await w.screenshot({ path: path.resolve(__dirname, 'mover-error.png') }).catch(() => {}); process.exitCode = 1; }
  await app.close();
})();
