// 0.16.21 · Leads: historial de Instagram desde el archivo de «Descargar tu información» (JSON). Texto con el mojibake
// de Instagram, foto incluida, solicitud de mensaje, el dueño de la cuenta deducido, autorización obligatoria y
// registrada, una conversación por lead con perfil leído por IA, y volver a subir el archivo agrega solo lo nuevo.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const JSZip = require('jszip');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
const IG = require('../src/instagram-import');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');
const moji = (s) => Buffer.from(s, 'utf8').toString('latin1'); // así escribe Instagram el texto
const T0 = Date.parse('2026-10-20T15:00:00Z');
const R = 'your_instagram_activity/messages/';
function hilo(nombre, cliente, msgs) { return { participants: [{ name: moji(cliente) }, { name: 'The Living Propiedades' }], title: moji(cliente), thread_path: 'inbox/' + nombre,
  messages: msgs.map(([quien, txt, extra], i) => ({ sender_name: moji(quien === 'c' ? cliente : 'The Living Propiedades'), timestamp_ms: T0 + i * 60000, ...(txt ? { content: moji(txt) } : {}), ...(extra || {}) })).reverse() }; }
async function zipIg(extra = []) {
  const z = new JSZip();
  z.file(R + 'inbox/camilarojas_1234567890/message_1.json', JSON.stringify(hilo('camilarojas_1234567890', 'Camila Rojas', [
    ['c', 'Hola! vi el depto de Ñuñoa en su publicación, ¿sigue disponible?'],
    ['b', 'Hola Camila, sí. ¿Buscas arriendo?'],
    ['c', 'Sí, arriendo para mi familia, 3 dormitorios y 2 baños en Ñuñoa, hasta 900 lucas. Tenemos un perro'],
    ['c', null, { photos: [{ uri: R + 'inbox/camilarojas_1234567890/photos/foto1.jpg', creation_timestamp: 1 }] }],
    ['c', 'Mi celular es +56 9 7777 1234 y mi correo camila.rojas@gmail.com'],
    ['c', 'Reaccionó ❤️ a tu mensaje'],
    ...extra,
  ])));
  z.file(R + 'inbox/camilarojas_1234567890/photos/foto1.jpg', PNG);
  z.file(R + 'inbox/pedrosoto_222333444/message_1.json', JSON.stringify(hilo('pedrosoto_222333444', 'Pedro Soto', [['c', 'Buenas, ¿la casa de La Reina es venta? ¿precio?'], ['b', 'Hola Pedro, sí, 12.500 UF']])));
  z.file(R + 'message_requests/vecino_555666777/message_1.json', JSON.stringify(hilo('vecino_555666777', 'José Muñoz', [['c', 'Hola, quiero vender mi depto en Providencia']])));
  z.file(R + 'inbox/promo_999/message_1.json', JSON.stringify(hilo('promo_999', 'Tienda X', [['b', 'Hola, ¿nos sigues?']])));
  return z.generateAsync({ type: 'nodebuffer' });
}
(async () => {
  // lectura del archivo (sin app)
  ok(IG.arreglar(moji('Ñuñoa ❤️ ¿sí?')) === 'Ñuñoa ❤️ ¿sí?' && IG.arreglar('Ñuñoa') === 'Ñuñoa', 'corrige el texto mal codificado de Instagram y no toca el que ya está bien');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pfig-f-'));
  const zip1 = path.join(tmp, 'instagram-thelivingprop-2026-10-28-abc.zip'); fs.writeFileSync(zip1, await zipIg());
  const d = await IG.leer(await IG.abrirZip({ ruta: zip1 }));
  const cam = d.hilos.find((h) => h.id === 'camilarojas_1234567890');
  ok(d.dueno === 'The Living Propiedades', 'deduce la cuenta de la corredora (aparece en todas las conversaciones)');
  ok(cam.cliente === 'Camila Rojas' && cam.usuario === 'camilarojas' && cam.mensajes.length === 5 && cam.mensajes[0].texto.startsWith('Hola! vi el depto de Ñuñoa'), 'conversación ordenada, en buen español, sin las reacciones automáticas');
  ok(cam.mensajes[0].fecha === '2026-10-20T12:00:00', 'la hora queda en hora de Chile');
  const htmlZip = path.join(tmp, 'instagram-html.zip'); { const z = new JSZip(); z.file('messages/inbox/a_1/message_1.html', '<html></html>'); fs.writeFileSync(htmlZip, await z.generateAsync({ type: 'nodebuffer' })); }

  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfig-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfig-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const txt = (s) => w.textContent(s).then((t) => (t || '').replace(/\s+/g, ' '));
  const shot = (n) => w.screenshot({ path: path.resolve(__dirname, n) });
  try {
    await w.setViewportSize({ width: 1500, height: 960 });
    await w.waitForSelector('#view-agente .ag.ag-full', { timeout: 15000 });
    await w.click('#nav [data-view="leads"]'); await w.waitForSelector('.ld-vacio');
    ok(!!(await w.$('#ldIg2')), 'la bandeja vacía ofrece importar el historial de Instagram');
    // panel de cuentas e historial
    await w.click('#ldCuentas'); await w.waitForSelector('.ld-cuentas');
    const p = await txt('.ld-cuentas');
    ok(/Instagram · historial de mensajes/.test(p) && /WhatsApp · chat exportado/.test(p) && /En vivo desde wechatia/.test(p), 'panel «Cuentas e historial»: Instagram, WhatsApp y en vivo');
    await shot('ig0-cuentas.png');
    await w.click('#ldCtaIg'); await w.waitForSelector('.ld-ol');
    const ins = await txt('.ld-cuentas');
    ok(/Centro de cuentas/.test(ins) && /Descargar tu información/.test(ins) && /Mensajes/.test(ins) && /JSON/.test(ins) && /dueño de la cuenta/.test(ins), 'instrucciones paso a paso para que el dueño descargue sus mensajes (solo Mensajes, JSON)');
    await shot('ig1-instrucciones.png');
    await w.click('#mCancel');
    // una descarga en HTML se rechaza con la indicación
    await w.setInputFiles('#ldFileIg', htmlZip); await w.waitForSelector('text=No se pudo importar');
    ok(/formato JSON/.test(await txt('#modalCard')), 'una descarga en HTML se rechaza: pide el formato JSON'); await w.click('#mCancel');
    // el .zip de Instagram, arrastrado o elegido
    await w.setInputFiles('#ldFileIg', zip1); await w.waitForSelector('.ld-igimp');
    const m = await txt('.ld-igimp');
    ok(/4 conversaciones/.test(m) && /Camila Rojas/.test(m) && /@camilarojas/.test(m) && /solicitud de mensaje/.test(m) && /sin respuesta del cliente/.test(m), 'muestra las conversaciones con usuario, solicitudes y las que no tienen respuesta');
    ok(await w.inputValue('#ldIgDueno') === 'The Living Propiedades', 'la cuenta de la corredora viene puesta');
    ok(await w.isChecked('[data-hilo="camilarojas_1234567890"]') && !(await w.isChecked('[data-hilo="promo_999"]')), 'marca por defecto las que tienen mensajes del cliente');
    ok(/Importar 3/.test(await txt('#mOk')) && (await txt('#ldIgN')) === '3', 'cuenta lo que se importa y los tokens de IA');
    await shot('ig2-importar.png');
    await w.click('#mOk'); await w.waitForTimeout(300);
    ok(/autorización/.test(await txt('#ldErr2')), 'sin la autorización del dueño no importa');
    await w.fill('#ldIgCuenta', '@thelivingprop'); await w.check('#ldIgAut'); await w.click('#mOk');
    await w.waitForSelector('#ldChB .ld-m', { timeout: 20000 });
    ok((await w.$$('#ldItems .ld-it')).length === 3, 'quedan 3 leads (uno por conversación)');
    await w.click('#ldItems .ld-it:has-text("Camila Rojas")'); await w.waitForSelector('#ldFicha .ld-perfil', { timeout: 10000 });
    const ch = await txt('#ldChB');
    ok(/Ñuñoa/.test(ch) && !/Ã/.test(ch) && !/Reaccionó/.test(ch), 'la conversación se lee bien');
    ok((await w.$$('#ldChB .ld-m.in')).length === 4 && (await w.$$('#ldChB .ld-m.out')).length === 1 && !!(await w.$('#ldChB img[src^="pffoto://l/"]')), 'cliente a la izquierda, la corredora a la derecha y la foto incluida');
    ok(await w.inputValue('#ldFicha [data-k="email"]') === 'camila.rojas@gmail.com' && /7777/.test(await w.inputValue('#ldFicha [data-k="telefono"]')), 'la IA anota correo y celular que dio en el chat');
    ok(await w.inputValue('#ldFicha [data-k="b_operacion"]') === 'arriendo' && await w.inputValue('#ldFicha [data-k="b_dormitorios"]') === '3', 'y lo que busca');
    ok(/familia/.test(await txt('#ldFicha .ld-perfil')) && /@camilarojas/.test(await txt('#ldFicha .ld-igc')) && /Instagram/.test(await txt('.ld-ch-h')), 'perfil del cliente, su usuario y el origen Instagram');
    await shot('ig3-lead.png');
    // se registra quién autorizó
    await w.click('#ldCuentas'); await w.waitForSelector('.ld-cons');
    ok(/@thelivingprop/.test(await txt('.ld-cons')) && /3 conversaciones/.test(await txt('.ld-cons')), 'queda registrada la autorización: cuenta, quién, cuándo y cuántas');
    await w.click('#mCancel');
    // otra descarga más adelante: solo lo nuevo
    const zip2 = path.join(tmp, 'instagram-2.zip'); fs.writeFileSync(zip2, await zipIg([['c', '¿Podemos ir a verlo el sábado?']]));
    await w.setInputFiles('#ldFileIg', zip2); await w.waitForSelector('.ld-igimp');
    ok(/ya está en Leads: 1 nuevos/.test(await txt('.ld-igimp')) && /ya está en Leads: 0 nuevos/.test(await txt('.ld-igimp')), 'al volver a subir, reconoce lo que ya está');
    ok(!(await w.isChecked('[data-hilo="pedrosoto_222333444"]')), 'y no vuelve a marcar las que no traen nada nuevo');
    await w.check('#ldIgAut'); await w.uncheck('#ldIgIA'); await w.click('#mOk');
    await w.waitForSelector('.toast:has-text("1 actualizado")', { timeout: 10000 });
    ok((await w.$$('#ldItems .ld-it')).length === 3, 'no duplica leads');
    await w.click('#ldItems .ld-it:has-text("Camila Rojas")'); await w.waitForTimeout(500);
    ok(/el sábado/.test(await txt('#ldChB')) && (await w.$$('#ldChB .ld-m')).length === 6, 'agrega solo el mensaje nuevo');
    // arrastrar el .zip a Leads también lo reconoce como Instagram
    await w.evaluate((f) => window.Leads.dropFiles([f]), zip1); await w.waitForSelector('.ld-igimp');
    ok(true, 'arrastrar el .zip de Instagram abre la importación de Instagram'); await w.click('#mCancel');
    ok(!errs.length, 'sin errores en la pantalla ' + errs.join(' | '));
    console.log('\nOK instagram-e2e');
  } catch (e) { console.error(e.message); await shot('ig-error.png').catch(() => {}); process.exitCode = 1; }
  finally { await app.close(); }
})();
