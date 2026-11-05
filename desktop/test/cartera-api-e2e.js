// La cartera contra la API real de Asset (SIN PF_MOCK): la app entra con el administrador de api/.env
// (SEMBRAR_ADMIN_*, que no se imprimen), carga la cartera desde la base y escribe a través de la API.
// Revisa: ingresar; la cartera muestra las propiedades de la base; editar una desde «Datos básicos» (y que quede en la
// base); un cambio puntual en segundo plano (parchear → PATCH encolado); la sincronización por cambios al volver a la
// ventana; crear una persona y vincularla desde la ficha; la nota en el historial; importar desde Portalfirma (simulado)
// hacia POST /propiedades/importar. Al final deshace todo lo que creó
// o cambió, con @prisma/client desde api/ (como api/test/cartera-e2e.js).
// Requiere la API corriendo (start-dev.ps1 o `yarn dev` en api/): http://localhost:3000/v1/salud con db:true.
// Uso: node test/cartera-api-e2e.js [url-de-la-api]
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };

const API_DIR = path.join(__dirname, '..', '..', 'api');
const env = Object.fromEntries(fs.readFileSync(path.join(API_DIR, '.env'), 'utf8').split(/\r?\n/).map((l) => /^([A-Z_]+)=(.*)$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2].trim().replace(/^"(.*)"$/, '$1')]));
const API = (process.argv[2] || 'http://localhost:3000') + '/v1';
process.env.DATABASE_URL ||= env.DATABASE_URL;
const { PrismaClient } = require(path.join(API_DIR, 'node_modules', '@prisma/client'));
const SUF = Date.now().toString(36);
const dv = (n) => { let s = 0, m = 2; for (const d of String(n).split('').reverse()) { s += Number(d) * m; m = m === 7 ? 2 : m + 1; } const r = 11 - (s % 11); return r === 11 ? '0' : r === 10 ? 'K' : String(r); };
const rut = (n) => `${n}-${dv(n)}`;
const req = async (metodo, ruta, cuerpo, token) => {
  const r = await fetch(API + ruta, { method: metodo, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  let j = null; try { j = await r.json(); } catch {} return { s: r.status, j };
};

(async () => {
  const salud = await fetch(API + '/salud').then((r) => r.json()).catch(() => null);
  if (!salud?.db) { console.error(`La API no responde en ${API} (o no llega a la base). Levántala con start-dev.ps1.`); process.exit(1); }
  const db = new PrismaClient();
  const inicio = new Date();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-api-'));
  const creadas = { personas: [], props: [] }; let prop = null; let antes = null; let admin = null;
  let app = null;
  try {
    admin = await db.usuario.findUnique({ where: { email: String(env.SEMBRAR_ADMIN_EMAIL).toLowerCase() } });
    ok(admin && admin.rol === 'ADMIN', 'el administrador de api/.env existe en la base');
    const enBase = await db.propiedad.findMany({ where: { corredoraId: admin.corredoraId, eliminadoEn: null }, select: { id: true, codigo: true, archivada: true, origenSistema: true }, orderBy: { codigo: 'asc' } });
    ok(enBase.length > 0, `la corredora tiene ${enBase.length} propiedades en la base`);
    prop = enBase.find((p) => !p.archivada && /^WE-/.test(p.codigo)) || enBase.find((p) => !p.archivada);
    antes = await db.propiedad.findUnique({ where: { id: prop.id }, select: { notasInternas: true, gastosComunes: true, editados: true, leadsPortal: true, version: true } });

    app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${path.join(tmp, 'ud')}`], cwd: path.join(__dirname, '..'),
      env: { ...process.env, PF_MOCK: '', PF_MOCK_LOGGED: '', PF_MOCK_ASSET_LOGIN: '', PF_ASSET_API: API, PF_INMO_DIR: path.join(tmp, 'inmo'), PF_AI_MANAGED: 'none', PF_NO_TOURS: '1' } });
    const w = await app.firstWindow(); const errs = [];
    w.on('pageerror', (e) => errs.push(e.message));
    const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
    const txt = (s) => w.textContent(s).then((t) => (t || '').replace(/\s+/g, ' '));
    await w.setViewportSize({ width: 1500, height: 960 });

    // 1) ingresar con la cuenta de Asset
    await w.waitForSelector('#assetAcceso #acEmail', { timeout: 20000 });
    await w.fill('#acEmail', env.SEMBRAR_ADMIN_EMAIL); await w.fill('#acClave', env.SEMBRAR_ADMIN_CLAVE); await w.click('#acEntrar');
    await w.waitForSelector('#assetAcceso', { state: 'detached', timeout: 30000 });
    const st = await call('accEstado');
    ok(st.esAdmin && st.usuarioId === admin.id, 'entra con el usuario de Asset (administrador) y la app toma su rol');

    // 2) la cartera viene de la base
    const L = await call('inmoListar');
    ok(L.propiedades.length === enBase.length && enBase.every((p) => L.propiedades.some((x) => x.id === p.id && x.codigo === p.codigo)), `la copia en memoria tiene las ${enBase.length} propiedades de la base (mismos id y código)`);
    await w.click('#nav [data-view="cartera"]'); await w.waitForSelector('.im-card', { timeout: 15000 });
    const ids = await w.$$eval('.im-card', (l) => l.map((b) => b.dataset.id));
    const activas = enBase.filter((p) => !p.archivada);
    ok(activas.every((p) => ids.includes(p.id)) && ids.length === activas.length, `la Cartera muestra las ${activas.length} activas de la base`);
    ok(new RegExp(prop.codigo).test(await txt(`.im-card[data-id="${prop.id}"]`)), `con su código (${prop.codigo})`);

    // 3) editar una desde «Datos básicos»: queda en la base, vía la API, con su versión y en el historial
    await w.evaluate((id) => window.Inmo.abrirFicha(id), prop.id); await w.waitForSelector('#fEdit'); await w.click('#fEdit');
    await w.waitForSelector('#pf_notasInternas'); const nota = `E2E nota interna ${SUF}`;
    await w.fill('#pf_notasInternas', nota); await w.click('#mOk');
    await w.waitForFunction(() => document.getElementById('modal')?.classList.contains('hidden'), null, { timeout: 15000 });
    let real = await db.propiedad.findUnique({ where: { id: prop.id } });
    ok(real.notasInternas === nota && real.version > antes.version, 'el cambio quedó en la base (y subió la versión)');
    ok(!!(await db.actividad.findFirst({ where: { entidadId: prop.id, usuarioId: admin.id, fecha: { gte: inicio }, texto: { startsWith: 'Ficha actualizada' } } })), 'el historial de la base registra quién lo cambió');
    if (real.origenSistema) ok(real.editados.includes('notasInternas'), 'como viene de Portalfirma, la próxima importación respeta lo editado aquí');

    // 4) un cambio puntual en segundo plano (parchear): el interesado de un portal se envía solo a la API
    await call('pubAgregarInteresado', prop.id, { nombre: `E2E Interesado ${SUF}`, portal: 'otro', canal: 'manual', telefono: '+5699' + String(Date.now()).slice(-7) });
    let leadOk = false; let perInteresado = null; const vinculado = () => !!perInteresado && real.vinculos.some((v) => v.personaId === perInteresado.id && v.rol === 'interesado');
    for (let i = 0; i < 60 && !(leadOk && vinculado()); i++) {
      await new Promise((r) => setTimeout(r, 300));
      real = await db.propiedad.findUnique({ where: { id: prop.id }, include: { vinculos: true } });
      leadOk = (real.leadsPortal || []).some((l) => l.nombre === `E2E Interesado ${SUF}`);
      perInteresado ||= await db.persona.findFirst({ where: { corredoraId: admin.corredoraId, nombre: `E2E Interesado ${SUF}` } });
      if (perInteresado && !creadas.personas.includes(perInteresado.id)) creadas.personas.push(perInteresado.id);
    }
    ok(leadOk, 'el interesado agregado (cambio encolado con parchear) llegó a la base');
    ok(vinculado(), 'y quedó como persona vinculada como interesado (en segundo plano)');

    // 5) sincronización por cambios: otro cambio hecho directo en la API llega al volver a la ventana
    const token = (await req('POST', '/auth/ingresar', { email: env.SEMBRAR_ADMIN_EMAIL, clave: env.SEMBRAR_ADMIN_CLAVE })).j?.tokenAcceso;
    const gc = 123456 + (Date.now() % 1000);
    const r5 = await req('PATCH', `/propiedades/${prop.id}`, { gastosComunes: gc }, token);
    ok(r5.s === 200, 'otro cliente cambia la propiedad en la API');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].emit('focus'));
    await w.waitForFunction(async ([id, v]) => { const r = await window.pf.inmoListar(); return r.ok && r.data.propiedades.find((p) => p.id === id)?.gastosComunes === v; }, [prop.id, gc], { timeout: 15000, polling: 400 });
    ok(true, 'al volver a la ventana, la copia trae solo lo que cambió (?desde=) y lo muestra');

    // 6) crear una persona y vincularla desde la ficha
    const per = await call('inmoPerGuardar', { nombre: `E2E Persona ${SUF}`, rut: rut(21000000 + (Date.now() % 900000)), email: `e2e-${SUF}@prueba.cl`, telefono: '+56911112222', roles: ['comprador'] });
    creadas.personas.push(per.id);
    const enDb = await db.persona.findUnique({ where: { id: per.id } });
    ok(enDb && enDb.corredoraId === admin.corredoraId && enDb.email === `e2e-${SUF}@prueba.cl`, 'la persona nueva quedó en la base (con el id que usa la app)');
    ok((await call('inmoPerGuardar', { nombre: 'Otra', rut: per.rut }).then(() => null, (e) => e.message) || '').includes('RUT'), 'el RUT repetido se rechaza');
    await w.evaluate((id) => window.Inmo.abrirFicha(id), prop.id); await w.waitForSelector('#fVinc'); await w.click('#fVinc');
    await w.waitForSelector('#vRol'); await w.selectOption('#vRol', 'comprador'); await w.fill('#vQ', `E2E Persona ${SUF}`);
    await w.waitForSelector(`#vList [data-c="${per.id}"]`); await w.click(`#vList [data-c="${per.id}"]`);
    let vinc = null; for (let i = 0; i < 30 && !vinc; i++) { await new Promise((r) => setTimeout(r, 300)); vinc = await db.propiedadPersona.findFirst({ where: { propiedadId: prop.id, personaId: per.id, rol: 'comprador' } }); }
    ok(!!vinc, 'el vínculo (comprador) quedó en la base');
    await w.waitForFunction((n) => (document.querySelector('#view-cartera')?.textContent || '').includes(n), `E2E Persona ${SUF}`, { timeout: 10000 });
    ok(true, 'y la ficha muestra a la persona vinculada');
    // 7) nota en el historial (POST /actividad/notas) y lo automático (POST /actividad)
    const act = await call('inmoNota', per.id, `E2E nota ${SUF}`);
    ok(act.some((a) => a.texto === `E2E nota ${SUF}` && a.tipo === 'nota'), 'la nota queda en el historial de la persona, en la base');
    ok((await call('inmoActividad', prop.id)).some((a) => /vinculado como comprador/.test(a.texto)), 'el historial de la propiedad viene de la base');
    // 8) «Importar desde Portalfirma» va a POST /v1/propiedades/importar (tandas de 100) y luego sincroniza.
    // Portalfirma se simula en el proceso principal (callRaw de property_manage_tools) con una propiedad de prueba.
    const rutDueno = rut(22000000 + (Date.now() % 900000));
    const res = await app.evaluate(async (_e, [suf, rutD]) => {
      const inmo = global.__inmo;
      const x = { id: `e2e-${suf}`, code: `E2E-IMP-${suf}`, title: `E2E Importada ${suf}`, tipo: 'departamento', sale: true, price_sale: 4321, currency_sale: 'UF', address: 'Av. Prueba 123', districtName: 'Ñuñoa',
        bedrooms: 2, bathrooms: 1, photos: ['https://ejemplo.cl/e2e.jpg'], owner_rut: rutD, owner_name: `E2E Dueña ${suf}`, owner_email: `duena-${suf}@prueba.cl` };
      const pf = { callRaw: async (_n, a) => ({ isError: false, text: JSON.stringify(a.action === 'search' ? { items: [{ id: x.id }], total_pages: 1 } : x) }) };
      return inmo.importarPF(pf);
    }, [SUF, rutDueno]);
    const imp = await db.propiedad.findFirst({ where: { corredoraId: admin.corredoraId, origenSistema: 'portalfirma', origenId: `e2e-${SUF}` }, include: { vinculos: true, fotos: true } });
    if (imp) creadas.props = [imp.id];
    const duena = await db.persona.findFirst({ where: { corredoraId: admin.corredoraId, nombre: `E2E Dueña ${SUF}` } });
    if (duena) creadas.personas.push(duena.id);
    ok(res.nuevas === 1 && res.personas === 1 && imp && Number(imp.precioVenta) === 4321 && imp.fotos.length === 1, 'importar desde Portalfirma crea la propiedad en la base (por su id de origen)');
    ok(duena && imp.vinculos.some((v) => v.personaId === duena.id && v.rol === 'propietario'), 'con su propietaria en el CRM, vinculada');
    ok((await call('inmoListar')).propiedades.some((p) => p.id === imp.id && p.origen?.sistema === 'portalfirma'), 'y la cartera la trae al sincronizar');
    ok(!errs.length, 'sin errores en la pantalla' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('\nOK cartera-api');
  } catch (e) {
    console.error(e.message); process.exitCode = 1;
  } finally {
    await new Promise((r) => setTimeout(r, 1500)); // que no quede nada en vuelo hacia la API
    await app?.close().catch(() => {});
    // deshacer: lo creado se borra de verdad; la propiedad editada vuelve a como estaba
    try {
      if (prop && antes) {
        await db.propiedadPersona.deleteMany({ where: { personaId: { in: creadas.personas } } });
        await db.propiedad.update({ where: { id: prop.id }, data: { notasInternas: antes.notasInternas, gastosComunes: antes.gastosComunes, editados: antes.editados, leadsPortal: antes.leadsPortal ?? [], version: { increment: 1 } } });
        await db.actividad.deleteMany({ where: { fecha: { gte: inicio }, OR: [{ entidadId: { in: [prop.id, ...creadas.personas] } }, { ref2: { in: creadas.personas } }] } });
      }
      if (creadas.props.length) {
        await db.actividad.deleteMany({ where: { entidadId: { in: creadas.props } } });
        await db.propiedad.deleteMany({ where: { id: { in: creadas.props } } }); // fotos y vínculos se borran en cascada
      }
      await db.propiedadPersona.deleteMany({ where: { personaId: { in: creadas.personas } } });
      await db.actividad.deleteMany({ where: { OR: [{ entidadId: { in: creadas.personas } }, { ref2: { in: creadas.personas } }] } });
      await db.persona.deleteMany({ where: { id: { in: creadas.personas } } });
      if (admin) await db.sesion.deleteMany({ where: { usuarioId: admin.id, creadoEn: { gte: inicio } } });
    } catch (e) { console.error('No se pudo deshacer todo:', e.message); process.exitCode = 1; }
    await db.$disconnect();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})();
