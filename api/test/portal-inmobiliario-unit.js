// Portal Inmobiliario en el servidor (src/conexiones/portal-inmobiliario.ts) sin red ni base: revisar la ficha y armar el aviso
// (categoría, ubicación, atributos cruzados con la ficha, WhatsApp de contacto, paquete), publicar, pausar al cambiar el estado
// comercial y reactivar. Mercado Libre, la base y las propiedades son falsos. Requiere compilar antes (yarn build o la API en yarn dev).
const { PortalInmobiliarioService, whatsappDe } = require('../dist/conexiones/portal-inmobiliario');
const ok = (v, m) => { if (!v) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };

const CONTACTO = { nombre: 'Corredora Demo', email: 'ventas@demo.cl', whatsapp: '+56 9 1234 5678', telefono: '+56 2 2222 2222' };
const ATRIBUTOS = [
  { id: 'TOTAL_AREA', name: 'Superficie total', tags: { required: true } }, { id: 'COVERED_AREA', name: 'Superficie útil' }, { id: 'BEDROOMS', name: 'Dormitorios', tags: { required: true } },
  { id: 'FULL_BATHROOMS', name: 'Baños' }, { id: 'PARKING_LOTS', name: 'Estacionamientos' }, { id: 'FURNISHED', name: 'Amoblado' }, { id: 'MAINTENANCE_FEE', name: 'Gastos comunes' },
  { id: 'PROPERTY_CODE', name: 'Código' }, { id: 'ORIENTATION', name: 'Orientación', value_type: 'list', values: [{ id: 'N', name: 'Norte' }, { id: 'S', name: 'Sur' }] },
  { id: 'HAS_POOL', name: 'Con piscina', value_type: 'boolean' },
];
const M = { llamadas: [], items: {}, whatsapp: true, paquete: 3 };
// la API de Mercado Libre falsa
function ml(metodo, ruta, cuerpo) {
  M.llamadas.push({ metodo, ruta, cuerpo });
  const r = (cuerpo2, status = 200) => ({ status, cuerpo: cuerpo2 });
  if (ruta === '/categories/MLC1459') return r({ children_categories: [{ id: 'MLC1472', name: 'Departamentos' }, { id: 'MLC1473', name: 'Casas' }] });
  if (ruta === '/categories/MLC1472') return r({ children_categories: [{ id: 'MLC1480', name: 'Venta' }, { id: 'MLC1481', name: 'Arriendo' }] });
  if (ruta === '/categories/MLC1480') return r({ children_categories: [{ id: 'MLC1490', name: 'Propiedades usadas' }, { id: 'MLC1491', name: 'Proyectos nuevos' }] });
  if (ruta === '/categories/MLC1490') return r({ id: 'MLC1490', children_categories: [], settings: { max_title_length: 60 } });
  if (ruta === '/categories/MLC1490/attributes') return r(ATRIBUTOS);
  if (ruta === '/classified_locations/countries/CL') return r({ states: [{ id: 'RM', name: 'RM (Metropolitana)' }, { id: 'AR', name: 'Argentina' }] });
  if (ruta === '/classified_locations/states/RM') return r({ cities: [{ id: 'NUNOA', name: 'Ñuñoa' }] });
  if (ruta === '/classified_locations/cities/NUNOA') return r({ neighborhoods: [{ id: 'B1', name: 'Plaza Ñuñoa' }] });
  if (ruta === '/users/777/classifieds_promotion_packs/silver') return r([{ remaining_listings: M.paquete }]);
  if (metodo === 'POST' && ruta === '/items') { M.items.MLC1 = { id: 'MLC1', permalink: 'https://articulo.portal.test/MLC1', status: 'active', body: cuerpo }; return r(M.items.MLC1); }
  const m = /^\/items\/(MLC\d+)$/.exec(ruta);
  if (metodo === 'PUT' && m) { Object.assign(M.items[m[1]], cuerpo.status ? { status: cuerpo.status } : {}); return r(M.items[m[1]]); }
  if (metodo === 'PUT' && /\/description$/.test(ruta)) return r({});
  return r({ message: 'ruta falsa ' + ruta }, 404);
}
// la propiedad (con su aviso) vive aquí; la «base» falsa la cambia
const P = {
  id: 'p1', codigo: 'PF-1001', titulo: 'Departamento luminoso de tres dormitorios y dos baños en pleno centro de Ñuñoa con vista despejada', tituloPortal: null, tipo: 'departamento', venta: true, arriendo: false,
  precioVenta: { valor: 4400, moneda: 'UF' }, precioArriendo: null, estadoVenta: 'disponible', estadoArriendo: null, direccion: 'Irarrázaval 2450', unidad: '504', comuna: 'Ñuñoa', region: 'Región Metropolitana',
  supTotal: 90, supUtil: 85, dormitorios: 3, banos: 2, estacionamientos: 1, bodegas: 1, amoblado: false, gastosComunes: 95000, descripcion: 'Departamento remodelado.', portalBarrio: null,
  ficha: { orientacion: 'Norte', piscina: true, pisoUnidad: 5, formaVisitar: 'Llave en conserjería', exclusividad: true, comisionVentaPct: '2' }, portales: {}, leads: [],
  fotos: Array.from({ length: 12 }, (_, i) => `https://fotos.test/${i}.jpg`),
};
const registros = [];
const db = {
  registro: {
    findUnique: async () => ({ datos: { contacto: M.whatsapp ? CONTACTO : { nombre: 'Corredora Demo' }, ml: { tipoAviso: 'silver' } } }),
    upsert: async (a) => { registros.push(a); return {}; },
  },
  propiedad: {
    findFirst: async () => ({ portales: P.portales }),
    update: async ({ data }) => { if (data.portales) P.portales = data.portales; return {}; },
  },
};
const conexiones = { estado: async () => ({ conexion: { estado: 'activa', cuentaId: '777' } }) };
const mlSrv = { llamar: async (u, l) => ml(l.metodo, l.ruta, l.cuerpo) };
const props = { obtener: async () => ({ ...P }), listar: async () => ({ items: [{ ...P }] }), actualizar: async () => P, vincular: async () => ({}) };
const logs = [];
const actividad = { registrar: async (x) => { logs.push(x); } };
const personas = { deContacto: async () => null };
const s = new PortalInmobiliarioService(db, conexiones, mlSrv, props, personas, actividad);
const U = { sub: 'u1', corredoraId: 'c1', rol: 'CORREDOR', sid: 's' };

