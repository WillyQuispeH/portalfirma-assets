// Ingreso a PortalFirma Asset (login propio, modo de prueba con PF_MOCK_ASSET_LOGIN=1: clave «demo1234»):
//  · sin sesión la pantalla de ingreso tapa la app; la clave incorrecta muestra el error,
//  · al ingresar se ve la app con el usuario de Asset arriba a la derecha y «Conectar Portalfirma» (sin conexión),
//  · el menú muestra la corredora y Portalfirma «Sin conectar»; «Conectar» abre «Conecta tu cuenta de Portalfirma»,
//  · conectar Portalfirma (simulado) lo muestra conectado; «Cerrar sesión» vuelve a la pantalla de ingreso.
// Requiere el bundle compilado (yarn build:ui o yarn dev).
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-acceso-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${path.join(tmp, 'ud')}`], cwd: path.join(__dirname, '..'),
    env: { ...process.env, PF_MOCK: '1', PF_MOCK_ASSET_LOGIN: '1', PF_INMO_DIR: path.join(tmp, 'inmo') } });
  const w = await app.firstWindow(); const errs = [];
  w.on('pageerror', (e) => errs.push('PAGE: ' + e.message)); w.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await w.setViewportSize({ width: 1400, height: 900 });
  const txt = (s) => w.textContent(s).then((t) => t || '');
  try {
    await w.waitForSelector('#assetAcceso #acEmail', { timeout: 20000 });
    ok(/Ingresa a PortalFirma Asset/.test(await txt('#assetAcceso')) && await w.evaluate(() => document.body.classList.contains('sin-acceso')), 'sin sesión: la pantalla de ingreso tapa la app');
    ok(!(await w.isVisible('#modal:not(.hidden)')), 'ya no aparece la bienvenida de Portalfirma');

    await w.fill('#acEmail', 'ana@demo.cl'); await w.fill('#acClave', 'otra-clave'); await w.click('#acEntrar');
    await w.waitForSelector('#acError');
    ok(/Email o clave incorrectos/.test(await txt('#acError')) && await w.isVisible('#assetAcceso'), 'clave incorrecta: muestra el error y sigue en el ingreso');

    await w.fill('#acClave', 'demo1234'); await w.click('#acEntrar');
    await w.waitForSelector('#assetAcceso', { state: 'detached' });
    ok(!(await w.evaluate(() => document.body.classList.contains('sin-acceso'))), 'con la clave correcta entra a la app');
    await w.waitForSelector('#userBtn:not(.hidden)');
    ok(/Corredor/.test(await txt('#userBtn')), 'arriba a la derecha: el usuario de Asset');
    ok(await w.isVisible('#topLoginBtn') && /Conectar Portalfirma/.test(await txt('#topLoginBtn')), 'sin Portalfirma: botón «Conectar Portalfirma»');

    await w.click('#userBtn'); await w.waitForSelector('#userMenu');
    ok(/ana@demo\.cl/.test(await txt('#userMenu')) && /Corredora Demo · Administrador/.test(await txt('#umCorredora')), 'el menú muestra email, corredora y rol');
    ok(/Sin conectar/.test(await txt('#umPf')), 'Portalfirma figura sin conectar');
    await w.click('[data-um="pfIn"]'); await w.waitForSelector('#view-login:not(.hidden) #loginBtn');
    ok(/Conecta tu cuenta de Portalfirma/.test(await txt('#view-login')), '«Conectar» abre la conexión con Portalfirma');
    await w.click('#loginBtn'); await w.waitForSelector('#topLoginBtn.hidden', { state: 'attached', timeout: 15000 });
    await w.click('#userBtn'); await w.waitForSelector('#userMenu [data-um="pfOut"]');
    ok(/\$/.test(await txt('#umPf')), 'conectado: muestra el saldo de Portalfirma y «Desconectar»');

    await w.click('[data-um="out"]');
    await w.waitForSelector('#assetAcceso #acEmail', { timeout: 20000 });
    ok(true, '«Cerrar sesión» vuelve a la pantalla de ingreso');
    ok(errs.length === 0, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
  } finally { await app.close().catch(() => {}); }
})().catch((e) => { console.error(e.message); process.exit(1); });
