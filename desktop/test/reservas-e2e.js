// 0.9.2 · Calendario de reservas (wechatia) dentro de Asset: el corredor reserva la visita en el widget, Asset trae la
// reserva con la API, la liga a la propiedad, el cliente y el negocio (hito «Visita») y sigue reprogramaciones y cancelaciones.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfrs-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfrs-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const txt = (s) => w.textContent(s).then((t) => (t || '').replace(/\s+/g, ' '));
  const shot = (n) => w.screenshot({ path: path.resolve(__dirname, n) });
  const neg = () => w.evaluate(() => window.pf.negListar().then((r) => r.data.negocios.find((n) => n.estado === 'abierto')));
  const evs = () => w.evaluate(() => window.pf.agendaListar({}).then((r) => r.data));
  const TOKEN = 'pit-' + 'a1b2c3d4'.repeat(4);
  const EMBED = '<iframe src="https://api.wechatia.com/widget/booking/FAVeve4zF30S3J9Mv6od" allow="payment" style="width: 100%;border:none;overflow: hidden;" scrolling="no" id="FAVeve4zF30S3J9Mv6od_1792007439150"></iframe><br><script src="https://api.wechatia.com/js/form_embed.js" type="text/javascript"></script>';
  try {
    await w.setViewportSize({ width: 1500, height: 980 });
    await w.waitForSelector('#view-agente .ag.ag-full', { timeout: 15000 });
    await w.evaluate(() => window.Inmo.importar()); await w.waitForSelector('text=Cartera actualizada', { timeout: 15000 }); await w.click('#mOk');
    await w.click('#nav [data-view="agente"]'); await w.waitForSelector('#view-agente .ag.ag-full'); await w.waitForTimeout(300);
    const ids = await w.evaluate(async () => { const d = (await window.pf.inmoListar()).data; return { p: d.propiedades.find((x) => x.codigo === 'CV-9002').id, c: d.personas.find((x) => /JUAN PEREZ/.test(x.nombre)).id }; });
    await w.evaluate((o) => window.pf.negGuardar({ tipo: 'arriendo', propId: o.p, clienteId: o.c }), ids);

    await w.fill('#agQ', 'CV-9002'); await w.press('#agQ', 'Enter'); await w.waitForSelector('.ga-est');
    await w.click('.ga-est [data-a="agendar"]'); await w.waitForSelector('.ga-agd [data-modo]');
    await w.click('.ga-agd [data-m="res"]'); await w.waitForSelector('.ga-agd .ga-resf iframe');
    const src = await w.getAttribute('.ga-agd .ga-resf iframe', 'src');
    ok(/^https:\/\/api\.wechatia\.com\/widget\/booking\/FAVeve4zF30S3J9Mv6od\?/.test(src) && /first_name=JUAN/.test(src) && /notes=Visita\+CV-9002/.test(src), 'el widget del calendario se abre dentro de Agendar, con el cliente y la propiedad');
    ok(/Sin conectar/.test(await txt('.ga-resh')), 'sin clave avisa que la reserva no llega sola');
    await w.click('.ga-agd [data-listo]'); ok(await w.isVisible('.ga-agd [data-f="fecha"]') && /anota aquí el día y la hora/.test(await txt('.ga-agd .ga-falta')), 'sin clave, «Listo» pasa a anotar la hora en Asset');
    await w.click('.ga-agd [data-m="res"]'); await w.waitForSelector('.ga-resh [data-conf]');
    await shot('rs1-widget.png');

    // conectar
    await w.click('.ga-resh [data-conf]'); await w.fill('.ga-resc [data-c="t"]', 'corta'); await w.click('.ga-resc [data-guardar]');
    await w.waitForSelector('.ga-resc [data-ce] svg'); ok(/muy corta/.test(await txt('.ga-resc')), 'valida la clave');
    await w.fill('.ga-resc [data-c="w"]', EMBED); await w.fill('.ga-resc [data-c="t"]', TOKEN); await shot('rs2-conectar.png'); await w.click('.ga-resc [data-guardar]');
    await w.waitForSelector('.ga-resh .ok'); ok(/Conectado: Visita/.test(await txt('.ga-resh')), 'pegando el código del widget y la clave queda conectado al calendario «Visita»');
    ok(!fs.readFileSync(path.join(userData, 'portalfirma.json'), 'utf8').includes(TOKEN), 'la clave no queda en texto plano');

    await w.click('.ga-agd [data-listo]'); await w.waitForSelector('.ga-agd .ga-falta svg');
    ok(/Todavía no veo la reserva/.test(await txt('.ga-agd .ga-falta')), '«Listo» antes de reservar: avisa que aún no llega');
    // el corredor reserva en el widget (simulado en la API)
    await app.evaluate(() => { global.__resMock = { eventos: [{ id: 'ap1', title: 'Visita', startTime: '2026-10-22T15:00:00-03:00', appointmentStatus: 'confirmed', contactId: 'ct1', dateAdded: new Date().toISOString() }], contactos: { ct1: { firstName: 'Juan', lastName: 'Perez Soto', email: 'juan@ejemplo.cl', phone: '+56 9 1111 1111' } } }; });
    await w.click('.ga-agd [data-listo]'); await w.waitForSelector('.ga.hecha:has-text("Visita reservada")');
    ok(/2026-10-22 15:00 · CV-9002/.test(await txt('.ga.hecha:has-text("Visita reservada")')), 'la reserva llega a Asset con su día y hora, ligada a la propiedad');
    let n = await neg(); let e = (await evs()).find((x) => x.ext?.id === 'ap1');
    ok(e && e.tipo === 'visita' && e.propId === ids.p && e.personaIds.includes(ids.c) && e.negocioId === n.id, 'queda en la agenda como visita de Juan, con su negocio');
    ok(n.etapa === 'visita' && /Hito registrado/.test(await txt('.ag-body')), 'y es un hito: el negocio pasa a «Visita»');
    const citas = await app.evaluate(() => global.__waMock?.citas || []);
    ok(citas.some((c) => c.id === 'ap1' && c.method === 'PUT' && /Visita · .+/.test(c.body.title) && c.body.address) && citas.some((c) => c.id === 'ap1' && c.nota), `la dirección de la propiedad queda en la cita de wechatia (para la confirmación por WhatsApp): «${citas[0]?.body?.address || ''}»`);
    await w.waitForFunction(() => document.querySelectorAll('.ga-est').length === 2 && /22\/10 15:00/.test([...document.querySelectorAll('.ga-est')].pop().textContent)); ok(true, 'vuelve al estado de la propiedad, con la visita reservada');
    await shot('rs3-reservada.png');

    // reprogramación, reserva externa y cancelación
    await app.evaluate(() => { const M = global.__resMock; M.eventos[0].startTime = '2026-10-22T16:30:00-03:00'; M.eventos.push({ id: 'ap2', title: 'Visita', startTime: '2026-10-23T10:00:00-03:00', appointmentStatus: 'confirmed', contactId: 'ct2', dateAdded: new Date().toISOString() }); M.contactos.ct2 = { firstName: 'Ana', lastName: 'Rojas', phone: '+56 9 2222 2222' }; });
    let r = await w.evaluate(() => window.pf.resSincronizar(null).then((x) => x.data));
    e = (await evs()).find((x) => x.ext?.id === 'ap1'); const e2 = (await evs()).find((x) => x.ext?.id === 'ap2');
    ok(r.actualizadas === 1 && e.hora === '16:30', 'si la reprograman en el calendario, Asset la mueve');
    ok(r.nuevas === 1 && e2 && /Reserva: Visita/.test(e2.titulo) && /Ana Rojas/.test(e2.notas), 'una reserva hecha fuera de Asset también llega a la agenda, con el contacto');
    await app.evaluate(() => { global.__resMock.eventos[0].appointmentStatus = 'cancelled'; });
    r = await w.evaluate(() => window.pf.resSincronizar(null).then((x) => x.data)); e = (await evs()).find((x) => x.ext?.id === 'ap1');
    ok(r.canceladas === 1 && e.estado === 'cancelado', 'si la cancelan, queda cancelada en Asset');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK reservas');
  } catch (er) { console.error(er.message); await shot('rs-error.png').catch(() => {}); process.exitCode = 1; } finally { await app.close(); }
})();
