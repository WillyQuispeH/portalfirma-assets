// 0.18.11 · En la ficha del negocio, toda la tarjeta de un paso abre su detalle (no solo el título); los botones de adentro
// (marcar logrado, más opciones) siguen haciendo lo suyo, y en el paso actual van a la derecha: el secundario primero y el principal al final.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfpc-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfpc-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
  try {
    await w.setViewportSize({ width: 1480, height: 1000 });
    await w.waitForSelector('#view-agente .ag.ag-full', { timeout: 15000 });
    await w.click('#nav [data-view="inicio"]'); await w.waitForSelector('#view-inicio .hoy');
    await w.click('#view-inicio [data-do="importar"]'); await w.waitForSelector('text=Cartera actualizada', { timeout: 15000 }); await w.click('#mOk');
    const d = await call('inmoListar'); const pA = d.propiedades.find((p) => p.arriendo);
    const per = await call('inmoPerGuardar', { nombre: 'Ana Visitante', rut: '12.345.678-5', email: 'ana@correo.cl', telefono: '', roles: ['interesado'] });
    const n = await call('negGuardar', { tipo: 'arriendo', propId: pA.id, clienteId: per.id });
    await w.evaluate((id) => window.Negocios.abrirNegocio(id), n.id); await w.waitForSelector('#ngEt .et-col');
    // un paso que no es el actual: clic en un lugar vacío de la tarjeta (no en el título)
    const tarjeta = w.locator('#ngEt .et-col:not(.act) .et-p').first();
    const caja = await tarjeta.boundingBox();
    await w.mouse.click(caja.x + caja.width - 60, caja.y + caja.height / 2);   // a la derecha del título, sin tocar el botón de logrado
    await w.waitForSelector('#modalCard, .mdl-cab', { timeout: 8000 }); ok(true, 'clic en la tarjeta (fuera del título) abre el detalle del paso');
    await w.evaluate(() => window.closeModal());
    // en el paso actual, los botones a la derecha: «Más opciones» primero y «Marcar logrado» al final
    const pm = await w.locator('#ngEt .et-pa .et-pm2').boundingBox(); const lg = await w.locator('#ngEt .et-pa .azul').boundingBox(); const card = await w.locator('#ngEt .et-pa').boundingBox();
    ok(pm.x < lg.x && lg.x + lg.width > card.x + card.width - 40, 'los botones del paso actual van a la derecha, con el principal al final');
    ok(/Agendar visita/.test(await w.textContent('#ngEt .et-pa .azul')), 'en el paso actual, el botón principal es su acción (Agendar visita) y no «Marcar logrado»');
    // el botón de logrado no abre el detalle
    await w.locator('#ngEt .et-col:not(.act) .et-p [data-lg]').first().click(); await w.waitForTimeout(500);
    ok(!(await w.isVisible('.mdl-cab')), 'el botón de logrado hace solo lo suyo (no abre el detalle)');
    ok(errs.length === 0, 'sin errores de JavaScript: ' + errs.join(' | '));
    console.log('OK tarjeta de paso');
  } catch (e) { await w.screenshot({ path: path.resolve(__dirname, 'pc-error.png') }).catch(() => {}); console.error(e.message, errs); process.exitCode = 1; }
  await app.close();
})();
