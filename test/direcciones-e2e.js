// 0.9 · Dirección inteligente al subir una propiedad: sin clave, «Buscar» (OpenStreetMap); con la clave de Google,
// sugerencias mientras se escribe. Llena comuna y región y guarda las coordenadas (geolocalización).
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfdr-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfdr-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir, PF_START: 'inicio' } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const txt = (s) => w.textContent(s).then((t) => (t || '').replace(/\s+/g, ' '));
  const shot = (n) => w.screenshot({ path: path.resolve(__dirname, n) });
  const CLAVE = 'AIzaPrueba' + 'x'.repeat(29);
  try {
    await w.setViewportSize({ width: 1440, height: 920 }); await w.waitForSelector('#view-inicio');
    await w.evaluate(() => window.Inmo.formProp()); await w.waitForSelector('#pf_direccion');
    await w.waitForSelector('.dr-pie [data-activar]');
    ok(await w.isVisible('.dr-bus'), 'sin clave: botón «Buscar» (OpenStreetMap) y enlace para activar Google');
    await w.fill('#pf_titulo', 'Depto en Providencia'); await w.fill('#pf_direccion', 'Providencia 1234'); await w.click('.dr-bus');
    await w.waitForSelector('.dr-l [data-i]'); ok(/OpenStreetMap/.test(await txt('.dr-l')), 'muestra resultados con la atribución de OpenStreetMap');
    await w.click('.dr-l [data-i="0"]'); await w.waitForSelector('.dr-ok');
    ok(await w.inputValue('#pf_comuna') === 'Providencia' && /Metropolitana/.test(await w.inputValue('#pf_region')), 'al elegir, llena comuna y región');
    await w.fill('#pf_direccion', 'Otra calle 1'); ok(!(await w.$('.dr-ok')), 'si se cambia la dirección a mano, se descartan las coordenadas');

    // activar Google
    await w.click('.dr-pie [data-activar]'); await w.fill('.dr-act input', 'no-es-clave'); await w.click('.dr-act [data-ok]');
    await w.waitForSelector('.dr-act .dr-err'); ok(/no parece una clave/.test(await txt('.dr-act')), 'valida el formato de la clave');
    await w.fill('.dr-act input', CLAVE); await w.click('.dr-act [data-ok]'); await w.waitForSelector('.dr-g');
    ok(!(await w.isVisible('.dr-bus')), 'con la clave: «Direcciones de Google» activo');
    const raw = fs.readFileSync(path.join(userData, 'portalfirma.json'), 'utf8'); ok(!raw.includes(CLAVE), 'la clave no queda en texto plano');
    await w.fill('#pf_comuna', ''); await w.fill('#pf_region', '');
    await w.fill('#pf_direccion', ''); await w.type('#pf_direccion', 'Av Providencia 12', { delay: 20 }); await w.waitForSelector('.dr-l [data-i="1"]');
    await shot('dr1-google.png');
    ok(/Avenida Providencia 1234/.test(await txt('.dr-l')) && /Google/.test(await txt('.dr-l')), 'sugiere mientras se escribe');
    await w.press('#pf_direccion', 'ArrowDown'); await w.press('#pf_direccion', 'Enter'); await w.waitForSelector('.dr-ok');
    ok(await w.inputValue('#pf_direccion') === 'Avenida Providencia 1234' && await w.inputValue('#pf_comuna') === 'Providencia', 'con el teclado: elige y llena calle, número y comuna');
    await w.check('#pf_arriendo'); await w.fill('#pf_precioArriendo', '850000'); await w.click('#mOk'); await w.waitForSelector('#fMapa');
    const p = await w.evaluate(() => window.pf.inmoListar().then((r) => r.data.propiedades.find((x) => x.titulo === 'Depto en Providencia')));
    ok(Math.abs(p.lat + 33.4295) < 1e-6 && Math.abs(p.lng + 70.6162) < 1e-6 && p.placeId === 'mock-prov-1234', `la propiedad guarda sus coordenadas (${p.lat}, ${p.lng})`);
    await shot('dr2-ficha.png');
    await w.click('#fMapa'); await w.waitForTimeout(300); const ab = await app.evaluate(() => global.__abiertos || []);
    ok(ab.some((u) => /google\.com\/maps\/search\/\?api=1&query=-33\.4295,-70\.6162/.test(u)), '«ver en el mapa» abre Google Maps en esas coordenadas');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK direcciones');
  } catch (e) { console.error(e.message); await shot('dr-error.png').catch(() => {}); process.exitCode = 1; } finally { await app.close(); }
})();
