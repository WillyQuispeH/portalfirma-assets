// Inicio de Gestión documental: Layout del kit, bloque «Notaría» al centro (Gestión de firmas presenciales + Notaría virtual),
// 3 recientes en el inicio y «Recientes» (dentro de Gestión documental) con búsqueda, filtro por tipo y páginas de 20.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfin-')); const docs = fs.mkdtempSync(path.join(os.tmpdir(), 'pfin-docs-'));
  const files = []; for (let i = 1; i <= 45; i++) { const ext = i % 9 === 0 ? 'docx' : i % 7 === 0 ? 'xlsx' : 'pdf'; const f = path.join(docs, `Contrato ${String(i).padStart(2, '0')}.${ext}`); fs.writeFileSync(f, 'x'.repeat(1000 * i)); files.push(f); }
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_INMO_DIR: path.join(userData, 'inmo') } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const txt = (s) => w.textContent(s).then((t) => t || '');
  const filas = () => w.$$eval('#view-recientes .rec-row', (x) => x.length);
  const recientes = async () => { await w.click('#nav [data-view="home"]'); await w.waitForSelector('#recAll'); await w.click('#recAll'); await w.waitForSelector('#view-recientes:not(.hidden) .ops-head'); };
  try {
    await w.setViewportSize({ width: 1500, height: 920 }); await w.waitForFunction(() => window.studio && window.ReactUI, null, { timeout: 20000 }); await w.waitForTimeout(400);
    await w.click('#nav [data-view="home"]'); await w.waitForSelector('#homeBody .hub-card'); await w.waitForTimeout(500);
    ok(!!(await w.$('#homeBody [data-layout] [data-layout-fondo]')), 'el inicio usa el Layout del kit (con su fondo)');
    ok(await w.isVisible('.hub-center .hub-not [data-act="escr"]') && await w.isVisible('.hub-center .hub-not [data-act="tpl"]') && !(await w.$('.hub-col [data-act="escr"]')), 'Notaría al centro: Gestión de firmas presenciales y Notaría virtual');
    ok(/Gestión de firmas presenciales/.test(await txt('.hub-not')) && !/Trámites notariales/.test(await txt('#homeBody')), 'ya no dice «Trámites notariales»');
    for (const f of files) await w.evaluate((p) => window.pf.recentAdd(p), f);
    await w.evaluate(() => window.studio.goHome()); await w.waitForSelector('#recAll'); await w.waitForTimeout(300);
    ok((await w.$$('.hub-panel .recent-item')).length === 3 && /Contrato 45/.test(await txt('.hub-panel .recent-list')), 'el inicio muestra los 3 últimos');
    ok(/Ver todos \(45\)/.test(await txt('#recAll')), '«Ver todos» indica el total');
    await w.screenshot({ path: path.resolve(__dirname, 'in1-inicio.png') }).catch(() => {});
    await w.click('#recAll'); await w.waitForSelector('#view-recientes .rec-row');
    ok(await w.isVisible('#view-recientes') && /active/.test(await w.getAttribute('#nav .tab[data-view="home"]', 'class')), 'abre Recientes, dentro de Gestión documental');
    ok(await filas() === 20 && /Mostrando 1–20 de 45/.test(await txt('#view-recientes .rec-pag')), 'página 1: 20 de 45');
    await w.screenshot({ path: path.resolve(__dirname, 'in2-recientes.png'), fullPage: true }).catch(() => {});
    await w.click('#view-recientes .rec-pg [data-pg="3"]'); await w.waitForTimeout(300);
    ok(await filas() === 5 && /41–45 de 45/.test(await txt('#view-recientes .rec-pag')), 'página 3: los 5 restantes');
    await w.fill('#rcQ', 'contrato 1'); await w.waitForTimeout(400);
    ok(await filas() === 10 && !(await w.$('#view-recientes .rec-pag')), 'búsqueda: 10 resultados en una sola página');
    await w.fill('#rcQ', ''); await w.waitForTimeout(300); await w.click('#view-recientes [data-tipo="doc"]'); await w.waitForTimeout(300);
    ok(await filas() === 5, 'filtro por tipo: Word');
    await w.click('#view-recientes [data-tipo=""]'); await w.waitForTimeout(200);
    fs.unlinkSync(files[44]); await recientes(); await w.waitForSelector('#rcMiss');
    ok(/no encontrado/.test(await txt('#view-recientes .rec-row')), 'marca los que ya no existen');
    await w.click('#rcMiss'); await w.waitForTimeout(300); ok(/44 documentos/.test(await txt('#view-recientes .ops-head')), 'quita los que no existen');
    await w.hover('#view-recientes .rec-row'); await w.click('#view-recientes .rec-row [data-rm]'); await w.waitForTimeout(300); ok(/43 documentos/.test(await txt('#view-recientes .ops-head')), 'quitar uno de la lista');
    await w.click('#view-recientes .rec-row'); await w.waitForTimeout(800); ok(await w.isVisible('#view-editor'), 'abrir un reciente lo abre en el editor');
    await recientes(); await w.waitForSelector('#rcClear'); await w.click('#rcClear'); await w.waitForSelector('#modal:not(.hidden) #mOk'); await w.click('#mOk'); await w.waitForTimeout(300);
    ok(/0 documentos/.test(await txt('#view-recientes .ops-head')) && /Aquí aparecerán/.test(await txt('#view-recientes .rec-card')), 'borrar la lista (sin borrar archivos)');
    ok(fs.existsSync(files[0]), 'los archivos siguen en su carpeta');
    await w.click('#nav [data-view="home"]'); await w.waitForSelector('.hub-not'); await w.click('.hn-card.main'); await w.waitForSelector('.es-layout');
    ok(/Gestión de firmas presenciales/.test(await txt('#view-escrituras .ops-head h2')), 'abre Gestión de firmas presenciales');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK inicio');
  } catch (e) { console.error(e.message); await w.screenshot({ path: path.resolve(__dirname, 'in-error.png') }).catch(() => {}); process.exitCode = 1; } finally { await w.evaluate(() => window.pf.closeNow?.()).catch(() => {}); await app.close().catch(() => {}); }
})();
