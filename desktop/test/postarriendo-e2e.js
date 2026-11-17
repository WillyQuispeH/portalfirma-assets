// Postarriendo del arriendo: avisos de reajuste (IPC), renovación o término y devolución de la garantía, a partir de las condiciones del contrato.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfpa-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfpa-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir, PF_NO_TOURS: '1' } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const shot = (n) => w.screenshot({ path: path.resolve(__dirname, n) });
  const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
  const paso = async (negocioId, id) => (await call('etPasos', { negocioId })).etapas.flatMap((e) => e.pasos).find((x) => x.id === id);
  const abrir = (x) => w.evaluate((p) => window.Etapas.accion(p, () => {}), x);
  try {
    await w.setViewportSize({ width: 1480, height: 980 });
    await w.waitForSelector('#view-agente .ag.ag-full', { timeout: 15000 });
    await w.click('#nav [data-view="inicio"]'); await w.waitForSelector('#view-inicio .hoy');
    await w.click('#view-inicio [data-do="importar"]'); await w.waitForSelector('text=Cartera actualizada', { timeout: 15000 }); await w.click('#mOk');
    const d = await call('inmoListar'); const pA = d.propiedades.find((p) => p.arriendo);
    const c = await call('inmoPerGuardar', { nombre: 'Matías Serrano', rut: '12.345.678-5', email: 'matias@correo.cl', telefono: '+56 9 8765 4321', roles: ['arrendatario'] });
    const n = await call('negGuardar', { tipo: 'arriendo', propId: pA.id, clienteId: c.id, valor: { valor: 650000, moneda: 'CLP' } });
    ok(['todo', 'pend'].includes((await paso(n.id, 'reajustes')).e), 'sin condiciones del contrato, no hay avisos');
    const ini = new Date(); ini.setMonth(ini.getMonth() - 6); ini.setDate(ini.getDate() + 10);   // el reajuste semestral cae en 10 días
    await call('negGuardar', { id: n.id, ciclo: { contrato: { datos: { inicio: iso(ini), plazoMeses: 12, reajuste: 'ipc_semestral', avisoDias: 60 } }, pagos: { garantia: { monto: 650000, moneda: 'CLP', fecha: iso(ini), medio: 'transferencia', nota: '', comprobante: null } }, entrega: { fecha: iso(ini), inventario: [{ espacio: 'Living', estado: 'bueno', nota: '' }] } } });
    let p = await paso(n.id, 'reajustes'); ok(p.e === 'pend' && p.q === 'tu' && /IPC/.test(p.d), 'el reajuste de los 6 meses se avisa cuando faltan menos de 30 días');
    let h = await call('etHoy'); ok(!h.tetoca.concat(h.atencion).some((i) => i.pasoId === 'reajustes'), 'con el negocio abierto, el aviso de reajuste no está en «Hoy»');
    await call('negCerrar', n.id, 'ganado');
    h = await call('etHoy'); const it = h.tetoca.find((i) => i.pasoId === 'reajustes' && i.negocioId === n.id);
    ok(it && it.aviso && /Postarriendo/.test(it.etapa) && it.tipo === 'post', 'cerrado el negocio, el aviso de reajuste aparece en «Hoy» en «Te toca»');
    await w.evaluate(() => window.Agente.vista()); await w.click('#nav [data-view="inicio"]'); await w.waitForFunction(() => /Reajustes/.test(document.querySelector('#view-inicio')?.textContent || ''), null, { timeout: 10000 }); await shot('pa-hoy.png');
    ok(true, 'la pantalla «Hoy» muestra el aviso «Reajustes» del arriendo ganado');
    const x = (id, t) => ({ negocioId: n.id, propId: pA.id, tipo: 'post', id, pasoId: id, t, paso: t, accion: 'Abrir' });
    await abrir(x('reajustes', 'Reajustes')); await w.waitForSelector('#paRegistrar');
    // aviso por WhatsApp (en pruebas no sale ningún mensaje real): sale armado, se ve y solo se envía al confirmar
    await w.click('#paAvisar'); await w.waitForSelector('#paTexto'); const txt1 = await w.inputValue('#paTexto');
    ok(/Matías/.test(txt1) && /reajustar la renta/.test(txt1) && /IPC/.test(txt1), 'el aviso de reajuste sale armado para el arrendatario con los datos del contrato');
    ok((await call('negObtener', n.id)).ciclo.postarriendo?.avisos === undefined, 'preparar el aviso no envía nada ni lo registra');
    await app.evaluate(({ shell }) => { shell.openExternal = async () => {}; });   // sin abrir nada de verdad
    await w.click('[aria-label="Otras formas de enviarlo"]'); await w.click('text=Abrir en WhatsApp (yo lo envío)'); await w.waitForSelector('#paPanel [data-aviso="0"]', { timeout: 10000 });
    const av = (await call('negObtener', n.id)).ciclo.postarriendo.avisos; ok(av.length === 1 && av[0].tipo === 'reajuste' && av[0].destino === 'arrendatario' && av[0].automatico === false, 'al abrirlo en WhatsApp queda registrado qué aviso, a quién y cuándo');
    await w.click('#paRegistrar');
    await w.fill('#paIpc', '3'); await w.waitForFunction(() => document.querySelector('#paRenta')?.value === '669.500', null, { timeout: 5000 });
    await w.click('#paGuardar'); await w.waitForSelector('#paPanel [data-reajuste="0"]', { timeout: 10000 });
    const n1 = await call('negObtener', n.id); ok(n1.ciclo.postarriendo.rentaActual === 669500 && n1.ciclo.postarriendo.reajustes[0].ipc === 3, 'el reajuste queda registrado con IPC y renta nueva');
    p = await paso(n.id, 'reajustes'); ok(p.e === 'ok' && /1 reajuste/.test(p.d), 'con el reajuste registrado y sin más dentro del plazo, el paso queda logrado');
    h = await call('etHoy'); ok(!h.tetoca.concat(h.atencion).some((i) => i.pasoId === 'reajustes'), 'registrado el reajuste, el aviso sale de «Hoy»'); await shot('pa1.png'); await w.evaluate(() => window.closeModal());

    ok((await paso(n.id, 'renovacion')).e === 'todo', 'el aviso de renovación aún no toca (lejos del límite)');
    // el contrato vence pronto: se acerca el límite de aviso
    const ini2 = new Date(); ini2.setMonth(ini2.getMonth() - 11); await call('negGuardar', { id: n.id, ciclo: { ...n1.ciclo, contrato: { datos: { ...n1.ciclo.contrato.datos, inicio: iso(ini2) } } } });
    p = await paso(n.id, 'renovacion'); ok(p.e === 'pend' || p.e === 'fail', 'cerca del límite de aviso, la renovación pasa a pendiente');
    await abrir(x('renovacion', 'Renovación o término')); await w.waitForSelector('#paRenovar'); await w.click('#paRenovar'); await w.fill('#paMeses', '12'); await w.click('#paDecidir');
    await w.waitForSelector('#paPanel [data-decision="renovar"]', { timeout: 10000 });
    ok((await paso(n.id, 'renovacion')).e === 'ok', 'al decidir la renovación, el paso queda logrado'); await w.evaluate(() => window.closeModal());

    ok((await paso(n.id, 'devolucion')).e === 'todo', 'la devolución espera al término del contrato');
    const n2 = await call('negObtener', n.id); const ini3 = new Date(); ini3.setMonth(ini3.getMonth() - 25);
    await call('negGuardar', { id: n.id, ciclo: { ...n2.ciclo, contrato: { datos: { ...n2.ciclo.contrato.datos, inicio: iso(ini3) } } } });
    ok(['pend', 'fail'].includes((await paso(n.id, 'devolucion')).e), 'terminado el contrato, la devolución de la garantía pasa a pendiente');
    h = await call('etHoy'); ok(h.tetoca.concat(h.atencion).some((i) => i.pasoId === 'devolucion'), 'la devolución de la garantía también aparece en «Hoy»');
    await abrir(x('devolucion', 'Devolución de la garantía')); await w.waitForSelector('#paRegistrar'); await w.click('#paRegistrar');
    await w.fill('#paDescuento', '50.000'); ok(await w.inputValue('#paMonto') === '600.000', 'lo que se devuelve = garantía menos el descuento');
    await w.click('#paDevolver'); await w.waitForSelector('#paError'); ok(/motivo/i.test(await w.textContent('#paError')), 'un descuento exige su motivo');
    await w.fill('input[autocomplete="off"]:not([readonly]) >> nth=-1', 'Pintura de un muro'); await w.click('#paDevolver');
    await w.waitForSelector('#paPanel [data-devolucion]', { timeout: 10000 });
    const n3 = await call('negObtener', n.id); ok(n3.ciclo.postarriendo.devolucion.devuelto === 600000 && n3.ciclo.postarriendo.devolucion.descuento === 50000, 'la devolución queda registrada con el descuento');
    ok((await paso(n.id, 'devolucion')).e === 'ok', 'registrada la devolución, el paso queda logrado');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK postarriendo');
  } catch (er) { console.error(er.message); console.error(await w.evaluate(() => document.querySelector('#paError')?.textContent || '').catch(() => '')); await shot('post-error.png').catch(() => {}); process.exitCode = 1; }
  await app.close();
})();
