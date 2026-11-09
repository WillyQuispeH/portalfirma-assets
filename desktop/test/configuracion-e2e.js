// Configuración (menú del usuario): pestañas General (tema y luz de la oficina), WhatsApp y asistentes (el número de la
// empresa, Sofía / Tomás / postventa, cómo se reparten los mensajes y tu celular con tu equipo) e Integraciones.
// En modo de prueba (PF_MOCK) los interruptores quedan en este equipo.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-cfg-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${path.join(tmp, 'ud')}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: path.join(tmp, 'inmo') } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const txt = (s) => w.innerText(s).then((t) => (t || '').replace(/\s+/g, ' '));
  try {
    await w.setViewportSize({ width: 1440, height: 920 });
    await w.waitForFunction(() => window.ReactUI && window.Inmo, null, { timeout: 15000 }); await w.waitForTimeout(500);
    await w.click('#userBtn'); await w.click('[data-um="config"]'); await w.waitForSelector('#view-integraciones:not(.hidden) #cfgTabs');
    ok(/Configuración/.test(await txt('#view-integraciones h1')) && (await w.$$('#cfgTabs [data-t]')).length === 3, 'se abre desde el menú del usuario, con 3 pestañas');
    // General
    await w.click('#cfgTema [data-tema="dark"]'); await w.waitForTimeout(200);
    ok(await w.evaluate(() => document.documentElement.dataset.theme === 'dark'), 'General: el tema cambia a oscuro');
    await w.click('#cfgTema [data-tema="system"]');
    await w.click('#cfgLuz [data-luz="tarde"]');
    ok(await w.evaluate(() => localStorage.getItem('pfLuzOficina')) === 'tarde' && await w.isVisible('#cfgLuz [data-luz="tarde"].on'), 'General: la luz de la oficina queda guardada');
    await w.click('#cfgLuz [data-luz="auto"]');
    await w.screenshot({ path: path.resolve(__dirname, 'cfg1-general.png') });
    // WhatsApp y asistentes
    await w.click('#cfgTabs [data-t="whatsapp"]'); await w.waitForSelector('#cfgMiWa');
    await w.waitForFunction(() => !/Cargando/.test(document.querySelector('#cfgMiWa').textContent));
    ok(/no está conectado/.test(await txt('#cfgMiWa')) && /Integraciones/.test(await txt('#cfgMiWa')), 'Mi WhatsApp: sin el WhatsApp de la empresa, dice que hay que conectarlo (y dónde)');
    // con el WhatsApp de la empresa conectado: tu celular, «Vincular» da el código para mandarlo al número de la empresa
    await app.evaluate(() => { global.__waMock = { convs: [], msgs: {} }; });
    await w.evaluate(() => window.pf.pvClaveWa({ token: 'pit-f0e1d2c3f0e1d2c3f0e1d2c3', locationId: 'PlPVNYvbNWr6nrRB9VHG' }));
    await w.click('#cfgTabs [data-t="general"]'); await w.click('#cfgTabs [data-t="whatsapp"]'); await w.waitForSelector('#cfgMiWa');
    await w.waitForFunction(() => !/Cargando/.test(document.querySelector('#cfgMiWa').textContent));
    if (await w.$('#cfgVincular')) {
      ok(/Sin vincular/.test(await txt('#cfgMiTel')), 'Mi WhatsApp: muestra tu celular (sin vincular)');
      await w.click('#cfgVincular'); await w.waitForSelector('#cfgCodigo');
      ok(/^ASSET \d{4}$/.test((await txt('#cfgCodigo')).trim()) && /4497 5958/.test(await txt('#cfgMiWa')), 'Vincular: da el código para mandarlo al número de la empresa');
    } else console.log('    (sin la conexión de prueba de wechatia: se omite el código)');
    ok(/Sofía/.test(await txt('#view-integraciones')) && /Tomás/.test(await txt('#view-integraciones')), 'el administrador ve los asistentes con clientes');
    const sofia = () => w.getAttribute('#cfgSofia', 'aria-checked');
    ok(await sofia() === 'true', 'Sofía parte encendida');
    await w.click('#cfgSofia'); await w.waitForTimeout(500);
    ok(await sofia() === 'false' && (await w.evaluate(() => window.pf.waAsistentes())).data.leadsActivo === false, 'apagar a Sofía queda guardado');
    await w.click('#cfgSofia'); await w.waitForTimeout(500); ok(await sofia() === 'true', 'y se vuelve a encender');
    await w.screenshot({ path: path.resolve(__dirname, 'cfg2-whatsapp.png'), fullPage: true });
    // Integraciones
    await w.click('#cfgTabs [data-t="integraciones"]'); await w.waitForSelector('[data-integracion="portalfirma"]');
    ok(true, 'Integraciones: las conexiones están en su pestaña');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK configuración');
  } catch (e) { console.error('FAIL', e); process.exitCode = 1; } finally { await app.close(); }
})();
