// Carga masiva (gestion/carga-masiva/CargaMasiva.tsx): sin documentos solo está la zona de carga, centrada; al cargar, cada documento es una
// tarjeta con su PDF en una fila (de la altura del PDF), se analiza solo y tiene «Analizar» y «Firmantes»; «Firmantes» abre los datos encima del
// PDF (firmantes, página para las firmas, trámite); «Sincronizar PDF» copia la configuración a los demás; al enviar la tarjeta muestra «Enviando a
// firmar», desaparece si salió bien y queda marcada con el error si falló. El servidor y la IA son los del modo demostración.
//   node test/carga-masiva-e2e.js
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-cm-'));
  const docs = [];
  for (let i = 1; i <= 3; i++) { const f = path.join(tmp, `Contrato ${i}.pdf`); fs.writeFileSync(f, Buffer.concat([fs.readFileSync(path.join(__dirname, 'fixtures', 'contrato_prueba.pdf')), Buffer.from(`\n%${i}\n`)])); docs.push(f); }
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${path.join(tmp, 'ud')}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: path.join(tmp, 'inmo') } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const shot = (n) => w.screenshot({ path: path.join(__dirname, n) }).catch(() => {});
  const items = () => w.evaluate(() => window.Masiva._bk.st.items.map((x) => ({ id: x.id, name: x.name, status: x.status, signers: (x.signers || []).length, tramite: x.tramite, paginaExtra: x.paginaExtra, posiciones: x.posiciones })));
  try {
    await w.setViewportSize({ width: 1440, height: 900 }); await w.waitForFunction(() => window.studio && window.Inmo && window.Masiva, null, { timeout: 20000 }); await w.waitForTimeout(300);
    await w.evaluate(() => window.Masiva.open()); await w.waitForSelector('#bkDrop');
    const z = await w.evaluate(() => { const r = document.querySelector('#bkDrop').getBoundingClientRect(); return { c: r.left + r.width / 2, w: innerWidth }; });
    ok(Math.abs(z.c - z.w / 2) < 80 && !(await w.$('.bk-card')) && !(await w.$('#bkTable')), 'sin documentos: solo la zona de carga, centrada (sin tabla)');
    ok(!(await w.$('footer [data-a="send"]')), 'y sin botón de enviar todavía');
    await shot('cm0-vacia.png');

    // cargar: se analizan solos, con la barra recorriendo el PDF
    await app.evaluate(() => { globalThis.__retrasoExtraer = 2500; });
    await w.evaluate((p) => window.pf.bulkAdd(p), docs);
    await w.waitForSelector('.bk-card'); await w.waitForTimeout(900);
    ok(await w.evaluate(() => /Analizando documentos · \d de 3/.test(document.querySelector('#segundoPlano')?.textContent || '')), 'mientras se analizan los PDF, la barra de segundo plano lo dice con su avance');
    ok(await w.locator('.bk-card').count() === 3 && !!(await w.$('.bk-card .esq-barrido')), 'cada documento es una tarjeta, y mientras se analiza una barra recorre su PDF');
    ok(await w.locator('.bk-card [data-a="analyze"]').count() === 3 && await w.locator('.bk-card [data-a="edit"]').count() === 3, 'cada tarjeta tiene «Analizar» y «Firmantes»');
    ok(await w.locator('.bk-card [data-a="edit"]:not([disabled])').count() === 0, '«Firmantes» espera a que termine el análisis');
    await w.waitForFunction(() => window.Masiva._bk.st.items.every((x) => ['ready', 'needs_data'].includes(x.status)), null, { timeout: 60000 });
    await app.evaluate(() => { globalThis.__retrasoExtraer = 0; });
    await w.waitForTimeout(800);
    const m = await w.evaluate(() => { const c = document.querySelector('.bk-card').getBoundingClientRect(); const cv = document.querySelector('.bk-card canvas'); const f = document.querySelector('#bkFila').getBoundingClientRect(); return { alto: c.height, fila: f.height, canvas: cv ? cv.getBoundingClientRect().height : 0 }; });
    ok(m.canvas > 0 && m.canvas > m.alto - 170 && m.alto >= m.fila - 20, `la tarjeta tiene la altura del PDF (tarjeta ${Math.round(m.alto)} px, hoja ${Math.round(m.canvas)} px, fila ${Math.round(m.fila)} px)`);
    ok(await w.locator('.bk-card [data-faltan-punto]').count() === 3, 'faltan correos: el botón «Firmantes» lo avisa con un punto');
    ok(await w.evaluate(() => !document.querySelector('.bk-card b') && !document.querySelector('.bk-card .badge') && !/firmantes$/.test(document.querySelector('.bk-card').textContent.trim().split('Analizar')[0].slice(-12))), 'la tarjeta no tiene título, estado ni cantidad de firmantes');
    ok(await w.evaluate(() => { const c = document.querySelector('.bk-card').getBoundingClientRect(); const x = document.querySelector('.bk-card [data-a="rm"]').getBoundingClientRect(); return x.top < c.top + 50 && x.top >= c.top && x.bottom < c.top + 90; }), 'el botón de quitar flota arriba del PDF');
    await shot('cm1-tarjetas.png');

    // mini barra de botones cuadrados: un botón por PDF; al pasar el mouse muestra nombre, estado y firmantes; al tocarlo lleva al PDF
    ok(await w.locator('#bkMini [data-mini]').count() === 3, 'abajo hay una mini barra con un botón cuadrado por documento');
    const cuad = await w.evaluate(() => { const b = document.querySelector('#bkMini [data-mini]').getBoundingClientRect(); return Math.abs(b.width - b.height) < 1; });
    ok(cuad, 'los botones son cuadrados');
    ok(await w.evaluate(() => !!document.querySelector('footer #bkMini')), 'la mini barra está en el pie de la página, junto al resumen');
    const lum = (c) => { const [r, g, b] = c.match(/\d+/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const col = await w.evaluate(() => { const b = document.querySelector('#bkMini [data-mini]'); const cs = getComputedStyle(b); return { fondo: cs.backgroundColor, texto: cs.color }; });
    const cr = (lum(col.texto) + 0.05) / (lum(col.fondo) + 0.05);
    ok(cr > 4.5 || (lum(col.fondo) + 0.05) / (lum(col.texto) + 0.05) > 4.5, `el número se lee: contraste ${Math.max(cr, 1 / cr).toFixed(1)}:1 (${col.fondo} sobre ${col.texto})`);
    ok(await w.evaluate(() => { const b = document.querySelector('.bk-card [aria-label="Hoja siguiente"]'); return !!b && getComputedStyle(b).cursor === 'pointer'; }), 'los botones para pasar de hoja del PDF tienen cursor de mano y el diseño de la app');
    await w.hover('#bkMini [data-mini] >> nth=1'); await w.waitForSelector('[data-bk-tip]');
    const tip = await w.textContent('[data-bk-tip]');
    ok(/Contrato 2\.pdf/.test(tip) && /Faltan datos/.test(tip) && /2 firmantes/.test(tip), `al pasar el mouse muestra el nombre, el estado y los firmantes («${tip.slice(0, 90)}…»)`);
    await w.mouse.move(5, 300); await w.waitForTimeout(150);
    const antes = await w.evaluate(() => document.querySelector('#bkFila').scrollLeft);
    await w.click('#bkMini [data-mini] >> nth=2'); await w.waitForTimeout(900);
    const despues = await w.evaluate(() => { const f = document.querySelector('#bkFila'); const c = document.querySelectorAll('.bk-card')[2].getBoundingClientRect(); return { sl: f.scrollLeft, visible: c.left >= 0 && c.right <= innerWidth + 1 }; });
    ok(despues.sl > antes && despues.visible, 'al tocar un botón la fila se desplaza hasta ese PDF');
    await w.click('#bkMini [data-mini] >> nth=0'); await w.waitForTimeout(900);
    ok(await w.evaluate(() => document.querySelector('#bkFila').scrollLeft) < despues.sl, 'y el primero la devuelve al inicio');
    // la rueda del mouse, fuera de un PDF, avanza la fila hacia el lado
    const bx = await w.evaluate(() => { const r = document.querySelector('.bk-card [data-a="analyze"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    const sl0 = await w.evaluate(() => document.querySelector('#bkFila').scrollLeft);
    await w.mouse.move(bx.x, bx.y); await w.mouse.wheel(0, 300); await w.waitForTimeout(400);
    ok(await w.evaluate(() => document.querySelector('#bkFila').scrollLeft) > sl0, 'la rueda del mouse mueve la fila de lado a lado');
    await shot('cm1b-minibarra.png');

    // «Firmantes»: los datos encima del PDF, con la página para las firmas y el trámite
    await w.click('.bk-card >> nth=0 >> [data-a="edit"]'); await w.waitForSelector('[data-panel]');
    ok(await w.locator('[data-panel] [data-k="email"]').count() === 2 && !!(await w.$('#bkTramite')) && !!(await w.$('#bkPaginaExtra')) && !(await w.$('#bkUbicar')), 'abre los formularios de los firmantes encima del PDF, con trámite y «Agregar página para las firmas»');
    await w.fill('[data-panel] [data-i="0"][data-k="email"]', 'juan@correo.cl'); await w.fill('[data-panel] [data-i="1"][data-k="email"]', 'maria@correo.cl');
    await w.fill('[data-panel] [data-i="1"][data-k="alias"]', 'mandante');   // «cliente» es un rol genérico que Portalfirma rechaza
    await w.selectOption('#bkTramite', 'legalization');
    ok(await w.evaluate(() => { const b = document.querySelector('#bkListo').getBoundingClientRect(); const p = document.querySelector('[data-panel]').getBoundingClientRect(); return b.top >= p.top && b.bottom <= p.top + 60 && b.right <= p.right; }), 'el botón «Listo» para cerrar está arriba del panel, siempre a la vista');
    await shot('cm2-firmantes.png');
    await w.click('#bkListo'); await w.waitForTimeout(900);
    const it0 = (await items())[0];
    ok(it0.status === 'ready' && it0.tramite === 'legalization', 'al completar los datos el documento queda listo, con su trámite');
    // ubicar las firmas directo en el PDF de la tarjeta (sin ventana): se arrastra el recuadro y queda guardado en el documento
    await w.waitForSelector('.bk-card >> nth=0 >> [data-pcf-firma="0"]', { timeout: 15000 }); await w.waitForTimeout(700);
    ok(!(await w.$('#modalCard [data-pcf-firma]')) && await w.locator('.bk-card >> nth=0 >> [data-pcf-firma]').count() === 2, 'las firmas ya están puestas en el PDF de la tarjeta, sin abrir una ventana');
    await w.click('#bkMini [data-mini] >> nth=0'); await w.waitForTimeout(900);   // la tarjeta a la vista (la fila quedó corrida por la rueda)
    const b0 = await w.evaluate(() => { const r = document.querySelector('.bk-card [data-pcf-firma="0"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await w.mouse.move(b0.x, b0.y); await w.mouse.down(); await w.mouse.move(b0.x + 30, b0.y - 40, { steps: 5 }); await w.mouse.move(b0.x + 60, b0.y - 80, { steps: 5 }); await w.mouse.up();
    await w.waitForTimeout(900); await shot('cm2b-ubicar.png');
    const pos0 = (await items())[0].posiciones;
    ok(Array.isArray(pos0) && pos0.length === 2 && pos0[0].x > 90 && pos0[0].y > 140 && pos0[1].x === 310, `arrastrar el recuadro en la tarjeta guarda la posición en el documento (${JSON.stringify(pos0 && pos0[0])})`);

    // «Sincronizar PDF»: lo configurado en el primero pasa a todos
    await w.click('footer [data-a="sync"]'); await w.waitForTimeout(800);
    const todos = await items();
    ok(todos.every((x) => x.status === 'ready' && x.tramite === 'legalization'), '«Sincronizar PDF» deja a todos listos y con el mismo trámite');
    ok(todos.every((x) => JSON.stringify(x.posiciones) === JSON.stringify(pos0)), 'y con las mismas firmas ubicadas del primero');
    await w.click('#bkMini [data-mini] >> nth=0'); await w.waitForTimeout(1500);
    const rel = await w.evaluate(() => [0, 1].map((k) => { const c = document.querySelectorAll('.bk-card')[k]; const b = c.querySelector('[data-pcf-firma="0"]'); if (!b) return null; const cr = c.querySelector(`[data-pcf-hoja="${b.dataset.pcfPagina}"]`).getBoundingClientRect(); const br = b.getBoundingClientRect(); return { pg: b.dataset.pcfPagina, dx: Math.round(((br.left - cr.left) / cr.width) * 100), dy: Math.round(((br.top - cr.top) / cr.height) * 100) }; }));   // lugar dentro de la hoja
    ok(rel[0] && rel[1] && rel[0].pg === rel[1].pg && Math.abs(rel[0].dx - rel[1].dx) <= 1 && Math.abs(rel[0].dy - rel[1].dy) <= 1, `y en pantalla el segundo PDF muestra la firma en la misma hoja y lugar que el primero (${JSON.stringify(rel)})`);
    // sin haber movido nada, lo que se ve en el primero (aquí: firmas en la hoja 2) es lo que reciben todos
    await w.evaluate(async () => { const x = window.Masiva._bk.st.items[0]; await window.pf.bulkUpdate(x.id, { signers: x.signers.map((f) => ({ ...f, pagina: 2 })), posiciones: null }); });
    await w.waitForTimeout(400); await w.click('footer [data-a="sync"]'); await w.waitForTimeout(800);
    const def = await items();
    ok(def.slice(1).every((x) => x.posiciones?.length === 2 && x.posiciones.every((q) => q.pagina === 2) && x.posiciones[0].x === 60 && x.posiciones[1].x === 310), '«Sincronizar PDF» lleva las firmas a la misma hoja y lugar que en el primero (hoja 2), aunque no se hayan movido');
    await w.evaluate(async (pos) => { const x = window.Masiva._bk.st.items[0]; await window.pf.bulkUpdate(x.id, { signers: x.signers.map((f) => ({ ...f, pagina: 1 })), posiciones: pos }); }, pos0);
    await w.waitForTimeout(400); await w.click('footer [data-a="sync"]'); await w.waitForTimeout(800);   // se vuelve a lo ubicado a mano

    // los botones del pie: a la derecha y del mismo tamaño
    const pie = await w.evaluate(() => { const bs = [...document.querySelectorAll('footer #bkMas2, footer [data-a="sync"], footer [data-a="send"], footer [data-a="stop"]')].map((b) => b.getBoundingClientRect()); const ult = bs.at(-1); return { altos: [...new Set(bs.map((b) => Math.round(b.height)))], derecha: innerWidth - ult.right }; });
    ok(pie.altos.length === 1 && pie.derecha < 40, `los botones del pie son del mismo tamaño (${pie.altos[0]} px) y quedan a la derecha`);
    ok(/Enviar 3 a firmar/.test(await w.textContent('footer [data-a="send"]')), 'el botón «Enviar 3 a firmar» está en el pie de la página');

    // quitar un documento pide confirmación
    await w.click('.bk-card >> nth=2 >> [data-a="rm"]'); await w.waitForSelector('#modalCard #mOk');
    ok(/Quitar/.test(await w.textContent('#modalCard')) && await w.locator('.bk-card').count() === 3, 'quitar un documento pide confirmación antes de sacarlo de la lista');
    await w.click('#mCancel'); await w.waitForTimeout(300);
    ok(await w.locator('.bk-card').count() === 3, 'si se cancela, el documento sigue en la lista');

    // un envío que falla deja la tarjeta marcada con el error
    // la ventana de confirmación se abre al tiro aunque la consulta del saldo tarde
    await app.evaluate(() => { globalThis.__retrasoSaldo = 2500; });
    const t0 = Date.now(); await w.click('footer [data-a="send"]'); await w.waitForSelector('#modalCard #mOk'); const tAbrir = Date.now() - t0;
    ok(tAbrir < 1200 && /Saldo actual/.test(await w.textContent('#modalCard')), `al tocar «Enviar a firmar» la confirmación abre al tiro (${tAbrir} ms), con el último saldo conocido, sin esperar la consulta`);
    await app.evaluate(() => { globalThis.__retrasoSaldo = 0; });
    await w.click('#mCancel'); await w.waitForTimeout(300);
    await app.evaluate(() => { process.env.PF_MOCK_SEND_500 = '1'; });
    await w.click('footer [data-a="send"]'); await w.waitForSelector('#modalCard #mOk'); await w.click('#mOk');
    await w.waitForFunction(() => window.Masiva._bk.st.items.every((x) => x.status === 'send_error') && !window.Masiva._bk.st.sending, null, { timeout: 60000 });
    ok(await w.locator('.bk-card [data-error]').count() === 3 && await w.locator('.bk-card[data-estado="send_error"]').count() === 3, 'si falla, cada tarjeta queda marcada con su error');
    await shot('cm3-error.png');
    await app.evaluate(() => { process.env.PF_MOCK_SEND_500 = ''; });
    for (let k = 2; k >= 0; k--) { await w.click('.bk-card [data-a="rearm"] >> nth=0'); await w.waitForFunction((n) => document.querySelectorAll('.bk-card [data-a="rearm"]').length === n, k, { timeout: 5000 }); }   // «Volver a listo», una por una
    await w.waitForFunction(() => window.Masiva._bk.st.items.every((x) => x.status === 'ready'), null, { timeout: 10000 });

    // enviando: loader en la tarjeta; lo enviado sale de la fila
    await app.evaluate(() => { globalThis.__retrasoEnvio = 1200; });
    await w.click('footer [data-a="send"]'); await w.waitForSelector('#modalCard #mOk'); await w.click('#mOk');
    await w.waitForSelector('.bk-card [role="status"][aria-label="Enviando a firmar"]', { timeout: 10000 }); await shot('cm4-enviando.png');
    ok(true, 'al enviar, la tarjeta muestra «Enviando a firmar…»');
    // el envío sigue en segundo plano: en cualquier pantalla una barra dice qué pasa y el porcentaje
    await w.evaluate(() => window.studio.goHome()); await w.waitForSelector('#segundoPlano[data-tipo="envio"]', { timeout: 10000 });
    const p1 = parseInt(await w.textContent('#spPct'), 10); const t1 = await w.textContent('#segundoPlano');
    ok(/Enviando a firmar · \d de 3/.test(t1) && p1 >= 0 && p1 < 100, `fuera de la Carga masiva sigue la barra de segundo plano («${t1.trim()}»)`);
    await shot('cm5-segundo-plano.png');
    await w.waitForFunction((n) => { const e = document.querySelector('#spPct'); return !e || parseInt(e.textContent, 10) > n; }, p1, { timeout: 20000 });
    const p2 = parseInt(await w.textContent('#spPct').catch(() => '100'), 10);
    ok(p2 > p1, `el porcentaje avanza (${p1} % → ${p2} %)`);
    await w.waitForSelector('#segundoPlano[data-fin]', { timeout: 30000 });
    ok(/3 documentos enviados a firmar/.test(await w.textContent('#segundoPlano')) && parseInt(await w.textContent('#spPct'), 10) === 100, 'al terminar dice cuántos se enviaron (100 %) y se va sola');
    await w.waitForSelector('#segundoPlano', { state: 'detached', timeout: 10000 });
    // al final del envío (nunca antes): una sola pregunta por tipo de documento que la corredora no tenía configurado
    await w.waitForSelector('#modalCard #tdPregunta', { timeout: 10000 }); await w.click('#mCancel');
    await w.waitForTimeout(400); ok(await w.locator('#tdPregunta').count() === 0, 'tres documentos del mismo tipo: «¿Guardas configuración por defecto?» se pregunta una sola vez, al final');
    await w.evaluate(() => window.Masiva.open());
    await w.waitForFunction(() => !document.querySelector('.bk-card'), null, { timeout: 60000 });
    const env = await app.evaluate(() => (globalThis.__llamadasIntegracion || []).filter((x) => x.ruta === '/firmas-envio/pdf').map((x) => x.cuerpo));
    ok(env.length >= 3 && env.slice(-3).every((e) => e.tramite === 'legalization' && e.firmantes.length === 2 && e.posiciones?.length === 2 && e.posiciones[0].x === pos0[0].x && e.posiciones[0].y === pos0[0].y), 'los tres enviados salen de la fila; cada envío lleva su trámite, los firmantes y las firmas ubicadas del primero');
    await w.waitForSelector('#bkDrop'); ok(true, 'y al quedar vacía vuelve la zona de carga');
    // «Omitido»: se explica por qué y se puede reintentar para seguir con el proceso
    fs.copyFileSync(docs[0], path.join(tmp, 'Copia.pdf'));
    await w.evaluate((p) => window.pf.bulkAdd(p), [docs[0], path.join(tmp, 'Copia.pdf')]);
    await w.waitForSelector('.bk-card[data-estado="skipped"] [data-error]', { timeout: 15000 });
    const om = await w.textContent('.bk-card[data-estado="skipped"] [data-error]');
    ok(/ya se envió|repetido/.test(om), `un documento «Omitido» dice por qué en su tarjeta («${om.trim()}»)`);
    await w.hover('#bkMini [data-mini] >> nth=1'); await w.waitForSelector('[data-bk-tip]');
    ok(/Omitido: /.test(await w.textContent('[data-bk-tip]')), 'y el globo de la mini barra también lo dice');
    for (let k = 1; k >= 0; k--) { await w.click('.bk-card[data-estado="skipped"] [data-a="force"] >> nth=0'); await w.waitForFunction((n) => document.querySelectorAll('.bk-card[data-estado="skipped"]').length === n, k, { timeout: 5000 }); }   // los dos habían sido enviados antes
    await w.waitForFunction(() => window.Masiva._bk.st.items.length === 2 && window.Masiva._bk.st.items.every((x) => ['ready', 'needs_data'].includes(x.status)), null, { timeout: 30000 });
    ok(true, '«Reintentar» sigue con el documento de todos modos y se analiza');

    // un omitido guardado por una versión anterior (sin la marca «forzable», con el mensaje viejo) también muestra «Reintentar»
    await w.evaluate(() => window.dispatchEvent(new CustomEvent('pf:bulk', { detail: { items: [{ id: 'viejo', name: 'Viejo.pdf', path: 'C:/Viejo.pdf', status: 'skipped', dupSent: true, error: 'Este mismo archivo ya se envió a firmar desde la carga masiva.' }] } })));
    await w.waitForSelector('.bk-card[data-id="viejo"] [data-a="force"]', { timeout: 5000 }); ok(true, 'un omitido guardado antes también tiene el botón «Reintentar»');
    // Gestión documental: «Firma masiva» es el tercer botón principal
    await w.evaluate(() => window.studio.goHome()); await w.waitForSelector('#homeBody .hub-card.big');
    ok(await w.locator('#homeBody .hub-card.big').count() === 3 && /Firma masiva/.test(await w.textContent('#homeBody .hub-card.big[data-act="bulk"]')), 'Gestión documental tiene un tercer botón principal: «Firma masiva»');
    await w.click('#homeBody .hub-card.big[data-act="bulk"]'); await w.waitForSelector('.bk-card'); ok(true, 'y abre la Firma masiva');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK carga masiva');
  } catch (e) { console.error(e.message); await shot('cm-error.png'); process.exitCode = 1; } finally { await app.close(); }
})();
