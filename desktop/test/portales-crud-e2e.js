// Portales: el CRUD del aviso en cada portal (publicar, actualizar, pausar, reactivar, retirar, eliminar) con Portal Inmobiliario
// (API de Mercado Libre) y los portales de feed (Chilepropiedades, Broku), la pantalla Portales con una tarjeta por portal
// y la misma lista en Configuración › Integraciones. Requiere el bundle compilado: yarn build:ui.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };

(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfpc-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfpc-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir, PF_START: 'inicio' } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message)); w.on('console', (m) => { if (m.type() === 'error' && !/ERR_NAME_NOT_RESOLVED/.test(m.text())) errs.push(m.text()); }); // sin red, las fotos de ejemplo no cargan
  const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
  const falla = (fn, ...a) => call(fn, ...a).then(() => null, (e) => e.message);
  const txt = (s) => w.innerText(s).then((t) => (t || '').replace(/\s+/g, ' '));
  try {
    await w.setViewportSize({ width: 1440, height: 920 }); await w.waitForSelector('#view-inicio [data-cabecera]');
    await w.click('#view-inicio [data-do="importar"]'); await w.waitForSelector('text=Cartera actualizada', { timeout: 15000 }); await w.click('#mOk'); await w.waitForSelector('.im-card');
    await call('mlConectar'); // cuenta de Portal Inmobiliario (simulada)
    const prop = async () => (await call('inmoListar')).propiedades.find((x) => x.codigo === 'CV-9002');
    const p = await prop(); const op = 'arriendo';
    await call('inmoPropGuardar', { id: p.id, ficha: { pisoUnidad: 7 } });
    const tx = await call('pubRedactar', p.id, op); await call('pubTextos', p.id, { tituloPortal: tx.titulo, descripcion: tx.descripcion });
    await call('mlContacto', { nombre: 'Corredora Demo', email: 'ventas@demo.cl', whatsapp: '+56 9 3480 0626' }, 'silver');
    const estado = async (portal) => (await prop()).portales?.[portal]?.[op]?.status || null;

    // 1. la pantalla Portales: una tarjeta por portal; Broku está en trámite
    await w.click('#nav [data-view="publicaciones"]'); await w.waitForSelector('#pbTabs'); await w.click('#pbTabs [data-t="portales"]'); await w.waitForSelector('[data-po="broku"]'); await w.waitForSelector('[data-po="pi"]');
    const ids = await w.$$eval('[data-po]', (l) => l.map((e) => e.getAttribute('data-po')));
    ok(['pi', 'chilepropiedades', 'broku', 'toctoc', 'yapo'].every((i) => ids.includes(i)), 'hay una tarjeta por portal: ' + ids.join(', '));
    ok(/En trámite|en trámite/.test(await txt('[data-po="broku"]')), 'Broku figura «Integración en trámite» mientras no responde');
    const url = await w.inputValue('[data-po="broku"] [data-url]');
    ok(/\/feeds\/[^/]+\/broku\.xml$/.test(url), 'cada portal de feed muestra su dirección pública (la sirve la API): ' + url);
    // activar Chilepropiedades y Broku: lo que se publique entra al feed
    for (const id of ['chilepropiedades', 'broku']) {
      await w.click(`[data-po="${id}"] [role="switch"]`); if (id === 'chilepropiedades') await w.fill('[data-po="chilepropiedades"] [data-token]', 'token-demo');
      await w.click(`[data-po="${id}"] [data-save]`); await w.waitForSelector(`[data-po="${id}"].on`);
    }
    ok(/Feed activo|Integración activa/.test(await txt('[data-po="broku"]')), 'al activar Broku deja de estar «en trámite»');

    await w.screenshot({ path: path.join(__dirname, 'portales-tarjetas.png') });
    // 2. publicar en los tres
    const r = await call('pubPublicar', p.id, op, ['pi', 'chilepropiedades', 'broku'], {});
    ok(r.resultados.every((x) => x.ok), 'publica en Portal Inmobiliario, Chilepropiedades y Broku: ' + r.resultados.map((x) => x.portal + ':' + x.ok).join(' '));
    ok(await estado('pi') === 'active' && await estado('chilepropiedades') === 'en_feed' && await estado('broku') === 'en_feed', 'estados: activo en la API y «en el feed» en los otros dos');
    const nFeed = async (portal) => (await call('pubFeed', portal)).avisos;
    ok(await nFeed('broku') === 1 && await nFeed('chilepropiedades') === 1, 'el feed de cada portal trae el aviso');

    // 3. CRUD en los portales de feed
    for (const portal of ['broku', 'chilepropiedades']) {
      const acc = (q) => call('pubAccion', p.id, op, portal, q);
      ok((await acc('actualizar')).estado === 'en_feed', `${portal}: actualizar mantiene el aviso en el feed`);
      ok((await acc('pausar')).estado === 'pausada' && await nFeed(portal) === 0, `${portal}: pausar lo saca del feed`);
      ok(/ya está|no|solo/i.test(await falla('pubAccion', p.id, op, portal, 'pausar') || ''), `${portal}: pausar dos veces avisa`);
      ok((await acc('reactivar')).estado === 'en_feed' && await nFeed(portal) === 1, `${portal}: reactivar lo devuelve al feed`);
      ok((await acc('retirar')).estado === 'retirada' && await nFeed(portal) === 0, `${portal}: retirar lo saca del feed`);
      ok((await acc('publicar')).estado === 'en_feed' && await nFeed(portal) === 1, `${portal}: publicar de nuevo lo devuelve`);
    }
    // 4. Portal Inmobiliario por su API
    const pi = (q) => call('pubAccion', p.id, op, 'pi', q);
    ok((await pi('actualizar')).estado === 'active', 'Portal Inmobiliario: actualizar el aviso por API');
    ok((await pi('pausar')).estado === 'paused', 'Portal Inmobiliario: pausar');
    ok((await pi('reactivar')).estado === 'active', 'Portal Inmobiliario: reactivar');
    ok((await pi('retirar')).estado === 'closed', 'Portal Inmobiliario: retirar = finalizar el aviso');

    // 5. en la pantalla Avisos: el menú de acciones de cada portal, con confirmación al retirar o eliminar
    await w.click('#pbTabs [data-t="avisos"]'); await w.waitForSelector('.pb-av .pb-pts');
    const nombres = await w.$$eval('.pb-pt', (l) => l.map((e) => e.textContent.trim().split(/\s+/)[0]));
    ok(nombres.length >= 3 && (await w.$$('.pb-pt [data-mas]')).length === nombres.length, 'cada portal del aviso tiene su menú de acciones: ' + nombres.join(', '));
    const menuCP = '.pb-pt:has-text("Chilepropiedades") [data-mas]';
    await w.click(menuCP); await w.waitForSelector('[role="menu"]');
    const items = await w.$$eval('[role="menu"] [role="menuitem"]', (l) => l.map((e) => e.textContent.trim()));
    ok(['Actualizar el aviso', 'Pausar', 'Retirar', 'Eliminar'].every((t) => items.includes(t)), 'el menú ofrece lo que corresponde al estado: ' + items.join(' · '));
    await w.click('[role="menu"] [role="menuitem"]:has-text("Pausar")'); await w.waitForTimeout(500);
    ok(await estado('chilepropiedades') === 'pausada', 'Pausar desde el menú lo saca del feed');
    await w.click(menuCP); await w.click('[role="menu"] [role="menuitem"]:has-text("Eliminar")'); await w.waitForSelector('[role="dialog"]');
    ok(/Eliminar el aviso/.test(await txt('[role="dialog"]')) && await estado('chilepropiedades') === 'pausada', 'Eliminar pide confirmación antes de hacer nada');
    await w.click('[role="dialog"] button:has-text("Eliminar")'); await w.waitForTimeout(600);
    ok(await estado('chilepropiedades') === null, 'al confirmar se quita el aviso de Asset');
    ok(/no tiene aviso/.test(await falla('pubAccion', p.id, op, 'chilepropiedades', 'pausar') || ''), 'sobre un aviso que ya no existe, el error lo explica');
    ok((await pi('eliminar')) && await estado('pi') === null, 'Portal Inmobiliario: eliminar finaliza el aviso y lo quita de la ficha');
    ok(/no válida|no válido/i.test(await falla('pubAccion', p.id, op, 'broku', 'borrar') || '') && /no válido/i.test(await falla('pubAccion', p.id, op, 'otro', 'pausar') || ''), 'una acción o un portal que no existen se rechazan');

    // 6. Configuración › Integraciones muestra los mismos portales
    await w.click('#userBtn'); await w.click('[data-um="integraciones"]'); await w.waitForSelector('#view-integraciones:not(.hidden) [data-integracion="mercadolibre"]', { timeout: 15000 });
    const filas = await w.$$eval('#view-integraciones [data-integracion]', (l) => l.map((e) => e.getAttribute('data-integracion')));
    ok(['chilepropiedades', 'broku', 'toctoc', 'yapo'].every((i) => filas.includes(i)), 'Integraciones lista los mismos portales: ' + filas.join(', '));
    ok(/Configurar/.test(await txt('#view-integraciones [data-integracion="broku"]')), 'y cada uno lleva a su configuración');
    ok(!errs.length, 'sin errores en la consola' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK');
  } catch (e) { console.error(e.message); process.exitCode = 1; } finally { await app.close(); }
})();
