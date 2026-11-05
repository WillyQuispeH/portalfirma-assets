// Finanzas (React): comisiones ganadas, en curso y perdidas, por corredor (usuario de Asset), con filtros y perfil.
// Requiere el bundle compilado: yarn build:ui
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };

(async () => {
  const raiz = path.join(__dirname, '..');
  if (!fs.existsSync(path.join(raiz, 'src/renderer/react/react-ui.js'))) throw new Error('Falta el bundle: corre «yarn build:ui» antes');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-fin-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${path.join(tmp, 'ud')}`], cwd: raiz, env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: path.join(tmp, 'inmo') } });
  const w = await app.firstWindow(); const errs = [];
  w.on('pageerror', (e) => errs.push(e.message)); w.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
  const txt = (s) => w.innerText(s).then((t) => (t || '').replace(/\s+/g, ' '));
  const abrir = async () => { await w.click('#nav [data-view="finanzas"]'); await w.waitForSelector('.rx-fin .ng-kpis'); };
  try {
    await w.setViewportSize({ width: 1700, height: 900 }) // bajo 1600px la pestaña Finanzas se oculta (styles.css);
    await w.waitForSelector('#view-agente .ag.ag-full', { timeout: 15000 });

    await abrir();
    ok(await w.isVisible('#view-finanzas'), 'la pestaña Finanzas abre la pantalla React');
    ok(await w.evaluate(() => document.querySelector('#nav [data-view="finanzas"]').classList.contains('active')), 'la pestaña queda marcada');
    ok(/No hay negocios/.test(await txt('#view-finanzas')), 'sin negocios lo dice');

    // datos: dos corredores, venta ganada (2% de UF 10.000), arriendo en curso (monto fijo), uno perdido y uno sin comisión
    // los corredores son usuarios de Asset (en modo de prueba, del simulado de src/asset.js)
    const ana = await call('usrCrear', { nombre: 'Ana Rivas', telefono: '+56955550001', email: 'ana@x.cl', clave: 'clave-ana-123' });
    const beto = await call('usrCrear', { nombre: 'Beto Soto', telefono: '+56955550002', email: 'beto@x.cl', clave: 'clave-beto-123' });
    const cli = await call('inmoPerGuardar', { nombre: 'Cliente Uno', email: 'c1@correo.cl', roles: ['interesado'] });
    const pV = await call('inmoPropGuardar', { titulo: 'Casa La Reina', tipo: 'casa', venta: true, direccion: 'Larraín 6000', comuna: 'La Reina' });
    const pA = await call('inmoPropGuardar', { titulo: 'Depto Ñuñoa', tipo: 'departamento', arriendo: true, direccion: 'Irarrázaval 100', comuna: 'Ñuñoa' });
    const pP = await call('inmoPropGuardar', { titulo: 'Oficina Centro', tipo: 'oficina', venta: true, direccion: 'Huérfanos 1', comuna: 'Santiago' });
    const pS = await call('inmoPropGuardar', { titulo: 'Sitio Colina', tipo: 'sitio', venta: true, direccion: 'Camino 1', comuna: 'Colina' });
    const nV = await call('negGuardar', { tipo: 'venta', propId: pV.id, clienteId: cli.id, valor: { valor: 10000, moneda: 'UF' }, comision: { tipo: '%', valor: 2 } });
    const nA = await call('negGuardar', { tipo: 'arriendo', propId: pA.id, clienteId: cli.id, valor: { valor: 600000, moneda: 'CLP' }, comision: { tipo: 'monto', valor: 300000 } });
    const nP = await call('negGuardar', { tipo: 'venta', propId: pP.id, clienteId: cli.id, valor: { valor: 5000, moneda: 'UF' }, comision: { tipo: '%', valor: 2 } });
    await call('negGuardar', { tipo: 'venta', propId: pS.id, clienteId: cli.id });
    await call('negCorredor', nV.id, ana.id); await call('negCorredor', nA.id, beto.id);
    await call('negCerrar', nV.id, 'ganado'); await call('negCerrar', nP.id, 'perdido', 'El cliente desistió');

    await w.click('#nav [data-view="inicio"]'); await abrir(); // se vuelve a montar con los datos nuevos
    const kpis = await txt('.rx-fin .ng-kpis');
    ok(/UF 200 ganada/.test(kpis), 'comisión ganada este mes: 2% de UF 10.000');
    ok(/\$300\.000 en curso/.test(kpis), 'comisión en curso: el arriendo con monto fijo');
    ok(/UF 100 perdida/.test(kpis), 'comisión perdida: el negocio que se cayó');
    ok(/1 negocios sin comisión/.test(kpis), 'avisa el negocio sin comisión definida');

    const porCor = await txt('.rx-fin .im-box:has(h3:text("Por corredor"))');
    ok(/Ana Rivas 1 UF 200 —/.test(porCor) && /Beto Soto 1 — \$300\.000/.test(porCor), 'el administrador ve la comisión por corredor');
    ok((await w.$$('.rx-fin-det tbody tr')).length === 4, 'el detalle lista los 4 negocios');

    await w.click('.rx-fin .im-seg button:text("Arriendos")');
    ok((await w.$$('.rx-fin-det tbody tr')).length === 1 && /— ganada/.test(await txt('.rx-fin .ng-kpis')), 'el filtro Arriendos deja solo el arriendo');
    await w.click('.rx-fin .im-seg button:text("Todos")');

    await w.click(`.rx-fin-det tr[data-id="${nV.id}"]`); await w.waitForSelector('#view-negocios:not(.hidden) .ng-ficha');
    ok(/Casa La Reina/.test(await txt('#view-negocios')), 'al hacer clic en una fila se abre el negocio');

    // corredor: solo sus negocios, sin la tabla por corredor
    await call('assetIngresar', 'beto@x.cl', 'clave-beto-123'); await w.evaluate(async () => { window.PERFIL = await window.api('accEstado'); });
    await abrir();
    ok(/de tus negocios/.test(await txt('.rx-fin .im-head')) && !(await w.$('.rx-fin .im-box h3:text("Por corredor")')), 'el corredor ve «tus negocios», sin la tabla por corredor');
    ok((await w.$$('.rx-fin-det tbody tr')).length === 1 && /\$300\.000 en curso/.test(await txt('.rx-fin .ng-kpis')), 'y solo su negocio');

    const relevantes = errs.filter((e) => /Content Security Policy|ReactUI|react|Finanzas/i.test(e));
    ok(relevantes.length === 0, 'sin errores de React ni de CSP' + (relevantes.length ? ': ' + relevantes.join(' | ') : ''));
    console.log('\nfinanzas-e2e: todo bien');
  } finally { await app.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exit(1); });
