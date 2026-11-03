// 0.16.26-27 · Captador y datos del propietario: toda la cartera la ven todos, pero el dueño solo quien captó la propiedad
// (y el administrador). Quién usa el equipo se elige en Asset, con clave de administrador opcional. El captador se
// puede asignar a varias propiedades a la vez desde la Cartera.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfac-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfac-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
  const falla = (fn, ...a) => call(fn, ...a).then(() => null, (e) => e.message);
  const txt = (s) => w.textContent(s).then((t) => (t || '').replace(/\s+/g, ' '));
  const shot = (n) => w.screenshot({ path: path.resolve(__dirname, n) });
  try {
    await w.setViewportSize({ width: 1500, height: 960 });
    await w.waitForSelector('#view-agente .ag.ag-full', { timeout: 15000 });
    const ana = await call('corGuardar', { nombre: 'Ana Rivas', celular: '+56955550001', email: 'ana@thelivingchile.cl' });
    const beto = await call('corGuardar', { nombre: 'Beto Soto', celular: '+56955550002', email: 'beto@thelivingchile.cl' });
    const d1 = await call('inmoPerGuardar', { nombre: 'Aníbal Cortés Fernández', rut: '13.832.457-5', email: 'anibal@correo.cl', telefono: '+56994321855', roles: ['propietario'] });
    const d2 = await call('inmoPerGuardar', { nombre: 'Rosa Pérez Mena', rut: '11.111.111-1', email: 'rosa@correo.cl', telefono: '+56988887777', roles: ['propietario'] });
    const pA = await call('inmoPropGuardar', { titulo: 'Depto Las Condes', tipo: 'departamento', arriendo: true, precioArriendo: { valor: 45, moneda: 'UF' }, direccion: 'Av. Américo Vespucio Sur 1096', comuna: 'Las Condes' });
    const pB = await call('inmoPropGuardar', { titulo: 'Casa La Reina', tipo: 'casa', venta: true, precioVenta: { valor: 12500, moneda: 'UF' }, direccion: 'Larraín 6000', comuna: 'La Reina' });
    const extra = []; for (const t of ['Depto Ñuñoa', 'Oficina Santiago', 'Casa Vitacura']) extra.push(await call('inmoPropGuardar', { titulo: t, tipo: 'departamento', venta: true, direccion: t, comuna: 'Santiago' }));
    await call('inmoVincular', pA.id, d1.id, 'propietario'); await call('inmoVincular', pB.id, d2.id, 'propietario');
    await call('fmtConfigurar', { paquete: 'the-living' });
    ok((await call('accEstado')).esAdmin, 'por defecto el equipo es del administrador (nada cambia para quien ya usa Asset)');
    // 0.16.27 · asignar captador a varias desde la Cartera
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
    await w.fill('[data-dnota]', 'Prefiere que lo llamen en la tarde. Exige garantía de 2 meses.'); await w.click('[data-dguardar]'); await w.waitForTimeout(500);
    ok(/Prefiere que lo llamen/.test((await call('inmoListar')).personas.find((x) => x.id === d1.id).notas), 'las notas sobre el propietario se guardan en su persona');
    await shot('ac0-admin.png');
    await call('accPin', { pin: '1234' }); await call('accUsar', { rol: 'corredor', corredorId: ana.id });
    ok(!(await call('accEstado')).esAdmin && (await call('accEstado')).nombre === 'Ana Rivas', 'el equipo pasa a ser de Ana');
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
    await call('accUsar', { rol: 'admin', pin: '1234' }); const fB = await call('inmoFicha', pB.id);
    ok(fB.prop.ficha.orientacion === 'Norte' && fB.prop.ficha.propietarioNombre !== 'Otro', 'lo que Ana guarda en la ficha ajena no toca los datos del dueño');
    await call('accUsar', { rol: 'corredor', corredorId: ana.id });
    const ag = JSON.stringify(await call('assetEjecutar', 'asset_ver_propiedad', { propiedad: pB.codigo }).catch((e) => ({ error: e.message })));
    ok(!/Rosa|11\.111\.111-1|rosa@correo|88887777/.test(ag), 'el Agente no entrega los datos del dueño reservado');
    ok(/clave/.test(await falla('accUsar', { rol: 'admin', pin: '0000' }) || ''), 'para volver a administrador se necesita la clave');
    const pC = await call('inmoPropGuardar', { titulo: 'Oficina Providencia', tipo: 'oficina', arriendo: true, direccion: 'Providencia 1000', comuna: 'Providencia' });
    ok((await call('inmoListar')).propiedades.find((x) => x.id === pC.id).captador?.id === ana.id, 'lo que crea Ana queda captado por ella');
    // 0.16.27 · perfiles: lo que solo hace el administrador, y el corredor ve solo sus leads y negocios
    for (const [fn, args, que] of [['inmoPropArchivar', [pA.id, true], 'archivar'], ['inmoImportar', [], 'importar la cartera'], ['obsConfigurar', [{ activo: true, autorizado: true }], 'conexiones'], ['pvConfigurar', [{ auto: true }], 'configurar a Fernanda'], ['topUp', [10000, 'x@x.cl'], 'cargar saldo'], ['fmtConfigurar', [{ paquete: 'the-living' }], 'formatos'], ['corGuardar', [{ nombre: 'Nuevo' }], 'corredores']]) {
      const e = await falla(fn, ...args); ok(/lo hace el administrador/.test(e || ''), `el corredor no puede: ${que}`); }
    await w.evaluate(() => window.perfilEquipo()); await w.click('#nav [data-view="cartera"]'); await w.waitForSelector('.im-card'); await w.evaluate((id) => window.Inmo.abrirFicha(id), pA.id); await w.waitForSelector('#fArch', { state: 'attached' });
    ok(await w.evaluate(() => document.body.classList.contains('perfil-corredor')) && !(await w.isVisible('#fArch')), 'en pantalla se ocultan las acciones del administrador (Archivar)');
    // negocios: el que abre Ana es suyo; el del administrador no lo ve
    const cli = await call('inmoPerGuardar', { nombre: 'Cliente Uno', email: 'c1@correo.cl', roles: ['interesado'] });
    const nAna = await call('negGuardar', { tipo: 'arriendo', propId: pA.id, clienteId: cli.id });
    await call('accUsar', { rol: 'admin', pin: '1234' });
    const nAdm = await call('negGuardar', { tipo: 'venta', propId: pB.id, clienteId: cli.id });
    ok((await call('negObtener', nAna.id)).corredorId === ana.id, 'el negocio que abre Ana queda a su nombre');
    await call('accUsar', { rol: 'corredor', corredorId: ana.id });
    const ns = (await call('negListar')).negocios.map((n) => n.id);
    ok(ns.includes(nAna.id) && !ns.includes(nAdm.id), 'Ana ve sus negocios, no los de otros');
    ok(/otro corredor/.test(await falla('negObtener', nAdm.id) || ''), 'y no puede abrir uno ajeno');
    // leads: solo los suyos
    await call('accUsar', { rol: 'admin', pin: '1234' });
    await call('corGuardar', { id: ana.id, nombre: 'Ana Rivas', celular: '+56955550001', email: 'ana@thelivingchile.cl', wechatiaId: 'u-ana' });
    await app.evaluate(() => { const t = new Date().toISOString(); global.__waMock = { enviados: [], convs: [{ id: 'igA', contactId: 'cA', fullName: 'Lead de Ana', lastMessageType: 'TYPE_INSTAGRAM', assignedTo: 'u-ana' }, { id: 'igX', contactId: 'cX', fullName: 'Lead sin dueño', lastMessageType: 'TYPE_INSTAGRAM' }],
      msgs: { igA: [{ id: 'a1', direction: 'inbound', messageType: 'TYPE_INSTAGRAM', body: 'Hola, busco depto', dateAdded: t }], igX: [{ id: 'x1', direction: 'inbound', messageType: 'TYPE_INSTAGRAM', body: 'Hola', dateAdded: t }] } }; });
    await call('obsConfigurar', { activo: true, autorizado: true, ia: false }); await call('obsRevisar');
    ok((await call('leadsListar', {})).leads.length === 2, 'el administrador ve todos los leads');
    await call('accUsar', { rol: 'corredor', corredorId: ana.id });
    const ls = (await call('leadsListar', {})).leads.map((l) => l.nombre);
    ok(ls.length === 1 && ls[0] === 'Lead de Ana', 'Ana ve solo sus leads');
    ok(/lo hace el administrador/.test(await falla('leadsAsignar', (await call('leadsListar', {})).leads[0].id, null) || ''), 'y no puede reasignarlos');
    ok(!errs.length, 'sin errores en la pantalla ' + errs.join(' | '));
    console.log('\nOK acceso-e2e');
  } catch (e) { console.error(e.message); await shot('ac-error.png').catch(() => {}); process.exitCode = 1; }
  finally { await app.close(); }
})();
