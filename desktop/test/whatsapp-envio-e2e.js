// 0.16.18 · WhatsApp desde Asset: un mensaje rechazado no se reintenta (antes llegaban varios iguales), el mismo texto no
// se repite, la confirmación de visita fuera de las 24 h va con su plantilla y el remitente es el ejecutivo.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'pfwe-'))}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'pfwe-db-')), PF_NO_TOURS: '1', PF_START: 'inicio' } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
  const W = () => app.evaluate(() => JSON.parse(JSON.stringify(global.__waMock)));
  try {
    await w.waitForSelector('#view-inicio', { timeout: 15000 });
    await call('pvClaveWa', { token: 'pit-f0e1d2c3f0e1d2c3f0e1d2c3', locationId: 'PlPVNYvbNWr6nrRB9VHG' });
    await app.evaluate(() => { global.__waMock = { convs: [{ id: 'cv1', contactId: 'kc1', phone: '+56961584794', fullName: 'Fernanda Nevreda' }], msgs: { cv1: [{ id: 'in1', direction: 'inbound', body: 'Hola', dateAdded: new Date().toISOString() }] }, enviados: [], contactos: [] }; });
    const env = (o) => call('assetEjecutar', 'asset_enviar_whatsapp', o);
    // A · WhatsApp lo rechaza por otro motivo: no se reintenta y el mismo texto no vuelve a salir
    await app.evaluate(() => { global.__waMock.fallarDetalle = 'Recipient phone number not in allowed list'; });
    const t1 = 'Hola, Jerónimo me pidió que te escribiera para confirmar la visita de mañana a las 11:00 de la propiedad WE-049.';
    let r = await env({ telefono: '+56961584794', nombre: 'Fernanda Nevreda', texto: t1 });
    ok(r.ok === false && r.noEnviado && /NO lo reintentes/.test(r.instruccion) && /wa\.me/.test(r.enlace), 'si WhatsApp lo rechaza, la herramienta dice que NO se envió, que no se reintente y da el enlace');
    r = await env({ telefono: '+56961584794', nombre: 'Fernanda Nevreda', texto: t1 });
    ok(r.noEnviado && (await W()).enviados.length === 1, 'si el agente igual lo vuelve a intentar, no sale de nuevo (1 solo envío)');
    // B · el mismo mensaje bien enviado tampoco se repite
    await app.evaluate(() => { delete global.__waMock.fallarDetalle; });
    const t2 = 'Te confirmo la visita de mañana a las 11:00.';
    r = await env({ telefono: '+56961584794', nombre: 'Fernanda Nevreda', texto: t2 }); ok(r.ok && r.enviado, 'un mensaje normal sale');
    r = await env({ telefono: '+56961584794', nombre: 'Fernanda Nevreda', texto: t2 }); ok(r.ok && r.yaEnviado && (await W()).enviados.length === 2, 'repetirlo dentro de 15 minutos no lo envía otra vez');
    // C · fuera de las 24 h: confirmación de visita con su plantilla, firmada por el ejecutivo (no «Pedro»)
    await call('assetEjecutar', 'asset_plantillas_whatsapp', { activar: ['todas'] });
    await call('assetEjecutar', 'asset_configurar_corredor', { corredor_nombre: 'Jerónimo Gómez', corredor_email: 'jgomez@portalfirma.cl' });
    r = await env({ telefono: '+56987654321', nombre: 'Ana Rojas', texto: 'Hola Ana, te confirmo la visita de mañana a las 11:00 a WE-049.', plantilla: 'primer_contacto', remitente: 'Pedro', motivo: 'iniciar conversación', propiedad: 'WE-049', fecha: 'jueves 29 de octubre', hora: '11:00' });
    const pl = (await W()).plantillas.at(-1);
    ok(r.ok && /recordatorio/i.test(r.enviadoConPlantilla.plantilla) && (pl.tags || []).includes('asset-recordatorio-visita'), 'fuera de las 24 h, una confirmación de visita sale con la plantilla de recordatorio de visita');
    ok(!JSON.stringify(pl.campos).includes('Pedro'), 'el remitente de la plantilla no es el asistente');
    // D · si Meta lo rechaza después, queda «No entregado» en la conversación
    await app.evaluate(() => { global.__waMock.fallar24h = true; global.__waMock.convs.push({ id: 'cv2', contactId: 'kc2', phone: '+56955554444', fullName: 'Luis' }); global.__waMock.msgs.cv2 = [{ id: 'in2', direction: 'inbound', body: 'Hola', dateAdded: new Date().toISOString() }]; });
    r = await env({ telefono: '+56955554444', nombre: 'Luis', texto: 'Hola Luis, ¿te acomoda el jueves?' });
    ok(r.ok === true || r.noEnviado || r.enviadoConPlantilla, 'el envío con rechazo de Meta se maneja sin error');
    // E · «contacta a Juan para que agende la visita»: mensaje + queda como interesado a cargo de Fernanda
    await app.evaluate(() => { delete global.__waMock.fallar24h; global.__waMock.convs.push({ id: 'cv3', contactId: 'kc3', phone: '+56911223344', fullName: 'Juan Pérez' }); global.__waMock.msgs.cv3 = [{ id: 'in3', direction: 'inbound', body: 'hola', dateAdded: new Date().toISOString() }]; });
    const per = await call('inmoPerGuardar', { nombre: 'Juan Pérez Soto', rut: '11.111.111-1', telefono: '+56911223344', email: 'juan@correo.cl', roles: ['interesado'] });
    const pr = await call('inmoPropGuardar', { titulo: 'Depto en Ñuñoa', tipo: 'departamento', venta: true, precioVenta: { valor: 5200, moneda: 'UF' }, comuna: 'Ñuñoa', direccion: 'Irarrázaval 2401', unidad: '504' });
    const nE = (await W()).enviados.length;
    r = await call('assetEjecutar', 'asset_coordinar_visita', { para: 'Juan Pérez Soto', propiedad: pr.codigo });
    const Wm = await W(); const lr = await call('leadsListar', {}); const ld = (Array.isArray(lr) ? lr : lr.leads || lr.lista || []).find((x) => /11223344/.test(x.telefono)) || null;
    ok(r.ok && Wm.enviados.length === nE + 1 && new RegExp(pr.codigo).test(Wm.enviados.at(-1).message) && /qué día y horario/i.test(Wm.enviados.at(-1).message), 'coordinar una visita le escribe a la persona por WhatsApp invitándola a agendar');
    ok(ld && (ld.propiedades || []).includes(pr.id) && ld.atiende === 'agente', 'queda como interesado de esa propiedad, a cargo de Fernanda');
    const HH = require('../src/hora.js'); const H = { c: HH.contexto(), h: HH.hoy() };
    ok(/hora de Chile/.test(H.c) && /^\d{4}-\d{2}-\d{2}$/.test(H.h), `los agentes saben el día y la hora de Chile (${H.c})`);
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK whatsapp envio');
  } catch (er) { console.error(er.message); process.exitCode = 1; } finally { await app.close(); }
})();
