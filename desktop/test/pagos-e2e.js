// 0.18.10 · Pagos del arriendo (solo se REGISTRAN: monto, fecha y comprobante): la reserva mueve el negocio a «Reserva»; garantía y
// primer mes son dos pagos; la comisión tiene fecha de facturación a 30 días, factura y pago, y al pagarse cierra el negocio.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfpg-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfpg-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir, PF_NO_TOURS: '1' } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const txt = (s) => w.textContent(s).then((t) => (t || '').replace(/\s+/g, ' '));
  const shot = (n) => w.screenshot({ path: path.resolve(__dirname, n) });
  const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
  const paso = async (negocioId, id) => (await call('etPasos', { negocioId })).etapas.flatMap((e) => e.pasos).find((x) => x.id === id);
  const abrir = (x) => w.evaluate((p) => window.Etapas.accion(p, () => {}), x);
  const hoy = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  try {
    await w.setViewportSize({ width: 1480, height: 980 });
    await w.waitForSelector('#view-agente .ag.ag-full', { timeout: 15000 });
    await w.click('#nav [data-view="inicio"]'); await w.waitForSelector('#view-inicio .hoy');
    await w.click('#view-inicio [data-do="importar"]'); await w.waitForSelector('text=Cartera actualizada', { timeout: 15000 }); await w.click('#mOk');
    const d = await call('inmoListar'); const pA = d.propiedades.find((p) => p.arriendo);
    const c = await call('inmoPerGuardar', { nombre: 'Matías Serrano', rut: '12.345.678-5', email: 'matias@correo.cl', roles: ['arrendatario'] });
    const n = await call('negGuardar', { tipo: 'arriendo', propId: pA.id, clienteId: c.id, valor: { valor: 650000, moneda: 'CLP' }, oferta: { garantia: '1 mes de renta' }, comision: { tipo: '%', valor: 50 } });
    const base = { negocioId: n.id, propId: pA.id, tipo: 'pago' };

    // ---- reserva
    const xr = { ...base, id: 'reserva_pago', pasoId: 'reserva_pago', t: 'Reserva pagada', paso: 'Reserva pagada', accion: 'Registrar el pago' };
    ok(['pend', 'todo'].includes((await paso(n.id, 'reserva_pago')).e), 'sin pago registrado, «Reserva pagada» no está lograda');
    await abrir(xr); await w.waitForSelector('#pgRegistrar-reserva'); await w.click('#pgRegistrar-reserva');
    await w.fill('#pgMonto', '150.000'); await w.click('#pgGuardar');
    await w.waitForFunction(() => /Registrado/.test(document.querySelector('#pgPanel')?.textContent || ''), null, { timeout: 10000 });
    const n1 = await call('negObtener', n.id);
    ok(n1.ciclo.pagos.reserva.monto === 150000 && n1.ciclo.pagos.reserva.fecha === hoy && n1.ciclo.pagos.reserva.medio === 'transferencia', 'la reserva queda registrada con monto, fecha y medio');
    ok((await paso(n.id, 'reserva_pago')).e === 'ok', 'registrar la reserva deja el paso logrado');
    ok(n1.etapa === 'reserva', 'al pagar la reserva, el negocio pasa a la etapa «Reserva» (y la propiedad queda reservada)');
    await shot('pg1-reserva.png');

    // ---- garantía y primer mes: son dos pagos
    await w.evaluate(() => window.closeModal());
    const xg = { ...base, id: 'garantia_mes', pasoId: 'garantia_mes', t: 'Garantía y primer mes recibidos', paso: 'Garantía y primer mes recibidos', accion: 'Registrar los pagos' };
    await abrir(xg); await w.waitForSelector('#pgRegistrar-garantia');
    await w.click('#pgRegistrar-garantia'); ok(await w.inputValue('#pgMonto') === '650.000', 'la garantía propone el monto pactado (1 mes de renta)'); await w.click('#pgGuardar');
    await w.waitForFunction(() => document.querySelectorAll('#pgPanel [data-pago]').length === 1, null, { timeout: 10000 });
    let pg = await paso(n.id, 'garantia_mes'); ok(pg.e === 'pend' && /primer mes/.test(pg.d), 'con solo la garantía, el paso dice que falta el primer mes');
    await w.click('#pgRegistrar-primerMes'); await w.click('#pgGuardar');
    await w.waitForFunction(() => document.querySelectorAll('#pgPanel [data-pago]').length === 2, null, { timeout: 10000 });
    ok((await paso(n.id, 'garantia_mes')).e === 'ok', 'con la garantía y el primer mes registrados, el paso queda logrado');

    // ---- comisión: fecha de facturación a 30 días, factura y pago (cierra el negocio)
    await w.evaluate(() => window.closeModal());
    const xc = { ...base, id: 'comision', pasoId: 'comision', t: 'Comisión facturada y cobrada', paso: 'Comisión facturada y cobrada', accion: 'Facturar y registrar el pago' };
    await abrir(xc); await w.waitForSelector('#pgFactura');
    const en30 = new Date(Date.now() + 30 * 864e5); const f30 = new Date(en30.getTime() - en30.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
    await w.waitForFunction(() => /Se factura el/.test(document.querySelector('#pgPanel')?.textContent || ''));
    ok(new RegExp(f30.slice(8, 10) + '/' + f30.slice(5, 7) + '/' + f30.slice(0, 4)).test(await txt('#pgPanel')) && /30 días desde la entrega/.test(await txt('#pgPanel')), 'la fecha de facturación sale sola a 30 días de la entrega');
    await w.click('#pgFactura'); await w.fill('#pgFacturaN', 'F-1234'); await w.fill('#pgFacturaMonto', '325.000'); await w.click('#pgFacturaGuardar');
    await w.waitForFunction(() => /Factura nº F-1234/.test(document.querySelector('#pgPanel')?.textContent || ''), null, { timeout: 10000 });
    pg = await paso(n.id, 'comision'); ok(pg.e === 'pend' && pg.q === 'otro' && /F-1234/.test(pg.d), 'con la factura emitida, el paso queda esperando el pago de la comisión');
    await w.click('#pgRegistrar-comisionPago'); ok(await w.inputValue('#pgMonto') === '325.000', 'el pago propone el monto de la factura'); await w.click('#pgGuardar');
    await w.waitForFunction(() => /Pago de la comisión/.test(document.querySelector('#pgPanel')?.textContent || '') && document.querySelectorAll('#pgPanel [data-pago="comisionPago"]').length === 1, null, { timeout: 10000 });
    const n2 = await call('negObtener', n.id);
    ok((await paso(n.id, 'comision')).e === 'ok' && n2.estado === 'ganado', 'registrar el pago de la comisión deja el paso logrado y cierra el negocio como ganado');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK pagos del arriendo');
  } catch (er) { console.error(er.message); await shot('pagos-error.png').catch(() => {}); process.exitCode = 1; }
  await app.close();
})();
