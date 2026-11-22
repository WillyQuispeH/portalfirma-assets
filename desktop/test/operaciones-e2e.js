// Mis operaciones sincronizadas, versiones, vista previa, descargar/compartir; carga masiva (la firma masiva con certificado se quitó).
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfop-'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pfbk-'));
  const docs = [];
  for (let i = 1; i <= 7; i++) { const f = path.join(tmp, `Contrato ${i}.pdf`); const b = fs.readFileSync(path.resolve(__dirname, 'fixtures', 'contrato_prueba.pdf')); fs.writeFileSync(f, Buffer.concat([b, Buffer.from(`\n%${i}\n`)])); docs.push(f); }
  fs.copyFileSync(docs[0], path.join(tmp, 'Copia.pdf')); docs.push(path.join(tmp, 'Copia.pdf'));
  fs.writeFileSync(path.join(tmp, 'nota.txt'), 'x'); docs.push(path.join(tmp, 'nota.txt'));
  docs.push(path.resolve(__dirname, 'fixtures', 'contrato.docx'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1' } });
  const w = await app.firstWindow(); const errs = global.__errs = []; w.on('pageerror', (e) => errs.push('PAGE: ' + e.message)); w.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await w.setViewportSize({ width: 1440, height: 900 }); await w.waitForFunction(() => window.studio && window.Inmo, null, { timeout: 15000 }); await w.waitForTimeout(300); await w.evaluate(() => window.studio.goHome()); await w.waitForSelector('.hub-card');
  const sleep = (ms) => w.waitForTimeout(ms);
  await app.evaluate(({ dialog }, d) => { dialog.showSaveDialog = async (_w, o) => ({ canceled: false, filePath: d + '/' + String(o.defaultPath).split(/[\\/]/).pop() }); dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [d] }); }, tmp);

  console.log('Mis operaciones');
  await w.click('.hub-card[data-act="ops"]'); await w.waitForSelector('#opPhone');
  ok(/teléfono con el que te registraste/.test(await w.textContent('#modalCard')), 'pide el teléfono de la cuenta la primera vez');
  await w.fill('#opPhone', '9 8727 6858'); await w.click('#mOk');
  await w.waitForFunction(() => document.querySelectorAll('.op-fila').length >= 10, null, { timeout: 30000 });
  const n = await w.locator('.op-fila').count(); ok(n === 15, `sincroniza todas las operaciones, también las de más de un año (${n})`);
  await w.waitForFunction(() => !window.Operaciones._ops.prefetching && window.Operaciones._ops.items.every((x) => x.status), null, { timeout: 60000 });
  const f = await w.evaluate(() => Object.fromEntries([...document.querySelector('#opsFilters').options].map((o) => [o.value, Number((o.textContent.match(/\((\d+)\)/) || [])[1] || 0)])));
  console.log('    filtros:', JSON.stringify(f));
  ok(f.notary > 0 && f.signed > 0 && f.pending > 0 && f.all === 15, 'filtros con conteos (firmadas, legalizadas, en firma)');
  await w.selectOption('#opsFilters', 'notary'); await sleep(200);
  ok(await w.locator('.op-fila').count() === f.notary, 'filtrar legalizadas/protocolizadas');
  await w.selectOption('#opsFilters', 'all'); await w.fill('#opsQ', 'mandato'); await sleep(200);
  ok(await w.locator('.op-fila').count() >= 1 && (await w.locator('.op-fila').allTextContents()).every((t) => /Mandato/i.test(t)), 'buscar por nombre');
  await w.fill('#opsQ', ''); await sleep(100);
  await w.click('.op-fila[data-op="20900"]'); await w.waitForSelector('.op-versiones');
  const vs = await w.evaluate(() => [...document.querySelectorAll('.op-version')].map((e) => e.dataset.version + ':' + (e.hasAttribute('data-listo') ? 'completado' : 'pendiente')));
  console.log('    versiones:', vs.join(' · '));
  ok(vs.join() === 'original:completado,signed:completado,legalized:completado', 'versiones del documento (original, firmado, legalizado), cada una con su estado');
  ok(/Documento Legalizado/.test(await w.textContent('.op-prev header, .op-prev')) && !(await w.$('.op-etapas')), 'a la derecha se ve la versión más avanzada, con su nombre (ya no hay barra de etapas)');
  await w.waitForSelector('#opdCanvas canvas', { timeout: 20000 }); ok(true, 'vista previa del documento');
  ok(/2 de 2 firmaron/.test(await w.textContent('.op-firmas header')), 'firmantes y estado');
  await sleep(500);
  const g = await w.evaluate(() => {
    const det = document.querySelector('.op-detalle'); const barra = document.querySelector('#opdBarra'); const prev = document.querySelector('.op-prev'); const cv = document.querySelector('#opdCanvas canvas'); const lado = document.querySelector('.op-lado');
    const tit = document.querySelector('.op-versiones h3'); const pr = prev.getBoundingClientRect(); const c = cv.getBoundingClientRect();
    return { tag: det.tagName, borde: getComputedStyle(det).borderTopWidth, textoBarra: barra.textContent, refresca: !!barra.querySelector('#opdRef'), titulo: getComputedStyle(tit).backgroundClip, prevScroll: prev.scrollHeight - prev.clientHeight, canvasDentro: c.bottom <= pr.bottom + 1 && c.top >= pr.top, ladoScroll: getComputedStyle(lado).overflowY, ladoDesborda: lado.scrollHeight > lado.clientHeight, cardsDirectas: [...document.querySelector('#opsDetail .op-det').children].every((e) => e.id === 'opdBarra' || e.classList.contains('op-cuerpo')) };
  });
  ok(/Operación\s*20900/.test(g.textoBarra) && /Fecha\s*\d\d\/\d\d\/\d{4} \d\d:\d\d/.test(g.textoBarra) && /Estado\s*\S+/.test(g.textoBarra) && g.refresca, `arriba hay una barra con número de operación, fecha, estado y el botón de actualizar («${g.textoBarra.replace(/\s+/g, ' ').trim()}»)`);
  ok(g.tag === 'DIV' && g.borde === '0px' && g.cardsDirectas, 'el detalle no tiene contenedor: solo la barra y las cards ordenadas');
  ok(g.titulo === 'text', 'el título de las Card tiene el degradado de la marca');
  ok(g.canvasDentro && g.prevScroll <= 1, 'el documento se ve entero, sin scroll (la hoja se ajusta a su espacio)');
  ok(g.ladoScroll === 'auto' && g.ladoDesborda, 'solo el lado izquierdo tiene scroll');
  await w.screenshot({ path: path.resolve(__dirname, 'o1-operacion.png') });
  // «Ver» cambia la versión que se muestra (y la que se pide a Portalfirma)
  await w.click('.op-version[data-version="original"] [data-ver]'); await w.waitForFunction(() => /Documento Original/.test(document.querySelector('.op-prev').textContent)); await w.waitForSelector('#opdCanvas canvas', { timeout: 20000 });
  ok(await app.evaluate(() => (globalThis.__llamadasIntegracion || []).some((x) => /archivos\/.+\?version=original/.test(x.ruta))), '«Ver» el original pide ese archivo a Portalfirma (?version=original)');
  ok(!(await w.$('#opdAll')) && !(await w.$('[data-v]')), 'sin descargas por versión: se baja la que se está viendo');
  await w.click('#opdDl'); await sleep(900); console.log('    toast:', await w.textContent('#toast'), fs.readdirSync(tmp).join(','));
  ok(fs.readdirSync(tmp).some((x) => /^20900 - Contrato de arrendamiento \(original\)\.pdf$/.test(x)), 'descargar baja la versión que se ve (con su nombre)');
  await w.click('.op-fila[data-op="20886"]'); await w.waitForSelector('.op-reenviar');
  ok(await w.locator('.op-reenviar').count() === 1, 'operación en firma: acciones para el firmante pendiente');
  ok(await w.evaluate(() => [...document.querySelectorAll('.op-version')].map((e) => e.dataset.version + ':' + (e.hasAttribute('data-listo') ? 'ok' : 'pend')).join()) === 'original:ok,signed:pend', 'una operación aún en firma: el original está completado y el firmado pendiente (sin «Ver»)');
  ok(await w.locator('.op-version[data-version="signed"] [data-ver][disabled]').count() === 1, 'el botón «Ver» de lo pendiente está desactivado');
  await w.click('.op-reenviar [data-reenviar]'); await w.waitForSelector('#mOk:has-text("Reenviar")'); ok(/canal que tenga/.test(await w.textContent('#modalCard')), 'reenviar enlace pide confirmación (Portalfirma elige el canal)'); await w.click('#mCancel');

  console.log('Carga masiva');
  await w.click('#opsBulk'); await w.waitForSelector('#bkDrop');
  await w.evaluate((p) => window.pf.bulkAdd(p), docs);
  await w.waitForFunction(() => window.Masiva._bk.st.items.length === 10 && window.Masiva._bk.st.items.every((x) => !['queued', 'converting', 'uploading', 'analyzing'].includes(x.status)), null, { timeout: 120000 });
  const st = await w.evaluate(() => window.Masiva._bk.st.items.map((x) => x.status + ':' + x.name));
  console.log('   ', st.join(' | '));
  ok(st.filter((x) => x.startsWith('needs_data')).length === 8, '8 analizados (incluido el Word convertido); avisa que faltan correo y teléfono');
  ok(st.some((x) => /skipped:Copia/.test(x)) && st.some((x) => /skipped:nota/.test(x)), 'omite duplicados y formatos no admitidos');
  ok(await w.evaluate(() => /rol real/.test((window.Masiva._bk.st.items[0].missing || []).join(' '))), 'un rol genérico («cliente») se pide antes de enviar: Portalfirma lo rechaza');
  ok(await w.locator('.bk-card').count() === 10 && !(await w.$('#bkTable')), 'cada documento es una tarjeta con su PDF, en una fila (no hay tabla)');
  await w.screenshot({ path: path.resolve(__dirname, 'o2-masiva.png') });

  // la firma masiva con certificado ya no existe (la API de integración de Portalfirma no la ofrece): ni la pestaña ni sus llamadas
  ok(!(await w.$('#bkTabs')) && !(await w.$('#cdsRut')), 'la carga masiva ya no ofrece la firma con certificado');
  ok(await w.evaluate(() => typeof window.pf.cdsPending === 'undefined' && typeof window.pf.manage === 'undefined' && typeof window.pf.byRut === 'undefined'), 'y la app ya no expone esas llamadas del MCP');
  const bad = errs.filter((e) => !/Warning|deprecated|font|TT:/i.test(e)); console.log('errores:', bad); if (bad.length) process.exitCode = 1;
  await w.evaluate(() => window.pf.closeNow()).catch(() => {}); await app.close().catch(() => {}); process.exit(process.exitCode || 0);
})().catch((e) => { console.error('FAIL', e); console.error(global.__errs); process.exit(1); });
