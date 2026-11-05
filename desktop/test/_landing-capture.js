const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os'); const http = require('http');
const OUT = '/home/claude/scratch/landing/shots'; fs.mkdirSync(OUT, { recursive: true });
const R = '/home/claude/portalfirma-desktop';
const pdfFix = fs.readFileSync(path.join(R, 'test/fixtures/contrato_prueba.pdf'));
const U = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const NAMES = ['Contrato de arrendamiento Depto 1204', 'Poder especial trámites SII', 'Contrato de prestación de servicios', 'Promesa de compraventa Las Condes', 'Anexo contrato de trabajo', 'Declaración jurada de domicilio', 'Mandato venta vehículo', 'Contrato de arriendo local comercial', 'Finiquito laboral', 'Acuerdo de confidencialidad'];
const P = ['Camila Fuentes Ruiz', 'Andrés Salazar Mena', 'María José Rojas', 'Felipe Contreras', 'Daniela Pino Araya'];
const row = (op, stage, i, all) => ({ status: stage, signers: [0, 1].map((k) => ({ number: k + 1, signed: k === 0 || all, status: 'x', fullName: P[(i + k) % 5], isSignatory: true })), contract: { id: U(i), legalized: stage === 'finalized' && i % 3 === 0 ? U(900 + i) : null, operation: op, updateDate: new Date(Date.now() - i * 86400000 * 2).toISOString(), createdDate: new Date(Date.now() - i * 86400000 * 2 - 3600e3).toISOString(), document_des: NAMES[i % NAMES.length], document_name: 'generic' } });
const DATA = { starting: [row(24131, 'starting', 1)], process: [row(24129, 'process', 2), row(24125, 'process', 4), row(24118, 'process', 7)], finalized: Array.from({ length: 22 }, (_, i) => row(24127 - i * 3, 'finalized', 3 + i, true)) };
const srv = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
  const body = b ? JSON.parse(b) : null; const J = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (req.url === '/api/partnerUser/validate') return J({ success: true, data: { token: 't1', refreshToken: 'r1', entity_id: 'E1', user_id: 'U1', role: 'admin', email: 'camila@estudiofuentes.cl', nameEntity: 'Estudio Fuentes Abogados', namePerson: 'Camila Fuentes' } });
  if (req.url === '/api/contractPartner/getPaginatedContracts') { const a = DATA[body.stage] || []; return J({ success: true, data: { data: a.length ? a : null, pagination: { totalPages: 1 } } }); }
  if (req.url === '/api/contractPartner/getPaginatedUnpaidContracts') return J({ success: true, data: { data: null, pagination: { totalPages: 1 } } });
  if (req.url.startsWith('/api/walletPartner')) return J({ success: true, data: { amount: 184500 } });
  if (req.url === '/api/contractSignatory/getByContractId') return J({ success: true, data: [{ fullName: 'Camila Fuentes Ruiz', rut: '15.234.567-8', email: 'camila@estudiofuentes.cl', signed: true }, { fullName: 'Andrés Salazar Mena', rut: '12.876.543-2', email: 'asalazar@correo.cl', signed: true }] });
  if (req.url === '/api/file/getById') return J({ success: true, data: { name: 'Contrato.pdf', base64: pdfFix.toString('base64') } });
  J({ success: true, data: {} });
}); }).listen(0, '127.0.0.1');
(async () => {
  await new Promise((r) => srv.on('listening', r));
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfland-')); const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pflt-'));
  const { DOCS, pdf } = require(path.join(R, 'test/plazos-docs'));
  const docs = []; for (const [n, t] of Object.entries(DOCS)) { const f = path.join(tmp, n); fs.writeFileSync(f, await pdf(t)); docs.push(f); }
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: R, env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_API_BASE: `http://127.0.0.1:${srv.address().port}/api`, PF_EXP_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'pfle-')) } });
  const w = await app.firstWindow(); await w.setViewportSize({ width: 1440, height: 900 }); await w.waitForFunction(() => window.studio && window.Inmo, null, { timeout: 15000 }); await w.waitForTimeout(300); await w.evaluate(() => window.studio.goHome()); await w.waitForSelector('.hub-card');
  const sleep = (ms) => w.waitForTimeout(ms); const shot = async (n) => { await w.evaluate(() => { const t = document.querySelector('#toast'); if (t) t.style.display = 'none'; document.querySelectorAll('.recent-item .pt').forEach((x) => (x.textContent = '/Users/camila/Documentos/Contratos')); document.querySelectorAll('.xp-chips, .xp-file small').forEach(() => {}); }); await w.screenshot({ path: path.join(OUT, n + '.png') }); await w.evaluate(() => { const t = document.querySelector('#toast'); if (t) t.style.display = ''; }); };
  await w.evaluate(() => window.ApiDiag.login(() => {})); await w.fill('#adEmail', 'camila@estudiofuentes.cl'); await w.fill('#adPass', 'x'); await w.click('#mOk'); await sleep(1200);
  // recientes para el inicio
  for (const d of docs.slice(0, 3)) await w.evaluate((p) => window.pf.recentAdd?.(p), d).catch(() => {});
  await w.evaluate(() => window.studio.goHome()); await sleep(800); await shot('home');
  // editor
  const contrato = docs[0];
  await w.evaluate((p) => window.editor.openPaths([p], true), contrato); await w.waitForSelector('#edCanvas', { timeout: 30000 }); await sleep(1500); await shot('editor');
  // asistente
  await w.click('#edPanelTabs [data-pt="ai"]'); await sleep(800);
  if (await w.$('#aiFree')) { await w.click('#aiFree'); await sleep(500); }
  if (await w.$('#aiReview')) { await w.click('#aiReview'); await sleep(600); if (await w.$('#modal:not(.hidden) #mOk')) { await w.click('#mOk'); } await w.waitForSelector('.ai-item', { timeout: 20000 }).catch(() => {}); await sleep(800); }
  await shot('asistente');
  // operaciones
  await w.evaluate(() => { show('ops'); return window.Operaciones.open(); }); await w.waitForSelector('.ops-row', { timeout: 20000 }); await sleep(800);
  await w.click('.ops-row >> nth=1'); await w.waitForSelector('#opdCanvas canvas', { timeout: 20000 }).catch(() => {}); await sleep(1000); await shot('operaciones');
  // plazos
  await w.evaluate(() => window.Plazos.open()); await w.waitForSelector('#plAdd'); const r = await w.evaluate((p) => window.pf.plazosAdd(p), docs); await w.evaluate((r) => window.Plazos.afterAdd(r), r);
  await w.waitForFunction(() => window.Plazos._p.items.length >= 4 && window.Plazos._p.items.every((x) => x.status === 'done') && !window.Plazos._p.running, null, { timeout: 60000 }); await sleep(500);
  await w.click('.plz-row:not(.bk-th) >> nth=0'); await sleep(800); await shot('plazos');
  // expedientes
  await w.evaluate(() => window.Expedientes.open()); await w.waitForSelector('#xpNew'); await w.click('#xpNew'); await w.waitForSelector('#xnName');
  await w.fill('#xnName', 'Depto Av. Providencia 1234'); await w.selectOption('#xnType', 'propiedad'); await w.fill('#xnNotes', 'Arriendo 2026 · Inversiones Los Robles'); await w.click('#mOk'); await w.waitForSelector('.xp-head');
  const id = await w.evaluate(() => window.Expedientes._x.sel);
  const fx = path.join(R, 'test/fixtures'); const files = [[docs[0], 'Contrato de arriendo.pdf'], [path.join(fx, 'cedula.jpg'), 'Cédula arrendatario.jpg'], [path.join(fx, 'contrato.docx'), 'Inventario.docx'], [path.join(fx, 'cotizacion.xlsx'), 'Gastos comunes.xlsx'], [docs[1], 'Anexo de contrato.pdf']].map(([s, n]) => { const d = path.join(tmp, n); fs.copyFileSync(s, d); return d; });
  await w.evaluate(([id, f]) => window.pf.expAddFiles(id, f), [id, files]); await w.evaluate((id) => window.Expedientes.open(id), id); await w.waitForSelector('.xp-file'); await sleep(600); await shot('expedientes');
  // ayuda
  await w.evaluate(() => window.studio.goHome()); await sleep(500); await w.click('#helpFab'); await w.waitForSelector('#helpPanel.open'); await w.fill('#hpQ', '¿cómo envío un contrato a firmar?'); await sleep(500); await shot('ayuda');
  await w.evaluate(() => window.pf.closeNow()).catch(() => {}); await app.close().catch(() => {}); srv.close(); console.log('ok'); process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
