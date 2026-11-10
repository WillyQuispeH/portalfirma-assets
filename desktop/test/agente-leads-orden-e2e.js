// Herramientas del Agente (PF_MOCK, llamadas directas): registrar un lead y una persona SIN RUT, revisar la orden de
// visita sin enviarla (ni cobrar ni agendar) y luego enviarla, y crear una propiedad dictada con su propietario
// (se registra, o se dice por qué no). Requiere el bundle compilado.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfal-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfal-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir, PF_START: 'inicio' } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const llamar = (n, a) => w.evaluate(([x, y]) => window.pf.assetEjecutar(x, y), [n, a]);
  const call = async (n, a) => { const r = await llamar(n, a); if (!r.ok) throw new Error(`${n}: ${r.error}`); return r.data; };
  const error = async (n, a) => { const r = await llamar(n, a); return r.ok ? null : r.error; };
  const pf = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
  const man = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  try {
    await w.setViewportSize({ width: 1500, height: 920 }); await w.waitForSelector('#view-inicio [data-cabecera]');
    await w.click('#view-inicio [data-do="importar"]'); await w.waitForSelector('text=Cartera actualizada', { timeout: 15000 }); await w.click('#mOk'); await w.waitForSelector('.im-card');

    // ---- persona sin RUT
    let r = await call('asset_crear_persona', { nombre: 'Camila Prueba Soto', telefono: '+56 9 8123 4500', roles: ['interesado'] });
    ok(r.ok && r.persona.nombre === 'Camila Prueba Soto' && !r.persona.rut, 'una persona se crea sin RUT (era obligatorio para la herramienta)');
    ok(/RUT no es válido/.test(await error('asset_crear_persona', { nombre: 'Otra Persona', rut: '15.432.876-5' })), 'si da el RUT, debe ser válido');

    // ---- lead sin RUT
    r = await call('asset_crear_lead', { nombre: 'Catalina Fuentes Ríos', telefono: '+56 9 8123 4567', canal: 'instagram', operacion: 'arriendo', tipo: 'departamento', comunas: ['Providencia', 'Ñuñoa'], presupuesto: 750000, dormitorios: 2, notas: 'Llegó por Instagram', proxima_accion: 'Llamarla mañana', fecha_proxima_accion: man });
    ok(r.ok && !r.yaExistia && r.lead.id && /No se le escribió/.test(r.indicacion), 'registra un lead sin RUT y sin escribirle al cliente');
    const l = (await pf('leadsListar', {})).leads.find((x) => x.id === r.lead.id);
    ok(l && l.origen === 'instagram' && l.nombre === 'Catalina Fuentes Ríos' && !l.rut, 'queda en Leads, por Instagram');
    const L = await pf('leadsObtener', r.lead.id);
    ok(L.busqueda.operacion === 'arriendo' && L.busqueda.comunas.join() === 'Providencia,Ñuñoa' && L.busqueda.presupuesto.valor === 750000 && L.busqueda.dormitorios === 2, 'guarda lo que busca (arriendo, comunas, presupuesto, dormitorios)');
    ok(L.proximaAccion?.texto === 'Llamarla mañana' && L.proximaAccion.fecha === man && L.atiende !== 'agente' && !L.mensajes, 'guarda la próxima acción y no queda atendido por Sofía (sin mensajes)');
    r = await call('asset_crear_lead', { nombre: 'Catalina F.', telefono: '+56 98123 4567', canal: 'portal' });
    ok(r.yaExistia && /no se duplicó/.test(r.indicacion), 'con el mismo celular no duplica el lead');
    ok(/al menos el nombre/.test(await error('asset_crear_lead', { canal: 'portal' })) && /celular no es válido/.test(await error('asset_crear_lead', { nombre: 'X', telefono: '123' })), 'sin datos mínimos o con un celular inválido, lo dice');
    r = await call('asset_crear_lead', { nombre: 'Solo Correo', email: 'solo.correo@correo.cl', canal: 'referido' });
    ok(r.ok && !r.yaExistia, 'basta con el correo');

    // ---- orden de visita: revisar y después enviar
    const antes = await app.evaluate(() => (global.__pfMock._ordenes || []).length);
    const ev0 = (await pf('agendaListar', {})).length;
    r = await call('asset_revisar_orden_visita', { propiedad: 'CV-9002', visitante: 'Juan Pérez', fecha: man });
    ok(r.ok && r.enviada === false && r.listo && /CV-9002/.test(r.propiedad) && /JUAN PEREZ/i.test(r.visitante), 'revisar arma la orden y dice que NO se envió');
    ok(Array.isArray(r.datosDelDocumento) && r.datosDelDocumento.length >= 3 && r.datosDelDocumento.some((x) => /11\.111\.111-1/.test(x.valor)) && /NO se envió, NO se cobró y NO se agendó/.test(r.indicacion), 'muestra los datos que llevaría el documento (con el RUT del visitante)');
    ok(await app.evaluate(() => (global.__pfMock._ordenes || []).length) === antes && (await pf('agendaListar', {})).length === ev0, 'no envió nada a firmar y no agendó la visita');
    r = await call('asset_orden_visita', { propiedad: 'CV-9002', visitante: 'Juan Pérez', fecha: man });
    ok(r.ok && r.operacion && await app.evaluate(() => (global.__pfMock._ordenes || []).length) === antes + 1 && (await pf('agendaListar', {})).length === ev0 + 1, 'después, pedir enviarla la envía a firmar y agenda la visita');

    // ---- agendar: si el día de la semana no coincide con la fecha («jueves 13» cuando el 13 es viernes), no agenda
    const nombreDia = (f) => new Date(`${f}T12:00:00Z`).toLocaleDateString('es-CL', { weekday: 'long', timeZone: 'UTC' });
    const real = nombreDia(man); const otro = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'].find((d) => d !== real);
    const evAntes = (await pf('agendaListar', {})).length;
    const m = await error('asset_crear_evento', { tipo: 'visita', fecha: man, dia_semana: otro, titulo: 'Visita', propiedad: 'CV-9002' });
    ok(m && new RegExp(`es ${real}, no ${otro}`).test(m) && /NO agendes todavía/.test(m) && (await pf('agendaListar', {})).length === evAntes, `«${otro} ${man.slice(8)}» cuando es ${real}: no agenda y pide aclarar (${(m || '').slice(0, 60)}…)`);
    r = await call('asset_crear_evento', { tipo: 'visita', fecha: man, dia_semana: real.toUpperCase(), titulo: 'Visita de prueba', propiedad: 'CV-9002' });
    ok(r.ok && (await pf('agendaListar', {})).length === evAntes + 1, `si el día coincide (${real}), agenda normal`);

    // ---- propiedad dictada con propietario (RUT inválido y válido)
    const base = { tipo: 'departamento', venta: true, precioVenta: { valor: 6900, moneda: 'UF' }, direccion: 'Av. Irarrázaval 3450', unidad: '804', comuna: 'Ñuñoa', dormitorios: 3, banos: 2, titulo: 'Departamento 3D2B en Ñuñoa' };
    let p = await pf('dictCrear', { ...base, propietario: { nombre: 'María José Contreras Vidal', rut: '15.432.876-5', telefono: '+56 9 6543 2187', email: 'mj@correo.cl' } });
    ok(p.codigo && p.propietarioRegistro && p.propietarioRegistro.ok === false && /RUT no es válido/.test(p.propietarioRegistro.motivo), 'con el RUT inválido la propiedad se crea y se dice que el propietario NO quedó registrado');
    let f = await pf('inmoFicha', p.id); ok(!(f.vinculos || f.prop?.vinculos || []).some((v) => v.rol === 'propietario'), 'y la propiedad queda sin propietario');
    p = await pf('dictCrear', { ...base, unidad: '805', propietario: { nombre: 'María José Contreras Vidal', rut: '15.432.876-9', telefono: '+56 9 6543 2187', email: 'mj@correo.cl' } });
    ok(p.propietarioRegistro?.ok === true && p.propietarioRegistro.nombre === 'María José Contreras Vidal', 'con el RUT correcto, registra al propietario');
    f = await pf('inmoFicha', p.id); const vs = f.vinculos || f.prop?.vinculos || [];
    ok(vs.some((v) => v.rol === 'propietario' && /15\.432\.876-9/.test(JSON.stringify(f))), 'y lo vincula a la propiedad como propietario');
    p = await pf('dictCrear', { ...base, unidad: '806' });
    ok(p.codigo && p.propietarioRegistro === null, 'si no se dictó propietario, no hay nada que avisar');
    ok(!errs.length, 'sin errores en la ventana' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('agente-leads-orden-e2e: OK');
  } finally { await app.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
