/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return -- la ficha es JSON libre */
// Ficha completa de una propiedad (los ~130 datos del formulario de Prop360), ordenada en 5 bloques para pedirla por voz y por
// WhatsApp de a poco: 1 Lo esencial · 2 Datos para los portales (★) · 3 Propietario y datos legales · 4 Equipamiento y
// terminaciones · 5 Visita y publicación. Es el port al servidor de desktop/src/ficha-campos.js (UNA sola regla para la app y WhatsApp).
// Cada campo dice si aplica al tipo de propiedad y si es CLAVE (sin él no se avanza). Los datos de siempre viven en su columna
// (`plano`); los nuevos van en `ficha`. Los datos del propietario salen del vínculo (persona) o de lo anotado en la ficha.
import { normalizar } from '../comun/texto';

export interface PropFicha {
  tipo?: string | null;
  venta?: boolean;
  arriendo?: boolean;
  ficha?: Record<string, unknown> | null;
  /** el propietario vinculado (si el usuario puede verlo) */
  propietario?: { nombre?: string | null; telefono?: string | null; rut?: string | null; email?: string | null } | null;
  /** el usuario no ve los datos del propietario (no captó la propiedad): no se piden */
  ocultarDueno?: boolean;
  [k: string]: unknown;
}
export interface Bloque {
  id: string;
  n: number;
  t: string;
  d: string;
}
export interface Campo {
  id: string;
  t: string;
  k: 'num' | 'bool' | 'lista' | 'texto' | 'precio';
  b: string;
  pi: boolean;
  plano: boolean;
  si: (p: PropFicha) => boolean;
  req: ((p: PropFicha) => boolean) | null;
  op?: string[];
  voz?: string;
  per?: 'nombre' | 'telefono' | 'rut' | 'email';
  virtual?: (p: PropFicha) => unknown;
}

export const BLOQUES: Bloque[] = [
  { id: 'esencial', n: 1, t: 'Lo esencial', d: 'Tipo, operación, precio, dirección completa y propietario' },
  { id: 'portal', n: 2, t: 'Datos para los portales', d: 'Lo que exigen Portal Inmobiliario y Mercado Libre' },
  { id: 'legal', n: 3, t: 'Propietario y datos legales', d: 'Lo que se necesita para el mandato' },
  { id: 'equip', n: 4, t: 'Equipamiento y terminaciones', d: 'Ambientes, comodidades, exteriores y materiales' },
  { id: 'visita', n: 5, t: 'Visita y publicación', d: 'Cómo se visita, llaves, letrero y dónde se publica' },
];

// grupos de tipos de propiedad
const VIV = ['casa', 'departamento'];
const UNIDAD = ['departamento', 'oficina', 'local_comercial', 'bodega', 'estacionamiento']; // están dentro de un edificio
export const CON_UNIDAD = UNIDAD;
const CON_TERRENO = ['casa', 'sitio', 'parcela', 'terreno_construccion', 'agricola', 'industrial'];
const CONSTRUIDO = ['casa', 'departamento', 'oficina', 'local_comercial', 'industrial', 'bodega'];
const en = (lista: string[]) => (p: PropFicha) => lista.includes(String(p.tipo));
const siempre = () => true;
const enCondominio = (p: PropFicha) => !!(p.ficha?.enCondominio || p.ficha?.condominioCerrado);

