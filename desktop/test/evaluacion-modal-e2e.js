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
    await w.locator('[data-ev-dest="arrendatario"] input').uncheck();
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
    ok(await w.locator(`[data-ev-dest="${per.id}"] input`).isChecked(), 'y queda seleccionado');
    ok(/Enviar solicitud por WhatsApp \(1 persona\)/.test(await w.locator('#evSolicitar').innerText()) && await w.locator('#evSolicitar').isEnabled(), 'el botón dice a cuántas personas se envía');
    await w.locator('[data-ev-dest="arrendatario"] input').check();
    ok(/\(2 personas\)/.test(await w.locator('#evSolicitar').innerText()), 'arrendatario y aval juntos: 2 personas');
    ok(!errs.length, 'sin errores en la ventana' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('evaluacion-modal-e2e: OK');
  } finally { await app.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
