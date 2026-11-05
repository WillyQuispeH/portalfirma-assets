// 0.16.14 · Ficha completa por bloques: lo clave según el tipo (el N° de depto en un departamento no puede faltar),
// el avance de la captación por bloque, el formulario por pestañas y el propietario que entra al CRM al tener RUT.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'pffi-'))}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'pffi-db-')), PF_NO_TOURS: '1' } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
  try {
    await w.setViewportSize({ width: 1480, height: 960 }); await w.waitForSelector('#view-agente .ag.ag-full', { timeout: 15000 });
    const p = await call('inmoPropGuardar', { titulo: 'Depto en Ñuñoa', tipo: 'departamento', venta: true, precioVenta: { valor: 5200, moneda: 'UF' }, comuna: 'Ñuñoa', direccion: 'Irarrázaval 2401' });
    let f = await call('inmoFicha', p.id); const es = f.bloques.find((b) => b.id === 'esencial');
    ok(!es.listo && es.faltanClave.includes('N° de departamento, oficina o local') && f.siguiente === 'esencial', 'en un departamento el N° de depto es clave y falta: lo esencial no está listo');
    const casa = await call('inmoPropGuardar', { titulo: 'Casa', tipo: 'casa', venta: true, precioVenta: { valor: 9000, moneda: 'UF' }, comuna: 'La Reina', direccion: 'Talinay 1000' });
    const fc = await call('inmoFicha', casa.id); ok(!fc.bloques[0].faltanClave.includes('N° de departamento, oficina o local') && fc.bloques[1].faltanClave.includes('Superficie de terreno o total (m²)'), 'en una casa no se pide N° de depto, pero sí la superficie de terreno');
    // pasos de la captación por bloque
    const et = await call('etPasos', { propId: p.id, ambito: 'captacion' }); const ids = et.etapas[0].pasos.map((x) => x.id);
    ok(['datos', 'portal', 'legal', 'mandato', 'equip', 'fotos', 'comovisitar', 'publicada'].every((x) => ids.includes(x)) && /N° de departamento/.test(et.etapas[0].pasos[0].d), 'la captación tiene un paso por bloque y dice qué falta de lo esencial');
    // formulario por pestañas
    await w.evaluate((id) => window.FichaBloques.abrir(id), p.id); await w.waitForSelector('.fb-tabs .fb-tab');
    ok((await w.$$('.fb-tab')).length === 5 && await w.$('.fb-falta #fb_unidad'), 'la ficha completa abre en «Lo esencial» con el N° de depto marcado como faltante');
    await w.fill('#fb_unidad', '504'); await w.fill('#fb_propietarioNombre', 'Ana Rojas'); await w.fill('#fb_propietarioCelular', '+56911112222');
    await w.click('.fb-tab[data-t="portal"]'); await w.waitForSelector('#fb_pisoUnidad');
    f = await call('inmoFicha', p.id); ok(f.bloques[0].listo && f.prop.unidad === '504', 'al cambiar de pestaña se guarda: lo esencial queda listo con el depto 504');
    await w.fill('#fb_pisoUnidad', '5'); await w.fill('#fb_orientacion', 'Norte'); await w.fill('#fb_dormitorios', '2'); await w.fill('#fb_banos', '2'); await w.fill('#fb_supUtil', '70');
    await w.fill('#fb_estacionamientos', '1'); await w.fill('#fb_bodegas', '1'); await w.fill('#fb_gastosComunes', '120000');
    await w.click('.fb-tab[data-t="equip"]'); await w.waitForSelector('.fb-chip');
    await w.click('.fb-chip[data-b="piscina"]'); await w.click('.fb-chip[data-b="gimnasio"]');
    await w.click('.fb-tab[data-t="legal"]'); await w.waitForSelector('#fb_propietarioRut');
    await w.fill('#fb_propietarioRut', '11.111.111-1'); await w.fill('#fb_propietarioEmail', 'ana@correo.cl'); await w.fill('#fb_rol', '1234-56'); await w.selectOption('#fb_exclusividad', 'si');
    await w.click('#fbOk'); await w.waitForTimeout(500);
    f = await call('inmoFicha', p.id);
    ok(f.bloques[1].listo && f.prop.ficha.pisoUnidad === 5 && f.prop.ficha.orientacion === 'Norte' && f.prop.ficha.piscina === true && f.prop.ficha.gimnasio === true, 'portales listo; el equipamiento marcado queda guardado (piscina y gimnasio)');
    const per = (await call('inmoListar')).personas.find((x) => /Ana Rojas/.test(x.nombre));
    ok(per && f.prop.vinculos.some((v) => v.rol === 'propietario' && v.personaId === per.id) && f.bloques[2].listo, 'con nombre y RUT el propietario entra al CRM y queda vinculado; propietario y legal listo');
    const et2 = await call('etPasos', { propId: p.id, ambito: 'captacion' }); const est = Object.fromEntries(et2.etapas[0].pasos.map((x) => [x.id, x.e]));
    ok(est.datos === 'ok' && est.portal === 'ok' && est.legal === 'ok' && est.equip === 'ok' && est.comovisitar !== 'ok', 'la captación marca los bloques completos y deja pendiente «Visita y publicación»');
    // lo que cuenta el corredor (voz o WhatsApp) se lleva a los campos de la ficha
    const d = await call('inmoPropGuardar', { titulo: 'Oficina', tipo: 'oficina', arriendo: true, precioArriendo: { valor: 30, moneda: 'UF' }, comuna: 'Providencia', direccion: 'Andrés Bello 2457' });
    const r = await call('inmoCompletarFicha', d.id, 'Es la oficina 1203, piso 12, orientación oriente, sin bodega, 1 estacionamiento, tiene gimnasio, no se permiten mascotas.');
    ok(r.ficha.prop.unidad === '1203' && r.ficha.prop.ficha.pisoUnidad === 12 && r.ficha.prop.ficha.orientacion === 'Oriente' && r.ficha.prop.bodegas === 0 && r.ficha.prop.ficha.gimnasio === true, 'un dictado libre completa la ficha: N° de oficina, piso, orientación, bodega y gimnasio');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK ficha');
  } catch (er) { console.error(er.message); await w.screenshot({ path: path.resolve(__dirname, 'ficha-error.png') }).catch(() => {}); process.exitCode = 1; } finally { await app.close(); }
})();
