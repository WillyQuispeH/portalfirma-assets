// Prueba de punta a punta de los NEGOCIOS en el servidor: las acciones REST (/v1/negocios/:id/acciones/…, src/negocios/negocio-acciones.ts) por HTTP
// contra una app de Nest de prueba con los controladores y servicios REALES (asset_dev y el mismo R2; la sesión la pone un middleware), y las
// herramientas de WhatsApp (src/whatsapp/herramientas/negocios.ts) ejecutadas sobre esos mismos servicios; solo se falsean la lectura del
// comprobante (IA) y la evaluación (WhatsApp).
// Crea sus propios datos (prefijo E2E) y al final los borra de verdad.   Requiere compilar antes (yarn dev deja dist/).
// Uso: node test/negocios-herramientas-e2e.js     (no necesita la API corriendo: levanta una app de prueba con los controladores reales)
// Revisa: mover con efecto en la propiedad, tareas, pasos, cierre ganado/perdido (dos pasos), pagos del arriendo con sus efectos, comprobante
// (dos negocios → pregunta; dato faltante → pregunta solo eso; confirma; queda el pago con su archivo), aceptación, contrato, postarriendo,
// permisos (corredor ajeno) y versión.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('reflect-metadata');
const { PrismaClient } = require('@prisma/client');

