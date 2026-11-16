// modal-13 del paso «Evaluación del arrendatario»: trae la solicitud de documentos (arrendatario y avales), el registro
// de un aval (nombre, RUT y celular) y la decisión. PF_MOCK: sin servidor, así que se prueba lo que es de la ventana.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfev-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfev-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const pf = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x), [fn, a]).then((r) => (r && r.ok === false ? Promise.reject(new Error(r.error)) : r?.data));
  try {
    await w.setViewportSize({ width: 1500, height: 920 });
    await w.waitForFunction(() => window.pf && window.Inmo && window.Ventanas, null, { timeout: 15000 });
    const maria = await pf('inmoPerGuardar', { nombre: 'María Postulante', rut: '12.345.678-5', telefono: '+56 9 6111 1111', email: '', roles: ['arrendatario'] });
    const prop = await pf('inmoPropGuardar', { titulo: 'Depto de prueba', tipo: 'departamento', arriendo: true, precioArriendo: 650000, monedaArriendo: 'CLP', comuna: 'Ñuñoa', direccion: 'Irarrázaval 3450' });
    const neg = await pf('negGuardar', { tipo: 'arriendo', etapa: 'evaluacion', clienteId: maria.id, propId: prop.id });
    await w.evaluate((id) => window.Ventanas.abrir('inmo.menuPaso', { titulo: 'Evaluación del arrendatario', evaluacionNegocioId: id, alElegir() {}, alGuardar() {} }, { clave: 'modal-13', ancho: true }), neg.id);
    await w.waitForSelector('#evPanel', { timeout: 8000 });
    ok(await w.locator('#modalCard').getAttribute('data-clave') === 'modal-13', 'la solicitud de documentos vive en el modal-13');
    ok(await w.locator('[data-ev-dest="arrendatario"]').count() === 1 && /María Postulante/.test(await w.locator('[data-ev-dest="arrendatario"]').innerText()), 'ofrece al arrendatario del negocio, con su nombre y celular');
    ok(await w.locator('.et-mopts').count() === 1, 'y sigue el menú de estados del paso (logrado, no logrado, esperando…)');
    ok(await w.locator('#evSolicitar').isEnabled(), 'con el arrendatario marcado se puede enviar la solicitud');
    await w.locator('[data-ev-dest="arrendatario"] input[type=checkbox]').uncheck();
    ok(await w.locator('#evSolicitar').isDisabled(), 'sin nadie marcado no se puede enviar');
    // registrar un aval
    await w.locator('#evAvalNuevo').click();
    await w.locator('#evAvalAgregar').click();
    ok(/nombre del aval/.test(await w.locator('#evAvalError').innerText()), 'registrar un aval sin nombre lo avisa');
    await w.fill('#evAvalNombre', 'Pedro Aval'); await w.fill('#evAvalRut', '11.111.111-2'); await w.fill('#evAvalTel', '+56 9 6222 2222');
    await w.locator('#evAvalAgregar').click();
    ok(/RUT no es válido/.test(await w.locator('#evAvalError').innerText()), 'con un RUT inválido no lo registra');
    await w.fill('#evAvalRut', '11.111.111-1');
    await w.fill('#evAvalTel', '123');
    await w.locator('#evAvalAgregar').click();
    ok(/celular/.test(await w.locator('#evAvalError').innerText()), 'ni sin celular');
    await w.fill('#evAvalTel', '+56 9 6222 2222');
    await w.locator('#evAvalAgregar').click();
    await w.waitForSelector('#evAvalForm', { state: 'detached', timeout: 8000 });
    const per = (await pf('inmoListar')).personas.find((p) => p.nombre === 'Pedro Aval');
    ok(per && per.roles.includes('codeudor') && /11\.111\.111-1/.test(per.rut) && /6222/.test(per.telefono), 'el aval queda en Personas con rol codeudor, su RUT y su celular');
    ok(await w.locator(`[data-ev-dest="${per.id}"] input[type=checkbox]`).isChecked(), 'y queda seleccionado');
    ok(/Enviar solicitud por WhatsApp \(1 persona\)/.test(await w.locator('#evSolicitar').innerText()) && await w.locator('#evSolicitar').isEnabled(), 'el botón dice a cuántas personas se envía');
    await w.locator('[data-ev-dest="arrendatario"] input[type=checkbox]').check();
    ok(/\(2 personas\)/.test(await w.locator('#evSolicitar').innerText()), 'arrendatario y aval juntos: 2 personas');
    // ---- documentos recibidos: resumen breve de cada uno y el corredor asigna su tipo (el servidor real los lee con IA; aquí una evaluación de mentira)
    await w.evaluate(() => window.closeModal());
    await app.evaluate((_, x) => { global.__pfEval = { [x.neg]: { negocioId: x.neg, estado: 'solicitada', solicitadaEn: new Date().toISOString(), analisis: null, decision: null, personas: [{ personaId: x.per, rol: 'arrendatario', nombre: 'María Postulante', telNorm: '961111111', solicitadaEn: new Date().toISOString(), completa: false, analisis: null, faltan: [], documentos: [{ id: 'contrato', nombre: 'Contrato de trabajo', ok: false, detalle: '' }], archivos: [{ n: 1, nombre: 'documento-1.jpg', clase: 'liquidacion', legible: true, resumen: 'Liquidación de octubre 2026: líquido $850.000, empleador Acme.', alertas: [], recibido: new Date().toISOString() }, { n: 2, nombre: 'documento-2.jpg', clase: 'otro', legible: true, resumen: 'Hoja con un contrato de trabajo a plazo indefinido.', alertas: ['Sin firma visible'], recibido: new Date().toISOString() }] }] } }; }, { neg: neg.id, per: maria.id });
    await w.evaluate((id) => window.Ventanas.abrir('inmo.menuPaso', { titulo: 'Evaluación del arrendatario', evaluacionNegocioId: id, alElegir() {}, alGuardar() {} }, { clave: 'modal-13', ancho: true }), neg.id);
    await w.waitForSelector('[data-ev-archivo-fila="1"]', { timeout: 8000 });
    ok(/Liquidación de octubre 2026/.test(await w.locator('[data-ev-resumen="1"]').innerText()) && /Sin firma visible/.test(await w.locator('[data-ev-resumen="2"]').innerText()), 'cada documento recibido muestra su resumen breve (y sus alertas) sin abrir nada');
    ok(await w.locator('[data-ev-clase="1"]').inputValue() === 'liquidacion' && await w.locator('[data-ev-clase="2"]').inputValue() === 'otro', 'y su tipo, que se puede cambiar');
    await w.locator('[data-ev-clase="2"]').selectOption('contrato_trabajo');
    await w.waitForFunction(() => /Asignado por ti/.test(document.querySelector('[data-ev-archivo-fila="2"]')?.textContent || ''), null, { timeout: 8000 });
    ok(await w.locator('[data-ev-clase="2"]').inputValue() === 'contrato_trabajo', 'al asignar el tipo el documento queda con ese tipo y se marca como asignado por el corredor');
    // vista previa: miniatura a la izquierda, se agranda al pasar el mouse y se abre en un modal DENTRO de la app (no un navegador)
    await w.waitForFunction(() => document.querySelector('[data-ev-miniatura="1"] img'), null, { timeout: 8000 });
    ok(await w.locator('[data-ev-miniatura="1"]').isVisible(), 'cada documento tiene su vista previa a la izquierda');
    await w.mouse.move(5, 5); await w.locator('[data-ev-miniatura="1"]').hover(); await w.waitForSelector('[data-ev-ampliada]', { timeout: 4000 });
    ok(true, 'al pasar el mouse por la vista previa se agranda');
    await w.mouse.move(5, 5); await w.waitForFunction(() => !document.querySelector('[data-ev-ampliada]'));
    const antes = (await app.windows()).length;
    await w.locator('[data-ev-miniatura="1"]').click(); await w.waitForSelector('#evVisor', { timeout: 6000 });
    ok((await app.windows()).length === antes && await w.locator('#evVisor img').count() === 1, 'al hacer clic se abre el documento en un modal dentro de la app (no sale a un navegador)');
    ok(/Liquidación de octubre 2026/.test(await w.locator('[data-ev-visor-resumen]').innerText()), 'y el modal muestra también lo que Asset leyó');
    await w.locator('#evVisorCerrar').click(); await w.waitForFunction(() => !document.querySelector('#evVisor'));
    ok(await w.locator('[data-ev-archivo-fila="1"]').isVisible(), 'al cerrarlo se vuelve a la evaluación');
    // el resumen largo se recorta al alto de la vista previa y «…ver más» abre el modal
    await app.evaluate(() => { const ev = Object.values(global.__pfEval)[0]; ev.personas[0].archivos[0].resumen = 'Liquidación de sueldo muy detallada. '.repeat(30); });
    await w.locator('#evActualizar').click(); await w.waitForSelector('[data-ev-vermas="1"]', { timeout: 8000 });
    await w.locator('[data-ev-vermas="1"]').click(); await w.waitForSelector('#evVisor', { timeout: 6000 });
    ok(true, 'un resumen largo se recorta y «…ver más» abre el modal'); await w.locator('#evVisorCerrar').click();
    // Actualizar a la vista y decisión por persona
    ok(await w.locator('#evActualizar').isVisible(), 'el botón Actualizar está a la vista');
    ok(await w.locator('[data-ev-aprobar]').count() === 1 && await w.locator('[data-ev-rechazar]').count() === 1, 'cada persona tiene sus botones Rechazar y Aprobar');
    await w.locator('[data-ev-aprobar]').click(); await w.waitForFunction(() => /Aprobado por/.test(document.querySelector('[data-ev-decision]')?.textContent || ''), null, { timeout: 8000 });
    ok((await pf('evVer', neg.id)).decision?.estado === 'aprobada', 'con todas las personas aprobadas, la evaluación queda aprobada');
    ok(!errs.length, 'sin errores en la ventana' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('evaluacion-modal-e2e: OK');
  } finally { await app.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
