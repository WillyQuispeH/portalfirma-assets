// Diseño (imagen del inicio y formas inmobiliarias) y sistema «Aprende» con recorridos guiados por panel.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfap-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfap-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir, PF_START: 'inicio' } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const txt = (s) => w.textContent(s).then((t) => t || '');
  const shot = (n) => w.screenshot({ path: path.resolve(__dirname, n) });
  try {
    await w.setViewportSize({ width: 1440, height: 900 }); await w.waitForSelector('#view-inicio [data-cabecera]');
    ok(!!(await w.$('#view-inicio [data-layout-fondo]')), 'el inicio usa el fondo del kit (Layout)');
    await w.click('#view-inicio [data-do="importar"]'); await w.waitForSelector('text=Cartera actualizada', { timeout: 15000 }); await w.click('#mOk'); await w.waitForSelector('.im-card');
    await w.evaluate(() => window.Inmo.inicio()); await w.waitForSelector('#view-inicio .hoy-ks'); await w.waitForTimeout(700); await shot('ap1-inicio.png');
    await w.evaluate(() => window.Inmo.cartera()); await w.waitForSelector('.im-card'); await w.waitForTimeout(300);
    ok(/formas\/cartera\.svg/.test(await w.evaluate(() => { const c = document.querySelector('#view-cartera [data-cabecera]'); return getComputedStyle(c).backgroundImage + getComputedStyle(c, '::before').backgroundImage; })), 'Cartera con su diseño de formas');
    await shot('ap2-cartera.png');
    for (const [fn, sel, svg] of [['window.Inmo.personas()', '#cTabla', 'personas'], ['window.Negocios.abrir()', '.ng-board', 'negocios'], ['window.Inmo.portales()', '#coWa', 'portales']]) {
      await w.evaluate(fn); await w.waitForSelector(sel);
      ok(new RegExp('formas/' + svg + '\\.svg').test(await w.evaluate(() => [...document.querySelectorAll('.im-head, [data-cabecera]')].filter((x) => x.offsetParent).map((x) => getComputedStyle(x).backgroundImage + getComputedStyle(x, '::before').backgroundImage).join())), `${svg[0].toUpperCase() + svg.slice(1)} con su diseño`);
    }
    await shot('ap3-negocios-portales.png');

    // Aprende
    await w.click('#helpFab'); await w.waitForSelector('#hpAprende');
    ok(/Gestión inmobiliaria/.test(await txt('#helpPanel')), 'la ayuda tiene guías de gestión inmobiliaria');
    await w.fill('#hpQ', 'como muevo un negocio de etapa'); await w.waitForTimeout(400); ok(/Negocios/.test(await txt('#hpRes')), 'el buscador de la ayuda encuentra la guía de negocios');
    await w.click('#hpAprende'); await w.waitForSelector('.ap-grid');
    ok((await w.$$('.ap-card')).length === 10 && /0 de 10/.test(await txt('#view-aprende')), '10 lecciones, una por panel, con avance');
    await shot('ap4-aprende.png');
    await w.click('#apStart'); await w.waitForSelector('.ap-pasos'); ok(/Inicio/.test(await txt('#view-aprende [data-cabecera]')), 'empieza por la primera lección');
    await w.click('[data-go="cartera"]'); await w.waitForSelector('text=Lección 2 de 10');
    await shot('ap5-leccion.png');
    await w.click('#apVivo'); await w.waitForSelector('.tour-tip', { timeout: 8000 });
    ok(/Importar desde Portalfirma/.test(await txt('.tour-tip')) && await w.isVisible('#imQ'), '«Verlo en vivo» abre Cartera y empieza el recorrido');
    await shot('ap6-recorrido.png');
    let n = 1; while (await w.$('.tour-tip [data-tour="next"]')) { const t = await txt('.tour-tip [data-tour="next"]'); await w.click('.tour-tip [data-tour="next"]'); n++; if (/Terminar|Listo/i.test(t) || n > 10) break; }
    ok(n >= 5 && !(await w.$('.tour')), `recorrido completo (${n - 1} pasos)`);
    for (const id of ['ficha', 'negocios', 'portales']) {
      await w.evaluate((i) => window.Aprende.leccion(i), id); await w.waitForSelector('#apVivo'); await w.click('#apVivo'); await w.waitForSelector('.tour-tip', { timeout: 8000 });
      ok((await w.$$eval('.tour-n', (x) => x.length)) === 1, `recorrido en vivo de «${id}»`); await w.keyboard.press('Escape');
    }
    await w.evaluate(() => window.Aprende.abrir()); await w.waitForSelector('.ap-grid'); ok(/4 de 10|5 de 10/.test(await txt('#view-aprende')), 'guarda el avance');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK aprende');
  } catch (e) { console.error(e.message); await shot('ap-error.png').catch(() => {}); process.exitCode = 1; } finally { await app.close(); }
})();
