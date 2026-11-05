// Enviar a firmar, Google Drive y Firmas presenciales en React (modo de prueba).
//  · Enviar a firmar: soltar → analizando → revisar (firmantes, validación, pago) → confirmar → enviado con enlaces.
//  · Formularios en ventana: los de React y los antiguos comparten #modal sin pisarse.
//  · Google Drive: conectar, explorar, buscar, entrar a una carpeta, marcar y la cuenta.
//  · Firmas presenciales: tres trámites, escritura desde Word, protocolización con notaría y pago.
// Requiere el bundle compilado (yarn build:ui o yarn dev).
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
const FX = path.join(__dirname, 'fixtures');
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-firmar-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${path.join(tmp, 'ud')}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: path.join(tmp, 'inmo'), PF_SAVE_DIR: tmp } });
  const w = await app.firstWindow(); const errs = [];
  w.on('pageerror', (e) => errs.push('PAGE: ' + e.message)); w.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await w.setViewportSize({ width: 1500, height: 920 });
  await w.waitForFunction(() => window.studio && window.Inmo && window.__envio && window.__escrituras, null, { timeout: 20000 }); await w.waitForTimeout(400);
  const txt = (s) => w.textContent(s).then((t) => t || '');
  try {
    // ===== Enviar a firmar
    await w.evaluate(() => window.show('drop')); await w.waitForSelector('#dropzone:visible');
    ok(await w.isVisible('#pickBtn') && await w.isVisible('#pickDrive') && (await w.$$('#pickDrive svg')).length === 1, 'soltar: elegir archivo y Google Drive (con su ícono)');
    await w.evaluate((f) => startAnalysis({ name: 'contrato_prueba.pdf', size: 2000, path: f }), path.join(FX, 'contrato_prueba.pdf'));
    await w.waitForSelector('#view-review:visible', { timeout: 20000 });
    const nFirm = await w.$$eval('#signers .signer', (x) => x.length);
    ok(nFirm >= 1 && /contrato_prueba/.test(await txt('#fileChip')), `revisar: documento y ${nFirm} firmante(s) detectados`);
    await w.click('#sendBtn'); await w.waitForTimeout(200);
    ok(/Revisa los datos del firmante|correo del pagador/.test(await txt('#reviewError')), 'no deja enviar con datos incompletos: ' + await txt('#reviewError'));
    for (let i = 0; i < nFirm; i++) {
      for (const [k, v] of [['fullName', `Persona ${i + 1}`], ['rut', ['11.111.111-1', '22.222.222-2', '33.333.333-3'][i % 3]], ['alias', ['arrendador', 'arrendatario', 'aval'][i % 3]], ['email', `p${i}@correo.cl`], ['phone', '912345678']]) {
        const s = `input[data-i="${i}"][data-k="${k}"]`; if (!(await w.inputValue(s))) await w.fill(s, v); else if (k === 'rut' || k === 'alias') await w.fill(s, v);
        await w.locator(s).blur();
      }
    }
    ok(/\+56912345678/.test(await w.inputValue('input[data-i="0"][data-k="phone"]')), 'al salir del campo, el teléfono queda con su código');
    await w.click('#addSigner'); ok((await w.$$('#signers .signer')).length === nFirm + 1, 'agregar firmante');
    await w.click(`button[data-act="del"][data-i="${nFirm}"]`); ok((await w.$$('#signers .signer')).length === nFirm, 'quitar firmante');
    if (await w.isVisible('#typeSignAll')) await w.selectOption('#typeSignAll', 'simple');
    await w.fill('#payerEmail', 'pagos@correo.cl');
    await w.click('#sendBtn'); await w.waitForSelector('#modal:not(.hidden) #mOk');
    ok(/Confirmar envío/.test(await txt('#modalCard')) && /pagos@correo.cl/.test(await txt('#modalCard')), 'confirmación del envío (React en el modal de la app)');
    await w.click('#mOk'); await w.waitForSelector('#view-done:visible', { timeout: 20000 });
    ok((await txt('#doneOp')).trim().length > 0, 'enviado: operación ' + (await txt('#doneOp')).trim());
    await w.waitForFunction(() => !/Cargando/.test(document.querySelector('#doneDetail')?.textContent || ''), null, { timeout: 15000 });
    ok(/Operación|\{/.test(await txt('#doneDetail')), 'enviado: el detalle de la operación (enlaces de firma)');
    await w.click('#newDocBtn'); ok(await w.isVisible('#dropzone'), 'enviar otro documento vuelve a soltar');
    await w.evaluate(() => window.modal('<p id="viejo">antiguo</p><button id="mCancel" onclick="closeModal()">x</button>'));
    ok(await w.isVisible('#viejo'), 'un formulario antiguo usa el modal después de uno de React');
    await w.evaluate(() => window.closeModal());

    // ===== Google Drive
    await w.evaluate(() => window.Drive.open({ purpose: 'sign' }));
    await w.waitForSelector('#modal:not(.hidden) #mOk:has-text("Conectar")');
    ok(/nunca modifica/.test(await txt('#modalCard')), 'Drive: explica el permiso antes de conectar');
    await w.click('#mOk'); await w.waitForSelector('.drv-item', { timeout: 20000 });
    const nDrv = await w.locator('.drv-item').count(); ok(nDrv >= 2, `Drive: lista carpetas y documentos (${nDrv})`);
    const conCarpeta = await w.$('.drv-item[data-dir]');
    if (conCarpeta) { await conCarpeta.click(); await w.waitForTimeout(500); ok((await w.$$('.drv-crumbs [data-crumb]')).length === 2, 'Drive: entra a una carpeta (ruta)'); await w.click('[data-crumb="0"]'); await w.waitForTimeout(500); }
    await w.click('.drv-item:not([data-dir]) >> nth=0'); ok(/1 documento/.test(await txt('#drvCount')) && !(await w.$eval('[data-do="sign"]', (b) => b.disabled)), 'Drive: marcar un documento habilita las acciones');
    await w.fill('#drvQ', 'zzzz-nada'); await w.press('#drvQ', 'Enter'); await w.waitForTimeout(500);
    ok(/No hay documentos que coincidan|Resultados/.test(await txt('.drv')), 'Drive: búsqueda');
    await w.click('#mCancel'); ok(await w.isHidden('#modal'), 'Drive: cerrar');
    await w.evaluate(() => window.Drive.cuenta()); await w.waitForSelector('#drvCambiar');
    ok(/Cuenta de Google Drive/.test(await txt('#modalCard')), 'Drive: la cuenta conectada');
    await w.click('#mCancel');

    // ===== Firmas presenciales
    await w.evaluate(() => window.Escrituras.open()); await w.waitForSelector('.es-layout');
    ok((await w.$$('.es-card')).length === 3 && /Gestión de firmas presenciales/.test(await txt('#view-escrituras .ops-head h2')), 'firmas presenciales: lista + detalle y tres trámites');
    await w.click('[data-tr="escritura"]'); await w.waitForSelector('#esPick');
    await w.evaluate((p) => window.Escrituras.dropFiles([p]), path.join(FX, 'contrato_prueba.pdf')); await w.waitForTimeout(600);
    ok(/minuta en Word/.test(await txt('#toast')), 'escritura: un PDF se rechaza');
    await w.evaluate((p) => window.Escrituras.dropFiles([p]), path.join(FX, 'contrato.docx'));
    await w.waitForFunction(() => document.querySelector('.es-work') || /vacío/.test(document.querySelector('#toast')?.textContent || ''), null, { timeout: 30000 });
    if (await w.$('.es-work')) {
      await w.waitForSelector('#esVn .es-page', { timeout: 30000 });
      ok(/Revisión/.test(await txt('.es-track')) && await w.$('#esMat'), 'escritura: revisión, materia y la versión para la notaría');
      await w.click('[data-v="ambos"]'); await w.waitForSelector('#esVo .es-page', { timeout: 30000 }); ok(true, 'lado a lado');
      await w.click('#esEdit'); await w.waitForSelector('#eTit'); await w.fill('#eTit', 'TÍTULO DE PRUEBA'); await w.click('#tOk'); await w.waitForTimeout(400);
      ok(/TÍTULO DE PRUEBA/.test(await txt('.es-dh h3')), 'modificar el texto y el título');
      await w.click('#esPrim'); await w.waitForTimeout(200); ok(/Falta/.test(await txt('#toast')), 'no deja pagar sin la notaría ni los contactos');
      await w.click('#esDocx'); await w.waitForTimeout(1500); ok(fs.readdirSync(tmp).some((f) => f.endsWith('.docx')), 'descargar Word');
      await w.click('#esNuevo'); await w.waitForSelector('#nSi'); await w.click('#nSi'); await w.waitForSelector('[data-tr="protocolizacion"]'); ok(true, 'descartar el trámite en preparación');
    } else { console.log('  (contrato.docx no sirve como minuta:', await txt('#toast'), ')'); await w.click('#esNuevo'); }
    await w.click('[data-tr="protocolizacion"]'); await w.waitForSelector('#esPick');
    await w.evaluate((p) => window.Escrituras.dropFiles([p]), path.join(FX, 'contrato.docx')); await w.waitForSelector('.es-ficha', { timeout: 60000 });
    ok(/Word · lectura exacta/.test(await txt('.es-ficha')) && !(await w.$('#esEdit')), 'protocolización desde Word: lectura exacta; la carátula no se edita');
    await w.waitForSelector('#esVn .es-page', { timeout: 30000 });
    await w.fill('[data-k="email"]', 'cliente@ejemplo.cl');
    ok((await txt('#esTotal')) === '$40.000', 'tarifa fija ' + await txt('#esTotal'));
    await w.click('[data-notsel]'); await w.waitForSelector('#nLista [data-nid]');
    const nNot = (await w.$$('#nLista [data-nid]')).length; ok(nNot >= 2, `elegir notaría (${nNot} opciones)`);
    await w.click('#nLista [data-nid]:not([disabled]) >> nth=0'); await w.click('#nOk'); await w.waitForTimeout(500);
    ok(/Pago/.test(await txt('.es-tk.on')) && /\[REQUIRENTE\]/.test(await txt('#prTxt')), 'notaría elegida: el seguimiento avanza y la carátula la incluye');
    await w.click('#esPrim');
    if (await w.waitForSelector('#esAcc', { timeout: 5000 }).catch(() => null)) {
      await w.check('#esAcc'); await w.click('#esPay'); await w.waitForSelector('.es-item.on:not([data-sel="draft"])', { timeout: 30000 }); await w.waitForTimeout(400);
      ok(/Pagado|Cotización/.test(await txt('.es-item.on')), 'protocolización pagada: queda en la lista');
      await w.waitForSelector('#esVn .es-page', { timeout: 20000 }); ok((await w.$$('.es-file-b')).length >= 3, 'lo que recibió la notaría y sus archivos');
    } else ok(await w.isVisible('#adEmail') || await w.isVisible('#view-login'), 'sin sesión pide iniciar sesión para pagar');
    ok(await w.evaluate(() => typeof window.Escrituras._s.sel === 'string'), 'window.Escrituras._s lee el store');

    console.log('errores:', errs); if (errs.length) process.exitCode = 1;
  } catch (e) {
    console.error(e.message); await w.screenshot({ path: path.join(__dirname, 'firmar-fallo.png') }).catch(() => {}); console.log('errores:', errs); process.exitCode = 1;
  } finally {
    await w.evaluate(() => window.pf.closeNow?.()).catch(() => {}); await app.close().catch(() => {});
    process.exit(process.exitCode || 0);
  }
})();
