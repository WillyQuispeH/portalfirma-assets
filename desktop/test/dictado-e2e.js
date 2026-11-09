// 0.12 · Dictar una propiedad: audio (micrófono simulado) o texto → ficha llena → lo que falta → corregir dictando → crear.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfdc-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfdc-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const txt = (s) => w.textContent(s).then((t) => (t || '').replace(/\s+/g, ' '));
  const val = (k) => w.inputValue(`.ga-dc [data-k="${k}"]`);
  const shot = (n) => w.screenshot({ path: path.resolve(__dirname, n) });
  try {
    await w.setViewportSize({ width: 1500, height: 1000 });
    await w.waitForSelector('#view-agente .ag.ag-full', { timeout: 15000 });
    // 1. «Subir una propiedad» abre el dictado; se graba con el micrófono
    await w.click('#agMas'); await w.click('.ag-full [data-rapida="nueva"]'); await w.waitForSelector('.ga-dc [data-mic]');
    ok(/Dictar una propiedad/.test(await txt('.ga-dc')), '«Subir una propiedad» abre «Dictar una propiedad»');
    await w.click('.ga-dc [data-mic]'); await w.waitForTimeout(400); if (await w.isVisible('#mOk').catch(() => false)) { ok(/Antes de usar el asistente/.test(await txt('#modalCard')), 'la primera vez pide el consentimiento de IA'); await w.click('#mOk'); } await w.waitForSelector('.dc-mic.on'); await w.waitForTimeout(2500);
    ok(/Detener · 0:0[12]/.test(await txt('.dc-mic')), 'graba con el micrófono y muestra el tiempo');
    await shot('dc0-grabando.png');
    await w.click('.ga-dc [data-mic]'); await w.waitForSelector('.ga-dc .dc-g', { timeout: 20000 });
    ok(true, 'al detener, transcribe y llena la ficha sola');
    const d = { tipo: await val('tipo'), arr: await w.isChecked('.ga-dc [data-k="arriendo"]'), pr: await val('precioArriendo'), m: await val('precioArriendoM'), dir: await val('direccion'), un: await val('unidad'), com: await val('comuna'), dor: await val('dormitorios'), ban: await val('banos'), su: await val('supUtil'), st: await val('supTotal'), gc: await val('gastosComunes') };
    ok(d.tipo === 'departamento' && d.arr && d.pr === '850000' && d.m === 'CLP' && /Avenida del Tranque 1234/.test(d.dir) && d.un === '26B' && d.com === 'Lo Barnechea', `entendió tipo, arriendo, 850 lucas = $850.000, dirección, depto y comuna (${d.dir}, ${d.un})`);
    ok(d.dor === '3' && d.ban === '2' && d.su === '85' && d.st === '92' && d.gc === '120000', 'y dormitorios, baños, metros y gastos comunes');
    ok(/Lista para crear/.test(await txt('.ga-dc .ga-foot .ga-falta')) && /piso 7/.test(await txt('.ga-dc')) && /Cocina amplia/.test(await val('caracteristicas')), 'nada falta; anota piso y orientación, y las características');
    await shot('dc1-ficha.png');
    // 2. corregir dictando (escrito)
    await w.click('.ga-dc [data-cor]'); await w.fill('.ga-dc [data-t2]', 'perdón, son tres baños'); await w.click('.ga-dc [data-c2ok]');
    await w.waitForFunction(() => document.querySelector('.ga-dc [data-k="banos"]')?.value === '3');
    ok(await val('dormitorios') === '3' && await val('supUtil') === '85', 'corregir dictando cambia solo lo corregido (baños: 3) y mantiene el resto');
    // 3. crear
    await w.click('.ga-dc [data-crear]'); await w.waitForSelector('.ga.hecha:has-text("creada dictando")');
    const p = (await w.evaluate(() => window.pf.inmoListar().then((r) => r.data))).propiedades.find((x) => /Tranque/.test(x.direccion || ''));
    ok(p && p.tipo === 'departamento' && p.arriendo && p.precioArriendo.valor === 850000 && p.dormitorios === 3 && p.banos === 3 && p.supUtil === 85 && p.estacionamientos === 1 && p.bodegas === 1 && /piso 7/.test(p.notasInternas) && p.etiquetas.includes('Piso flotante'), `crea la propiedad ${p?.codigo} con todo lo dictado`);
    await w.waitForSelector('.ag-sig.sug2 button:has-text("Cargar fotos desde Drive")'); ok(true, 'y sugiere cargar las fotos desde Drive, ver la ficha, gestionar o publicar');
    // 3b. fotos desde Google Drive (selector simulado): se bajan, se pasan a JPG y se ven en la ficha
    await app.evaluate(({ nativeImage }) => { const png = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAIAAAAuKetIAAAAU0lEQVR4nO3PQQ3AIADAQEANmlCMrIngcVnSU9DOfe74s6UDXjWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaB9kvcBqqohxzcAAAAASUVORK5CYII=').toPNG();
      global.__driveFotos = [{ id: 'fotoA1', name: 'living.png', mimeType: 'image/png', bytes: png }, { id: 'fotoB2', name: 'cocina.png', mimeType: 'image/png', bytes: png }, { id: 'fotoC3', name: 'IMG_0001.HEIC', mimeType: 'image/heic', bytes: Buffer.from('no-es-imagen') }]; });
    await w.click('.ag-sig.sug2 button:has-text("Cargar fotos desde Drive")'); await w.waitForSelector('#mOk:has-text("Conectar")'); await w.click('#mOk');
    await w.waitForSelector('text=fotos cargadas', { timeout: 15000 });
    ok(/2 fotos cargadas/.test(await txt('body')) && /IMG_0001\.HEIC/.test(await txt('body')), 'carga las fotos elegidas y avisa la que no pudo leer');
    ok(await app.evaluate(() => global.__drivePickQuery) === 'Avenida del Tranque 1234', 'el selector de Drive se abre buscando la dirección de la propiedad');
    const p2 = (await w.evaluate(() => window.pf.inmoListar().then((r) => r.data))).propiedades.find((x) => /Tranque/.test(x.direccion || ''));
    ok(p2.fotos.length === 2 && p2.fotos.every((u) => /^pffoto:\/\/f\//.test(u)), 'quedan guardadas en la propiedad');
    await w.evaluate((id) => window.Inmo.abrirFicha(id), p2.id); await w.waitForSelector('.im-gmain img');
    await w.waitForFunction(() => document.querySelector('.im-gmain img').naturalWidth > 0, null, { timeout: 8000 });
    ok(true, 'y se ven en la ficha'); await shot('dc3-fotos.png');
    // cambiar la cuenta de Google desde Asset antes de elegir fotos
    await w.evaluate((id) => { window.Fotos.drive(id); }, p2.id); await w.waitForSelector('#fdCambiar');
    ok(/Vas a elegir las fotos con la cuenta/.test(await txt('#modalCard')), 'antes de abrir Drive muestra con qué cuenta de Google se eligen las fotos');
    await w.click('#fdCambiar');
    await w.waitForSelector('text=ya estaba cargada', { timeout: 15000 });
    ok(true, '«Cambiar cuenta» reconecta Google (eligiendo la cuenta) y sigue con las fotos');
    await w.evaluate(() => window.Drive.cuenta()); await w.waitForSelector('#drvCambiar'); ok(/Cuenta de Google Drive/.test(await txt('#modalCard')), 'en tu cuenta › Google Drive se ve la cuenta conectada, con «Cambiar cuenta» y «Desconectar»'); await w.click('#mCancel');
    await w.click('#nav [data-view="agente"]'); await w.waitForSelector('#view-agente .ag.ag-full');
    // 4. dictado incompleto: dice qué falta
    await w.evaluate(() => window.Dictado.abrir()); await w.waitForSelector('.ga-dc:last-of-type [data-txt]');
    await w.fill('.ga-dc [data-txt]', 'Casa en venta en Calle Los Olmos 55, Lo Barnechea'); await w.click('.ga-dc [data-ok]'); await w.waitForSelector('.ga-dc .dc-g');
    const f = await txt('.ga-dc .ga-foot .ga-falta');
    ok(/Me falta: precio de venta, dormitorios, baños, superficie construida \/ útil \(m²\)/.test(f), `si falta algo, lo dice: «${f}»`);
    ok(await w.evaluate(() => ['precioVenta', 'dormitorios', 'banos', 'supUtil'].every((k) => document.querySelector(`.ga-dc [data-k="${k}"]`)?.closest('.falta'))), 'y marca esos campos para completarlos ahí mismo');
    await w.fill('.ga-dc [data-k="precioVenta"]', '9500'); await w.waitForFunction(() => !document.querySelector('.ga-dc [data-k="precioVenta"]').closest('.falta'));
    ok(true, 'al completar un dato, deja de marcarlo'); await shot('dc2-falta.png');
    // 5. hablarle al Agente con el micrófono del cuadro de texto: transcribe, envía y el agente llena la ficha
    const antes = (await w.$$('.ga-dc')).length;
    await w.click('#agMic .ag-mic'); await w.waitForSelector('#agMic .ag-mic.on'); await w.waitForTimeout(1500); await w.click('#agMic .ag-mic');
    await w.waitForFunction((n) => document.querySelectorAll('.ga-dc .dc-g').length > n - 1 && [...document.querySelectorAll('.ag-msg.user, .ag-msg.yo, .ag-msg')].some((m) => /Estoy captando/.test(m.textContent)), antes, { timeout: 20000 });
    await w.waitForFunction((n) => document.querySelectorAll('.ga-dc').length > n, antes, { timeout: 20000 });
    ok(true, 'el micrófono del Agente transcribe, envía el mensaje y el agente abre la ficha dictada (asset_dictar_propiedad)');
    // 6. la descripción del aviso no habla de precios ni usa jerga
    const ld = require('../src/dictado').limpiarDescripcion('Amplio depto de 85 m² en Lo Barnechea, en arriendo por 850 lucas. Cuenta con tres dormitorios.\nLos gastos comunes son de $120.000. Excelente vista!');
    ok(!/lucas|\$|gastos comunes|depto|!/.test(ld) && /Amplio departamento de 85 m² en Lo Barnechea\./.test(ld), `la descripción queda sin precios ni jerga: «${ld.replace(/\n+/g, ' ')}»`);
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK dictado');
  } catch (er) { console.error(er.message); await shot('dc-error.png').catch(() => {}); process.exitCode = 1; } finally { await app.close(); }
})();
