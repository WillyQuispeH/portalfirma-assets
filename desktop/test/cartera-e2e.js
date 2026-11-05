// Cartera y Personas (React): filtros, búsqueda, filtros que llegan desde otra pantalla, foto que no carga,
// y el ir y volver entre la lista (React) y la ficha / persona / Portales (src/renderer/inmo.js), que se
// dibujan en el mismo contenedor. Requiere el bundle compilado: yarn build:ui
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };

(async () => {
  const raiz = path.join(__dirname, '..');
  if (!fs.existsSync(path.join(raiz, 'src/renderer/react/react-ui.js'))) throw new Error('Falta el bundle: corre «yarn build:ui» antes');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-cartera-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${path.join(tmp, 'ud')}`], cwd: raiz, env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: path.join(tmp, 'inmo') } });
  const w = await app.firstWindow(); const errs = [];
  w.on('pageerror', (e) => errs.push(e.message)); w.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
  const txt = (s) => w.innerText(s).then((t) => (t || '').replace(/\s+/g, ' '));
  const tarjetas = () => w.$$eval('#view-cartera .im-card', (x) => x.length);
  const cartera = async () => { await w.click('#nav [data-view="cartera"]'); await w.waitForSelector('#view-cartera:not(.hidden) #imQ'); await w.waitForTimeout(300); };
  try {
    await w.setViewportSize({ width: 1500, height: 950 });
    await w.waitForFunction(() => window.Inmo && window.ReactUI, null, { timeout: 15000 }); await w.waitForTimeout(500);

    await cartera();
    ok(/Aún no tienes propiedades/.test(await txt('#view-cartera')), 'sin propiedades lo dice');

    const dueno = await call('inmoPerGuardar', { nombre: 'Rosa Pérez Mena', rut: '11.111.111-1', email: 'rosa@correo.cl', telefono: '+56988887777', roles: ['propietario'] });
    const cli = await call('inmoPerGuardar', { nombre: 'Andrés Soto', email: 'andres@correo.cl', roles: ['comprador'] });
    const pV = await call('inmoPropGuardar', { titulo: 'Casa La Reina', tipo: 'casa', venta: true, precioVenta: { valor: 12500, moneda: 'UF' }, direccion: 'Larraín 6000', comuna: 'La Reina', dormitorios: 4, banos: 3 });
    const pA = await call('inmoPropGuardar', { titulo: 'Depto Ñuñoa', tipo: 'departamento', arriendo: true, precioArriendo: { valor: 650000, moneda: 'CLP' }, direccion: 'Irarrázaval 100', unidad: '502', comuna: 'Ñuñoa', fotos: ['file:///no/existe/foto.jpg'] });
    await call('inmoPropGuardar', { titulo: 'Oficina Centro', tipo: 'oficina', venta: true, arriendo: true, direccion: 'Huérfanos 1', comuna: 'Santiago' });
    await call('inmoVincular', pV.id, dueno.id, 'propietario');

    await w.click('#nav [data-view="personas"]'); await cartera();
    ok(await tarjetas() === 3, 'muestra las 3 propiedades');
    ok(/3 propiedades/.test(await txt('#view-cartera [data-cabecera]')), 'cuenta las propiedades activas');
    const casa = await txt(`.im-card[data-id="${pV.id}"]`);
    ok(/UF 12\.500/.test(casa) && /Larraín 6000 · La Reina/.test(casa) && /Disponible/.test(casa), 'la tarjeta muestra precio, dirección y estado');
    ok(/\$650\.000\/mes/.test(await txt(`.im-card[data-id="${pA.id}"]`)) && /depto\. 502/.test(await txt(`.im-card[data-id="${pA.id}"]`)), 'arriendo en pesos por mes y la unidad');
    await w.waitForSelector(`.im-card[data-id="${pA.id}"] .im-noph`);
    ok(true, 'si la foto no carga, muestra el ícono (sin tocar el DOM de React)');

    await w.click('#imOp [data-op="arriendo"]'); await w.waitForFunction(() => document.querySelectorAll('#view-cartera .im-card').length === 2);
    ok(true, 'filtro Arriendo');
    await w.click('#imOp [data-op="todas"]'); await w.selectOption('#imTipo', 'casa'); await w.waitForFunction(() => document.querySelectorAll('#view-cartera .im-card').length === 1);
    ok(true, 'filtro por tipo');
    await w.selectOption('#imTipo', ''); await w.fill('#imQ', 'rosa'); await w.waitForFunction(() => document.querySelectorAll('#view-cartera .im-card').length === 1);
    ok(!!(await w.$(`.im-card[data-id="${pV.id}"]`)), 'la búsqueda encuentra por el nombre del propietario');

    // lista (React) → ficha (inmo.js) → lista, varias veces, en el mismo contenedor
    for (let i = 0; i < 3; i++) {
      await w.click(`.im-card[data-id="${pV.id}"]`); await w.waitForSelector('#view-cartera .im-ficha #fBack');
      await w.click('#fBack'); await w.waitForSelector('#view-cartera #imQ');
    }
    ok((await w.inputValue('#imQ')) === 'rosa' && await tarjetas() === 1, 'ir a la ficha y volver (3 veces) conserva la búsqueda');
    await w.fill('#imQ', ''); await w.waitForFunction(() => document.querySelectorAll('#view-cartera .im-card').length === 3);

    await w.click('#imPort'); await w.waitForSelector('#view-cartera #poBack', { timeout: 15000 }); await w.click('#poBack'); await w.waitForSelector('#view-cartera #imQ');
    ok(await tarjetas() === 3, 'Portales y volver');

    // filtros que llegan desde otra pantalla (p. ej. el Inicio)
    await w.evaluate(() => window.Inmo.cartera({ especial: 'sinFotos', op: 'todas' })); await w.waitForSelector('.im-chip');
    ok(await tarjetas() === 2 && /Sin fotos/.test(await txt('.im-chip')), 'Inmo.cartera({ especial: "sinFotos" }) filtra y muestra el chip');
    await w.click('[data-clr="especial"]'); await w.waitForFunction(() => document.querySelectorAll('#view-cartera .im-card').length === 3);
    ok(!(await w.$('.im-chip')), 'quitar el chip quita el filtro');

    await call('inmoPropArchivar', pA.id, true); await cartera();
    ok(await tarjetas() === 2, 'la archivada no aparece');
    await w.click('#imArch'); await w.waitForFunction(() => document.querySelectorAll('#view-cartera .im-card').length === 1);
    ok(!!(await w.$(`.im-card[data-id="${pA.id}"]`)) && /Ver activas/.test(await txt('#imArch')), '«Ver archivadas»');
    await w.click('#imArch');

    // «Nueva propiedad»: el formulario sigue en inmo.js y al crearla abre su ficha
    await w.click('#imNew'); await w.waitForSelector('#modalCard #mOk'); await w.click('#mCancel');
    ok(true, '«Nueva propiedad» abre el formulario');

    // Personas
    await w.click('#nav [data-view="personas"]'); await w.waitForSelector('#view-personas:not(.hidden) #cQ'); await w.waitForTimeout(300);
    const filas = () => w.$$eval('#view-personas tr[data-c]', (x) => x.length);
    ok(await filas() === 2 && /2 en tu CRM/.test(await txt('#view-personas header')), 'lista las personas');
    ok(/1$/.test((await txt(`tr[data-c="${dueno.id}"]`)).trim()), 'cuenta sus propiedades');
    await w.click('#cRol [data-r="comprador"]'); await w.waitForFunction(() => document.querySelectorAll('#view-personas tr[data-c]').length === 1);
    ok(!!(await w.$(`tr[data-c="${cli.id}"]`)), 'filtro por rol');
    await w.click('#cRol [data-r=""]'); await w.fill('#cQ', '11111111'); await w.waitForFunction(() => document.querySelectorAll('#view-personas tr[data-c]').length === 1);
    ok(!!(await w.$(`tr[data-c="${dueno.id}"]`)), 'busca por RUT sin puntos ni guion');
    for (let i = 0; i < 2; i++) {
      await w.click(`tr[data-c="${dueno.id}"]`); await w.waitForSelector('#view-personas #pBack');
      await w.click('#pBack'); await w.waitForSelector('#view-personas #cQ');
    }
    ok((await w.inputValue('#cQ')) === '11111111', 'ir a la persona y volver conserva la búsqueda');
    await w.click('#cNew'); await w.waitForSelector('[role=dialog] #mOk'); await w.click('#mCancel');
    ok(true, '«Nueva persona» abre el formulario');

    // el Agente refresca la pantalla visible (AssetRefrescar vuelve a montar la lista)
    await cartera(); await call('inmoPropGuardar', { titulo: 'Bodega Quilicura', tipo: 'bodega', venta: true, direccion: 'Lo Echevers 1', comuna: 'Quilicura' });
    await w.evaluate(() => window.AssetRefrescar()); await w.waitForFunction(() => document.querySelectorAll('#view-cartera .im-card').length === 3);
    ok(true, 'AssetRefrescar muestra la propiedad nueva');

    const relevantes = errs.filter((e) => /Content Security Policy|ReactUI|react|removeChild|insertBefore|not a child/i.test(e));
    ok(relevantes.length === 0, 'sin errores de React ni de CSP' + (relevantes.length ? ': ' + relevantes.join(' | ') : ''));
    console.log('\ncartera-e2e: todo bien');
  } finally { await app.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exit(1); });
