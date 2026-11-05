// Ficha de la propiedad y detalle de la persona (React): franja de resumen, pestañas (también con Inmo.fichaTab),
// comercialización, nota en el historial, vincular persona (formulario en React), quitar el vínculo, archivar,
// recargar desde el código antiguo (renderFicha) y el detalle de la persona con su nota y sus propiedades.
// Requiere el bundle compilado: yarn build:ui
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };

(async () => {
  const raiz = path.join(__dirname, '..');
  if (!fs.existsSync(path.join(raiz, 'src/renderer/react/react-ui.js'))) throw new Error('Falta el bundle: corre «yarn build:ui» antes');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-fichaprop-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${path.join(tmp, 'ud')}`], cwd: raiz, env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: path.join(tmp, 'inmo') } });
  const w = await app.firstWindow(); const errs = [];
  w.on('pageerror', (e) => errs.push(e.message)); w.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
  const txt = (s) => w.innerText(s).then((t) => (t || '').replace(/\s+/g, ' '));
  const visible = (s) => w.isVisible(s);
  try {
    await w.setViewportSize({ width: 1500, height: 950 });
    await w.waitForFunction(() => window.Inmo && window.ReactUI, null, { timeout: 15000 }); await w.waitForTimeout(500);

    const dueno = await call('inmoPerGuardar', { nombre: 'Rosa Pérez Mena', rut: '11.111.111-1', email: 'rosa@correo.cl', telefono: '+56988887777', roles: ['propietario'] });
    const cli = await call('inmoPerGuardar', { nombre: 'Andrés Soto', email: 'andres@correo.cl', roles: ['comprador'] });
    const p = await call('inmoPropGuardar', { titulo: 'Casa La Reina', tipo: 'casa', venta: true, precioVenta: { valor: 12500, moneda: 'UF' }, direccion: 'Larraín 6000', comuna: 'La Reina', dormitorios: 4, banos: 3, descripcion: 'Casa amplia con jardín' });
    await call('inmoVincular', p.id, dueno.id, 'propietario');

    // abrir desde la Cartera
    await w.click('#nav [data-view="cartera"]'); await w.waitForSelector(`.im-card[data-id="${p.id}"]`);
    await w.click(`.im-card[data-id="${p.id}"]`); await w.waitForSelector('#view-cartera .im-ficha #fBack');
    ok(/Casa La Reina/.test(await txt('.im-ft h1')) && /casa/i.test(await txt('.im-ft .im-code')) && /Larraín 6000 · La Reina/.test(await txt('.im-ft')), 'título, tipo y dirección');
    ok(await w.evaluate(() => window.Inmo._IM.ficha) === p.id && await w.evaluate(() => window.Inmo.fichaAbierta()), 'IM.ficha y fichaAbierta() siguen funcionando');
    ok(/UF 12\.500/.test(await txt('#fStrip')) && /Disponible/.test(await txt('#fStrip')), 'la franja muestra precio y estado');
    await w.waitForFunction(() => /\d+ de \d+/.test(document.querySelector('#fStripCapt')?.textContent || ''), null, { timeout: 8000 });
    ok(true, 'la franja muestra el avance de la captación');
    await w.waitForSelector('#fCapt .et-next', { timeout: 8000 });
    ok(true, 'la captación (Etapas.bloque) se dibuja dentro de la ficha');
    ok(/Dormitorios 4/.test(await txt('[data-caracteristicas]')) && /Casa amplia con jardín/.test(await txt('[data-pane="resumen"]')), 'características y descripción');
    ok(/Rosa Pérez Mena/.test(await txt('[data-pane="resumen"] [data-pv]')) && /Propietario · 11\.111\.111-1/.test(await txt('[data-pane="resumen"] [data-pv]')), 'personas vinculadas con rol y RUT');

    // pestañas: con clic y con Inmo.fichaTab
    await w.click('[data-tab="historial"]'); await w.waitForSelector('[data-pane="historial"]:not(.hidden) #fNotaT');
    ok(!(await visible('[data-pane="resumen"]')) && await w.$eval('[data-tab="historial"]', (b) => b.getAttribute('aria-selected') === 'true'), 'clic en una pestaña muestra solo su panel');
    await w.evaluate(() => window.Inmo.fichaTab('firmas')); await w.waitForSelector('[data-pane="firmas"]:not(.hidden) #fDocs');
    ok(await visible('#fFirmasBox'), 'Inmo.fichaTab("firmas") cambia de pestaña');
    await w.click('.im-sc[data-go="negocios"]'); await w.waitForSelector('[data-pane="negocios"]:not(.hidden)');
    ok(/Sin negocios/.test(await txt('[data-pane="negocios"]')), 'la franja lleva a Negocios');
    await w.evaluate(() => window.Inmo.fichaTab('portales')); await w.waitForSelector('#fPI');
    ok(/No publicado/.test(await txt('#fPI')) && await visible('#fPI [data-pi="publicar"]'), 'Portales: el aviso sin publicar');
    await w.click('[data-tab="propietario"]'); await w.waitForSelector('.im-dueno');
    ok(/Rosa Pérez Mena/.test(await txt('#fDueno')) && !!(await w.$('#fCaptador')), 'Propietario: datos del dueño y quién captó');
    await w.fill('[data-dnota]', 'Prefiere que la llamen en la tarde'); await w.click('[data-dguardar]'); await w.waitForSelector('text=Notas guardadas.');
    ok((await call('inmoListar')).personas.find((c) => c.id === dueno.id).notas === 'Prefiere que la llamen en la tarde', 'guarda las notas sobre el propietario');

    // comercialización
    await w.click('[data-tab="resumen"]'); await w.selectOption('[data-est="estadoVenta"]', 'reservada'); await w.waitForSelector('text=Estado: venta reservada', { timeout: 8000 });
    ok(/Reservada/.test(await txt('#fStrip')), 'cambiar el estado actualiza la franja y el historial');

    // nota en el historial
    await w.click('[data-tab="historial"]'); await w.fill('#fNotaT', 'Visita con Andrés el sábado'); await w.press('#fNotaT', 'Enter');
    await w.waitForSelector('[data-pane="historial"] [data-historial] li[data-nota]');
    ok(/Visita con Andrés el sábado/.test(await txt('[data-pane="historial"] [data-historial]')) && (await w.inputValue('#fNotaT')) === '', 'agrega la nota y limpia la caja');

    // vincular persona (formulario en ventana en React)
    await w.click('[data-tab="resumen"]'); await w.click('#fVinc'); await w.waitForSelector('#modalCard #vQ');
    await w.selectOption('#vRol', 'comprador'); await w.fill('#vQ', 'andrés');
    await w.waitForFunction(() => document.querySelectorAll('#vList [data-c]').length === 1);
    ok(true, 'el buscador del CRM filtra por nombre');
    await w.click(`#vList [data-c="${cli.id}"]`); await w.waitForSelector('#modal.hidden', { state: 'attached' });
    await w.waitForSelector('[data-pane="resumen"] [data-pv]:has-text("Andrés Soto")');
    ok(/Comprador/.test(await txt('[data-pane="resumen"] [data-pv]:has-text("Andrés Soto")')), 'vincula a la persona con el rol elegido');
    await w.click(`[data-unl="${cli.id}"]`); await w.waitForFunction(() => ![...document.querySelectorAll('[data-pane="resumen"] [data-pv]')].some((x) => /Andrés Soto/.test(x.textContent)));
    ok(true, 'quitar el vínculo');

    // «Datos básicos» sigue en inmo.js: al guardar, la ficha se recarga sin desmontarse
    await w.evaluate(() => { document.querySelector('.im-ficha').dataset.marca = '1'; });
    await w.click('#fEdit'); await w.fill('#pf_titulo', 'Casa mediterránea La Reina'); await w.click('#mOk');
    await w.waitForSelector('h1:has-text("Casa mediterránea La Reina")');
    ok(await w.evaluate(() => document.querySelector('.im-ficha')?.dataset.marca === '1'), 'después de «Datos básicos» la ficha se recarga en su lugar');

    // archivar y restaurar
    await w.click('#fArch'); await w.waitForSelector('#fArch:has-text("Restaurar")');
    ok((await call('inmoListar')).propiedades.find((x) => x.id === p.id).archivada, 'archivar');
    await w.click('#fArch'); await w.waitForSelector('#fArch:has-text("Archivar")');

    // detalle de la persona
    await w.click('[data-pane="resumen"] [data-per]'); await w.waitForSelector('#view-personas #pBack');
    ok(/Rosa Pérez Mena/.test(await txt('#view-personas h1')) && /RUT 11\.111\.111-1/.test(await txt('#view-personas header')), 'abre la persona desde la ficha');
    ok((await w.$$('#view-personas [data-p]')).length === 1 && /Prefiere que la llamen/.test(await txt('#view-personas')), 'muestra su propiedad y sus notas');
    await w.waitForSelector('#pDocs h3:has-text("(")'); ok(/Aún no firma documentos/.test(await txt('#pDocs')), 'documentos que firma (dgPersona)');
    await w.fill('#pNotaT', 'Llamó para preguntar por la reserva'); await w.press('#pNotaT', 'Enter');
    await w.waitForSelector('#view-personas [data-historial] li[data-nota]'); ok(/Llamó para preguntar/.test(await txt('#view-personas [data-historial]')), 'nota en el historial de la persona');
    await w.click('#view-personas [data-p]'); await w.waitForSelector('#view-cartera .im-ficha #fBack');
    ok(/Casa mediterránea/.test(await txt('.im-ft h1')), 'desde la persona vuelve a la propiedad');

    // eliminar persona (formulario en React) y volver a la lista
    await w.evaluate((id) => window.Inmo.abrirPersona(id), cli.id); await w.waitForSelector('#view-personas h1:has-text("Andrés Soto")');
    await w.click('#pDel'); await w.click('#mOk'); await w.waitForSelector('#view-personas #cQ');
    ok(!(await call('inmoListar')).personas.some((c) => c.id === cli.id), 'eliminar persona vuelve a la lista');
    await w.click('#nav [data-view="cartera"]'); await w.waitForSelector('#view-cartera #imQ');
    ok(true, 'la lista de la Cartera vuelve a montarse');

    const relevantes = errs.filter((e) => /Content Security Policy|ReactUI|react|removeChild|insertBefore|not a child|Minified/i.test(e));
    ok(relevantes.length === 0, 'sin errores de React ni de CSP' + (relevantes.length ? ': ' + relevantes.join(' | ') : ''));
    console.log('\nficha-propiedad-e2e: todo bien');
  } finally { await app.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exit(1); });
