// 0.18.10 · Etapas de un ARRIENDO: Comercialización (6 pasos), Cierre del arriendo (7) y Postarriendo (3, los avisa Asset);
// la venta sigue con sus dos etapas. Marcar la comisión cobrada cierra el negocio como ganado.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfea-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfea-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir, PF_NO_TOURS: '1' } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
  const nombres = (r) => r.etapas.map((e) => e.nombre);
  const pasosDe = (r, i) => r.etapas[i].pasos.map((x) => x.t);
  try {
    await w.setViewportSize({ width: 1480, height: 980 });
    await w.waitForSelector('#view-agente .ag.ag-full', { timeout: 15000 });
    await w.click('#nav [data-view="inicio"]'); await w.waitForSelector('#view-inicio .hoy');
    await w.click('#view-inicio [data-do="importar"]'); await w.waitForSelector('text=Cartera actualizada', { timeout: 15000 }); await w.click('#mOk');
    const d = await call('inmoListar'); const pA = d.propiedades.find((p) => p.arriendo); const pV = d.propiedades.find((p) => p.venta && p.id !== pA.id);
    const c = await call('inmoPerGuardar', { nombre: 'Matías Serrano', rut: '12.345.678-5', email: 'matias@correo.cl', roles: ['arrendatario'] });
    const nA = await call('negGuardar', { tipo: 'arriendo', propId: pA.id, clienteId: c.id });
    const nV = await call('negGuardar', { tipo: 'venta', propId: pV.id, clienteId: c.id });

    const r = await call('etPasos', { negocioId: nA.id });
    ok(JSON.stringify(nombres(r)) === JSON.stringify(['Comercialización', 'Cierre del arriendo', 'Postarriendo']), 'un arriendo tiene tres etapas: Comercialización, Cierre del arriendo y Postarriendo');
    ok(JSON.stringify(pasosDe(r, 0)) === JSON.stringify(['Interesado registrado', 'Visita agendada', 'Orden de visita', 'Acta de visita', 'Carta oferta', 'Aceptación del propietario']), 'Comercialización: interesado, visita, orden, acta, carta oferta y aceptación del propietario');
    ok(JSON.stringify(pasosDe(r, 1)) === JSON.stringify(['Reserva pagada', 'Evaluación del arrendatario', 'Revisión del contrato', 'Contrato firmado', 'Garantía y primer mes recibidos', 'Entrega con acta e inventario', 'Comisión facturada y cobrada']), 'Cierre del arriendo: reserva, evaluación, revisión y firma del contrato, garantía y primer mes, entrega y comisión');
    ok(JSON.stringify(pasosDe(r, 2)) === JSON.stringify(['Reajustes', 'Renovación o término', 'Devolución de la garantía']), 'Postarriendo: reajustes, renovación o término y devolución de la garantía');
    ok(r.actual && r.actual.id === 'visita' && r.actual.etapa === 'Comercialización', 'el siguiente paso sale de la comercialización (el interesado ya está registrado)');
    const ids = r.etapas.flatMap((e) => e.pasos.map((x) => x.id)); ok(!ids.includes('cierre') && !ids.includes('negociacion') && !ids.includes('garantia'), 'ya no están los pasos antiguos (cierre, negociación, garantía)');

    // el paso «Acta de visita» sigue a la firma del acta de ESTE negocio (la de otro no cuenta)
    await app.evaluate((_, x) => { const inmo = global.__pfInmo; inmo.agregarFirma({ operacion: 990001, plantilla: 'Acta de visita · orden nº 7', origen: 'asset', fecha: new Date().toISOString(), estado: 'en_firma', firmantes: [{ nombre: 'Matías Serrano', rut: '12.345.678-5', personaId: x.c }], negocioId: x.n }, [x.p]); }, { c: c.id, n: nA.id, p: pA.id });
    const pa = (await call('etPasos', { negocioId: nA.id })).etapas[0].pasos.find((x) => x.id === 'acta');
    ok(pa.e === 'pend' && pa.q === 'otro' && /la firma del visitante/.test(pa.quien) && /operación 990001/.test(pa.d), 'el acta enviada a firmar deja el paso esperando la firma del visitante, con su operación');
    await app.evaluate((_, x) => { const inmo = global.__pfInmo; inmo.actualizarFirma(x.op, (f) => { f.estado = 'firmado'; f.firmado = new Date().toISOString(); }); }, { op: 990001 });
    const pb = (await call('etPasos', { negocioId: nA.id })).etapas[0].pasos.find((x) => x.id === 'acta');
    ok(pb.e === 'ok', 'cuando el visitante firma el acta, el paso «Acta de visita» queda logrado');
    // el postarriendo no es «el siguiente paso» mientras no toque
    for (const id of ['visita', 'orden', 'acta', 'carta', 'aceptacion']) await call('etMarcar', { negocioId: nA.id, paso: id, estado: 'ok' });
    for (const id of ['reserva_pago', 'evaluacion', 'revision', 'contrato', 'garantia_mes', 'entrega']) await call('etMarcar', { negocioId: nA.id, paso: id, estado: 'ok' });
    let r2 = await call('etPasos', { negocioId: nA.id });
    ok(r2.actual && r2.actual.id === 'comision', 'con todo lo anterior logrado, el siguiente paso es la comisión (no el postarriendo)');
    await call('etMarcar', { negocioId: nA.id, paso: 'comision', estado: 'ok' });
    r2 = await call('etPasos', { negocioId: nA.id });
    ok(r2.cerrado && !r2.actual, 'con la comisión cobrada no queda un «siguiente paso»: los del postarriendo los avisa Asset');
    const nA2 = await call('negObtener', nA.id);
    ok(nA2.estado === 'ganado', 'marcar la comisión cobrada cierra el negocio como ganado (y parte el postarriendo)');

    // la venta sigue como estaba
    const rv = await call('etPasos', { negocioId: nV.id });
    ok(rv.etapas.length === 2 && rv.etapas[1].nombre === 'Postventa', 'la venta sigue con sus dos etapas (comercialización y postventa)');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK etapas del arriendo');
  } catch (er) { console.error(er.message); process.exitCode = 1; }
  await app.close();
})();
