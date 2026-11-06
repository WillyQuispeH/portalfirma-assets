// La cuenta en React (modo de prueba: la sesión de Asset entra sola; Portalfirma sin conectar al partir):
//  · sin bienvenida de Portalfirma, «Conectar Portalfirma» arriba a la derecha y la pantalla «Conecta tu cuenta» (motivo, volver, conexión directa),
//  · iniciar sesión con el navegador (simulado) sigue con lo pedido, y el menú del usuario (apariencia, tocar fuera),
//  · window.Usuario._u (lo leen app.js, escrituras y las pruebas), el Agente por WhatsApp y el panel de reglas.
// Requiere el bundle compilado (yarn build:ui o yarn dev).
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-cuenta-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${path.join(tmp, 'ud')}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_INMO_DIR: path.join(tmp, 'inmo') } });
  const w = await app.firstWindow(); const errs = [];
  w.on('pageerror', (e) => errs.push('PAGE: ' + e.message)); w.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await w.setViewportSize({ width: 1500, height: 920 });
  const txt = (s) => w.textContent(s).then((t) => t || '');
  try {
    // ===== al abrir: sin bienvenida de Portalfirma (el login de la app es el de Asset)
    await w.waitForFunction(() => window.studio && window.Inmo, null, { timeout: 20000 });
    await w.waitForSelector('#userBtn:not(.hidden)', { timeout: 15000 }); await w.waitForTimeout(500);
    ok(!(await w.isVisible('#modal:not(.hidden) .welcome')) && await w.evaluate(() => document.body.classList.contains('guest')), 'sin bienvenida de Portalfirma; Portalfirma sin conectar');

    // ===== arriba a la derecha y «Conecta tu cuenta»
    ok(await w.isVisible('#topLoginBtn') && /Conectar Portalfirma/.test(await txt('#topLoginBtn')) && await w.isVisible('#userBtn'), 'sin Portalfirma: el usuario de Asset y «Conectar Portalfirma»');
    await w.click('#topLoginBtn'); await w.waitForSelector('#view-login:not(.hidden) #loginBtn');
    ok(/Conecta tu cuenta para enviar documentos/.test(await txt('#loginWhy')) && /navegador/.test(await txt('#loginHint')), 'pantalla de inicio de sesión con el motivo');
    await w.click('#loginApi'); await w.waitForSelector('#modal:not(.hidden) #adEmail');
    ok(await w.isVisible('#adPass') && /correo y la contraseña/.test(await txt('#modalCard')), 'conexión directa sin sesión: pide correo y contraseña');
    await w.click('#mCancel'); await w.click('#loginBack'); await w.waitForSelector('#view-login.hidden', { state: 'attached' });
    ok(true, '«Volver al editor» sale del inicio de sesión');
    await w.evaluate(() => window.requireLogin(() => { window.__hecho = true; }, 'Motivo de prueba'));
    await w.waitForSelector('#view-login:not(.hidden)'); await w.waitForFunction(() => document.querySelector('#loginWhy')?.textContent === 'Motivo de prueba');
    ok(true, 'requireLogin() muestra su motivo');
    await w.click('#loginBtn'); await w.waitForFunction(() => window.__hecho === true, null, { timeout: 15000 });
    await w.waitForSelector('#userBtn:not(.hidden)');
    ok(!(await w.isVisible('#topLoginBtn')) && !(await w.evaluate(() => document.body.classList.contains('guest'))) && await w.evaluate(() => window.isMember()), 'al iniciar sesión sigue con lo pedido y muestra la cuenta');

    // ===== menú del usuario
    await w.click('#userBtn'); await w.waitForSelector('#userMenu');
    const m = await txt('#userMenu');
    ok(/Corredor Demo/.test(m) && /Corredora Demo/.test(m) && /Portalfirma/.test(await txt('#umPf')) && await w.isVisible('[data-um="pfOut"]') && /Mis operaciones/.test(m) && /Agente por WhatsApp/.test(m) && /PortalFirma Asset 0\./.test(m), 'menú con el usuario de Asset, Portalfirma conectado, accesos y versión');
    ok(await w.evaluate(() => document.querySelector('#userMenu').parentElement === document.body), 'el menú va en <body>');
    await w.click('#umTema [data-tema="dark"]');
    ok(await w.evaluate(() => document.documentElement.dataset.theme === 'dark') && await w.isVisible('#umTema [data-tema="dark"].on'), 'apariencia: cambia a oscuro');
    await w.click('#umTema [data-tema="system"]');
    await w.mouse.click(700, 500); await w.waitForTimeout(200);
    ok(!(await w.$('#userMenu')) && !(await w.evaluate(() => document.querySelector('#userBtn').classList.contains('on'))), 'tocar fuera cierra el menú');

    // ===== Usuario._u
    await w.evaluate(() => { window.Usuario._u.user = { namePerson: 'Ana Pérez', role: 'admin', nameEntity: 'Inmobiliaria Ana' }; });
    ok(await w.evaluate(() => window.Usuario._u.user.nameEntity === 'Inmobiliaria Ana' && window.Usuario._u.user.role === 'admin' && 'amount' in window.Usuario._u), 'Usuario._u.user (cuenta de Portalfirma) se lee y se fija');

    // ===== Agente por WhatsApp
    await w.evaluate(() => window.WhatsAppAgente.abrir()); await w.waitForSelector('#waAg .wa-paso');
    ok(await w.evaluate(() => document.querySelector('#modalCard').classList.contains('im-wide')) && /Pedro/.test(await txt('#waAg')) && (await w.$$('.wa-paso')).length === 3, 'Agente por WhatsApp: la ventana ancha con los tres pasos');
    await w.click('#modalCard #mCancel'); await w.waitForSelector('#modal.hidden', { state: 'attached' });
    ok(!(await w.evaluate(() => document.querySelector('#modalCard').classList.contains('im-wide'))), 'al cerrar, el modal vuelve a su ancho');

    // ===== reglas de detección (Firmas presenciales, administrador)
    await w.evaluate(() => window.Escrituras.open()); await w.waitForSelector('.es-layout');
    await w.click('[data-sel="reglas"]'); await w.waitForSelector('#esBody #rgProponer');
    ok((await txt('#rgNCasos')) === '0' && await w.isDisabled('#rgProponer') && /Aún no hay casos/.test(await txt('#rgProps')), 'panel de reglas: sin casos, no deja proponer');
    ok(/Todavía no hay reglas aprobadas/.test(await txt('#rgReglas')), 'panel de reglas: sin reglas aprobadas');

    // ===== desconectar Portalfirma y cerrar sesión
    await w.click('#userBtn'); await w.click('[data-um="pfOut"]'); await w.waitForSelector('#topLoginBtn:not(.hidden)');
    ok(await w.isVisible('#userBtn') && await w.evaluate(() => document.body.classList.contains('guest')), 'desconectar Portalfirma: sigue la sesión de Asset y vuelve «Conectar Portalfirma»');
    await w.click('#userBtn'); await w.click('[data-um="out"]'); await w.waitForSelector('#assetAcceso #acEmail', { timeout: 20000 });
    ok(true, 'cerrar sesión vuelve a la pantalla de ingreso de Asset');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK cuenta');
  } catch (er) { console.error(er.message); console.error('errores:', errs); await w.screenshot({ path: path.resolve(__dirname, 'cuenta-error.png') }).catch(() => {}); process.exitCode = 1; } finally { await app.close(); }
})();
