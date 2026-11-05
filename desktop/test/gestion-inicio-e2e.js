// Gestión documental en React: el inicio (acciones, herramientas, Notaría, recientes, plantillas) y «Recientes»
// (búsqueda, tipo, quitar, quitar los que no existen, borrar la lista).
// Requiere el bundle compilado: yarn build:ui
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };

(async () => {
  const raiz = path.join(__dirname, '..');
  if (!fs.existsSync(path.join(raiz, 'src/renderer/react/react-ui.js'))) throw new Error('Falta el bundle: corre «yarn build:ui» antes');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-gd-'));
  // documentos de prueba: 3 PDF, 1 Word, 1 imagen (existen) y uno que ya no está
  const docs = ['contrato-a.pdf', 'contrato-b.pdf', 'poder.pdf', 'minuta.docx', 'cedula.png'].map((n) => { const p = path.join(tmp, n); fs.copyFileSync(path.join(__dirname, 'fixtures', 'contrato_prueba.pdf'), p); return p; });
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${path.join(tmp, 'ud')}`], cwd: raiz, env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: path.join(tmp, 'inmo') } });
  const w = await app.firstWindow(); const errs = [];
  w.on('pageerror', (e) => errs.push(e.message)); w.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const txt = (s) => w.innerText(s).then((t) => (t || '').replace(/\s+/g, ' '));
  const filas = () => w.$$eval('#view-recientes .rec-row', (x) => x.length);
  try {
    await w.setViewportSize({ width: 1500, height: 950 });
    await w.waitForFunction(() => window.studio && window.ReactUI, null, { timeout: 15000 }); await w.waitForTimeout(400);
    // uno más que se borra después de abrirlo: queda en la lista como «no encontrado» (lo inexistente no se agrega)
    const perdido = path.join(tmp, 'perdido.pdf'); fs.copyFileSync(docs[0], perdido);
    await w.evaluate(async (l) => { await window.pf.recentClear(); for (const p of l) await window.pf.recentAdd(p); }, [perdido, ...docs]);
    fs.unlinkSync(perdido);

    await w.click('#nav [data-view="home"]'); await w.waitForSelector('#homeBody .hub-card');
    ok(/Gestión documental/.test(await txt('#homeBody h1')), 'abre el inicio de Gestión documental');
    ok((await w.$$('#homeBody .hub-card')).length >= 13 && (await w.$$('#homeBody .tool-chip')).length === 7, 'lo esencial, lo que ahorra tiempo, lo avanzado y las 7 herramientas de PDF');
    ok(!!(await w.$('#homeBody [data-act="send"][data-member] .lock-badge')), 'lo exclusivo para clientes lleva candado');
    ok(!!(await w.$('#hubAgQ')) && !!(await w.$('#hubDrop')) && !!(await w.$('.hn-card[data-act="tpl"]')), 'preguntarle al Agente, abrir arrastrando y la Notaría');
    await w.waitForFunction(() => document.querySelector('#tplLibHost')?.childElementCount > 0, null, { timeout: 8000 });
    ok(true, 'la biblioteca de plantillas (plantillas.js) se dibuja en su contenedor');
    await w.waitForSelector('#homeBody .recent-item');
    ok((await w.$$('#homeBody .recent-item')).length === 3 && /Ver todos \(6\)/.test(await txt('#recAll')), 'muestra los 3 últimos recientes y «Ver todos (6)»');

    await w.click('#homeBody [data-act="exp"]'); await w.waitForSelector('#view-expedientes:not(.hidden)');
    ok(true, 'cada acción abre su parte (Expedientes)');

    await w.click('#nav [data-view="home"]'); await w.waitForSelector('#recAll'); await w.click('#recAll'); await w.waitForSelector('#view-recientes .rec-row');
    ok(await filas() === 6 && /6 documentos/.test(await txt('#view-recientes .ops-head')), 'Recientes lista los 6');
    ok(/no encontrado/.test(await txt('#view-recientes .rec-row.miss')), 'el que ya no está aparece como «no encontrado»');
    await w.click('#view-recientes [data-tipo="pdf"]'); await w.waitForFunction(() => document.querySelectorAll('#view-recientes .rec-row').length === 4);
    ok(true, 'filtro por tipo: PDF');
    await w.click('#view-recientes [data-tipo=""]'); await w.fill('#rcQ', 'contrato'); await w.waitForFunction(() => document.querySelectorAll('#view-recientes .rec-row').length === 2);
    ok(true, 'busca por nombre');
    await w.fill('#rcQ', ''); await w.waitForFunction(() => document.querySelectorAll('#view-recientes .rec-row').length === 6);
    await w.click('#view-recientes .rec-row[data-path$="poder.pdf"] [data-rm]'); await w.waitForFunction(() => document.querySelectorAll('#view-recientes .rec-row').length === 5);
    ok(true, 'quitar uno de la lista');
    await w.click('#rcMiss'); await w.waitForFunction(() => document.querySelectorAll('#view-recientes .rec-row').length === 4);
    ok(!(await w.$('#rcMiss')), '«Quitar los que no existen»');
    await w.click('#rcClear'); await w.waitForSelector('#modalCard #mOk'); await w.click('#mOk');
    await w.waitForSelector('#view-recientes .recent-empty');
    ok(/Aquí aparecerán/.test(await txt('#view-recientes .recent-empty')), '«Borrar lista» pide confirmar y la vacía');
    ok(docs.every((p) => fs.existsSync(p)), 'los archivos no se borran, solo la lista');

    // cuando el proceso principal avisa que cambió la lista (recent-changed, p. ej. desde el menú «Abrir reciente»),
    // home.js lo pasa a React (evento pf:recientes) y la pantalla vuelve a leerla
    await w.evaluate((p) => window.pf.recentAdd(p), docs[0]);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('recent-changed'));
    await w.waitForSelector('#view-recientes .rec-row');
    ok(await filas() === 1, 'cuando el proceso principal avisa un cambio, Recientes se actualiza sola');

    const relevantes = errs.filter((e) => /Content Security Policy|ReactUI|react|removeChild|insertBefore|not a child/i.test(e));
    ok(relevantes.length === 0, 'sin errores de React ni de CSP' + (relevantes.length ? ': ' + relevantes.join(' | ') : ''));
    console.log('\ngestion-inicio-e2e: todo bien');
  } finally { await app.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exit(1); });
