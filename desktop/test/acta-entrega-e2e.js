// Acta de entrega e inventario del arriendo: se llena (fecha, llaves y accesos, medidores, inventario por espacio con ítems), se guarda en el negocio (ciclo.entrega), se envía a
// firmar (simulado en PF_MOCK) ligada a «entrega_acta» (fuera del embudo). Al firmarse la propiedad queda «Arrendada» y el negocio SIGUE abierto
// (lo cierra cobrar la comisión).
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfae-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfae-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir, PF_NO_TOURS: '1' } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const shot = (n) => w.screenshot({ path: path.resolve(__dirname, n) });
  const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
  try {
    await w.setViewportSize({ width: 1480, height: 980 });
    await w.waitForSelector('#view-agente .ag.ag-full', { timeout: 15000 });
    await w.click('#nav [data-view="inicio"]'); await w.waitForSelector('#view-inicio .hoy');
    await w.click('#view-inicio [data-do="importar"]'); await w.waitForSelector('text=Cartera actualizada', { timeout: 15000 }); await w.click('#mOk');
    const d = await call('inmoListar'); const pA = d.propiedades.find((p) => p.arriendo);
    const c = await call('inmoPerGuardar', { nombre: 'Matías Serrano', rut: '12.345.678-5', email: 'matias@correo.cl', roles: ['arrendatario'] });
    const n = await call('negGuardar', { tipo: 'arriendo', propId: pA.id, clienteId: c.id, valor: { valor: 650000, moneda: 'CLP' } });
    const x = { negocioId: n.id, propId: pA.id, tipo: 'firma', id: 'entrega', pasoId: 'entrega', etapaFirma: 'entrega_acta', t: 'Entrega con acta e inventario', paso: 'Entrega con acta e inventario', accion: 'Hacer el acta de entrega' };
    await w.evaluate((p) => window.Etapas.accion(p, () => {}), x);
    await w.waitForSelector('text=Hacer el acta de entrega >> nth=-1'); await w.click('button:has-text("Hacer el acta de entrega")');
    await w.waitForSelector('#aeFecha', { timeout: 15000 });
    ok(await w.isDisabled('#mOk'), 'sin la fecha, no se puede enviar');
    await w.fill('#aeFecha', '2026-12-01'); await w.fill('#aeLlaves', '1 llave del buzón'); await w.fill('#aeAccesoCant-0', '2'); await w.fill('#aeLuzNum', '123'); await w.fill('#aeLuzLec', '4500');
    await w.click('#aeTabs [data-tab="inventario"]');
    const espacios = await w.locator('[data-espacio]').count();
    ok(espacios >= 5, 'el inventario parte con los espacios del modelo de la corredora');
    await w.click('[data-espacio="1"]'); await w.waitForSelector('#aeItemNombre-0');
    ok(await w.locator('[data-item]').count() >= 10, 'cada espacio trae los ítems habituales');
    await w.fill('#aeNota', 'Mancha en el muro'); await w.selectOption('#aeEstado', 'regular'); await w.fill('#aeItemCant-1', '4'); await w.selectOption('#aeItemEstado-1', 'malo');
    await w.click('#aeVolver'); await w.fill('#aeNuevoEspacio', 'Bodega'); await w.click('#aeAgregar'); await w.waitForSelector('#aeItemNombre-0'); await w.click('#aeVolver');
    await w.click('#aeGuardar'); await w.waitForFunction(() => /Todo guardado/.test(document.body.textContent), null, { timeout: 15000 });
    const e = (await call('negObtener', n.id)).ciclo.entrega;
    ok(e.fecha === '2026-12-01' && e.medidores.luz.lectura === '4500' && e.accesos[0].cantidad === '2' && e.inventario[1].estado === 'regular' && e.inventario[1].items[1].estado === 'malo' && e.inventario[espacios].espacio === 'Bodega', 'fecha, accesos, medidores e inventario con ítems quedan en el negocio');
    await shot('ae1.png');
    await w.click('#mOk'); await w.waitForFunction(() => !document.querySelector('#aeFecha'), null, { timeout: 15000 });
    const f = (await call('negObtener', n.id)).firmas?.entrega_acta; ok(f?.operacion && f.estado === 'en_firma', 'el acta queda enviada y ligada a «entrega_acta»');
    // firmada: la propiedad queda arrendada y el negocio sigue abierto
    await app.evaluate(async (_, { id, op }) => { const neg = global.__pfNeg; const nn = global.__pfInmo.negocios().find((z) => z.id === id); nn.firmas.entrega_acta.estado = 'firmado'; nn.firmas.entrega_acta.firmado = new Date().toISOString(); nn.firmas.entrega_acta.avanzar = true; await neg.avanzarPorFirma(id, 'entrega_acta'); }, { id: n.id, op: f.operacion });
    const n3 = await call('negObtener', n.id); const p3 = (await call('inmoListar')).propiedades.find((p) => p.id === pA.id);
    ok(n3.estado === 'abierto', 'al firmarse el acta el negocio sigue abierto (lo cierra la comisión)');
    ok(p3.estadoArriendo === 'arrendada', 'al firmarse el acta la propiedad queda «Arrendada»');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK acta de entrega');
  } catch (er) { console.error(er.message); console.error(await w.evaluate(() => document.querySelector('#aeErr')?.textContent || '').catch(() => '')); await shot('entrega-error.png').catch(() => {}); process.exitCode = 1; }
  await app.close();
})();
