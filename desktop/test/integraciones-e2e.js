// Integraciones (React): se abre desde el menú del usuario, muestra cada servicio con su estado y sus botones, los canales
// de wechatia (sin la cuenta de Asset, sin datos: lo dice) y el formulario de la clave de wechatia del administrador.
// Mercado Libre y Google Drive se conectan y desconectan con sus simulaciones (PF_MOCK).
// Requiere el bundle compilado: yarn build:ui
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };

(async () => {
  const raiz = path.join(__dirname, '..');
  if (!fs.existsSync(path.join(raiz, 'src/renderer/react/react-ui.js'))) throw new Error('Falta el bundle: corre «yarn build:ui» antes');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-int-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${path.join(tmp, 'ud')}`], cwd: raiz, env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: path.join(tmp, 'inmo'), PF_START: 'inicio' } });
  const w = await app.firstWindow(); const errs = [];
  w.on('pageerror', (e) => errs.push(e.message)); w.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const fila = (id) => `#view-integraciones [data-integracion="${id}"]`;
  const txt = (s) => w.innerText(s).then((t) => (t || '').replace(/\s+/g, ' '));
  try {
    await w.setViewportSize({ width: 1400, height: 900 });
    await w.waitForFunction(() => window.ReactUI && window.Inmo, null, { timeout: 15000 }); await w.waitForTimeout(500);

    await w.click('#userBtn'); await w.click('[data-um="integraciones"]');
    await w.waitForSelector('#view-integraciones:not(.hidden) [data-integracion="portalfirma"]');
    ok(true, 'se abre desde el menú del usuario');
    ok(/Inicio Integraciones/.test(await txt('#view-integraciones [data-migas]')), 'con sus migas: Inicio › Integraciones');
    for (const id of ['portalfirma', 'wechatia', 'canal-whatsapp', 'canal-instagram', 'canal-facebook', 'canal-correo', 'mercadolibre', 'drive', 'maps', 'ia'])
      ok(await w.$(fila(id)), `muestra ${id}`);
    ok(/Entra con tu cuenta de Asset/.test(await txt(fila('canal-instagram'))), 'sin la cuenta de Asset, los canales dicen que no se puede saber su estado');

    // wechatia: el formulario de la clave (el usuario de prueba es administrador)
    await w.click(`${fila('wechatia')} button:has-text("Conectar")`);
    await w.waitForSelector('#view-integraciones input[type="password"]');
    ok(await w.$eval('#view-integraciones form button[type="submit"]', (b) => b.disabled), 'el formulario de wechatia no guarda sin una clave completa');

    // Mercado Libre y Drive, con sus simulaciones
    for (const [id, nombre] of [['mercadolibre', 'Mercado Libre'], ['drive', 'Google Drive']]) {
      if (/No disponible/.test(await txt(fila(id)))) { console.log(`  · ${nombre}: no disponible en este equipo, se omite`); continue; }
      await w.click(`${fila(id)} button:has-text("Conectar")`);
      await w.waitForFunction((s) => /Conectado/.test(document.querySelector(s)?.innerText || ''), fila(id), { timeout: 15000 });
      ok(true, `${nombre} se conecta y queda «Conectado»`);
      await w.click(`${fila(id)} button:has-text("Desconectar")`);
      await w.waitForFunction((s) => /Sin conectar/.test(document.querySelector(s)?.innerText || ''), fila(id), { timeout: 15000 });
      ok(true, `${nombre} se desconecta`);
    }

    await w.click('#view-integraciones [data-migas] button'); await w.waitForTimeout(500);
    ok(await w.$eval('#view-integraciones', (e) => e.classList.contains('hidden')), 'la miga «Inicio» vuelve al inicio');
    ok(!errs.length, 'sin errores de React ni de CSP' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('\nintegraciones-e2e: todo bien');
  } catch (e) {
    await w.screenshot({ path: path.join(__dirname, 'int-error.png') }).catch(() => {});
    console.error(e.message); process.exitCode = 1;
  } finally { await app.close(); }
})();
