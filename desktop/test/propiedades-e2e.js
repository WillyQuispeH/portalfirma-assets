// PortalFirma Asset 0.1: inicio inmobiliario, importación desde Portalfirma, Cartera, ficha y Personas.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfprop-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfprop-db-'));
  const launch = () => electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir, PF_START: 'inicio' } });
  let app = await launch(); let w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const txt = (s) => w.textContent(s).then((t) => t || '');
  const shot = (n) => w.screenshot({ path: path.resolve(__dirname, n) });
  try {
    await w.setViewportSize({ width: 1440, height: 900 }); await w.waitForSelector('#view-inicio .im-hero'); await w.waitForTimeout(400);
    ok(await w.isVisible('#view-inicio') && await w.isHidden('#view-home'), 'abre en el inicio inmobiliario, no en el documental');
    ok((await w.$$eval('#nav .tab', (x) => x.map((t) => t.textContent.trim()))).join('|') === 'Agente|Hoy|Cartera|Personas|Leads|Negocios|Agenda|Publicaciones|Arriendos|Finanzas|Gestión documental', 'menú inmobiliario con Gestión documental al final');
    ok(/Trae tu cartera/.test(await txt('#view-inicio')), 'sin propiedades: invita a importar o crear');
    ok(/Asset/.test(await txt('.brand')) && (await w.title()) === 'PortalFirma Asset', 'marca PortalFirma Asset');
    await shot('pr0-vacio.png');

    // Importar desde Portalfirma (MCP property_manage_tools)
    await w.click('#view-inicio [data-do="importar"]'); await w.waitForSelector('text=Cartera actualizada', { timeout: 15000 });
    const res = await txt('#modalCard'); ok(/Propiedadesleídas4/.test(res.replace(/\s/g, '')) && /Nuevas4/.test(res.replace(/\s/g, '')) && /CRM2/.test(res.replace(/\s/g, '')), 'importa 4 propiedades y crea 2 propietarios en el CRM');
    await w.click('#mOk'); await w.waitForSelector('.im-card');
    ok((await w.$$('.im-card')).length === 4, 'la cartera muestra las 4 propiedades');
    ok(/UF 18\.500/.test(await txt('.im-grid')) && /\$950\.000/.test(await txt('.im-grid')), 'precios en UF y pesos');
    await shot('pr1-cartera.png');
    await w.click('#imOp [data-op="arriendo"]'); ok((await w.$$('.im-card')).length === 2, 'filtro Arriendo');
    await w.click('#imOp [data-op="todas"]'); await w.fill('#imQ', 'pirque'); await w.waitForTimeout(400); ok((await w.$$('.im-card')).length === 1, 'búsqueda por comuna');
    await w.fill('#imQ', '11.111.111'); await w.waitForTimeout(400); ok((await w.$$('.im-card')).length === 2, 'búsqueda por RUT del propietario');
    await w.fill('#imQ', ''); await w.waitForTimeout(400);

    // Ficha
    await w.click('.im-card:has-text("CV-9001")'); await w.waitForSelector('.im-ficha');
    ok(/Casa en Chicureo/.test(await txt('.im-ft')) && /Rol 01234-00010/.test(await txt('.im-ft')) && /origen convecta/.test(await txt('.im-ft')), 'ficha con rol y origen');
    ok(/JUAN PEREZ SOTO/.test(await txt('#view-cartera')) && /Propietario/.test(await txt('#view-cartera')), 'propietario vinculado al importar');
    ok(/Jardín y piscina/.test(await txt('.im-desc')), 'descripción importada sin etiquetas HTML');
    await w.selectOption('[data-est="estadoVenta"]', 'reservada'); await w.waitForSelector('text=Estado: venta reservada');
    ok(true, 'cambiar estado queda en el historial');
    await w.click('#fVinc'); await w.selectOption('#vRol', 'interesado'); await w.click('#vNew');
    await w.fill('#cf_nombre', 'Ana Rojas Díaz'); await w.fill('#cf_rut', '12.345.678-9'); await w.click('#mOk');
    ok(/RUT no es válido/.test(await txt('#cfErr')), 'valida el RUT');
    await w.fill('#cf_rut', '123456785'); await w.fill('#cf_email', 'ana@demo.cl'); await w.fill('#cf_telefono', '+56 9 8888 7777'); await w.click('#mOk');
    await w.waitForSelector('.im-pv:has-text("Ana Rojas Díaz")'); ok(/Interesado · 12\.345\.678-5/.test(await txt('#view-cartera')), 'crea la persona y la vincula como interesada (RUT formateado)');
    const pid = await w.evaluate(() => window.Inmo._IM.ficha);
    await w.evaluate(([id, f]) => window.pf.inmoDocAgregar(id, [f]), [pid, path.join(__dirname, 'fixtures', 'contrato_prueba.pdf')]);
    await w.evaluate((id) => window.Inmo.abrirFicha(id), pid); await w.evaluate((k) => window.Inmo.fichaTab(k), 'firmas'); await w.waitForSelector('#fDocs .im-doc');
    ok(/contrato_prueba\.pdf/.test(await txt('#fDocs')) && fs.readdirSync(path.join(inmoDir, 'documentos')).length === 1, 'documento copiado a la carpeta de la propiedad');
    await w.evaluate((k) => window.Inmo.fichaTab(k), 'historial');
    await w.fill('#fNotaT', 'Visita agendada con Ana para el sábado'); await w.press('#fNotaT', 'Enter'); await w.waitForSelector('[data-pane="historial"] .im-act li.nota');
    ok(/Visita agendada/.test(await txt('.im-act')), 'nota en el historial');
    await shot('pr2-ficha.png');

    // Editar la ficha: lo editado aquí se respeta al volver a importar
    await w.click('#fEdit'); await w.fill('#pf_titulo', 'Casa mediterránea en Chicureo'); await w.fill('#pf_gastosComunes', '120000'); await w.click('#mOk');
    await w.waitForSelector('h1:has-text("Casa mediterránea")');
    await w.evaluate(() => window.Inmo.importar()); await w.waitForSelector('text=Cartera actualizada', { timeout: 15000 });
    ok(/Nuevas0/.test((await txt('#modalCard')).replace(/\s/g, '')), 'reimportar no duplica');
    await w.click('#mOk'); await w.waitForSelector('.im-card');
    ok(/Casa mediterránea en Chicureo/.test(await txt('.im-grid')), 'el título editado se mantiene tras reimportar');

    // Nueva propiedad manual
    await w.click('#imNew'); await w.click('#mOk'); ok(/título/.test(await txt('#pfErr')), 'exige título');
    await w.fill('#pf_titulo', 'Local comercial en Ñuñoa'); await w.selectOption('#pf_tipo', 'local_comercial'); await w.uncheck('#pf_venta'); await w.check('#pf_arriendo');
    await w.fill('#pf_precioArriendo', '35'); await w.selectOption('#pf_precioArriendoM', 'UF'); await w.fill('#pf_comuna', 'Ñuñoa'); await w.click('#mOk');
    await w.waitForSelector('h1:has-text("Local comercial en Ñuñoa")'); ok(/PF-1001/.test(await txt('.im-ft')), 'propiedad nueva con código correlativo');

    // Personas
    await w.click('#nav [data-view="personas"]'); await w.waitForSelector('.im-table');
    ok((await w.$$('.im-table button.im-tr')).length === 3, 'CRM con 3 personas');
    await w.click('#cRol [data-r="interesado"]'); ok((await w.$$('.im-table button.im-tr')).length === 1, 'filtro por rol');
    await w.click('#cRol [data-r=""]'); await shot('pr3-personas.png');
    await w.click('.im-tr:has-text("JUAN PEREZ SOTO")'); await w.waitForSelector('.im-pp');
    ok((await w.$$('.im-pp')).length === 2, 'la persona muestra sus 2 propiedades');
    await w.click('#pDel'); await w.click('#mOk'); await w.waitForTimeout(300);
    ok(/No se puede eliminar/.test(await txt('#toast')), 'no se elimina una persona vinculada');
    await w.click('#pEdit'); await w.fill('#cf_rut', '22.222.222-2'); await w.click('#mOk'); ok(/Ya existe MARIA/.test(await txt('#cfErr')), 'RUT único en el CRM'); await w.click('#mCancel');

    // Inicio con datos
    await w.click('#nav [data-view="inicio"]'); await w.waitForSelector('#view-inicio .hoy-ks');
    ok(/Tus negocios/.test(await txt('#view-inicio')) && /logrados esta semana/.test(await txt('#view-inicio .hoy-ks')), 'indicadores de «Hoy»');
    await shot('pr4-inicio.png');

    // Próximas etapas y Gestión documental
    await w.setViewportSize({ width: 1660, height: 900 }); await w.click('#nav [data-view="arriendos"]'); ok(/Etapa 3/.test(await txt('#view-arriendos')) && await w.isVisible('#nav [data-view="arriendos"].active'), 'Arriendos: etapa en construcción');
    await w.click('#view-arriendos [data-act="plazos"]'); await w.waitForTimeout(500); ok(await w.isVisible('#view-plazos'), 'enlaza a Plazos y vencimientos');
    await w.click('#nav [data-view="home"]'); await w.waitForSelector('.hub-card'); ok(/Gestión documental/.test(await txt('#homeBody h1')) && await w.isVisible('#nav [data-view="home"].active'), 'Gestión documental conserva las herramientas de Studio');
    await shot('pr5-documental.png');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    await app.close();

    // Persistencia
    app = await launch(); w = await app.firstWindow(); await w.waitForSelector('#view-agente .ag, #view-inicio .hoy-ks', { timeout: 15000 });
    ok((await w.evaluate(() => window.pf.inmoListar().then((r) => r.data.propiedades.filter((p) => !p.archivada).length))) === 5, 'los datos persisten al reabrir');
    console.log('OK propiedades');
  } catch (e) { console.error(e.message); await shot('pr-error.png').catch(() => {}); process.exitCode = 1; } finally { await app.close().catch(() => {}); }
})();
