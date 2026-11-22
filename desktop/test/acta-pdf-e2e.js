// La ventana del PDF del acta de visita (acta-visita/ActaPdf.tsx): la hoja se ve ENTERA dentro de la ventana, con flechas de página y zoom
// (al ampliar, se arrastra); no hay que desplazarse para ver la página completa. Usa el PDF de muestra del acta.   node test/acta-pdf-e2e.js
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-ap-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${path.join(tmp, 'ud')}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: path.join(tmp, 'inmo') } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const shot = (n) => w.screenshot({ path: path.join(__dirname, n) }).catch(() => {});
  try {
    await w.setViewportSize({ width: 1300, height: 800 }); await w.waitForFunction(() => window.studio && window.Ventanas, null, { timeout: 20000 }); await w.waitForTimeout(300);
    const pdf = fs.readFileSync(path.join(__dirname, 'fixtures', 'contrato_prueba.pdf')).toString('base64');
    await w.evaluate((b) => window.Ventanas.abrir('negocios.actaPdf', { pdf: b, archivo: 'Acta de visita PF-1001 - Matías (2026-11-14).pdf', alGuardar: async () => { window.__guardado = true; }, alCompartir: async () => { window.__compartido = true; } }, { ancho: true, clave: 'modal-126' }), pdf);
    await w.waitForSelector('#modalCard canvas', { timeout: 15000 }); await w.waitForTimeout(600);
    const m = await w.evaluate(() => { const c = document.querySelector('#modalCard canvas').getBoundingClientRect(); const marco = document.querySelector('#modalCard #ovPager').parentElement.getBoundingClientRect(); const card = document.querySelector('#modalCard').getBoundingClientRect(); return { cTop: c.top, cBot: c.bottom, mTop: marco.top, mBot: marco.bottom, cardBot: card.bottom, vh: innerHeight, pager: !!document.querySelector('#modalCard #ovPager') }; });
    ok(m.cTop >= m.mTop - 1 && m.cBot <= m.mBot + 1 && m.cBot < m.cardBot && m.cardBot <= m.vh + 1, `la hoja se ve entera dentro de la ventana (de ${Math.round(m.cTop)} a ${Math.round(m.cBot)} px, la ventana termina en ${Math.round(m.cardBot)})`);
    ok(m.pager && /Página 1 de 2/.test(await w.textContent('#ovPager')), 'con flechas de página y zoom (el PDF tiene 2 hojas)');
    await shot('ap1-acta-pdf.png');
    await w.click('#ovPager [aria-label="Acercar"]'); await w.click('#ovPager [aria-label="Acercar"]'); await w.waitForTimeout(500);
    ok(/150%/.test(await w.textContent('#ovPager')), 'se puede acercar (y la hoja ampliada se arrastra)');
    await w.click('#apWa'); await w.waitForFunction(() => window.__compartido === true, null, { timeout: 5000 }); ok(true, '«Compartir por WhatsApp» llama a compartir');
    await w.click('#apGuardar'); await w.waitForFunction(() => window.__guardado === true, null, { timeout: 5000 }); ok(true, '«Guardar PDF» llama a guardar');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK acta pdf');
  } catch (e) { console.error(e.message); await shot('ap-error.png'); process.exitCode = 1; } finally { await app.close(); }
})();