(async () => {
  ok(JSON.stringify(whatsappDe('+56 9 1234 5678')) === '{"country_code2":"56","phone2":"912345678"}' && JSON.stringify(whatsappDe('9 1234 5678')) === '{"country_code2":"56","phone2":"912345678"}' && !whatsappDe('221234567'), 'el WhatsApp de contacto: celular chileno con o sin +56; un fijo no vale');

  let r = await s.revisar(U, 'p1', 'venta');
  ok(!r.errores.length, 'una ficha completa se puede publicar (sin errores) ' + r.errores.join(' | '));
  ok(r.categoria.id === 'MLC1490' && r.categoria.ruta.join('>') === 'Departamentos>Venta>Propiedades usadas', 'categoría: Departamentos › Venta › Propiedades usadas (no «Proyectos nuevos»)');
  ok(r.ubicacion.state.id === 'RM' && r.ubicacion.city.id === 'NUNOA', 'ubicación por comuna y región (descarta países extranjeros)');
  ok(r.payload.title.length <= 60 && /^Departamento luminoso/.test(r.payload.title) && r.avisos.some((a) => /se acorta a 60/.test(a)), 'el título se acorta a 60 caracteres sin cortar palabras, y avisa');
  ok(r.payload.currency_id === 'CLF' && r.payload.price === 4400 && r.payload.listing_type_id === 'silver' && r.payload.channels[0] === 'marketplace', 'precio en UF = CLF, paquete silver');
  const at = Object.fromEntries(r.payload.attributes.map((a) => [a.id, a]));
  ok(at.TOTAL_AREA.value_name === '90 m²' && at.COVERED_AREA.value_name === '85 m²' && at.BEDROOMS.value_name === '3' && at.MAINTENANCE_FEE.value_name === '95000 CLP' && at.FURNISHED.value_name === 'No' && at.PROPERTY_CODE.value_name === 'PF-1001', 'atributos básicos de la ficha (m², dormitorios, gastos comunes en CLP, amoblado)');
  ok(at.ORIENTATION && at.ORIENTATION.value_id === 'N' && at.HAS_POOL.value_name === 'Sí' && at.CMG_SITE.value_name === 'POI', 'la ficha se cruza con los atributos de la categoría por nombre (orientación con su id, piscina Sí) y va también a Portal Inmobiliario (CMG_SITE)');
  ok(r.payload.seller_contact.country_code2 === '56' && r.payload.seller_contact.phone2 === '912345678' && r.payload.seller_contact.email === 'ventas@demo.cl', 'contacto del aviso: WhatsApp en country_code2 + phone2 (obligatorio) y correo');
  ok(r.payload.location.address_line === 'Irarrázaval 2450, depto. 504' && r.payload.location.city.id === 'NUNOA' && r.paquete === 3, 'ubicación con depto. y paquete disponible (3)');
  ok(r.payload.pictures.length === 12 && r.payload.seller_custom_field === 'PF-1001' && /Código: PF-1001/.test(r.payload.description.plain_text), 'fotos https, código propio y descripción con el código');

  M.whatsapp = false; P.fotos = P.fotos.slice(0, 2); M.paquete = 0;
  r = await s.revisar(U, 'p1', 'venta');
  ok(r.errores.some((e) => /WhatsApp de contacto/.test(e)) && r.errores.some((e) => /No quedan publicaciones/.test(e)) && r.avisos.some((a) => /Tiene 2 fotos/.test(a)), 'sin WhatsApp de contacto ni paquete no se puede publicar; pocas fotos solo baja la calidad (aviso)');
  P.fotos = [];
  r = await s.revisar(U, 'p1', 'venta');
  ok(r.errores.some((e) => /al menos una foto/.test(e)), 'sin fotos no se publica');
  await s.revisar(U, 'p1', 'arriendo').then(() => ok(false, 'debería fallar'), (e) => ok(/no está marcada en arriendo/.test(e.message), 'revisar una operación que la propiedad no tiene falla con un mensaje claro'));
  const antes = { ...P, ficha: { ...P.ficha } };
  P.unidad = ''; P.fotos = Array.from({ length: 12 }, (_, i) => `https://fotos.test/${i}.jpg`); M.whatsapp = true; M.paquete = 3;
  r = await s.revisar(U, 'p1', 'venta');
  ok(r.errores.some((e) => /N° de departamento/.test(e)), 'lo clave de la ficha (el N° de depto en un departamento) impide publicar');
  P.unidad = '504';

  // publicar y mantener el aviso
  const pub = await s.publicar(U, 'p1', 'venta');
  ok(pub.accion === 'publicado' && P.portales.pi.venta.itemId === 'MLC1' && P.portales.pi.venta.status === 'active' && P.portales.pi.venta.permalink && M.llamadas.filter((l) => l.metodo === 'POST' && l.ruta === '/items').length === 1, 'publicar: crea el aviso una sola vez y deja su id, estado y enlace en la ficha');
  ok(logs.some((l) => /Publicada en Portal Inmobiliario \(venta\): MLC1/.test(l.texto)), 'y queda en el historial');
  const otra = await s.publicar(U, 'p1', 'venta');
  ok(otra.accion === 'actualizado' && M.llamadas.filter((l) => l.metodo === 'POST' && l.ruta === '/items').length === 1, 'publicar de nuevo con el aviso activo lo ACTUALIZA (no duplica el aviso)');
  // la ficha cambió: el aviso se pausa o reactiva solo según el estado comercial
  const despues = { ...P, estadoVenta: 'vendida', portales: P.portales };
  let msgs = await s.reaccionar(U, { ...P }, despues);
  ok(msgs.length === 1 && /pausado/.test(msgs[0]) && P.portales.pi.venta.status === 'paused' && P.portales.pi.venta.pausadoPorEstado === true, 'al quedar vendida, el aviso activo se pausa solo (y anota que fue por el estado)');
  msgs = await s.reaccionar(U, { ...P, estadoVenta: 'vendida' }, { ...P, estadoVenta: 'disponible', portales: P.portales });
  ok(msgs.length === 1 && /reactivado/.test(msgs[0]) && P.portales.pi.venta.status === 'active', 'al volver a disponible, se reactiva solo');
  msgs = await s.reaccionar(U, { ...P, precioVenta: { valor: 4500, moneda: 'UF' } }, { ...P });
  ok(msgs.length === 1 && /actualizado/.test(msgs[0]), 'si cambia el precio, el aviso se actualiza solo');
  msgs = await s.reaccionar(U, { ...P }, { ...P });
  ok(msgs.length === 0, 'sin cambios que importen, no toca el aviso');
  const fin = await s.accion(U, 'p1', 'venta', 'finalizar');
  ok(fin.accion === 'finalizado' && P.portales.pi.venta.status === 'closed', 'finalizar deja el aviso cerrado');
  msgs = await s.reaccionar(U, { ...P }, { ...P, estadoVenta: 'vendida' });
  ok(msgs.length === 0, 'un aviso finalizado ya no se toca');
  console.log('OK portal-inmobiliario-unit');
})().catch((e) => { console.error(e.message); process.exit(1); });
