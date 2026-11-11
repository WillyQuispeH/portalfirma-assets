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
    ok(/Necesita tu atención/.test(h) && /Visita agendada/.test(h) && /canceló la visita/.test(h), '«Necesita tu atención»: la visita no lograda, con su motivo');
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
    await w.click('#view-inicio [data-l="atencion"][data-acc="0"]'); await w.waitForSelector('#rpF'); await w.fill('#rpF', '2099-01-10'); await w.click('#mOk');
    await w.waitForFunction(() => /Todo en orden/.test(document.querySelector('#view-inicio')?.textContent || ''));
    ok(true, 'al reprogramar, deja de estar en rojo: «Todo en orden»');
    // el negocio: 3 etapas, siguiente paso, marcar logrado
    await w.click(`#view-inicio .hoy-neg:has-text("${pA.titulo.slice(0, 20).replace(/"/g, '')}")`); await w.waitForSelector('#ngEt .et-cards');
    const e = await txt('#ngEt');
    ok(!/Captación/.test(e) && /Comercialización/.test(e) && /Post(venta|arriendo)/.test(e), '0.16.11 · el negocio muestra comercialización y postventa (postarriendo si es arriendo) (la captación quedó en Cartera)');
    ok(/Siguiente paso · te toca/.test(e) && /Visita agendada/.test(e), 'y un solo siguiente paso destacado (visita)');
    ok(await w.evaluate(() => document.querySelector('#ngEt .luz.on #etAcc') != null), 'la luz guía está en el botón del siguiente paso');
    await w.click('#etOk'); await w.waitForFunction(() => /Orden de visita firmada/.test(document.querySelector('#ngEt .et-next')?.textContent || ''), null, { timeout: 8000 });
    ok(/Logrado/.test(await txt('#ngEt .et-p:has-text("Visita agendada")')), '«Marcar como logrado» avanza al siguiente paso (orden de visita)');
    await shot('et2-negocio.png');
    // otro estado: esperando a alguien
    await w.click('#etMas'); await w.click('.et-mopts [data-e="otro"]'); await w.fill('#emT', 'el cliente'); await w.click('#emOk');
    await w.waitForFunction(() => /Esperando a el cliente/.test(document.querySelector('#ngEt .et-next')?.textContent || ''), null, { timeout: 8000 });
    ok(true, '«Esperando a alguien» queda como pendiente de otro');
    // postventa de arriendo sin escritura ni Conservador
    await w.click('#ngEt [data-tog="1"]'); const pv = await txt('#ngEt .et-e >> nth=1');
    ok(/Contrato de arriendo firmado/.test(pv) && !/Conservador/.test(pv), 'la postventa de un arriendo tiene sus pasos (sin escritura ni Conservador)');
    // 0.16.11 · la captación de la propiedad se ve en Cartera: en la tarjeta y en la ficha
    await w.evaluate(() => window.Inmo.cartera({ especial: '', op: 'todas' })); await w.waitForSelector('.im-card .im-capt');
    ok(await w.$$eval('.im-card .im-capt', (x) => x.length) >= 1 && /Captación \d\/8/.test(await txt('#view-cartera')), 'cada tarjeta de Cartera muestra su avance de captación');
    if (await w.$('#imCapt')) { await w.click('#imCapt'); await w.waitForSelector('.im-chip:has-text("Captación incompleta")'); ok(true, 'el filtro «En captación» deja solo las que tienen algo pendiente'); await w.click('#imCapt'); }
    await w.evaluate((id) => window.Inmo.abrirFicha(id), pA.id); await w.evaluate((k) => window.Inmo.fichaTab(k), 'captacion'); await w.waitForSelector('#fCapt .et-next');
    ok(!(await w.$('#fCapt .et-p')) && (await w.isVisible('[data-pane="resumen"] #fCapt')), '0.16.27 · la captación está en el Resumen, con los pasos plegados');
    await w.click('#fCapt [data-tog="0"]'); await w.waitForSelector('#fCapt .et-p');
    const fc = await txt('#fCapt'); ok(/Captación/.test(fc) && /Mandato firmado|Datos de la propiedad|Fotos|Publicada/.test(fc) && !/Comercialización ·|Postventa/.test(fc), `la ficha muestra la captación con el siguiente paso: «${fc.slice(0, 90)}…»`);
    await shot('et4-captacion-ficha.png');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK etapas');
  } catch (er) { console.error(er.message); await shot('et-error.png').catch(() => {}); process.exitCode = 1; } finally { await app.close(); }
})();
