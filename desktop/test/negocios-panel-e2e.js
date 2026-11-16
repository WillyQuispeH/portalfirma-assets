// Panel de brokers (Negocios › pestaña «Panel»): indicadores del mes en pesos (UF del día), proyección con lo que está
// por cerrar, «Requiere atención», próximos cierres y el detalle por broker; y que el tablero sigue igual al volver.
// Requiere el bundle compilado: yarn build:ui. Deja capturas en test/panel-claro.png y test/panel-oscuro.png.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };

(async () => {
  const raiz = path.join(__dirname, '..');
  if (!fs.existsSync(path.join(raiz, 'src/renderer/react/react-ui.js'))) throw new Error('Falta el bundle: corre «yarn build:ui» antes');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-pnb-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${path.join(tmp, 'ud')}`], cwd: raiz, env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: path.join(tmp, 'inmo') } });
  const w = await app.firstWindow(); const errs = [];
  w.on('pageerror', (e) => errs.push(e.message)); w.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
  const txt = (s) => w.innerText(s).then((t) => (t || '').replace(/\s+/g, ' '));
  try {
    await w.setViewportSize({ width: 1500, height: 950 });
    await w.waitForFunction(() => window.Negocios && window.ReactUI, null, { timeout: 15000 }); await w.waitForTimeout(500);

    ok(await call('ufHoy') === 39500, 'la UF del día llega al panel (39.500 en pruebas)');
    const cli = await call('inmoPerGuardar', { nombre: 'Paula Fuentes', rut: '12.345.678-5', email: 'paula@correo.cl', roles: ['comprador'] });
    const p1 = await call('inmoPropGuardar', { titulo: 'Casa Vitacura', tipo: 'casa', venta: true, direccion: 'Kennedy 1', comuna: 'Vitacura' });
    const p2 = await call('inmoPropGuardar', { titulo: 'Depto Ñuñoa', tipo: 'departamento', arriendo: true, direccion: 'Irarrázaval 1', comuna: 'Ñuñoa' });
    const p3 = await call('inmoPropGuardar', { titulo: 'Depto Providencia', tipo: 'departamento', venta: true, direccion: 'Lyon 1', comuna: 'Providencia' });
    // ganado este mes: 2% de UF 9.000 = UF 180 = $7.110.000
    const g = await call('negGuardar', { tipo: 'venta', propId: p1.id, clienteId: cli.id, valor: { valor: 9000, moneda: 'UF' }, comision: { tipo: '%', valor: 2 } });
    await call('negCerrar', g.id, 'ganado');
    const hoy = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
    await call('negGuardar', { id: g.id, comisionPagada: { fecha: hoy } }); // comisión pagada hoy (venta)
    // por cerrar (arriendo en «Contrato»): comisión $500.000
    const a = await call('negGuardar', { tipo: 'arriendo', propId: p2.id, clienteId: cli.id, valor: { valor: 1000000, moneda: 'CLP' }, comision: { tipo: 'monto', valor: 500000 } });
    for (const e of ['visita', 'reserva', 'evaluacion', 'contrato']) await call('negMover', a.id, e).catch(() => null);
    await call('negGuardar', { id: a.id, cierreEstimado: hoy }); // se espera cerrar este mes
    // en curso con acción vencida
    const v = await call('negGuardar', { tipo: 'venta', propId: p3.id, clienteId: cli.id, proximaAccion: { texto: 'Llamar al comprador', fecha: '2020-01-01' } });

    const yo = await call('accEstado');
    const id1 = yo.corredores[0]?.id;
    ok(!!id1, 'hay al menos un corredor en el equipo');
    const g1 = await call('metasSet', { [id1]: { facturacion: 10000000, captacion: 5 } });
    ok(g1[id1].facturacion === 10000000 && (await call('metasGet'))[id1].captacion === 5, 'las metas que define el administrador quedan guardadas');
    const n2 = await call('negListar');
    ok(n2.negocios.find((n) => n.id === g.id).comisionPagada.fecha === hoy && n2.negocios.find((n) => n.id === a.id).cierreEstimado === hoy, 'cierre estimado y comisión pagada se guardan en el negocio');
    await w.click('#nav [data-view="negocios"]'); await w.waitForSelector('#view-negocios:not(.hidden) #ngVista');
    await w.click('#ngVista [data-vi="panel"]'); await w.waitForSelector('[data-panel-brokers] .ng-kpis'); await w.waitForTimeout(500);
    ok(!(await w.$('#view-negocios #ngTipo')), 'en el Panel no se ven los filtros del tablero');
    const kpis = await txt('[data-panel-brokers] .ng-kpis');
    ok(/\$7\.110\.000 ganado en/.test(kpis) && /con IVA \$8\.460\.900/.test(kpis), 'ganado del mes en pesos (UF 180 × 39.500) y con IVA');
    ok(/\$7\.110\.000 comisión cobrada/.test(kpis), 'cobrado = la comisión que se pagó este mes');
    ok(/\$10\.000\.000 meta de facturación/.test(kpis), 'la meta sale de Configuración (suma de las metas del equipo)');
    const neg = await w.evaluate((id) => window.pf.negListar().then((r) => r.data.negocios.find((n) => n.id === id)), a.id);
    const enContrato = neg.etapa === 'contrato';
    ok(/\$7\.610\.000 proyección de cierre/.test(kpis), `proyección = ganado + abiertos con cierre estimado este mes (arriendo en ${neg.etapa})`);

    ok(/2 urgentes/.test(kpis) || /1 urgentes/.test(kpis), 'la acción vencida cuenta como urgente');
    ok(!!(await w.$('#pnbMes')) && !!(await w.$('#pnbTipo')), 'el mes y el tipo se eligen en la barra de Negocios');
    await w.click('#pnbVerPend');
    ok(/Llamar al comprador/.test(await txt('.pnb-pendientes')), 'al desplegar se ve el pendiente con su tarea');

    const brokers = await txt('.pnb-brokers');
    ok(/Arrendadores|Tus negocios/.test(brokers) && !/broker/i.test(await txt('[data-panel-brokers]')), 'sección del equipo, sin la palabra broker');
    await w.click('.pnb-broker .pnb-abrir').catch(() => null);
    await w.waitForTimeout(200);
    ok((await w.$$('.pnb-negocio')).length >= 2, 'al abrir un broker se ven sus negocios vigentes');
    await w.click('.pnb-negocio .pnb-ver'); await w.waitForTimeout(150);
    await w.screenshot({ path: path.join(__dirname, 'panel-detalle.png') });
    ok(/Etapa actual/i.test(await txt('.pnb-detalle')), 'el detalle muestra la etapa actual y los botones');

    await w.evaluate(() => { document.querySelector('[data-panel-brokers]').scrollIntoView(); window.scrollTo(0, 0); });
    await w.screenshot({ path: path.join(__dirname, 'panel-claro.png') });
    await w.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await w.waitForTimeout(200);
    await w.screenshot({ path: path.join(__dirname, 'panel-oscuro.png'), fullPage: false });
    await w.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));

    // la ficha del negocio pide el cierre estimado (y, en venta, cuándo se pagó la comisión)
    await w.evaluate((id) => window.Negocios.abrirNegocio(id), v.id); await w.waitForSelector('#ngPlCond'); await w.click('#ngPlCond'); await w.waitForSelector('#ngCierreEst');
    await w.fill('#ngCierreEst', hoy); await w.click('#ngCond'); await w.waitForTimeout(600);
    ok(!!(await w.$('#ngComPagada')) && (await call('negListar')).negocios.find((n) => n.id === v.id).cierreEstimado === hoy, 'la ficha de una venta pide el cierre estimado y la comisión pagada, y los guarda');
    await w.evaluate(() => window.Negocios.abrir?.() ); await w.click('#nav [data-view="negocios"]'); await w.waitForSelector('#ngVista');
    await w.click('#ngVista [data-vi="tablero"]'); await w.waitForSelector('#view-negocios .ng-board, #view-negocios .ng-cerrados');
    ok(!!(await w.$('#view-negocios #ngTipo')), 'al volver al Tablero está igual que antes');
    ok(!errs.length, 'sin errores en la consola' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK');
  } catch (e) { console.error(e.message); process.exitCode = 1; } finally { await app.close(); }
})();
