// 0.18.11 · Mandato de arriendo: la ventana trae TODAS las variables del documento editables (propietario, inmueble, condiciones) y las
// guarda en su origen (la ficha de la propiedad y de la persona); la firma es opcional (se puede descargar el PDF). Con el servidor
// simulado (PF_MOCK): PDF mínimo y operación inventada.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfma-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfma-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
  try {
    await w.setViewportSize({ width: 1480, height: 1100 });
    await w.waitForSelector('#view-agente .ag.ag-full', { timeout: 15000 });
    await w.click('#nav [data-view="inicio"]'); await w.waitForSelector('#view-inicio .hoy');
    await w.click('#view-inicio [data-do="importar"]'); await w.waitForSelector('text=Cartera actualizada', { timeout: 15000 }); await w.click('#mOk');
    let d = await call('inmoListar'); const pA = d.propiedades.find((p) => p.arriendo);
    await call('inmoPropGuardar', { id: pA.id, venta: false, arriendo: true });
    const vin = (pA.vinculos || []).find((v) => v.rol === 'propietario'); const base = d.personas.find((x) => x.id === vin.personaId);
    const dueno = await call('inmoPerGuardar', { ...base, email: '', profesion: '', direccion: '' });   // el propietario de la ficha, sin correo: así se ve que se completa en la ventana
    await w.evaluate((id) => window.Inmo.abrirFicha(id), pA.id); await w.waitForSelector('.im-ficha');
    await w.evaluate((x) => window.Etapas.accion(x, () => {}), { propId: pA.id, id: 'mandato', pasoId: 'mandato', tipo: 'agente', t: 'Mandato firmado', paso: 'Mandato firmado', accion: 'Enviar mandato a firmar' });
    await w.waitForSelector('#maPr0Nombre', { timeout: 15000 }); ok(true, 'el paso «Mandato firmado» abre la ventana del mandato de Asset (propiedad solo de arriendo)');
    ok(await w.inputValue('#maPr0Nombre') === dueno.nombre && await w.inputValue('#maPr0Rut') === dueno.rut, 'trae al propietario de la ficha');
    for (const id of ['maPr0Nac', 'maPr0Civil', 'maPr0Prof', 'maPr0Dom', 'maPr0Email', 'maPr0Tel', 'maRol', 'maSupTotal', 'maSupUtil', 'maCanon', 'maMoneda', 'maPublicar', 'maExclusivo', 'maMascotas', 'maGarantia', 'maOtras'])
      ok(!!(await w.$('#' + id)), 'se edita aquí: #' + id);
    ok(await w.locator('#mOk').isDisabled(), 'sin el correo del propietario no se puede enviar a firmar (pero sí descargar)');
    // completar todo en la ventana y guardar
    await w.fill('#maPr0Email', 'lucia@correo.cl'); await w.fill('#maPr0Prof', 'ingeniera'); await w.fill('#maPr0Dom', 'Av. Siempre Viva 742, Providencia');
    await w.fill('#maRol', '1234-56'); await w.fill('#maSupTotal', '92'); await w.fill('#maSupUtil', '85'); await w.fill('#maCanon', '28'); await w.fill('#maGarantia', '2'); await w.fill('#maOtras', 'Sin fumadores');
    await w.click('#maExclusivo'); await w.selectOption('#maMascotas', 'si');
    ok(await w.locator('#mOk').isDisabled(), 'con cambios sin guardar no se envía');
    await w.click('#maGuardar'); await w.waitForFunction(() => document.querySelector('#modalCard')?.textContent.includes('Todo guardado'), null, { timeout: 15000 });
    ok(true, '«Guardar y actualizar PDF» guarda y deja «Todo guardado»');
    d = await call('inmoListar'); const p = d.propiedades.find((x) => x.id === pA.id); const per = d.personas.find((x) => x.id === dueno.id);
    ok(p.rol === '1234-56' && p.supTotal === 92 && p.supUtil === 85 && p.precioArriendo?.valor === 28, 'rol, superficies y canon quedaron en la ficha de la propiedad');
    ok(p.ficha?.exclusividad === true && p.ficha?.mesesGarantia === 2 && p.ficha?.mascotas === true && p.ficha?.condicionesMandato === 'Sin fumadores', 'exclusividad, garantía, mascotas y otras condiciones quedaron en la ficha');
    ok(per.email === 'lucia@correo.cl' && per.profesion === 'ingeniera' && /Siempre Viva/.test(per.direccion), 'los datos del propietario quedaron en su ficha de persona');
    ok(!(await w.locator('#mOk').isDisabled()), 'con todo guardado y el correo ya se puede enviar a firmar');
    await w.click('#maMas'); ok(!!(await w.$('#maDescargar')), 'el menú «⋯» ofrece descargar el PDF (firmar es opcional)'); await w.keyboard.press('Escape');
    ok(errs.length === 0, 'sin errores de JavaScript: ' + errs.join(' | '));
    console.log('OK mandato de arriendo');
  } catch (e) { await w.screenshot({ path: path.resolve(__dirname, 'ma-error.png') }).catch(() => {}); console.error(e.message, errs); process.exitCode = 1; }
  await app.close();
})();
