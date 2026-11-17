// Negocios › Documentos: la ventana muestra TODOS los documentos del negocio (orden y acta de visita, carta oferta, reserva,
// contrato y acta de entrega), no solo los de las etapas con firma; los que faltan salen «Pendiente».
// Requiere el bundle compilado: yarn build:ui.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };

(async () => {
  const raiz = path.join(__dirname, '..');
  if (!fs.existsSync(path.join(raiz, 'src/renderer/react/react-ui.js'))) throw new Error('Falta el bundle: corre «yarn build:ui» antes');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-docs-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${path.join(tmp, 'ud')}`], cwd: raiz, env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: path.join(tmp, 'inmo') } });
  const w = await app.firstWindow(); const errs = [];
  w.on('pageerror', (e) => errs.push(e.message)); w.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
  const txt = (s) => w.innerText(s).then((t) => (t || '').replace(/\s+/g, ' '));
  try {
    await w.setViewportSize({ width: 1400, height: 900 });
    await w.waitForFunction(() => window.Negocios && window.ReactUI, null, { timeout: 15000 }); await w.waitForTimeout(500);
    const cli = await call('inmoPerGuardar', { nombre: 'Paula Fuentes', rut: '12.345.678-5', email: 'paula@correo.cl', roles: ['arrendatario'] });
    const p = await call('inmoPropGuardar', { titulo: 'Depto Ñuñoa', tipo: 'departamento', arriendo: true, direccion: 'Irarrázaval 1', comuna: 'Ñuñoa' });
    const n = await call('negGuardar', { tipo: 'arriendo', propId: p.id, clienteId: cli.id });
    let v = await call('negObtener', n.id);
    const ids = (x) => (x.documentos || []).map((d) => d.id).join(',');
    ok(ids(v) === 'orden,acta,oferta,reserva,contrato,entrega_acta', 'un arriendo nuevo lista los 6 documentos del proceso, en orden: ' + ids(v));
    ok(v.documentos.every((d) => d.estado === 'pendiente'), 'todos «pendiente» al empezar');
    await call('negFirmaVincular', n.id, 'oferta', '9001');
    await call('negFirmaVincular', n.id, 'reserva', '9002');
    await call('negFirmaVincular', n.id, 'entrega_acta', '9003');
    v = await call('negObtener', n.id);
    const d = (id) => v.documentos.find((x) => x.id === id);
    ok(d('oferta').estado === 'en_firma' && String(d('oferta').operacion) === '9001' && d('entrega_acta').estado === 'en_firma', 'la carta oferta y el acta de entrega (fuera del embudo) también aparecen');

    await w.click('#nav [data-view="negocios"]'); await w.waitForSelector('#view-negocios:not(.hidden)');
    await w.evaluate((id) => window.Negocios.abrirNegocio(id), n.id); await w.waitForSelector('#ngPlDoc');
    ok(/0 de 6 firmados/.test(await txt('#ngPlDoc')), 'el resumen cuenta todos los documentos: ' + (await txt('#ngPlDoc')));
    await w.click('#ngPlDoc'); await w.waitForSelector('[data-doc="oferta"]');
    const filas = await w.$$eval('[data-doc]', (l) => l.map((e) => e.getAttribute('data-doc')));
    ok(filas.length === 6 && filas.join(',') === 'orden,acta,oferta,reserva,contrato,entrega_acta', 'la ventana muestra los 6 documentos: ' + filas.join(','));
    const t = (await w.$$eval('[data-doc]', (l) => l.map((e) => e.textContent.replace(/\s+/g, ' ')))).join(' | ');
    ok(/Carta oferta/.test(t) && /Acta de entrega e inventario/.test(t) && /Orden de visita/.test(t) && /Acta de visita/.test(t) && /Reserva de arriendo/.test(t) && /Contrato de arriendo/.test(t), 'con el nombre de cada uno');
    ok(/En firma · op\. 9001/.test(t) && /Pendiente/.test(t), 'cada uno con su estado');
    await w.keyboard.press('Escape'); await w.waitForTimeout(300);

    // una venta no trae los documentos del arriendo
    const p2 = await call('inmoPropGuardar', { titulo: 'Casa Vitacura', tipo: 'casa', venta: true, direccion: 'Kennedy 1', comuna: 'Vitacura' });
    const vta = await call('negGuardar', { tipo: 'venta', propId: p2.id, clienteId: cli.id });
    const vv = await call('negObtener', vta.id);
    ok(ids(vv) === 'orden,acta,reserva,promesa,escritura,entrega', 'una venta: orden, acta, oferta o reserva, promesa, escritura y entrega: ' + ids(vv));
    ok(!errs.length, 'sin errores en la consola' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK');
  } catch (e) { console.error(e.message); process.exitCode = 1; } finally { await app.close(); }
})();
