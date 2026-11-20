// 0.15 · «Hoy» y etapas del negocio: 3 etapas (captación, comercialización, postventa), pasos logrados / pendientes /
// no logrados, luz guía en el botón recomendado que sigue al mouse, y marcar pasos desde el negocio.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfet-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfet-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir, PF_NO_TOURS: '1' } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const txt = (s) => w.textContent(s).then((t) => (t || '').replace(/\s+/g, ' '));
  const shot = (n) => w.screenshot({ path: path.resolve(__dirname, n) });
  const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
  try {
    await w.setViewportSize({ width: 1480, height: 980 });
    await w.waitForSelector('#view-agente .ag.ag-full', { timeout: 15000 });
    ok((await txt('#nav [data-view="inicio"]')).trim() === 'Hoy', 'la pestaña «Inicio» ahora se llama «Hoy»');
    await w.click('#nav [data-view="inicio"]'); await w.waitForSelector('#view-inicio .hoy');
    ok(!!(await w.$('#view-inicio [data-layout-fondo]')) && !(await w.$('#view-inicio .hoy-bg')), 'la vista lista usa el diseño del kit (sin la foto de fondo)');
    await w.click('#view-inicio [data-do="importar"]'); await w.waitForSelector('text=Cartera actualizada', { timeout: 15000 }); await w.click('#mOk');
    // datos: una propiedad en arriendo con un negocio en visita, y un cliente
    const d = await call('inmoListar'); const pA = d.propiedades.find((p) => p.arriendo); const pV = d.propiedades.find((p) => p.venta && p.id !== pA.id);
    const c = await call('inmoPerGuardar', { nombre: 'Matías Serrano', rut: '7.654.321-6', roles: ['interesado'] });
    const n1 = await call('negGuardar', { tipo: 'arriendo', propId: pA.id, clienteId: c.id });
    const n2 = await call('negGuardar', { tipo: 'venta', propId: pV.id, clienteId: c.id });
    await call('etMarcar', { negocioId: n2.id, paso: 'visita', estado: 'fail', d: 'El cliente canceló la visita del sábado.' });
    await w.click('#nav [data-view="inicio"]'); await w.waitForSelector('#view-inicio .hoy-list');
    const h = await txt('#view-inicio');
    ok(/Necesita tu atención/.test(h) && /Visita y orden de visita/.test(h) && /canceló la visita/.test(h), '«Necesita tu atención»: la visita no lograda, con su motivo');
    ok(/1 cosa necesita tu atención/.test(h), 'el estado general avisa que algo necesita atención');
    ok(/Te toca a ti/.test(h) && /Tus negocios \(\d+\)/.test(h), '«Te toca a ti» y «Tus negocios» con su avance');
    ok(await w.$$eval('.hoy-neg .et-segs > span', (x) => x.length) >= 3, 'cada negocio (y cada captación) muestra su barra de avance');
    // la luz guía: en lo más urgente; sigue al mouse y vuelve
    const luzEn = () => w.evaluate(() => document.querySelector('#view-inicio .luz.on button')?.textContent.trim());
    ok(await luzEn() === 'Reprogramar', 'la luz guía parte en el botón más urgente («Reprogramar»)');
    await w.hover('#view-inicio .hoy-neg >> nth=0'); ok(await w.evaluate(() => !!document.querySelector('#view-inicio .luz.on .hoy-neg')), 'al pasar el mouse por otro botón, la luz se mueve ahí');
    await w.mouse.move(5, 500); await w.waitForTimeout(100); ok(await luzEn() === 'Reprogramar', 'al salir, vuelve al botón recomendado');
    const anim = await w.evaluate(() => getComputedStyle(document.querySelector('#view-inicio .luz.on'), '::before').animationName);
    ok(anim === 'luzGiro', 'la luz recorre el borde (animación)');
    await shot('et1-hoy.png');
    // las filas alinean su botón de acción en la misma columna
    const xs = await w.$$eval('#view-inicio .hoy-ac button', (b) => [...new Set(b.map((x) => Math.round(x.getBoundingClientRect().right)))]);
    ok(xs.length === 1, 'los botones de acción quedan alineados en una columna');
    // una acción abre su propia ventana de trabajo, no el chat del Agente
    const mand = await w.$('#view-inicio .hoy-ac button:has-text("Enviar mandato a firmar")');
    if (mand) { await mand.click(); await w.waitForSelector('.vt-ov .vt-h'); ok(/Mandato de corretaje/.test(await txt('.vt-h')) && await w.isHidden('#view-agente'), '«Enviar mandato a firmar» abre su ventana (no el Agente)');
      await w.waitForSelector('.vt-b .ga, .vt-b .error', { timeout: 15000 }); ok(await w.$('.vt-b .ga'), 'el formulario del documento aparece dentro de la ventana'); await shot('et3-ventana.png'); await w.click('.vt-x'); await w.waitForSelector('.vt-ov', { state: 'detached' }); }
    await w.click('#hoyNuevo'); await w.waitForSelector('.vt-nuevo'); ok((await w.$$('.vt-nuevo button')).length === 7, '«Empezar algo nuevo» abre una ventana con las 3 etapas'); await w.keyboard.press('Escape'); await w.waitForSelector('.vt-ov', { state: 'detached' });
    // reprogramar: vuelve a pendiente y «Todo en orden»
    await w.click('#view-inicio [data-l="atencion"][data-acc="0"]'); await w.waitForSelector('#pvForm'); ok(/Agendar la visita/.test(await txt('#pvForm')), '0.18.10 · «Reprogramar» abre el paso de la visita con el formulario adentro (no otra ventana)'); ok(await w.isVisible('#shCal') && await w.locator('#shHorarios [data-hora]').count() > 10, 'el paso muestra el calendario y los horarios del día'); ok(await w.locator('#pvAgendar').isDisabled(), 'sin elegir horario no se puede agendar'); await w.locator('#shHorarios [data-hora]:not([disabled])').first().click(); await w.click('#pvAgendar');
    await w.waitForFunction(() => /Todo en orden/.test(document.querySelector('#view-inicio')?.textContent || ''));
    ok(true, 'al reprogramar, deja de estar en rojo: «Todo en orden»');
    await w.waitForTimeout(500); await shot('pv1-visita.png');
    ok(/Agendada/.test(await txt('#pvLista')) && /Confirmar por WhatsApp/.test(await txt('#pvLista')), '0.18.10 · la visita queda listada en la ventana (agendada, con «Confirmar por WhatsApp»)');
    await w.evaluate(() => window.closeModal());
    // el negocio: 3 etapas, siguiente paso, marcar logrado
    await w.click(`#view-inicio .hoy-neg:has-text("${pA.titulo.slice(0, 20).replace(/"/g, '')}")`); await w.waitForSelector('#ngEt .et-col');
    const e = await txt('#ngEt');
    ok(!/Captación/.test(e) && /Comercialización/.test(e) && /Post(venta|arriendo)/.test(e), '0.16.11 · el negocio muestra comercialización y postventa (postarriendo si es arriendo) (la captación quedó en Cartera)');
    // el paso en curso va destacado (tarjeta con su acción); ya no hay «Siguiente paso · te toca» ni luz guía en la ficha del negocio
    ok(await w.locator('#ngEt .et-pa').count() === 1 && /Visita y orden de visita/.test(await txt('#ngEt .et-pa')), 'y un solo paso en curso destacado (visita)');
    // 0.18.10 · ya no existe «Esperando a alguien» (solo logrado, no logrado y volver a lo automático)
    await w.click('#ngEt .et-pa [data-pm]'); await w.waitForSelector('.et-mopts [data-e="fail"]');
    ok(await w.$('.et-mopts [data-e="otro"]') === null, 'el menú de estados ya no ofrece «Esperando a alguien»'); await w.evaluate(() => window.closeModal());
    // la acción del paso en curso («Agendar visita»): se agenda y, al marcarla realizada, el negocio avanza al siguiente paso
    await w.click('#ngEt .et-pa .et-do'); await w.waitForSelector('#pvForm'); await w.locator('#shHorarios [data-hora]:not([disabled])').first().click(); await w.click('#pvAgendar');
    await w.waitForSelector('#pvLista [data-pv-orden]'); ok(await w.locator('#pvLista [data-pv-orden]').count() === 1, 'la visita agendada ofrece «Generar orden de visita» en el mismo paso');
    await w.click('#pvLista [data-pv-visita] [data-mas]'); await w.click('#pvHecha');
    await w.waitForFunction(() => /Acta de visita/.test(document.querySelector('#ngEt .et-pa')?.textContent || ''), null, { timeout: 8000 });
    await w.evaluate(() => window.closeModal());
    ok(/Logrado/.test(await txt('#ngEt .et-p:has-text("Visita y orden de visita")')), 'marcar la visita realizada desde el paso avanza al siguiente (acta de visita)');
    await shot('et2-negocio.png');
    // el cierre y el postarriendo de un arriendo, sin escritura ni Conservador
    if (await w.$('#ngEt .et-col >> nth=1 >> [data-mas]')) await w.click('#ngEt .et-col >> nth=1 >> [data-mas]');
    const pv = (await txt('#ngEt .et-col >> nth=1')) + (await txt('#ngEt .et-col >> nth=2'));
    ok(/Contrato firmado/.test(pv) && /Devolución de la garantía/.test(pv) && !/Conservador|[Ee]scritura/.test(pv), 'el cierre y el postarriendo de un arriendo tienen sus pasos (sin escritura ni Conservador)');
    // 0.16.11 · la captación de la propiedad se ve en Cartera: en la tarjeta y en la ficha
    await w.evaluate(() => window.Inmo.cartera({ especial: '', op: 'todas' })); await w.waitForSelector('.im-card .im-capt');
    ok(await w.$$eval('.im-card .im-capt', (x) => x.length) >= 1 && /Captación \d\/8/.test(await txt('#view-cartera')), 'cada tarjeta de Cartera muestra su avance de captación');
    if (await w.$('#imCapt')) { await w.click('#imCapt'); await w.waitForSelector('.im-chip:has-text("Captación incompleta")'); ok(true, 'el filtro «En captación» deja solo las que tienen algo pendiente'); await w.click('#imCapt'); }
    await w.evaluate((id) => window.Inmo.abrirFicha(id), pA.id); await w.evaluate((k) => window.Inmo.fichaTab(k), 'captacion'); await w.waitForSelector('#fCapt .et-e');
    ok(!(await w.$('#fCapt .et-p')) && (await w.isVisible('[data-pane="resumen"] #fCapt')), '0.16.27 · la captación está en el Resumen, con los pasos plegados');
    await w.click('#fCapt [data-tog="0"]'); await w.waitForSelector('#fCapt .et-p');
    const fc = await txt('#fCapt'); ok(/[Cc]aptación/.test(fc) && /Mandato firmado|Datos de la propiedad|Fotos|Publicada/.test(fc) && !/Comercialización ·|Postventa/.test(fc), `la ficha muestra la captación con el siguiente paso: «${fc.slice(0, 90)}…»`);
    await shot('et4-captacion-ficha.png');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK etapas');
  } catch (er) { console.error(er.message); await shot('et-error.png').catch(() => {}); process.exitCode = 1; } finally { await app.close(); }
})();
