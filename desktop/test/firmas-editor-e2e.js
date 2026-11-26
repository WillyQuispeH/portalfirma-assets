// «Enviar a firmar» (editor): el documento se muestra con «Ubicar las firmas» (agenda/PdfConFirmas.tsx). Cada firmante es un recuadro que se
// arrastra al lugar del PDF donde firma; arranca en la página donde la IA de Asset encontró su línea de firma. Las posiciones viajan con el
// envío (POST /firmas-envio/pdf › posiciones, en el orden de los firmantes); con «Página de firmas» no viajan. Ya no se pide correo del
// pagador ni código de descuento. Se entra por el inicio de Gestión documental (como word-send-e2e). Las llamadas al servidor se capturan
// en el proceso principal (mock.integracion).   node test/firmas-editor-e2e.js
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-fed-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${path.join(tmp, 'ud')}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_INMO_DIR: path.join(tmp, 'inmo') } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const shot = (n) => w.screenshot({ path: path.join(__dirname, n) }).catch(() => {});
  try {
    await w.setViewportSize({ width: 1300, height: 1000 }); await w.waitForFunction(() => window.studio && window.Inmo && window.__envio, null, { timeout: 20000 }); await w.waitForTimeout(300);
    // el servidor no existe en la prueba: el modo demostración responde (el extractor dice que los dos firman en la hoja 1) y deja lo enviado en globalThis.__llamadasIntegracion
    const envios = () => app.evaluate(() => (globalThis.__llamadasIntegracion || []).filter((x) => x.ruta === '/firmas-envio/pdf').map((x) => x.cuerpo));
    await w.click('#nav [data-view="home"]'); await w.waitForSelector('#homeBody .hub-card');
    await w.click('#homeBody .hub-card[data-act="send"]'); await w.waitForSelector('#view-login:not(.hidden) #loginBtn'); await w.click('#loginBtn'); await w.waitForSelector('#view-drop:not(.hidden)', { timeout: 20000 });
    const lay = await w.evaluate(() => { const d = document.querySelector('#view-drop #dropzone').getBoundingClientRect(); return { centro: d.left + d.width / 2, ancho: innerWidth, izq: !!document.querySelector('#view-drop .envio-izq'), texto: document.querySelector('#view-drop').textContent }; });
    ok(!lay.izq && !/Resumen del documento|Firmantes|Formalización/.test(lay.texto) && Math.abs(lay.centro - lay.ancho / 2) < 80, 'cargar: solo está la zona de carga, centrada (sin tarjetas ni esqueletos a los lados)');
    await shot('fe00-subir.png');
    // mientras se analiza ya se ve la pantalla de revisión con esqueletos (el análisis se alarga a propósito)
    await app.evaluate(() => { globalThis.__retrasoExtraer = 2500; });
    await w.evaluate(async (p) => { const f = await window.pf.checkFile(p); startAnalysis(f.data); }, path.join(__dirname, 'fixtures', 'contrato_prueba.pdf'));
    await w.waitForSelector('#view-working:not(.hidden) .esq-barrido', { timeout: 10000 });
    await w.waitForTimeout(1800);
    ok(!(await w.$('#view-working .envio-izq')) && !/Resumen del documento|Buscando firmantes/.test(await w.textContent('#view-working')) && !!(await w.$('#view-working .esq-barrido')), 'analizando: solo el PDF que se lee, centrado y con la barra; sin esqueletos a la izquierda');
    const hoja = await w.evaluate(() => { const c = document.querySelector('#view-working canvas'); if (!c || !c.width) return null; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let oscuros = 0; for (let i = 0; i < d.length; i += 40) if (d[i] < 120) oscuros++; return { oscuros, textos: document.querySelector('#view-working').textContent.includes('Detectando firmantes') }; });
    ok(hoja && hoja.oscuros > 50, 'mientras se analiza, se ve el PDF real (primera hoja con su texto), no una maqueta');
    ok(hoja && !hoja.textos && !(await w.$('#view-working #workingSteps')), 'y sin textos de pasos encima o debajo del PDF');
    ok(!(await w.$('#view-working footer')), 'y sin botón de enviar todavía (aparece al terminar)');
    await shot('fe0-analizando.png');
    const izqAnalisis = await w.evaluate(() => document.querySelector('#view-working .envio-der').getBoundingClientRect().left);
    await w.waitForSelector('#view-review:not(.hidden)', { timeout: 60000 });
    await app.evaluate(() => { globalThis.__retrasoExtraer = 0; });
    const ini = await w.evaluate(() => { const iz = document.querySelector('#view-review #envioIzq'); const der = document.querySelector('#view-review .envio-der').getBoundingClientRect(); return { op: Number(getComputedStyle(iz).opacity), derIzq: der.left, ancho: innerWidth }; });
    ok(ini.op < 0.5, `entrada: al terminar el análisis los datos de la izquierda aún no se ven (opacidad ${ini.op.toFixed(2)}) y el PDF está solo, al centro`);
    await w.waitForTimeout(300); await shot('fe0b-transicion.png');
    await w.waitForTimeout(1200);
    const fin = await w.evaluate(() => { const iz = document.querySelector('#view-review #envioIzq'); const r = iz.getBoundingClientRect(); const der = document.querySelector('#view-review .envio-der').getBoundingClientRect(); return { op: Number(getComputedStyle(iz).opacity), izqAncho: r.width, derIzq: der.left, solo: document.querySelector('#view-review .envio-cols').hasAttribute('data-solo'), ov: getComputedStyle(iz).overflowY }; });
    ok(fin.op === 1 && !fin.solo && fin.izqAncho > 300 && fin.derIzq > izqAnalisis + 400, `con una animación el PDF pasa a la derecha (de x ${Math.round(izqAnalisis)} a ${Math.round(fin.derIzq)}) y aparecen los datos a la izquierda`);
    ok(fin.ov === 'auto', 'la columna izquierda tiene su propio scroll');
    ok((await w.$$('#signers .signer')).length === 2, 'la IA de Asset detectó los dos firmantes');
    ok(!(await w.$('#payerEmail')) && !(await w.$('#discount')), 'ya no pide correo del pagador ni código de descuento');
    await w.waitForSelector('[data-pcf-firma="1"]', { timeout: 15000 });
    ok(await w.locator('[data-pcf-firma]').count() === 2 && !(await w.$('#pcfPagina')) && !(await w.$('#pcfUbicar')), 'por defecto los dos recuadros de firma ya están puestos en el PDF (sin botones para ubicarlas)');
    ok(await w.locator('#docSummary').count() === 1 && /Resumen del documento/.test(await w.textContent('#view-review')) && !!(await w.$('#view-review [data-layout-contenido] #docSummary')), 'el resumen está en una tarjeta («Resumen del documento»), no en la cabecera');
    const colores = await w.evaluate(() => [...document.querySelectorAll('#signers .order')].map((e) => e.style.background));
    ok(colores.length === 2 && colores[0] !== colores[1] && colores.every((c) => /gradient/.test(c)), 'cada firmante tiene su círculo con degradado de color (el de su recuadro en el PDF)');
    ok(!(await w.$('[data-pcf-ir]')), 'ya no hay lista de nombres sobre el PDF');
    const bar = await w.evaluate(() => { const b = document.querySelector('#sendBtn').getBoundingClientRect(); return { b: b.bottom, h: innerHeight }; });
    ok(bar.b <= bar.h && bar.b > bar.h - 80, 'el botón «Enviar a firmar» está en una franja pegada abajo, siempre a la vista');
    // con la página de firma extra los recuadros se quitan del PDF (no hay espacio en el documento); al apagarla vuelven donde estaban
    await w.click('#paginaExtra'); await w.waitForTimeout(300);
    ok(await w.locator('[data-pcf-firma]').count() === 0, 'con «Agregar página para las firmas» activa, las firmas del PDF se quitan');
    await w.click('#paginaExtra'); await w.waitForTimeout(300);
    ok(await w.locator('[data-pcf-firma]').count() === 2, 'y al apagarla vuelven los recuadros');
    await w.click('#paginaExtra'); await w.waitForTimeout(300);   // se envía con la página extra
    // se completan los datos que faltan (la API de Portalfirma pide el correo de cada firmante) y se envía con la página de firmas: no viajan posiciones
    const correos = async () => { for (const [i, k, c] of [['0', 'email', 'juan@correo.cl'], ['1', 'email', 'maria@correo.cl'], ['1', 'alias', 'arrendataria']]) { const q = `input[data-i="${i}"][data-k="${k}"]`; await w.fill(q, c); await w.locator(q).blur(); } };   // (el demo detecta «cliente»: Portalfirma pide el rol real)
    await correos();
    await w.click('#sendBtn'); await w.waitForSelector('#modal:not(.hidden) #mOk');
    ok(/Confirmar envío/.test(await w.textContent('#modalCard')) && /página para las firmas/.test(await w.textContent('#modalCard')) && !/Pagador/.test(await w.textContent('#modalCard')), 'la confirmación dice dónde van las firmas (con la página extra) y no menciona pagador');
    await w.click('#mOk'); await w.waitForSelector('#view-done:not(.hidden)', { timeout: 30000 }); await w.waitForTimeout(500); if (await w.isVisible('#tdPregunta')) await w.click('#mCancel');   // «¿Guardas configuración por defecto?» (tipo de documento sin configurar)
    let env = await envios();
    ok(env.length === 1 && !('posiciones' in env[0]) && env[0].paginaExtra === true && env[0].firmantes.length === 2 && env[0].firmantes[0].alias === 'prestador' && env[0].firmantes[0].email === 'juan@correo.cl' && !('email' in env[0]), 'con la página extra el envío no lleva posiciones y pide la página de firmas (paginaExtra)');

    // de nuevo, ubicando las firmas
    await w.evaluate(async (p) => { const f = await window.pf.checkFile(p); startAnalysis(f.data); }, path.join(__dirname, 'fixtures', 'contrato_prueba.pdf'));
    await w.waitForSelector('#view-review:not(.hidden)', { timeout: 60000 });
    await correos();
    await w.waitForSelector('[data-pcf-firma="1"]', { timeout: 15000 });   // ya están puestas, sin apretar ningún botón
    await w.locator('[data-pcf-firma="0"]').scrollIntoViewIfNeeded(); await w.waitForTimeout(500);
    const nPag = Number(/de (\d+)/.exec(await w.textContent('#pcfHoja'))[1]);
    ok(/Hoja 1 de/.test(await w.textContent('#pcfHoja')), `abre en la hoja 1: ahí encontró la IA la línea de firma de los dos (el PDF tiene ${nPag})`);
    const medidas = (i) => w.evaluate((k) => { const c = document.querySelector('[data-pcf-hoja="1"]').getBoundingClientRect(); const b = document.querySelector(`[data-pcf-firma="${k}"]`).getBoundingClientRect(); return { cl: c.left, ct: c.top, cw: c.width, bl: b.left, bt: b.top, bw: b.width, bh: b.height }; }, i);
    const m0 = await medidas(0); const m1 = await medidas(1);
    ok(Math.abs(m0.bt - m1.bt) < 3 && m1.bl > m0.bl + 10, 'los dos recuadros arrancan lado a lado en esa hoja');
    ok(!(await w.$('#view-review [data-migas]')), 'la cabecera no muestra las migas de pan');
    const ent = await w.evaluate(() => { const sc = document.querySelector('#pcfScroll').getBoundingClientRect(); const h = document.querySelector('[data-pcf-hoja="1"]').getBoundingClientRect(); return { arriba: h.top - sc.top, abajo: sc.bottom - h.bottom, alto: h.height, vista: sc.height }; });
    ok(ent.arriba >= -1 && ent.abajo >= -1 && ent.alto <= ent.vista, `la hoja se ve entera en el visor (alto de la hoja ${Math.round(ent.alto)} de ${Math.round(ent.vista)} px)`);
    ok(!(await w.$('#pcfScroll').then((e) => e.evaluate((n) => getComputedStyle(n).backgroundColor !== 'rgba(0, 0, 0, 0)'))), 'el visor no tiene contenedor con fondo (se gana espacio)');
    // el resumen se pliega y se despliega
    await w.click('#resumenToggle'); await w.waitForTimeout(150);
    ok(!(await w.$('#docSummary')) && /observaciones/.test(await w.textContent('#view-review')), 'el resumen se pliega (y dice cuántas observaciones tiene)');
    await w.click('#resumenToggle'); await w.waitForSelector('#docSummary');
    ok(true, 'y se vuelve a desplegar');
    // quien firma primero se ordena arrastrando: el 2.º pasa a ser 1.º y su recuadro lo sigue
    ok(!(await w.$('#signers [data-act="up"]')) && !(await w.$('#signers [data-act="down"]')), 'ya no hay botones subir/bajar: el orden se cambia arrastrando');
    await w.dragAndDrop('#signers .signer:nth-child(2) [data-act="drag"]', '#signers .signer:nth-child(1)');
    await w.waitForTimeout(400);
    ok(/MARIA/i.test(await w.textContent('#signers .signer:nth-child(1) strong')) && /JUAN/i.test(await w.textContent('#signers .signer:nth-child(2) strong')), 'arrastrar al segundo sobre el primero invierte el orden de firma');
    ok(/MARIA/i.test(await w.getAttribute('[data-pcf-firma="0"]', 'aria-label')) && /JUAN/i.test(await w.getAttribute('[data-pcf-firma="1"]', 'aria-label')), 'y los recuadros del PDF siguen a su persona');
    await w.dragAndDrop('#signers .signer:nth-child(2) [data-act="drag"]', '#signers .signer:nth-child(1)'); await w.waitForTimeout(400);   // se devuelve al orden de antes
    await w.locator('[data-pcf-firma="0"]').scrollIntoViewIfNeeded(); await w.waitForTimeout(400);
    const mm = await medidas(0); const cx = mm.bl + mm.bw / 2; const cy = mm.bt + mm.bh / 2;
    await w.mouse.move(cx, cy); await w.mouse.down(); await w.mouse.move(cx + 40, cy - 30, { steps: 4 }); await w.mouse.move(cx + 80, cy - 60, { steps: 4 }); await w.mouse.up();
    await w.waitForTimeout(300);
    // agregar un tercer firmante: aparece su recuadro y los de antes se conservan
    await w.click('#addSigner');
    await w.waitForSelector('[data-pcf-firma="2"]', { timeout: 10000 });
    ok(await w.locator('[data-pcf-firma]').count() === 3, 'al agregar un firmante aparece su recuadro (y los anteriores se conservan)');
    await w.click('#signers .signer:last-child button[data-act="del"]');
    await w.waitForFunction(() => document.querySelectorAll('[data-pcf-firma]').length === 2, null, { timeout: 10000 });
    ok(true, 'y al quitarlo, desaparece');
    await shot('fe1-ubicar.png');
    await w.click('#sendBtn'); await w.waitForSelector('#modal:not(.hidden) #mOk');
    ok(/Ubicadas en el documento/.test(await w.textContent('#modalCard')), 'la confirmación dice que las firmas están ubicadas en el documento');
    await w.click('#mOk'); await w.waitForSelector('#view-done:not(.hidden)', { timeout: 30000 }); await w.waitForTimeout(500); if (await w.isVisible('#tdPregunta')) await w.click('#mCancel');   // «¿Guardas configuración por defecto?» (tipo de documento sin configurar)
    env = await envios();
    const e2 = env[1]; const s = (m0.cw / 612);
    ok(env.length === 2 && Array.isArray(e2.posiciones) && e2.posiciones.length === 2 && e2.posiciones.every((p) => p.pagina >= 1 && Number.isInteger(p.x) && Number.isInteger(p.y)), 'ubicadas: el envío lleva una posición por firmante (página y coordenadas enteras)');
    ok(e2.posiciones[0].pagina === 1 && e2.posiciones[0].x > 60 + 30 && e2.posiciones[0].y > 70 + 30, `la del primero refleja lo arrastrado (x ${e2.posiciones[0].x}, y ${e2.posiciones[0].y}, escala ${s.toFixed(2)})`);
    ok(env.length === 2 && !('paginaExtra' in e2), 'sin activar la página extra, no se pide');
    ok(e2.posiciones[1].x === 310 && e2.posiciones[1].y === 70, 'y la del segundo sigue donde partió (x 310, y 70)');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK firmas editor');
  } catch (e) { console.error(e.message); await shot('fe-error.png'); process.exitCode = 1; } finally { await app.close(); }
})();
