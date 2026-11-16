// 0.18.10 · Carta oferta de un negocio: el paso «Carta oferta» abre una ventana con los datos del oferente y de la oferta
// (editables, se guardan en la persona y en el negocio) y el PDF; solo se envía a firmar con todo guardado, y la operación
// queda ligada a la etapa del negocio. Con el servidor simulado (PF_MOCK): PDF mínimo y operación inventada.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfco-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfco-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir, PF_NO_TOURS: '1' } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const txt = (s) => w.textContent(s).then((t) => (t || '').replace(/\s+/g, ' '));
  const shot = (n) => w.screenshot({ path: path.resolve(__dirname, n) });
  const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
  try {
    await w.setViewportSize({ width: 1480, height: 980 });
    await w.waitForSelector('#view-agente .ag.ag-full', { timeout: 15000 });
    await w.click('#nav [data-view="inicio"]'); await w.waitForSelector('#view-inicio .hoy');
    await w.click('#view-inicio [data-do="importar"]'); await w.waitForSelector('text=Cartera actualizada', { timeout: 15000 }); await w.click('#mOk');
    const d = await call('inmoListar'); const pA = d.propiedades.find((p) => p.arriendo);
    const c = await call('inmoPerGuardar', { nombre: 'Matías Serrano', rut: '12.345.678-5', email: 'matias@correo.cl', telefono: '', roles: ['arrendatario'] });
    const n = await call('negGuardar', { tipo: 'arriendo', propId: pA.id, clienteId: c.id });
    const paso = { negocioId: n.id, propId: pA.id, id: 'carta', pasoId: 'carta', tipo: 'firma', etapaFirma: 'reserva', t: 'Carta oferta', paso: 'Carta oferta', accion: 'Enviar carta oferta a firmar' };

    // el paso se llama «Carta oferta» y todavía no hay documentos
    const pasos0 = await call('etPasos', { negocioId: n.id }); const p0 = pasos0.etapas.flatMap((e) => e.pasos).find((x) => x.id === 'carta');
    ok(p0 && p0.t === 'Carta oferta', 'el paso se llama «Carta oferta» (sin «firmada»)');
    await w.evaluate((x) => window.Etapas.accion(x, () => {}), paso);
    await w.waitForSelector('#pasoEnviar'); ok(/Ver la carta y enviarla a firmar/.test(await txt('#pasoEnviar')), 'sin cartas enviadas, el paso ofrece «Ver la carta y enviarla a firmar»');
    await w.click('#pasoEnviar'); await w.waitForSelector('#coNombre', { timeout: 15000 });
    ok(await w.inputValue('#coNombre') === 'Matías Serrano' && await w.inputValue('#coEmail') === 'matias@correo.cl' && await w.inputValue('#coVigencia') === '5', 'la ventana trae al arrendatario del negocio y la vigencia por defecto');
    await shot('co1-carta.png');

    // sin guardar no se puede enviar; lo editado queda en la persona y en el negocio
    await w.fill('#coMonto', '650.000'); await w.selectOption('#coMoneda', 'CLP'); await w.fill('#coGarantia', '1 mes de renta'); await w.fill('#coPlazo', '12 meses'); await w.fill('#coVigencia', '7'); await w.fill('#coCond', 'Entrega con pintura reciente.');
    await w.fill('#coTel', '+56 9 5555 1234');
    ok(await w.isDisabled('#mOk'), 'con cambios sin guardar no se puede enviar a firmar'); await w.click('#coGuardar');
    await w.waitForFunction(() => /Todo guardado/.test(document.querySelector('#modalCard')?.textContent || ''), null, { timeout: 15000 });
    const ng = await call('negObtener', n.id); const per = (await call('inmoListar')).personas.find((x) => x.id === c.id);
    ok(ng.valor?.valor === 650000 && ng.valor.moneda === 'CLP' && ng.oferta?.garantia === '1 mes de renta' && ng.oferta.plazo === '12 meses' && ng.oferta.vigencia === '7' && /pintura/.test(ng.oferta.condiciones), 'el monto y las condiciones de la oferta quedaron guardados en el negocio');
    ok(/5555 1234/.test(per.telefono), 'el teléfono editado quedó guardado en la persona del CRM');
    ok(!(await w.isDisabled('#mOk')), 'con todo guardado ya se puede enviar'); await w.click('#mOk');
    await w.waitForFunction(() => /Carta oferta nº \d+ enviada a firmar/.test(document.querySelector('#toast')?.textContent || ''), null, { timeout: 15000 });

    // la operación queda ligada a la etapa del negocio y el paso queda esperando la firma
    const ng2 = await call('negObtener', n.id);
    ok(ng2.firmas?.oferta?.operacion && ng2.firmas.oferta.estado === 'en_firma' && !ng2.firmas.reserva, 'la operación quedó ligada a la firma «oferta» del negocio (no a una etapa del embudo), en firma');
    const pasos1 = await call('etPasos', { negocioId: n.id }); const p1 = pasos1.etapas.flatMap((e) => e.pasos).find((x) => x.id === 'carta');
    ok(p1.e === 'pend' && p1.q === 'otro', 'el paso «Carta oferta» queda esperando la firma');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK carta oferta');
  } catch (er) { console.error(er.message); await shot('carta-oferta-error.png').catch(() => {}); process.exitCode = 1; }
  await app.close();
})();
