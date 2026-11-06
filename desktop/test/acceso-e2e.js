// Usuarios de Asset y permisos (reemplaza a los perfiles por equipo de 0.16.26-27): toda la cartera la ven todos,
// pero el dueño solo quien captó la propiedad (y el administrador). Quién usa la app es el usuario de la sesión de
// Asset (ADMIN o CORREDOR); el administrador maneja los usuarios en «Usuarios de la corredora». El captador se puede
// asignar a varias propiedades a la vez desde la Cartera. En modo de prueba los usuarios los simula src/asset.js:
// cambiar de usuario es ingresar con su correo y clave (assetIngresar). Al final, PF_MOCK_ROL=corredor.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfac-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfac-db-'));
  const lanzar = (env = {}, ud = userData) => electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${ud}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir, PF_MOCK_ROL: '', ...env } });
  let app = await lanzar();
  let w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
  const falla = (fn, ...a) => call(fn, ...a).then(() => null, (e) => e.message);
  const txt = (s) => w.textContent(s).then((t) => (t || '').replace(/\s+/g, ' '));
  const shot = (n) => w.screenshot({ path: path.resolve(__dirname, n) });
  // cambiar de usuario: ingresar con su correo y clave (y que la pantalla tome el perfil nuevo)
  const como = async (email, clave) => { const u = await call('assetIngresar', email, clave); await w.evaluate(() => window.perfilEquipo()); return u; };
  const ADMIN = ['corredor@demo.cl', 'demo1234']; const ANA = ['ana@thelivingchile.cl', 'clave-ana-123']; const BETO = ['beto@thelivingchile.cl', 'clave-beto-123'];
  try {
    await w.setViewportSize({ width: 1500, height: 960 });
    await w.waitForSelector('#view-agente .ag.ag-full', { timeout: 15000 });
    ok((await call('accEstado')).esAdmin && (await call('accEstado')).nombre === 'Corredor Demo', 'el usuario de la sesión de Asset es el administrador (ADMIN por defecto en modo de prueba)');

    // «Usuarios de la corredora» (menú de la cuenta): el administrador agrega a Ana desde la pantalla
    await w.click('#userBtn'); await w.waitForSelector('#userMenu [data-um="usuarios"]'); await w.click('[data-um="usuarios"]');
    await w.waitForSelector('#usrPanel [data-usr]');
    ok(/Corredor Demo/.test(await txt('#usrLista')) && /Administrador/.test(await txt('#usrLista')), 'la pantalla de usuarios lista al equipo con su rol');
    await w.click('#usrNuevo'); await w.waitForSelector('#usrForm');
    await w.fill('#usrNombre', 'Ana Rivas'); await w.fill('#usrEmail', ANA[0]); await w.fill('#usrTel', '+56955550001'); await w.fill('#usrClave', 'corta'); await w.click('#usrGuardar');
    await w.waitForSelector('#usrErr'); ok(/8 caracteres/.test(await txt('#usrErr')), 'la clave inicial debe tener al menos 8 caracteres');
    await w.fill('#usrClave', ANA[1]); await w.click('#usrGuardar'); await w.waitForSelector('#usrForm', { state: 'detached' });
    ok(/Ana Rivas/.test(await txt('#usrLista')) && /Corredor/.test(await txt(`#usrLista li:has-text("Ana Rivas")`)), 'agrega a Ana como corredora, con clave inicial');
    await shot('ac-usuarios.png'); await w.click('#mCancel');
    const ana = (await call('usrListar')).find((u) => u.email === ANA[0]);
    const beto = await call('usrCrear', { nombre: 'Beto Soto', email: BETO[0], telefono: '+56955550002', clave: BETO[1] });
    ok(/Ya existe/.test(await falla('usrCrear', { nombre: 'Otra Ana', email: ANA[0], clave: 'clave-otra-123' }) || ''), 'no se repite el correo');

    const d1 = await call('inmoPerGuardar', { nombre: 'Aníbal Cortés Fernández', rut: '13.832.457-5', email: 'anibal@correo.cl', telefono: '+56994321855', roles: ['propietario'] });
    const d2 = await call('inmoPerGuardar', { nombre: 'Rosa Pérez Mena', rut: '11.111.111-1', email: 'rosa@correo.cl', telefono: '+56988887777', roles: ['propietario'] });
    const pA = await call('inmoPropGuardar', { titulo: 'Depto Las Condes', tipo: 'departamento', arriendo: true, precioArriendo: { valor: 45, moneda: 'UF' }, direccion: 'Av. Américo Vespucio Sur 1096', comuna: 'Las Condes' });
    const pB = await call('inmoPropGuardar', { titulo: 'Casa La Reina', tipo: 'casa', venta: true, precioVenta: { valor: 12500, moneda: 'UF' }, direccion: 'Larraín 6000', comuna: 'La Reina' });
    const extra = []; for (const t of ['Depto Ñuñoa', 'Oficina Santiago', 'Casa Vitacura']) extra.push(await call('inmoPropGuardar', { titulo: t, tipo: 'departamento', venta: true, direccion: t, comuna: 'Santiago' }));
    await call('inmoVincular', pA.id, d1.id, 'propietario'); await call('inmoVincular', pB.id, d2.id, 'propietario');
    await call('fmtConfigurar', { paquete: 'the-living' });
    // asignar captador a varias desde la Cartera (el captador es un usuario)
    await w.evaluate(() => window.perfilEquipo());
    await w.click('#nav [data-view="cartera"]'); await w.waitForSelector('#imCaptBulk');
    ok(/Sin captador · 5/.test(await txt('#imCaptF')), 'la cartera filtra por captador y cuenta las que no tienen');
    await w.click('#imCaptBulk'); await w.waitForSelector('.im-bulk');
    ok((await w.$$('.im-card')).length === 5 && (await w.$$('.im-check')).length === 5, 'en modo asignar muestra las que no tienen captador, con casillas');
    for (const p of [pA, ...extra]) await w.click(`.im-card[data-id="${p.id}"]`);
    ok(/4 seleccionadas/.test(await txt('#imBulkN')), 'se marcan varias propiedades');
    await w.selectOption('#imBulkCor', ana.id); await shot('ac-bulk.png'); await w.click('#imBulkOk'); await w.waitForSelector('#modalCard #mOk');
    ok(/4 propiedades/.test(await txt('#modalCard')) && /Ana Rivas/.test(await txt('#modalCard')), 'pide confirmar: 4 propiedades para Ana');
    await w.click('#mOk'); await w.waitForSelector('.im-bulk', { state: 'detached' }); await w.waitForTimeout(300);
    const L0 = await call('inmoListar');
    ok([pA, ...extra].every((p) => L0.propiedades.find((x) => x.id === p.id).captador?.id === ana.id) && !L0.propiedades.find((x) => x.id === pB.id).captador, 'quedan las 4 de Ana; la casa sigue sin captador');
    ok(/Sin captador · 1/.test(await txt('#imCaptF')) && (await w.$$('.im-card')).length === 1, 'el filtro «Sin captador» ahora muestra solo la que falta');
    ok(/Captada por Ana Rivas/.test(JSON.stringify(await call('inmoActividad', extra[0].id))), 'cada una lo registra en su historial');
    await w.selectOption('#imCaptF', ''); await w.waitForTimeout(200);
    ok(/Ana Rivas/.test(await txt(`.im-card[data-id="${pA.id}"]`)) && /Sin captador/.test(await txt(`.im-card[data-id="${pB.id}"]`)), 'cada tarjeta muestra su captador');
    await call('accCaptador', pB.id, beto.id);
    // administrador: ve todo desde la pestaña Propietario
    await w.evaluate((id) => window.Inmo.abrirFicha(id), pA.id);
    await w.click('[data-tab="propietario"]'); await w.waitForSelector('.im-dueno'); await w.waitForTimeout(1200); await w.click('[data-tab="propietario"]'); await w.waitForSelector('.im-dueno');
    ok(/Aníbal Cortés/.test(await txt('#fDueno')) && /13\.832\.457-5/.test(await txt('#fDueno')) && (await w.$eval('#fCaptador', (s) => s.selectedOptions[0].textContent)) === 'Ana Rivas', 'el administrador ve al propietario y quién captó (Ana)');
    ok(/Entraste como Corredor Demo \(administrador\)/.test(await txt('#fDueno')), 'la ficha dice con qué usuario se entró');
    await w.fill('[data-dnota]', 'Prefiere que lo llamen en la tarde. Exige garantía de 2 meses.'); await w.click('[data-dguardar]'); await w.waitForTimeout(500);
    ok(/Prefiere que lo llamen/.test((await call('inmoListar')).personas.find((x) => x.id === d1.id).notas), 'las notas sobre el propietario se guardan en su persona');
    await shot('ac0-admin.png');
    // entra Ana (corredora)
    ok(/incorrectos/.test(await falla('assetIngresar', ANA[0], 'otra-clave') || ''), 'Ana no entra con una clave equivocada');
    await como(...ANA);
    ok(!(await call('accEstado')).esAdmin && (await call('accEstado')).nombre === 'Ana Rivas' && (await call('accEstado')).corredorId === ana.id, 'al entrar Ana, la app la trata como corredora (su id de usuario)');
    ok(/lo hace el administrador/.test(await falla('accCaptadorVarios', [pB.id], ana.id) || ''), 'un corredor no puede asignarse captaciones');
    const L = await call('inmoListar'); const vA = L.personas.find((x) => x.id === d1.id); const vB = L.personas.find((x) => x.id === d2.id);
    ok(vA.rut === '13.832.457-5' && vB.reservado && vB.nombre === 'Propietario (reservado)' && !vB.rut && !vB.telefono, 'Ana ve al dueño de su captación; el de Beto queda reservado');
    ok(L.propiedades.length === 5 && L.propiedades.find((x) => x.id === pB.id).duenoVisible === false, 'pero ve toda la cartera (también la casa de Beto)');
    await w.evaluate((id) => window.Inmo.abrirFicha(id), pB.id); await w.waitForSelector('[data-tab="propietario"]');
    ok(/Propietario \(reservado\)/.test(await txt('[data-pane="resumen"]')) && !/Rosa/.test(await txt('#view-cartera')), 'en la ficha ajena el dueño aparece como reservado, sin nombre ni contacto');
    await w.click('[data-tab="propietario"]'); await w.waitForSelector('.im-lock');
    ok(/Datos del propietario reservados/.test(await txt('#fDueno')) && /Beto Soto/.test(await txt('#fDueno')), 'la pestaña Propietario explica que lo ve Beto, quien la captó');
    await shot('ac1-reservado.png');
    ok(/No tienes acceso/.test(await falla('fmtPreparar', { formatoId: 'mandato_venta', propId: pB.id }) || ''), 'el mandato de una propiedad ajena no se puede preparar');
    ok(/solo los edita/.test(await falla('inmoPerGuardar', { id: d2.id, nombre: 'X', rut: '' }) || ''), 'ni editar los datos de su dueño');
    { const e = await falla('fmtPreparar', { formatoId: 'mandato_arriendo', propId: pA.id }); ok(!e, 'su propio mandato sí' + (e ? ' (' + e + ')' : '')); }
    await call('inmoPropGuardar', { id: pB.id, ficha: { propietarioNombre: 'Otro', propietarioEmail: 'x@x.cl', orientacion: 'Norte' } });
    await como(...ADMIN); const fB = await call('inmoFicha', pB.id);
    ok(fB.prop.ficha.orientacion === 'Norte' && fB.prop.ficha.propietarioNombre !== 'Otro', 'lo que Ana guarda en la ficha ajena no toca los datos del dueño');
    await como(...ANA);
    const ag = JSON.stringify(await call('assetEjecutar', 'asset_ver_propiedad', { propiedad: pB.codigo }).catch((e) => ({ error: e.message })));
    ok(!/Rosa|11\.111\.111-1|rosa@correo|88887777/.test(ag), 'el Agente no entrega los datos del dueño reservado');
    const pC = await call('inmoPropGuardar', { titulo: 'Oficina Providencia', tipo: 'oficina', arriendo: true, direccion: 'Providencia 1000', comuna: 'Providencia' });
    ok((await call('inmoListar')).propiedades.find((x) => x.id === pC.id).captador?.id === ana.id, 'lo que crea Ana queda captado por ella');
    // lo que solo hace el administrador (por rol del usuario de Asset), y el corredor ve solo sus leads y negocios
    for (const [fn, args, que] of [['inmoPropArchivar', [pA.id, true], 'archivar'], ['inmoImportar', [], 'importar la cartera'], ['obsConfigurar', [{ activo: true, autorizado: true }], 'conexiones'], ['pvConfigurar', [{ auto: true }], 'configurar a Fernanda'], ['topUp', [10000, 'x@x.cl'], 'cargar saldo'], ['fmtConfigurar', [{ paquete: 'the-living' }], 'formatos'], ['usrCrear', [{ nombre: 'Nuevo', email: 'n@x.cl', clave: 'clave-nueva-1' }], 'usuarios'], ['usrEditar', [beto.id, { rol: 'ADMIN' }], 'cambiar el rol de otro']]) {
      const e = await falla(fn, ...args); ok(/lo hace el administrador/.test(e || ''), `el corredor no puede: ${que}`); }
    await w.click('#nav [data-view="cartera"]'); await w.waitForSelector('.im-card'); await w.evaluate((id) => window.Inmo.abrirFicha(id), pA.id); await w.waitForSelector('.im-ficha [data-mas]'); await w.click('.im-ficha [data-mas]'); await w.waitForSelector('#fArch', { state: 'attached' });
    ok(await w.evaluate(() => document.body.classList.contains('perfil-corredor')) && !(await w.isVisible('#fArch')), 'en pantalla se ocultan las acciones del administrador (Archivar)');
    // la corredora ve el equipo, sin editar
    await w.evaluate(() => window.Usuarios.abrir()); await w.waitForSelector('#usrPanel [data-usr]');
    ok(/Beto Soto/.test(await txt('#usrLista')) && !(await w.$('#usrNuevo')) && !(await w.$('[data-usr-ed]')) && /lo hace el administrador/.test(await txt('#usrPanel')), 'el corredor ve al equipo, sin agregar ni editar');
    await w.click('#mCancel');
    // negocios: el que abre Ana es suyo; el del administrador no lo ve
    const cli = await call('inmoPerGuardar', { nombre: 'Cliente Uno', email: 'c1@correo.cl', roles: ['interesado'] });
    const nAna = await call('negGuardar', { tipo: 'arriendo', propId: pA.id, clienteId: cli.id });
    await como(...ADMIN);
    const nAdm = await call('negGuardar', { tipo: 'venta', propId: pB.id, clienteId: cli.id });
    ok((await call('negObtener', nAna.id)).corredorId === ana.id, 'el negocio que abre Ana queda a su nombre (su id de usuario)');
    await como(...ANA);
    const ns = (await call('negListar')).negocios.map((n) => n.id);
    ok(ns.includes(nAna.id) && !ns.includes(nAdm.id), 'Ana ve sus negocios, no los de otros');
    ok(/otro corredor/.test(await falla('negObtener', nAdm.id) || ''), 'y no puede abrir uno ajeno');
    // leads: solo los suyos; el administrador vincula a Ana con su usuario de wechatia (se guarda en su usuario)
    await como(...ADMIN);
    await w.evaluate(() => window.Usuarios.abrir()); await w.waitForSelector(`[data-usr-ed="${ana.id}"]`); await w.click(`[data-usr-ed="${ana.id}"]`);
    await w.fill('#usrWc', 'u-ana'); await w.click('#usrGuardar'); await w.waitForSelector('#usrForm', { state: 'detached' });
    ok((await call('usrListar')).find((u) => u.id === ana.id).wechatiaId === 'u-ana' && /wechatia: u-ana/.test(await txt(`#usrLista li:has-text("Ana Rivas")`)), 'el administrador vincula a Ana con su usuario de wechatia');
    await w.click('#mCancel');
    await app.evaluate(() => { const t = new Date().toISOString(); global.__waMock = { enviados: [], convs: [{ id: 'igA', contactId: 'cA', fullName: 'Lead de Ana', lastMessageType: 'TYPE_INSTAGRAM', assignedTo: 'u-ana' }, { id: 'igX', contactId: 'cX', fullName: 'Lead sin dueño', lastMessageType: 'TYPE_INSTAGRAM' }],
      msgs: { igA: [{ id: 'a1', direction: 'inbound', messageType: 'TYPE_INSTAGRAM', body: 'Hola, busco depto', dateAdded: t }], igX: [{ id: 'x1', direction: 'inbound', messageType: 'TYPE_INSTAGRAM', body: 'Hola', dateAdded: t }] } }; });
    await call('obsConfigurar', { activo: true, autorizado: true, ia: false }); await call('obsRevisar');
    ok((await call('leadsListar', {})).leads.length === 2, 'el administrador ve todos los leads');
    await como(...ANA);
    const ls = (await call('leadsListar', {})).leads.map((l) => l.nombre);
    ok(ls.length === 1 && ls[0] === 'Lead de Ana', 'Ana ve solo sus leads');
    ok(/lo hace el administrador/.test(await falla('leadsAsignar', (await call('leadsListar', {})).leads[0].id, null) || ''), 'y no puede reasignarlos');
    // administración: editar, desactivar y clave nueva
    await como(...ADMIN);
    await w.evaluate(() => window.Usuarios.abrir()); await w.waitForSelector(`[data-usr-ed="${beto.id}"]`);
    await w.click(`[data-usr-clave="${beto.id}"]`); await w.fill('#usrClaveNueva', 'clave-nueva-beto'); await w.click('#usrGuardar'); await w.waitForSelector('#usrForm', { state: 'detached' });
    ok(/incorrectos/.test(await falla('assetIngresar', ...BETO) || ''), 'con la clave nueva, la anterior de Beto ya no sirve');
    await como(BETO[0], 'clave-nueva-beto'); ok((await call('accEstado')).nombre === 'Beto Soto', 'y entra con la clave nueva');
    await como(...ADMIN);
    await w.evaluate(() => window.Usuarios.abrir()); await w.waitForSelector(`[data-usr-ed="${beto.id}"]`);
    await w.click(`[data-usr-ed="${beto.id}"]`); await w.fill('#usrTel', '+56955559999'); await w.click('#usrActivo'); await w.click('#usrGuardar'); await w.waitForSelector('#usrForm', { state: 'detached' });
    const b2 = (await call('usrListar')).find((u) => u.id === beto.id);
    ok(b2.telefono === '+56955559999' && b2.activo === false && /Inactivo/.test(await txt(`#usrLista li:has-text("Beto Soto")`)), 'edita el teléfono y desactiva a Beto');
    ok(/incorrectos/.test(await falla('assetIngresar', BETO[0], 'clave-nueva-beto') || ''), 'un usuario desactivado no puede entrar');
    ok(!(await call('accEstado')).corredores.some((c) => c.id === beto.id), 'y deja de aparecer para asignar captaciones');
    await w.click(`[data-usr-ed="${(await call('accEstado')).usuarioId}"]`);
    ok(await w.isDisabled('#usrRol') && await w.isDisabled('#usrActivo'), 'el administrador no puede quitarse el rol ni desactivarse');
    await w.click('#mCancel');
    ok(!errs.length, 'sin errores en la pantalla ' + errs.join(' | '));
    await app.close();

    // PF_MOCK_ROL=corredor: el usuario simulado entra como CORREDOR (para probar permisos sin crear usuarios)
    app = await lanzar({ PF_MOCK_ROL: 'corredor' }, fs.mkdtempSync(path.join(os.tmpdir(), 'pfac-c-')));
    w = await app.firstWindow(); w.on('pageerror', (e) => errs.push(e.message));
    await w.waitForSelector('#view-agente .ag.ag-full', { timeout: 15000 }); await w.waitForTimeout(300);
    const st = await call('accEstado');
    ok(!st.esAdmin && st.rol === 'corredor' && await w.evaluate(() => document.body.classList.contains('perfil-corredor')), 'con PF_MOCK_ROL=corredor el usuario simulado es corredor');
    ok(/lo hace el administrador/.test(await falla('inmoPropArchivar', pA.id, true) || '') && (await call('inmoListar')).personas.find((x) => x.id === d1.id)?.reservado, 'y aplica sus permisos (no archiva; los dueños ajenos, reservados)');
    ok(!errs.length, 'sin errores en la pantalla ' + errs.join(' | '));
    console.log('\nOK acceso-e2e');
  } catch (e) { console.error(e.message); await shot('ac-error.png').catch(() => {}); process.exitCode = 1; }
  finally { await app.close().catch(() => {}); }
})();
