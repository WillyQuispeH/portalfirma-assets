// Agente Asset: todo por chat (crear propiedad, agendar, orden de visita, negocios, cambios de precio y estado,
// resumen y navegación), con confirmación solo en lo que cobra; y la Agenda usando la misma lógica desde botones.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfaa-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfaa-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir, PF_START: 'inicio' } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const txt = (s) => w.textContent(s).then((t) => t || '');
  const shot = (n) => w.screenshot({ path: path.resolve(__dirname, n) });
  const ultimo = () => w.$$eval('.ag-msg.bot', (x) => x.map((e) => e.textContent).pop() || '');
  const decir = async (t) => { const n = (await w.$$('.ag-msg.bot')).length; await w.fill('#agQ', t); await w.press('#agQ', 'Enter'); await w.waitForTimeout(150); if (await w.isVisible('#mOk').catch(() => false)) await w.click('#mOk'); return n; };
  const respuesta = async (n) => { await w.waitForFunction((k) => document.querySelectorAll('.ag-msg.bot').length > k, n, { timeout: 15000 }); await w.waitForTimeout(250); return ultimo(); };
  const datos = () => w.evaluate(() => window.pf.inmoListar().then((r) => r.data));
  const man = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  try {
    await w.setViewportSize({ width: 1500, height: 920 }); await w.waitForSelector('#view-inicio [data-cabecera]');
    await w.click('#view-inicio [data-do="importar"]'); await w.waitForSelector('text=Cartera actualizada', { timeout: 15000 }); await w.click('#mOk'); await w.waitForSelector('.im-card');
    await w.click('#agBtn'); await w.waitForSelector('#agDrawer:not(.hidden)');
    ok(/Agente Asset/.test(await txt('#agDrawer')) && !(await w.$('.ag-sug')), 'el Agente Asset abre despejado (sin sugerencias de ejemplo)');
    await w.click('#agMore'); await w.click('#agTools'); await w.waitForSelector('.ag-tl > div'); const nt = (await w.$$('.ag-tl > div')).length; await w.click('#agOk');
    ok(nt >= 13 + 32, `dispone de las herramientas de Asset (32) y las 13 del MCP (${nt})`);

    let n = await decir('Sube una propiedad nueva: departamento en Ñuñoa, Irarrázaval 2500 depto 804, arriendo $650.000, 2D 1B, 55 m²'); let r = await respuesta(n);
    await w.waitForSelector('.ga-dc .dc-g'); ok(await w.inputValue('.ga-dc [data-k="comuna"]') === 'Ñuñoa' && await w.inputValue('.ga-dc [data-k="precioArriendo"]') === '650000' && await w.inputValue('.ga-dc [data-k="dormitorios"]') === '2', 'al describir una propiedad, el agente llena la ficha para revisar (no la crea solo)');
    let d = await datos(); ok(!d.propiedades.some((p) => p.comuna === 'Ñuñoa'), 'todavía no está creada');
    await w.click('.ga-dc [data-crear]'); await w.waitForSelector('.ga.hecha:has-text("creada dictando")');
    d = await datos(); const nueva = d.propiedades.find((p) => p.comuna === 'Ñuñoa');
    ok(nueva && nueva.precioArriendo.valor === 650000 && nueva.dormitorios === 2 && nueva.supUtil === 55, `al confirmar se crea (${nueva?.codigo})`);

    n = await decir('Agenda una visita mañana a las 11:00 en CV-9002 con Juan Pérez'); r = await respuesta(n);
    ok(/Agendé la visita a CV-9002/.test(r) && /11:00/.test(r) && /JUAN PEREZ SOTO/.test(r), 'agenda la visita con propiedad, hora y persona');

    n = await decir('Genera la orden de visita para CV-9002 con Juan mañana'); await w.waitForSelector('[data-conf]');
    const conf = await txt('[data-conf]');
    ok(/Generar la orden de visita/.test(conf) && /CV-9002/.test(conf) && /11\.111\.111-1/.test(conf) && /saldo/.test(conf), 'la orden de visita pide confirmar (cobra) y muestra los datos');
    await shot('aa1-confirmar.png');
    await w.click('[data-conf] [data-si]'); r = await respuesta(n);
    ok(/Orden de visita enviada a firmar a JUAN PEREZ SOTO: operación \d+/.test(r), 'envía la orden de visita a firmar');
    const ord = await app.evaluate(() => JSON.parse(JSON.stringify(global.__pfMock._ordenes || [])));
    ok(ord.length === 1 && ord[0].values['rut_visitante_signer'] === '11.111.111-1' && ord[0].values['fecha-firma_documento_nosigner'] === man && ord[0].property_id === '00000000-0000-4000-8000-000000000002', 'plantilla completada: fecha, visitante y la propiedad de Portalfirma');
    const ev = await w.evaluate(() => window.pf.agendaListar({}).then((x) => x.data));
    ok(ev.length === 1 && ev[0].orden?.operacion, 'la visita ya agendada queda con su orden (no se duplica el evento)');

    n = await decir('Crea un negocio de arriendo de CV-9002 con Juan'); r = await respuesta(n);
    ok(/Negocio de arriendo creado/.test(r), 'crea el negocio por chat');
    n = await decir('Pasa el negocio a reserva'); r = await respuesta(n);
    d = await datos(); ok(/Reserva/.test(r) && d.propiedades.find((p) => p.codigo === 'CV-9002').estadoArriendo === 'reservada', 'mueve el negocio y la propiedad queda reservada');
    n = await decir('Baja el arriendo de CV-9002 a 900.000'); await respuesta(n);
    d = await datos(); ok(d.propiedades.find((p) => p.codigo === 'CV-9002').precioArriendo.valor === 900000, 'cambia el precio por chat');
    n = await decir('Marca la casa de Chicureo como vendida'); await respuesta(n);
    d = await datos(); ok(d.propiedades.find((p) => p.codigo === 'CV-9001').estadoVenta === 'vendida', 'cambia el estado buscando por texto («la casa de Chicureo»)');
    n = await decir('Busca departamentos en arriendo'); r = await respuesta(n); ok(/Encontré \d+: .*CV-9002/.test(r), 'busca en la cartera');
    n = await decir('¿Qué tengo hoy?'); r = await respuesta(n); ok(/negocios abiertos/.test(r) && /eventos entre hoy y mañana/.test(r), 'resumen del día');
    await shot('aa2-chat.png');
    n = await decir('Abre la ficha de CV-9001'); await respuesta(n); await w.waitForSelector('.im-ficha:has-text("Casa en Chicureo")'); ok(true, 'navega a la ficha que se le pide');
    const log = await w.evaluate(() => window.pf.agentLog().then((x) => x.data));
    ok(log.some((l) => l.tool === 'asset_orden_visita'), 'cada acción queda en el registro de actividad');

    // Agenda con botones: la misma lógica
    await w.click('#agClose'); await w.click('#nav [data-view="agenda"]'); await w.waitForSelector('.ag-ev');
    ok(/Orden de visita · operación/.test(await txt('#view-agenda')), 'la Agenda muestra la visita con su orden');
    await w.click('#agNew'); await w.selectOption('#evP', { label: 'CV-9004 · Parcela en Pirque' }); await w.selectOption('#evC', { label: 'MARIA GONZALEZ ROJAS · 22.222.222-2' }); await w.fill('#evH', '16:30'); await w.click('#mOk');
    await w.waitForSelector('[data-orden]'); await w.click('[data-orden]'); await w.waitForSelector('text=Generar y enviar a firmar');
    ok(/MARIA GONZALEZ ROJAS/.test(await txt('#modalCard')) && /CV-9004/.test(await txt('#modalCard')), 'el botón «Generar orden de visita» muestra lo que se enviará');
    await w.click('#mOk'); await w.waitForSelector('text=Orden de visita enviada a firmar');
    await w.waitForFunction(() => document.querySelectorAll('#view-agenda [data-orden-ok]').length === 2);
    ok(true, 'orden generada desde la Agenda');
    await shot('aa3-agenda.png');
    await w.click('#nav [data-view="inicio"]'); await w.waitForSelector('#view-inicio .hoy-agenda'); ok(/Agenda de hoy/.test(await txt('#view-inicio')), '«Hoy» muestra la agenda de hoy');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK agente asset');
  } catch (e) { console.error(e.message); await shot('aa-error.png').catch(() => {}); process.exitCode = 1; } finally { await app.close(); }
})();