// listas desplegables (todas aceptan «Otro» con texto libre)
export const L = {
  banco: ['Banco de Chile / Edwards', 'BancoEstado', 'Santander', 'BCI', 'Scotiabank', 'Itaú', 'BICE', 'Security', 'Consorcio', 'Internacional', 'Falabella', 'Ripley', 'Coopeuch', 'Mutuaria o aseguradora'],
  piso: ['Porcelanato', 'Cerámica', 'Piso flotante', 'Parquet', 'Madera nativa', 'Piso fotolaminado', 'Vinílico', 'Alfombra', 'Mármol', 'Baldosa', 'Flexit', 'Cemento pulido', 'Microcemento', 'Piedra'],
  estiloCasa: ['Moderna', 'Mediterránea', 'Colonial', 'Chilena tradicional', 'Americana', 'Inglesa', 'Minimalista', 'Rústica', 'Clásica'],
  tipoCasa: ['Casa', 'Casa en condominio', 'Pareada', 'Aislada', 'Dúplex', 'Tríplex', 'Chalet', 'Cabaña', 'Casa de campo', 'Townhouse'],
  recepcion: ['Sí, total', 'Parcial', 'En trámite', 'No tiene', 'No sabe'],
  orientacion: ['Norte', 'Sur', 'Oriente', 'Poniente', 'Nororiente', 'Norponiente', 'Suroriente', 'Surponiente', 'Norte-Oriente', 'Norte-Poniente', 'Sur-Oriente', 'Sur-Poniente', 'Oriente-Poniente', 'Norte-Sur'],
  mueblesCocina: ['Melamina', 'Madera', 'Termolaminado', 'Laca', 'Postformado', 'MDF', 'Acero'],
  aislacion: ['Lana de vidrio', 'Lana mineral', 'Poliestireno expandido', 'Poliuretano', 'EIFS', 'Sin aislación'],
  gas: ['Gas natural (red)', 'Gas licuado de cañería', 'Gas licuado en cilindro', 'Sin gas'],
  termopanel: ['En todas las ventanas', 'Solo en dormitorios', 'Parcial', 'No tiene'],
  aguaCaliente: ['Calefón', 'Caldera central', 'Caldera individual', 'Termo eléctrico', 'Termo a gas', 'Panel solar', 'Bomba de calor'],
  calefaccion: ['Losa radiante', 'Central (radiadores)', 'Caldera individual', 'Aire acondicionado / bomba de calor', 'Eléctrica', 'Estufa a gas', 'Estufa a pellet', 'Chimenea / leña', 'Sin calefacción'],
  cocina: ['Cerrada', 'Americana (abierta)', 'Isla', 'Semiabierta', 'Kitchenette'],
  construccion: ['Hormigón armado', 'Albañilería (ladrillo)', 'Madera', 'Metalcon / acero', 'Mixta', 'Adobe', 'Prefabricada'],
  techo: ['Teja', 'Teja asfáltica', 'Zinc / planchas metálicas', 'Losa', 'Fibrocemento'],
  ventanas: ['Aluminio', 'PVC', 'Madera', 'Fierro', 'Termopanel aluminio', 'Termopanel PVC'],
  alcantarillado: ['Red pública', 'Fosa séptica', 'Planta de tratamiento'],
  agua: ['Red pública', 'Pozo', 'APR (agua potable rural)', 'Derechos de agua'],
  subtipoDepto: ['Departamento', 'Dúplex', 'Tríplex', 'Loft', 'Penthouse', 'Estudio / monoambiente'],
  subtipoOficina: ['Oficina', 'Oficina en casa', 'Consulta'],
};

const C = (id: string, t: string, k: Campo['k'], b: string, extra: Partial<Campo> = {}): Campo => ({
  id,
  t,
  k,
  b,
  pi: false,
  plano: false,
  si: siempre,
  req: null,
  ...extra,
});
const bools = (lista: [string, string, number?][], b: string, si: (p: PropFicha) => boolean) =>
  lista.map(([id, t, pi]) => C(id, t, 'bool', b, { pi: !!pi, si }));

