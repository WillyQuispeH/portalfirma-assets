// 0.14 · Leads: importar un chat exportado de WhatsApp (.zip de iPhone con foto y audio, .txt de Android sin archivos),
// verlo como una ventana de WhatsApp, la búsqueda leída por IA, volver a importar (solo lo nuevo), estado, pasar a
// cliente, y el mismo chat enviado por WhatsApp al Agente (confirmación SÍ).
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const JSZip = require('jszip');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');
const IOS = `[16/10/26, 12:20:01] Matías Serrano: ‎Los mensajes y las llamadas están cifrados de extremo a extremo. Nadie fuera de este chat, ni siquiera WhatsApp, puede leerlos ni escucharlos.
[16/10/26, 12:20:01] Matías Serrano: Hola! vi el depto en Ñuñoa, sigue disponible?
[16/10/26, 12:21:30] Jerónimo Gómez: Hola Matías, sí. ¿Buscas arriendo?
[16/10/26, 12:22:10] Matías Serrano: Sí, busco arrendar un departamento de dos dormitorios y un baño en Ñuñoa o Providencia, hasta 650 lucas
idealmente con estacionamiento
[16/10/26, 12:23:00] Matías Serrano: ‎<adjunto: 00000005-AUDIO-2026-10-16-12-23-00.opus>
[16/10/26, 12:24:00] Jerónimo Gómez: ‎<adjunto: 00000006-PHOTO-2026-10-16-12-24-00.jpg>
[17/10/26, 9:05:00] Jerónimo Gómez: ¿Te parece ir a ver el depa el lunes a las 3? https://www.thelivingchile.cl/propiedad/123
[17/10/26, 9:06:12] Matías Serrano: Perfecto, mi correo es matias.serrano@gmail.com
`;
const AND = `16/10/26, 12:20 - Los mensajes y las llamadas están cifrados de extremo a extremo. Nadie fuera de este chat, ni siquiera WhatsApp, puede leerlos ni escucharlos. Toca para obtener más información.
16/10/26, 12:20 - +56 9 8765 4321: Hola, busco casa en venta en La Reina hasta 9000 UF
16/10/26, 12:21 p. m. - Fran Broker: Hola! te mando opciones
16/10/26, 12:22 p. m. - Fran Broker: <Multimedia omitido>
16/10/26, 12:30 p. m. - +56 9 8765 4321: Gracias, son 3 dormitorios mínimo
`;
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfld-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfld-db-')); const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pfld-f-'));
  const zipDe = async (txt) => { const z = new JSZip(); z.file('_chat.txt', txt); z.file('00000005-AUDIO-2026-10-16-12-23-00.opus', Buffer.alloc(3000, 7)); z.file('00000006-PHOTO-2026-10-16-12-24-00.jpg', PNG); return z.generateAsync({ type: 'nodebuffer' }); };
  const zip1 = path.join(tmp, 'Chat de WhatsApp - Matias Serrano.zip'); fs.writeFileSync(zip1, await zipDe(IOS));
  const zip2 = path.join(tmp, 'Chat de WhatsApp - Matias Serrano (1).zip'); fs.writeFileSync(zip2, await zipDe(IOS + '[18/10/26, 10:00:00] Matías Serrano: ¿Seguimos en pie para el lunes?\n'));
  const txtA = path.join(tmp, 'Chat de WhatsApp con +56 9 8765 4321.txt'); fs.writeFileSync(txtA, AND);
  const malo = path.join(tmp, 'notas.txt'); fs.writeFileSync(malo, 'Lista del super\nleche\npan');
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir, PF_MOCK_DICTADO: 'Ah, y tengo una mascota, un perro chico.' } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const txt = (s) => w.textContent(s).then((t) => (t || '').replace(/\s+/g, ' '));
  const shot = (n) => w.screenshot({ path: path.resolve(__dirname, n) });
  const val = (k) => w.inputValue(`#ldFicha [data-k="${k}"]`);
  let n = 0; const escribe = (body, att) => app.evaluate((_, a) => { const W = global.__waMock; W.msgs.c9.push({ id: 'in' + a.n, direction: 'inbound', body: a.body, attachments: a.att || [], dateAdded: new Date(Date.now() + a.n * 1000).toISOString() }); }, { body, att, n: ++n });
  const enviados = () => app.evaluate(() => (global.__waMock?.enviados || []).map((e) => e.contactId + '|' + e.message));
  const esperaEnvio = async (re, desde) => { for (let i = 0; i < 60; i++) { await w.evaluate(() => window.pf.waRevisar()); const e = (await enviados()).slice(desde); const m = e.find((x) => re.test(x)); if (m) return m; await w.waitForTimeout(500); } throw new Error('FALLÓ: no llegó por WhatsApp ' + re + ' · enviados: ' + (await enviados()).slice(desde).join(' || ')); };
  try {
    await w.setViewportSize({ width: 1500, height: 960 });
    await w.waitForSelector('#view-agente .ag.ag-full', { timeout: 15000 });
    // 1. pestaña Leads, vacía: explica cómo exportar
    await w.click('#nav [data-view="leads"]'); await w.waitForSelector('.ld-vacio');
    ok(/Exportar chat/.test(await txt('.ld-vacio')) && /iPhone/.test(await txt('.ld-vacio')), 'la pestaña Leads vacía explica cómo exportar un chat (iPhone y Android)');
    // 2. un archivo que no es un chat se rechaza
    await w.setInputFiles('#ldFile', malo); await w.waitForSelector('text=No se pudo importar');
    ok(/no parece un chat exportado/.test(await txt('#modalCard')), 'un .txt cualquiera se rechaza: no es un chat exportado'); await w.click('#mCancel');
    // 3. importar el .zip de iPhone
    await w.setInputFiles('#ldFile', zip1); await w.waitForSelector('.ld-imp');
    const m1 = await txt('.ld-imp');
    ok(/7 mensajes/.test(m1) && /1 foto, 1 audio/.test(m1) && /16\/10\/2026 al 17\/10\/2026/.test(m1), 'reconoce el chat: 7 mensajes del 16 al 17/10, 1 foto y 1 audio (sin el aviso de cifrado)');
    ok(await w.isChecked('input[name="ldCli"][value="Matías Serrano"]'), 'deduce el cliente por el nombre del archivo (Matías Serrano)');
    ok(await w.isChecked('#ldTx'), 'ofrece transcribir el audio');
    await shot('ld0-importar.png');
    await w.fill('#ldTel', '+56 9 1234 5678'); await w.click('#mOk');
    await w.waitForSelector('#ldChB .ld-m', { timeout: 15000 }); await w.waitForSelector('#ldFicha [data-k="b_operacion"]');
    ok(/Matías Serrano/.test(await txt('#ldItems')) && (await w.$$('#ldItems .ld-it')).length === 1, 'el lead aparece en la bandeja');
    const ch = await txt('#ldChB');
    ok(/Viernes 16 de octubre/.test(ch) && /Sábado 17 de octubre/.test(ch), 'la conversación se ve como WhatsApp, separada por días');
    ok((await w.$$('#ldChB .ld-m.in')).length === 4 && (await w.$$('#ldChB .ld-m.out')).length === 3, 'mensajes del cliente a la izquierda y del broker a la derecha');
    ok(/650 lucas idealmente con estacionamiento|650 lucas<br>idealmente/.test(await w.innerHTML('#ldChB')) || /650 lucas idealmente/.test(ch), 'un mensaje de varias líneas queda completo');
    const imgOk = await w.evaluate(() => new Promise((res) => { const im = document.querySelector('#ldChB img'); if (!im) return res(false); if (im.complete) return res(im.naturalWidth > 0); im.onload = () => res(im.naturalWidth > 0); im.onerror = () => res(false); im.loading = 'eager'; }));
    ok(imgOk, 'la foto del .zip se ve en la conversación');
    ok(await w.$('#ldChB audio') && /«Ah, y tengo una mascota, un perro chico\.»/.test(ch), 'el audio se puede escuchar y trae su transcripción');
    ok(/thelivingchile\.cl/.test(await txt('#ldChB a')), 'los links se pueden abrir');
    // 4. la ficha: lo que entendió la IA
    ok(await val('b_operacion') === 'arriendo' && await val('b_tipo') === 'departamento' && await val('b_dormitorios') === '2' && await val('b_banos') === '1', 'IA: arriendo de departamento 2D/1B');
    ok(await val('b_comunas') === 'Ñuñoa, Providencia' && await val('b_valor') === '650000' && await w.isChecked('#ldFicha [data-k="b_estacionamiento"]') && await w.isChecked('#ldFicha [data-k="b_mascotas"]'), 'IA: Ñuñoa o Providencia, hasta $650.000 (650 lucas), estacionamiento y mascota (del audio)');
    ok(await val('email') === 'matias.serrano@gmail.com' && await val('telefono') === '+56 9 1234 5678', 'toma el correo de la conversación y el teléfono que se indicó');
    ok(await val('estado') === 'visita' && /Confirmar la visita/.test(await val('pa_texto')), 'estado sugerido «Visita agendada» y la próxima acción');
    ok(/Busca arrendar/.test(await txt('#ldFicha .ld-res')), 'deja un resumen');
    await shot('ld1-conversacion.png');
    // 5. volver a importar el mismo chat: solo lo nuevo
    await w.setInputFiles('#ldFile', zip2); await w.waitForSelector('.ld-imp');
    ok(/se agregan solo los 1 mensajes nuevos/.test(await txt('.ld-imp')), 'al exportar de nuevo el mismo chat, avisa que agrega solo 1 mensaje nuevo');
    await w.click('#mOk'); await w.waitForFunction(() => /Seguimos en pie/.test(document.querySelector('#ldChB')?.textContent || ''), null, { timeout: 15000 });
    ok((await w.$$('#ldItems .ld-it')).length === 1 && (await w.$$('#ldChB .ld-m')).length === 8, 'no duplica: el mismo lead queda con 8 mensajes');
    // 6. Android, sin archivos, con el teléfono como nombre
    await w.setInputFiles('#ldFile', txtA); await w.waitForSelector('.ld-imp');
    ok(await w.isChecked('input[name="ldCli"][value="+56 9 8765 4321"]') && await w.inputValue('#ldTel') === '+56 9 8765 4321' && !(await w.$('#ldTx')), 'Android: el cliente es el número y queda como teléfono; sin archivos no hay audios que transcribir');
    ok(/Se exportó sin archivos/.test(await txt('.ld-imp')), 'avisa que se exportó sin archivos');
    await w.click('#mOk'); await w.waitForFunction(() => document.querySelectorAll('#ldItems .ld-it').length === 2, null, { timeout: 15000 });
    await w.waitForFunction(() => /no incluido/.test(document.querySelector('#ldChB')?.textContent || ''));
    ok(await val('b_operacion') === 'venta' && await val('b_tipo') === 'casa' && await val('b_moneda') === 'UF' && await val('b_valor') === '9000' && await val('b_dormitorios') === '3', 'IA: compra de casa en La Reina hasta UF 9.000, 3 dormitorios');
    // 7. estado y filtros
    await w.selectOption('#ldFicha [data-k="estado"]', 'perdido'); await w.waitForSelector('#ldFicha [data-k="motivo"]');
    await w.fill('#ldFicha [data-k="motivo"]', 'Compró con otra corredora'); await w.click('#ldGuardar'); await w.waitForTimeout(400);
    await w.click('#ldChips [data-f="abiertos"]'); await w.waitForTimeout(300);
    ok((await w.$$('#ldItems .ld-it')).length === 1, 'un lead perdido sale de «Abiertos»');
    await w.click('#ldChips [data-f="perdido"]'); await w.waitForTimeout(300);
    ok((await w.$$('#ldItems .ld-it')).length === 1 && /Perdido/.test(await txt('#ldItems')), 'y aparece en «Perdidos»');
    await w.fill('#ldQ', 'reina'); await w.click('#ldChips [data-f="todos"]'); await w.waitForTimeout(500);
    ok((await w.$$('#ldItems .ld-it')).length === 1, 'el buscador encuentra por comuna (La Reina)');
    await w.fill('#ldQ', ''); await w.waitForTimeout(400);
    // 8. pasar a cliente
    await w.click(`#ldItems .ld-it:has-text("Matías")`); await w.waitForSelector('#ldPersona');
    const per = (await w.evaluate(() => window.pf.inmoListar().then((r) => r.data))).personas.find((p) => p.nombre === 'Matías Serrano');
    ok(per && per.roles.includes('interesado') && per.email === 'matias.serrano@gmail.com' && !per.rut, '0.16.23 · el lead ya queda en Personas (interesado, con su correo) aunque no tenga RUT');
    // 9. por WhatsApp: el broker le manda el chat exportado al Agente
    await app.evaluate(() => { global.__waMock = { convs: [{ id: 'c9', contactId: 'k9', phone: '+56987276858', fullName: 'Fran' }], msgs: { c9: [] }, enviados: [] }; });
    await w.click('#nav [data-view="agente"]'); await w.waitForSelector('#agWa'); await w.click('#agWa'); await w.waitForSelector('#waKey');
    await w.fill('#waKey', 'pit-f0e1d2c3f0e1d2c3f0e1d2c3'); await w.fill('#waLoc', 'PlPVNYvbNWr6nrRB9VHG'); await w.click('#waKeyOk'); await w.waitForSelector('#waVin:not([disabled])');
    await w.click('#waVin'); await w.waitForSelector('.wa-cod b'); const cod = (await txt('.wa-cod b')).trim();
    await escribe(cod); await esperaEnvio(/^k9\|Listo, este celular quedó conectado/, 0); await w.click('#mCancel');
    await app.evaluate((_, t) => { global.__waChat = { bytes: t, nombre: 'Chat de WhatsApp con Carla Ruiz.txt' }; }, AND.replace(/\+56 9 8765 4321/g, 'Carla Ruiz').replace(/Fran Broker/g, 'Fran'));
    let e0 = (await enviados()).length; await escribe('', ['mock:chat-carla.txt']);
    const r1 = await esperaEnvio(/^k9\|\*Fernanda\* · Leads\n\*Chat de WhatsApp con Carla Ruiz\*/, e0);
    ok(/4 mensajes/.test(r1) && /No trae su número/.test(r1) && /Responde \*SÍ\*/.test(r1), 'por WhatsApp: reconoce el chat exportado, pide el número que falta y confirmar con SÍ');
    e0 = (await enviados()).length; await escribe('+56 9 5555 1234'); await esperaEnvio(/^k9\|\*Fernanda\* · Leads\nAnoté su teléfono/, e0);
    e0 = (await enviados()).length; await escribe('sí'); const r2 = await esperaEnvio(/^k9\|\*Fernanda\* · Leads\nListo: \*Carla Ruiz\* quedó en tus Leads/, e0);
    ok(/Busca: compra · casa/.test(r2), 'al responder SÍ queda en Leads y le cuenta al broker qué busca la clienta');
    // URL sin extensión (como la que entrega wechatia): igual lo reconoce por el contenido
    await app.evaluate((_, t) => { global.__waChat = { bytes: t, nombre: 'documento' }; }, AND.replace(/\+56 9 8765 4321/g, 'Pedro Soto').replace(/Fran Broker/g, 'Fran'));
    await app.evaluate(() => { const real = global.fetch; global.__fetchReal ||= real; global.fetch = async (u, ...r) => (String(u).includes('files.wechatia.test') ? { ok: true, headers: { get: (h) => (/disposition/i.test(h) ? 'attachment; filename="Chat de WhatsApp con Pedro Soto.txt"' : 'text/plain') }, arrayBuffer: async () => Buffer.from(global.__waChat.bytes) } : real(u, ...r)); });
    e0 = (await enviados()).length; await escribe('', ['https://files.wechatia.test/m/abc123']);
    const r3 = await esperaEnvio(/^k9\|\*Fernanda\* · Leads\n\*Chat de WhatsApp con Pedro Soto\*/, e0); ok(/Responde \*SÍ\*/.test(r3), 'un adjunto con URL sin extensión se reconoce por su contenido (nombre del archivo desde la descarga)');
    e0 = (await enviados()).length; await escribe('no'); await esperaEnvio(/^k9\|\*Fernanda\* · Leads\nOk, no lo registré/, e0);
    e0 = (await enviados()).length; await escribe('Chat de WhatsApp con Pedro Soto.zip'); await esperaEnvio(/^k9\|\*Fernanda\* · Leads\nMe llegó solo el nombre del archivo/, e0);
    ok(true, 'si llega solo el nombre del archivo (sin el archivo), explica cómo enviarlo');
    await w.click('#nav [data-view="leads"]'); await w.waitForFunction(() => /Carla Ruiz/.test(document.querySelector('#ldItems')?.textContent || ''), null, { timeout: 8000 });
    await w.click('#ldItems .ld-it:has-text("Carla")'); await w.waitForTimeout(500);
    ok(await val('telefono') === '+56 9 5555 1234' && /Chat exportado/.test(await txt('.ld-ch-h')), 'en Asset: Carla con su teléfono, como chat exportado');
    await shot('ld2-bandeja.png');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK leads');
  } catch (er) { console.error(er.message); await shot('ld-error.png').catch(() => {}); process.exitCode = 1; } finally { await app.close(); }
})();
