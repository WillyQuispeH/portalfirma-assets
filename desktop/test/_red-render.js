const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
(async () => {
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'pfr-'))}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1' } });
  const w = await app.firstWindow(); await w.waitForFunction(() => window.studio && window.Inmo, null, { timeout: 15000 }); await w.waitForTimeout(300); await w.evaluate(() => window.studio.goHome()); await w.waitForSelector('.hub-card');
  await w.evaluate(() => window.Escrituras.open('reduccion'));
  await w.evaluate((p) => window.Escrituras.dropFiles([p]), process.argv[2]); await w.waitForSelector('.es-ficha', { timeout: 60000 });
  const arr = await w.evaluate(async () => { const S = window.Escrituras._s; const r = await window.Escrituras._escrituraPdf(window.Notarial.reduccionBlocks(S.proto.info, S.proto.docs.map((x) => x.text).join('\n\n'))); return Array.from(r.bytes); });
  fs.writeFileSync(process.argv[3], Buffer.from(arr));
  const car = await w.evaluate(async () => { const S = window.Escrituras._s; return Array.from(await window.Escrituras._caratulaPdf({ ...S.proto.d, requirente: '', texto: window.Notarial.caratulaTexto({ ...S.proto.d, requirente: '', fecha: null, fechaFirma: null, documentos: S.proto.docs, hojas: 3 }, null) })); });
  fs.writeFileSync(process.argv[3].replace('.pdf', '-caratula.pdf'), Buffer.from(car));
  await app.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
