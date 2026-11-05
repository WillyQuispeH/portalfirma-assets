// 0.8 · Publicaciones: de la ficha → «Publicar» → calidad (con IA) → portales → publicar; luego avisos con rendimiento,
// interesados de todos los portales y conexiones (feed de Chilepropiedades con su API de seguimiento).
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfpb-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfpb-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir, PF_START: 'inicio' } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const txt = (s) => w.textContent(s).then((t) => t || '');
  const shot = (n) => w.screenshot({ path: path.resolve(__dirname, n) });
  const datos = () => w.evaluate(() => window.pf.inmoListar().then((r) => r.data));
  try {
    await w.setViewportSize({ width: 1440, height: 920 }); await w.waitForSelector('#view-inicio .im-hero');
    await w.click('#view-inicio [data-do="importar"]'); await w.waitForSelector('text=Cartera actualizada', { timeout: 15000 }); await w.click('#mOk'); await w.waitForSelector('.im-card');
    await w.evaluate(() => window.pf.mlConectar()); // cuenta de Portal Inmobiliario (simulada)

    await w.click('#nav [data-view="publicaciones"]'); await w.waitForSelector('.pb-empty');
    ok(/Todavía no hay avisos/.test(await txt('#view-publicaciones')) && (await w.$$('.pb-sp [data-pub]')).length >= 3, 'Publicaciones: sin avisos, con las propiedades disponibles listas para publicar');

    // 1. Desde la ficha: «Publicar»
    // Portal Inmobiliario exige el piso de los departamentos (ficha-campos.js: pisoUnidad); el depto de prueba no lo trae
    await w.evaluate(async () => { const p = (await window.pf.inmoListar()).data.propiedades.find((x) => x.codigo === 'CV-9002'); await window.pf.inmoPropGuardar({ id: p.id, ficha: { pisoUnidad: 7 } }); });
    await w.evaluate(() => window.Inmo.abrirFicha(window.Inmo._IM.data.propiedades.find((p) => p.codigo === 'CV-9002').id)); await w.waitForSelector('#fPub');
    await w.click('#fPub'); await w.waitForSelector('.pb-q');
    const p0 = Number(await txt('.pb-ring.big b'));
    ok(await w.isVisible('#view-publicaciones') && /Calidad del aviso/.test(await txt('.pb-steps')) && p0 > 0 && p0 < 100, `el botón Publicar abre su propio flujo: calidad del aviso ${p0}/100 con lo que falta`);
    ok(/WhatsApp de contacto/.test(await w.$$eval('.pb-ql li:not(.ok)', (x) => x.map((e) => e.textContent).join(' '))) && /Descripción/.test(await txt('.pb-ql')), 'muestra qué mejorar');
    await shot('pb1-calidad.png');
    await w.click('#pwIA'); await w.waitForFunction(() => /Departamento/.test(document.querySelector('#pwT').value) && document.querySelector('#pwD').value.length > 250, null, { timeout: 15000 });
    ok(/Providencia/.test(await w.inputValue('#pwT')) && (await w.inputValue('#pwT')).length <= 60, `la IA redacta el título (${await w.inputValue('#pwT')}) y la descripción con los datos de la ficha`);
    await w.click('#pwSave'); await w.waitForFunction(() => Number(document.querySelector('.pb-ring.big b')?.textContent) > 0);
    const p1 = Number(await txt('.pb-ring.big b')); ok(p1 > p0, `guardar el texto sube la calidad (${p0} → ${p1})`);
    await w.click('[data-fix="contacto"]'); await w.fill('#ctN', 'Corredora Demo'); await w.fill('#ctE', 'ventas@demo.cl'); await w.fill('#ctW', '+56 9 3480 0626'); await w.click('#mOk');
    await w.waitForFunction((x) => Number(document.querySelector('.pb-ring.big b')?.textContent) > x, p1); ok(true, 'configura el WhatsApp de contacto sin salir del flujo');

    // 2. Portales
    await w.click('#pwNext'); await w.waitForSelector('.pb-psel');
    ok(await w.isChecked('[data-pc="pi"] input[type=checkbox]') && await w.isChecked('[data-pc="chilepropiedades"] input[type=checkbox]') && await w.isDisabled('[data-pc="toctoc"] input[type=checkbox]'), 'portales: Portal Inmobiliario y Chilepropiedades marcados; TOCTOC espera el acuerdo comercial');
    await w.click('[data-pc="pi"] [data-ta="gold"]'); await w.click('[data-pc="pi"] [data-ta="silver"]');
    await shot('pb2-portales.png');
    await w.click('#pwNext'); await w.waitForSelector('#pwGo');
    await w.click('#pwGo'); await w.waitForSelector('.pb-done', { timeout: 20000 });
    ok(/Publicado|Enviado/.test(await txt('[data-r="pi"]')) && /espera/.test(await txt('[data-r="chilepropiedades"]')), 'publica en Portal Inmobiliario por API; Chilepropiedades queda en espera de la integración');
    await shot('pb3-publicado.png');
    let d = await datos(); const pr = d.propiedades.find((p) => p.codigo === 'CV-9002');
    ok(pr.portales.pi.arriendo.itemId && pr.portales.chilepropiedades.arriendo.status === 'pendiente', 'la ficha guarda el aviso de cada portal');

    // 3. Portales: activar Chilepropiedades (feed + TOKEN)
    await w.click('#pwFin'); await w.waitForSelector('.pb-av'); await w.click('#pbTabs [data-t="portales"]'); await w.waitForSelector('[data-po="chilepropiedades"]');
    await w.check('[data-po="chilepropiedades"] [data-act]'); await w.fill('[data-po="chilepropiedades"] [data-token]', 'token-demo'); await w.fill('[data-po="chilepropiedades"] [data-url]', 'https://feeds.portalfirma.cl/demo/chilepropiedades.xml'); await w.click('[data-po="chilepropiedades"] [data-save]');
    await w.waitForSelector('[data-po="chilepropiedades"].on'); ok(/1 aviso en el feed/.test(await txt('[data-po="chilepropiedades"]')), 'al activar la integración, lo que esperaba pasa al feed');
    const feed = await w.evaluate(() => window.pf.pubFeed('chilepropiedades').then((r) => r.data.xml));
    ok(/<referenceId><!\[CDATA\[ CV-9002-A \]\]><\/referenceId>/.test(feed) && /<price currency="CLP" operation="Arriendo">/.test(feed) && /<propertyType><!\[CDATA\[ Departamento \]\]>/.test(feed) && /<commune><!\[CDATA\[ Providencia \]\]>/.test(feed), 'feed XML con el formato oficial de Chilepropiedades');
    await w.click('[data-po="chilepropiedades"] [data-sol]'); const ab = await app.evaluate(() => global.__abiertos || []);
    ok(ab.some((u) => /^mailto:integraciones@chilepropiedades\.cl/.test(u) && /TOKEN/.test(decodeURIComponent(u))), 'solicitar integración: correo listo a integraciones@chilepropiedades.cl con el feed y el pedido del TOKEN');
    await shot('pb4-conexiones.png');

    // 4. Actualizar: estados, visitas e interesados
    await w.click('#pbTabs [data-t="avisos"]'); await w.waitForSelector('.pb-av'); await w.click('#pbSync'); await w.waitForSelector('text=Portales actualizados', { timeout: 15000 });
    await w.waitForSelector('.pb-av .pb-met'); const met = (await txt('.pb-av .pb-met')).replace(/\s+/g, ' ');
    ok(/\d+ ?visitas/.test(met) && Number(met.match(/(\d+) ?visitas/)[1]) > 0 && /Chilepropiedades.*Publicado/.test(await txt('.pb-av .pb-pts')), `rendimiento por aviso (${met.trim()}) y Chilepropiedades confirmado por su API`);
    ok(/nuevos/.test(met), 'cuenta los interesados nuevos');
    await shot('pb5-avisos.png');

    // 5. Interesados
    await w.click('#pbTabs [data-t="interesados"]'); await w.waitForSelector('.pb-ld');
    ok(/Carla Muñoz/.test(await txt('.pb-leads')) && /Chilepropiedades/.test(await txt('.pb-leads')), 'bandeja única: el interesado de Chilepropiedades');
    await w.click('.pb-ld:has-text("Carla") [data-wa]'); await w.waitForTimeout(500);
    const wa = (await app.evaluate(() => global.__abiertos || [])).find((u) => /wa\.me\/56977771234/.test(u));
    ok(wa && /CV-9002/.test(decodeURIComponent(wa)) && /Corredora Demo/.test(decodeURIComponent(wa)), 'Responder abre WhatsApp con el mensaje listo');
    await w.click('#pbFl [data-f="contactado"]'); await w.waitForSelector('.pb-ld:has-text("Carla")'); ok(true, 'queda como contactado');
    await w.click('#pbAdd'); await w.selectOption('#aiP', { label: 'CV-9001 · Casa en Chicureo' }); await w.selectOption('#aiPo', 'toctoc'); await w.fill('#aiN', 'Pedro Soto'); await w.fill('#aiT', '+56 9 1111 2222'); await w.click('#mOk');
    await w.waitForSelector('.pb-ld:has-text("Pedro Soto")'); ok(/TOCTOC/.test(await txt('.pb-ld:has-text("Pedro Soto")')), 'agregar a mano un interesado de TOCTOC');
    await shot('pb6-interesados.png');
    await w.click('.pb-ld:has-text("Pedro Soto") [data-visita]'); await w.waitForSelector('#evP'); await w.click('#mOk'); await w.waitForTimeout(500);
    await w.waitForSelector('#pbFl'); d = await datos(); ok(d.propiedades.find((p) => p.codigo === 'CV-9001').leads.find((l) => l.nombre === 'Pedro Soto').estado === 'visita', 'agendar la visita desde la bandeja lo deja «con visita» sin salir de Publicaciones');

    // 6. Recomendación de precio y ajuste
    await w.click('#pbTabs [data-t="avisos"]'); await w.waitForSelector('.pb-av');
    ok((await w.$$('.pb-av .ga-ph')).length === 1 && /Más portales/.test(await txt('.pb-av')), 'aviso con acciones para seguir');
    await w.click('.pb-av [data-mas]'); await w.waitForSelector('.pb-psel'); ok(/Ya publicado/.test(await txt('[data-pc="pi"]')), '«Más portales» vuelve al paso de portales con lo ya publicado marcado');
    await w.click('#pwBack'); await w.waitForSelector('.pb-av');
    // agente
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK publicaciones');
  } catch (e) { console.error(e.message); await shot('pb-error.png').catch(() => {}); process.exitCode = 1; } finally { await app.close(); }
})();
