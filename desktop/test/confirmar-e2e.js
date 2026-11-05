// 0.9.3 · Confirmar la visita por WhatsApp: mensaje listo (día, hora, dirección), editable, y queda registrado.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfcf-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfcf-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const txt = (s) => w.textContent(s).then((t) => (t || '').replace(/\s+/g, ' '));
  const shot = (n) => w.screenshot({ path: path.resolve(__dirname, n) });
  const abiertos = () => app.evaluate(() => global.__abiertos || []);
  try {
    await w.setViewportSize({ width: 1500, height: 960 });
    await w.waitForSelector('#view-agente .ag.ag-full', { timeout: 15000 });
    await w.evaluate(() => window.Inmo.importar()); await w.waitForSelector('text=Cartera actualizada', { timeout: 15000 }); await w.click('#mOk');
    await w.click('#nav [data-view="agente"]'); await w.waitForSelector('#view-agente .ag.ag-full'); await w.waitForTimeout(300);
    const ids = await w.evaluate(async () => { const d = (await window.pf.inmoListar()).data; const juan = d.personas.find((x) => /JUAN PEREZ/.test(x.nombre)); await window.pf.inmoPerGuardar({ ...juan, telefono: '9 8765 4321' });
      const otra = d.personas.find((x) => x.id !== juan.id); await window.pf.inmoPerGuardar({ ...otra, telefono: '' });
      return { p: d.propiedades.find((x) => x.codigo === 'CV-9002').id, c: juan.id, o: otra.id, on: otra.nombre }; });
    await w.evaluate((o) => window.pf.negGuardar({ tipo: 'arriendo', propId: o.p, clienteId: o.c }), ids);

    await w.fill('#agQ', 'CV-9002'); await w.press('#agQ', 'Enter'); await w.waitForSelector('.ga-est');
    await w.click('.ga-est [data-a="agendar"]'); await w.waitForSelector('.ga-agd [data-ok]:not(.hidden)');
    await w.fill('.ga-agd [data-f="fecha"]', '2026-10-22'); await w.fill('.ga-agd [data-f="hora"]', '11:00'); await w.click('.ga-agd [data-ok]');
    await w.waitForSelector('.ag-sig.sug2 button:has-text("Confirmar por WhatsApp a Juan")');
    ok(true, 'después de agendar la visita propone «Confirmar por WhatsApp a Juan»');
    await w.click('.ag-sig.sug2 button:has-text("Confirmar por WhatsApp")'); await w.waitForSelector('.ga-wa textarea');
    const t = await w.inputValue('.ga-wa textarea');
    ok(/^Hola Juan, te confirmo la visita a Departamento en Providencia \(código CV-9002\) el jueves 22 de octubre a las 11:00, en Avenida Demo 450/.test(t), `mensaje listo: «${t.slice(0, 120)}…»`);
    await w.fill('.ga-wa textarea', t + ' Lleva tu carnet.'); await shot('cf1-mensaje.png');
    await w.click('.ga-wa [data-ok]'); await w.waitForSelector('.ga.hecha:has-text("Confirmación por WhatsApp")');
    const u = (await abiertos()).find((x) => /wa\.me/.test(x)) || '';
    ok(/^https:\/\/wa\.me\/56987654321\?text=/.test(u) && /Lleva tu carnet/.test(decodeURIComponent(u)), 'abre WhatsApp al +56 9 8765 4321 con el mensaje (incluido lo que se editó)');
    const ev = (await w.evaluate(() => window.pf.agendaListar({}).then((r) => r.data))).find((e) => e.tipo === 'visita');
    ok(ev.confirmacion?.via === 'whatsapp', 'la visita queda marcada como confirmada');
    await w.waitForSelector('#agCanvas .lz-wa.ok'); ok(/Confirmación de la visita enviada por WhatsApp/.test(await txt('#agCanvas')), 'el lienzo la muestra confirmada y queda en el historial');

    // persona sin celular: se escribe ahí mismo y queda en su ficha
    const ev2 = await w.evaluate((o) => window.pf.assetEjecutar('asset_crear_evento', { tipo: 'visita', fecha: '2026-10-23', hora: '16:00', propiedad: o.p, personas: [o.o] }).then((r) => r.data.evento.id), ids);
    await w.evaluate((id) => window.Gestion.confirmar(id), ev2); await w.waitForSelector('.ga-wa [data-cel]');
    await w.click('.ga-wa:last-of-type [data-ok]').catch(() => {}); 
    await w.fill('.ga-wa [data-cel]', '+56 9 1212 3434'); await w.click('.ga-wa [data-gcel]'); await w.waitForFunction(() => !document.querySelector('.ga-wa [data-cel]'));
    const tel = await w.evaluate((id) => window.pf.inmoListar().then((r) => r.data.personas.find((x) => x.id === id).telefono), ids.o);
    ok(tel === '+56 9 1212 3434', 'si no tiene celular, se escribe ahí mismo y queda guardado en su ficha');
    await w.click('.ga-wa [data-ok]'); await w.waitForTimeout(400);
    ok((await abiertos()).some((x) => /wa\.me\/56912123434/.test(x)), 'y se abre WhatsApp a ese número');
    await shot('cf2-lienzo.png');

    // 0.10.3 · con el WhatsApp de wechatia conectado, la confirmación sale sola desde Asset
    await w.evaluate(() => window.pf.pvClaveWa({ token: 'pit-f0e1d2c3f0e1d2c3f0e1d2c3', locationId: 'PlPVNYvbNWr6nrRB9VHG' }));
    await app.evaluate(() => { global.__waMock = { convs: [], msgs: {}, enviados: [], contactos: [] }; });
    const ev3 = await w.evaluate((o) => window.pf.assetEjecutar('asset_crear_evento', { tipo: 'visita', fecha: '2026-10-24', hora: '10:00', propiedad: o.p, personas: [o.c] }).then((r) => r.data.evento.id), ids);
    const nAb = (await abiertos()).length;
    await w.evaluate((id) => window.Gestion.confirmar(id), ev3); await w.waitForSelector('.ga-wa [data-abrir]');
    ok(/Se envía desde el WhatsApp de tu cuenta de wechatia/.test(await txt('.ga-wa:last-child')) && /Enviar por WhatsApp/.test(await txt('.ga-wa [data-ok]')), 'con wechatia conectado, el botón es «Enviar por WhatsApp» (sin abrir WhatsApp Web)');
    await w.click('.ga-wa [data-ok]'); await w.waitForSelector('.ga.hecha:has-text("Confirmación enviada por WhatsApp")');
    const W = await app.evaluate(() => global.__waMock);
    ok(W.contactos[0]?.phone === '+56987654321' && W.enviados.at(-1)?.type === 'WhatsApp' && W.enviados.at(-1).contactId === W.contactos[0].id && /sábado 24 de octubre a las 10:00/.test(W.enviados.at(-1).message), 'crea el contacto en wechatia y envía la confirmación por la API de WhatsApp');
    ok((await abiertos()).length === nAb && /entregado · se creó su contacto en wechatia/.test(await txt('.ga.hecha:last-of-type, .ag-body')), 'no abre WhatsApp Web y avisa que fue entregado');
    const e3 = (await w.evaluate(() => window.pf.agendaListar({}).then((r) => r.data))).find((e) => e.id === ev3);
    ok(e3.confirmacion?.via === 'wechatia', 'la visita queda confirmada (enviada automáticamente)');
    // fuera de la ventana de 24 h, WhatsApp exige plantilla: se explica y se puede abrir en el WhatsApp propio
    await app.evaluate(() => { global.__waMock.fallar24h = true; });
    await w.evaluate((id) => window.Gestion.confirmar(id), ev3); await w.waitForSelector('.ga-wa:last-child [data-abrir]');
    await w.click('.ga-wa:last-child [data-ok]'); await w.waitForFunction(() => /24 horas/.test(document.querySelector('.ga-wa:last-child .ga-falta')?.textContent || ''));
    ok(/plantilla aprobada por Meta/.test(await txt('.ga-wa:last-child .ga-falta')), 'si WhatsApp no lo entrega (24 h sin respuesta del cliente), lo explica');
    await w.click('.ga-wa:last-child [data-abrir]'); await w.waitForSelector('.ga.hecha:has-text("se abrió WhatsApp")');
    ok((await abiertos()).length === nAb + 1, '«Abrir en mi WhatsApp» queda como respaldo');
    // la clave sin permiso de contactos: dice exactamente qué permiso agregar
    await app.evaluate(() => { Object.assign(global.__waMock, { fallar24h: false, sinPermisoContactos: true, contactos: [] }); });
    await w.evaluate((id) => window.Gestion.confirmar(id), ev3); await w.waitForSelector('.ga-wa:last-child [data-abrir]');
    await w.click('.ga-wa:last-child [data-ok]'); await w.waitForFunction(() => /Editar contactos/.test(document.querySelector('.ga-wa:last-child .ga-falta')?.textContent || ''));
    ok(true, 'si a la clave le falta el permiso de contactos, indica cuál agregar en wechatia'); await shot('cf3-auto.png');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK confirmar');
  } catch (er) { console.error(er.message); await shot('cf-error.png').catch(() => {}); process.exitCode = 1; } finally { await app.close(); }
})();