const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/).map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2].trim().replace(/^"(.*)"$/, '$1')]));
let BASE = '';
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
// `usuario` es el token de la sesión (el guard de la app real lo deja en la petición; aquí lo pone un middleware de la app de prueba)
const req = async (metodo, ruta, cuerpo, usuario) => {
  const r = await fetch(BASE + '/v1' + ruta, { method: metodo, headers: { 'content-type': 'application/json', ...(usuario ? { 'x-usuario': JSON.stringify(usuario) } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { s: r.status, j };
};
const SUF = Date.now().toString(36);
const PDF = Buffer.from('%PDF-1.4\n' + 'comprobante de prueba '.repeat(20));
const FIN = Buffer.from('%PDF-1.4\n' + 'otro comprobante '.repeat(20));
const A = (r) => `/negocios/${r}/acciones`;

(async () => {
  const db = new PrismaClient();
  const creados = { props: [], personas: [], usuarios: [], claves: [] };
  const claveDe = (n) => JSON.stringify(n.datos || n).match(/c\/[\w-]+\/r\/archivos_negocio\/todos\/[\w-]+\/[\w.-]+/g) || [];
  let r2 = null;
  try {
    // ================================================================================================ REGLAS PURAS
    console.log('Reglas puras');
    const R = require('../dist/negocios/negocio-reglas');
    const venta = (e, x = {}) => ({ id: 'n1', tipo: 'venta', estado: 'abierto', etapa: e, ...x });
    ok(R.estadoObjetivo('venta', [venta('reserva')], 'disponible') === 'reservada', 'etapa reserva → la propiedad queda reservada');
    ok(R.estadoObjetivo('venta', [venta('entrega')], 'reservada') === 'vendida', 'etapa entrega de una venta → vendida');
    ok(R.estadoObjetivo('venta', [venta('visita')], 'reservada') === 'disponible', 'se cayó el negocio (sin etapa de estado) → vuelve a disponible');
    ok(R.estadoObjetivo('venta', [venta('reserva', { estado: 'perdido' })], 'reservada') === 'disponible', 'un negocio perdido no reserva');
    ok(R.estadoObjetivo('venta', [venta('reserva'), venta('entrega', { id: 'n2', estado: 'ganado' })], 'disponible') === 'vendida', 'gana el estado más avanzado entre sus negocios');
    ok(R.estadoObjetivo('venta', [venta('reserva')], 'reservada') === null, 'si ya está así, no hay cambio');
    ok(R.estadoObjetivo('venta', [venta('visita')], 'no_disponible') === null, 'una propiedad no disponible no se toca');
    ok(R.estadoObjetivo('arriendo', [{ tipo: 'arriendo', estado: 'abierto', etapa: 'contrato', firmas: { entrega_acta: { estado: 'firmado' } } }], 'reservada') === 'arrendada', 'acta de entrega firmada → arrendada');
    const v = R.vista(venta('reserva', { creado: new Date().toISOString(), proximaAccion: { texto: 'x', fecha: '2020-01-01' }, comision: { tipo: '%', valor: 2 }, valor: { valor: 5000 } }), '2026-11-22');
    ok(v.siguiente === 'Falta firmar: oferta u orden de reserva' && v.vencida && v.comisionMonto === 100 && v.pendientes === 2, 'vista: lo que falta, vencida y comisión (2 % de 5000)');
    ok(R.faltantesPago('arriendo', { monto: 100, moneda: 'CLP', fecha: '2026-11-01', medio: 'transferencia' }).length === 1 && R.faltantesPago('venta', { monto: 100, moneda: 'CLP', fecha: '2026-11-01', medio: 'transferencia' }).length === 0, 'faltantes del pago: en arriendo pide a qué corresponde; en venta no');
    const ctx0 = { prop: null, firmasProp: [], visitas: [], clienteNombre: 'Ana', clienteRut: null, hoy: '2026-11-22', ahora: '10:00' };
    const ps = R.pasos(venta('visita', { clienteId: 'c1', creado: '2026-11-01T00:00:00Z' }), ctx0);
    ok(ps.etapas.length === 2 && ps.actual?.id === 'visita' && ps.etapas[0].pasos[0].e === 'ok', 'pasos: interesado logrado y el actual es la visita');

    // ================================================================================================ REST
    console.log('Acciones REST');
    // ---- la app de prueba (controladores reales) y los datos de la prueba, directo en la base
    const { Test } = require('@nestjs/testing');
    const { ConfigService } = require('@nestjs/config');
    const { PrismaService } = require('../dist/prisma/prisma.service');
    const { ActividadService } = require('../dist/comun/actividad.service');
    const { AlmacenamientoService } = require('../dist/archivos/almacenamiento.service');
    const { NegociosService, NegociosController } = require('../dist/negocios/negocios');
    const { NegocioAccionesService, NegocioAccionesController } = require('../dist/negocios/negocio-acciones');
    const { PropiedadesService } = require('../dist/propiedades/propiedades.service');
    const { ConvectaService } = require('../dist/propiedades/convecta');
    const { AyudasHerramientas } = require('../dist/whatsapp/herramientas/ayudas');
    const { HerramientasNegocios } = require('../dist/whatsapp/herramientas/negocios');
    const { LeerComprobanteService } = require('../dist/documentos/leer-comprobante');
    const { EvaluacionService } = require('../dist/whatsapp/evaluacion');
    const { normalizar } = require('../dist/comun/texto');
    const llamadasEv = []; let lectura = null;
    const mod = await Test.createTestingModule({
      controllers: [NegociosController, NegocioAccionesController],
      providers: [
        PrismaService, ActividadService, NegociosService, NegocioAccionesService, PropiedadesService, AlmacenamientoService, AyudasHerramientas, HerramientasNegocios,
        { provide: ConfigService, useValue: { get: (k) => env[k] } },
        { provide: ConvectaService, useValue: {} },
        { provide: LeerComprobanteService, useValue: { leer: async () => { if (!lectura) throw new Error('sin IA'); return lectura; } } },
        { provide: EvaluacionService, useValue: {
          ver: async () => ({ vacia: true }),
          solicitar: async (u, id, avales) => { llamadasEv.push(['solicitar', id, avales]); return { personas: [{ nombre: 'Arrendatario', rol: 'arrendatario' }] }; },
          decidir: async (u, id, b) => { llamadasEv.push(['decidir', id, b]); return { estado: 'revisada', decision: { estado: b.decision }, personas: [] }; },
        } },
      ],
    }).compile();
    const app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    app.use((rq, rs, next) => { const h = rq.headers['x-usuario']; if (h) rq.usuario = JSON.parse(h); next(); });
    await app.listen(0, '127.0.0.1');
    BASE = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    // restos de una corrida anterior que se cortó (solo lo de esta prueba: prefijo E2E-NH)
    {
      const viejas = await db.propiedad.findMany({ where: { titulo: { startsWith: 'E2E-NH ' } }, select: { id: true } });
      const vp = viejas.map((x) => x.id);
      const vn = await db.negocio.findMany({ where: { propiedadId: { in: vp } }, select: { id: true } });
      await db.actividad.deleteMany({ where: { entidadId: { in: [...vp, ...vn.map((x) => x.id)] } } });
      await db.negocio.deleteMany({ where: { id: { in: vn.map((x) => x.id) } } });
      await db.propiedad.deleteMany({ where: { id: { in: vp } } });
      await db.persona.deleteMany({ where: { nombre: { startsWith: 'E2E-NH ' } } });
      const vu = await db.usuario.findMany({ where: { email: { startsWith: 'e2e-nh-' } }, select: { id: true } });
      await db.usuario.deleteMany({ where: { id: { in: vu.map((x) => x.id) } } });
    }
    const adminDb = await db.usuario.findFirst({ where: { rol: 'ADMIN', email: env.SEMBRAR_ADMIN_EMAIL.toLowerCase() } }) || await db.usuario.findFirst({ where: { rol: 'ADMIN' } });
    ok(adminDb, 'hay un administrador en la base de desarrollo');
    const corredoraId = adminDb.corredoraId;
    const mkUsuario = async (letra) => { const u = await db.usuario.create({ data: { corredoraId, email: `e2e-nh-${letra}-${SUF}@prueba.cl`, nombre: `E2E Corredor ${letra.toUpperCase()}`, hashClave: 'x', telefono: '+5691111000' + (letra === 'a' ? 1 : 2) } }); creados.usuarios.push(u.id); return u; };
    const uA = await mkUsuario('a'); const uB = await mkUsuario('b');
    const corA = uA.id; const corB = uB.id;
    const tok = (u, rol = 'CORREDOR') => ({ sub: u.id, corredoraId, rol, sid: '' });
    const tA = tok(uA); const tB = tok(uB); const adm = tok(adminDb, 'ADMIN');
    let nProp = 0;
    const crearProp = async (o) => { const p = await db.propiedad.create({ data: { corredoraId, codigo: `E2E-${SUF}-${++nProp}`.toUpperCase(), tipo: 'casa', estadoVenta: o.venta ? 'disponible' : null, estadoArriendo: o.arriendo ? 'disponible' : null, ...o } }); creados.props.push(p.id); return p; };
    const pv = await crearProp({ titulo: `E2E-NH Casa ${SUF}`, venta: true, arriendo: true, precioVenta: 5000, monedaVenta: 'UF', precioArriendo: 450000, monedaArriendo: 'CLP' });
    const ps2 = await crearProp({ titulo: `E2E-NH Solo venta ${SUF}`, venta: true });
    const RUT_N = String(10000000 + Math.floor(Math.random() * 8e7));
    const cli = await db.persona.create({ data: { corredoraId, nombre: `E2E-NH Cliente ${SUF}`, rut: RUT_N + '9', rutFormato: RUT_N.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-9', email: `cli-${SUF}@prueba.cl`, busqueda: normalizar(`E2E-NH Cliente ${SUF}`) } });
    creados.personas.push(cli.id);
    let r;
    r2 = app.get(AlmacenamientoService);
    const estadoProp = async (id, campo) => (await db.propiedad.findUnique({ where: { id } }))[campo];

    // ---- crear
    r = await req('POST', '/negocios/acciones/crear', { tipo: 'venta', propiedadId: pv.id, clienteId: cli.id }, tA);
    ok(r.s === 200 && /^NG-\d{3,}$/.test(r.j.negocio.codigo) && r.j.negocio.corredorId === corA, `crear: el negocio nace con código (${r.j.negocio?.codigo}) y a cargo del corredor`);
    const nv = r.j.negocio.id; const codV = r.j.negocio.codigo;
    ok(r.j.negocio.comision.valor === 2 && r.j.negocio.comision.tipo === '%' && r.j.negocio.valor.valor === 5000 && r.j.negocio.etapa === 'interes' && r.j.negocio.tareas.interes[0] === true, 'crear: comisión 2 % por defecto, precio de la ficha, etapa interés');
    ok((await db.propiedadPersona.count({ where: { propiedadId: pv.id, personaId: cli.id, rol: 'comprador' } })) === 1, 'crear: el cliente queda vinculado a la propiedad como comprador');
    r = await req('POST', '/negocios/acciones/crear', { tipo: 'venta', propiedadId: pv.id, clienteId: cli.id }, tA);
    ok(r.s === 400 && /ya hay un negocio/i.test(JSON.stringify(r.j)), 'crear: no duplica un negocio abierto igual');
    r = await req('POST', '/negocios/acciones/crear', { tipo: 'arriendo', propiedadId: ps2.id, clienteId: cli.id }, tA);
    ok(r.s === 400 && /no está en arriendo/.test(JSON.stringify(r.j)), 'crear: la propiedad debe estar en el tipo del negocio');
    r = await req('POST', '/negocios/acciones/crear', { tipo: 'venta', propiedadId: pv.id, clienteId: crypto.randomUUID() }, tA);
    ok(r.s === 404, 'crear: el interesado debe existir');

    // ---- mover (efecto en la propiedad) y versión
    let ver = (await req('GET', `${A(nv)}/ver`, null, tA)).j;
    ok(ver.codigo === codV && ver.etapa.id === 'interes' && ver.pasos.etapas.length === 2 && ver.falta === 'Enviar la ficha de la propiedad' && ver.documentos.length >= 4, 'ver: código, etapa, lo que falta, pasos por etapa y documentos');
    ok((await req('POST', `${A(nv)}/mover`, { etapa: 'reserva', version: ver.version + 5 }, tA)).s === 409, 'mover con una versión vieja: 409 (no pisa cambios ajenos)');
    r = await req('POST', `${A(nv)}/mover`, { etapa: 'reserva', motivo: 'Cliente reserva', version: ver.version }, tA);
    ok(r.s === 200 && r.j.negocio.etapa === 'reserva' && r.j.negocio.version === ver.version + 1, 'mover: cambia de etapa y sube la versión');
    ok(r.j.avisos.some((x) => /quedó reservada/.test(x)) && (await estadoProp(pv.id, 'estadoVenta')) === 'reservada', 'mover a «reserva»: la propiedad queda reservada');
    ok((await db.actividad.count({ where: { entidadId: nv, texto: { contains: 'Cliente reserva' } } })) === 1, 'mover: queda en el historial con el motivo');
    ok((await req('POST', `${A(nv)}/mover`, { etapa: 'evaluacion' }, tA)).s === 400, 'mover a una etapa que no existe en una venta: 400');
    ok((await req('POST', `${A(nv)}/mover`, { etapa: 'promesa' }, tB)).s === 403, 'permisos: otro corredor no mueve el negocio (403)');
    ok((await req('GET', `${A(nv)}/ver`, null, tB)).s === 403, 'permisos: ni lo ve (403)');
    ok((await req('POST', `${A(nv)}/mover`, { etapa: 'visita' }, adm)).s === 200, 'permisos: el administrador sí');
    ok((await estadoProp(pv.id, 'estadoVenta')) === 'disponible', 'volver a «visita»: la propiedad vuelve a disponible');
    await req('POST', `${A(nv)}/mover`, { etapa: 'reserva' }, tA);

    // ---- tareas, pasos, próxima acción, nota
    r = await req('POST', `${A(nv)}/tarea`, { indice: 1, hecha: true }, tA);
    ok(r.s === 200 && r.j.negocio.tareas.reserva[1] === true, 'tarea: marca «Recibir el dinero de la reserva» en la etapa actual');
    ok((await req('POST', `${A(nv)}/tarea`, { indice: 9 }, tA)).s === 400, 'tarea: un número fuera de la lista da 400');
    r = await req('POST', `${A(nv)}/paso`, { paso: 'negociacion', estado: 'ok' }, tA);
    ver = (await req('GET', `${A(nv)}/ver`, null, tA)).j;
    const pasoNeg = ver.pasos.etapas[0].pasos.find((x) => x.id === 'negociacion');
    ok(r.s === 200 && pasoNeg.estado === 'ok' && pasoNeg.manual, 'paso: marcado a mano como logrado');
    await req('POST', `${A(nv)}/paso`, { paso: 'negociacion', estado: 'auto' }, tA);
    ok((await req('POST', `${A(nv)}/paso`, { paso: 'no_existe', estado: 'ok' }, tA)).s === 400, 'paso: uno desconocido da 400');
    r = await req('POST', `${A(nv)}/proxima-accion`, { texto: 'Llamar al propietario', fecha: '2026-01-05' }, tA);
    ver = (await req('GET', `${A(nv)}/ver`, null, tA)).j;
    ok(r.s === 200 && ver.vencida && ver.proximaAccion.texto === 'Llamar al propietario', 'próxima acción: guardada y vencida si pasó la fecha');
    r = await req('POST', `${A(nv)}/nota`, { texto: 'El propietario pidió más plazo' }, tA);
    ok(r.s === 200 && (await db.actividad.count({ where: { entidadId: nv, tipo: 'nota' } })) === 1, 'nota: queda en el historial del negocio');

    // ---- cerrar (perdido / ganado), reabrir
    ok((await req('POST', `${A(nv)}/cerrar`, { resultado: 'perdido' }, tA)).s === 400, 'cerrar perdido sin motivo: 400');
    r = await req('POST', `${A(nv)}/cerrar`, { resultado: 'perdido', motivo: 'Compró otra casa' }, tA);
    ok(r.s === 200 && r.j.negocio.estado === 'perdido' && r.j.negocio.motivoPerdida === 'Compró otra casa', 'cerrar perdido: queda con su motivo');
    ok((await estadoProp(pv.id, 'estadoVenta')) === 'disponible', 'cerrar perdido: la propiedad que estaba reservada vuelve a disponible');
    ok((await req('POST', `${A(nv)}/cerrar`, { resultado: 'ganado' }, tA)).s === 400, 'cerrar un negocio ya cerrado: 400');
    ok((await req('POST', `${A(nv)}/mover`, { etapa: 'visita' }, tA)).s === 400, 'un negocio cerrado no se mueve');
    r = await req('POST', `${A(nv)}/reabrir`, {}, tA);
    ok(r.s === 200 && r.j.negocio.estado === 'abierto', 'reabrir: vuelve a abierto');
    r = await req('POST', `${A(nv)}/cerrar`, { resultado: 'ganado' }, tA);
    ok(r.s === 200 && r.j.negocio.estado === 'ganado' && r.j.negocio.etapa === 'entrega', 'cerrar ganado: pasa a la última etapa');
    ok((await estadoProp(pv.id, 'estadoVenta')) === 'vendida', 'cerrar ganado de una venta: la propiedad queda vendida');
    await req('POST', `${A(nv)}/reabrir`, {}, tA);
    ok((await estadoProp(pv.id, 'estadoVenta')) === 'vendida', 'reabrir una venta ganada: sigue en la etapa «Entrega», así que la propiedad sigue vendida (igual que en el escritorio)');
    await req('POST', `${A(nv)}/mover`, { etapa: 'visita' }, tA);
    ok((await estadoProp(pv.id, 'estadoVenta')) === 'vendida', 'y al devolverlo a «Visita» sigue vendida (solo «reservada» vuelve sola a disponible; lo vendido se corrige en la ficha)');

    // ---- firmas y pagos de una venta
    ok((await req('POST', `${A(nv)}/vincular-firma`, { operacion: 777001, etapa: 'interes' }, tA)).s === 400, 'vincular firma: una etapa sin documento da 400');
    r = await req('POST', `${A(nv)}/vincular-firma`, { operacion: 777001, etapa: 'reserva' }, tA);
    ok(r.s === 200 && r.j.negocio.firmas.reserva.operacion === 777001 && r.j.negocio.firmas.reserva.estado === 'en_firma', 'vincular firma: la operación queda ligada a la etapa');
    ver = (await req('GET', `${A(nv)}/ver`, null, tA)).j;
    ok(ver.documentos.find((d) => d.id === 'reserva')?.estado === 'en_firma' && ver.documentos.find((d) => d.id === 'reserva')?.operacion === 777001, 'ver: el documento sale «en firma» con su operación');
    ok((await req('POST', `${A(nv)}/pago`, { tipo: 'reserva', monto: 100, moneda: 'CLP', fecha: '2026-11-20', medio: 'transferencia' }, tA)).s === 400, 'pago: en una venta solo vale «otro»');
    r = await req('POST', `${A(nv)}/pago`, { tipo: 'otro', monto: 1000000, moneda: 'CLP', fecha: '2026-11-20', medio: 'deposito', referencia: 'D-55', archivo: { nombre: 'deposito.pdf', mime: 'application/pdf', base64: PDF.toString('base64') } }, tA);
    ok(r.s === 200 && r.j.negocio.ciclo.comprobantes.length === 1 && r.j.negocio.ciclo.comprobantes[0].comprobante.clave.startsWith(`c/${corredoraId}/r/archivos_negocio/todos/${nv}/`), 'pago «otro» de una venta: queda en los comprobantes con su archivo en R2');
    creados.claves.push(r.j.negocio.ciclo.comprobantes[0].comprobante.clave);

    // ---- arriendo: reserva, comprobante, aceptación, contrato, postarriendo, comisión
    r = await req('POST', '/negocios/acciones/crear', { tipo: 'arriendo', propiedadId: pv.id, clienteId: cli.id, etapa: 'visita' }, tA);
    ok(r.s === 200 && r.j.negocio.comision.valor === 50 && r.j.negocio.valor.valor === 450000, 'crear arriendo: comisión 50 % y renta de la ficha');
    const na = r.j.negocio.id; const codA = r.j.negocio.codigo;
    ok(codA !== codV, `cada negocio tiene su propio código (${codV} y ${codA})`);
    r = await req('POST', `${A(na)}/pago`, { tipo: 'reserva', monto: 450000, moneda: 'CLP', fecha: '2026-11-20', medio: 'transferencia', archivo: { nombre: 'reserva.pdf', mime: 'application/pdf', base64: PDF.toString('base64') } }, tA);
    ok(r.s === 200 && r.j.negocio.etapa === 'reserva' && r.j.avisos.some((x) => /Reserva/.test(x)), 'pago de la reserva: el negocio pasa a «Reserva»');
    ok((await estadoProp(pv.id, 'estadoArriendo')) === 'reservada', 'pago de la reserva: la propiedad queda reservada (arriendo)');
    const clR = r.j.negocio.ciclo.pagos.reserva.comprobante.clave; creados.claves.push(clR);
    ok(clR.startsWith(`c/${corredoraId}/r/archivos_negocio/todos/${na}/`), 'el comprobante va a la carpeta de archivos del negocio');
    ok((await r2.tamano(clR)) === PDF.length, 'el archivo del comprobante está en R2 con su tamaño');
    ver = (await req('GET', `${A(na)}/ver`, null, tA)).j;
    ok(ver.pasos.etapas.find((e) => e.id === 'cierre').pasos.find((x) => x.id === 'reserva_pago').estado === 'ok', 'el paso «Reserva pagada» queda logrado');
    r = await req('POST', `${A(na)}/pago`, { tipo: 'reserva', monto: 460000, moneda: 'CLP', fecha: '2026-11-21', medio: 'efectivo' }, tA);
    ok(r.s === 200 && r.j.reemplazo === true && r.j.negocio.ciclo.pagos.reserva.monto === 460000, 'registrar la reserva otra vez la reemplaza');
    ok((await req('POST', `${A(na)}/pago/quitar`, { tipo: 'reserva' }, tA)).s === 200 && (await req('POST', `${A(na)}/pago/quitar`, { tipo: 'reserva' }, tA)).s === 400, 'quitar el pago: se borra y la segunda vez dice que no está');
    // aceptación del propietario
    ok((await req('POST', `${A(na)}/aceptacion`, { accion: 'contraoferta' }, tA)).s === 400, 'aceptación: una contraoferta sin monto da 400');
    r = await req('POST', `${A(na)}/aceptacion`, { accion: 'contraoferta', monto: 500000, moneda: 'CLP', garantia: '1 mes', plazo: '12 meses' }, tA);
    ok(r.s === 200 && r.j.negocio.aceptacion.rondas.at(-1).tipo === 'contraoferta' && r.j.negocio.aceptacion.rondas.at(-1).por === 'propietario', 'aceptación: el propietario hace una contraoferta');
    ok((await req('POST', `${A(na)}/aceptacion`, { accion: 'contraoferta', monto: 520000 }, tA)).s === 400, 'aceptación: tras la contraoferta responde el interesado');
    ver = (await req('GET', `${A(na)}/ver`, null, tA)).j;
    ok(ver.negociacion.esperaInteresado && ver.pasos.etapas[0].pasos.find((x) => x.id === 'aceptacion').estado === 'pend', 'ver: la contraoferta deja el paso pendiente de la respuesta del interesado');
    r = await req('POST', `${A(na)}/aceptacion`, { accion: 'acepta' }, tA);
    ok(r.s === 200 && r.j.negocio.aceptacion.rondas.at(-1).tipo === 'aceptada' && r.j.negocio.aceptacion.rondas.at(-1).por === 'interesado', 'aceptación: el interesado acepta la contraoferta');
    ok(r.j.negocio.valor.valor === 500000 && r.j.negocio.oferta.garantia === '1 mes', 'aceptada: el negocio queda con las condiciones finales');
    ok((await req('POST', `${A(na)}/aceptacion`, { accion: 'rechaza', nota: 'x' }, tA)).s === 400, 'aceptación: terminada la negociación solo se retoma con una oferta');
    // evaluación (paso manual) y contrato
    await req('POST', `${A(na)}/paso`, { paso: 'evaluacion', estado: 'ok' }, tA);
    ok((await db.negocio.findUnique({ where: { id: na } })).datos.tareas.evaluacion.slice(0, 3).every(Boolean), 'marcar «Evaluación del arrendatario» deja sus 3 tareas hechas');
    ok((await req('POST', `${A(na)}/contrato/aprobar`, { todos: true }, tA)).s === 400, 'contrato: sin versión del texto no se puede aprobar');
    let d = (await req('GET', `/negocios/${na}`, null, tA)).j;
    r = await req('PUT', `/negocios/${na}`, { ...d, ciclo: { ...(d.ciclo || {}), contrato: { versiones: [{ n: 1, fecha: '2026-11-21', firmantes: [{ personaId: cli.id, nombre: cli.nombre }, { personaId: 'p-prop', nombre: 'Propietaria E2E' }] }], datos: { inicio: '2026-12-01', plazoMeses: 12, reajuste: 'ipc_semestral', avisoDias: 60 } } } }, tA);
    ok(r.s === 200, 'se guardan el texto del contrato y sus condiciones (PUT existente)');
    r = await req('POST', `${A(na)}/contrato/aprobar`, { personaId: cli.id }, tA);
    ver = (await req('GET', `${A(na)}/ver`, null, tA)).j;
    ok(r.s === 200 && ver.contrato.firmantes.find((f) => f.personaId === cli.id).aprobo && !ver.contrato.firmantes.find((f) => f.personaId === 'p-prop').aprobo, 'contrato: aprueba un firmante');
    await req('POST', `${A(na)}/contrato/aprobar`, { todos: true }, tA);
    ver = (await req('GET', `${A(na)}/ver`, null, tA)).j;
    ok(ver.pasos.etapas.find((e) => e.id === 'cierre').pasos.find((x) => x.id === 'revision').estado === 'ok', 'contrato: aprobado por todos → el paso «Revisión del contrato» queda logrado');
    // garantía, primer mes y postarriendo
    ok((await req('POST', `${A(na)}/postarriendo`, { tipo: 'devolucion', fechaRecepcion: '2027-12-01', fechaDevolucion: '2027-12-05' }, tA)).s === 400, 'postarriendo: devolver la garantía exige que esté registrada');
    await req('POST', `${A(na)}/pago`, { tipo: 'garantia', monto: 500000, moneda: 'CLP', fecha: '2026-11-25', medio: 'transferencia' }, tA);
    ver = (await req('GET', `${A(na)}/ver`, null, tA)).j;
    ok(ver.pasos.etapas.find((e) => e.id === 'cierre').pasos.find((x) => x.id === 'garantia_mes').estado === 'pend', 'solo la garantía: el paso queda pendiente («falta el primer mes»)');
    await req('POST', `${A(na)}/pago`, { tipo: 'primer_mes', monto: 500000, moneda: 'CLP', fecha: '2026-11-25', medio: 'transferencia' }, tA);
    r = await req('POST', `${A(na)}/postarriendo`, { tipo: 'reajuste', ipc: 3.5 }, tA);
    ok(r.s === 200 && r.j.negocio.ciclo.postarriendo.reajustes[0].rentaNueva === 517500 && r.j.negocio.ciclo.postarriendo.reajustes[0].desde === '2027-06-01', 'postarriendo: reajuste con la renta nueva calculada y la fecha que toca');
    r = await req('POST', `${A(na)}/postarriendo`, { tipo: 'renovacion', decision: 'renovar', meses: 6 }, tA);
    ok(r.s === 200 && r.j.negocio.ciclo.postarriendo.renovacion.meses === 6, 'postarriendo: renovación por 6 meses');
    ok((await req('POST', `${A(na)}/postarriendo`, { tipo: 'devolucion', fechaRecepcion: '2028-06-01', fechaDevolucion: '2028-06-05', descuento: 900000, motivo: 'x' }, tA)).s === 400, 'postarriendo: el descuento no puede pasar de la garantía');
    r = await req('POST', `${A(na)}/postarriendo`, { tipo: 'devolucion', fechaRecepcion: '2028-06-01', fechaDevolucion: '2028-06-05', descuento: 50000, motivo: 'Pintura' }, tA);
    ok(r.s === 200 && r.j.negocio.ciclo.postarriendo.devolucion.devuelto === 450000, 'postarriendo: devolución con descuento (garantía 500.000 − 50.000)');
    // comisión: factura y pago → cierra ganado
    r = await req('POST', `${A(na)}/factura`, { numero: '1234', fecha: '2026-12-15', monto: 250000, moneda: 'CLP' }, tA);
    ok(r.s === 200 && r.j.negocio.ciclo.comision.factura.numero === '1234' && /^\d{4}-\d{2}-\d{2}$/.test(r.j.negocio.ciclo.comision.facturaFecha), 'factura de la comisión registrada (con la fecha de facturación)');
    r = await req('POST', `${A(na)}/pago`, { tipo: 'comision', monto: 250000, moneda: 'CLP', fecha: '2026-12-20', medio: 'transferencia' }, tA);
    ok(r.s === 200 && r.j.negocio.estado === 'ganado' && r.j.avisos.some((x) => /cerró como ganado/.test(x)), 'pago de la comisión: el negocio se cierra como ganado');
    ok((await estadoProp(pv.id, 'estadoArriendo')) === 'arrendada', 'arriendo ganado: la propiedad queda arrendada');
    ver = (await req('GET', `${A(na)}/ver`, null, tA)).j;
    ok(ver.pasos.etapas.find((e) => e.id === 'cierre').pasos.find((x) => x.id === 'comision').estado === 'ok' && ver.postarriendo?.devolucion, 'ver: comisión cobrada y el postarriendo a la vista');

    // ================================================================================================ HERRAMIENTAS DE WHATSAPP
    console.log('Herramientas de WhatsApp');
    const herr = app.get(HerramientasNegocios);
    const T = Object.fromEntries(herr.herramientas.map((h) => [h.name, h]));
    ok(['crear_negocio', 'ver_negocio', 'mover_negocio', 'marcar_tarea', 'marcar_paso', 'proxima_accion', 'nota_negocio', 'cerrar_negocio', 'reabrir_negocio', 'vincular_firma', 'registrar_pago', 'subir_comprobante', 'aceptacion_propietario', 'evaluacion_arrendatario', 'registrar_postarriendo'].every((n) => T[n]), 'están las 15 herramientas pedidas (más condiciones_negocio y aprobar_contrato)');
    ok(herr.herramientas.every((h) => /^[a-z_]+$/.test(h.name) && h.description.length > 60 && h.input_schema.type === 'object'), 'todas con nombre en español, descripción e input_schema');
    const ctx = (usuarioId, texto = '', adjuntos = [], admin = false) => ({ corredoraId, usuarioId, nombre: 'E2E', admin, texto, adjuntos });
    const cA = (t, adj) => ctx(corA, t, adj); const cB = (t) => ctx(corB, t);
    const call = (c, n, a) => T[n].ejecutar(c, a);
    const datosDe = async (id) => (await db.negocio.findUnique({ where: { id } })).datos;
    const propV = `E2E-NH Cliente ${SUF}`;

    // ---- crear / ver / mover
    let x = await call(cA('crea una venta'), 'crear_negocio', { tipo: 'venta', propiedad: ps2.codigo, cliente: propV });
    ok(x.ok && /^NG-/.test(x.negocio.codigo), `crear_negocio: ${x.negocio?.codigo} (propiedad en venta, cliente del CRM)`);
    const nv2 = (await db.negocio.findFirst({ where: { propiedadId: ps2.id } })).id;
    x = await call(cA(''), 'crear_negocio', { tipo: 'venta', propiedad: ps2.codigo, cliente: propV });
    ok(x.error && /ya hay un negocio/i.test(x.error), 'crear_negocio: avisa si ya existe uno abierto igual');
    x = await call(cA(''), 'crear_negocio', { tipo: 'arriendo', propiedad: ps2.codigo, cliente: propV });
    ok(x.error && /no está en arriendo/.test(x.error), 'crear_negocio: error claro si la propiedad no está en ese tipo');
    x = await call(cA(''), 'crear_negocio', { tipo: 'venta', propiedad: ps2.codigo, cliente: 'Nadie Existe Zzz' });
    ok(x.error && /No encontré/.test(x.error), 'crear_negocio: si la persona no existe, lo dice (no la inventa)');
    const cod2 = (await datosDe(nv2)).codigo;
    x = await call(cA(''), 'ver_negocio', { negocio: cod2.toLowerCase().replace('-', '') });
    ok(x.ok && x.codigo === cod2 && x.etapa.id === 'interes' && x.pasos.etapas.length === 2 && x.falta && x.tareas.length === 2, 'ver_negocio: el código se entiende sin guion ni mayúsculas; trae etapa, pasos y tareas');
    x = await call(cB(''), 'ver_negocio', { negocio: cod2 });
    ok(x.error && /No encontré/.test(x.error), 'permisos: otro corredor no ve el negocio por WhatsApp');
    x = await call(ctx(corB, '', [], true), 'ver_negocio', { negocio: cod2 });
    ok(x.ok, 'permisos: el administrador sí');
    x = await call(cA(''), 'mover_negocio', { negocio: cod2, etapa: 'reserva' });
    ok(x.ok && x.negocio.etapa === 'Oferta y reserva' && x.avisos?.some((a) => /reservada/.test(a)) && (await estadoProp(ps2.id, 'estadoVenta')) === 'reservada', 'mover_negocio: a «reserva» deja la propiedad reservada');
    x = await call(cA(''), 'mover_negocio', { negocio: cod2, etapa: 'contrato' });
    ok(x.error, 'mover_negocio: una etapa que no es de una venta da error claro');
    x = await call(cB(''), 'mover_negocio', { negocio: cod2, etapa: 'visita' });
    ok(x.error, 'mover_negocio: el corredor ajeno no puede');

    // ---- tareas, pasos, próxima acción, nota, condiciones
    x = await call(cA(''), 'marcar_tarea', { negocio: cod2, tarea: 'dinero de la reserva' });
    ok(x.ok && (await datosDe(nv2)).tareas.reserva[1] === true, 'marcar_tarea: por el texto («dinero de la reserva»)');
    x = await call(cA(''), 'marcar_tarea', { negocio: cod2, tarea: '1', hecha: true });
    ok(x.ok && (await datosDe(nv2)).tareas.reserva[0] === true, 'marcar_tarea: por su número');
    x = await call(cA(''), 'marcar_tarea', { negocio: cod2, tarea: 'inexistente zzz' });
    ok(x.error && /tiene estas tareas/.test(x.error), 'marcar_tarea: si no la encuentra, lista las de la etapa');
    x = await call(cA(''), 'marcar_paso', { negocio: cod2, paso: 'Estudio de títulos', estado: 'logrado' });
    ok(x.ok && (await datosDe(nv2)).pasos.titulos.e === 'ok' && (await datosDe(nv2)).tareas.promesa[0] === true, 'marcar_paso: por su nombre; deja marcada su tarea');
    x = await call(cA(''), 'marcar_paso', { negocio: cod2, paso: 'financiamiento', estado: 'pendiente', esperando_a: 'el banco', plazo: '2027-01-10' });
    ok(x.ok && (await datosDe(nv2)).proximaAccion.fecha === '2027-01-10' && (await datosDe(nv2)).pasos.financiamiento.quien === 'el banco', 'marcar_paso: pendiente con a quién se espera y plazo');
    x = await call(cA(''), 'marcar_paso', { negocio: cod2, paso: 'financiamiento', estado: 'automatico' });
    ok(x.ok && !(await datosDe(nv2)).pasos.financiamiento, 'marcar_paso: «automático» vuelve a lo que Asset deduce');
    x = await call(cA(''), 'marcar_paso', { negocio: cod2, paso: 'inventado', estado: 'logrado' });
    ok(x.error && /Los de un negocio de venta/.test(x.error), 'marcar_paso: un paso desconocido lista los válidos');
    x = await call(cA(''), 'proxima_accion', { negocio: cod2, texto: 'Llamar a la notaría', fecha: '2027-02-01' });
    ok(x.ok && (await datosDe(nv2)).proximaAccion.texto === 'Llamar a la notaría', 'proxima_accion: guardada con fecha');
    x = await call(cA(''), 'nota_negocio', { negocio: cod2, texto: 'Quiere cerrar antes de fin de año' });
    ok(x.ok && (await db.actividad.count({ where: { entidadId: nv2, tipo: 'nota' } })) === 1, 'nota_negocio: queda en el historial');
    x = await call(cA(''), 'condiciones_negocio', { negocio: cod2, precio: 4800, comision: 3 });
    ok(x.ok && (await datosDe(nv2)).valor.valor === 4800 && (await datosDe(nv2)).comision.valor === 3 && x.comisionEstimada === 144, 'condiciones_negocio: precio y comisión (3 % de 4.800 = 144)');

    // ---- cerrar en dos pasos
    x = await call(cA('cierra el negocio, lo ganamos'), 'cerrar_negocio', { negocio: cod2, resultado: 'ganado' });
    ok(x.necesitaConfirmacion && x.ejecutado === false && (await db.negocio.findUnique({ where: { id: nv2 } })).estado === 'abierto', 'cerrar_negocio (paso 1): arma el resumen y NO cierra');
    x = await call(cA('cierra el negocio, lo ganamos'), 'cerrar_negocio', { negocio: cod2, resultado: 'ganado', confirmado: true });
    ok(x.error && /todavía no confirmó/.test(x.error) && (await db.negocio.findUnique({ where: { id: nv2 } })).estado === 'abierto', 'cerrar_negocio: confirmar sin un «sí» del corredor no cierra');
    x = await call(cA('sí, pero mejor perdido'), 'cerrar_negocio', { negocio: cod2, resultado: 'ganado', confirmado: true });
    ok(x.error && /todavía no confirmó/.test(x.error), 'cerrar_negocio: «sí, pero…» no es un sí');
    x = await call(cA('sí'), 'cerrar_negocio', { negocio: cod2, resultado: 'perdido', motivo: 'otro', confirmado: true });
    ok(x.ok && x.negocio.estado === 'ganado' && (await estadoProp(ps2.id, 'estadoVenta')) === 'vendida', 'cerrar_negocio (paso 2): cierra EXACTAMENTE lo que se mostró (ganado) y la propiedad queda vendida');
    x = await call(cA('sí'), 'cerrar_negocio', { negocio: cod2, resultado: 'ganado', confirmado: true });
    ok(x.error && /Primero hay que armar/.test(x.error), 'cerrar_negocio: no se puede confirmar dos veces');
    x = await call(cA('pierde el negocio'), 'cerrar_negocio', { negocio: cod2, resultado: 'perdido' });
    ok(x.error && /ya está cerrado/.test(x.error), 'cerrar_negocio: un negocio cerrado lo dice');
    x = await call(cA(''), 'reabrir_negocio', { negocio: cod2 });
    ok(x.ok && x.negocio.estado === 'abierto' && x.negocio.etapa === 'Entrega', 'reabrir_negocio: reabre en la última etapa (igual que en el escritorio)');
    x = await call(cA('cierra como perdido'), 'cerrar_negocio', { negocio: cod2, resultado: 'perdido' });
    ok(x.error && /por qué se perdió/.test(x.error), 'cerrar_negocio: perdido pide el motivo');
    x = await call(cA('cierra como perdido'), 'cerrar_negocio', { negocio: cod2, resultado: 'perdido', motivo: 'Se arrepintió' });
    x = await call(cA('dale'), 'cerrar_negocio', { negocio: cod2, confirmado: true });
    ok(x.ok && x.negocio.estado === 'perdido' && (await datosDe(nv2)).motivoPerdida === 'Se arrepintió', 'cerrar_negocio: perdido con su motivo (confirmando sin repetir los datos)');

    // ---- firma
    x = await call(cA(''), 'vincular_firma', { negocio: codA, operacion: 888002, etapa: 'oferta' });
    ok(x.ok && (await datosDe(na)).firmas.oferta.operacion === 888002, 'vincular_firma: liga la operación a la carta oferta de un arriendo');
    x = await call(cA(''), 'vincular_firma', { negocio: cod2, operacion: 1, etapa: 'interes' });
    ok(x.error && /no requiere firma/.test(x.error), 'vincular_firma: una etapa sin documento da un error que dice qué indicar');

    // ---- comprobante (arriendo con dos pasos y venta)
    const jpg = Buffer.from('/9j/4AAQSkZJRg' + 'x'.repeat(200));
    const adj = (n, bytes = PDF, mime = 'application/pdf') => [{ nombre: n, mime, bytes }];
    // un negocio de arriendo nuevo, con otra propiedad, para que haya DOS negocios abiertos posibles
    const pa = await crearProp({ titulo: `E2E-NH Arriendo ${SUF}`, tipo: 'departamento', arriendo: true, precioArriendo: 600000, monedaArriendo: 'CLP' });
    x = await call(cA(''), 'crear_negocio', { tipo: 'arriendo', propiedad: pa.codigo, cliente: propV });
    const codA2 = x.negocio.codigo; const na2 = (await db.negocio.findFirst({ where: { propiedadId: pa.id } })).id;
    ok(x.ok && codA2, `crear_negocio (arriendo): ${codA2}`);
    // el de arriendo anterior (na) ya está ganado: reabrirlo para no mezclar; usamos na2
    x = await call(cA('sube este comprobante'), 'subir_comprobante', { negocio: '' });
    ok(x.error && /No tengo el comprobante/.test(x.error), 'subir_comprobante: sin archivo pide que lo mande de nuevo');
    lectura = { esComprobante: true, monto: 600000, moneda: 'CLP', fecha: '2026-11-20', medio: 'transferencia', banco: 'BancoEstado', referencia: 'OP-998', emisor: '', destinatario: '', concepto: 'reserva', avisos: [] };
    x = await call(cA('te mando el comprobante', adj('trf.pdf')), 'subir_comprobante', {});
    ok(x.preguntar === 'negocio' && x.opciones.length >= 2 && x.opciones.every((o) => /^NG-/.test(o.codigo) && o.tipo && o.etapa) && x.opciones.some((o) => o.codigo === codA2), `subir_comprobante: con más de un negocio posible y sin nombrarlo, PREGUNTA a cuál (opciones con código: ${x.opciones?.map((o) => o.codigo).join(', ')})`);
    x = await call(cA('es de la propiedad ' + pa.codigo), 'subir_comprobante', { negocio: pa.codigo });
    ok(x.preguntar === 'negocio' && x.opciones.length >= 1, 'subir_comprobante: aunque nombre la propiedad (y tenga uno solo) vuelve a preguntar por el código NG-XXX');
    x = await call(cA('es del ' + codA2), 'subir_comprobante', { negocio: codA2 });
    ok(x.preguntar === 'datos' && x.faltan.length === 1 && /a qué corresponde/.test(x.faltan[0]) && x.leido.monto === 600000, 'subir_comprobante: el comprobante trae monto, moneda, fecha y medio → pregunta SOLO a qué corresponde');
    lectura = { ...lectura, monto: null, fecha: null, referencia: '' };
    x = await call(cA('es del ' + codA2, adj('borroso.pdf', FIN)), 'subir_comprobante', { negocio: codA2, tipo_pago: 'reserva' });
    ok(x.preguntar === 'datos' && x.faltan.join(',') === 'monto,fecha', 'subir_comprobante: si no se alcanza a leer el monto ni la fecha, pregunta solo esos dos');
    x = await call(cA('fueron 600000 el 20/11'), 'subir_comprobante', { negocio: codA2, tipo_pago: 'reserva', monto: 600000, fecha: '2026-11-20' });
    ok(x.necesitaConfirmacion && x.corresponde === 'Reserva' && x.monto === '$600.000' && x.fecha === '20/11/2026' && x.efecto && /pasa a «Reserva»/.test(x.efecto), 'subir_comprobante: con todo, arma el resumen (monto, fecha, a qué corresponde, efecto) y NO registra');
    ok(!(await datosDe(na2)).ciclo?.pagos?.reserva, 'subir_comprobante (paso 1): todavía no hay pago registrado');
    x = await call(cA('mmm no sé'), 'subir_comprobante', { negocio: codA2, confirmado: true });
    ok(x.error && /todavía no confirmó/.test(x.error), 'subir_comprobante: sin un «sí» no registra');
    x = await call(cA('sí'), 'subir_comprobante', { confirmado: true });
    ok(x.ok && /subí el comprobante/.test(x.mensaje) && x.negocio.etapa === 'Reserva', 'subir_comprobante: con el «sí» (en otro mensaje, sin archivo) registra y mueve el negocio a «Reserva»');
    const dA2 = await datosDe(na2); const compro = dA2.ciclo.pagos.reserva;
    ok(compro.monto === 600000 && compro.moneda === 'CLP' && compro.fecha === '2026-11-20' && compro.medio === 'transferencia' && compro.comprobante.nombre === 'borroso.pdf' && compro.comprobante.bytes === FIN.length, 'queda el pago con monto, moneda, fecha, medio y el archivo');
    creados.claves.push(compro.comprobante.clave);
    ok((await r2.tamano(compro.comprobante.clave)) === FIN.length, 'el archivo está en R2 con ese tamaño');
    ok(compro.comprobante.clave.startsWith(`c/${corredoraId}/r/archivos_negocio/todos/${na2}/`) && (await estadoProp(pa.id, 'estadoArriendo')) === 'reservada', 'va a la carpeta del negocio y la propiedad queda reservada');
    x = await call(cA('sí'), 'subir_comprobante', { confirmado: true });
    ok(x.error, 'subir_comprobante: ya no hay archivo pendiente (se registró una sola vez)');
    // venta: no pregunta a qué corresponde (es «otro») y deja el pago en los comprobantes
    lectura = { esComprobante: true, monto: 250000, moneda: 'CLP', fecha: '2026-11-21', medio: 'deposito', banco: '', referencia: 'D-7', emisor: '', destinatario: '', concepto: '', avisos: [] };
    x = await call(cA('comprobante de la venta ' + cod2, adj('dep.pdf', Buffer.from('%PDF-1.4\n' + 'dep '.repeat(60)))), 'subir_comprobante', { negocio: cod2 });
    ok(x.necesitaConfirmacion && x.corresponde === 'Otro pago' && x.referencia === 'D-7', 'subir_comprobante: en una venta es «otro» y no pregunta nada más');
    x = await call(cA('ok'), 'subir_comprobante', { confirmado: true });
    const dv2 = await datosDe(nv2);
    ok(x.ok && dv2.ciclo.comprobantes.length === 1 && dv2.ciclo.comprobantes[0].referencia === 'D-7' && dv2.ciclo.comprobantes[0].medio === 'otro', 'subir_comprobante: la venta guarda el pago «otro» (depósito) con su archivo');
    creados.claves.push(dv2.ciclo.comprobantes[0].comprobante.clave);
    x = await call(ctx(corB, 'es del ' + cod2, adj('x.pdf', Buffer.from('%PDF-1.4\n' + 'x'.repeat(100)))), 'subir_comprobante', { negocio: cod2 });
    ok(x.error && /No encontré/.test(x.error), 'permisos: un corredor ajeno no sube comprobantes a un negocio que no es suyo');
    x = await call(cA('mira', adj('foto.jpg', jpg, 'image/jpeg')), 'subir_comprobante', { negocio: 'el de Pedro' });
    ok(x.preguntar === 'negocio', 'subir_comprobante: un texto cualquiera en vez del código vuelve a preguntar');

    // ---- registrar_pago en dos pasos (garantía, factura y comisión que cierra)
    x = await call(cA('registra la garantía'), 'registrar_pago', { negocio: codA2, tipo_pago: 'garantia', monto: 600000, moneda: 'CLP', fecha: '2026-11-25' });
    ok(x.error && /medio/.test(x.error), 'registrar_pago: pide SOLO lo que falta (el medio)');
    x = await call(cA('registra la garantía'), 'registrar_pago', { negocio: codA2, tipo_pago: 'garantia', monto: 600000, moneda: 'CLP', fecha: '2026-11-25', medio: 'transferencia' });
    ok(x.necesitaConfirmacion && x.monto === '$600.000' && !(await datosDe(na2)).ciclo.pagos.garantia, 'registrar_pago (paso 1): resumen sin registrar');
    x = await call(cA('sí'), 'registrar_pago', { confirmado: true });
    ok(x.ok && (await datosDe(na2)).ciclo.pagos.garantia.monto === 600000, 'registrar_pago (paso 2): registra la garantía');
    x = await call(cA('factura de la comisión'), 'registrar_pago', { negocio: codA2, tipo_pago: 'factura_comision', monto: 300000, moneda: 'CLP', fecha: '2026-12-10', numero_factura: '88' });
    x = await call(cA('sí'), 'registrar_pago', { confirmado: true });
    ok(x.ok && (await datosDe(na2)).ciclo.comision.factura.numero === '88', 'registrar_pago: factura de la comisión con su número');
    x = await call(cA('el cliente pagó la comisión'), 'registrar_pago', { negocio: codA2, tipo_pago: 'comision', monto: 300000, moneda: 'CLP', fecha: '2026-12-12', medio: 'transferencia' });
    ok(x.necesitaConfirmacion && /cierra como ganado/.test(x.efecto) && (await db.negocio.findUnique({ where: { id: na2 } })).estado === 'abierto', 'registrar_pago comisión (paso 1): avisa que cierra el negocio y no lo cierra todavía');
    x = await call(cA('sí'), 'registrar_pago', { confirmado: true });
    ok(x.ok && (await db.negocio.findUnique({ where: { id: na2 } })).estado === 'ganado' && (await estadoProp(pa.id, 'estadoArriendo')) === 'arrendada', 'registrar_pago comisión (paso 2): cierra ganado y la propiedad queda arrendada');

    // ---- aceptación, contrato, postarriendo, evaluación
    const pb = await crearProp({ titulo: `E2E-NH Arriendo 2 ${SUF}`, arriendo: true, precioArriendo: 700000, monedaArriendo: 'CLP' });
    x = await call(cA(''), 'crear_negocio', { tipo: 'arriendo', propiedad: pb.codigo, cliente: propV, precio: 700000, moneda: 'CLP', proxima_accion: 'Llamar', fecha_accion: '2026-12-01' });
    const codA3 = x.negocio.codigo; const na3 = (await db.negocio.findFirst({ where: { propiedadId: pb.id } })).id;
    ok(x.ok && x.negocio.proximaAccion.fecha === '2026-12-01', 'crear_negocio: con renta y próxima acción');
    x = await call(cA(''), 'aceptacion_propietario', { negocio: codA3 });
    ok(x.ok && x.negociacion.rondas === 0 && x.negociacion.vigente.monto === 700000, 'aceptacion_propietario «ver»: la oferta vigente es la del negocio');
    x = await call(cA(''), 'aceptacion_propietario', { negocio: codA3, accion: 'rechaza' });
    ok(x.error && /motivo/.test(x.error), 'aceptacion_propietario: rechazar pide el motivo');
    x = await call(cA(''), 'aceptacion_propietario', { negocio: codA3, accion: 'contraoferta', monto: 750000 });
    ok(x.ok && x.ultimaRonda.tipo === 'contraoferta', 'aceptacion_propietario: contraoferta');
    x = await call(cA(''), 'aceptacion_propietario', { negocio: codA3, accion: 'acepta' });
    ok(x.ok && (await datosDe(na3)).valor.valor === 750000 && (await datosDe(na3)).aceptacion.rondas.at(-1).por === 'interesado', 'aceptacion_propietario: el interesado acepta y la renta queda en lo acordado');
    // contrato y postarriendo con las condiciones cargadas
    const d3 = await datosDe(na3);
    await db.negocio.update({ where: { id: na3 }, data: { datos: { ...d3, ciclo: { pagos: { garantia: { monto: 750000, moneda: 'CLP', fecha: '2026-12-01' } }, contrato: { versiones: [{ n: 1, firmantes: [{ personaId: 'x1', nombre: 'Ana Propietaria' }, { personaId: 'x2', nombre: 'Beto Arrendatario' }] }], datos: { inicio: '2026-12-01', plazoMeses: 24, reajuste: 'ipc_anual', avisoDias: 30 } } } }, version: { increment: 1 } } });
    x = await call(cA(''), 'aprobar_contrato', { negocio: codA3, firmante: 'Beto' });
    ok(x.ok && (await datosDe(na3)).ciclo.contrato.aprobado.x2, 'aprobar_contrato: aprueba un firmante por su nombre');
    x = await call(cA(''), 'aprobar_contrato', { negocio: codA3, firmante: 'Zeta' });
    ok(x.error && /Indica el firmante/.test(x.error), 'aprobar_contrato: un nombre que no coincide lista los firmantes');
    x = await call(cA(''), 'registrar_postarriendo', { negocio: codA3, tipo: 'reajuste' });
    ok(x.error && /IPC/.test(x.error), 'registrar_postarriendo: el reajuste pide el IPC');
    x = await call(cA(''), 'registrar_postarriendo', { negocio: codA3, tipo: 'reajuste', ipc: 4 });
    ok(x.ok && (await datosDe(na3)).ciclo.postarriendo.reajustes[0].rentaNueva === 780000 && (await datosDe(na3)).ciclo.postarriendo.reajustes[0].desde === '2027-12-01', 'registrar_postarriendo: reajuste anual (750.000 +4 % = 780.000)');
    x = await call(cA(''), 'registrar_postarriendo', { negocio: codA3, tipo: 'devolucion', fecha_recepcion: '2028-12-02', fecha_devolucion: '2028-12-06', descuento: 30000, motivo_descuento: 'Limpieza', adjuntar_archivo: true });
    ok(x.error && /No recibí el archivo/.test(x.error), 'registrar_postarriendo: devolución con «adjuntar» sin archivo en el mensaje lo dice');
    x = await call(cA('', adj('devolucion.pdf', Buffer.from('%PDF-1.4\n' + 'dev '.repeat(60)))), 'registrar_postarriendo', { negocio: codA3, tipo: 'devolucion', fecha_recepcion: '2028-12-02', fecha_devolucion: '2028-12-06', descuento: 30000, motivo_descuento: 'Limpieza', adjuntar_archivo: true });
    const dev = (await datosDe(na3)).ciclo.postarriendo.devolucion;
    ok(x.ok && dev.devuelto === 720000 && dev.comprobante?.clave, 'registrar_postarriendo: devolución de la garantía con su comprobante');
    creados.claves.push(dev.comprobante.clave);
    // evaluación (dos pasos porque escribe a terceros)
    x = await call(cA('pide la documentación'), 'evaluacion_arrendatario', { negocio: codA3, accion: 'solicitar' });
    ok(x.necesitaConfirmacion && llamadasEv.length === 0, 'evaluacion_arrendatario «solicitar» (paso 1): arma a quién y NO escribe a nadie');
    x = await call(cA('sí'), 'evaluacion_arrendatario', { negocio: codA3, accion: 'solicitar', confirmado: true });
    ok(x.ok && llamadasEv.length === 1 && llamadasEv[0][0] === 'solicitar' && llamadasEv[0][1] === na3, 'evaluacion_arrendatario «solicitar» (paso 2): recién ahí pide los documentos');
    x = await call(cA(''), 'evaluacion_arrendatario', { negocio: codA3, accion: 'decidir', decision: 'aprobada', nota: 'ok' });
    ok(x.ok && llamadasEv[1][2].decision === 'aprobada', 'evaluacion_arrendatario «decidir»: registra la decisión del corredor');
    x = await call(cA(''), 'evaluacion_arrendatario', { negocio: cod2, accion: 'solicitar' });
    ok(x.error && /arriendo/.test(x.error), 'evaluacion_arrendatario: una venta no tiene evaluación de documentos');
    // el administrador ve todo
    x = await call(ctx(corA, '', [], true), 'ver_negocio', { negocio: codA3 });
    ok(x.ok && x.postarriendo?.reajustes === 1, 'ver_negocio: muestra el postarriendo (reajustes registrados)');
    await app.close();
  } finally {
    const props = creados.props;
    const negs = await db.negocio.findMany({ where: { propiedadId: { in: props } }, select: { id: true } });
    const claves = [...creados.claves];
    for (const n of await db.negocio.findMany({ where: { propiedadId: { in: props } } })) claves.push(...claveDe(n));
    try { if (!r2) { const { AlmacenamientoService } = require('../dist/archivos/almacenamiento.service'); r2 = new AlmacenamientoService({ get: (k) => env[k] }); } r2.borrar([...new Set(claves)]); await new Promise((s) => setTimeout(s, 1500)); } catch {}
    await db.actividad.deleteMany({ where: { entidadId: { in: [...negs.map((n) => n.id), ...props, ...creados.personas] } } });
    await db.negocio.deleteMany({ where: { id: { in: negs.map((n) => n.id) } } });
    await db.propiedad.deleteMany({ where: { id: { in: props } } });
    await db.persona.deleteMany({ where: { id: { in: creados.personas } } });
    await db.sesion.deleteMany({ where: { usuarioId: { in: creados.usuarios } } });
    await db.usuario.deleteMany({ where: { id: { in: creados.usuarios } } });
    await db.$disconnect();
  }
  console.log('\nTodo bien.');
})().catch((e) => { console.error(e.message || e); process.exit(1); });