// k: num | bool | lista | texto | precio · b: bloque · pi: ★ va a los portales · plano: vive en la columna (p[id])
export const CAMPOS: Campo[] = [
  // 1 · esencial
  C('tipo', 'Tipo de propiedad', 'lista', 'esencial', { plano: true, req: siempre }),
  C('operacion', 'Venta o arriendo', 'texto', 'esencial', { plano: true, req: siempre, virtual: (p) => p.venta || p.arriendo }),
  C('precioVenta', 'Precio de venta', 'precio', 'esencial', { plano: true, pi: true, si: (p) => !!p.venta, req: (p) => !!p.venta }),
  C('precioArriendo', 'Precio de arriendo', 'precio', 'esencial', { plano: true, pi: true, si: (p) => !!p.arriendo, req: (p) => !!p.arriendo }),
  C('comuna', 'Comuna', 'texto', 'esencial', { plano: true, pi: true, req: siempre }),
  C('direccion', 'Calle y número', 'texto', 'esencial', { plano: true, req: siempre }),
  C('unidad', 'N° de departamento, oficina o local', 'texto', 'esencial', { plano: true, si: (p) => UNIDAD.includes(String(p.tipo)) || enCondominio(p), req: (p) => UNIDAD.includes(String(p.tipo)), voz: 'número de depto, oficina, local, casa en condominio, lote' }),
  C('letra', 'Letra o torre', 'texto', 'esencial', { si: en(['departamento', 'oficina']) }),
  C('etapa', 'Etapa (condominio)', 'texto', 'esencial', { si: (p) => enCondominio(p) }),
  C('propietarioNombre', 'Nombre completo o razón social del propietario', 'texto', 'esencial', { req: siempre, per: 'nombre' }),
  C('propietarioCelular', 'Celular del propietario', 'texto', 'esencial', { req: siempre, per: 'telefono' }),
  // 2 · portales (★)
  C('dormitorios', 'Dormitorios', 'num', 'portal', { plano: true, pi: true, si: en(VIV), req: en(VIV) }),
  C('suites', 'N° de suites', 'num', 'portal', { pi: true, si: en(VIV) }),
  C('banos', 'Baños', 'num', 'portal', { plano: true, pi: true, si: en([...VIV, 'oficina', 'local_comercial']), req: en(VIV) }),
  C('salasEstar', 'N° de salas de estar', 'num', 'portal', { pi: true, si: en(VIV) }),
  C('supUtil', 'Superficie construida / útil (m²)', 'num', 'portal', { plano: true, pi: true, si: en(CONSTRUIDO), req: en(CONSTRUIDO) }),
  C('supTotal', 'Superficie de terreno o total (m²)', 'num', 'portal', { plano: true, pi: true, si: (p) => p.tipo !== 'estacionamiento', req: en(CON_TERRENO) }),
  C('supTerraza', 'Superficie de terraza (m²)', 'num', 'portal', { pi: true, si: en(['departamento', 'oficina']) }),
  C('pisoUnidad', 'Piso en que está', 'num', 'portal', { si: en(UNIDAD), req: en(['departamento', 'oficina']), voz: 'piso del depto, en qué piso está' }),
  C('pisos', 'N° de pisos (casa o edificio)', 'num', 'portal', { pi: true, si: en([...VIV, 'oficina', 'local_comercial', 'industrial']) }),
  C('ascensores', 'N° de ascensores', 'num', 'portal', { pi: true, si: en(UNIDAD) }),
  C('anio', 'Año de construcción', 'num', 'portal', { pi: true, si: en(CONSTRUIDO) }),
  C('orientacion', 'Orientación', 'lista', 'portal', { pi: true, op: L.orientacion, si: en([...VIV, 'oficina']), req: en(VIV) }),
  C('estacionamientos', 'Estacionamientos', 'num', 'portal', { plano: true, pi: true, si: (p) => !['sitio', 'parcela', 'estacionamiento', 'bodega'].includes(String(p.tipo)), req: en([...VIV, 'oficina']) }),
  C('bodegas', 'Bodegas', 'num', 'portal', { plano: true, pi: true, si: en([...VIV, 'oficina', 'local_comercial']), req: en(VIV) }),
  C('gastosComunes', 'Gastos comunes ($)', 'num', 'portal', { plano: true, pi: true, si: (p) => UNIDAD.includes(String(p.tipo)) || enCondominio(p), req: (p) => en(['departamento', 'oficina'])(p) || enCondominio(p) }),
  C('amoblado', 'Amoblado', 'bool', 'portal', { plano: true, pi: true, si: en([...VIV, 'oficina']), req: (p) => !!p.arriendo && en(VIV)(p) }),
  C('mascotas', 'Se permiten mascotas', 'bool', 'portal', { pi: true, si: en(VIV), req: (p) => !!p.arriendo && en(VIV)(p) }),
  C('calefaccion', 'Tipo de calefacción', 'lista', 'portal', { pi: true, op: L.calefaccion, si: en([...VIV, 'oficina']) }),
  C('tipoCasa', 'Tipo de casa', 'lista', 'portal', { pi: true, op: L.tipoCasa, si: en(['casa']) }),
  C('subtipo', 'Tipo de departamento u oficina', 'lista', 'portal', { pi: true, op: [...L.subtipoDepto, ...L.subtipoOficina], si: en(['departamento', 'oficina']) }),
  C('ambientes', 'Ambientes', 'num', 'portal', { pi: true, si: en(VIV) }),
  C('horarioContacto', 'Horario de contacto', 'texto', 'portal', { pi: true }),
  C('tipoSeguridad', 'Tipo de seguridad', 'texto', 'portal', { pi: true, si: en([...VIV, 'oficina']), voz: 'conserje, guardia, alarma monitoreada' }),
  // 3 · propietario y datos legales
  C('propietarioRut', 'RUT o Rol Único Tributario del propietario', 'texto', 'legal', { req: siempre, per: 'rut' }),
  C('propietarioEmail', 'Correo del propietario', 'texto', 'legal', { req: siempre, per: 'email' }),
  C('rol', 'Rol (manzana-predio)', 'texto', 'legal', { plano: true, req: siempre, voz: 'rol de avalúo, rol SII' }),
  // inscripción de dominio y cuenta de pago: las usan la carta oferta, el contrato de arriendo y el mandato
  C('fojas', 'Fojas de la inscripción de dominio', 'texto', 'legal', { voz: 'fojas, inscripción de dominio, título de dominio' }),
  C('numeroInscripcion', 'Número de la inscripción de dominio', 'texto', 'legal', { voz: 'número de inscripción' }),
  C('anioInscripcion', 'Año de la inscripción de dominio', 'texto', 'legal', { voz: 'año de inscripción, registro de propiedad del año' }),
  C('conservador', 'Conservador de Bienes Raíces', 'texto', 'legal', { voz: 'conservador, CBR de Santiago' }),
  C('cuentaPago', 'Cuenta donde se paga la renta', 'texto', 'legal', { si: (p) => !!p.arriendo, voz: 'cuenta bancaria del arrendador, cuenta corriente, banco para el arriendo' }),
  C('condicionesMandato', 'Otras condiciones del mandato', 'texto', 'legal', { si: (p) => !!p.arriendo, voz: 'condiciones especiales del mandato' }),
  // mandato de venta: la comisión va como texto («2» o «2,5») para no perder los decimales
  C('comisionVentaPct', 'Comisión de venta (% + IVA)', 'texto', 'legal', { si: (p) => !!p.venta, voz: 'comisión de venta, porcentaje de comisión' }),
  C('condicionesMandatoVenta', 'Otras condiciones del mandato de venta', 'texto', 'legal', { si: (p) => !!p.venta, voz: 'condiciones especiales del mandato de venta' }),
  C('exclusividad', 'Exclusividad', 'bool', 'legal', { req: siempre }),
  C('publicarPortales', 'Publicar en portales y redes sociales', 'bool', 'legal', { voz: 'si quiere que se publique; si no, solo cartera' }),
  C('mesesGarantia', 'Meses de garantía que se pedirán', 'num', 'legal', { si: (p) => !!p.arriendo, voz: 'mes de garantía, meses de garantía, garantía' }),
  C('tasacion', 'Precio de tasación', 'precio', 'legal'),
  C('contribuciones', 'Contribuciones (trimestrales, $)', 'num', 'legal'),
  C('deuda', 'Deuda', 'num', 'legal'),
  C('hipoteca', 'Hipoteca', 'texto', 'legal'),
  C('banco', 'Banco', 'lista', 'legal', { op: L.banco, si: (p) => !!(p.ficha?.hipoteca || p.ficha?.deuda) }),
  C('recepcionFinal', 'Recepción final', 'lista', 'legal', { op: L.recepcion, si: en(CONSTRUIDO) }),
  // 4 · equipamiento y terminaciones (lo no mencionado queda en No)
  ...bools([['piezaServicio', 'Pieza de servicio', 1], ['banoServicio', 'Baño de servicio'], ['jacuzzi', 'Jacuzzi', 1], ['bodegaInterior', 'Bodega (dentro de la propiedad)'], ['comedorDiario', 'Comedor de diario'], ['familyRoom', 'Family room'], ['recibos', 'Recibos'], ['sauna', 'Sauna', 1], ['jardin', 'Jardín', 1]], 'equip', en(VIV)),
  C('piezasServicio', 'Piezas de servicio', 'num', 'equip', { si: en(VIV) }),
  C('camasServicio', 'Camas de servicio', 'num', 'equip', { si: en(VIV) }),
  C('estacCubiertos', 'Estacionamientos cubiertos', 'num', 'equip', { si: en(VIV) }),
  C('estacDescubiertos', 'Estacionamientos descubiertos', 'num', 'equip', { si: en(VIV) }),
  ...[['pisoDormitorios', 'Piso de los dormitorios'], ['pisoBanos', 'Piso de los baños'], ['pisoCocina', 'Piso de la cocina'], ['pisoComedor', 'Piso del comedor'], ['pisoLiving', 'Piso del living'], ['pisoHall', 'Piso del hall de entrada']].map(([id, t]) =>
    C(id, t, 'lista', 'equip', { op: L.piso, si: en([...VIV, 'oficina']) }),
  ),
  C('estiloCasa', 'Estilo de casa', 'lista', 'equip', { op: L.estiloCasa, si: en(['casa']) }),
  C('mueblesCocina', 'Muebles de cocina', 'lista', 'equip', { op: L.mueblesCocina, si: en(VIV) }),
  C('aislacion', 'Aislación', 'lista', 'equip', { op: L.aislacion, si: en(['casa']) }),
  C('gas', 'Tipo de gas', 'lista', 'equip', { op: L.gas, si: en(VIV) }),
  C('termopanel', 'Termopanel', 'lista', 'equip', { op: L.termopanel, si: en([...VIV, 'oficina']) }),
  C('aguaCaliente', 'Agua caliente', 'lista', 'equip', { op: L.aguaCaliente, si: en(VIV) }),
  C('tipoCocina', 'Tipo de cocina', 'lista', 'equip', { op: L.cocina, si: en(VIV) }),
  C('construccion', 'Tipo de construcción', 'lista', 'equip', { op: L.construccion, si: en(CONSTRUIDO) }),
  C('techo', 'Tipo de techo', 'lista', 'equip', { op: L.techo, si: en(['casa', 'industrial', 'bodega']) }),
  C('ventanas', 'Tipo de ventanas', 'lista', 'equip', { op: L.ventanas, si: en([...VIV, 'oficina']) }),
  // exteriores
  ...bools([['barbecue', 'Barbecue / quincho'], ['canchaTenis', 'Cancha de tenis', 1], ['cercoElectrico', 'Cerco eléctrico'], ['cctv', 'Circuito cerrado de vigilancia'], ['juegosInfantiles', 'Juegos infantiles'], ['piscina', 'Piscina', 1], ['portonAutomatico', 'Portón automático', 1], ['rejaPiscina', 'Reja de piscina'], ['riegoAutomatico', 'Riego automático']], 'equip', en([...VIV, ...CON_TERRENO])),
  // urbanización
  C('aguaRiego', 'Agua de riego', 'bool', 'equip', { si: en(CON_TERRENO) }),
  C('aguaPozo', 'Agua de pozo', 'bool', 'equip', { si: en(CON_TERRENO) }),
  C('enCondominio', 'En condominio', 'bool', 'equip', { si: en(['casa', 'sitio', 'parcela']) }),
  C('alcantarillado', 'Alcantarillado', 'lista', 'equip', { op: L.alcantarillado, si: en(CON_TERRENO) }),
  C('tipoAgua', 'Tipo de agua', 'lista', 'equip', { op: L.agua, si: en(CON_TERRENO) }),
  // portal › adicionales, ambientes, comodidades y otros (★)
  ...[
    ['aguaCorriente', 'Agua corriente'], ['alarma', 'Alarma'], ['caldera', 'Caldera'], ['gasNatural', 'Gas natural'], ['generador', 'Generador eléctrico'], ['lineaTelefonica', 'Línea telefónica'],
    ['balcon', 'Balcón'], ['banoVisitas', 'Baño de visitas'], ['closets', 'Clósets'], ['cocinaAmb', 'Cocina'], ['comedorAmb', 'Comedor'], ['desayunador', 'Desayunador'], ['homeoffice', 'Home office'], ['mansarda', 'Mansarda'], ['parrilla', 'Parrilla'], ['patio', 'Patio'], ['playroom', 'Playroom'], ['terraza', 'Terraza'], ['walkin', 'Walk-in clóset'],
    ['internet', 'Acceso a internet'], ['aireAcondicionado', 'Aire acondicionado'], ['areaCine', 'Área de cine'], ['areaJuegos', 'Área de juegos infantiles'], ['canchaBasquetbol', 'Cancha de básquetbol'], ['canchaFutbol', 'Cancha de fútbol'], ['canchaPaddle', 'Cancha de paddle'], ['chimenea', 'Chimenea'], ['cisterna', 'Cisterna'], ['conserjeria', 'Conserjería 24 horas'], ['estacVisitas', 'Estacionamiento de visitas'], ['gimnasio', 'Gimnasio'], ['refrigerador', 'Refrigerador'], ['salonFiestas', 'Salón de fiestas'], ['tvCable', 'TV por cable'],
    ['accesoControlado', 'Acceso controlado'], ['aptoCredito', 'Apto crédito hipotecario'], ['areaVerde', 'Con área verde'], ['condominioCerrado', 'Condominio cerrado'], ['lavarropas', 'Conexión para lavadora'], ['energiaSolar', 'Energía solar'], ['remate', 'Propiedad en remate'],
  ].map(([id, t]) => C(id, t, 'bool', 'equip', { pi: true, si: id === 'remate' || id === 'aptoCredito' ? siempre : en([...VIV, 'oficina']) })),
  // 5 · visita y publicación
  C('formaVisitar', 'Forma de visitar', 'texto', 'visita', { req: siempre, voz: 'quién abre, con cuánto aviso, horarios, conserje' }),
  C('llavesOficina', 'Llaves en la oficina', 'bool', 'visita'),
  C('letrero', 'Tiene letrero', 'bool', 'visita'),
  C('notasInternas', 'Observaciones internas', 'texto', 'visita', { plano: true }),
  C('destacada', 'Destacada en internet', 'bool', 'visita'),
];
export const POR_ID: Record<string, Campo> = Object.fromEntries(CAMPOS.map((c) => [c.id, c]));

