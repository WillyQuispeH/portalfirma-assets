// 0.18.11 · Pestaña «Visitas» de la ficha de la propiedad: calendario con las visitas, horarios libres del día para agendar y lista
// de visitas. Las visitas de una misma propiedad no se pueden sobreponer (ni al agendar ni al reprogramar), pero otra propiedad
// puede tener visita a la misma hora. Una propiedad puede tener muchas visitas y estar en varios negocios.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfvi-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfvi-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const shot = (n) => w.screenshot({ path: path.resolve(__dirname, n) });
  const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
  const falla = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => (r.ok ? null : r.error)), [fn, a]);
  const dia = (n) => { const d = new Date(Date.now() + n * 864e5); return d.toISOString().slice(0, 10); };
  try {
    await w.setViewportSize({ width: 1480, height: 1100 });
    await w.waitForSelector('#view-agente .ag.ag-full', { timeout: 15000 });
    await w.click('#nav [data-view="inicio"]'); await w.waitForSelector('#view-inicio .hoy');
    await w.click('#view-inicio [data-do="importar"]'); await w.waitForSelector('text=Cartera actualizada', { timeout: 15000 }); await w.click('#mOk');
    const d = await call('inmoListar'); const pA = d.propiedades.find((p) => p.arriendo && p.venta) || d.propiedades.find((p) => p.arriendo); const pB = d.propiedades.find((p) => p.id !== pA.id);
    const per = await call('inmoPerGuardar', { nombre: 'Ana Visitante', rut: '12.345.678-5', email: 'ana@correo.cl', telefono: '', roles: ['interesado'] });
    const n1 = await call('negGuardar', { tipo: 'arriendo', propId: pA.id, clienteId: per.id });
    const n2 = await call('negGuardar', { tipo: 'arriendo', propId: pA.id, clienteId: per.id, valor: { valor: 30, moneda: 'UF' } });
    ok(n1.id !== n2.id, 'una propiedad puede estar en varios negocios');

    // la regla, en el servidor local: misma propiedad, mismo horario o cruzado → no cabe; otra propiedad, sí
    const f1 = dia(3);
    await call('agendaCrear', { tipo: 'visita', fecha: f1, hora: '11:00', duracion: 60, propId: pA.id, personaIds: [per.id] });
    ok(/se cruza/.test(await falla('agendaCrear', { tipo: 'visita', fecha: f1, hora: '11:00', propId: pA.id })), 'a la misma hora de otra visita de la propiedad: se rechaza');
    ok(/se cruza/.test(await falla('agendaCrear', { tipo: 'visita', fecha: f1, hora: '11:30', propId: pA.id })), 'en medio de otra visita: se rechaza');
    ok(/se cruza/.test(await falla('agendaCrear', { tipo: 'visita', fecha: f1, hora: '10:30', duracion: 45, propId: pA.id })), 'si su duración invade a la otra: se rechaza');
    await call('agendaCrear', { tipo: 'visita', fecha: f1, hora: '12:00', propId: pA.id });   // justo al terminar la anterior: cabe
    ok(true, 'justo cuando termina una visita, otra cabe');
    await call('agendaCrear', { tipo: 'visita', fecha: f1, hora: '14:00', propId: pB.id });
    ok(true, 'otra propiedad puede tener visitas (a otra hora)');
    await call('agendaCrear', { tipo: 'reunion', fecha: f1, hora: '11:00', propId: pA.id });
    ok(true, 'la regla es solo entre visitas (una reunión no bloquea)');

    // la pestaña
    await w.evaluate((id) => window.Inmo.abrirFicha(id), pA.id); await w.waitForSelector('.im-ficha');
    await w.click('.im-ftabs [data-tab="visitas"]'); await w.waitForSelector('#viCal');
    ok(await w.isVisible('[data-pane="visitas"]'), 'la ficha tiene la pestaña «Visitas»');
    await w.waitForSelector('#viLista [data-ev]');
    ok(await w.locator('#viLista [data-ev]').count() === 2, 'la lista trae las 2 visitas de esta propiedad (no la de la otra)');
    ok((await w.locator(`#viCal [data-dia="${f1}"]`).getAttribute('data-marcas')) === '2', 'el calendario marca el día con sus 2 visitas');

    // elegir ese día: las horas ocupadas salen bloqueadas
    await w.click(`#viCal [data-dia="${f1}"]`);
    const est = (h) => w.locator(`#viHorarios [data-hora="${h}"]`).getAttribute('data-estado');
    ok(await est('11:00') === 'ocupado' && await est('11:30') === 'ocupado' && await est('12:00') === 'ocupado', 'los horarios de las visitas del día salen ocupados');
    ok(await est('10:30') === 'ocupado', '10:30 + 45 min invade las 11:00: ocupado');
    ok(await est('10:00') === 'libre' && await est('13:00') === 'libre', 'los demás horarios están libres');
    await w.selectOption('#viDur', '30'); ok(await est('10:30') === 'libre', 'con 30 minutos, 10:30 ya cabe');
    await w.selectOption('#viDur', '45');
    ok(await w.locator('#viHorarios [data-hora="11:00"]').isDisabled(), 'un horario ocupado no se puede elegir');

    // agendar uno nuevo desde la pestaña
    await w.selectOption('#viNegocio', n1.id);
    ok(await w.inputValue('#viPersona') === per.id, 'al elegir el negocio queda elegida su persona');
    ok(await w.locator('#viAgendar').isDisabled(), 'sin elegir horario no se puede agendar');
    await w.click('#viHorarios [data-hora="15:00"]'); await w.click('#viAgendar');
    await w.waitForFunction(() => document.querySelectorAll('#viLista [data-ev]').length === 3);
    ok(await w.locator(`#viCal [data-dia="${f1}"]`).getAttribute('data-marcas') === '3', 'la visita nueva aparece en el calendario');
    ok(await est('15:00') === 'ocupado', 'y su horario queda ocupado');
    const lst = await call('agendaListar', { propId: pA.id, tipo: 'visita' }); const nueva = lst.find((e) => e.hora === '15:00');
    ok(nueva && nueva.negocioId === n1.id && nueva.personaIds.includes(per.id) && nueva.duracion === 45, 'quedó ligada al negocio y a la persona, con su duración');
    await shot('vi1-visitas.png');

    // reprogramar una a un horario ocupado: se rechaza y queda donde estaba
    const e12 = lst.find((e) => e.hora === '12:00');
    ok(/se cruza/.test(await falla('agendaActualizar', e12.id, { hora: '11:30' })), 'reprogramar a un horario que se cruza: se rechaza');
    const despues = (await call('agendaListar', { propId: pA.id, tipo: 'visita' })).find((e) => e.id === e12.id);
    ok(despues.hora === '12:00' && despues.fecha === f1, 'la visita sigue en su horario original');
    await call('agendaActualizar', e12.id, { hora: '17:00' }); ok(true, 'reprogramar a un horario libre funciona');
    // una cancelada libera su horario
    await call('agendaActualizar', nueva.id, { estado: 'cancelado' });
    await call('agendaCrear', { tipo: 'visita', fecha: f1, hora: '15:00', propId: pA.id }); ok(true, 'una visita cancelada libera su horario');

    // el corredor tampoco puede estar en dos visitas a la vez (en otra propiedad): solo si hay un usuario con sesión
    const yo = (await call('accEstado')).usuarioId || null;
    if (yo) {
      const f2 = dia(5);
      await call('agendaCrear', { tipo: 'visita', fecha: f2, hora: '16:00', duracion: 60, propId: pB.id });
      ok(/Ya tienes otra visita/.test(await falla('agendaCrear', { tipo: 'visita', fecha: f2, hora: '16:30', propId: pA.id })), 'el corredor no puede tener otra visita a esa hora en otra propiedad');
      await call('agendaCrear', { tipo: 'visita', fecha: f2, hora: '17:00', propId: pA.id }); ok(true, 'justo al terminar la otra, sí');
      await w.evaluate((id) => window.Inmo.abrirFicha(id), pA.id); await w.waitForSelector('#viCal'); await w.click('.im-ftabs [data-tab="visitas"]');
      await w.click(`#viCal [data-dia="${f2}"]`);
      await w.waitForFunction(() => document.querySelector('#viHorarios [data-hora="16:00"]')?.getAttribute('data-estado') === 'tuyo', null, { timeout: 8000 }).catch(() => {});
      ok(await w.locator('#viHorarios [data-hora="16:00"]').getAttribute('data-estado') === 'tuyo', 'en la pestaña, ese horario sale bloqueado por la otra visita del corredor');
    } else console.log('  - sin usuario con sesión en la prueba: se omite la regla del corredor');

    // el calendario navega por mes
    const mes0 = await w.textContent('#viCal b'); await w.click('#viCal [data-cal-sig]'); await w.waitForTimeout(100);
    ok((await w.textContent('#viCal b')) !== mes0, 'el calendario cambia de mes');
    ok(errs.length === 0, 'sin errores de JavaScript: ' + errs.join(' | '));
    console.log('OK visitas de la propiedad');
  } catch (e) { await shot('vi-error.png').catch(() => {}); console.error(e.message, errs); process.exitCode = 1; }
  await app.close();
})();
