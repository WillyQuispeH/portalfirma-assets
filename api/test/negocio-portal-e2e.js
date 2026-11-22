// Los NEGOCIOS ajustan el aviso del portal y calculan la captación como el escritorio (src/negocios/negocio-acciones.ts + negocio-reglas.ts):
//  · mover un negocio a «reserva» con la propiedad publicada en Portal Inmobiliario PAUSA el aviso; cerrarlo perdido lo REACTIVA; vendida no lo toca
//    de nuevo; sin cuenta de portal conectada solo cambia la propiedad y no falla.
//  · los pasos de la captación (lo esencial, portales, legal, equipamiento, visita, fotos, publicada) salen de los bloques de la ficha y coinciden
//    con desktop/src/ficha-campos.js; un corredor que no captó la propiedad no ve pedido el propietario.
// Controladores y servicios REALES sobre asset_dev (la sesión la pone un middleware); solo se falsean Mercado Libre y su conexión.
// Crea sus datos (prefijo E2E-NP) y al final los borra.   Requiere compilar antes (yarn dev deja dist/).
// Uso: node test/negocio-portal-e2e.js
const fs = require('fs');
const path = require('path');
require('reflect-metadata');
const { PrismaClient } = require('@prisma/client');

const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/).map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2].trim().replace(/^"(.*)"$/, '$1')]));
let BASE = '';
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
const req = async (metodo, ruta, cuerpo, usuario) => {
  const r = await fetch(BASE + '/v1' + ruta, { method: metodo, headers: { 'content-type': 'application/json', ...(usuario ? { 'x-usuario': JSON.stringify(usuario) } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { s: r.status, j };
};
const SUF = Date.now().toString(36);
const A = (id) => `/negocios/${id}/acciones`;

// Mercado Libre falso: un aviso activo MLC1 que se pausa y reactiva
const M = { cuenta: true, llamadas: [], items: { MLC1: { id: 'MLC1', status: 'active' }, MLC3: { id: 'MLC3', status: 'active' } } };
const mlFalso = (l) => {
  M.llamadas.push({ metodo: l.metodo, ruta: l.ruta, cuerpo: l.cuerpo });
  const m = /^\/items\/(MLC\d+)$/.exec(l.ruta);
  if (l.metodo === 'PUT' && m) { Object.assign(M.items[m[1]], l.cuerpo.status ? { status: l.cuerpo.status } : {}); return { status: 200, cuerpo: M.items[m[1]] }; }
  return { status: 404, cuerpo: { message: 'ruta falsa ' + l.ruta } };
};

(async () => {
  const db = new PrismaClient();
  const creados = { props: [], personas: [], usuarios: [] };
  try {
    const { Test } = require('@nestjs/testing');
    const { ConfigService } = require('@nestjs/config');
    const { PrismaService } = require('../dist/prisma/prisma.service');
    const { ActividadService } = require('../dist/comun/actividad.service');
    const { AlmacenamientoService } = require('../dist/archivos/almacenamiento.service');
    const { NegociosService, NegociosController } = require('../dist/negocios/negocios');
    const { NegocioAccionesService, NegocioAccionesController } = require('../dist/negocios/negocio-acciones');
    const { PropiedadesService } = require('../dist/propiedades/propiedades.service');
    const { PropiedadesAccionesService } = require('../dist/propiedades/propiedades-acciones');
    const { ConvectaService } = require('../dist/propiedades/convecta');
    const { DictadoService } = require('../dist/propiedades/dictado');
    const { PersonasService } = require('../dist/personas/personas.service');
    const { PersonasAccionesService } = require('../dist/personas/personas-acciones');
    const { PortalInmobiliarioService } = require('../dist/conexiones/portal-inmobiliario');
    const { ConexionesService } = require('../dist/conexiones/conexiones');
    const { MercadoLibreService } = require('../dist/conexiones/mercadolibre');
    const { normalizar } = require('../dist/comun/texto');
    const FCd = require('../../desktop/src/ficha-campos'); // las reglas de la ficha del escritorio (solo lectura)

    const mod = await Test.createTestingModule({
      controllers: [NegociosController, NegocioAccionesController],
      providers: [
        PrismaService, ActividadService, NegociosService, NegocioAccionesService, PropiedadesService, AlmacenamientoService, PropiedadesAccionesService, PortalInmobiliarioService,
        { provide: ConfigService, useValue: { get: (k) => env[k] } },
        { provide: ConvectaService, useValue: {} },
        { provide: DictadoService, useValue: {} },
        { provide: PersonasService, useValue: {} },
        { provide: PersonasAccionesService, useValue: {} },
        { provide: ConexionesService, useValue: { estado: async () => ({ conexion: M.cuenta ? { estado: 'activa', cuentaId: '777' } : null }) } },
        { provide: MercadoLibreService, useValue: { llamar: async (u, l) => mlFalso(l) } },
      ],
    }).compile();
    const app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    app.use((rq, rs, next) => { const h = rq.headers['x-usuario']; if (h) rq.usuario = JSON.parse(h); next(); });
    await app.listen(0, '127.0.0.1');
    BASE = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const propsSrv = app.get(PropiedadesService);

    // restos de una corrida cortada (solo prefijo E2E-NP)
    {
      const viejas = (await db.propiedad.findMany({ where: { titulo: { startsWith: 'E2E-NP ' } }, select: { id: true } })).map((x) => x.id);
      const vn = (await db.negocio.findMany({ where: { propiedadId: { in: viejas } }, select: { id: true } })).map((x) => x.id);
      await db.actividad.deleteMany({ where: { entidadId: { in: [...viejas, ...vn] } } });
      await db.negocio.deleteMany({ where: { id: { in: vn } } });
      await db.propiedad.deleteMany({ where: { id: { in: viejas } } });
      await db.persona.deleteMany({ where: { nombre: { startsWith: 'E2E-NP ' } } });
      const vu = (await db.usuario.findMany({ where: { email: { startsWith: 'e2e-np-' } }, select: { id: true } })).map((x) => x.id);
      await db.sesion.deleteMany({ where: { usuarioId: { in: vu } } });
      await db.usuario.deleteMany({ where: { id: { in: vu } } });
    }
    const adminDb = await db.usuario.findFirst({ where: { rol: 'ADMIN', email: (env.SEMBRAR_ADMIN_EMAIL || '').toLowerCase() } }) || await db.usuario.findFirst({ where: { rol: 'ADMIN' } });
    ok(adminDb, 'hay un administrador en la base de desarrollo');
    const corredoraId = adminDb.corredoraId;
    const adm = { sub: adminDb.id, corredoraId, rol: 'ADMIN', sid: '' };
    const uC = await db.usuario.create({ data: { corredoraId, email: `e2e-np-c-${SUF}@prueba.cl`, nombre: 'E2E Corredor NP', hashClave: 'x', telefono: '+56911110099' } });
    creados.usuarios.push(uC.id);
    const tC = { sub: uC.id, corredoraId, rol: 'CORREDOR', sid: '' };
    let nProp = 0;
    const crearProp = async (o) => { const p = await db.propiedad.create({ data: { corredoraId, codigo: `E2E-${SUF}-${++nProp}`.toUpperCase(), tipo: 'casa', estadoVenta: o.venta ? 'disponible' : null, estadoArriendo: o.arriendo ? 'disponible' : null, ...o } }); creados.props.push(p.id); return p; };
    const cli = await db.persona.create({ data: { corredoraId, nombre: 'E2E-NP Cliente ' + SUF, rut: '123456789', rutFormato: '12.345.678-9', email: `cli-np-${SUF}@prueba.cl`, busqueda: normalizar('E2E-NP Cliente ' + SUF) } });
    creados.personas.push(cli.id);
    const prop = (id) => db.propiedad.findUnique({ where: { id } });
    const aviso = async (id) => ((await prop(id)).portales || {}).pi?.venta;
    const puts = () => M.llamadas.filter((x) => x.metodo === 'PUT');

    // ================================================================================================ el aviso del portal sigue al negocio
    console.log('Aviso del portal');
    const publicado = (item) => ({ pi: { venta: { itemId: item, status: 'active', permalink: 'https://portal.test/' + item } } });
    const p1 = await crearProp({ titulo: 'E2E-NP Publicada ' + SUF, venta: true, precioVenta: 5000, monedaVenta: 'UF', portales: publicado('MLC1') });
    let r = await req('POST', '/negocios/acciones/crear', { tipo: 'venta', propiedadId: p1.id, clienteId: cli.id }, adm);
    ok(r.s === 200, 'crear el negocio de venta sobre la propiedad publicada');
    const n1 = r.j.negocio.id;
    ok((await prop(p1.id)).estadoVenta === 'disponible' && M.items.MLC1.status === 'active', 'recién creado: la propiedad sigue disponible y el aviso activo');

    r = await req('POST', `${A(n1)}/mover`, { etapa: 'reserva' }, adm);
    ok(r.s === 200 && r.j.avisos.some((x) => /quedó reservada/.test(x)), 'mover a reserva: la propiedad queda reservada');
    ok(r.j.avisos.some((x) => /Aviso de venta pausado en Portal Inmobiliario/.test(x)), 'mover a reserva: sale en avisos que el aviso del portal se pausó');
    ok(M.items.MLC1.status === 'paused' && puts().length === 1 && puts()[0].cuerpo.status === 'paused', 'Mercado Libre recibió la pausa del aviso MLC1');
    let a = await aviso(p1.id);
    ok(a.status === 'paused' && a.pausadoPorEstado === true, 'la ficha guarda el aviso pausado «por estado» (para reactivarlo solo)');

    r = await req('POST', `${A(n1)}/cerrar`, { resultado: 'perdido', motivo: 'Desistió' }, adm);
    ok(r.s === 200 && r.j.avisos.some((x) => /quedó disponible/.test(x)) && r.j.avisos.some((x) => /Aviso de venta reactivado en Portal Inmobiliario/.test(x)), 'cerrar perdido: vuelve a disponible y el aviso se reactiva (sale en avisos)');
    ok(M.items.MLC1.status === 'active', 'Mercado Libre recibió la reactivación');
    a = await aviso(p1.id);
    ok(a.status === 'active' && (await prop(p1.id)).estadoVenta === 'disponible', 'la ficha queda con el aviso activo y la propiedad disponible');
    ok((await db.actividad.count({ where: { entidadId: n1, texto: { contains: 'La propiedad quedó disponible' } } })) === 1 && (await db.actividad.count({ where: { entidadId: p1.id, texto: { contains: 'Aviso de Portal Inmobiliario pausado' } } })) === 1, 'el historial deja la propiedad quedó… en el negocio y el aviso pausado en la propiedad');

    // reabrir (queda en «reserva») → pausa otra vez; ganado → vendida y el aviso ya pausado no se vuelve a tocar
    r = await req('POST', `${A(n1)}/reabrir`, {}, adm);
    ok(r.s === 200 && r.j.avisos.some((x) => /Aviso de venta pausado/.test(x)) && M.items.MLC1.status === 'paused', 'reabrir en la etapa «reserva»: reservada de nuevo y aviso pausado');
    const antes = puts().length;
    r = await req('POST', `${A(n1)}/cerrar`, { resultado: 'ganado' }, adm);
    ok(r.s === 200 && r.j.avisos.some((x) => /quedó vendida/.test(x)) && !r.j.avisos.some((x) => /Portal Inmobiliario/.test(x)) && puts().length === antes && M.items.MLC1.status === 'paused', 'cerrar ganado: vendida; el aviso, ya pausado, no se toca');

    // sin cuenta de portal conectada: solo cambia la propiedad, sin fallar
    M.cuenta = false;
    const p3 = await crearProp({ titulo: 'E2E-NP Sin cuenta ' + SUF, venta: true, precioVenta: 4000, monedaVenta: 'UF', portales: publicado('MLC3') });
    r = await req('POST', '/negocios/acciones/crear', { tipo: 'venta', propiedadId: p3.id, clienteId: cli.id, etapa: 'reserva' }, adm);
    ok(r.s === 200 && r.j.avisos.length === 1 && /quedó reservada/.test(r.j.avisos[0]), 'sin cuenta conectada: la propiedad queda reservada y no hay avisos del portal');
    ok((await prop(p3.id)).estadoVenta === 'reservada' && M.items.MLC3.status === 'active' && (await aviso(p3.id)).status === 'active', 'sin cuenta conectada: el aviso queda como estaba (no se llamó a Mercado Libre)');
    M.cuenta = true;

    // una propiedad sin aviso no llama al portal
    const p4 = await crearProp({ titulo: 'E2E-NP Sin aviso ' + SUF, venta: true, precioVenta: 3000, monedaVenta: 'UF' });
    const llamadas0 = M.llamadas.length;
    r = await req('POST', '/negocios/acciones/crear', { tipo: 'venta', propiedadId: p4.id, clienteId: cli.id, etapa: 'reserva' }, adm);
    ok(r.s === 200 && r.j.avisos.length === 1 && M.llamadas.length === llamadas0, 'una propiedad sin aviso publicado: solo cambia de estado, sin llamar al portal');

    // ================================================================================================ captación por bloques
    console.log('Captación por bloques');
    const p2 = await crearProp({ titulo: 'E2E-NP Captación ' + SUF, venta: true, precioVenta: 3000, monedaVenta: 'UF' });
    r = await req('POST', '/negocios/acciones/crear', { tipo: 'venta', propiedadId: p2.id, clienteId: cli.id, corredorId: uC.id }, adm);
    const n2 = r.j.negocio.id;
    const verCapt = async (t = adm) => (await req('GET', `${A(n2)}/ver`, null, t)).j.captacion;
    const por = (c) => Object.fromEntries(c.pasos.map((x) => [x.id, x]));
    const BLOQUE = { datos: 'esencial', portal: 'portal', legal: 'legal', equip: 'equip', comovisitar: 'visita' };
    // los bloques coinciden con los del escritorio (ficha-campos.js) sobre la misma propiedad
    const comparar = async (msg) => {
      const raw = await verCapt();
      const c = por(raw);
      const p = await propsSrv.obtener(adm, p2.id);
      const av = FCd.avance({ ...p, propietario: null, ocultarDueno: false });
      for (const [id, b] of Object.entries(BLOQUE)) {
        const x = av.find((q) => q.id === b);
        const listo = b === 'equip' ? x.completos > 0 : x.listo;
        ok((c[id].estado === 'ok') === listo, `${msg}: «${c[id].nombre}» ${listo ? 'logrado' : 'pendiente'} igual que en el escritorio`);
      }
      return raw;
    };

    let c = await verCapt();
    ok(c.pasos.map((x) => x.id).join() === 'datos,portal,legal,mandato,equip,fotos,comovisitar,publicada' && c.de === 8, 'la captación tiene los 8 pasos del escritorio, en su orden');
    ok(c.siguiente.id === 'datos' && c.siguiente.estado === 'pend' && /Falta: .*Comuna/.test(c.siguiente.detalle) && /propietario/i.test(c.siguiente.detalle), 'ficha vacía: el primer paso pendiente es «Lo esencial» y dice qué falta (también el propietario)');
    c = await verCapt(tC);
    ok(!/propietario|celular/i.test(c.siguiente.detalle) && /Comuna/.test(c.siguiente.detalle), 'un corredor que no captó la propiedad: no se le pide el propietario');
    await comparar('ficha vacía');

    await db.propiedad.update({ where: { id: p2.id }, data: { comuna: 'Ñuñoa', direccion: 'Irarrázaval 2450', ficha: { propietarioNombre: 'Ana Pérez', propietarioCelular: '+56 9 1111 2222' } } });
    c = await comparar('esencial completo');
    ok(por(c).datos.estado === 'ok' && por(c).portal.estado === 'pend' && /Dormitorios/.test(por(c).portal.detalle) && c.siguiente.id === 'portal', 'esencial completo: «Lo esencial» logrado y sigue «Datos para los portales», con lo que falta');
    c = await verCapt(tC);
    ok(por(c).datos.estado === 'ok' || /Falta:/.test(por(c).datos.detalle), 'el corredor ve el mismo bloque sin los datos del propietario');

    await db.propiedad.update({ where: { id: p2.id }, data: { dormitorios: 3, banos: 2, supUtil: 100, supTotal: 200, estacionamientos: 1, bodegas: 0, ficha: { propietarioNombre: 'Ana Pérez', propietarioCelular: '+56 9 1111 2222', orientacion: 'Norte' } } });
    c = await comparar('portales completo');
    ok(por(c).portal.estado === 'ok' && c.siguiente.id === 'legal' && /RUT/.test(c.siguiente.detalle), 'portales completo: sigue «Propietario y datos legales», que pide RUT, correo, rol…');

    await db.propiedad.update({ where: { id: p2.id }, data: { rol: '123-4', ficha: { propietarioNombre: 'Ana Pérez', propietarioCelular: '+56 9 1111 2222', orientacion: 'Norte', propietarioRut: '11.111.111-1', propietarioEmail: 'ana@prueba.cl', exclusividad: false } } });
    c = await comparar('legal completo');
    ok(por(c).legal.estado === 'ok' && c.siguiente.id === 'mandato', 'legal completo: lo siguiente es el mandato (no se da por cumplido)');
    ok(por(c).equip.estado !== 'ok' && por(c).comovisitar.estado !== 'ok' && por(c).fotos.estado !== 'ok' && por(c).publicada.estado !== 'ok', 'cada paso de la captación es independiente: nada se da por cumplido por adelantado');

    const fichaBase = { propietarioNombre: 'Ana Pérez', propietarioCelular: '+56 9 1111 2222', orientacion: 'Norte', propietarioRut: '11.111.111-1', propietarioEmail: 'ana@prueba.cl', exclusividad: false };
    await db.propiedad.update({ where: { id: p2.id }, data: { ficha: { ...fichaBase, jardin: true, formaVisitar: 'Llave en conserjería' } } });
    c = await comparar('equipamiento y visita');
    ok(/^1 de \d+ datos$/.test(por(c).equip.detalle) && por(c).equip.estado === 'ok' && por(c).comovisitar.estado === 'ok', 'equipamiento: basta con haberlo recorrido («1 de N datos»); «Visita y publicación» logrado con la forma de visitar');

    await db.propiedadFoto.create({ data: { propiedadId: p2.id, url: 'https://fotos.test/1.jpg', orden: 0 } });
    await db.propiedad.update({ where: { id: p2.id }, data: { portales: { pi: { venta: { itemId: 'MLC2', status: 'active' } } } } });
    c = await comparar('fotos y publicada');
    ok(por(c).fotos.estado === 'ok' && por(c).fotos.detalle === '1 fotos' && por(c).publicada.estado === 'ok' && c.logrados === 7 && c.siguiente.id === 'mandato', 'fotos y publicada logradas: 7 de 8, solo falta el mandato');

    await app.close();
  } finally {
    const props = creados.props;
    const negs = (await db.negocio.findMany({ where: { propiedadId: { in: props } }, select: { id: true } })).map((n) => n.id);
    await db.actividad.deleteMany({ where: { entidadId: { in: [...negs, ...props, ...creados.personas] } } });
    await db.negocio.deleteMany({ where: { id: { in: negs } } });
    await db.propiedad.deleteMany({ where: { id: { in: props } } });
    await db.persona.deleteMany({ where: { id: { in: creados.personas } } });
    await db.sesion.deleteMany({ where: { usuarioId: { in: creados.usuarios } } });
    await db.usuario.deleteMany({ where: { id: { in: creados.usuarios } } });
    await db.$disconnect();
  }
  console.log('\nTodo bien.');
})().catch((e) => { console.error(e.message || e); process.exit(1); });
