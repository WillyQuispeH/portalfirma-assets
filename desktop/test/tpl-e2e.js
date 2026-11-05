// Notaría virtual desde el inicio de Gestión documental, sin sesión al partir: pide iniciar sesión, catálogo,
// formulario con validación (RUT y teléfono ordenados), confirmación, «Enviado», volver y buscar. Ya no hay pestaña de chat.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-tpl-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${path.join(tmp, 'ud')}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_INMO_DIR: path.join(tmp, 'inmo') } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message)); w.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  const shot = (n, full) => w.screenshot({ path: path.join(__dirname, n), fullPage: !!full }).catch(() => w.screenshot({ path: path.join(__dirname, n), fullPage: !!full })).catch(() => {});
  try {
    await w.setViewportSize({ width: 1100, height: 800 });
    await w.waitForFunction(() => window.studio && window.Inmo, null, { timeout: 20000 }); await w.waitForTimeout(300);
    await w.click('#nav [data-view="home"]'); await w.waitForSelector('#homeBody .hub-card');
    await w.click('#homeBody .hn-card[data-act="tpl"]'); await w.waitForSelector('#view-login:not(.hidden) #loginBtn');
    ok(/Notaría virtual/.test(await w.textContent('#loginWhy') || ''), 'sin sesión, la Notaría virtual pide iniciar sesión');
    await w.click('#loginBtn'); await w.waitForSelector('#view-tpl:not(.hidden) .tpl-card', { timeout: 15000 });
    ok((await w.$$('.tpl-card')).length > 0, 'al iniciar sesión abre el catálogo');
    await shot('t1-catalog.png');
    await w.click('#tplCats [data-cat="Vehículos"]'); await w.waitForSelector('#tplCats .chip.active[data-cat="Vehículos"]'); await w.waitForSelector('.tpl-card');
    await w.click('.tpl-card [data-use]'); await w.waitForSelector('#tplSend');
    await w.click('#tplSend'); await w.waitForTimeout(200);
    const inv0 = await w.$$eval('#view-tpl .invalid', (n) => n.length);
    console.log('   validación:', await w.textContent('#tplError'), '| campos marcados:', inv0);
    ok(/Revisa los campos marcados/.test(await w.textContent('#tplError') || '') && inv0 > 0, 'sin datos no deja enviar y marca los obligatorios');
    await shot('t2-form-errors.png', true);
    const fill = async (id, v) => { const s = `[data-f="${id}"]`; if (!(await w.$(s))) return false; await w.fill(s, v); await w.dispatchEvent(s, 'change'); await w.locator(s).blur(); return true; };
    await fill('ciudad_documento_nosigner', 'Santiago');
    ok(await fill('nombre_mandante_signer', 'Juan Pérez Soto') && await fill('rut_mandante_signer', '111111111'), 'formulario con el mandante');
    await fill('email_mandante_signer', 'juan@correo.cl'); await fill('telefono_mandante_signer', '912345678');
    await fill('estado-civil_mandante_signer', 'Soltero(a)'); await fill('direccion_mandante_signer', 'Av. Siempre Viva 123, Santiago');
    await fill('placa-patente_datos-del-vehiculo_nosigner', 'ABCD12');
    // el resto de los obligatorios con un texto cualquiera (depende del trámite del simulador)
    for (const id of await w.$$eval('#view-tpl .invalid', (l) => l.map((i) => i.dataset.f).filter(Boolean))) {
      const t = await w.$eval(`[data-f="${id}"]`, (i) => i.type);
      await fill(id, t === 'email' ? 'otro@correo.cl' : t === 'tel' ? '987654321' : /rut/.test(id) ? '22222222-2' : 'Dato de prueba');
    }
    await w.waitForTimeout(150);
    const rut = await w.inputValue('[data-f="rut_mandante_signer"]'), tel = await w.inputValue('[data-f="telefono_mandante_signer"]');
    console.log('   rut:', rut, '| teléfono:', tel);
    ok(rut === '11.111.111-1' && tel === '+56912345678', 'RUT y teléfono ordenados');
    await w.click('#tplSend'); await w.waitForSelector('#mOk'); await shot('t3-confirm.png');
    ok(/Juan Pérez Soto/.test(await w.textContent('#modalCard') || ''), 'confirmación con el firmante');
    await w.click('#mOk'); await w.waitForSelector('#view-done:visible'); await w.waitForTimeout(800);
    await shot('t4-done.png');
    const op = ((await w.textContent('#doneOp')) || '').trim(); console.log('   operación:', op);
    ok(op.length > 0, 'enviado: muestra la operación');
    // volver a la Notaría virtual desde el inicio (ya con sesión) y buscar
    await w.click('#nav [data-view="home"]'); await w.waitForSelector('#homeBody .hn-card[data-act="tpl"]'); await w.click('#homeBody .hn-card[data-act="tpl"]');
    await w.waitForSelector('#view-tpl:not(.hidden) #tplQuery');
    await w.fill('#tplQuery', 'declaración de domicilio'); await w.press('#tplQuery', 'Enter'); await w.waitForSelector('.tpl-card');
    const cards = await w.$$eval('.tpl-card', (n) => n.length);
    ok(cards > 0, `búsqueda por texto (${cards} trámites)`);
    ok(!(await w.$('#nav [data-view="chat"], .tab[data-view="chat"]')), 'ya no hay pestaña de chat');
    console.log('errores:', errs); if (errs.length) process.exitCode = 1;
  } catch (e) { console.error('FAIL', e.message); console.log('errores:', errs); await shot('t-error.png'); process.exitCode = 1; }
  finally { await w.evaluate(() => window.pf.closeNow?.()).catch(() => {}); await app.close().catch(() => {}); process.exit(process.exitCode || 0); }
})();
