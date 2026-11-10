// 0.13 · Agente por WhatsApp: vincular el celular con un código, órdenes por texto y nota de voz, confirmación SÍ/NO,
// propiedad dictada que se guarda con «CREAR», y los mensajes de otros números no se tocan. Todo queda en la app.
// 0.16 · el equipo: cada personaje (Pedro, Juanita, Diego, Fernanda) se activa con su nombre y conserva su conversación.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfwa-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfwa-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const txt = (s) => w.textContent(s).then((t) => (t || '').replace(/\s+/g, ' '));
  const shot = (n) => w.screenshot({ path: path.resolve(__dirname, n) });
  let n = 0; const escribe = (body, att, conv = 'c9') => app.evaluate((_, a) => { const W = global.__waMock; (W.msgs[a.conv] ||= []).push({ id: 'in' + a.n, direction: 'inbound', body: a.body, attachments: a.att || [], dateAdded: new Date(Date.now() + a.n * 1000).toISOString() }); }, { body, att, n: ++n, conv });
  const enviados = () => app.evaluate(() => (global.__waMock?.enviados || []).map((e) => e.contactId + '|' + e.message));
  const esperaEnvio = async (re, desde) => { for (let i = 0; i < 60; i++) { await w.evaluate(() => window.pf.waRevisar()); const e = (await enviados()).slice(desde); const m = e.find((x) => re.test(x)); if (m) return m; await w.waitForTimeout(500); } throw new Error('FALLÓ: no llegó por WhatsApp ' + re + ' · enviados: ' + (await enviados()).slice(desde).join(' || ')); };
  try {
    await w.setViewportSize({ width: 1500, height: 960 });
    await w.waitForSelector('#view-agente .ag.ag-full', { timeout: 15000 });
    ok(!(await w.$('#nav [data-view="postventa"]')), 'la pestaña Postventa queda en pausa (oculta)');
    await w.evaluate(() => window.Inmo.importar()); await w.waitForSelector('text=Cartera actualizada', { timeout: 15000 }); await w.click('#mOk');
    await app.evaluate(() => { global.__waMock = { convs: [{ id: 'c9', contactId: 'k9', phone: '+56987276858', fullName: 'Jerónimo' }, { id: 'c2', contactId: 'k2', phone: '+56977770000', fullName: 'Cliente' }], msgs: { c9: [], c2: [] }, enviados: [], contactos: [] }; });
    // 1. pantalla: conectar el WhatsApp de la empresa y vincular el celular con un código
    await w.click('#nav [data-view="agente"]'); await w.waitForSelector('#agWa'); await w.click('#agWa'); await w.waitForSelector('#waKey');
    await w.fill('#waKey', 'pit-f0e1d2c3f0e1d2c3f0e1d2c3'); await w.fill('#waLoc', 'PlPVNYvbNWr6nrRB9VHG'); await w.click('#waKeyOk'); await w.waitForSelector('#waVin:not([disabled])');
    ok(true, 'paso 1: conecta el WhatsApp de la empresa (wechatia)');
    await w.click('#waVin'); await w.waitForSelector('.wa-cod b'); const cod = (await txt('.wa-cod b')).trim();
    ok(/^ASSET \d{4}$/.test(cod) && /\+56 9 4497 5958/.test(await txt('#waAg')), `paso 2: muestra el código «${cod}» para enviarlo al número de la empresa`);
    await shot('wa1-codigo.png');
    await escribe('Hola, mi código es ' + cod.toLowerCase());
    const bienv = await esperaEnvio(/^k9\|Listo, este celular quedó conectado/, 0);
    ok(/\*Pedro\* · Captación[\s\S]*\*Juanita\* · Documentos[\s\S]*\*Diego\* · Seguimiento[\s\S]*\*Fernanda\* · Leads/.test(bienv), 'al recibir el código, vincula el celular y le presenta al equipo (Pedro, Juanita, Diego, Fernanda)');
    await w.waitForSelector('#waAct:checked', { timeout: 8000 }); ok(/\+56 9 8727 6858/.test(await txt('#waAg')), 'queda vinculado y activo en este computador');
    await shot('wa2-vinculado.png'); await w.click('#mCancel');
    // 2. un mensaje de otro número (un cliente) no se toca
    let e0 = (await enviados()).length; await escribe('Hola, quiero arrendar', null, 'c2');
    // 3. órdenes por texto
    await escribe('Agenda una visita mañana a las 11:00 en CV-9002 con Juan Pérez');
    await esperaEnvio(/^k9\|\*Diego\* · Seguimiento\n[\s\S]*(visita|Agend)/i, e0); ok(true, 'sin nombrar a nadie, el tema (agendar una visita) lo toma Diego, y su respuesta va firmada');
    const ev = (await w.evaluate(() => window.pf.agendaListar({}).then((r) => r.data))).find((x) => x.tipo === 'visita');
    ok(ev && ev.hora === '11:00', 'por WhatsApp agenda la visita en la agenda de la app');
    ok(!(await enviados()).some((x) => x.startsWith('k2|')), 'el mensaje del cliente (otro número) no recibe respuesta del Agente');
    // 4. lo que cobra se confirma con SÍ
    e0 = (await enviados()).length; await escribe('Juanita, hazme la orden de visita para Rosa Paz Mella mañana');
    await esperaEnvio(/^k9\|\*Juanita\* · Documentos\n\*Generar la orden de visita[\s\S]*Responde \*SÍ\* para confirmar/, e0); ok(true, '«Juanita, …» la activa con el pedido; la orden de visita (cobra) pide confirmar con SÍ o NO');
    e0 = (await enviados()).length; await escribe('sí');
    await esperaEnvio(/^k9\|[\s\S]*(operaci[oó]n|orden)/i, e0);
    const p2 = (await w.evaluate(() => window.pf.inmoListar().then((r) => r.data))).propiedades.find((x) => x.codigo === 'CV-9002');
    ok((p2.firmas || []).some((f) => f.plantilla === 'Orden de visita' && f.operacion), 'al responder SÍ, genera la orden y queda en la ficha de la propiedad');
    // 5. «Pedro» lo activa; nota de voz: dictar una propiedad → resumen → (cambiar de personaje y volver) → CREAR
    e0 = (await enviados()).length; await escribe('Pedro'); await esperaEnvio(/^k9\|\*Pedro\* · Captación\nHola, soy \*Pedro\*/, e0); ok(true, 'escribir «Pedro» activa a Pedro, que se presenta');
    e0 = (await enviados()).length; await escribe('', ['mock://nota-de-voz.ogg']);
    const res = await esperaEnvio(/^k9\|\*Pedro\* · Captación\n\*Departamento[\s\S]*Responde \*CREAR\*/, e0);
    ok((await enviados()).slice(e0).some((x) => /^k9\|🎙️ Entendí: «Estoy captando un departamento/.test(x)), 'antes de responder, dice qué entendió del audio (🎙️ Entendí: «…»)');
    ok(/Avenida del Tranque 1234/.test(res) && /3D · 2B/.test(res) && /Arriendo \$850\.000/.test(res), 'la nota de voz se transcribe y el agente devuelve el resumen de la propiedad dictada');
    e0 = (await enviados()).length; await escribe('Juanita'); const vuelta = await esperaEnvio(/^k9\|\*Juanita\* · Documentos/, e0);
    ok(/Sigo con lo que est/.test(vuelta), 'al volver a Juanita, retoma su conversación (no se mezcla con la de Pedro)');
    e0 = (await enviados()).length; await escribe('menu'); const men = await esperaEnvio(/^k9\|¿Con quién necesitas hablar\?/, e0); ok(/Fernanda/.test(men), '«menú» muestra al equipo');
    e0 = (await enviados()).length; await escribe('Pedro'); const ret = await esperaEnvio(/^k9\|\*Pedro\* · Captación/, e0);
    ok(/pendiente la propiedad que me dictaste[\s\S]*CREAR/.test(ret), 'al volver a Pedro, sigue pendiente la propiedad dictada: no se pierde el flujo');
    e0 = (await enviados()).length; await escribe('son tres baños'); await esperaEnvio(/^k9\|[\s\S]*3D · 3B/, e0); ok(true, 'una corrección por WhatsApp actualiza el resumen');
    e0 = (await enviados()).length; await escribe('crear'); const cr = await esperaEnvio(/^k9\|\*Pedro\* · Captación\nListo: \*PF-\d+\*/, e0);
    const nueva = (await w.evaluate(() => window.pf.inmoListar().then((r) => r.data))).propiedades.find((x) => /Tranque/.test(x.direccion || ''));
    ok(nueva && nueva.banos === 3 && nueva.precioArriendo.valor === 850000, `con «CREAR» queda en la cartera (${cr.split('\n')[1].slice(0, 40)}…)`);
    // 0.16.1 · WhatsApp a un cliente: lo hace quien esté activo (no deriva a otro), con confirmación, ahora o programado
    e0 = (await enviados()).length; await escribe('Pedro, envíale un whatsapp a Juan para recordarle la visita');
    const cw = await esperaEnvio(/^k9\|\*Pedro\* · Captación\n\*Enviar un WhatsApp a Juan/, e0); ok(/Mensaje: Hola, te recuerdo la visita/.test(cw) && !/escríbele/i.test(cw), 'pedirle a Pedro un WhatsApp a un cliente: lo prepara él mismo (no deriva) y pide confirmar');
    e0 = (await enviados()).length; await escribe('sí'); const nv = await esperaEnvio(/^k9\|[\s\S]*No se envió/, e0);
    ok(/24 horas/.test(nv) && /wa\.me\/56961584794\?text=/.test(nv) && !(await enviados()).some((x) => /te recuerdo la visita/.test(x) && !x.startsWith('k9|')), 'si esa persona no escribió en 24 h, NO dice «enviado»: avisa y deja el enlace para mandarlo desde tu WhatsApp');
    // 0.16.5 · con las plantillas activas, fuera de las 24 h sale la plantilla (campos + etiqueta en wechatia)
    e0 = (await enviados()).length; await escribe('Diego, ya se aprobaron las plantillas, actívalas'); const act = await esperaEnvio(/^k9\|\*Diego\* · Seguimiento\n[\s\S]*Plantillas activas/, e0);
    ok(/asset_recordatorio_visita/.test(act), '«ya se aprobaron las plantillas» las activa en Asset');
    e0 = (await enviados()).length; await escribe('Diego, envíale un whatsapp a Juan para recordarle la visita'); await esperaEnvio(/^k9\|[\s\S]*Enviar un WhatsApp a Juan/, e0);
    e0 = (await enviados()).length; await escribe('sí'); await esperaEnvio(/^k9\|[\s\S]*le envié la plantilla asset_recordatorio_visita a Juan/, e0);
    const pl = await app.evaluate(() => global.__waMock.plantillas.slice(-1)[0]);
    ok(pl && pl.tags?.[0] === 'asset-recordatorio-visita' && pl.campos.some((c) => c.id === 'cf_propiedad' && /Zenteno/.test(c.field_value)) && pl.campos.some((c) => c.id === 'cf_hora'), 'fuera de las 24 h, con la plantilla activa: llena los campos del contacto y pone la etiqueta para que wechatia la envíe');
    await app.evaluate(() => { global.__waMock.plantillas = []; }); await w.evaluate(() => 0);
    e0 = (await enviados()).length; await escribe('envíale un whatsapp al cliente para recordarle la visita'); await esperaEnvio(/^k9\|[\s\S]*Enviar un WhatsApp a Cliente/, e0);
    e0 = (await enviados()).length; await escribe('sí'); await esperaEnvio(/^k9\|[\s\S]*le envié el WhatsApp a Cliente/, e0);
    ok((await enviados()).some((x) => x.startsWith('k2|') && /te recuerdo la visita/.test(x)), 'a un cliente que escribió hace poco, el WhatsApp sí le llega desde el número de la empresa');
    e0 = (await enviados()).length; await escribe('recuérdale mañana a las 9 a Juan la visita'); await esperaEnvio(/^k9\|[\s\S]*Programar un WhatsApp para Juan/, e0);
    e0 = (await enviados()).length; await escribe('si'); await esperaEnvio(/^k9\|[\s\S]*le llegará a Juan el \d{4}-\d{2}-\d{2} 09:00/, e0);
    ok(true, 'un recordatorio queda programado para mañana a las 09:00 (sale solo a esa hora)');
    // 0.16.3 · cada uno toma lo suyo sin nombrarlo: la orden de visita la toma Juanita, con el contexto de lo conversado
    e0 = (await enviados()).length; await escribe('necesito una orden de visita para Rosa Paz Mella mañana');
    await esperaEnvio(/^k9\|\*Juanita\* · Documentos\n\*Generar la orden de visita/, e0); ok(true, '«necesito una orden de visita» lo toma Juanita automáticamente (sin escribir su nombre)');
    e0 = (await enviados()).length; await escribe('no'); await esperaEnvio(/^k9\|\*Juanita\* · Documentos\nCancelado/, e0); ok(true, 'un «no» corto sigue con Juanita (no cambia de personaje)');
    // 6. todo queda en la conversación «WhatsApp» del Agente
    await w.waitForSelector('#agConvs .ag-ci[data-c="whatsapp"]'); await w.click('#agConvs .ag-ci[data-c="whatsapp"] [data-abrir]');
    await w.waitForFunction(() => /Agenda una visita mañana/.test(document.querySelector('#agBody, .ag-body')?.textContent || '') && /\(audio\) Estoy captando/.test(document.querySelector('#agBody, .ag-body')?.textContent || ''), null, { timeout: 8000 });
    ok(true, 'la conversación «WhatsApp» del Agente muestra todo lo hablado desde el celular (también los audios transcritos)');
    await shot('wa3-conversacion.png');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK whatsapp agente');
  } catch (er) { console.error(er.message); await shot('wa-error.png').catch(() => {}); process.exitCode = 1; } finally { await app.close(); }
})();
