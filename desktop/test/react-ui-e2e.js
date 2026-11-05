// Puente React (src/ui → src/renderer/react/react-ui.js): carga, monta, actualiza,
// lee datos por api() y desmonta, sin errores ni violaciones de la CSP.
// Requiere el bundle compilado: yarn build:ui
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const assert = (c, m) => { if (!c) throw new Error('FALLA: ' + m); console.log('ok -', m); };

(async () => {
  const raiz = path.join(__dirname, '..');
  if (!fs.existsSync(path.join(raiz, 'src/renderer/react/react-ui.js'))) throw new Error('Falta el bundle: corre «yarn build:ui» antes');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-react-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${path.join(tmp, 'ud')}`], cwd: raiz, env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: path.join(tmp, 'inmo'), PF_START: 'inicio' } });
  try {
    const w = await app.firstWindow(); const errs = [];
    w.on('pageerror', (e) => errs.push(e.message));
    w.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await w.waitForLoadState('domcontentloaded');

    assert(await w.evaluate(() => typeof window.ReactUI?.montar === 'function'), 'window.ReactUI está cargado');
    assert((await w.evaluate(() => ReactUI.disponibles())).includes('Finanzas'), 'la página Finanzas está registrada');

    await w.evaluate(() => { const el = document.createElement('div'); el.id = 'rx-prueba'; document.body.appendChild(el); window._rx = ReactUI.montar('Finanzas', el); });
    await w.waitForSelector('#rx-prueba h1:has-text("Finanzas")');
    assert(true, 'monta la página');

    await w.waitForSelector('#rx-prueba .ng-kpis');
    assert(true, 'lee los negocios por el store (Zustand → service → api())');

    await w.evaluate(() => window._rx.actualizar({}));
    assert(await w.isVisible('#rx-prueba h1'), 'actualizar() vuelve a renderizar sin errores');

    assert(await w.evaluate(() => getComputedStyle(document.querySelector('#rx-prueba .rx-fin .im-bar')).flexWrap === 'wrap'), 'se aplica react-ui.css');

    await w.evaluate(() => window._rx.desmontar());
    assert(await w.evaluate(() => document.getElementById('rx-prueba').childElementCount === 0), 'desmontar() limpia el elemento');

    let falla = null; try { await w.evaluate(() => ReactUI.montar('NoExiste', document.body)); } catch (e) { falla = e.message; }
    assert(/no existe la página/.test(falla || ''), 'un nombre desconocido da un error claro');

    const relevantes = errs.filter((e) => /Content Security Policy|ReactUI|react/i.test(e));
    assert(relevantes.length === 0, 'sin errores de React ni de CSP' + (relevantes.length ? ': ' + relevantes.join(' | ') : ''));
    console.log('\nreact-ui-e2e: todo bien');
  } finally { await app.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exit(1); });
