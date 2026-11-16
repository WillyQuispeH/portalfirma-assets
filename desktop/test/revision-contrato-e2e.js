// Revisión del contrato: el contrato se ARMA en Asset (condiciones + PDF) y se guarda como versión; se envía por WhatsApp a revisión del
// propietario y del arrendatario; ambos aprueban la última versión; después «Contrato firmado» envía a firmar ESA versión (y no se puede antes).
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfrc-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfrc-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir, PF_NO_TOURS: '1' } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const shot = (n) => w.screenshot({ path: path.resolve(__dirname, n) });
  const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
  const paso = async (negocioId, id) => (await call('etPasos', { negocioId })).etapas.flatMap((e) => e.pasos).find((x) => x.id === id);
  try {
    await w.setViewportSize({ width: 1480, height: 980 });
    await w.waitForSelector('#view-agente .ag.ag-full', { timeout: 15000 });
    await w.click('#nav [data-view="inicio"]'); await w.waitForSelector('#view-inicio .hoy');
    await w.click('#view-inicio [data-do="importar"]'); await w.waitForSelector('text=Cartera actualizada', { timeout: 15000 }); await w.click('#mOk');
    await app.evaluate(({ shell }) => { shell.openExternal = async () => {}; });   // sin abrir nada de verdad
    const d = await call('inmoListar'); const pA = d.propiedades.find((p) => p.arriendo);
    const c = await call('inmoPerGuardar', { nombre: 'Matías Serrano', rut: '12.345.678-5', email: 'matias@correo.cl', telefono: '+56 9 8765 4321', roles: ['arrendatario'] });
    const n = await call('negGuardar', { tipo: 'arriendo', propId: pA.id, clienteId: c.id, valor: { valor: 650000, moneda: 'CLP' } });
    const x = { negocioId: n.id, propId: pA.id, tipo: 'revision', id: 'revision', pasoId: 'revision', t: 'Revisión del contrato', paso: 'Revisión del contrato', accion: 'Armar y revisar el contrato' };
    const abrir = (p) => w.evaluate((q) => window.Etapas.accion(q, () => {}), p);
    const duenoId = pA.vinculos.find((v) => v.rol === 'propietario').personaId; const dueno = d.personas.find((p) => p.id === duenoId);
    await call('inmoPerGuardar', { ...dueno, email: '', telefono: '+56 9 7000 1111' });   // al propietario le falta el correo (el caso real: «Falta el correo de …»)
    await w.evaluate(() => cargar());   // la app ya tiene a la persona recién creada
    ok(['pend', 'todo'].includes((await paso(n.id, 'revision')).e), 'sin contrato, la revisión no está lograda');

    // ---- se ARMA el contrato en Asset y se guarda como versión
    await abrir(x); await w.waitForSelector('#rcArmar'); await w.click('#rcArmar');
    await w.waitForSelector('#caInicio', { timeout: 15000 });
    ok(await w.isDisabled('#mOk'), 'sin las condiciones del contrato no se puede guardar la versión');
    ok(await w.inputValue('#caGarantia') === '1' && await w.inputValue('#caUso') === 'habitacional', 'la garantía se pide en meses (con «meses» al final, como el plazo) y el uso de la propiedad sale como lista (habitacional por defecto)');
    ok(/Sin codeudores/.test(await w.textContent('#caCodeudores')), 'los codeudores no se escriben: salen de la evaluación del arrendatario (aquí no hay avales)');
    ok(!(await w.locator('#caCodNombre').count()), 'ya no hay campos para escribir un codeudor a mano');
    // los firmantes con datos que faltan (RUT o correo) salen marcados y abiertos: se completan AQUÍ MISMO, sin salir de la ventana
    const idx = await w.evaluate(() => [...document.querySelectorAll('#caFirmantes > li')].map((li, i) => (li.querySelector('[data-falta]') ? i : -1)).filter((i) => i >= 0));
    ok(idx.length > 0 && await w.locator('#caFirmantes > li').count() >= 2, 'los firmantes (propietario y arrendatario) salen en la ventana y los que tienen datos faltantes quedan marcados («Falta: correo»)');
    ok(await w.isDisabled('#mOk'), 'mientras falten datos de un firmante no se puede guardar la versión');
    const idsFalta = await w.evaluate((l) => l.map((i) => document.querySelectorAll('#caFirmantes > li')[i].getAttribute('data-firmante')), idx);
    for (const i of idx) {
      if (!(await w.inputValue(`#caFirRut-${i}`))) await w.fill(`#caFirRut-${i}`, '11.111.111-1');
      if (!(await w.inputValue(`#caFirEmail-${i}`))) await w.fill(`#caFirEmail-${i}`, `firmante${i}@correo.cl`);
    }
    await w.fill('#caInicio', '2026-12-01'); await w.fill('#caPlazo', '12'); await w.click('#caGuardar');
    await w.waitForFunction(() => /Todo guardado/.test(document.body.textContent), null, { timeout: 15000 });
    await w.click('#mOk'); await w.waitForSelector('#rcPanel [data-version="1"]', { timeout: 15000 });
    const pers = (await call('inmoListar')).personas; ok(idsFalta.every((id) => { const p = pers.find((q) => q.id === id); return p && p.rut && p.email; }), 'los datos que se completaron en la ventana quedaron guardados en la ficha de cada persona');
    let k = (await call('negObtener', n.id)).ciclo.contrato;
    ok(k.versiones.length === 1 && k.versiones[0].archivo?.clave && k.versiones[0].generada && k.versiones[0].condiciones.plazoMeses === 12 && k.versiones[0].condiciones.garantiaMeses === 1 && k.versiones[0].condiciones.uso === 'habitacional', 'la versión 1 queda guardada con su PDF y las condiciones de ese momento');
    ok((await paso(n.id, 'revision')).e === 'pend', 'con la versión guardada, el paso queda pendiente de aprobación');

    // ---- una versión guardada ANTES de que se registraran los firmantes (sin lista) se completa sola al abrir el paso
    const cc = JSON.parse(JSON.stringify((await call('negObtener', n.id)).ciclo)); delete cc.contrato.versiones[0].firmantes; await call('negGuardar', { id: n.id, ciclo: cc });
    await w.evaluate(() => window.closeModal()); await abrir(x); await w.waitForSelector('[data-rc-firmante]', { timeout: 10000 });
    ok(await w.locator('[data-rc-firmante]').count() === 2 && (await call('negObtener', n.id)).ciclo.contrato.versiones[0].firmantes.length === 2, 'una versión guardada antes (sin firmantes registrados) los recupera sola: propietario y arrendatario (y avales) aparecen y quedan guardados');
    // ---- el PDF se ve en un modal DENTRO de la app (no sale a un navegador)
    const ventanas = (await app.windows()).length;
    await w.click('#rcVer'); await w.waitForSelector('#rcVisor', { timeout: 8000 });
    ok((await app.windows()).length === ventanas, '«Ver el PDF» abre el contrato en otro modal, sin salir de la app');
    await w.click('#rcVisorCerrar'); await w.waitForFunction(() => !document.querySelector('#rcVisor'));
    // ---- cada firmante en su card, con «Enviar a revisión» y «Aprueba el borrador»
    ok(await w.locator('[data-rc-firmante]').count() === 2 && await w.locator(`#rcEnviar-${c.id}`).count() === 1 && await w.locator(`#rcAprueba-${duenoId}`).count() === 1, 'los firmantes (propietario y arrendatario) salen en cards, cada uno con sus casillas de enviar y de aprobar');
    ok(await w.isDisabled('#rcRevisar'), 'sin elegir a nadie no se puede enviar a revisión');
    // ---- se elige a quién se envía (varios a la vez): el mensaje sale armado y solo se manda al confirmar
    await w.locator(`#rcEnviar-${c.id}`).check(); await w.locator(`#rcEnviar-${duenoId}`).check();
    ok(/Enviar a revisión \(2\)/.test(await w.textContent('#rcRevisar')), 'el botón dice a cuántas personas se envía');
    await w.click('#rcRevisar'); await w.waitForSelector('#rcMensaje');
    ok(/Hola \{nombre\}/.test(await w.inputValue('#rcMensaje')), 'con varios destinatarios el mensaje usa {nombre} para saludar a cada uno');
    await w.click('text=Cancelar'); await w.locator(`#rcEnviar-${duenoId}`).uncheck();
    await w.click('#rcRevisar'); await w.waitForSelector('#rcMensaje');
    const msg = await w.inputValue('#rcMensaje'); ok(/versión 1/.test(msg) && /apruebas/.test(msg), 'el mensaje de revisión sale armado (versión, aprobar o comentar)');
    ok((await call('negObtener', n.id)).ciclo.contrato.envios === undefined, 'preparar el envío no manda nada ni lo registra');
    await w.click('[aria-label="Otras formas de enviarlo"]'); await w.click('text=Abrir en WhatsApp (yo envío el PDF)');
    await w.waitForFunction((id) => /Se le envió la V1/.test(document.querySelector(`[data-rc-estado="${id}"]`)?.textContent || ''), c.id, { timeout: 10000 });
    k = (await call('negObtener', n.id)).ciclo.contrato; ok(k.envios.length === 1 && k.envios[0].personaId === c.id && k.envios[0].version === 1, 'el envío a revisión queda registrado (qué versión, a quién, cuándo) y se ve en la card del firmante');

    // ---- comentario del propietario → versión nueva (anula aprobaciones) → aprueban ambos
    await w.click('#rcComentario'); await w.fill('#rcTexto', 'Cambiar el plazo a 24 meses'); await w.click('#rcGuardar');
    await w.waitForFunction(() => /24 meses/.test(document.querySelector('#rcPanel')?.textContent || ''), null, { timeout: 10000 });
    await w.locator(`#rcAprueba-${duenoId}`).check(); await w.waitForFunction((id) => /Aprobó el/.test(document.querySelector(`[data-rc-estado="${id}"]`)?.textContent || ''), duenoId, { timeout: 10000 });
    ok((await paso(n.id, 'revision')).e === 'pend', 'aprobó solo el propietario: falta el arrendatario');
    await w.locator('#rcPanel [aria-label="Más acciones"]').first().click(); await w.click('text=Editar y guardar una versión nueva'); await w.waitForSelector('#caInicio', { timeout: 15000 }); await w.fill('#caPlazo', '24'); await w.click('#caGuardar');
    await w.waitForFunction(() => /Todo guardado/.test(document.body.textContent), null, { timeout: 15000 });
    await w.click('#mOk'); await w.waitForSelector('#rcPanel [data-version="2"]', { timeout: 15000 });
    ok(Object.keys((await call('negObtener', n.id)).ciclo.contrato.aprobado).length === 0, 'una versión nueva anula las aprobaciones');

    // ---- «Contrato firmado» no se puede enviar sin la aprobación de ambos
    await w.evaluate(() => window.closeModal());
    const xc = { negocioId: n.id, propId: pA.id, tipo: 'firma', id: 'contrato', pasoId: 'contrato', etapaFirma: 'contrato', t: 'Contrato firmado', paso: 'Contrato firmado', accion: 'Enviar contrato a firmar' };
    const botonFirma = 'button:has-text("Enviar el contrato aprobado a firmar")';
    await abrir(xc); await w.waitForSelector(botonFirma); await w.click(botonFirma);
    await w.waitForSelector('text=Falta la aprobación', { timeout: 10000 });
    ok(!(await w.locator('#caInicio').count()), 'sin la aprobación de ambos, no se abre el envío a firmar (avisa qué falta)');

    // ---- aprueban ambos la V2 → paso logrado
    await w.evaluate(() => window.closeModal()); await abrir(x); await w.waitForSelector(`#rcAprueba-${duenoId}`);
    await w.locator(`#rcAprueba-${duenoId}`).check(); await w.locator(`#rcAprueba-${c.id}`).check();
    await w.waitForFunction(() => /Aprobado por todos/.test(document.querySelector('#rcPanel')?.textContent || ''), null, { timeout: 10000 });
    const p = await paso(n.id, 'revision'); ok(p.e === 'ok' && /V2/.test(p.d), 'con todos los firmantes aprobando la V2, el paso queda logrado');
    await shot('rc1.png');

    // ---- se envía a firmar EXACTAMENTE la versión aprobada
    await w.evaluate(() => window.closeModal()); await abrir(xc); await w.waitForSelector(botonFirma); await w.click(botonFirma);
    await w.waitForSelector('#caTipoFirma', { timeout: 15000 });
    ok(await w.isDisabled('#caInicio') && await w.isDisabled('#caPlazo'), 'al enviar a firmar, las condiciones son de solo lectura (se firma lo aprobado)');
    await w.selectOption('#caTipoFirma', 'avanzada'); await w.selectOption('#caTramite', 'legalization'); await w.click('#mOk');
    await w.waitForFunction(() => !document.querySelector('#caTipoFirma'), null, { timeout: 15000 });
    const n2 = await call('negObtener', n.id); const f = (await call('inmoListar')).propiedades.find((q) => q.id === pA.id).firmas?.find((z) => /Contrato de arriendo/.test(z.plantilla || ''));
    ok(n2.firmas?.contrato?.operacion && f?.versionClave === n2.ciclo.contrato.versiones[1].archivo.clave && f.tipoFirma === 'avanzada' && f.tramite === 'legalization', 'el contrato enviado a firmar es el PDF de la V2 aprobada, con el tipo de firma y el trámite elegidos');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK revisión y firma del contrato');
  } catch (er) { console.error(er.message); console.error(await w.evaluate(() => document.querySelector('#rcError, #caErr')?.textContent || '').catch(() => '')); await shot('rc-error.png').catch(() => {}); process.exitCode = 1; }
  await app.close();
})();
