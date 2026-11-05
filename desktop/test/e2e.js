// Enviar a firmar un PDF desde el inicio de Gestión documental, sin sesión al partir (modo de prueba):
// «Enviar a firmar» pide iniciar sesión → soltar → revisar (valida lo que falta) → completar → confirmar → enviado → seguimiento.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-e2e-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${path.join(tmp, 'ud')}`], env: { ...process.env, PF_MOCK: '1', PF_INMO_DIR: path.join(tmp, 'inmo') }, cwd: path.join(__dirname, '..') });
  const w = await app.firstWindow();
  const errs = []; w.on('pageerror', e => errs.push(e.message + ' @ ' + String(e.stack).split('\n').slice(0, 4).join(' | '))); w.on('console', m => m.type() === 'error' && errs.push(m.text()));
  const shot = (n) => w.screenshot({ path: path.join(__dirname, n) }).catch(() => w.screenshot({ path: path.join(__dirname, n) })).catch(() => {});
  const txt = (s) => w.textContent(s).then((t) => t || '');
  try {
    await w.setViewportSize({ width: 1000, height: 760 });
    await w.waitForFunction(() => window.studio && window.Inmo && window.__envio, null, { timeout: 20000 }); await w.waitForTimeout(300);
    await w.click('#nav [data-view="home"]'); await w.waitForSelector('#homeBody .hub-card');
    await w.click('#homeBody .hub-card[data-act="send"]'); await w.waitForSelector('#view-login:not(.hidden) #loginBtn');
    ok(/enviar documentos a firmar/i.test(await txt('#loginWhy')), 'sin sesión, «Enviar a firmar» pide iniciar sesión');
    await shot('1-login.png');
    await w.click('#loginBtn'); await w.waitForSelector('#dropzone:visible', { timeout: 15000 });
    ok(true, 'al iniciar sesión sigue a «soltar el documento»'); await shot('2-drop.png');
    // simular archivo abierto (como arrastrar al Dock)
    await w.evaluate((f) => startAnalysis({ name: 'contrato_prueba.pdf', size: 2000, path: f }), path.resolve(__dirname, 'fixtures/contrato_prueba.pdf'));
    await w.waitForSelector('#view-review:visible', { timeout: 20000 }); await w.screenshot({ path: path.join(__dirname, '3-review.png'), fullPage: true }).catch(() => {});
    const n = await w.$$eval('#signers .signer', (x) => x.length);
    ok(n >= 1 && /contrato_prueba/.test(await txt('#fileChip')), `revisar: documento y ${n} firmante(s)`);
    await w.click('#sendBtn'); await w.waitForTimeout(300);
    const e1 = await txt('#reviewError'); console.log('   error mostrado:', e1);
    ok(/Revisa los datos del firmante|correo del pagador/.test(e1), 'no deja enviar con datos incompletos');
    // completar datos faltantes
    const fill = async (i, k, v) => { const s = `input[data-i="${i}"][data-k="${k}"]`; await w.fill(s, v); await w.locator(s).blur(); };
    const datos = [['Juan Pérez', '11.111.111-1', 'arrendador', 'juan@correo.cl', '912345678'], ['María Soto', '22.222.222-2', 'arrendatario', 'maria@correo.cl', '987654321'], ['Pedro Rojas', '33.333.333-3', 'aval', 'pedro@correo.cl', '955555555']];
    for (let i = 0; i < n; i++) {
      const [nom, rut, alias, email, tel] = datos[i % 3];
      if (!(await w.inputValue(`input[data-i="${i}"][data-k="fullName"]`))) await fill(i, 'fullName', nom);
      await fill(i, 'rut', rut); await fill(i, 'alias', alias); await fill(i, 'email', email); await fill(i, 'phone', tel);
    }
    ok(await w.isVisible('#typeSignAll') && await w.isVisible('#protocolization'), 'formalización libre: tipo de firma y trámite notarial');
    await w.selectOption('#typeSignAll', 'visada'); await w.selectOption('#protocolization', 'legalization');
    await w.fill('#payerEmail', 'jgomez@portalfirma.cl');
    await w.click('#sendBtn'); await w.waitForSelector('#modal:not(.hidden) #mOk');
    const conf = await txt('#modalCard');
    ok(/Confirmar envío/.test(conf) && /jgomez@portalfirma\.cl/.test(conf), 'confirmación del envío con el pagador'); await shot('4-confirm.png');
    await w.click('#mOk'); await w.waitForSelector('#view-done:visible', { timeout: 20000 }); await w.waitForTimeout(800);
    const op = (await txt('#doneOp')).trim(); ok(/^\d+$/.test(op), 'enviado: operación ' + op);
    await w.screenshot({ path: path.join(__dirname, '5-done.png'), fullPage: true }).catch(() => {});
    // Mis operaciones necesita la cuenta de la API de Portalfirma (o el teléfono): sin ella, la pide antes de listar
    await w.click('#viewOpBtn');
    await w.waitForFunction(() => !document.querySelector('#view-ops').classList.contains('hidden') && (document.querySelector('#view-ops .ops-head') || document.querySelector('#modal:not(.hidden) #adEmail, #modal:not(.hidden) #opPhone')), null, { timeout: 15000 });
    await w.waitForTimeout(900);
    ok(true, '«Ver seguimiento» abre Mis operaciones' + (await w.$('#view-ops .ops-head') ? '' : ' (pide la cuenta para traerlas)')); await shot('6-ops.png');
    console.log('errores:', errs); if (errs.length) process.exitCode = 1;
  } catch (e) { console.error('FAIL', e.message); console.log('errores:', errs); await shot('e2e-error.png'); process.exitCode = 1; }
  finally { await w.evaluate(() => window.pf.closeNow?.()).catch(() => {}); await app.close().catch(() => {}); process.exit(process.exitCode || 0); }
})();
