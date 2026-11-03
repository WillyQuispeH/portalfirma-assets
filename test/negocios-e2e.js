// Negocios: tablero por etapas, creación guiada, tareas, arrastrar entre etapas, firmas que hacen avanzar solo,
// efectos en la ficha (reservada, disponible, vendida), negocios perdidos y avisos en el inicio.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfng-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfng-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir, PF_START: 'inicio' } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const txt = (s) => w.textContent(s).then((t) => t || '');
  const shot = (n) => w.screenshot({ path: path.resolve(__dirname, n) });
  const estado = (cod, campo) => w.evaluate(([c, k]) => window.pf.inmoListar().then((r) => r.data.propiedades.find((p) => p.codigo === c)[k]), [cod, campo]);
  try {
    await w.setViewportSize({ width: 1500, height: 920 }); await w.waitForSelector('#view-inicio .im-hero');
    await w.click('#view-inicio [data-do="importar"]'); await w.waitForSelector('text=Cartera actualizada', { timeout: 15000 }); await w.click('#mOk'); await w.waitForSelector('.im-card');

    await w.click('#nav [data-view="negocios"]'); await w.waitForSelector('.ng-board');
    ok((await w.$$('.ng-col')).length === 7 && /Interesado/.test(await txt('.ng-board')) && /Inscripción/.test(await txt('.ng-board')), 'tablero de ventas con sus 7 etapas');
    await w.click('#ngTipo [data-t="arriendo"]'); ok((await w.$$('.ng-col')).length === 6 && /Evaluación/.test(await txt('.ng-board')), 'tablero de arriendos con sus 6 etapas');
    await w.click('#ngTipo [data-t="venta"]');

    // Nuevo negocio con persona nueva
    await w.click('#ngNew'); await w.waitForSelector('#nnProp');
    await w.selectOption('#nnProp', { label: 'CV-9001 · Casa en Chicureo' });
    ok((await w.inputValue('#nnVal')) === '18500' && (await w.inputValue('#nnMon')) === 'UF', 'toma el precio de la ficha');
    await w.click('#nnPer'); await w.fill('#cf_nombre', 'Ana Rojas Díaz'); await w.fill('#cf_rut', '12.345.678-5'); await w.click('#mOk');
    await w.waitForSelector('#nnCli'); ok((await w.$eval('#nnCli', (s) => s.selectedOptions[0].textContent)).includes('Ana Rojas'), 'crea al comprador sin salir del formulario');
    ok((await w.inputValue('#nnProp')) !== '', 'conserva la propiedad elegida');
    await w.fill('#nnVal', '18000'); await w.fill('#nnAcc', 'Llamar a Ana para agendar visita'); await w.click('#mOk');
    await w.waitForSelector('#ngEt .et-cards');
    ok(/Etapa actual: Interesado/.test(await txt('.ng-etapa')) && await w.isChecked('[data-task="0"]'), 'abre el negocio en «Interesado» con el cliente ya registrado');
    ok(/UF 360/.test(await txt('#view-negocios')), 'calcula la comisión (2% de UF 18.000)');
    await w.check('[data-task="1"]'); await w.waitForTimeout(400);
    await w.click('#ngNext'); await w.waitForSelector('text=Etapa actual: Visita');
    ok(true, 'avanza a «Visita» con un clic');
    await shot('ng2-negocio.png');

    // Arrastrar en el tablero
    await w.click('#ngBack'); await w.waitForSelector('.ng-card');
    await w.dragAndDrop('.ng-card', '.ng-col[data-e="reserva"]'); await w.waitForSelector('.ng-col[data-e="reserva"] .ng-card');
    ok(/Falta firmar/.test(await txt('.ng-col[data-e="reserva"] .ng-card')), 'arrastrar a «Oferta y reserva» la mueve y avisa la firma pendiente');
    ok((await estado('CV-9001', 'estadoVenta')) === 'reservada', 'la propiedad queda reservada');
    await shot('ng1-tablero.png');

    // Firma: operación en curso y luego firmada → avanza solo
    await w.click('.ng-card'); await w.waitForSelector('#ngVin');
    await w.click('#ngVin'); await w.fill('#vfOp', '20886'); await w.click('#mOk'); await w.waitForSelector('.ng-fb.wait');
    ok(/en firma/.test(await txt('.ng-fb')) && /1 de 2 firmas|de 2 firmas/.test(await txt('.ng-fb')), 'operación vinculada: muestra el avance de firmas');
    await w.click('#ngFq'); await w.waitForSelector('#ngVin');
    await w.click('#ngVin'); await w.fill('#vfOp', '20900'); await w.click('#mOk'); await w.waitForSelector('text=Etapa actual: Promesa', { timeout: 10000 });
    ok(/firmado/.test(await txt('#toast')), 'al estar firmada la reserva, el negocio pasa solo a «Promesa»');

    // Enviar a firmar desde el negocio: la operación creada queda ligada sola
    await w.click('#ngEnv'); await w.click('#edFile'); await w.waitForTimeout(300);
    await w.evaluate(() => window.dispatchEvent(new CustomEvent('pf-operacion', { detail: { operation: 20893 } })));
    await w.waitForTimeout(800);
    await w.evaluate(() => window.Negocios.abrirNegocio(window.Negocios._NG.actual)); await w.waitForSelector('#ngRev');
    await w.click('#ngRev'); await w.waitForSelector('text=Etapa actual: Escritura', { timeout: 10000 });
    ok(true, 'el documento enviado desde el negocio queda ligado y, al firmarse, avanza a «Escritura»');

    // Próxima acción vencida → aviso en el inicio
    await w.fill('#ngPaT', 'Confirmar fecha de notaría'); await w.fill('#ngPaF', '2026-01-05'); await w.click('#ngPa button'); await w.waitForSelector('text=Esta acción venció');
    await w.click('#nav [data-view="inicio"]'); await w.waitForSelector('#view-inicio .hoy-ks');
    ok(/Necesita tu atención/.test(await txt('#view-inicio')) && /Venció el/.test(await txt('#view-inicio')), '«Hoy» avisa la acción vencida como no lograda');
    await w.click('#nav [data-view="negocios"]'); await w.waitForSelector('.ng-card.vencida');
    ok(/Confirmar fecha de notaría/.test(await txt('.ng-card.vencida')), 'la tarjeta muestra la acción vencida en rojo');

    // Arriendo perdido: la propiedad vuelve a disponible
    await w.click('#ngTipo [data-t="arriendo"]'); await w.click('#ngNew'); await w.waitForSelector('#nnProp');
    await w.selectOption('#nnProp', { label: 'CV-9002 · Departamento en Providencia' }); await w.selectOption('#nnCli', { label: 'JUAN PEREZ SOTO · 11.111.111-1' });
    await w.selectOption('#nnEt', 'reserva'); await w.click('#mOk'); await w.waitForSelector('text=Etapa actual: Reserva');
    ok((await estado('CV-9002', 'estadoArriendo')) === 'reservada' && /UF|\$950\.000/.test(await txt('.im-ft')), 'negocio de arriendo creado directo en «Reserva»: la propiedad queda reservada');
    await w.click('#ngLost'); await w.selectOption('#lmSel', 'No calificó (crédito o antecedentes)'); await w.click('#mOk'); await w.waitForSelector('text=Perdido:');
    ok((await estado('CV-9002', 'estadoArriendo')) === 'disponible', 'al perderse, la propiedad vuelve a estar disponible');

    // Cerrar la venta con éxito
    await w.evaluate(() => window.Negocios.abrir({ tipo: 'venta', ver: 'abiertos' })); await w.waitForSelector('.ng-card');
    await w.dragAndDrop('.ng-card', '.ng-col[data-e="entrega"]'); await w.waitForSelector('.ng-col[data-e="entrega"] .ng-card');
    await w.click('.ng-card'); await w.waitForSelector('#ngWin'); await w.click('#ngWin'); await w.waitForSelector('text=Cerrado con éxito');
    ok((await estado('CV-9001', 'estadoVenta')) === 'vendida', 'cerrar con éxito deja la propiedad vendida');
    await w.click('#ngBack'); await w.click('#ngVer [data-v="cerrados"]'); ok(/Cerrado con éxito/.test(await txt('.ng-cerrados')), 'vista de negocios cerrados');

    // La ficha de la propiedad muestra sus negocios
    await w.evaluate(() => window.Inmo.cartera({ especial: '', op: 'todas' })); await w.click('.im-card:has-text("CV-9001")'); await w.waitForSelector('.im-ftabs'); await w.evaluate(() => window.Inmo.fichaTab('negocios')); await w.waitForSelector('[data-neg]');
    ok(/Ana Rojas Díaz\s*Venta/.test(await txt('#view-cartera')) && /Comprador/.test(await txt('#view-cartera')), 'la ficha lista el negocio y vincula al comprador');
    await w.click('[data-neg]'); await w.waitForSelector('#ngEt .et-cards'); ok(/Escritura de compraventa/.test(await txt('#view-negocios')), 'desde la ficha se abre el negocio');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK negocios');
  } catch (e) { console.error(e.message); await shot('ng-error.png').catch(() => {}); process.exitCode = 1; } finally { await app.close(); }
})();
