// Editor PDF: combinar Word + Excel + imagen + PDF, herramientas (texto, tapar), organizar (mover, rotar) y exportar;
// un plano A0 de más de 20 MB: aviso al enviar, comprimir, numerar y enviar a firmar (pasa a «Revisar»).
// Los archivos de ejemplo que no están en test/fixtures (Excel, foto JPG, plano A0) se generan en una carpeta temporal.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const crypto = require('crypto'); const XLSX = require('xlsx');
const { PDFDocument, PDFName, pushGraphicsState, popGraphicsState, concatTransformationMatrix, drawObject } = require('pdf-lib');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
const F = (n) => path.resolve(__dirname, 'fixtures', n);
async function planoA0(file) {
  // A0 apaisado con una lámina escaneada (imagen RGB sin comprimir en JPEG): pesa más de 20 MB
  const doc = await PDFDocument.create(); const W = 3370.39, H = 2383.94; const page = doc.addPage([W, H]);
  const iw = 3200, ih = 2300; const raw = crypto.randomBytes(iw * ih * 3);
  const img = doc.context.flateStream(raw, { Type: 'XObject', Subtype: 'Image', Width: iw, Height: ih, ColorSpace: 'DeviceRGB', BitsPerComponent: 8 });
  page.node.setXObject(PDFName.of('Lam'), doc.context.register(img));
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(W, 0, 0, H, 0, 0), drawObject('Lam'), popGraphicsState());
  fs.writeFileSync(file, await doc.save());
}
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-editor-'));
  const xlsx = path.join(tmp, 'cotizacion.xlsx'); const jpg = path.join(tmp, 'cedula.jpg'); const plano = path.join(tmp, 'plano_A0.pdf');
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Ítem', 'Cantidad', 'Precio'], ['Pintura', 3, 45000], ['Mano de obra', 1, 120000], ['Total', '', 255000]]), 'Cotización'); XLSX.writeFile(wb, xlsx);
  await planoA0(plano);
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${path.join(tmp, 'ud')}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_INMO_DIR: path.join(tmp, 'inmo') } });
  fs.writeFileSync(jpg, Buffer.from(await app.evaluate(({ nativeImage }, png) => nativeImage.createFromPath(png).toJPEG(85).toString('base64'), F('foto.png')), 'base64'));
  ok(fs.statSync(jpg).size > 1000, 'foto JPG de ejemplo');
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message)); w.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  const shot = (n) => w.screenshot({ path: path.join(__dirname, n) }).catch(() => w.screenshot({ path: path.join(__dirname, n) })).catch(() => {});
  const waitIdle = () => w.waitForFunction(() => document.querySelector('#edBusy')?.classList.contains('hidden') ?? true, null, { timeout: 120000 });
  const ov = () => w.evaluate(() => Object.values(window.editor._state.overlays).flat().map((o) => ({ type: o.type, html: o.html || '' })));
  try {
    await w.setViewportSize({ width: 1400, height: 900 });
    await w.waitForFunction(() => window.studio && window.Inmo && window.editor, null, { timeout: 20000 }); await w.waitForTimeout(300);
    // iniciar sesión (arriba a la derecha) y el editor vacío
    await w.click('#topLoginBtn'); await w.waitForSelector('#view-login:not(.hidden) #loginBtn'); await w.click('#loginBtn'); await w.waitForSelector('#topLoginBtn.hidden', { state: 'attached', timeout: 15000 });
    ok(await w.evaluate(() => window.isMember()), 'sesión iniciada');
    await w.evaluate(() => window.studio.goEditor()); await w.waitForSelector('#edOpenBtn:visible');
    ok(true, 'el editor sin documento ofrece «Abrir…»'); await shot('e0-empty.png');

    // 1) combinar: Word + Excel + imagen + PDF
    const t0 = Date.now();
    await w.evaluate((ps) => window.editor.openPaths(ps, true), [F('contrato.docx'), xlsx, jpg, F('contrato_prueba.pdf')]);
    await w.waitForSelector('#edCanvas', { timeout: 60000 }); await waitIdle(); await w.waitForTimeout(800);
    const count1 = await w.evaluate(() => window.editor._state.count);
    ok(count1 >= 4, `combina Word, Excel, imagen y PDF en un documento (${count1} páginas, ${Date.now() - t0} ms)`);
    await shot('e1-combined.png');

    // 2) herramientas en la página 1: agregar texto y tapar
    await w.evaluate(() => window.editor.goto(0)); await w.waitForTimeout(400);
    let b = await (await w.$('#edCanvas')).boundingBox();
    await w.click('.tool[data-tool="text"]'); await w.mouse.move(b.x + 60, b.y + 40); await w.mouse.down(); await w.mouse.move(b.x + 300, b.y + 70, { steps: 5 }); await w.mouse.up(); await w.waitForTimeout(200);
    await w.keyboard.type('Anexo N° 1 — revisado'); await w.keyboard.press('Escape');
    await w.click('.tool[data-tool="whiteout"]'); await w.mouse.move(b.x + 300, b.y + 200); await w.mouse.down(); await w.mouse.move(b.x + 450, b.y + 230, { steps: 4 }); await w.mouse.up();
    await w.click('.tool[data-tool="select"]'); await w.waitForTimeout(300);
    const o1 = await ov();
    ok(o1.some((o) => o.type === 'rich' && /Anexo N° 1/.test(o.html)), 'agregar texto en la página');
    ok(o1.some((o) => o.type === 'whiteout'), 'tapar un área');
    await shot('e2-tools.png');

    // 3) organizar: mover la última página al inicio, rotar la 2, exportar
    const name0 = await w.evaluate(async () => { const T = window.editor._state; const p = await T.pdf.getPage(T.count); return (await p.getTextContent()).items.map((i) => i.str).join(''); });
    await w.evaluate(async () => { await window.editor.move(window.editor._state.count - 1, 0); }); await waitIdle();
    const name1 = await w.evaluate(async () => { const p = await window.editor._state.pdf.getPage(1); return (await p.getTextContent()).items.map((i) => i.str).join(''); });
    ok(name0.length > 0 && name1 === name0 && (await w.evaluate(() => window.editor._state.count)) === count1, 'mover la última página al inicio');
    await w.evaluate(async () => { window.editor._state.selected = new Set([1]); await window.editor.rotate(90); window.editor._state.selected.clear(); }); await waitIdle();
    ok(await w.evaluate(async () => (await window.editor._state.pdf.getPage(2)).rotate === 90), 'rotar la página 2');
    const b64a = await w.evaluate(() => window.editor.exportBase64()); const outA = Buffer.from(b64a, 'base64'); fs.writeFileSync(path.join(__dirname, 'out-combined.pdf'), outA);
    const docA = await PDFDocument.load(outA); ok(docA.getPageCount() === count1 && docA.getPage(1).getRotation().angle === 90, 'el PDF exportado lleva las páginas, el orden y la rotación');

    // 4) plano A0 de más de 20 MB: enviar sin comprimir avisa, comprimir, numerar
    await w.evaluate((p) => window.editor.openPaths([p], true), plano); await waitIdle(); await w.waitForTimeout(1500);
    const size0 = await w.evaluate(() => window.editor._state.bytes.length);
    ok(size0 > 20e6, `plano A0 abierto (${(size0 / 1e6).toFixed(1)} MB)`);
    await shot('e3-plano.png');
    await w.click('#edSend'); await w.waitForSelector('#modal:not(.hidden) #mOk', { timeout: 60000 });
    const aviso = await w.textContent('#modalCard h2'); console.log('   aviso:', aviso);
    ok(/muy pesado/i.test(aviso) && /20 MB/.test(await w.textContent('#modalCard')), 'enviar un PDF de más de 20 MB avisa y ofrece comprimir');
    await shot('e4-toobig.png');
    await w.click('#mOk'); await w.waitForTimeout(500); await waitIdle(); await w.waitForTimeout(500);
    const size1 = await w.evaluate(() => window.editor._state.bytes.length);
    console.log('   plano', (size0 / 1e6).toFixed(1), 'MB →', (size1 / 1e6).toFixed(1), 'MB');
    ok(size1 < 20e6 && size1 < size0, 'comprimir lo deja bajo 20 MB');
    await w.evaluate(() => window.editor.number()); await w.waitForSelector('#modal:not(.hidden) #mOk'); await w.click('#mOk'); await waitIdle();
    const b64b = await w.evaluate(() => window.editor.exportBase64()); const outB = Buffer.from(b64b, 'base64'); fs.writeFileSync(path.join(__dirname, 'out-plano.pdf'), outB);
    ok(outB.length > size1, 'numerar páginas cambia el documento');
    await shot('e5-plano-final.png');

    // 5) enviar a firmar → pasa a «Revisar»
    await w.click('#edSend'); await w.waitForSelector('#view-review:visible', { timeout: 60000 });
    ok(/plano_A0/.test(await w.textContent('#fileChip') || ''), 'enviar a firmar lleva al flujo de revisión');
    const bad = errs.filter((e) => !/Warning|font/i.test(e)); console.log('errores:', bad); if (bad.length) process.exitCode = 1;
  } catch (e) { console.error('FAIL', e.message); console.log('errores:', errs); await shot('e-error.png'); process.exitCode = 1; }
  finally { await w.evaluate(() => window.pf.closeNow?.()).catch(() => {}); await app.close().catch(() => {}); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(process.exitCode || 0); }
})();