const vacio = (v: unknown) =>
  v == null ||
  v === '' ||
  (typeof v === 'object' && !Array.isArray(v) && (v as { valor?: unknown }).valor == null && !Object.keys(v).length);
export function valor(p: PropFicha, c: Campo): unknown {
  if (c.virtual) return c.virtual(p);
  if (c.per) return p.propietario?.[c.per] || p.ficha?.[c.id]; // del propietario vinculado, o lo anotado mientras no está en el CRM
  return c.plano ? p[c.id] : p.ficha?.[c.id];
}
// ¿falta? Los sí/no del equipamiento nunca «faltan» (lo no dicho es No); los clave sí
export function falta(p: PropFicha, c: Campo): boolean {
  const v = valor(p, c);
  if (c.k === 'bool') return c.req ? v == null : false;
  if (c.k === 'precio') return !v || (v as { valor?: unknown }).valor == null;
  return vacio(v);
}
export interface Avance {
  id: string;
  n: number;
  t: string;
  d: string;
  total: number;
  completos: number;
  faltanClave: string[];
  faltan: string[];
  listo: boolean;
}
/** avance por bloque: total que aplica, completos, claves que faltan y el resto que falta */
export function avance(p: PropFicha): Avance[] {
  return BLOQUES.map((b) => {
    // sin acceso al propietario (la propiedad la captó otro): sus datos no se piden ni cuentan como faltantes
    const cs = CAMPOS.filter((c) => c.b === b.id && c.si(p) && !(p.ocultarDueno && (c.per || /^propietario/.test(c.id))));
    const clave = cs.filter((c) => c.req && c.req(p) && falta(p, c)).map((c) => c.t);
    const otros = cs.filter((c) => !(c.req && c.req(p)) && c.k !== 'bool' && falta(p, c)).map((c) => c.t);
    const conValor = cs.filter((c) => !falta(p, c) && (c.k !== 'bool' || valor(p, c) != null)).length;
    return {
      id: b.id,
      n: b.n,
      t: b.t,
      d: b.d,
      total: cs.length,
      completos: conValor,
      faltanClave: clave,
      faltan: otros,
      // el equipamiento no tiene claves: basta con haberlo recorrido
      listo: !clave.length && (b.id !== 'equip' || conValor > 0),
    };
  });
}
/** lo que hay que pedir ahora: el primer bloque con datos clave pendientes (y, en el de portales, también lo ★ sin dato) */
export function siguiente(p: PropFicha) {
  const av = avance(p);
  const b = av.find((x) => !x.listo);
  if (!b) return { bloque: null as Avance | null, pedir: [] as string[], av };
  const extra =
    b.id === 'portal'
      ? CAMPOS.filter((c) => c.b === 'portal' && c.si(p) && c.pi && !(c.req && c.req(p)) && c.k !== 'bool' && falta(p, c))
          .map((c) => c.t)
          .slice(0, 4)
      : [];
  return { bloque: b as Avance | null, pedir: [...b.faltanClave, ...extra], av };
}
const nn = (s: unknown) => normalizar(String(s ?? ''));
/** limpia lo que llega (formulario, dictado o WhatsApp) a lo que acepta cada campo de `ficha` */
export function limpiarFicha(o: Record<string, unknown>, previo: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(previo || {}) };
  for (const [k, v] of Object.entries(o || {})) {
    const c = POR_ID[k];
    if (!c || c.plano || c.virtual) continue;
    if (v === null || v === '') {
      delete out[k];
      continue;
    }
    if (c.k === 'num') {
      const n = Number(String(v).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
      if (Number.isFinite(n)) out[k] = n;
    } else if (c.k === 'bool') out[k] = v === true || /^(s[ií]|true|1|tiene)$/i.test(String(v));
    else if (c.k === 'precio') {
      const pv = v as { valor?: unknown; moneda?: unknown };
      const n = Number(pv?.valor ?? v);
      if (Number.isFinite(n) && n > 0)
        out[k] = { valor: n, moneda: ['UF', 'CLP', 'USD'].includes(String(pv?.moneda).toUpperCase()) ? String(pv.moneda).toUpperCase() : n < 50000 ? 'UF' : 'CLP' };
    } else if (c.k === 'lista') {
      const t = String(v).trim().slice(0, 80);
      const op = (c.op || []).find((x) => nn(x) === nn(t)) || (c.op || []).find((x) => nn(x).startsWith(nn(t)) || nn(t).startsWith(nn(x)));
      out[k] = op || t;
    } else out[k] = String(v).trim().slice(0, 600);
  }
  return out;
}
/** para la IA: qué campos existen (nuevos) y sus opciones, en una línea cada uno */
export function guiaIA(p: PropFicha | null = null): string {
  return CAMPOS.filter((c) => !c.plano && !c.virtual && (!p || c.si(p)))
    .map((c) => `${c.id}: ${c.t}${c.k === 'bool' ? ' (true/false)' : c.k === 'num' ? ' (número)' : c.k === 'precio' ? ' ({valor, moneda})' : ''}${c.op ? ` [${c.op.join(' | ')}]` : ''}${c.voz ? ` — ${c.voz}` : ''}`)
    .join('\n');
}
