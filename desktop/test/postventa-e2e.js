// 0.10 · Postventa (MVP): unidades desde planilla, WhatsApp que atiende al propietario y crea el reclamo con su garantía,
// y el reclamo guiado hasta el cierre con nota del propietario.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfpv-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfpv-db-'));
  const csv = path.join(inmoDir, 'unidades.csv');
  fs.writeFileSync(csv, 'proyecto,torre,piso,numero,tipologia,propietario,rut,telefono,email,recepcion_dom,inscripcion_cbr,entrega\nEdificio Los Aromos,A,5,502,3D2B,Ana Rojas Vera,12.345.678-5,+56 9 5555 1111,ana@correo.cl,2025-03-10,2025-06-02,2025-06-15\nEdificio Los Aromos,A,5,503,2D2B,Luis Soto Paz,11.111.111-1,,luis@correo.cl,2025-03-10,2025-06-20,2025-06-25\n');
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir, PF_START: 'inicio', PF_POSTVENTA: '1' } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const txt = (s) => w.textContent(s).then((t) => (t || '').replace(/\s+/g, ' '));
  const shot = (n) => w.screenshot({ path: path.resolve(__dirname, n) });
  let n = 0; const escribe = (conv, body, att) => app.evaluate((_, a) => { const W = (global.__waMock ||= { convs: [], msgs: {}, enviados: [] }); (W.msgs[a.conv] ||= []).push({ id: 'in' + a.n, direction: 'inbound', body: a.body, attachments: a.att || [], dateAdded: new Date(Date.now() + a.n * 1000).toISOString() }); }, { conv, body, att, n: ++n });
  const enviados = () => app.evaluate(() => (global.__waMock?.enviados || []).map((e) => e.contactId + '|' + e.message));
  const revisar = () => w.evaluate(() => window.pf.pvRevisar().then((r) => r.data));
  try {
    await w.setViewportSize({ width: 1480, height: 960 }); await w.waitForSelector('#view-inicio');
    await w.click('#nav [data-view="postventa"]'); await w.waitForSelector('#view-postventa .pv-ks');
    ok(/Aún no hay reclamos/.test(await txt('#pvBody')), 'pantalla Postventa nueva, vacía');

    // 1. unidades desde planilla
    await w.click('#pvTabs [data-t="unidades"]'); await w.waitForSelector('#pvImp');
    const imp = await w.evaluate((p) => window.pf.pvImportar(p).then((r) => r.data), csv);
    ok(imp.nuevas === 2 && !imp.errores.length, 'importa la planilla de unidades entregadas (2 unidades)');
    { // plantilla Excel: un dato por celda; la fila «Ejemplo» no se importa
      const X = require('xlsx'); const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pfpv-x-')); const f = path.join(tmp, 'plantilla.xlsx');
      fs.writeFileSync(f, require('../src/postventa').crear({ dir: () => tmp }).plantillaXLSX()); const wb = X.readFile(f);
      ok(wb.SheetNames.join() === 'Unidades,Instrucciones' && Object.keys(X.utils.sheet_to_json(wb.Sheets.Unidades)[0]).length === 12, 'la plantilla es un Excel con una columna por dato y hoja de instrucciones');
      X.utils.sheet_add_aoa(wb.Sheets.Unidades, [['Mar Jónico 8075, Vitacura', '', 6, '609', '', 'Jerónimo Gómez', '17.266.327-3', '+56987276858', '', '10/05/2025', '02/07/2025', '']], { origin: 'A3' }); X.writeFile(wb, f);
      const r2 = await w.evaluate((p) => window.pf.pvImportar(p).then((r) => r.data), f);
      ok(r2.nuevas === 1 && r2.omitidas === 1 && !r2.errores.length, 'importa la plantilla completada (dirección con comas incluida) y omite la fila de ejemplo');
      const una = path.join(tmp, 'una.csv'); fs.writeFileSync(una, '"proyecto,torre,numero,propietario"\n"MAR JONICO 8075, DEPTO 609, VITACURA, JERONIMO GOMEZ, 17.266.327-3"\n');
      const e2 = await w.evaluate((p) => window.pf.pvImportar(p), una);
      ok(!e2.ok && /una sola columna/.test(e2.error?.message || e2.error || ''), 'si todo viene en una sola columna, explica el problema y pide la plantilla Excel');
    }
    await w.evaluate(() => window.Postventa.abrir('unidades')); await w.waitForSelector('.pv-tbl tbody tr');
    ok(/Ana Rojas Vera/.test(await txt('.pv-tbl')) && /10\/03\/2025/.test(await txt('.pv-tbl')) && /02\/06\/2025/.test(await txt('.pv-tbl')), 'lista unidades con propietario, recepción DOM e inscripción CBR');

    // 2. WhatsApp: conectar y activar la respuesta automática
    await w.click('#pvTabs [data-t="whatsapp"]'); await w.waitForSelector('#pvKey');
    ok(/Sin conectar/.test(await txt('.pv-key')) && await w.isDisabled('#pvAuto'), 'sin clave, la respuesta automática no se puede activar');
    await w.fill('#pvKey', 'pit-corta'); await w.click('#pvKeyOk'); await w.waitForFunction(() => /muy corta/.test(document.querySelector('#pvKeyErr')?.textContent || ''));
    await w.fill('#pvKey', 'pit-' + 'f0e1d2c3'.repeat(4)); await w.fill('#pvLoc', 'loc-demo'); await w.click('#pvKeyOk'); await w.waitForFunction(() => /Clave propia de postventa/.test(document.querySelector('.pv-key')?.textContent || ''));
    ok(!fs.readFileSync(path.join(userData, 'portalfirma.json'), 'utf8').includes('f0e1d2c3f0e1'), 'la clave propia de postventa se prueba y queda guardada cifrada');
    await app.evaluate(() => { global.__waMock = { convs: [{ id: 'c1', contactId: 'k1', phone: '+56955551111', fullName: 'Ana Rojas' }, { id: 'c2', contactId: 'k2', phone: '+56977770000', fullName: 'Pedro Lead' }], msgs: { c1: [], c2: [] }, enviados: [] }; });
    await w.click('#pvTabs [data-t="whatsapp"]'); await w.waitForSelector('#pvAuto:not([disabled])'); await w.check('#pvAuto'); await w.waitForSelector('.pv-wa.on');
    ok(true, 'activa «Respuesta automática» con wechatia conectado');
    await w.click('#pvTabs [data-t="whatsapp"]'); await w.waitForSelector('#pvRev'); await shot('pv1-whatsapp.png');

    await escribe('c2', 'Hola, quiero cotizar un departamento'); await escribe('c1', 'Hola, se está filtrando el baño, gotea bajo el lavamanos ahora');
    let r = await revisar(); let env = await enviados();
    ok(!env.some((e) => e.startsWith('k2|')), 'un mensaje comercial (no de postventa) no recibe respuesta automática');
    ok(/^k1\|Hola Ana, soy el asistente de postventa\. Veo tu unidad Edificio Los Aromos · Torre A · 502\.\nRecibí tu descripción/.test(env.at(-1)), 'reconoce a la propietaria por su celular y, como ya describió la falla, pide fotos');
    await escribe('c1', '', ['https://fotos.demo.invalid/bano1.jpg']); await escribe('c1', 'listo'); r = await revisar(); env = await enviados();
    ok(/Listo, registré tu solicitud PV-0001 para Edificio Los Aromos · Torre A · 502\.\nTipo: Instalaciones · Baño \(garantía vigente hasta 10\/03\/2030\)\.\nLa marcamos como urgente/.test(env.at(-1)), 'crea el reclamo PV-0001: instalaciones, baño, garantía vigente hasta 10/03/2030, urgente');
    await escribe('c1', 'estado'); await revisar(); env = await enviados(); ok(/PV-0001: Por revisar/.test(env.at(-1)), '«estado» responde cómo va');

    // 3. el reclamo, guiado
    await w.evaluate(() => window.Postventa.abrir('reclamos')); await w.waitForSelector('.pv-row'); await w.waitForSelector('#pvGuia p');
    ok(/PV-0001/.test(await txt('.pv-row')) && /Urgente/.test(await txt('.pv-row')) && /Instalaciones · Baño/.test(await txt('.pv-row')), 'aparece en la lista: urgente, instalaciones · baño, llegó por WhatsApp');
    ok(/Garantía vigente hasta 10\/03\/2030/.test(await txt('#pvDet')) && (await w.$$('#pvDet .pv-fotos img')).length === 1, 'el detalle muestra la garantía calculada y la foto');
    await shot('pv2-reclamo.png');
    await w.click('#pvDet [data-conf]'); await w.waitForSelector('#pvDet .pv-okc'); ok(true, 'confirma la clasificación propuesta');
    await w.fill('#pvVF', '2026-10-21'); await w.fill('#pvVH', '10:30'); await w.click('#pvVisita'); await w.waitForFunction(() => /Diagnóstico/.test(document.querySelector('#pvDet .pv-steps li.a')?.textContent || ''));
    env = await enviados(); ok(/k1\|Hola Ana, agendamos la visita de diagnóstico de tu solicitud PV-0001 para el 21\/10\/2026 a las 10:30/.test(env.at(-1)), 'agendar la visita avisa a Ana por WhatsApp');
    await w.selectOption('#pvCt', '__nuevo'); await w.click('#pvOrden'); await w.waitForSelector('#ctN'); await w.fill('#ctN', 'Gasfitería Pérez'); await w.fill('#ctE', 'Gasfitería'); await w.fill('#ctT', '+56 9 4444 3333'); await w.click('#mOk');
    await w.waitForSelector('#pvEnvOrden'); await w.click('#pvEnvOrden'); await w.waitForTimeout(300);
    const wa = (await app.evaluate(() => global.__abiertos || [])).find((u) => /wa\.me\/56944443333/.test(u)) || '';
    ok(/Orden de trabajo PV-0001/.test(decodeURIComponent(wa)) && /Instalaciones · Baño/.test(decodeURIComponent(wa)), 'la orden de trabajo sale al WhatsApp del contratista con el detalle');
    await w.fill('#pvTF', '2026-10-23'); await w.click('#pvTrabajo'); await w.waitForSelector('#pvTermino'); await w.click('#pvTermino'); await w.waitForSelector('#pvCerrar');
    await shot('pv3-validacion.png');
    await w.click('#pvCerrar'); await w.waitForFunction(() => /Cerrado el/.test(document.querySelector('#pvGuia')?.textContent || ''));
    env = await enviados(); ok(/nota del 1 al 5/.test(env.at(-1)), 'al cerrar pide la nota por WhatsApp');
    await escribe('c1', '5'); await revisar(); env = await enviados(); ok(/Registramos tu nota 5\/5 para PV-0001/.test(env.at(-1)), 'la propietaria responde 5 y queda registrada');
    await w.evaluate(() => window.Postventa.abrir('reclamos')); await w.waitForSelector('.pv-ks');
    ok(/5\/5/.test(await txt('.pv-ks')), 'el tablero muestra la satisfacción');

    // 4. propietario sin celular cargado: se identifica con su RUT
    await app.evaluate(() => { const W = global.__waMock; W.convs.push({ id: 'c3', contactId: 'k3', phone: '+56912340000', fullName: 'Luis' }); W.msgs.c3 = []; });
    await escribe('c3', 'Tengo un problema de garantía, se desprendió la cerámica de la cocina'); await revisar(); env = await enviados(); ok(/RUT del propietario/.test(env.at(-1)), 'si no reconoce el celular, pide el RUT');
    await w.evaluate(() => window.Postventa.abrir('reclamos')); await w.waitForSelector('[data-chat="c3"]', { timeout: 5000 });
    ok(/En conversación por WhatsApp \(1\)/.test(await txt('#pvBody')) && /Luis/.test(await txt('[data-chat="c3"]')) && /cerámica/.test(await txt('[data-chat="c3"]')), 'la conversación en curso aparece en Postventa antes de crear el reclamo');
    await w.click('[data-chat="c3"]'); await w.waitForSelector('#pvDet .pv-chat');
    { const t = await txt('#pvDet'); ok(/se desprendió la cerámica/.test(t) && /RUT del propietario/.test(t), 'al abrirla se ve lo que escribió el propietario y lo que respondió el asistente'); }
    await escribe('c3', '11.111.111-1'); await revisar(); env = await enviados(); ok(/Encontré tu unidad Edificio Los Aromos · Torre A · 503\. Ya tengo tu descripción/.test(env.at(-1)), 'encuentra su unidad por RUT');
    await escribe('c3', 'sin fotos'); await revisar(); env = await enviados(); ok(/PV-0002.*\nTipo: Terminaciones · Cocina \(garantía vigente hasta 20\/06\/2028\)/.test(env.at(-1)), 'terminaciones: garantía de 3 años desde la inscripción en el CBR (20/06/2028)');
    await w.evaluate(() => window.Postventa.abrir('reclamos')); await w.waitForSelector('.pv-row');
    ok(!(await w.$('[data-chat="c3"]')), 'al crearse el reclamo, la conversación deja de estar «en curso»');
    await w.evaluate(() => window.Postventa.abrir('whatsapp')); await w.waitForSelector('[data-ch="c3"]'); await w.click('[data-ch="c3"]');
    ok(/PV-0002/.test(await txt('[data-ch="c3"]')) && /sin fotos/.test(await txt('#pvChVer')), 'en la pestaña WhatsApp se puede leer la conversación completa');
    // 5. cómo habla el asistente: nombre, empresa, trato de usted; instrucciones propias con IA y resguardo de datos
    await w.evaluate(() => window.Postventa.abrir('asistente')); await w.waitForSelector('#asPrev .pv-chat');
    ok(/Hola Ana, soy el asistente de postventa\. Veo tu unidad/.test(await txt('#asPrev')), 'la vista previa parte con el texto de siempre');
    await w.fill('#asNom', 'Sofía'); await w.fill('#asEmp', 'Inmobiliaria Aromos'); await w.click('.pv-seg[data-k="trato"] [data-v="usted"]');
    await w.waitForFunction(() => /soy Sofía, asistente de postventa de Inmobiliaria Aromos\. Veo su unidad/.test(document.querySelector('#asPrev').textContent) && /¿Puede enviarme/.test(document.querySelector('#asPrev').textContent));
    ok(true, 'la vista previa cambia al instante: se presenta como Sofía y trata de usted');
    await w.click('.pv-seg[data-k="tono"] [data-v="cercano"]'); await w.check('#asEmo'); await w.fill('#asFir', 'Equipo Postventa Aromos');
    await w.waitForFunction(() => /¡Hola Ana! 👋 Soy Sofía/.test(document.querySelector('#asPrev').textContent) && /Equipo Postventa Aromos/.test(document.querySelector('#asPrev').textContent));
    ok(true, 'tono cercano con emojis y firma al final');
    await w.click('#asOk'); await w.waitForSelector('text=el asistente ya habla así');
    await escribe('c3', 'Hola, se rompió la chapa de la puerta del dormitorio'); await revisar(); env = await enviados();
    ok(/^k3\|¡Hola Luis! 👋 Soy Sofía, asistente de postventa de Inmobiliaria Aromos\. Veo su unidad Edificio Los Aromos · Torre A · 503\.\nRecibí su descripción\. ¿Puede enviarme/.test(env.at(-1)), 'el WhatsApp real sale con la nueva forma de hablar');
    await w.fill('#asIns', 'Sé muy cálida y empática.'); await w.click('#asIA'); await w.waitForSelector('#asPrevIA .pv-chat');
    ok(/✨ ¡Listo! Registré su solicitud PV-0012/.test(await txt('#asPrevIA')), '«Probar mis instrucciones» muestra el mensaje ajustado por la IA');
    await w.click('#asOk'); await w.waitForSelector('text=el asistente ya habla así');
    await escribe('c3', 'sin fotos'); await revisar(); env = await enviados();
    ok(/^k3\|✨ ¡Listo! Registré su solicitud PV-0003/.test(env.at(-1)) && /Equipo Postventa Aromos$/.test(env.at(-1)), 'con instrucciones, la respuesta pasa por la IA sin perder el folio ni la firma');
    const roto = await w.evaluate(() => window.pf.pvProbarEstilo({ instrucciones: 'ROMPER los folios' }).then((r) => r.data));
    ok(!roto.ia && /PV-0012/.test(roto.texto) && /cambió datos: PV-0012/.test(roto.descartado), 'si la IA cambia un folio, se descarta y sale el mensaje normal');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK postventa');
  } catch (er) { console.error(er.message); await shot('pv-error.png').catch(() => {}); process.exitCode = 1; } finally { await app.close(); }
})();
