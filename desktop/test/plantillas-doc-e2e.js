// Configuración › Plantillas (PF_MOCK: una plantilla simulada en memoria, src/plantillas-mock.js): la lista con su estado,
// el detalle con sus cláusulas, editar e insertar un dato, «Probar», guardar versión, aprobar, historial y volver a la base,
// y la confirmación al salir con cambios sin guardar. Requiere el bundle compilado: yarn build:ui
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const raiz = path.join(__dirname, '..');
  if (!fs.existsSync(path.join(raiz, 'src/renderer/react/react-ui.js'))) throw new Error('Falta el bundle: corre «yarn build:ui» antes');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-pl-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${path.join(tmp, 'ud')}`], cwd: raiz, env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: path.join(tmp, 'inmo') } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const txt = (s) => w.innerText(s).then((t) => (t || '').replace(/\s+/g, ' '));
  const clave = () => w.getAttribute('#modalCard', 'data-clave');
  try {
    await w.setViewportSize({ width: 1500, height: 950 });
    await w.waitForFunction(() => window.ReactUI && window.Inmo, null, { timeout: 15000 }); await w.waitForTimeout(500);
    await w.click('#userBtn'); await w.click('[data-um="config"]'); await w.waitForSelector('#view-integraciones:not(.hidden) #cfgTabs');
    await w.click('#cfgTabs [data-t="plantillas"]'); await w.waitForSelector('#cfgPlantillas [data-plantilla="orden-visita"]');
    ok(/Orden de visita/.test(await txt('#cfgPlantillas')) && /Sin aprobar/.test(await txt('#cfgPlantillas')), 'la lista muestra la plantilla «Sin aprobar»');

    await w.click('[data-plantilla="orden-visita"]'); await w.waitForSelector('#plDetalle [data-clausula="objeto"]');
    ok((await w.$$('#plDetalle [data-clausula]')).length === 3, 'el detalle lista las 3 cláusulas');
    await w.waitForSelector('#plVista canvas', { timeout: 15000 });
    ok(true, 'la vista previa (versión guardada) se dibuja');
    await w.click('[data-clausula="comparecencia"]');
    ok(/se arma con los datos del documento/.test(await txt('#plSoloLectura')), 'la comparecencia es de solo lectura, con su nota');

    // el editor enriquecido: nunca muestra el formato guardado
    const codigos = /\{\{|\}\}|\*\*|__|^# /m;
    await w.click('[data-clausula="objeto"]'); await w.waitForSelector('#plTexto .ProseMirror');
    const vista = await txt('[data-clausula="objeto"]');
    ok(!codigos.test(vista), 'el editor no muestra códigos («{{», «**», «__», «# »)');
    ok(await w.inputValue('#plTitulo') === 'Objeto' && /Primero ·/.test(vista), 'el título va en su campo, con la numeración fija en cursiva');
    ok(!!(await w.$('#plTexto [data-dato="visitante.nombre"]')) && /Nombre del visitante/.test(await txt('#plTexto')), 'los datos se ven como fichas con su nombre legible');
    ok(!!(await w.$('#plTexto strong [data-dato="propiedad.direccion"]')), 'la negrita sobre un dato se ve en negrita');
    ok(/si hay RUT de la corredora: “, RUT ‹RUT de la corredora›”/.test(await txt('#plTexto [data-cond="corredora.rut"]')), 'el condicional dentro del párrafo se ve como ficha legible');
    ok(/Solo aparece si hay: RUT de la corredora/.test(await txt('#plTexto [data-condicional="corredora.rut"]')) && !!(await w.$('#plTexto [data-condicional] li')), 'el condicional de bloque se ve con su etiqueta y su lista adentro');
    ok(!/Sin guardar/.test(await txt('[data-clausula="objeto"]')), 'abrir el editor no cambia el texto (ida y vuelta idéntica)');
    await w.screenshot({ path: path.resolve(__dirname, 'pd3-editor.png') });

    await w.click('[data-clausula="comision"]'); await w.waitForSelector('#plTexto .ProseMirror');
    await w.fill('#plTitulo', 'Comisión corta');
    await w.click('#plTexto .ProseMirror'); await w.keyboard.press('Control+A'); await w.keyboard.press('Backspace');
    await w.keyboard.type('Pagará la comisión ');
    await w.keyboard.press('Control+B'); await w.keyboard.type('a tiempo'); await w.keyboard.press('Control+B');
    await w.keyboard.type(' a ');
    await w.click('#plInsertar'); await w.waitForSelector('#plInsertarBuscar');
    ok(!codigos.test(await txt('[role="dialog"][aria-label="Insertar un dato"]')), 'el menú «Insertar dato» muestra nombres legibles, sin códigos');
    await w.screenshot({ path: path.resolve(__dirname, 'pd4-insertar-dato.png') });
    await w.fill('#plInsertarBuscar', 'nombre de la corre');
    await w.click('[data-dato-opcion="corredora.nombre"]'); await w.waitForTimeout(150);
    await w.keyboard.type('.');
    ok(!!(await w.$('#plTexto [data-dato="corredora.nombre"]')), 'insertar un dato lo pone como ficha en el cursor');
    ok(/a tiempo/.test(await txt('#plTexto strong')), 'Ctrl+B pone negrita');
    ok(/Sin guardar/.test(await txt('[data-clausula="comision"]')), 'la cláusula queda marcada «Sin guardar»');
    await w.click('#plVerBase'); await w.waitForSelector('#plBase .ProseMirror');
    ok(/50% de un mes/.test(await txt('#plBase')) && !codigos.test(await txt('#plBase')) && !!(await w.$('#plBase [data-dato="corredora.nombre"]')),
      '«Ver la base» muestra el texto común con el mismo editor, sin códigos');
    ok(await w.getAttribute('#plBase .ProseMirror', 'contenteditable') === 'false', 'la base es de solo lectura');

    await w.click('#plProbar'); await w.waitForSelector('#plVista[data-prueba] canvas', { timeout: 15000 });
    ok(true, '«Probar» arma la vista previa con los cambios sin guardar');
    await w.screenshot({ path: path.resolve(__dirname, 'pd2-detalle.png') });

    await w.click('#plGuardar'); await w.waitForSelector('#plNota'); ok(await clave() === 'modal-141', 'Guardar versión: ventana modal-141');
    await w.fill('#plNota', 'Comisión más corta'); await w.click('#modalCard #mOk');
    await w.waitForSelector('#plAprobar'); ok(/versión 1/.test(await txt('#plDetalle')) && /Propia/.test(await txt('[data-clausula="comision"]')), 'guarda la versión 1 con la cláusula propia');
    const guardado = await w.evaluate(() => window.pf.plDetalle('orden-visita')).then((r) => (r.data || r).bloques.find((b) => b.clave === 'comision').texto);
    ok(guardado === '# Comisión corta\n\nPagará la comisión **a tiempo** a {{corredora.nombre}}.', 'lo que se guarda va en el formato de siempre: ' + JSON.stringify(guardado));

    await w.click('#plAprobar'); await w.waitForSelector('#plRevisor'); ok(await clave() === 'modal-142', 'Aprobar: ventana modal-142');
    await w.click('#modalCard #mOk'); ok(/quién revisó/.test(await txt('#modalCard')), '«Revisado por» es obligatorio');
    await w.fill('#plRevisor', 'Ana Abogada'); await w.click('#modalCard #mOk');
    await w.waitForFunction(() => /Aprobada por Ana Abogada/.test(document.querySelector('#plDetalle').innerText));
    ok(true, 'queda «Aprobada por Ana Abogada»');

    await w.click('#plMas'); await w.click('#plHistorialBtn'); await w.waitForSelector('#plHistorial'); ok(await clave() === 'modal-143', 'Historial: ventana modal-143');
    ok(/Comisión más corta/.test(await txt('#plHistorial')), 'el historial muestra la nota de la versión');
    await w.click('#plHistorial [data-restaurar="0"]'); await w.waitForFunction(() => document.querySelector('#modalCard')?.dataset.clave === 'modal-145');
    await w.click('#modalCard #mOk'); await w.waitForFunction(() => /versión 2/.test(document.querySelector('#plDetalle').innerText));
    ok(/Sin aprobar/.test(await txt('#plDetalle')) && !/Propia/.test(await txt('#plDetalle [role="list"]')), 'volver a la base crea la versión 2, sin aprobar ni cláusulas propias');

    // un dato inexistente ya no se puede insertar desde el editor; si igual llega uno (pegado como texto), la API lo rechaza
    await w.click('[data-clausula="objeto"]'); await w.waitForSelector('#plTexto .ProseMirror');
    await w.click('#plTexto .ProseMirror'); await w.keyboard.press('Control+End'); await w.keyboard.press('Enter'); await w.keyboard.type('Otro texto {{dato.inventado}}');
    await w.click('#plGuardar'); await w.waitForSelector('#plNota'); await w.click('#modalCard #mOk'); await w.waitForTimeout(400);
    ok(!!(await w.$('#plGuardar')), 'un dato que no existe no se guarda (sigue con cambios)');
    await w.click('#plBack'); await w.waitForFunction(() => document.querySelector('#modalCard')?.dataset.clave === 'modal-146');
    ok(true, 'salir con cambios sin guardar pide confirmar (modal-146)');
    await w.click('#modalCard #mOk'); await w.waitForSelector('#cfgPlantillas');
    ok(/versión 2/.test(await txt('#cfgPlantillas')), 'vuelve a la lista, actualizada');
    await w.screenshot({ path: path.resolve(__dirname, 'pd1-lista.png') });
    ok(!errs.length, 'sin errores en la página' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('\nPLANTILLAS OK');
  } catch (e) {
    console.error(e.message); await w.screenshot({ path: path.resolve(__dirname, 'pd-error.png') }).catch(() => {}); process.exitCode = 1;
  } finally { await app.close(); }
})();
