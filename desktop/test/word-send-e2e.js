// Enviar a firmar un Word: se convierte a PDF antes de subirlo; un error del servidor no se muestra como éxito.
// Se entra por el inicio de Gestión documental («Enviar a firmar» → iniciar sesión → soltar).
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-word-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${path.join(tmp, 'ud')}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_SEND_500: '1', PF_INMO_DIR: path.join(tmp, 'inmo') } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const shot = (n) => w.screenshot({ path: path.join(__dirname, n) }).catch(() => w.screenshot({ path: path.join(__dirname, n) })).catch(() => {});
  try {
    await w.setViewportSize({ width: 1300, height: 860 }); await w.waitForFunction(() => window.studio && window.Inmo && window.__envio, null, { timeout: 20000 }); await w.waitForTimeout(300);
    await w.click('#nav [data-view="home"]'); await w.waitForSelector('#homeBody .hub-card');
    await w.click('#homeBody .hub-card[data-act="send"]'); await w.waitForSelector('#view-login:not(.hidden) #loginBtn'); await w.click('#loginBtn'); await w.waitForSelector('#view-drop:not(.hidden)', { timeout: 15000 });
    await w.evaluate(async (p) => { const f = await window.pf.checkFile(p); startAnalysis(f.data); }, path.join(__dirname, 'fixtures', 'contrato.docx'));
    await w.waitForSelector('#view-review:not(.hidden)', { timeout: 60000 });
    const nombre = (await w.textContent('#fileChip') || '').trim();
    ok(/\.pdf$/i.test(nombre) && /contrato\.docx.*se convirtió a PDF/.test(await w.textContent('#convNote') || ''), `se subió como PDF: ${nombre}`);
    ok(await w.locator('#convNote:visible #convView').count() === 1, 'aviso de conversión con botón «Ver PDF»');
    await shot('w1-word.png');
    // completa y envía (el servidor de prueba responde error 500): un solo firmante
    while ((await w.$$('#signers .signer')).length > 1) await w.click('#signers .signer:last-child button[data-act="del"]');
    for (const [k, v] of [['fullName', 'Ana Rojas'], ['rut', '11.111.111-1'], ['email', 'ana@correo.cl'], ['phone', '+56911111111'], ['alias', 'Arrendataria']]) { const s = `input[data-i="0"][data-k="${k}"]`; await w.fill(s, v); await w.locator(s).blur(); }
    if (await w.isVisible('#typeSignAll')) await w.selectOption('#typeSignAll', 'simple');
    await w.fill('#payerEmail', 'pagos@correo.cl');
    await w.click('#sendBtn'); await w.waitForSelector('#mOk'); await w.click('#mOk'); await w.waitForTimeout(1500);
    ok(await w.evaluate(() => document.querySelector('#view-done').classList.contains('hidden')), 'no muestra «Enviado a firmar» cuando falla');
    const msg = await w.textContent('#reviewError'); console.log('   mensaje:', msg);
    ok(/error 500/.test(msg), 'explica el error del servidor');
    await shot('w2-error.png');
    console.log('errores:', errs); if (errs.length) process.exitCode = 1;
  } catch (e) { console.error('FAIL', e.message); console.log('errores:', errs); await shot('w-error.png'); process.exitCode = 1; }
  finally { await w.evaluate(() => window.pf.closeNow()).catch(() => {}); await app.close().catch(() => {}); process.exit(process.exitCode || 0); }
})();
