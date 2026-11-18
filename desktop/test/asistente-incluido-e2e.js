// Asistente con la clave incluida en la app: no se pide clave, no se muestra, no se puede cambiar.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfai2-'));
  // clave incluida de prueba (mismo ofuscado que src/ai.js); antes había que pasarla en la variable BIN
  let bin = process.env.BIN;
  if (!bin) {
    const MASK = Buffer.from('portalfirma-studio·asistente-legal'); const raw = Buffer.from(JSON.stringify({ provider: 'openai', key: 'sk-test-incluida-1234567890ZZ99', model: 'gpt-test' }));
    bin = path.join(userData, 'clave.bin'); fs.writeFileSync(bin, Buffer.from(raw.map((x, i) => x ^ MASK[i % MASK.length])));
  }
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_AI_MANAGED: bin } });
  const w = await app.firstWindow(); await w.setViewportSize({ width: 1440, height: 900 }); await w.waitForFunction(() => window.studio && window.Inmo, null, { timeout: 15000 }); await w.waitForTimeout(300); await w.evaluate(() => window.studio.goHome()); await w.waitForSelector('.hub-card');
  const st = await w.evaluate(() => window.pf.aiStatus());
  ok(st.data.managed && st.data.provider === 'openai' && st.data.model === 'gpt-test', 'asistente incluido detectado');
  ok(!JSON.stringify(st).includes('ZZ99') && !st.data.keyEnd, 'la ventana no recibe ni el final de la clave');
  const r = await w.evaluate(() => window.pf.aiConfig({ key: '', provider: 'anthropic' }));
  ok(r.data.managed && r.data.provider === 'openai', 'no se puede borrar ni cambiar desde la app');
  await w.evaluate((p) => window.editor.openPaths([p], true), path.resolve(__dirname, 'fixtures', 'contrato_prueba.pdf')); await w.waitForTimeout(1500);
  await w.click('#edAi'); await w.waitForSelector('#aiReview'); await w.click('#aiSettings'); await w.waitForSelector('#aiBack');
  ok(await w.locator('#aiKey').count() === 0 && /incluido/.test(await w.textContent('.ai')), 'Ajustes sin campo de clave');
  await w.screenshot({ path: path.resolve(__dirname, 'ai4-incluido.png') });
  await w.evaluate(() => window.pf.closeNow()).catch(() => {}); await app.close().catch(() => {}); process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
