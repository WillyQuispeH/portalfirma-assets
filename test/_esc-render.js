// Utilidad: genera el PDF y el Word de una minuta para revisar el diseño
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
(async () => {
  const out = process.argv[3]; fs.mkdirSync(out, { recursive: true });
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'pfr-'))}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_SAVE_DIR: out } });
  const w = await app.firstWindow(); await w.waitForSelector('.hub-card');
  await w.evaluate(() => window.Escrituras.open('escritura'));
  await w.evaluate((p) => window.Escrituras.dropFiles([p]), process.argv[2]); await w.waitForSelector('.es-mat');
  if (process.env.FIX) { await w.click('#esFixAll'); await w.waitForTimeout(300); }
  await w.click('[data-p="prev"]'); await w.waitForSelector('.es-page', { timeout: 30000 });
  await w.click('#esPdf'); await w.waitForTimeout(1200); await w.click('#esDocx'); await w.waitForTimeout(1500);
  await app.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
