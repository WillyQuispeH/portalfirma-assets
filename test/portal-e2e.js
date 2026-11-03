// Portal Inmobiliario (API de Mercado Libre simulada): conexión, contacto, revisión previa, publicación con CMG_SITE,
// sincronía automática con la ficha (precio, estado), interesados al CRM y vinculación de avisos existentes (Convecta).
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfpi-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfpi-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir, PF_START: 'inicio' } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const txt = (s) => w.textContent(s).then((t) => t || '');
  const shot = (n) => w.screenshot({ path: path.resolve(__dirname, n) });
  const ml = () => app.evaluate(() => JSON.parse(JSON.stringify(global.__mlMock)));
  try {
    await w.setViewportSize({ width: 1440, height: 900 }); await w.waitForSelector('#view-inicio .im-hero');
    await w.click('#view-inicio [data-do="importar"]'); await w.waitForSelector('text=Cartera actualizada', { timeout: 15000 }); await w.click('#mOk'); await w.waitForSelector('.im-card');
    await w.click('.im-card:has-text("CV-9001")'); await w.waitForSelector('.im-ftabs'); await w.evaluate((k) => window.Inmo.fichaTab(k), 'portales'); await w.waitForSelector('#fPI');
    ok(/No publicado/.test(await txt('#fPI')) && await w.isVisible('#fPI [data-pi="publicar"]'), 'la ficha muestra el bloque Portal Inmobiliario sin publicar');

    await w.click('#fPI [data-pi="publicar"]'); await w.waitForSelector('#piTit');
    const e1 = await txt('#modalCard');
    ok(/Conecta la cuenta/.test(e1) && /WhatsApp de contacto/.test(e1) && await w.isDisabled('#mOk'), 'sin cuenta ni WhatsApp no deja publicar y explica por qué');
    ok(/Casas › Venta › Propiedades usadas/.test(e1) && /Colina/.test(e1), 'resuelve la categoría y la comuna de Mercado Libre');
    await w.click('#piCfg'); await w.waitForSelector('#coWa');

    // Portales: contacto y conexión
    await w.fill('#coNom', 'Corredora Demo'); await w.fill('#coMail', 'ventas@demo.cl'); await w.fill('#coWa', '12345'); await w.click('#coSave');
    ok(/celular chileno/.test(await txt('#coErr')), 'valida el WhatsApp');
    await w.fill('#coWa', '+56 9 3480 0626'); await w.click('#coSave'); await w.waitForTimeout(300);
    await w.click('#poCon'); await w.waitForSelector('#poSync');
    ok(/CORREDORA_DEMO/.test(await txt('#view-cartera')) && /Publicación: 25/.test(await txt('#view-cartera')), 'cuenta conectada con paquetes disponibles');
    await shot('pi1-portales.png');

    // Publicar
    await w.click('#poBack'); await w.click('.im-card:has-text("CV-9001")'); await w.waitForSelector('.im-ftabs'); await w.evaluate((k) => window.Inmo.fichaTab(k), 'portales'); await w.waitForSelector('#fPI');
    await w.click('#fPI [data-pi="publicar"]'); await w.waitForSelector('#piTit');
    ok(await w.isEnabled('#mOk') && /3 de 12 recomendadas/.test(await txt('#modalCard')) && /12 o más/.test(await txt('#modalCard')), 'con todo listo deja publicar y advierte sobre la calidad (fotos)');
    await w.fill('#piTit', 'Casa con piscina y jardín en Chicureo'); await shot('pi2-publicar.png');
    await w.click('#mOk'); await w.waitForSelector('#fPI .im-st.ok');
    let s = await ml(); const it = Object.values(s.items).find((x) => x.title === 'Casa con piscina y jardín en Chicureo');
    ok(it && it.attributes.some((a) => a.id === 'CMG_SITE' && a.value_name === 'POI') && it.currency_id === 'CLF' && it.price === 18500, 'aviso creado con CMG_SITE (sale en Portal Inmobiliario), en UF (CLF)');
    ok(it.seller_contact.country_code2 === '56' && it.seller_contact.phone2 === '934800626' && it.seller_custom_field === 'CV-9001', 'WhatsApp obligatorio en el formato de la API y código de la propiedad');
    ok(it.attributes.some((a) => a.id === 'BEDROOMS' && a.value_name === '4') && it.attributes.some((a) => a.id === 'TOTAL_AREA' && a.value_name === '800 m²'), 'atributos de la ficha (dormitorios, superficie)');
    ok(/Activo/.test(await txt('#fPI')) && /Publicada en Portal Inmobiliario/.test(await txt('.im-act')), 'la ficha muestra el aviso activo y queda en el historial');

    // La ficha manda: estado y precio
    await w.evaluate((k) => window.Inmo.fichaTab(k), 'resumen'); await w.selectOption('[data-est="estadoVenta"]', 'reservada'); await w.waitForTimeout(800); await w.evaluate((k) => window.Inmo.fichaTab(k), 'portales'); await w.waitForSelector('#fPI .im-st.res', { timeout: 8000 });
    ok((await ml()).items[it.id].status === 'paused', 'reservar la propiedad pausa el aviso');
    await w.evaluate((k) => window.Inmo.fichaTab(k), 'resumen'); await w.selectOption('[data-est="estadoVenta"]', 'disponible'); await w.waitForTimeout(800); await w.evaluate((k) => window.Inmo.fichaTab(k), 'portales'); await w.waitForSelector('#fPI .im-st.ok', { timeout: 8000 });
    ok((await ml()).items[it.id].status === 'active', 'volver a disponible lo reactiva');
    await w.click('#fEdit'); await w.fill('#pf_precioVenta', '17900'); await w.click('#mOk'); await w.waitForTimeout(1500);
    ok((await ml()).items[it.id].price === 17900, 'cambiar el precio en la ficha actualiza el aviso');

    // Interesados
    await w.click('#imPort').catch(() => {}); await w.evaluate(() => window.Inmo.portales()); await w.waitForSelector('#poSync');
    await w.click('#poSync'); await w.waitForSelector('text=interesados nuevos');
    ok(/3 interesados nuevos/.test(await txt('#toast')), 'trae 3 interesados (WhatsApp, visita y pregunta)');
    await w.evaluate(() => window.Inmo.inicio()); await w.waitForSelector('.im-kpis');
    ok(/1 propiedad con interesados nuevos/.test(await txt('#view-inicio')), 'el inicio avisa de interesados nuevos');
    await w.click('.im-at[data-esp="leads"]'); await w.waitForSelector('.im-card'); await w.click('.im-card'); await w.waitForSelector('.im-new');
    const fic = await txt('#view-cartera');
    ok(/Rosa Fuentes Lara/.test(fic) && /solicitud de visita/.test(fic) && /Pedro Guest/.test(fic), 'la ficha lista los interesados con su canal');
    ok(/Interesado · 15\.555\.555-6/.test(fic), 'el interesado con RUT entra al CRM vinculado a la propiedad');
    await shot('pi3-interesados.png');
    await w.click('[data-lead]'); await w.fill('#cf_rut', '7.777.777-7'.replace(/7$/, String(dv('7777777')))); await w.click('#mOk'); await w.waitForSelector('.im-pv:has-text("Pedro Guest") >> text=Interesado ·');
    ok(true, 'un interesado sin RUT se agrega al CRM con un clic');

    // Migración: avisos existentes publicados por Convecta
    await w.evaluate(() => window.Inmo.portales()); await w.waitForSelector('#poExist'); await w.click('#poExist'); await w.waitForSelector('.im-ex');
    ok(/Depto amoblado Providencia/.test(await txt('#modalCard')) && await w.isChecked('[data-i="0"]') && (await w.inputValue('[data-o="0"]')) === 'arriendo', 'encuentra el aviso que publicó Convecta y lo asocia por código (CV-9002, arriendo)');
    await shot('pi4-existentes.png');
    await w.click('#mOk'); await w.waitForSelector('text=aviso vinculado');
    const nuevos = async () => Object.keys((await ml()).items).filter((k) => k !== 'MLC1999000001').length; const n0 = await nuevos();
    await w.evaluate(() => window.Inmo.cartera({ especial: '', op: 'todas' })); await w.click('.im-card:has-text("CV-9002")'); await w.waitForSelector('.im-ftabs'); await w.evaluate((k) => window.Inmo.fichaTab(k), 'portales'); await w.waitForSelector('#fPI');
    ok(/MLC1999000001/.test(await txt('#fPI')) && /Activo/.test(await txt('#fPI')) && !(await w.$('#fPI [data-pi="publicar"]')), 'la ficha queda con el aviso existente, sin publicar otro');
    await w.click('#fPI [data-pi="actualizar"]'); await w.waitForSelector('text=Aviso actualizado');
    ok((await nuevos()) === n0 && (await ml()).items.MLC1999000001.title === 'Departamento en Providencia', 'actualizar envía la ficha al aviso existente, sin crear duplicados');

    // Finalizar
    await w.click('.im-card:has-text("CV-9002")').catch(() => {}); await w.click('#fPI [data-pi="closed"]'); await w.click('#mOk'); await w.waitForSelector('#fPI [data-pi="publicar"]:has-text("Publicar de nuevo")');
    ok(true, 'finalizar el aviso deja la opción de publicar de nuevo');
    await w.click('#fBack'); ok((await w.$$('.im-ops i.pi')).length === 1, 'la cartera marca con «PI» las propiedades publicadas');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK portal');
  } catch (e) { console.error(e.message); await shot('pi-error.png').catch(() => {}); process.exitCode = 1; } finally { await app.close(); }
})();
function dv(b) { let s = 0, m = 2; for (let i = b.length - 1; i >= 0; i--) { s += Number(b[i]) * m; m = m === 7 ? 2 : m + 1; } const r = 11 - (s % 11); return r === 11 ? '0' : r === 10 ? 'K' : String(r); }
