// 0.18.10 · Aceptación del propietario (arriendo): el paso muestra la oferta vigente, registra la negociación (contraoferta del
// propietario → respuesta del interesado → aceptada) y deja el negocio con las condiciones finales; además arma el mensaje de
// WhatsApp con los detalles de la oferta para el propietario.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfac-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfac-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir, PF_NO_TOURS: '1' } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const txt = (s) => w.textContent(s).then((t) => (t || '').replace(/\s+/g, ' '));
  const shot = (n) => w.screenshot({ path: path.resolve(__dirname, n) });
  const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
  const paso = async (negocioId) => (await call('etPasos', { negocioId })).etapas.flatMap((e) => e.pasos).find((x) => x.id === 'aceptacion');
  try {
    await w.setViewportSize({ width: 1480, height: 980 });
    await w.waitForSelector('#view-agente .ag.ag-full', { timeout: 15000 });
    await w.click('#nav [data-view="inicio"]'); await w.waitForSelector('#view-inicio .hoy');
    await w.click('#view-inicio [data-do="importar"]'); await w.waitForSelector('text=Cartera actualizada', { timeout: 15000 }); await w.click('#mOk');
    const d = await call('inmoListar'); const pA = d.propiedades.find((p) => p.arriendo);
    const c = await call('inmoPerGuardar', { nombre: 'Matías Serrano', rut: '12.345.678-5', email: 'matias@correo.cl', roles: ['arrendatario'] });
    const dueno = await call('inmoPerGuardar', { nombre: 'Rosa Propietaria', rut: '7.654.321-6', email: 'rosa@correo.cl', telefono: '+56 9 8888 7777', roles: ['propietario'] });
    await call('inmoVincular', pA.id, dueno.id, 'propietario');
    const n = await call('negGuardar', { tipo: 'arriendo', propId: pA.id, clienteId: c.id, valor: { valor: 650000, moneda: 'CLP' }, oferta: { garantia: '1 mes de renta', plazo: '12 meses', vigencia: '5', condiciones: 'Con mascota pequeña' } });
    const x = { negocioId: n.id, propId: pA.id, id: 'aceptacion', pasoId: 'aceptacion', tipo: 'aceptacion', t: 'Aceptación del propietario', paso: 'Aceptación del propietario', accion: 'Registrar la respuesta' };

    ok((await paso(n.id)).t === 'Aceptación del propietario' && (await paso(n.id)).e !== 'ok', 'sin respuesta, el paso «Aceptación del propietario» queda pendiente');
    await w.evaluate((p) => window.Etapas.accion(p, () => {}), x);
    await w.waitForSelector('#acPanel'); const t0 = await txt('#acPanel');
    ok(/650\.000/.test(t0) && /1 mes de renta/.test(t0) && /12 meses/.test(t0) && /mascota/.test(t0), 'muestra la oferta vigente (la de la carta oferta)');
    await shot('ac1-aceptacion.png');

    // WhatsApp al propietario: el mensaje sale armado con los detalles
    await w.click('#acWsp'); await w.waitForSelector('#acTexto');
    const msg = await w.inputValue('#acTexto');
    ok(/Rosa/.test(msg) && /650\.000/.test(msg) && /1 mes de renta/.test(msg) && /mascota/.test(msg) && /contraoferta/i.test(msg), 'el mensaje para el propietario lleva la renta, garantía, plazo y condiciones, y le pregunta si acepta o contraoferta');
    await w.getByRole('button', { name: 'Cancelar' }).first().click(); await w.waitForSelector('#acResp2');

    // el propietario hace una contraoferta
    await w.click('#acResp2'); await w.waitForSelector('#acResp');
    await w.click('#acResp [data-ac="contraoferta"]'); await w.fill('#acMonto', '700.000'); await w.fill('#acNota', 'Quiere más renta'); await w.click('#acGuardar');
    await w.waitForFunction(() => /Contraoferta/.test(document.querySelector('#acPanel')?.textContent || ''), null, { timeout: 10000 });
    let p1 = await paso(n.id);
    ok(p1.e === 'pend' && p1.q === 'tu' && /contraoferta/i.test(p1.d), 'tras la contraoferta, el paso queda pendiente: falta la respuesta del interesado');
    ok((await call('negObtener', n.id)).valor.valor === 650000, 'mientras no se acepte, el monto del negocio no cambia');

    // el interesado acepta la contraoferta → aceptada, y el negocio queda con las condiciones finales
    await w.click('#acResp2'); await w.waitForSelector('#acResp');
    ok(/Acepta la contraoferta/.test(await txt('#acResp')) && /Desiste/.test(await txt('#acResp')), 'la respuesta del interesado ofrece aceptar la contraoferta, hacer otra oferta o desistir');
    await w.click('#acResp [data-ac="acepta"]'); await w.click('#acGuardar');
    await w.waitForFunction(() => /Aceptada/.test(document.querySelector('#acPanel')?.textContent || ''), null, { timeout: 10000 });
    const p2 = await paso(n.id); const n2 = await call('negObtener', n.id);
    ok(p2.e === 'ok', 'aceptada: el paso queda logrado');
    ok(n2.valor.valor === 700000 && n2.aceptacion.rondas.length === 2 && n2.aceptacion.rondas[1].tipo === 'aceptada', 'el negocio quedó con la renta acordada (700.000) y la negociación registrada (contraoferta + aceptación)');

    // rechazo: pide motivo y se puede volver a negociar
    const n3 = await call('negGuardar', { tipo: 'arriendo', propId: pA.id, clienteId: c.id, valor: { valor: 500000, moneda: 'CLP' } });
    await w.evaluate((p) => window.closeModal(), null);
    await w.evaluate((p) => window.Etapas.accion(p, () => {}), { ...x, negocioId: n3.id });
    await w.waitForSelector('#acPanel'); await w.click('#acResp2'); await w.waitForSelector('#acResp'); await w.click('#acResp [data-ac="rechaza"]'); await w.click('#acGuardar');
    ok(/Escribe el motivo/.test(await txt('#acError')), 'rechazar pide el motivo');
    await w.fill('#acNota', 'No acepta mascotas'); await w.click('#acGuardar');
    await w.waitForFunction(() => /Rechazada/.test(document.querySelector('#acPanel')?.textContent || ''), null, { timeout: 10000 });
    ok((await paso(n3.id)).e === 'fail', 'rechazada: el paso queda no logrado, con su motivo');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK aceptación');
  } catch (er) { console.error(er.message); await shot('aceptacion-error.png').catch(() => {}); process.exitCode = 1; }
  await app.close();
})();
