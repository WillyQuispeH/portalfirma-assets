// Configuración › Asistentes (modo de prueba PF_MOCK: la config queda en memoria, como la API de verdad por corredora):
// se abre la pestaña, se cambia el nombre del asistente, la vista previa usa el nombre de la corredora, se enciende el
// horario, se guarda con un solo botón y todo persiste al volver a abrirla. También el enlace desde la pestaña WhatsApp.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-asist-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${path.join(tmp, 'ud')}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: path.join(tmp, 'inmo') } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const txt = (s) => w.innerText(s).then((t) => (t || '').replace(/\s+/g, ' '));
  const abrir = async () => { await w.click('#cfgTabs [data-t="general"]'); await w.click('#cfgTabs [data-t="asistentes"]'); await w.waitForSelector('#cfgAsistentes #asNombre'); };
  try {
    await w.setViewportSize({ width: 1440, height: 1000 });
    await w.waitForFunction(() => window.ReactUI && window.Inmo, null, { timeout: 15000 }); await w.waitForTimeout(500);
    await w.click('#userBtn'); await w.click('[data-um="config"]'); await w.waitForSelector('#view-integraciones:not(.hidden) #cfgTabs');
    const tabs = await w.$$eval('#cfgTabs [data-t]', (l) => l.map((x) => x.dataset.t));
    ok(tabs.indexOf('asistentes') === tabs.indexOf('whatsapp') + 1, 'la pestaña «Asistentes» va justo después de «WhatsApp»');
    await w.click('#cfgTabs [data-t="asistentes"]'); await w.waitForSelector('#cfgAsistentes #asNombre');
    ok(/Atención de clientes/.test(await txt('#cfgAsistentes')) && /Postventa automática/.test(await txt('#cfgAsistentes')) && /Interesados nuevos/.test(await txt('#cfgAsistentes')) && /Equipo de los corredores/.test(await txt('#cfgAsistentes')), 'muestra las tarjetas: atención, postventa, interesados nuevos y equipo');
    ok(/no<\/b> negocia/.test(await w.innerHTML('#cfgAsistentes')) || /No negocia/i.test(await txt('#cfgAsistentes')), 'la atención explica qué hace y qué NO hace (no negocia, no agenda, no promete)');
    ok(await w.inputValue('#asNombre') === 'Tomás' && await w.getAttribute('#asAtencion', 'aria-checked') === 'true', 'parte con Tomás y la atención encendida');
    ok(/asistente virtual de The Living/.test(await txt('#asVista')) && /soy Tomás/.test(await txt('#asVista')), 'la vista previa usa el nombre real de la corredora');
    // nombre e instrucciones
    await w.fill('#asNombre', 'Camila');
    ok(/soy Camila, asistente virtual de The Living/.test(await txt('#asVista')), 'al cambiar el nombre, la vista previa se actualiza');
    await w.fill('#asInstrucciones', 'Háblales de usted. No uses emojis.');
    // horario: aparece al encenderlo
    ok(!(await w.$('#asDesde')), 'el horario no muestra horas mientras está apagado');
    await w.click('#asHorario'); await w.waitForSelector('#asDesde');
    await w.fill('#asDesde', '08:30'); await w.fill('#asHasta', '20:00');
    await w.click('#asDias [data-chip="6"]');
    ok(await w.getAttribute('#asDias [data-chip="6"]', 'aria-pressed') === 'true' && await w.getAttribute('#asDias [data-chip="1"]', 'aria-pressed') === 'true', 'los días se eligen (lunes a viernes + sábado)');
    await w.selectOption('#asFuera', 'callar'); // el kit deja el <select> nativo oculto
    ok(!(await w.$('#asMensajeFuera')), 'con «No responder» no pide mensaje fuera de horario');
    await w.selectOption('#asFuera', 'avisar'); await w.waitForSelector('#asMensajeFuera');
    await w.fill('#asMensajeFuera', 'Hola, soy {nombre} de {corredora}. Te respondemos {cuando}.');
    // postventa, interesados y equipo
    await w.click('#asPostventa'); await w.fill('#asPvNombre', 'Ana');
    await w.click('#asLeads');
    await w.fill('#asEq-pedro', 'Pablo');
    await w.screenshot({ path: path.resolve(__dirname, 'asistentes-config.png'), fullPage: true });
    // un solo Guardar, a la derecha
    ok((await w.$$('#cfgAsistentes button#asGuardar')).length === 1, 'hay un solo botón «Guardar» en la pantalla');
    const caja = await w.$eval('#asGuardar', (b) => { const r = b.getBoundingClientRect(), p = b.parentElement.getBoundingClientRect(); return { derecha: p.right - r.right, izq: r.left - p.left }; });
    ok(caja.derecha < 2 && caja.izq > 100, 'el botón «Guardar» va alineado a la derecha');
    await w.click('#asGuardar'); await w.waitForTimeout(600);
    const g = await w.evaluate(() => window.pf.asistConfig().then((r) => r.data));
    ok(g.atencion.nombre === 'Camila' && g.atencion.instrucciones === 'Háblales de usted. No uses emojis.', 'guardó el nombre y las instrucciones');
    ok(g.atencion.horario.activo && g.atencion.horario.desde === '08:30' && g.atencion.horario.hasta === '20:00' && g.atencion.horario.dias.join() === '1,2,3,4,5,6' && g.atencion.horario.fuera === 'avisar', 'guardó el horario (horas, días y qué hacer fuera de horario)');
    ok(g.atencion.mensajeFuera.includes('{cuando}') && g.postventa.auto === true && g.postventa.nombre === 'Ana' && g.leads.activo === false && g.equipo.pedro === 'Pablo', 'guardó el mensaje fuera de horario, la postventa, los interesados y el equipo');
    // persiste al volver a abrir
    await abrir();
    ok(await w.inputValue('#asNombre') === 'Camila' && /soy Camila/.test(await txt('#asVista')), 'al volver a abrir la pestaña, el nombre y la vista previa siguen');
    ok(await w.inputValue('#asDesde') === '08:30' && await w.inputValue('#asHasta') === '20:00' && await w.getAttribute('#asPostventa', 'aria-checked') === 'true' && await w.getAttribute('#asLeads', 'aria-checked') === 'false' && await w.inputValue('#asEq-pedro') === 'Pablo', 'horario, postventa, interesados y equipo persisten');
    // un horario mal puesto no se guarda
    await w.fill('#asDesde', '21:00'); await w.click('#asGuardar'); await w.waitForTimeout(500);
    ok(/después de la de inicio/.test(await txt('body')), 'un horario que termina antes de empezar se rechaza con un mensaje claro');
    // la pestaña WhatsApp ya no tiene los interruptores de los asistentes con clientes (viven aquí) y va a todo el ancho
    await w.click('#cfgTabs [data-t="whatsapp"]'); await w.waitForSelector('#cfgEquipoWa');
    ok(!(await w.$('#cfgSofia')) && !(await w.$('#cfgTomas')) && !(await w.$('#cfgPostventa')) && !(await w.$('#cfgConfigurarAsistentes')), 'la pestaña WhatsApp ya no trae los interruptores de los asistentes con clientes');
    ok(/Pedro/.test(await txt('#cfgEquipoWa')) && /Fernanda/.test(await txt('#cfgEquipoWa')), 'la pestaña WhatsApp muestra a quién escribirle de tu equipo');
    const ancho = await w.evaluate(() => { const c = document.querySelector('#cfgMiWa').closest('div[class*="grid"]'); const l = document.querySelector('#configuracion, #view-integraciones'); return [c.getBoundingClientRect().width, l.getBoundingClientRect().width]; });
    ok(ancho[0] > 900, `la pestaña WhatsApp usa todo el ancho (${Math.round(ancho[0])} px)`);
    await w.click('#cfgTabs [data-t="asistentes"]'); await w.waitForSelector('#cfgAsistentes #asNombre');
    ok(await w.inputValue('#asNombre') === 'Camila', 'los interruptores y el nombre de los asistentes se configuran en la pestaña Asistentes');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK asistentes');
  } catch (e) { console.error('FAIL', e); process.exitCode = 1; } finally { await app.close(); }
})();
