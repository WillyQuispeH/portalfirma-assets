// Actividad (React): días, filtros, búsqueda, «Ver más» (páginas de 60), abrir lo que se toca y volver al Inicio.
// Requiere el bundle compilado: yarn build:ui
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };

(async () => {
  const raiz = path.join(__dirname, '..');
  if (!fs.existsSync(path.join(raiz, 'src/renderer/react/react-ui.js'))) throw new Error('Falta el bundle: corre «yarn build:ui» antes');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-act-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${path.join(tmp, 'ud')}`], cwd: raiz, env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: path.join(tmp, 'inmo'), PF_START: 'inicio' } });
  const w = await app.firstWindow(); const errs = [];
  w.on('pageerror', (e) => errs.push(e.message)); w.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
  const txt = (s) => w.innerText(s).then((t) => (t || '').replace(/\s+/g, ' '));
  const filas = () => w.$$eval('#acLista .ac-it', (x) => x.length);
  const abrir = async () => { await w.evaluate(() => window.Actividad.abrir()); await w.waitForSelector('#view-actividad:not(.hidden) #acQ'); await w.waitForTimeout(300); };
  try {
    await w.setViewportSize({ width: 1400, height: 900 });
    await w.waitForFunction(() => window.Actividad && window.ReactUI && window.Inmo, null, { timeout: 15000 }); await w.waitForTimeout(500);

    await abrir();
    ok(/Aún no hay actividad/.test(await txt('#acLista')) && !(await w.$('#acMas')), 'sin movimientos lo dice y no ofrece «Ver más»');

    const prop = await call('inmoPropGuardar', { titulo: 'Casa Ñuñoa', tipo: 'casa', venta: true, direccion: 'Irarrázaval 100', comuna: 'Ñuñoa' });
    const per = await call('inmoPerGuardar', { nombre: 'José Pérez', email: 'jose@correo.cl', roles: ['comprador'] });
    const neg = await call('negGuardar', { tipo: 'venta', propId: prop.id, clienteId: per.id });
    for (let i = 1; i <= 70; i++) await call('inmoNota', prop.id, `Nota número ${i}`);

    await abrir();
    const total = await txt('#acCont'); const n = Number((total.match(/\d+/) || [])[0]);
    ok(n > 70 && /movimientos/.test(total), `cuenta los movimientos (${total})`);
    ok(await filas() === 60 && await w.isVisible('#acMas'), 'muestra la primera página (60) y ofrece «Ver más»');
    ok(/^hoy$/i.test((await txt('#acLista .ac-dia')).trim()), 'agrupa por día: «Hoy»');
    await w.click('#acMas'); await w.waitForFunction((t) => document.querySelectorAll('#acLista .ac-it').length === t, n);
    ok(!(await w.$('#acMas')), '«Ver más» trae el resto y desaparece');
    ok((await w.$$('#acLista .ac-dia')).length === 1, 'sin títulos de día repetidos al juntar páginas');

    await w.click('#acCl [data-c="negocio"]'); await w.waitForFunction(() => { const x = [...document.querySelectorAll('#acLista .ac-it')]; return x.length > 0 && x.every((b) => b.dataset.clase === 'negocio'); });
    ok(true, 'filtro «Negocios»');
    await w.click('#acCl [data-c="nota"]'); await w.waitForFunction(() => document.querySelectorAll('#acLista .ac-it').length === 60);
    ok(/Nota número/.test(await txt('#acLista')), 'filtro «Notas»');

    await w.click('#acCl [data-c=""]'); await w.fill('#acQ', 'número 7'); // «número 7» y «número 70»
    await w.waitForFunction(() => document.querySelectorAll('#acLista .ac-it').length === 2);
    ok(/Nota número 7/.test(await txt('#acLista')), 'busca al dejar de escribir');
    await w.fill('#acQ', 'nada que coincida'); await w.waitForSelector('#acLista :text("Nada coincide con el filtro.")');
    ok(true, 'sin resultados lo dice');

    await w.click('#nav [data-view="cartera"]'); await abrir();
    ok((await w.inputValue('#acQ')) === 'nada que coincida', 'la búsqueda se conserva al volver');
    await w.fill('#acQ', ''); await w.waitForFunction(() => document.querySelectorAll('#acLista .ac-it').length === 60);

    await w.click('#acCl [data-c="negocio"]'); await w.click(`#acLista .ac-it[data-clase="negocio"][data-ir="${neg.id}"] >> nth=0`); await w.waitForSelector('#view-negocios:not(.hidden) .ng-ficha');
    ok(true, 'tocar un movimiento de negocio abre el negocio');
    await abrir(); await w.click('#acCl [data-c="propiedad"]'); await w.click(`#acLista .ac-it[data-clase="propiedad"][data-ir="${prop.id}"] >> nth=0`); await w.waitForSelector('#view-cartera:not(.hidden) .im-ficha');
    ok(true, 'tocar un movimiento de propiedad abre su ficha');
    // se llega desde los dos inicios: «La oficina» y la lista «Hoy»
    await w.evaluate(() => { window.Oficina.pref.set('oficina'); window.Inmo.inicio(); }); await w.click('#ofActividad'); await w.waitForSelector('#view-actividad:not(.hidden) #acQ');
    ok(true, '«La oficina» tiene el botón «Actividad»');
    await w.evaluate(() => { window.Oficina.pref.set('clasica'); window.Inmo.inicio(); }); await w.click('#hoyActividad'); await w.waitForSelector('#view-actividad:not(.hidden) #acQ');
    ok(true, 'la lista «Hoy» tiene el botón «Actividad»');
    await abrir(); await w.click('#acVolver'); await w.waitForSelector('#view-actividad.hidden', { state: 'attached' });
    ok(true, '«Inicio» vuelve al inicio');

    const relevantes = errs.filter((e) => /Content Security Policy|ReactUI|react|Actividad/i.test(e));
    ok(relevantes.length === 0, 'sin errores de React ni de CSP' + (relevantes.length ? ': ' + relevantes.join(' | ') : ''));
    console.log('\nactividad-e2e: todo bien');
  } finally { await app.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exit(1); });
