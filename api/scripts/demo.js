// Datos de ejemplo para DESARROLLO: negocios (en todas las etapas), agenda (pasado, hoy y próximos días) y publicaciones
// en portales (con estadísticas, interesados y avisos pausados o con error), para trabajar las pantallas con contenido.
// Usa la propia API local (así los datos pasan por las mismas validaciones que los de la app) con el administrador de
// api/.env, y NUNCA corre contra otra dirección que no sea la local (producción incluida).
//   yarn demo                                  → crea o actualiza los datos de ejemplo (las fechas se calculan desde hoy:
//                                                repetirlo los renueva). Entra con SEMBRAR_ADMIN_* de api/.env si están; si no, crea
//                                                una «Corredora Demo» con el administrador demo@ejemplo.cl / demo12345 (solo en la base
//                                                de desarrollo) y los datos quedan ahí.
//   yarn demo --email tu@correo --clave xxx    → los pone en la corredora de ese usuario de desarrollo
//   yarn demo:limpiar [--email … --clave …]    → los borra
// Todo lo de ejemplo se reconoce por el prefijo: propiedades «DM-…», eventos y negocios con id «demo…», personas con
// correo «…@ejemplo.cl». Requiere la API corriendo (yarn dev).
const fs = require('fs');
const path = require('path');

const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/).map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2].trim().replace(/^"(.*)"$/, '$1')]),
);
const BASE = (process.argv.find((a) => a.startsWith('http')) || 'http://localhost:3000').replace(/\/$/, '') + '/v1';
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(BASE + '/')) { console.error('Solo corre contra la API local (http://localhost:3000).'); process.exit(1); }
const LIMPIAR = process.argv.includes('--limpiar');

