// Agente a pantalla completa (estilo Claude/Gemini) con acciones rápidas y el flujo guiado «Gestionar una propiedad»:
// propiedad → qué hacer → plantilla de la cuenta → formulario prellenado → revisar → enviar → seguimiento / Operaciones.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfge-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfge-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir, PF_START: 'inicio' } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const txt = (s) => w.textContent(s).then((t) => t || '');
  const shot = (n) => w.screenshot({ path: path.resolve(__dirname, n) });
  const datos = () => w.evaluate(() => window.pf.inmoListar().then((r) => r.data));
  const completar = async () => { for (const i of await w.$$('.ga-form .ga-fs label.falta input')) { const t = await i.getAttribute('type'); const cp = await i.getAttribute('data-cp'); await i.fill(cp === 'rut' ? '12.345.678-5' : t === 'email' ? 'corredor@demo.cl' : t === 'tel' ? '+56 9 5555 4444' : 'Dato de prueba'); } };
  try {
    await w.setViewportSize({ width: 1440, height: 920 }); await w.waitForSelector('#view-inicio .im-hero');
    await w.click('#view-inicio [data-do="importar"]'); await w.waitForSelector('text=Cartera actualizada', { timeout: 15000 }); await w.click('#mOk'); await w.waitForSelector('.im-card');

    // Pantalla completa
    await w.click('#nav [data-view="agente"]'); await w.waitForSelector('#view-agente .ag.ag-full');
    ok(await w.isVisible('#view-agente') && await w.isVisible('.ag-full .ag-hola') && await w.isHidden('#agClose'), 'la pestaña Agente abre el chat a pantalla completa, con saludo');
    await w.click('#agMas'); ok((await w.$$('.ag-full [data-rapida]')).length === 6 && /Gestionar una propiedad/.test(await txt('.ag-quick')), 'seis acciones rápidas bajo el cuadro de texto'); await w.click('#agMas');
    await w.waitForTimeout(300); await shot('ge1-agente.png');

    // 1. Propiedad
    await w.click('#agMas'); await w.click('[data-rapida="gestionar"]'); await w.waitForSelector('.ga-prop .ga-pc');
    ok((await w.$$('.ga-pc')).length === 4 && /Gestionar una propiedad/.test(await txt('.ag-msg.user')), 'pide elegir la propiedad y muestra la cartera');
    await w.fill('.ga-prop [data-q]', 'providencia'); await w.waitForTimeout(150); ok((await w.$$('.ga-pc')).length === 1, 'filtra por comuna mientras escribes');
    await shot('ge2-propiedad.png');
    await w.click('.ga-pc'); await w.waitForSelector('.ga-est');
    ok(/CV-9002/.test(await txt('.ga.hecha')) && /MARIA GONZALEZ ROJAS · Propietario/.test(await txt('.ga-est')), 'tarjeta de la propiedad con su propietaria');
    ok((await w.$$('.ga-est .ga-row [data-a]')).length === 7, 'primero el estado; acciones libres: anotar, documento, agendar, orden, negocio, publicar y ficha');
    await shot('ge3-acciones.png');

    // 2-3. Documento desde las plantillas de la cuenta
    await w.click('[data-a="documento"]'); await w.waitForSelector('.ga-tpls [data-t]', { timeout: 15000 });
    const tpls = await w.$$eval('.ga-tp b', (x) => x.map((e) => e.textContent));
    ok(tpls.includes('Contrato de Corretaje de Propiedades') && !tpls.some((t) => /VEHÍCULO/i.test(t)), `plantillas inmobiliarias de la cuenta, sin vehículos (${tpls.length})`);
    ok(/arriendo/i.test(tpls[0]), 'ordenadas para la propiedad (en arriendo: contratos de arriendo primero)');
    await w.fill('.ga-tpl [data-q]', 'corretaje'); await w.waitForFunction(() => document.querySelectorAll('.ga-tpls [data-t]').length && [...document.querySelectorAll('.ga-tp b')].every((b) => !/^Contrato de Arriendo Sin/.test(b.textContent)), null, { timeout: 8000 });
    ok(true, 'busca plantillas por texto');
    await shot('ge4-plantillas.png');
    await w.click('.ga-tp:has-text("Contrato de Corretaje")'); await w.waitForSelector('.ga-form [data-rev]', { timeout: 15000 });

    // 4. Formulario prellenado
    const val = (id) => w.inputValue(`.ga-form input[data-c="${id}"]`);
    ok(await val('nombre_mandante_signer') === 'MARIA GONZALEZ ROJAS' && await val('rut_mandante_signer') === '22.222.222-2' && await val('email_mandante_signer') === 'maria@demo.cl', 'el mandante sale de la propietaria vinculada (CRM)');
    ok(await val('tipo-de-gestion_documento_nosigner') === 'arriendo' && await val('precio-o-canon-de-referencia_documento_nosigner') === '$950.000' && /^\d{4}-\d{2}-\d{2}$/.test(await val('fecha_documento_nosigner')), 'operación, canon y fecha desde la ficha');
    ok(/Faltan \d+ datos/.test(await txt('.ga-falta')) && (await w.$$('.ga-form label.falta')).length >= 4, 'marca lo que falta (comisión, mandato, corredor…)');
    await shot('ge5-formulario.png');
    await w.click('.ga-form [data-rev]'); ok(/Completa/.test(await txt('#toast')), 'no deja enviar con datos faltantes');
    await completar(); await w.fill('.ga-form input[data-c="nombre_corredor_signer"]', 'Jerónimo Gómez'); await w.fill('.ga-form input[data-c="nombre-de-la-corredora-o-inmobiliaria_corredor_nosigner"]', 'Corredora Demo SpA');
    ok(/Todo completo/.test(await txt('.ga-falta')), 'al completar, queda listo');

    // 5. Revisar y enviar
    await w.click('.ga-form [data-rev]'); await w.waitForSelector('.ga-conf [data-send]');
    const conf = await txt('.ga-conf'); ok(/Mandante: MARIA GONZALEZ ROJAS/.test(conf) && /Corredor: Jerónimo Gómez/.test(conf) && /saldo/.test(conf), 'revisión con firmantes y aviso de cobro antes de enviar');
    await shot('ge6-revisar.png');
    await w.click('.ga-conf [data-send]'); await w.waitForSelector('.ga-res', { timeout: 15000 });
    const ord = await app.evaluate(() => JSON.parse(JSON.stringify(global.__pfMock._ordenes || []))); const o = ord[ord.length - 1];
    ok(o && o.values.rut_mandante_signer === '22.222.222-2' && o.values['tipo-de-gestion_documento_nosigner'] === 'arriendo' && o.values.rut_corredor_signer === '12.345.678-5' && o.property_id === '00000000-0000-4000-8000-000000000002', 'Portalfirma recibe la plantilla con los valores y la propiedad');
    const opN = Number((await txt('.ga-opn')).replace(/\D/g, '')); ok(opN > 0 && /Enviado a firmar/.test(await txt('.ga-res')), `resultado con el número de operación (${opN})`);
    let d = await datos(); const p2 = d.propiedades.find((p) => p.codigo === 'CV-9002');
    ok(p2.firmas?.[0]?.operacion === opN && p2.firmas[0].plantilla === 'Contrato de Corretaje de Propiedades', 'el documento queda en la ficha de la propiedad');

    // 6. Seguimiento
    await w.click('.ga-res [data-est]'); await w.waitForFunction(() => /firmaron/.test(document.querySelector('[data-prog]')?.textContent || ''));
    ok(/1 de 2 firmaron/.test(await txt('.ga-res [data-prog]')) && /Pendiente/.test(await txt('.ga-res .ga-fi:has-text("MARIA")')), 'estado de la firma: quién firmó y quién falta');
    await shot('ge7-enviado.png');
    await w.click('.ga-res [data-ops]'); await w.waitForSelector('#view-ops:not(.hidden)'); await w.waitForTimeout(500);
    ok(await w.isVisible('#agDrawer') && !(await w.$('#agDrawer.ag-full')) && /Enviado a firmar/.test(await txt('#agDrawer')), '«Seguir en Operaciones» abre el panel de Studio con el chat acoplado al lado');
    await shot('ge8-operaciones.png');

    // Por chat: el agente usa las mismas herramientas
    await w.fill('#agQ', '¿Cómo va la firma de la operación ' + opN + '?'); await w.press('#agQ', 'Enter'); await w.waitForTimeout(200); if (await w.isVisible('#mOk').catch(() => false)) await w.click('#mOk');
    await w.waitForFunction(() => /firmaron/.test([...document.querySelectorAll('.ag-msg.bot')].pop()?.textContent || ''), null, { timeout: 15000 });
    ok(/Falta: Mar[ií]a Gonz[aá]lez/i.test(await w.$$eval('.ag-msg.bot', (x) => x.pop().textContent)), 'por chat: seguimiento de la firma');
    await w.fill('#agQ', 'Haz el contrato de corretaje de CV-9002 con su propietario'); await w.press('#agQ', 'Enter');
    await w.waitForFunction(() => /me faltan/.test([...document.querySelectorAll('.ag-msg.bot')].pop()?.textContent || ''), null, { timeout: 15000 });
    ok(/comisi/i.test(await w.$$eval('.ag-msg.bot', (x) => x.pop().textContent)) && !/Corredor/.test(await w.$$eval('.ag-msg.bot', (x) => x.pop().textContent.split('me faltan')[1])), 'por chat: prepara el contrato y pide solo lo que falta (los datos del corredor ya quedaron guardados)');

    // Desde la ficha
    await w.evaluate(() => window.Inmo.abrirFicha(window.Inmo._IM.data.propiedades.find((p) => p.codigo === 'CV-9002').id)); await w.evaluate((k) => window.Inmo.fichaTab(k), 'firmas'); await w.waitForSelector('#fFirmasBox .im-doc');
    ok(/Contrato de Corretaje/.test(await txt('#fFirmasBox')) && /operación/.test(await txt('#fFirmasBox')), 'la ficha muestra «Documentos en firma»');
    await w.click('#fGen'); await w.waitForSelector('#agDrawer .ga-tpl [data-t]', { timeout: 15000 });
    await w.click('#agDrawer .ga-tp:has-text("Contrato de Corretaje")'); await w.waitForSelector('#agDrawer .ga-form [data-rev]', { timeout: 15000 });
    ok(await w.inputValue('#agDrawer input[data-c="nombre_corredor_signer"]') === 'Jerónimo Gómez' && await w.inputValue('#agDrawer input[data-c="rut_corredor_signer"]') === '12.345.678-5', '«Generar documento» desde la ficha, con los datos del corredor ya recordados');
    await shot('ge9-ficha-panel.png');

    // Seguimiento de firmas (acción rápida)
    await w.click('#agMas'); await w.click('#agDrawer [data-rapida="firmas"]'); await w.waitForSelector('.ga-fl .ga-flr');
    ok((await w.$$('.ga-fl .ga-flr')).length === 1 && /CV-9002/.test(await txt('.ga-fl')), 'acción rápida «Seguimiento de firmas» lista lo enviado');
    // Volver a pantalla completa
    await w.click('#agFull'); await w.waitForSelector('#view-agente .ag.ag-full'); ok(/Seguimiento de firmas/.test(await txt('#view-agente')), 'el mismo chat vuelve a pantalla completa');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK gestion');
  } catch (e) { console.error(e.message); await shot('ge-error.png').catch(() => {}); process.exitCode = 1; } finally { await app.close(); }
})();
