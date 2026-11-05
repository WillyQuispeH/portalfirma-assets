// Notaría virtual (React): catálogo por categoría y búsqueda, formulario con validación, RUT y teléfono ordenados
// al salir del campo, confirmación con el saldo y pantalla «Enviado». Con el proceso principal simulado (PF_MOCK).
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
let fallas = 0; const ok = (c, m) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) fallas++; };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-notaria-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1' } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push('PAGE: ' + e.message)); w.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await w.setViewportSize({ width: 1280, height: 860 });
  await w.waitForFunction(() => window.studio && window.Inmo && window.ReactUI, null, { timeout: 15000 }); await w.waitForTimeout(300);
  await w.evaluate(() => { window.show('tpl'); window.openTemplates(); });
  await w.waitForSelector('.tpl-card', { timeout: 10000 });
  ok(await w.$$eval('#tplCats .chip', (l) => l.length) === 18, 'las 18 categorías de Portalfirma');
  ok(await w.$eval('#tplCats .chip.active', (b) => b.textContent) === 'Poderes Notariales', 'abre en la primera categoría');
  const n1 = await w.$$eval('.tpl-card', (l) => l.length); ok(n1 > 0, `catálogo con trámites (${n1})`);
  await w.click('#tplCats [data-cat="Vehículos"]'); await w.waitForSelector('#tplCats .chip.active[data-cat="Vehículos"]'); await w.waitForSelector('.tpl-card');
  ok(true, 'cambia de categoría');
  await w.click('.tpl-card [data-use]'); await w.waitForSelector('#tplSend');
  ok(/Firman:/.test(await w.textContent('#view-tpl')), 'formulario con quién firma');
  ok(await w.$$eval('input[type="date"]', (l) => l.length && l.every((i) => /^\d{4}-\d{2}-\d{2}$/.test(i.value))), 'las fechas parten en hoy');
  await w.click('#tplSend'); await w.waitForTimeout(200);
  ok(/Revisa los campos marcados/.test(await w.textContent('#tplError')) && (await w.$$eval('#view-tpl .invalid', (n) => n.length)) > 0, 'sin datos: marca los obligatorios');
  const fill = async (id, v) => { const s = `[data-f="${id}"]`; if (!(await w.$(s))) return false; await w.fill(s, v); await w.dispatchEvent(s, 'change'); return true; };
  await fill('ciudad_documento_nosigner', 'Santiago');
  await fill('nombre_mandante_signer', 'Juan Pérez Soto'); await fill('rut_mandante_signer', '111111111');
  await fill('email_mandante_signer', 'juan@correo.cl'); await fill('telefono_mandante_signer', '912345678');
  await fill('estado-civil_mandante_signer', 'Soltero(a)'); await fill('direccion_mandante_signer', 'Av. Siempre Viva 123, Santiago');
  await fill('placa-patente_datos-del-vehiculo_nosigner', 'ABCD12');
  // el resto de los obligatorios con un texto cualquiera (depende del trámite del simulador)
  for (const id of await w.$$eval('#view-tpl .invalid', (l) => l.map((i) => i.dataset.f))) {
    const t = await w.$eval(`[data-f="${id}"]`, (i) => i.type);
    await fill(id, t === 'email' ? 'otro@correo.cl' : t === 'tel' ? '987654321' : /rut/.test(id) ? '22222222-2' : 'Dato de prueba');
  }
  await w.waitForTimeout(150);
  ok((await w.inputValue('[data-f="rut_mandante_signer"]')) === '11.111.111-1', 'RUT con puntos y guión al salir del campo');
  ok((await w.inputValue('[data-f="telefono_mandante_signer"]')) === '+56912345678', 'teléfono con +56 al salir del campo');
  ok((await w.$$eval('#view-tpl .invalid', (n) => n.length)) === 0, 'sin campos marcados al completarlo');
  await w.click('#tplSend'); await w.waitForSelector('#mOk');
  const conf = await w.textContent("#modalCard")
  ok(/Juan Pérez Soto — 11\.111\.111-1 — juan@correo\.cl/.test(conf) && /Saldo actual/.test(conf), 'confirmación con firmantes y saldo');
  await w.click('#mOk'); await w.waitForSelector('#view-done:visible'); await w.waitForTimeout(500);
  ok(((await w.textContent('#doneOp')) || '').trim().length > 0, 'enviado: muestra la operación');
  await w.evaluate(() => { window.show('tpl'); window.openTemplates(); }); await w.waitForSelector('#tplQuery');
  ok(!(await w.$('#tplSend')), 'después de enviar vuelve al catálogo');
  await w.fill('#tplQuery', 'declaración de domicilio'); await w.press('#tplQuery', 'Enter'); await w.waitForSelector('.tpl-card');
  ok(!(await w.$('#tplCats .chip.active')), 'búsqueda por texto (sin categoría marcada)');
  await w.click('.tpl-card [data-use]'); await w.waitForSelector('#tplBack'); await w.click('#tplBack'); await w.waitForSelector('.tpl-card');
  ok((await w.inputValue('#tplQuery')) === 'declaración de domicilio', 'volver al catálogo conserva la búsqueda');
  ok(!errs.length, 'sin errores en la consola' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await app.close(); console.log(fallas ? `${fallas} con falla` : 'todo bien'); process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