let H = { 'content-type': 'application/json' };
const api = async (metodo, ruta, cuerpo) => {
  const r = await fetch(BASE + ruta, { method: metodo, headers: H, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  let j = null; try { j = await r.json(); } catch { /* sin cuerpo */ }
  return { s: r.status, j };
};
const exige = (r, que) => { if (r.s >= 400) throw new Error(`${que}: ${r.s} ${JSON.stringify(r.j).slice(0, 200)}`); return r.j; };
const lista = (j) => (Array.isArray(j) ? j : j?.items || []);

// ---------------------------------------------------------------- fechas (desde hoy, hora de Chile)
const hoyChile = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
const sumar = (f, n) => { const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const HOY = hoyChile();
const f = (n) => sumar(HOY, n);
const iso = (n, h = 12) => new Date(`${f(n)}T${String(h).padStart(2, '0')}:00:00-03:00`).toISOString();

// ---------------------------------------------------------------- RUT válidos
const dv = (cuerpo) => { let s = 0, m = 2; for (let i = String(cuerpo).length - 1; i >= 0; i--) { s += Number(String(cuerpo)[i]) * m; m = m === 7 ? 2 : m + 1; } const d = 11 - (s % 11); return d === 11 ? '0' : d === 10 ? 'K' : String(d); };
const rut = (n) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv(n)}`;

// ---------------------------------------------------------------- personas
const PERSONAS = [
  ['camila', 'Camila Ibarra Soto', 16482113, ['comprador'], 'Ingeniera comercial. Busca departamento en Ñuñoa o Providencia, hasta UF 7.500.'],
  ['rodrigo', 'Rodrigo Valdés Pino', 12958774, ['comprador'], 'Médico. Quiere casa en el sector oriente con jardín.'],
  ['francisca', 'Francisca Lagos Núñez', 18211340, ['arrendatario'], 'Arrienda para ella y su hijo; renta líquida $1.900.000.'],
  ['tomas', 'Tomás Araya Ruiz', 17644902, ['arrendatario'], 'Se traslada por trabajo; necesita estacionamiento.'],
  ['daniela', 'Daniela Cortés Vega', 13377218, ['propietario'], 'Propietaria de departamentos en Providencia y Macul.'],
  ['ignacio', 'Ignacio Fuentes Bravo', 10566431, ['propietario'], 'Vende la casa de La Reina. Quiere cerrar antes de marzo.'],
  ['valeria', 'Valeria Soto Mena', 19027655, ['interesado'], 'Interesada en la oficina del centro para su estudio.'],
  ['andres', 'Andrés Pizarro León', 14733096, ['comprador'], 'Inversionista; compra para arrendar.'],
  ['constanza', 'Constanza Rojas Gil', 20155832, ['arrendatario'], 'Estudiante de posgrado.'],
  ['matias', 'Matías Herrera Díaz', 11840279, ['propietario'], 'Propietario del local comercial y de la casa de Maipú.'],
];

// ---------------------------------------------------------------- propiedades (con sus publicaciones)
const foto = (cod, i) => `https://picsum.photos/seed/${cod.toLowerCase()}-${i}/1200/800`;
const serie = (total, dias = 30) => { const out = []; let resto = total; for (let i = 0; i < dias; i++) { const v = i === dias - 1 ? resto : Math.max(0, Math.round((total / dias) * (0.5 + ((i * 7) % 10) / 10))); out.push(Math.min(v, resto)); resto -= out.at(-1); } return out; };
const stats = (visitas, contactos, telefonos = 0) => ({ visitas, contactos, telefonos, serie: serie(visitas), dias: 30, al: new Date().toISOString() });
const itemPi = (n) => ({ itemId: `MLC${1450000000 + n}`, permalink: `https://www.portalinmobiliario.com/MLC-${1450000000 + n}-propiedad-demo-_JM` });
const lead = (id, itemId, op, nombre, mensaje, diasAtras, extra = {}) => ({ id, itemId, op, portal: 'Portal Inmobiliario', nombre, email: `${nombre.split(' ')[0].toLowerCase()}@ejemplo.cl`, telefono: `+56 9 5555 ${String(1000 + id.length * 37 + diasAtras).slice(-4)}`, mensaje, fecha: iso(-diasAtras, 10), visto: diasAtras > 3, estado: diasAtras > 6 ? 'contactado' : 'nuevo', ...extra });
const pubPi = (n, op, diasAtras, st, status = 'active', extra = {}) => ({ [op]: { status, ...itemPi(n), publicado: iso(-diasAtras), tipoAviso: 'gold_premium', stats: st, actualizado: new Date().toISOString(), ...extra } });

const PROPS = (() => {
  const A = itemPi(1), B = itemPi(2), C = itemPi(3), D = itemPi(4), E = itemPi(5), G = itemPi(7);
  return [
    { cod: 'DM-1001', titulo: 'Departamento 3D2B en Ñuñoa, cerca del metro', tipo: 'departamento', venta: true, precioVenta: { valor: 6900, moneda: 'UF' }, direccion: 'Av. Irarrázaval 3450', unidad: '804', comuna: 'Ñuñoa', dorm: 3, banos: 2, util: 82, total: 90, gc: 145000, estac: 1, bod: 1, dueno: 'daniela',
      portales: { pi: pubPi(1, 'venta', 25, stats(412, 9, 4)), chilepropiedades: { venta: { status: 'active', url: 'https://www.chilepropiedades.cl/propiedad/demo-1001', publicado: iso(-24), stats: { visitas: 188, contactos: 3, al: new Date().toISOString() } } } },
      leads: [lead('dl-1', A.itemId, 'venta', 'Sofía Márquez', 'Hola, ¿sigue disponible? Me gustaría visitarlo este fin de semana.', 1), lead('dl-2', A.itemId, 'venta', 'Pablo Oyarzún', '¿Aceptan crédito hipotecario? ¿Cuánto son los gastos comunes?', 2), lead('dl-3', A.itemId, 'venta', 'Lorena Bustos', 'Quisiera coordinar una visita. Trabajo de lunes a viernes.', 5), lead('dl-4', A.itemId, 'venta', 'Cristián Vera', '¿Se puede negociar el precio?', 9)] },
    { cod: 'DM-1002', titulo: 'Casa de 5 dormitorios con jardín en La Reina', tipo: 'casa', venta: true, precioVenta: { valor: 12500, moneda: 'UF' }, direccion: 'Larraín 6200', comuna: 'La Reina', dorm: 5, banos: 3, util: 210, total: 380, estac: 3, dueno: 'ignacio',
      portales: { pi: pubPi(2, 'venta', 12, stats(96, 0, 0)) }, leads: [] },
    { cod: 'DM-1003', titulo: 'Departamento amoblado en Providencia, a pasos del Costanera Center', tipo: 'departamento', arriendo: true, precioArriendo: { valor: 780000, moneda: 'CLP' }, direccion: 'Av. Providencia 2133', unidad: '1502', comuna: 'Providencia', dorm: 2, banos: 2, util: 68, total: 74, gc: 120000, estac: 1, amoblado: true, dueno: 'daniela',
      portales: { pi: pubPi(3, 'arriendo', 5, stats(140, 6, 2)), chilepropiedades: { arriendo: { status: 'pending', solicitado: iso(-1), actualizado: new Date().toISOString() } } },
      leads: [lead('dl-5', C.itemId, 'arriendo', 'Javiera Pinto', '¿Se puede arrendar con mascota (un gato)?', 1), lead('dl-6', C.itemId, 'arriendo', 'Marcelo Díaz', 'Me interesa desde diciembre. ¿Piden aval?', 3)] },
    { cod: 'DM-1004', titulo: 'Oficina en el centro de Santiago, edificio corporativo', tipo: 'oficina', venta: true, precioVenta: { valor: 3200, moneda: 'UF' }, direccion: 'Huérfanos 1117', unidad: '603', comuna: 'Santiago', util: 54, total: 58, gc: 98000, dueno: 'matias',
      portales: { pi: pubPi(4, 'venta', 33, stats(260, 4, 1), 'paused') }, leads: [lead('dl-7', D.itemId, 'venta', 'Esteban Reyes', 'Busco oficina para mi estudio jurídico. ¿Tiene estacionamiento?', 12)] },
    { cod: 'DM-1005', titulo: 'Departamento 2D en Las Condes con terraza', tipo: 'departamento', arriendo: true, precioArriendo: { valor: 950000, moneda: 'CLP' }, direccion: 'Apoquindo 4500', unidad: '1203', comuna: 'Las Condes', dorm: 2, banos: 2, util: 70, total: 78, gc: 140000, estac: 1, dueno: 'matias',
      portales: { pi: pubPi(5, 'arriendo', 41, stats(75, 1, 0)), toctoc: { arriendo: { status: 'error', error: 'TOCTOC rechazó el aviso: falta la superficie construida en el feed.', solicitado: iso(-6), actualizado: new Date().toISOString() } } }, leads: [lead('dl-8', E.itemId, 'arriendo', 'Natalia Contreras', 'Hola, ¿qué contrato piden y cuánto es la garantía?', 20)] },
    { cod: 'DM-1006', titulo: 'Casa en Maipú, barrio tranquilo', tipo: 'casa', venta: true, precioVenta: { valor: 5400, moneda: 'UF' }, direccion: 'Los Almendros 1820', comuna: 'Maipú', dorm: 4, banos: 2, util: 120, total: 200, estac: 2, dueno: 'matias', portales: {}, leads: [] },
    { cod: 'DM-1007', titulo: 'Departamento 1D1B en Macul, recién remodelado', tipo: 'departamento', arriendo: true, precioArriendo: { valor: 520000, moneda: 'CLP' }, direccion: 'Quilín 3300', unidad: '305', comuna: 'Macul', dorm: 1, banos: 1, util: 42, total: 45, gc: 60000, dueno: 'daniela',
      portales: { pi: pubPi(7, 'arriendo', 2, stats(38, 2, 1)) }, leads: [lead('dl-9', G.itemId, 'arriendo', 'Ana María Toro', 'Buen día, ¿está disponible para ver mañana en la tarde?', 0)] },
    { cod: 'DM-1008', titulo: 'Local comercial en Providencia, esquina con alto tráfico', tipo: 'local_comercial', arriendo: true, precioArriendo: { valor: 1800000, moneda: 'CLP' }, direccion: 'Pedro de Valdivia 1450', unidad: 'L2', comuna: 'Providencia', util: 85, total: 85, dueno: 'matias', portales: {}, leads: [] },
  ];
})();

// ---------------------------------------------------------------- negocios y agenda
// tareas por etapa (cuántas tiene cada una, para marcarlas hechas)
const TAREAS = { interes: 2, visita: 2, reserva: 2, promesa: 2, escritura: 2, inscripcion: 2, entrega: 2, evaluacion: 3, contrato: 1 };
const ORDEN_VENTA = ['interes', 'visita', 'reserva', 'promesa', 'escritura', 'inscripcion', 'entrega'];
const ORDEN_ARRIENDO = ['interes', 'visita', 'reserva', 'evaluacion', 'contrato', 'entrega'];
const tareasHasta = (tipo, etapa, hechasEnActual = 0) => {
  const orden = tipo === 'venta' ? ORDEN_VENTA : ORDEN_ARRIENDO; const out = {};
  for (const e of orden) { if (e === etapa) { out[e] = Array.from({ length: TAREAS[e] }, (_, i) => i < hechasEnActual); break; } out[e] = Array.from({ length: TAREAS[e] }, () => true); }
  return out;
};
// [id, tipo, etapa, propiedad, cliente, corredor('yo'), valor, comisión, próxima acción [texto, díasDesdeHoy], diasEnLaEtapa, tareasHechas, estado]
const NEGOCIOS = [
  ['demo0001', 'venta', 'interes', 'DM-1004', 'valeria', { valor: 3100, moneda: 'UF' }, 2, ['Enviar ficha y planos de la oficina', 1], 2, 0],
  ['demo0002', 'venta', 'visita', 'DM-1001', 'camila', { valor: 6900, moneda: 'UF' }, 2, ['Llamar para saber cómo le fue en la visita', 0], 3, 1],
  ['demo0003', 'venta', 'reserva', 'DM-1001', 'rodrigo', { valor: 6700, moneda: 'UF' }, 2, ['Recibir el comprobante de reserva', -2], 6, 1],
  ['demo0004', 'venta', 'promesa', 'DM-1002', 'andres', { valor: 12100, moneda: 'UF' }, 2, ['Revisar el estudio de títulos con el abogado', 3], 9, 1],
  ['demo0005', 'venta', 'escritura', 'DM-1006', 'camila', { valor: 5300, moneda: 'UF' }, 2, ['Coordinar la notaría para la firma', 5], 14, 0],
  ['demo0006', 'venta', 'inscripcion', 'DM-1004', 'andres', { valor: 3150, moneda: 'UF' }, 2, ['Hacer seguimiento al ingreso en el Conservador', 7], 21, 1],
  ['demo0007', 'venta', 'entrega', 'DM-1006', 'rodrigo', { valor: 5400, moneda: 'UF' }, 2, null, 30, 2, 'ganado'],
  ['demo0008', 'venta', 'visita', 'DM-1002', 'rodrigo', { valor: 12500, moneda: 'UF' }, 2, null, 20, 0, 'perdido'],
  ['demo0009', 'arriendo', 'interes', 'DM-1007', 'constanza', { valor: 520000, moneda: 'CLP' }, 50, ['Responder consulta del portal', 0], 1, 1],
  ['demo0010', 'arriendo', 'visita', 'DM-1003', 'francisca', { valor: 780000, moneda: 'CLP' }, 50, ['Confirmar la visita del sábado', 2], 2, 1],
  ['demo0011', 'arriendo', 'evaluacion', 'DM-1005', 'tomas', { valor: 950000, moneda: 'CLP' }, 50, ['Pedir liquidaciones de sueldo y codeudor', -1], 8, 1],
  ['demo0012', 'arriendo', 'entrega', 'DM-1003', 'tomas', { valor: 760000, moneda: 'CLP' }, 50, null, 45, 2, 'ganado'],
];
// [id, tipo, estado, díasDesdeHoy, hora, titulo, propiedad|null, personas[], negocio|null, duración, notas, orden]
const EVENTOS = [
  ['demovis01', 'visita', 'hecho', -3, '11:00', 'Visita de Camila Ibarra a DM-1001', 'DM-1001', ['camila'], 'demo0002', 45, 'Le gustó la luz y la orientación; duda por los gastos comunes.'],
  ['demovis02', 'visita', 'hecho', -2, '16:30', 'Visita de Rodrigo Valdés a DM-1001', 'DM-1001', ['rodrigo'], 'demo0003', 45, 'Quiere reservar. Ofreció UF 6.700.'],
  ['demollam01', 'llamada', 'hecho', -1, '10:00', 'Llamar a Ignacio Fuentes por el precio de la casa', 'DM-1002', ['ignacio'], null, 20, 'Acepta bajar a UF 12.100 si hay promesa antes de fin de mes.'],
  ['demovis03', 'visita', 'programado', 0, '09:30', 'Visita de Francisca Lagos a DM-1003', 'DM-1003', ['francisca'], 'demo0010', 45, 'Lleva a su hijo. Mostrar también el estacionamiento.', 910001],
  ['demoreu01', 'reunion', 'programado', 0, '16:00', 'Reunión con Andrés Pizarro: revisión de la promesa', 'DM-1002', ['andres'], 'demo0004', 60, 'Llevar el borrador de promesa y el estudio de títulos.'],
  ['demollam02', 'llamada', 'programado', 0, '18:00', 'Llamar a Camila Ibarra: cómo le fue en la visita', 'DM-1001', ['camila'], 'demo0002', 15, ''],
  ['demovis04', 'visita', 'programado', 1, '11:00', 'Visita de Constanza Rojas a DM-1007', 'DM-1007', ['constanza'], 'demo0009', 30, 'Viene sola; consultar por la fecha de entrada.'],
  ['demofir01', 'firma', 'programado', 1, '15:00', 'Firma de la reserva de Rodrigo Valdés', 'DM-1001', ['rodrigo', 'daniela'], 'demo0003', 30, 'Operación en Portalfirma; confirmar que ambos tengan clave.', 910002],
  ['demotar01', 'tarea', 'programado', 2, null, 'Actualizar fotos del aviso de DM-1002', 'DM-1002', [], null, 30, 'El aviso lleva 12 días sin contactos: renovar fotos y título.'],
  ['demovis05', 'visita', 'programado', 2, '17:00', 'Visita de Valeria Soto a DM-1004', 'DM-1004', ['valeria'], 'demo0001', 45, '', 910003],
  ['demoreu02', 'reunion', 'programado', 3, '10:30', 'Reunión en notaría: escritura de DM-1006', 'DM-1006', ['camila', 'matias'], 'demo0005', 90, 'Llevar cédulas, certificados y vale vista.'],
  ['demollam03', 'llamada', 'programado', 4, '12:00', 'Llamar a Tomás Araya: liquidaciones y codeudor', 'DM-1005', ['tomas'], 'demo0011', 15, ''],
  ['demovis06', 'visita', 'programado', 5, '12:00', 'Visita de Pablo Oyarzún a DM-1001', 'DM-1001', [], null, 45, 'Viene del portal; confirmó por WhatsApp.'],
  ['demotar02', 'tarea', 'programado', 6, null, 'Renovar el aviso pausado de DM-1004', 'DM-1004', [], null, 20, ''],
  ['demovis07', 'visita', 'cancelado', 1, '13:00', 'Visita a DM-1003 (cancelada por el cliente)', 'DM-1003', ['francisca'], null, 45, 'Reprogramó para el sábado.'],
  ['demootr01', 'otro', 'programado', 7, '09:00', 'Capacitación del equipo: nuevo flujo de reservas', null, [], null, 60, 'Sala de reuniones.'],
];

// ---------------------------------------------------------------- ejecución
async function limpiar(yo) {
  let n = { negocios: 0, eventos: 0, propiedades: 0, personas: 0 };
  for (const [id] of NEGOCIOS) if ((await api('DELETE', `/negocios/${id}`)).s < 300) n.negocios++;
  for (const [id] of EVENTOS) if ((await api('DELETE', `/eventos/${id}`)).s < 300) n.eventos++;
  const props = lista((await api('GET', '/propiedades?limite=500')).j);
  for (const p of props.filter((x) => /^DM-\d+$/.test(x.codigo))) if ((await api('DELETE', `/propiedades/${p.id}`)).s < 300) n.propiedades++;
  const pers = lista((await api('GET', '/personas?limite=500')).j);
  for (const p of pers.filter((x) => /@ejemplo\.cl$/.test(x.email || ''))) if ((await api('DELETE', `/personas/${p.id}`)).s < 300) n.personas++;
  console.log('Borrado:', JSON.stringify(n));
}

async function credenciales() {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const email = arg('--email') || env.SEMBRAR_ADMIN_EMAIL; const clave = arg('--clave') || env.SEMBRAR_ADMIN_CLAVE;
  if (email && clave) return { email, clave, demo: false };
  // sin credenciales: una corredora de demostración propia (nunca contra producción)
  if (!env.DATABASE_URL || /asset_prod/.test(env.DATABASE_URL)) throw new Error('Sin credenciales y la base no parece de desarrollo: usa --email y --clave.');
  process.env.DATABASE_URL = env.DATABASE_URL;
  const { PrismaClient } = require('@prisma/client'); const argon2 = require('argon2'); const db = new PrismaClient();
  try {
    const e = 'demo@ejemplo.cl'; const k = 'demo12345';
    if (!(await db.usuario.findUnique({ where: { email: e } }))) {
      const c = await db.corredora.create({ data: { nombre: 'Corredora Demo (desarrollo)' } });
      await db.usuario.create({ data: { corredoraId: c.id, email: e, nombre: 'Admin Demo', hashClave: await argon2.hash(k, { type: argon2.argon2id }), rol: 'ADMIN' } });
    }
    return { email: e, clave: k, demo: true };
  } finally { await db.$disconnect(); }
}

(async () => {
  const { email, clave, demo } = await credenciales();
  const sesion = exige(await api('POST', '/auth/ingresar', { email, clave, dispositivo: 'datos de ejemplo' }), 'ingreso');
  H = { 'content-type': 'application/json', authorization: 'Bearer ' + sesion.tokenAcceso };
  try {
    const yo = exige(await api('GET', '/auth/yo'), 'quién soy');
    console.log(`Corredora «${yo.corredora.nombre}», como ${yo.nombre}`);
    if (LIMPIAR) return await limpiar(yo);

    // personas
    const existentes = lista((await api('GET', '/personas?limite=500')).j);
    const per = {};
    for (const [clave2, nombre, num, roles, notas] of PERSONAS) {
      const correo = `${clave2}@ejemplo.cl`; const previa = existentes.find((x) => x.email === correo);
      const datos = { nombre, rut: rut(num), email: correo, telefono: `+56 9 5555 ${String(2000 + PERSONAS.findIndex((p) => p[0] === clave2) * 111).slice(-4)}`, roles, notas, tipo: 'natural' };
      per[clave2] = previa ? exige(await api('PATCH', `/personas/${previa.id}`, { ...datos, version: previa.version }), `persona ${nombre}`) : exige(await api('POST', '/personas', datos), `persona ${nombre}`);
    }
    console.log(`Personas: ${Object.keys(per).length}`);

    // propiedades y sus publicaciones
    const props = lista((await api('GET', '/propiedades?limite=500')).j); const pro = {};
    for (const x of PROPS) {
      const doc = { codigo: x.cod, titulo: x.titulo, tipo: x.tipo, venta: !!x.venta, arriendo: !!x.arriendo, ...(x.precioVenta ? { precioVenta: x.precioVenta } : {}), ...(x.precioArriendo ? { precioArriendo: x.precioArriendo } : {}),
        direccion: x.direccion, ...(x.unidad ? { unidad: x.unidad } : {}), comuna: x.comuna, region: 'Metropolitana', dormitorios: x.dorm ?? null, banos: x.banos ?? null, supUtil: x.util ?? null, supTotal: x.total ?? null, gastosComunes: x.gc ?? null,
        estacionamientos: x.estac ?? null, bodegas: x.bod ?? null, amoblado: !!x.amoblado, estadoVenta: x.venta ? 'disponible' : null, estadoArriendo: x.arriendo ? 'disponible' : null,
        descripcion: `${x.titulo}. Propiedad de ejemplo para desarrollo.`, fotos: [1, 2, 3, 4].map((i) => foto(x.cod, i)), portales: x.portales, leads: x.leads };
      const previa = props.find((p) => p.codigo === x.cod);
      pro[x.cod] = previa ? exige(await api('PATCH', `/propiedades/${previa.id}`, { ...doc, version: previa.version }), `propiedad ${x.cod}`) : exige(await api('POST', '/propiedades', doc), `propiedad ${x.cod}`);
      await api('POST', `/propiedades/${pro[x.cod].id}/vinculos`, { personaId: per[x.dueno].id, rol: 'propietario' });
    }
    console.log(`Propiedades: ${Object.keys(pro).length} (${PROPS.filter((x) => Object.keys(x.portales).length).length} publicadas en portales)`);

    // negocios
    const nExist = Object.fromEntries(lista((await api('GET', '/negocios?limite=500')).j).map((n) => [n.id, n]));
    for (const [id, tipo, etapa, cod, cli, valor, comision, prox, dias, hechas, estado] of NEGOCIOS) {
      const doc = { tipo, estado: estado || 'abierto', etapa, etapaDesde: iso(-dias), propId: pro[cod].id, clienteId: per[cli].id, corredorId: yo.id, valor, comision: { tipo: '%', valor: comision },
        tareas: tareasHasta(tipo, etapa, estado === 'ganado' ? 99 : hechas), firmas: {}, ...(prox ? { proximaAccion: { texto: prox[0], fecha: f(prox[1]) } } : {}), ...(estado === 'perdido' ? { motivoPerdida: 'Compró otra propiedad' } : {}),
        creado: iso(-dias - 10), actualizado: iso(-Math.max(0, dias - 1)), ...(nExist[id] ? { version: nExist[id].version } : {}) };
      exige(await api('PUT', `/negocios/${id}`, doc), `negocio ${id}`);
      const rol = tipo === 'venta' ? 'comprador' : 'arrendatario';
      await api('POST', `/propiedades/${pro[cod].id}/vinculos`, { personaId: per[cli].id, rol });
    }
    console.log(`Negocios: ${NEGOCIOS.length} (${NEGOCIOS.filter((n) => n[1] === 'venta').length} de venta, ${NEGOCIOS.filter((n) => n[1] === 'arriendo').length} de arriendo)`);

    // agenda
    const eExist = Object.fromEntries(lista((await api('GET', '/eventos?limite=500')).j).map((e) => [e.id, e]));
    for (const [id, tipo, estado, dias, hora, titulo, cod, personas, negocio, duracion, notas, op] of EVENTOS) {
      const p = cod ? pro[cod] : null;
      const doc = { tipo, estado, fecha: f(dias), hora, propId: p?.id || null, negocioId: negocio, personaIds: personas.map((k) => per[k].id), corredorId: yo.id, titulo, duracion, notas,
        lugar: p ? [p.direccion, p.unidad ? `depto. ${p.unidad}` : '', p.comuna].filter(Boolean).join(', ') : 'Oficina', orden: op ? { operacion: op } : null, ext: null, creado: iso(Math.min(dias, 0) - 2), actualizado: iso(Math.min(dias, 0)),
        ...(eExist[id] ? { version: eExist[id].version } : {}) };
      exige(await api('PUT', `/eventos/${id}`, doc), `evento ${id}`);
    }
    console.log(`Agenda: ${EVENTOS.length} eventos (del ${f(-3)} al ${f(7)})`);
    console.log(`Listo. Abre la app (yarn dev) con ${demo ? `${email} / ${clave}` : 'ese usuario'} y revisa Negocios, Agenda y Publicaciones.`);
  } finally {
    await api('POST', '/auth/salir', { tokenRenovar: sesion.tokenRenovar }).catch(() => null);
  }
})().catch((e) => { console.error('Error:', e.message); process.exit(1); });
