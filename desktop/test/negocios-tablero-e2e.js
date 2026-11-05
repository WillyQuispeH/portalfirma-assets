// Tablero de Negocios (React): Ventas / Arriendos (y que se recuerde), búsqueda, «Cerrados», resumen,
// ir a la ficha (src/renderer/negocios.js, mismo contenedor) y volver. El arrastre lo prueba negocios-e2e.
// Requiere el bundle compilado: yarn build:ui
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };

(async () => {
  const raiz = path.join(__dirname, '..');
  if (!fs.existsSync(path.join(raiz, 'src/renderer/react/react-ui.js'))) throw new Error('Falta el bundle: corre «yarn build:ui» antes');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-ngt-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${path.join(tmp, 'ud')}`], cwd: raiz, env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: path.join(tmp, 'inmo') } });
  const w = await app.firstWindow(); const errs = [];
  w.on('pageerror', (e) => errs.push(e.message)); w.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
  const txt = (s) => w.innerText(s).then((t) => (t || '').replace(/\s+/g, ' '));
  const tarjetas = () => w.$$eval('#view-negocios .ng-card', (x) => x.length);
  const tablero = async () => { await w.click('#nav [data-view="negocios"]'); await w.waitForSelector('#view-negocios:not(.hidden) #ngTipo'); await w.waitForTimeout(400); };
  try {
    await w.setViewportSize({ width: 1600, height: 950 });
    await w.waitForFunction(() => window.Negocios && window.ReactUI, null, { timeout: 15000 }); await w.waitForTimeout(500);

    const cli = await call('inmoPerGuardar', { nombre: 'Paula Fuentes', rut: '12.345.678-5', email: 'paula@correo.cl', roles: ['comprador'] });
    const pV = await call('inmoPropGuardar', { titulo: 'Casa Vitacura', tipo: 'casa', venta: true, direccion: 'Kennedy 1', comuna: 'Vitacura' });
    const pV2 = await call('inmoPropGuardar', { titulo: 'Depto Providencia', tipo: 'departamento', venta: true, direccion: 'Lyon 1', comuna: 'Providencia' });
    const pA = await call('inmoPropGuardar', { titulo: 'Depto Ñuñoa', tipo: 'departamento', arriendo: true, direccion: 'Irarrázaval 1', comuna: 'Ñuñoa' });
    const nV = await call('negGuardar', { tipo: 'venta', propId: pV.id, clienteId: cli.id, valor: { valor: 9000, moneda: 'UF' }, comision: { tipo: '%', valor: 2 }, proximaAccion: { texto: 'Llamar', fecha: '2020-01-01' } });
    const nV2 = await call('negGuardar', { tipo: 'venta', propId: pV2.id, clienteId: cli.id });
    await call('negCerrar', nV2.id, 'perdido', 'Compró otra');
    const nA = await call('negGuardar', { tipo: 'arriendo', propId: pA.id, clienteId: cli.id }); // el último que se movió

    await tablero();
    ok(await w.getAttribute('#ngTipo [data-t="arriendo"]', 'aria-selected') === 'true' && await tarjetas() === 1, 'abre donde está lo último que se movió (Arriendos)');
    ok(/Arriendos 1/.test(await txt('#ngTipo')) && /Ventas 1/.test(await txt('#ngTipo')), 'cuenta los abiertos de cada tipo');
    ok((await w.$$('#view-negocios .ng-col')).length >= 5 && !!(await w.$(`.ng-col[data-e="interes"] .ng-card[data-n="${nA.id}"]`)), 'columnas por etapa, el negocio en «Interesado»');

    await w.click('#ngTipo [data-t="venta"]'); await w.waitForSelector(`.ng-card[data-n="${nV.id}"]`);
    const kpis = await txt('#view-negocios .ng-kpis');
    ok(/1 negocios abiertos/.test(kpis) && /1 acciones vencidas/.test(kpis) && /UF 180 comisión en curso/.test(kpis), 'resumen: abiertos, vencidas y comisión (2% de UF 9.000)');
    ok(await w.evaluate((id) => document.querySelector(`.ng-card[data-n="${id}"]`).classList.contains('vencida'), nV.id), 'la tarjeta con acción vencida se marca');

    // ir a la ficha y volver (mismo contenedor), varias veces; se queda en Ventas porque se eligió a mano
    for (let i = 0; i < 3; i++) {
      await w.click(`.ng-card[data-n="${nV.id}"]`); await w.waitForSelector('#view-negocios .ng-ficha #ngBack');
      await w.click('#ngBack'); await w.waitForSelector('#view-negocios #ngTipo');
    }
    await w.waitForSelector(`.ng-card[data-n="${nV.id}"]`);
    ok(await w.getAttribute('#ngTipo [data-t="venta"]', 'aria-selected') === 'true', 'ficha y volver (3 veces): sigue en Ventas');

    await w.click('#ngVer [data-v="cerrados"]'); await w.waitForSelector('#view-negocios .ng-cerrados');
    ok(await tarjetas() === 1 && /Perdido: Compró otra/.test(await txt('#view-negocios .ng-cerrados')), '«Cerrados» muestra el perdido con su motivo');
    await w.click('#ngVer [data-v="abiertos"]'); await w.waitForSelector('#view-negocios .ng-board');

    await w.fill('#ngQ', 'zzz'); await w.waitForFunction(() => document.querySelectorAll('#view-negocios .ng-card').length === 0);
    await w.fill('#ngQ', 'vitacura'); await w.waitForFunction(() => document.querySelectorAll('#view-negocios .ng-card').length === 1);
    ok(true, 'la búsqueda filtra las tarjetas');
    await w.fill('#ngQ', '');

    await w.click('#ngNew'); await w.waitForSelector('#modalCard #mOk'); await w.click('#mCancel');
    ok(true, '«Nuevo negocio» abre el formulario');

    await w.evaluate(() => window.Negocios.abrir({ tipo: 'arriendo' })); await w.waitForSelector(`.ng-card[data-n="${nA.id}"]`);
    ok(true, 'Negocios.abrir({ tipo }) abre en ese tipo');
    await w.evaluate(() => window.AssetRefrescar()); await w.waitForSelector(`.ng-card[data-n="${nA.id}"]`);
    ok(true, 'AssetRefrescar vuelve a montar el tablero');

    const relevantes = errs.filter((e) => /Content Security Policy|ReactUI|react|removeChild|insertBefore|not a child/i.test(e));
    ok(relevantes.length === 0, 'sin errores de React ni de CSP' + (relevantes.length ? ': ' + relevantes.join(' | ') : ''));
    console.log('\nnegocios-tablero-e2e: todo bien');
  } finally { await app.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exit(1); });
