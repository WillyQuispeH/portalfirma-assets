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

    await w.click('[data-clausula="comision"]'); await w.waitForSelector('#plTexto');
    await w.fill('#plTexto', '# Segundo: comisión\n\nPagará la comisión a ');
    await w.evaluate(() => { const t = document.querySelector('#plTexto'); t.focus(); t.setSelectionRange(t.value.length, t.value.length); });
    await w.selectOption('#plInsertar', 'corredora.nombre'); await w.waitForTimeout(150);
    ok(/a \{\{corredora\.nombre\}\}$/.test(await w.inputValue('#plTexto')), 'insertar un dato lo pone en el cursor');
    ok(/Sin guardar/.test(await txt('[data-clausula="comision"]')), 'la cláusula queda marcada «Sin guardar»');
    await w.click('#plVerBase'); ok(/50% de un mes/.test(await txt('#plBase')), '«Ver la base» muestra el texto común');

    await w.click('#plProbar'); await w.waitForSelector('#plVista[data-prueba] canvas', { timeout: 15000 });
    ok(true, '«Probar» arma la vista previa con los cambios sin guardar');
    await w.screenshot({ path: path.resolve(__dirname, 'pd2-detalle.png') });

    await w.click('#plGuardar'); await w.waitForSelector('#plNota'); ok(await clave() === 'modal-141', 'Guardar versión: ventana modal-141');
    await w.fill('#plNota', 'Comisión más corta'); await w.click('#modalCard #mOk');
    await w.waitForSelector('#plAprobar'); ok(/versión 1/.test(await txt('#plDetalle')) && /Propia/.test(await txt('[data-clausula="comision"]')), 'guarda la versión 1 con la cláusula propia');

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

    await w.click('[data-clausula="objeto"]'); await w.fill('#plTexto', '# Primero\n\nOtro texto {{dato.inventado}}');
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
