// «Ubicar las firmas» (agenda/PdfConFirmas.tsx): en la ventana de un documento (aquí la orden de visita), el PDF se ve con la
// «Página de firmas» por defecto y, con «Ubicar las firmas», cada firmante es un recuadro que se arrastra al lugar donde firma.
// Las posiciones se guardan en el servidor (IPC fir:posiciones; aquí se captura en el proceso principal) y al volver a «Página de
// firmas» se borran. Revisa: los botones, el recuadro de cada firmante, que arrastrarlo lo mueve y guarda las coordenadas del PDF
// (página desde 1, esquina inferior izquierda, origen abajo a la izquierda), que no se sale de la hoja y que al volver a la página
// de firmas se borran.   node test/firmas-ubicar-e2e.js
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
// un PDF mínimo de una hoja carta (612 × 792 puntos); pdf.js reconstruye lo que le falta
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R 4 0 R]/Count 2>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\n4 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R/Size 5>>\n%%EOF\n').toString('base64');
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pffu-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pffu-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir, PF_NO_TOURS: '1' } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const shot = (n) => w.screenshot({ path: path.resolve(__dirname, n) });
  try {
    await w.setViewportSize({ width: 1480, height: 980 });
    await w.waitForSelector('#view-agente .ag.ag-full', { timeout: 15000 });
    // el servidor no existe en la prueba: se capturan en el proceso principal las llamadas que irían a él
    await app.evaluate(({ ipcMain }) => {
      globalThis.__pos = { guardadas: [], quitadas: [] };
      ipcMain.removeHandler('fir:posiciones'); ipcMain.removeHandler('fir:posicionesQuitar');
      ipcMain.handle('fir:posiciones', (_e, plantilla, posiciones) => { globalThis.__pos.guardadas.push({ plantilla, posiciones }); return { ok: true, data: { ok: true } }; });
      ipcMain.handle('fir:posicionesQuitar', (_e, plantilla) => { globalThis.__pos.quitadas.push(plantilla); return { ok: true, data: { ok: true } }; });
    });
    const capturas = () => app.evaluate(() => globalThis.__pos);
    // la ventana de la orden de visita, con su PDF y quién firma (como la deja agenda.js)
    await w.evaluate((pdf) => window.Ventanas.abrir('negocios.agendaOrdenVisita', {
      pdfPromesa: Promise.resolve({ pdf, aviso: '', firmantes: [{ nombre: 'Ana Visitante', rol: 'Visitante' }] }),
      visitante: { nombre: 'Ana Visitante', rut: '11.111.111-1', email: 'ana@x.cl', telefono: '+56911112222', nacionalidad: 'chilena' },
      condiciones: { operacion: 'venta', vigencia: '250', garantia: '$250.000' }, visita: { fecha: '2037-12-01', hora: '11:00' },
      propiedades: [{ codigo: 'CV-1', titulo: 'Depto', direccion: 'Calle 1' }],
      alGuardar: async () => ({ pdf }), alConfirmar: async () => {},
    }, { clave: 'modal-3', ancho: true }), PDF);
    await w.waitForSelector('[data-pcf-firma="0"]', { timeout: 15000 });
    ok(!(await w.$('#pcfPagina')) && !(await w.$('#pcfUbicar')), 'las firmas ya están puestas en el PDF, sin botones para ubicarlas');
    ok(await w.locator('[data-pcf-hoja]').count() === 2, 'el PDF se ve con todas sus hojas, una bajo otra (2)');
    await w.locator('[data-pcf-firma="0"]').scrollIntoViewIfNeeded(); await w.waitForTimeout(500);
    ok(/Hoja 2 de 2/.test(await w.textContent('#pcfHoja')), 'abre en la última hoja del PDF (2 hojas), donde suelen ir las firmas');
    const medidas = () => w.evaluate(() => { const pg = document.querySelector(`[data-pcf-hoja="${document.querySelector('[data-pcf-firma="0"]').dataset.pcfPagina}"]`).getBoundingClientRect(); const b = document.querySelector('[data-pcf-firma="0"]').getBoundingClientRect(); return { cl: pg.left, ct: pg.top, cw: pg.width, ch: pg.height, bl: b.left, bt: b.top, bw: b.width, bh: b.height }; });
    let m = await medidas(); const s = m.cw / 612;
    ok(Math.abs(m.bw - 170 * s) < 2 && Math.abs(m.bh - 90 * s) < 2, 'el recuadro mide 170 × 90 puntos del PDF a la escala de la hoja');
    ok(Math.abs(m.bl - m.cl - 60 * s) < 2 && Math.abs(m.bt - m.ct - (792 - 70 - 90) * s) < 2, 'arranca abajo a la izquierda (x = 60, y = 70 desde el borde inferior)');
    await w.waitForTimeout(500);
    let c = await capturas();
    ok(c.guardadas.at(-1)?.plantilla === 'orden-visita' && c.guardadas.at(-1).posiciones[0].pagina === 2 && c.guardadas.at(-1).posiciones[0].x === 60 && c.guardadas.at(-1).posiciones[0].y === 70, 'las posiciones iniciales ya quedan guardadas para esa plantilla (hoja 2, x 60, y 70)');
    await shot('fu1-ubicar.png');

    // arrastrar el recuadro: 120 px a la derecha y 80 px hacia arriba
    const cx = m.bl + m.bw / 2; const cy = m.bt + m.bh / 2;
    await w.mouse.move(cx, cy); await w.mouse.down(); await w.mouse.move(cx + 60, cy - 40, { steps: 5 }); await w.mouse.move(cx + 120, cy - 80, { steps: 5 }); await w.mouse.up();
    await w.waitForTimeout(600);
    const m2 = await medidas();
    ok(Math.abs(m2.bl - m.bl - 120) < 3 && Math.abs(m2.bt - m.bt + 80) < 3, 'arrastrarlo mueve el recuadro con el mouse');
    c = await capturas(); const p = c.guardadas.at(-1).posiciones[0];
    ok(p.pagina === 2 && Math.abs(p.x - Math.round(60 + 120 / s)) <= 1 && Math.abs(p.y - Math.round(70 + 80 / s)) <= 1, `y guarda las coordenadas del PDF: x ${p.x}, y ${p.y} (esperado ≈ ${Math.round(60 + 120 / s)}, ${Math.round(70 + 80 / s)})`);
    ok(c.guardadas.length >= 2, 'cada cambio se guarda en el servidor');

    // no se sale de la hoja: arrastrarlo muy a la izquierda (más allá del borde) lo deja en el borde
    await w.locator('[data-pcf-firma="0"]').scrollIntoViewIfNeeded();
    const m2b = await medidas(); const cx2 = m2b.bl + m2b.bw / 2; const cy2 = m2b.bt + m2b.bh / 2;
    await w.mouse.move(cx2, cy2); await w.mouse.down(); await w.mouse.move(cx2 - (cx2 - 8) / 2, cy2, { steps: 5 }); await w.mouse.move(8, cy2, { steps: 5 }); await w.mouse.up();
    await w.waitForTimeout(600);
    const m3 = await medidas();
    ok(m3.bl >= m3.cl - 1 && Math.abs(m3.bl - m3.cl) < 2, 'si se arrastra más allá del borde izquierdo, queda en el borde de la hoja');
    c = await capturas(); const q = c.guardadas.at(-1).posiciones[0];
    ok(q.x === 0 && q.pagina === 2, `y la coordenada x queda en 0 (x ${q.x}, y ${q.y})`);
    await shot('fu2-borde.png');

    // de una hoja a otra: se agarra el recuadro, se recorre el PDF hacia arriba con la rueda y se suelta en la hoja 1
    const m4 = await medidas(); const cx4 = m4.bl + m4.bw / 2; const cy4 = m4.bt + m4.bh / 2;
    await w.mouse.move(cx4, cy4); await w.mouse.down(); await w.mouse.move(cx4 + 20, cy4 - 20, { steps: 3 });
    await w.evaluate(() => { const e = document.querySelector('#pcfScroll'); const h2 = document.querySelector('[data-pcf-hoja="2"]'); const h1 = document.querySelector('[data-pcf-hoja="1"]'); e.scrollTop -= h2.getBoundingClientRect().top - h1.getBoundingClientRect().top; });
    await w.waitForTimeout(200);
    await w.mouse.move(cx4 + 30, cy4 - 20, { steps: 3 }); await w.mouse.up(); await w.waitForTimeout(600);
    ok(await w.getAttribute('[data-pcf-firma="0"]', 'data-pcf-pagina') === '1', 'arrastrando y recorriendo el PDF, la firma pasa de la hoja 2 a la hoja 1');
    c = await capturas();
    ok(c.guardadas.at(-1).posiciones[0].pagina === 1, 'y guarda la página nueva');
    await shot('fu3-otra-hoja.png');

    // al cerrar la ventana se borra lo guardado
    const antes = c.quitadas.length;
    await w.keyboard.press('Escape'); await w.waitForTimeout(600);
    c = await capturas();
    ok(c.quitadas.length === antes + 1 && c.quitadas.at(-1) === 'orden-visita' && !(await w.$('[data-pcf-firma]')), 'al cerrar la ventana se borran las posiciones guardadas');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK firmas ubicar');
  } catch (e) { console.error(e.message); await shot('fu-error.png').catch(() => {}); process.exitCode = 1; } finally { await app.close(); }
})();
