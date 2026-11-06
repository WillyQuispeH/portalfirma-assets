// 0.16.8 · Atención de clientes por WhatsApp: una persona del CRM escribe al número de la empresa y Diego (asistente del
// corredor) le responde con los datos de SU propiedad; para agendar solo toma el recado y se lo pasa al corredor.
// Con la atención apagada, nadie le responde. Si el corredor escribe a mano, Diego se calla.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfcw-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfcw-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  let n = 0; const escribe = (body, conv = 'c9', extra = {}) => app.evaluate((_, a) => { const W = global.__waMock; (W.msgs[a.conv] ||= []).push({ id: 'in' + a.n, direction: a.extra.direction || 'inbound', body: a.body, attachments: [], dateAdded: new Date(Date.now() + a.n * 1000).toISOString(), ...a.extra }); const c = W.convs.find((x) => x.id === a.conv); if (c) c.marca = a.n; }, { body, n: ++n, conv, extra });
  const enviados = () => app.evaluate(() => (global.__waMock?.enviados || []).map((e) => e.contactId + '|' + e.message));
  const espera = async (re, desde, veces = 40) => { for (let i = 0; i < veces; i++) { await w.evaluate(() => window.pf.waRevisar()); const m = (await enviados()).slice(desde).find((x) => re.test(x)); if (m) return m; await w.waitForTimeout(400); } return null; };
  try {
    await w.waitForSelector('#view-agente .ag.ag-full', { timeout: 15000 });
    // un cliente del CRM con su propiedad
    const per = await w.evaluate(() => window.pf.inmoPerGuardar({ nombre: 'Carla Ruiz Soto', rut: '12.345.678-5', telefono: '+56 9 5555 1234', email: 'carla@ejemplo.cl', roles: ['interesado'] }).then((r) => r.data || r));
    const prop = await w.evaluate(() => window.pf.inmoPropGuardar({ titulo: 'Depto 2D 2B Ñuñoa', tipo: 'departamento', direccion: 'Irarrázaval 2450', unidad: '804', comuna: 'Ñuñoa', arriendo: true, precioArriendo: { valor: 650000, moneda: 'CLP' }, gastosComunes: 95000, dormitorios: 2, banos: 2, notasInternas: 'el dueño acepta 600 mil' }).then((r) => r.data || r));
    await w.evaluate((a) => window.pf.inmoVincular(a.p, a.c, 'interesado'), { p: prop.id, c: per.id });
    await app.evaluate(() => { global.__waMock = { convs: [{ id: 'c9', contactId: 'k9', phone: '+56987276858', fullName: 'Jerónimo' }, { id: 'c5', contactId: 'k5', phone: '+56955551234', fullName: 'Carla' }, { id: 'c6', contactId: 'k6', phone: '+56911112222', fullName: 'Desconocido' }, { id: 'c7', contactId: 'k7', phone: '+56987654321', fullName: 'Lead' }, { id: 'c8', contactId: 'k8', phone: '+56961584794', fullName: 'Juan' }], msgs: { c9: [], c5: [], c6: [], c7: [], c8: [] }, enviados: [], contactos: [] }; });
    // vincular el celular del corredor
    await w.click('#nav [data-view="agente"]'); await w.waitForSelector('#agWa'); await w.click('#agWa'); await w.waitForSelector('#waKey');
    await w.fill('#waKey', 'pit-f0e1d2c3f0e1d2c3f0e1d2c3'); await w.fill('#waLoc', 'PlPVNYvbNWr6nrRB9VHG'); await w.click('#waKeyOk'); await w.waitForSelector('#waVin:not([disabled])');
    await w.click('#waVin'); await w.waitForSelector('.wa-cod b'); const cod = (await w.textContent('.wa-cod b')).trim();
    await escribe(cod); ok(await espera(/^k9\|Listo, este celular quedó conectado/, 0), 'celular del corredor vinculado');
    // 0.16.10 · Fernanda le escribe a alguien que no está en Asset: queda como lead y, cuando responde, ella lo atiende
    // (aunque la atención de clientes esté apagada), le ofrece horarios y le agenda la visita
    let e0 = (await enviados()).length; await escribe('ya se aprobaron las plantillas, actívalas'); await espera(/^k9\|[\s\S]*Plantillas activas/, e0);
    e0 = (await enviados()).length; await escribe('Fernanda, envíale un whatsapp a Juan para recordarle la visita'); ok(await espera(/^k9\|[\s\S]*Enviar un WhatsApp a Juan/, e0), 'Fernanda prepara el WhatsApp a un contacto nuevo');
    e0 = (await enviados()).length; await escribe('sí'); await espera(/^k9\|[\s\S]*le envié la plantilla/, e0);
    const lj = (await w.evaluate(() => window.pf.leadsListar({}).then((r) => r.data || r))).leads.find((x) => /6158 ?4794/.test(x.telefono));
    ok(lj && lj.atiende === 'agente', 'el contacto al que le escribió Fernanda queda como lead (a cargo de Fernanda)');
    e0 = (await enviados()).length; await escribe('Hola, quiero agendar una visita', 'c8');
    const h1 = await espera(/^k8\|/, e0); ok(h1 && /a las \d{2}:00/.test(h1), `cuando el lead responde, Fernanda sigue la conversación y le ofrece horarios: «${(h1 || '').slice(3, 80)}…»`);
    const fv = (() => { const d = new Date(Date.now() + 2 * 864e5); if (d.getDay() === 0) d.setDate(d.getDate() + 1); const z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; })();
    e0 = (await enviados()).length; await escribe(`Me sirve el ${fv} a las 11:00 en ${prop.codigo}`, 'c8');
    const h2 = await espera(/^k8\|/, e0); ok(h2 && /quedó tu visita/.test(h2) && /RUT/.test(h2), 'Fernanda agenda la visita, la confirma y le pide RUT y correo para la orden de visita');
    const vis = await w.evaluate((f) => window.pf.agendaListar({ desde: f, hasta: f }).then((r) => r.data || r), fv);
    ok((vis || []).some((e) => e.tipo === 'visita' && e.hora === '11:00' && e.prop?.codigo === prop.codigo), 'la visita queda en la agenda del corredor, en la propiedad elegida');
    ok(await espera(/^k9\|\*Sofía\* · Atención de leads\n📅 \*Visita agendada por Sofía\*/, e0), 'al corredor le llega el aviso de la visita agendada');
    e0 = (await enviados()).length; await escribe('Mi rut es 12.345.678-5 y mi correo juan@ejemplo.cl', 'c8'); await espera(/^k8\|/, e0);
    const lj2 = await w.evaluate((id) => window.pf.leadsObtener(id).then((r) => r.data || r), lj.id);
    ok(lj2.rut && /juan@ejemplo\.cl/.test(lj2.email) && lj2.estado === 'visita' && lj2.mensajesLista.filter((m) => m.de === 'agente').length >= 3, 'el lead guarda RUT, correo, queda en estado «visita» y toda la conversación está en Leads');
    // 0.16.12 · lo que Asset le manda al lead por encargo del corredor NO es «un mensaje a mano»: Fernanda sigue respondiendo sola
    e0 = (await enviados()).length; await escribe('Fernanda, envíale un whatsapp a Juan para recordarle la visita'); await espera(/^k9\|[\s\S]*Enviar un WhatsApp a Juan/, e0);
    e0 = (await enviados()).length; await escribe('sí'); ok(await espera(/^k8\|Hola, te recuerdo la visita/, e0), 'el corredor le pide a Fernanda un WhatsApp para el lead y sale');
    e0 = (await enviados()).length; await escribe('Gracias, quiero agendar otra visita', 'c8');
    ok(await espera(/^k8\|Tengo el/, e0), 'después de eso, cuando el lead responde, Fernanda le sigue contestando sola (no se pausa)');
    // 0.16.20 · viene encendida por defecto; el corredor la puede apagar
    await w.evaluate(() => window.pf.assetEjecutar('asset_atencion_clientes', { activar: false }));
    // apagada: Carla escribe y nadie le responde
    e0 = (await enviados()).length; await escribe('Hola, ¿cuánto son los gastos comunes?', 'c5', { dateAdded: new Date(Date.now() - 1000).toISOString() });
    ok(!(await espera(/^k5\|/, e0, 6)), 'con la atención de clientes apagada, no se le responde al cliente');
    // el corredor la enciende
    e0 = (await enviados()).length; await escribe('Diego, activa la atención de clientes'); ok(await espera(/^k9\|[\s\S]*atención de clientes quedó activa/, e0), 'el corredor enciende la atención de clientes desde WhatsApp');
    // Carla pregunta: responde con su propiedad (sin notas internas)
    e0 = (await enviados()).length; await escribe('Hola, ¿cuánto son los gastos comunes del depto?', 'c5');
    const r1 = await espera(/^k5\|/, e0); ok(r1 && /Irarrázaval 2450/.test(r1) && /95\.000/.test(r1) && !/600 mil/.test(r1), `Diego le responde a Carla con los datos de SU propiedad: «${(r1 || '').slice(3, 90)}…»`);
    const aviso1 = await espera(/^k9\|\*Tomás\* · Atención de clientes\n💬 Carla Ruiz Soto escribió/, e0); ok(aviso1, 'y le avisa al corredor que Carla escribió y qué le respondió');
    // pide una visita: toma el recado, no agenda
    e0 = (await enviados()).length; await escribe('Quiero agendar una visita, puedo el sábado en la mañana', 'c5');
    const r2 = await espera(/^k5\|/, e0); ok(r2 && /le paso tu disponibilidad/i.test(r2), 'para una visita, Diego toma el recado (no confirma fecha)');
    const rec = await espera(/^k9\|\*Tomás\* · Atención de clientes\n📩 \*Recado de Carla Ruiz Soto\*/, e0); ok(rec && /agendar una visita/.test(rec) && /sábado en la mañana/.test(rec), 'el recado le llega al corredor con lo que pide y su disponibilidad');
    const act = JSON.stringify(await w.evaluate((id) => window.pf.inmoActividad(id), per.id));
    ok(/Quiere agendar una visita/.test(act) && /sábado en la mañana/.test(act), 'el recado queda anotado en la actividad de Carla en el CRM');
    // un número que no está en el CRM: no se responde
    e0 = (await enviados()).length; await escribe('Hola, vi un aviso', 'c6'); ok(!(await espera(/^k6\|/, e0, 6)), 'a un número que no está en el CRM no se le responde');
    // el corredor le escribe a mano: Diego se calla con Carla
    await escribe('Hola Carla, soy Jerónimo, te llamo en un rato', 'c5', { direction: 'outbound', userId: 'u1', source: 'app' });
    e0 = (await enviados()).length; await escribe('Perfecto, gracias', 'c5'); ok(!(await espera(/^k5\|/, e0, 6)), 'si el corredor le escribe a mano, Diego deja de responderle');
    ok(await espera(/^k9\|[\s\S]*en pausa en esta conversación/, e0), 'pero te avisa lo que escribió Carla y que Diego está en pausa (cómo reanudarlo)');
    // 0.16.9 · un lead (pantalla Leads) que escribe: lo atiende Fernanda y la conversación queda en su lead
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pfcw-f-')); const chat = path.join(tmp, 'Chat de WhatsApp con +56 9 8765 4321.txt');
    fs.writeFileSync(chat, '16/10/26, 12:20 - +56 9 8765 4321: Hola, busco casa en venta en La Reina hasta 9000 UF\n16/10/26, 12:21 p. m. - Fran Broker: Hola! te mando opciones\n');
    const an = await w.evaluate((r) => window.pf.leadsAnalizar({ ruta: r, miNombre: 'Fran Broker' }).then((x) => x.data || x), chat);
    const imp = await w.evaluate((t) => window.pf.leadsImportar({ token: t, cliente: '+56 9 8765 4321', telefono: '+56 9 8765 4321', transcribir: false, analizarIA: false }).then((x) => x.data || x), an.token);
    const lid = imp.lead.id;
    e0 = (await enviados()).length; await escribe('Hola, sigo buscando casa en La Reina', 'c7');
    const r3 = await espera(/^k7\|/, e0); ok(r3, 'un lead que escribe al número de la empresa recibe respuesta');
    ok(await espera(/^k9\|\*Sofía\* · Atención de leads\n💬 \+56 9 8765 4321 escribió[\s\S]*tomarla en Leads/, e0), 'al lead lo atiende Fernanda y te avisa que puedes tomar la conversación en Leads');
    let L = await w.evaluate((id) => window.pf.leadsObtener(id).then((x) => x.data || x), lid);
    ok(L.wa && L.atiende === 'agente' && L.mensajesLista.some((m) => m.de === 'cliente' && /sigo buscando casa/.test(m.texto)) && L.mensajesLista.some((m) => m.de === 'agente'), 'la conversación (cliente y Fernanda) queda en la pantalla Leads');
    await w.evaluate(() => window.closeModal?.()); await w.keyboard.press('Escape'); await w.evaluate((id) => window.Leads.abrir(id), lid); await w.waitForSelector('#ldTomar');
    ok(/Atiende Sofía/.test(await w.textContent('#ldChat')), 'en Leads se ve «Atiende Sofía» con el botón para tomar la conversación');
    await w.screenshot({ path: path.resolve(__dirname, 'cw1-lead-fernanda.png') });
    await w.click('#ldTomar'); await w.waitForSelector('#ldRespTx');
    ok(/La atiendes tú/.test(await w.textContent('#ldChat')), 'al tomarla, la conversación pasa al corredor y aparece la caja para responder');
    e0 = (await enviados()).length; await w.fill('#ldRespTx', 'Hola, soy Jerónimo. Te llamo hoy para ver opciones.'); await w.click('#ldRespOk');
    ok(await espera(/^k7\|Hola, soy Jerónimo\. Te llamo hoy/, e0), 'el corredor le responde al lead desde Leads y sale por WhatsApp');
    e0 = (await enviados()).length; await escribe('Perfecto, espero tu llamada', 'c7');
    ok(!(await espera(/^k7\|/, e0, 6)), 'con la conversación tomada, Fernanda ya no le responde');
    L = await w.evaluate((id) => window.pf.leadsObtener(id).then((x) => x.data || x), lid);
    ok(L.mensajesLista.some((m) => /espero tu llamada/.test(m.texto)) && L.mensajesLista.some((m) => m.de === 'broker' && /Te llamo hoy/.test(m.texto)), 'igual queda registrado todo lo que escribe el lead y lo que le respondes');
    await w.waitForTimeout(600); await w.screenshot({ path: path.resolve(__dirname, 'cw2-lead-tomado.png') });
    await w.click('#ldDevolver'); await w.waitForSelector('#ldTomar'); ok(true, '«Devolver a Sofía» la vuelve a dejar a cargo');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK clientes whatsapp');
  } catch (er) { console.error(er.message); await w.screenshot({ path: path.resolve(__dirname, 'cw-error.png') }).catch(() => {}); process.exitCode = 1; } finally { await app.close(); }
})();
