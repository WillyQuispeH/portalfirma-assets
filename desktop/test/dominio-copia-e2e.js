// «Leer desde la copia de dominio» (modal-150) y el aviso «Falta la inscripción de dominio» en la carta oferta de venta y en el
// contrato de arriendo (AvisoDominio.tsx). Con el servidor simulado (PF_MOCK): la lectura de la IA devuelve una propuesta fija
// (main.js › prop:leerDominio) y el PDF es mínimo. Requiere el bundle compilado: yarn build:ui
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };

(async () => {
  const raiz = path.join(__dirname, '..');
  if (!fs.existsSync(path.join(raiz, 'src/renderer/react/react-ui.js'))) throw new Error('Falta el bundle: corre «yarn build:ui» antes');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-dominio-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${path.join(tmp, 'ud')}`], cwd: raiz, env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: path.join(tmp, 'inmo'), PF_NO_TOURS: '1' } });
  const w = await app.firstWindow(); const errs = [];
  w.on('pageerror', (e) => errs.push(e.message)); w.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
  const txt = (s) => w.innerText(s).then((t) => (t || '').replace(/\s+/g, ' '));
  const shot = (n) => w.screenshot({ path: path.resolve(__dirname, n) });
  const propDe = async (id) => (await call('inmoListar')).propiedades.find((p) => p.id === id);
  const copia = path.join(tmp, 'copia-dominio.pdf'); fs.writeFileSync(copia, '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
  try {
    await w.setViewportSize({ width: 1480, height: 980 });
    await w.waitForFunction(() => window.Inmo && window.ReactUI && window.FichaBloques && window.Ventanas, null, { timeout: 15000 }); await w.waitForTimeout(500);

    const rosa = await call('inmoPerGuardar', { nombre: 'Rosa Pérez Mena', rut: '11.111.111-1', email: 'rosa@correo.cl', telefono: '+56988887777', roles: ['propietario'] });
    const pedro = await call('inmoPerGuardar', { nombre: 'Pedro Soto Vera', rut: '9.999.999-3', email: 'pedro@correo.cl', roles: ['propietario'] });
    const p = await call('inmoPropGuardar', { titulo: 'Casa La Reina', tipo: 'casa', venta: true, precioVenta: { valor: 12500, moneda: 'UF' }, direccion: 'Larraín 6000', comuna: 'La Reina', ficha: { cuentaPago: 'Cta. cte. 123 Banco Estado', numeroInscripcion: '111' } });
    await call('inmoVincular', p.id, rosa.id, 'propietario');
    await call('inmoDocAgregar', p.id, [copia], 'Copia de dominio');

    // ---- A · en la ficha completa, bloque «Legal» ----
    await w.evaluate((id) => window.Inmo.abrirFicha(id), p.id); await w.waitForSelector('#view-cartera .im-ficha #fBack');
    await w.evaluate((id) => window.FichaBloques.abrir(id, { bloque: 'legal' }), p.id); await w.waitForSelector('#fbDominio');
    ok(/Leer desde la copia de dominio/.test(await txt('#fbDominio')), 'el bloque Legal ofrece «Leer desde la copia de dominio»');
    await w.click('#fbTabs [data-t="esencial"]'); await w.waitForTimeout(300);
    ok(!(await w.locator('#fbDominio').count()), 'en los otros bloques no aparece');
    await w.click('#fbTabs [data-t="legal"]'); await w.waitForSelector('#fbDominio');

    await w.click('#fbLeerDominio'); await w.waitForSelector('#dcLista');
    ok(await w.evaluate(() => document.querySelector('#modalCard').dataset.clave) === 'modal-150', 'la ventana lleva la clave modal-150');
    ok(await w.locator('#dcLista input[type=radio]').count() === 1 && await w.isChecked('#dcLista input[type=radio]'), 'lista la copia de dominio que ya está entre los documentos, elegida');
    await w.click('#mCancel'); await w.waitForSelector('#fbDominio');
    ok(/Ficha de/.test(await txt('#modalCard h2')) && (await propDe(p.id)).ficha.fojas == null, 'cancelar vuelve a la ficha (bloque Legal) sin guardar nada');

    await w.click('#fbLeerDominio'); await w.waitForSelector('#dcLeer'); await w.click('#dcLeer');
    await w.waitForSelector('#dcAlertas', { timeout: 15000 });
    ok(/Hipoteca a favor del Banco Estado/.test(await txt('#dcAlertas')) && /Prohibición de enajenar/.test(await txt('#dcAlertas')), 'muestra las alertas (hipoteca, prohibición) bien visibles');
    ok(/no es reciente/.test(await txt('#dcAviso')), 'avisa que la copia no es reciente (emitida hace 45 días)');
    ok(await w.getAttribute('#dcDueno', 'data-estado') === 'igual', 'el dueño inscrito (ROSA PEREZ MENA) coincide con el de la ficha, sin tildes ni mayúsculas');
    ok(await w.inputValue('#dcFojas') === '45678 vta' && await w.inputValue('#dcNumero') === '23456' && await w.inputValue('#dcAnio') === '2015' && await w.inputValue('#dcConservador') === 'Santiago', 'los campos vienen con lo leído');
    ok(/En la ficha: 111/.test(await txt('#modalCard')), 'el número que ya tenía la ficha se muestra como referencia');
    ok(await w.inputValue('#dcRol') === '1234-56', 'la propiedad no tiene rol: el rol leído se ofrece');
    ok(!!(await w.$('#mCancel')) && !!(await w.$('#mOk')) && await w.locator('#modalCard footer button').count() === 2, 'dos botones en una fila: «Cancelar» y «Guardar en la ficha»');
    await shot('dominio1-confirmar.png');
    ok((await propDe(p.id)).ficha.fojas == null, 'leer no guarda nada todavía');
    await w.fill('#dcNumero', '99999'); await w.click('#mOk');
    await w.waitForSelector('#fbDominio', { timeout: 15000 });
    ok(await w.inputValue('#fb_fojas') === '45678 vta' && await w.inputValue('#fb_numeroInscripcion') === '99999' && await w.inputValue('#fb_anioInscripcion') === '2015' && await w.inputValue('#fb_conservador') === 'Santiago', 'al guardar, el bloque Legal muestra lo confirmado (con el número corregido)');
    const g = await propDe(p.id);
    ok(g.ficha.fojas === '45678 vta' && g.ficha.numeroInscripcion === '99999' && g.ficha.cuentaPago === 'Cta. cte. 123 Banco Estado' && g.rol === '1234-56', 'se guardó en la ficha sin pisar otros campos (la cuenta de pago sigue) y con el rol');
    await w.click('#fbCerrar');

    // ---- subir un archivo nuevo desde el selector del sistema (se sube como «Copia de dominio») + dueño que no coincide ----
    const p2 = await call('inmoPropGuardar', { titulo: 'Depto Providencia', tipo: 'departamento', venta: true, direccion: 'Pocuro 1500', comuna: 'Providencia', rol: '77-8' });
    await call('inmoVincular', p2.id, pedro.id, 'propietario');
    await app.evaluate(({ dialog }, f) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f] }); }, copia);
    await w.evaluate((id) => window.FichaBloques.abrir(id, { bloque: 'legal' }), p2.id); await w.waitForSelector('#fbLeerDominio'); await w.click('#fbLeerDominio');
    await w.waitForSelector('#dcSubir'); ok(await w.locator('#dcLista').count() === 0 && /Elegir un PDF o una foto/.test(await txt('#dcSubir')), 'sin documentos, ofrece elegir un PDF o una foto');
    await w.click('#dcSubir'); await w.waitForSelector('#dcAlertas', { timeout: 15000 });
    const docs = (await propDe(p2.id)).documentos; ok(docs.length === 1 && docs[0].tipo === 'Copia de dominio', 'el archivo elegido quedó como documento tipo «Copia de dominio» y se leyó de inmediato');
    ok(await w.getAttribute('#dcDueno', 'data-estado') === 'distinto' && /Ojo: el dueño inscrito es ROSA PEREZ MENA.*en la ficha figura Pedro Soto Vera/.test(await txt('#dcDueno')), 'avisa si el dueño inscrito no coincide: «Ojo: el dueño inscrito es X, en la ficha figura Y»');
    ok(!(await w.locator('#dcRol').count()) && /rol de la copia \(1234-56\) es distinto/.test(await txt('#dcAviso')), 'si la propiedad ya tiene rol, no se pide y se avisa la diferencia');
    await w.click('#mCancel'); await w.waitForSelector('#fbDominio'); await w.click('#fbCerrar');

    // ---- B · aviso en la carta oferta de venta ----
    const comp = await call('inmoPerGuardar', { nombre: 'Andrés Soto', rut: '12.345.678-5', email: 'andres@correo.cl', telefono: '+56 9 1111 2222', roles: ['comprador'] });
    const p3 = await call('inmoPropGuardar', { titulo: 'Casa Ñuñoa', tipo: 'casa', venta: true, precioVenta: { valor: 9000, moneda: 'UF' }, direccion: 'Irarrázaval 3000', comuna: 'Ñuñoa', rol: '55-1' });
    await call('inmoVincular', p3.id, rosa.id, 'propietario'); await call('inmoDocAgregar', p3.id, [copia], 'Copia de dominio');
    const nv = await call('negGuardar', { tipo: 'venta', propId: p3.id, clienteId: comp.id, valor: { valor: 9000, moneda: 'UF' } });
    const paso = { negocioId: nv.id, propId: p3.id, id: 'carta', pasoId: 'carta', tipo: 'firma', etapaFirma: 'reserva', t: 'Carta oferta', paso: 'Carta oferta', accion: 'Enviar carta oferta a firmar' };
    await w.evaluate((x) => window.Etapas.accion(x, () => {}), paso); await w.waitForSelector('#pasoEnviar'); await w.click('#pasoEnviar'); await w.waitForSelector('#coNombre', { timeout: 15000 });
    await w.waitForSelector('#avDominio'); ok(/Falta la inscripción de dominio de la propiedad: sin ella el documento dice “en el Conservador de Bienes Raíces respectivo”/.test(await txt('#avDominio')), 'la carta oferta de venta avisa «Falta la inscripción de dominio…»');
    ok(!!(await w.$('#avCompletar')) && !!(await w.$('#avLeer')), 'con «Completar» y «Leer desde la copia de dominio»');
    await w.locator('#avDominio').scrollIntoViewIfNeeded(); await w.waitForTimeout(400); await shot('dominio2-aviso-carta.png');
    await w.click('#avCompletar'); await w.fill('#avFojas', '777'); await w.fill('#avNumero', '888'); await w.fill('#avAnio', '2018'); await w.fill('#avConservador', 'Ñuñoa'); await w.click('#avGuardar');
    await w.waitForFunction(() => !document.querySelector('#avDominio'), null, { timeout: 15000 });
    const g3 = await propDe(p3.id); ok(g3.ficha.fojas === '777' && g3.ficha.numeroInscripcion === '888' && g3.ficha.anioInscripcion === '2018' && g3.ficha.conservador === 'Ñuñoa', 'completar guarda la inscripción en la ficha de la propiedad y el aviso desaparece');
    await w.evaluate(() => window.closeModal());
    // con la inscripción completa, no hay aviso
    await w.evaluate((x) => window.Etapas.accion(x, () => {}), paso); await w.waitForSelector('#pasoEnviar'); await w.click('#pasoEnviar'); await w.waitForSelector('#coNombre', { timeout: 15000 });
    ok(!(await w.locator('#avDominio').count()), 'con la inscripción completa en la ficha, la carta no avisa'); await w.evaluate(() => window.closeModal());

    // «Leer desde la copia de dominio» desde la carta: reemplaza la ventana y, al guardar, la vuelve a abrir
    const p4 = await call('inmoPropGuardar', { titulo: 'Casa Macul', tipo: 'casa', venta: true, precioVenta: { valor: 8000, moneda: 'UF' }, direccion: 'Quilín 100', comuna: 'Macul', rol: '66-2' });
    await call('inmoVincular', p4.id, rosa.id, 'propietario'); await call('inmoDocAgregar', p4.id, [copia], 'Copia de dominio');
    const nv4 = await call('negGuardar', { tipo: 'venta', propId: p4.id, clienteId: comp.id, valor: { valor: 8000, moneda: 'UF' } });
    await w.evaluate((x) => window.Etapas.accion(x, () => {}), { ...paso, negocioId: nv4.id, propId: p4.id }); await w.waitForSelector('#pasoEnviar'); await w.click('#pasoEnviar'); await w.waitForSelector('#avLeer', { timeout: 15000 });
    await w.click('#avLeer'); await w.waitForSelector('#dcLeer'); await w.click('#dcLeer'); await w.waitForSelector('#dcAlertas', { timeout: 15000 }); await w.click('#mOk');
    await w.waitForSelector('#coNombre', { timeout: 15000 });
    ok(!(await w.locator('#avDominio').count()), 'al guardar desde la copia, la carta se vuelve a abrir y ya no avisa');
    const g4 = await propDe(p4.id); ok(g4.ficha.fojas === '45678 vta' && g4.ficha.numeroInscripcion === '23456', 'la inscripción leída quedó en la ficha de la propiedad'); await w.evaluate(() => window.closeModal());

    // ---- B · contrato de arriendo: dominio y cuenta de pago ----
    const arr = await call('inmoPerGuardar', { nombre: 'Matías Serrano', rut: '12.345.679-3', email: 'matias@correo.cl', telefono: '', roles: ['arrendatario'] });
    const p5 = await call('inmoPropGuardar', { titulo: 'Depto Ñuñoa', tipo: 'departamento', arriendo: true, precioArriendo: { valor: 650000, moneda: 'CLP' }, direccion: 'Pedro de Valdivia 10', comuna: 'Ñuñoa', rol: '10-1' });
    await call('inmoVincular', p5.id, rosa.id, 'propietario'); await call('inmoDocAgregar', p5.id, [copia], 'Copia de dominio');
    const na = await call('negGuardar', { tipo: 'arriendo', propId: p5.id, clienteId: arr.id, valor: { valor: 650000, moneda: 'CLP' } });
    await w.evaluate((id) => window.Etapas.armarContrato(id, () => {}), na.id); await w.waitForSelector('#caInicio', { timeout: 15000 });
    await w.waitForSelector('#avDominio'); await w.waitForSelector('#avCuenta');
    ok(/Falta la cuenta de pago: el contrato dirá que el Arrendador la indicará/.test(await txt('#avCuenta')) && !!(await w.$('#avCuentaCompletar')), 'el contrato avisa «Falta la cuenta de pago…» con «Completar»');
    ok(/Falta la inscripción de dominio/.test(await txt('#avDominio')), 'y «Falta la inscripción de dominio…»');
    await w.locator('#avCuenta').scrollIntoViewIfNeeded(); await w.waitForTimeout(400); await shot('dominio3-aviso-contrato.png');
    await w.click('#avCuentaCompletar'); await w.fill('#avCuentaInput', 'Cuenta corriente 00-123-45678-90, Banco de Chile'); await w.click('#avCuentaGuardar');
    await w.waitForFunction(() => !document.querySelector('#avCuenta'), null, { timeout: 15000 });
    ok((await propDe(p5.id)).ficha.cuentaPago === 'Cuenta corriente 00-123-45678-90, Banco de Chile' && await w.inputValue('#caCuenta') === 'Cuenta corriente 00-123-45678-90, Banco de Chile', 'la cuenta queda en la ficha y en el campo «Cuenta» del contrato');
    await w.click('#avLeer'); await w.waitForSelector('#dcLeer'); await w.click('#dcLeer'); await w.waitForSelector('#dcAlertas', { timeout: 15000 });
    ok(true, 'desde el contrato se abre la lectura de la copia de dominio');
    await w.click('#mCancel'); await w.waitForSelector('#caInicio', { timeout: 15000 });
    ok(!(await w.locator('#avCuenta').count()) && await w.locator('#avDominio').count() === 1, 'cancelar vuelve al contrato (ya con la cuenta y todavía sin dominio)');
    await w.evaluate(() => window.closeModal());

    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK dominio desde la copia');
  } catch (er) { console.error(er.message); await shot('dominio-error.png').catch(() => {}); process.exitCode = 1; }
  await app.close();
})();
