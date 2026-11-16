// Comandos del chat de Leads: el corredor escribe «/» en la caja de respuesta y Asset le contesta con una tarjeta
// privada dentro del chat (nunca se manda al interesado). Aquí vive la lógica, sin pantalla:
//   /cartera [filtro]  /prop [código]  /match  /resumen  /nota texto  /plantilla …  /ayuda
// Las plantillas de texto son del usuario y se guardan en el servidor (colección «comandos»), así lo siguen a otro equipo.
import { monto } from '../../../utils/formato';
import { propiedadService } from '../../../store/services/propiedad.service';
import { busquedaTxt, nombreDe } from './formato';
import type { ILeadDetalle } from '../../../store/interfaces/lead.interface';
import type { IPropiedad, TOperacion } from '../../../store/interfaces/propiedad.interface';

export interface IPlantilla { nombre: string; texto: string }
/** una acción de una tarjeta: correr otro comando o dejar un texto en la caja de respuesta para editarlo */
export interface IAccionTarjeta { texto: string; cmd?: string; poner?: string; /** id de una propiedad que se le manda al interesado */ enviar?: { propiedadId: string; operacion?: string } }
export interface IItemTarjeta { titulo: string; detalle?: string; foto?: string | null; acciones?: IAccionTarjeta[] }
/** un formulario dentro de la tarjeta; `guardar` devuelve la tarjeta que la reemplaza (o lanza el error que se muestra en el formulario) */
export interface IFormulario { campos: { id: string; etiqueta: string; area?: boolean; valor?: string; placeholder?: string }[]; boton: string; guardar: (valores: Record<string, string>) => Promise<Omit<ITarjeta, 'id'>> }
export interface ITarjeta { id: number; titulo: string; texto?: string; items?: IItemTarjeta[]; acciones?: IAccionTarjeta[]; form?: IFormulario; error?: boolean }

export interface IContexto {
  l: ILeadDetalle;
  plantillas: IPlantilla[];
  guardarPlantillas: (l: IPlantilla[]) => Promise<void>;
  /** agrega una nota interna al lead */
  nota: (texto: string) => Promise<void>;
}
interface IComando { nombre: string; uso: string; ayuda: string; ejecutar: (c: IContexto, args: string) => Promise<Omit<ITarjeta, 'id'>> }

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const OPERACION = (p: IPropiedad, op: TOperacion) => (op === 'venta' ? p.venta && (!p.estadoVenta || p.estadoVenta === 'disponible') : p.arriendo && (!p.estadoArriendo || p.estadoArriendo === 'disponible'));
const disponible = (p: IPropiedad) => !p.archivada && (OPERACION(p, 'venta') || OPERACION(p, 'arriendo'));

/** el precio de la operación pedida (o el que tenga) */
export function precioTxt(p: IPropiedad, op?: string): string {
  const v = p.precioVenta && p.venta ? `${monto(p.precioVenta.valor, p.precioVenta.moneda)} venta` : '';
  const a = p.precioArriendo && p.arriendo ? `${monto(p.precioArriendo.valor, p.precioArriendo.moneda)}/mes` : '';
  if (op === 'venta') return v || a;
  if (op === 'arriendo') return a || v;
  return [v, a].filter(Boolean).join(' · ') || 'Precio por consultar';
}
const caracteristicas = (p: IPropiedad) => [
  p.dormitorios != null && `${p.dormitorios}D`, p.banos != null && `${p.banos}B`,
  p.estacionamientos ? `${p.estacionamientos} est.` : '', (p.supUtil || p.supTotal) ? `${p.supUtil || p.supTotal} m²` : '',
].filter(Boolean).join(' · ');

/** el aviso público de la propiedad en un portal (el que esté activo primero) */
export function enlacePortal(p: IPropiedad, op?: string): string {
  const todos: { url: string; activo: boolean; op: string }[] = [];
  for (const por of Object.values(p.portales || {})) for (const [o, a] of Object.entries(por || {})) {
    if (a?.permalink) todos.push({ url: a.permalink, activo: a.status === 'active', op: o });
  }
  todos.sort((x, y) => Number(y.activo) - Number(x.activo) || Number(y.op === op) - Number(x.op === op));
  return todos[0]?.url || '';
}

let cache: IPropiedad[] | null = null; let cacheEn = 0;
async function cartera(): Promise<IPropiedad[]> {
  if (!cache || Date.now() - cacheEn > 30_000) { cache = (await propiedadService.getAll()).propiedades; cacheEn = Date.now(); }
  return cache;
}
const porCodigo = async (cod: string) => { const c = sinTildes(cod.trim()); return (await cartera()).find((p) => sinTildes(p.codigo) === c); };

const acciones = (p: IPropiedad): IAccionTarjeta[] => [{ texto: 'Detalle', cmd: `/prop ${p.codigo}` }, { texto: 'Enviar', cmd: `/enviar ${p.codigo}` }];
const itemProp = (p: IPropiedad, op?: string): IItemTarjeta => ({
  titulo: `${p.codigo} · ${p.titulo}`,
  detalle: [p.comuna, caracteristicas(p), precioTxt(p, op)].filter(Boolean).join(' · '),
  foto: p.fotos?.[0] || null,
  acciones: acciones(p),
});

const TIPOS: Record<string, string> = { casa: 'casa', depto: 'departamento', departamento: 'departamento', oficina: 'oficina', sitio: 'sitio', parcela: 'parcela', local: 'local_comercial', bodega: 'bodega', terreno: 'terreno_construccion', estacionamiento: 'estacionamiento' };

interface IFiltro { op?: string; tipo?: string; dorm?: number; comunas?: string[]; texto?: string; hasta?: { valor: number; moneda: string } | null }
function filtrar(lista: IPropiedad[], f: IFiltro): IPropiedad[] {
  return lista.filter((p) => {
    if (!disponible(p)) return false;
    if (f.op === 'venta' && !OPERACION(p, 'venta')) return false;
    if (f.op === 'arriendo' && !OPERACION(p, 'arriendo')) return false;
    if (f.tipo && p.tipo !== f.tipo) return false;
    if (f.dorm != null && (p.dormitorios ?? 0) < f.dorm) return false;
    if (f.comunas?.length && !f.comunas.some((c) => sinTildes(p.comuna || '').includes(sinTildes(c)))) return false;
    if (f.texto && !sinTildes([p.codigo, p.titulo, p.direccion, p.comuna].join(' ')).includes(sinTildes(f.texto))) return false;
    if (f.hasta) {
      const pr = f.op === 'arriendo' ? p.precioArriendo : f.op === 'venta' ? p.precioVenta : (p.precioArriendo || p.precioVenta);
      if (pr && pr.moneda === f.hasta.moneda && pr.valor > f.hasta.valor * 1.1) return false; // 10 % de holgura
    }
    return true;
  });
}
function filtroDe(args: string): IFiltro {
  const f: IFiltro = {}; const resto: string[] = [];
  for (const t of args.split(/\s+/).filter(Boolean)) {
    const k = sinTildes(t);
    if (k === 'venta' || k === 'compra') f.op = 'venta';
    else if (k === 'arriendo') f.op = 'arriendo';
    else if (/^\d+d$/.test(k)) f.dorm = Number(k.slice(0, -1));
    else if (TIPOS[k]) f.tipo = TIPOS[k];
    else resto.push(t);
  }
  if (resto.length) f.texto = resto.join(' ');
  return f;
}
const filtroDelLead = (l: ILeadDetalle): IFiltro | null => {
  const b = l.busqueda; if (!b) return null;
  const f: IFiltro = { op: b.operacion === 'venta' || b.operacion === 'arriendo' ? b.operacion : undefined, tipo: b.tipo, dorm: b.dormitorios ?? undefined, comunas: b.comunas, hasta: b.presupuesto };
  return f.op || f.tipo || f.dorm != null || f.comunas?.length || f.hasta ? f : null;
};
const MAX = 12;
const listado = (titulo: string, lista: IPropiedad[], op?: string, vacio = 'No hay propiedades disponibles con eso.'): Omit<ITarjeta, 'id'> => lista.length
  ? { titulo: `${titulo} · ${lista.length}`, items: lista.slice(0, MAX).map((p) => itemProp(p, op)), texto: lista.length > MAX ? `Se muestran ${MAX} de ${lista.length}: agrega un filtro (comuna, 2d, arriendo…).` : undefined }
  : { titulo, texto: vacio };

function detalleProp(p: IPropiedad): Omit<ITarjeta, 'id'> {
  const link = enlacePortal(p);
  const lineas = [
    [p.tipo?.replace('_', ' '), p.comuna].filter(Boolean).join(' · '),
    [p.direccion, p.unidad].filter(Boolean).join(' '),
    caracteristicas(p),
    precioTxt(p),
    p.gastosComunes ? `Gastos comunes: $${p.gastosComunes.toLocaleString('es-CL')}` : '',
    p.amoblado ? 'Amoblado' : '',
    p.descripcion ? p.descripcion.slice(0, 400) + (p.descripcion.length > 400 ? '…' : '') : '',
    link ? `Aviso: ${link}` : 'Sin aviso público en un portal',
  ].filter(Boolean);
  return {
    titulo: `${p.codigo} · ${p.titulo}`,
    texto: lineas.join('\n'),
    items: p.fotos?.[0] ? [{ titulo: 'Foto principal', foto: p.fotos[0] }] : undefined,
    acciones: [{ texto: 'Texto para el cliente', poner: textoCliente(p) }, { texto: 'Enviar al cliente', cmd: `/enviar ${p.codigo}` }],
  };
}
/** la versión corta para mandarle al interesado */
export function textoCliente(p: IPropiedad, op?: string): string {
  const link = enlacePortal(p, op);
  return [`*${p.titulo}*`, [p.comuna, caracteristicas(p)].filter(Boolean).join(' · '), precioTxt(p, op), link].filter(Boolean).join('\n');
}

/** {nombre} y {propiedad} dentro de una plantilla */
export const rellenar = (t: string, l: ILeadDetalle) => t
  .replace(/\{nombre\}/gi, nombreDe(l).split(/\s+/)[0] || 'hola')
  .replace(/\{propiedad\}/gi, l.propiedadesInfo?.[0]?.titulo || 'la propiedad');
const limpiarNombre = (n: string) => n.toLowerCase().replace(/^\//, '').replace(/[^a-z0-9áéíóúñ_-]/g, '').slice(0, 30);

/** la tarjeta de /plantilla: tus textos (usar o borrar) y el formulario para crear uno nuevo */
function tarjetaPlantillas(c: IContexto, lista: IPlantilla[], aviso?: string): Omit<ITarjeta, 'id'> {
  return {
    titulo: lista.length ? `Tus plantillas · ${lista.length}` : 'Tus plantillas',
    texto: aviso || (lista.length ? undefined : 'Aún no tienes ninguna. Crea la primera abajo; después escribes «/nombre» y el texto queda en la caja.'),
    items: lista.map((p) => ({
      titulo: `/${p.nombre}`, detalle: rellenar(p.texto, c.l),
      acciones: [{ texto: 'Usar', poner: rellenar(p.texto, c.l) }, { texto: 'Borrar', cmd: `/plantilla borrar ${p.nombre}` }],
    })),
    form: {
      campos: [
        { id: 'nombre', etiqueta: 'Nombre del comando', placeholder: 'saludo' },
        { id: 'texto', etiqueta: 'Texto', area: true, placeholder: 'Hola {nombre}, soy … de la corredora. ¿En qué te puedo ayudar?' },
      ],
      boton: 'Guardar plantilla',
      guardar: async (v) => {
        const nombre = limpiarNombre(v.nombre || ''); const texto = (v.texto || '').trim();
        if (!nombre) throw new Error('Ponle un nombre al comando (letras y números, sin espacios).');
        if (!texto) throw new Error('Escribe el texto de la plantilla.');
        if (COMANDOS.some((x) => x.nombre === nombre)) throw new Error(`«/${nombre}» ya es un comando de Asset: elige otro nombre.`);
        const nueva = [...lista.filter((p) => p.nombre !== nombre), { nombre, texto }];
        await c.guardarPlantillas(nueva);
        return tarjetaPlantillas(c, nueva, `Plantilla /${nombre} guardada. Escribe «/${nombre}» donde quieras.`);
      },
    },
  };
}

const COMANDOS: IComando[] = [
  {
    nombre: 'cartera', uso: '/cartera [filtro]', ayuda: 'Lista tus propiedades disponibles. Filtros opcionales: venta, arriendo, 2d, casa, depto, comuna o código.',
    ejecutar: async (c, args) => {
      const todas = await cartera();
      const f = filtroDe(args);
      const lista = filtrar(todas, f);
      const t = listado(args.trim() ? 'Cartera' : 'Tu cartera disponible', lista, f.op,
        args.trim() ? 'Nada de tu cartera calza con ese filtro.' : 'No tienes propiedades disponibles en la cartera.');
      // sin filtro: toda la cartera; para lo que calza con este lead, /match
      return !args.trim() && lista.length && filtroDelLead(c.l) ? { ...t, texto: [t.texto, 'Para ver solo las que calzan con lo que busca este lead: /match'].filter(Boolean).join('\n') } : t;
    },
  },
  {
    nombre: 'prop', uso: '/prop [código]', ayuda: 'Detalle de la propiedad de esta conversación (o de la que indiques con su código).',
    ejecutar: async (c, args) => {
      if (args.trim()) { const p = await porCodigo(args); return p ? detalleProp(p) : { titulo: 'Propiedad', texto: `No encontré la propiedad «${args.trim()}» en tu cartera.`, error: true }; }
      const ids = c.l.propiedadesInfo || [];
      if (!ids.length) return { titulo: 'Propiedad', texto: 'Este lead no tiene una propiedad asociada. Usa «/prop CÓDIGO» o mira «/cartera».', error: true };
      const todas = await cartera(); const ps = ids.map((i) => todas.find((p) => p.id === i.id)).filter((p): p is IPropiedad => !!p);
      if (ps.length === 1) return detalleProp(ps[0]);
      return ps.length ? { titulo: `Propiedades de la conversación · ${ps.length}`, items: ps.map((p) => itemProp(p)) } : { titulo: 'Propiedad', texto: 'Esa propiedad ya no está en tu cartera.', error: true };
    },
  },
  {
    nombre: 'match', uso: '/match', ayuda: 'Propiedades de tu cartera que calzan con lo que busca este lead.',
    ejecutar: async (c) => {
      const f = filtroDelLead(c.l);
      if (!f) return { titulo: 'Coincidencias', texto: 'Todavía no sé qué busca este lead (operación, tipo, comuna, dormitorios o presupuesto). Usa «/cartera filtro» para buscar a mano.', error: true };
      return listado(`Calzan con «${busquedaTxt(c.l.busqueda)}»`, filtrar(await cartera(), f), f.op, 'Nada de tu cartera calza con eso por ahora.');
    },
  },
  {
    nombre: 'enviar', uso: '/enviar [código]', ayuda: 'Le manda al cliente una propiedad: una foto, los datos y el enlace de su aviso. Te muestra cómo saldrá y confirmas.',
    ejecutar: async (c, args) => {
      let p: IPropiedad | undefined;
      if (args.trim()) p = await porCodigo(args);
      else {
        const ids = c.l.propiedadesInfo || [];
        if (ids.length > 1) return { titulo: '¿Cuál le envías?', items: ids.map((i) => ({ titulo: `${i.codigo} · ${i.titulo}`, acciones: [{ texto: 'Enviar', cmd: `/enviar ${i.codigo}` }] })) };
        p = ids.length ? (await cartera()).find((x) => x.id === ids[0].id) : undefined;
      }
      if (!p) return { titulo: 'Enviar propiedad', texto: args.trim() ? `No encontré la propiedad «${args.trim()}» en tu cartera.` : 'Este lead no tiene una propiedad asociada: usa «/enviar CÓDIGO» (míralos con «/cartera»).', error: true };
      const op = c.l.busqueda?.operacion; const enlace = enlacePortal(p, op);
      return {
        titulo: `Enviar a ${nombreDe(c.l)}`,
        texto: [
          textoCliente(p, op), '',
          p.fotos?.[0] ? 'Va con la foto principal.' : '⚠ Esta propiedad no tiene fotos: saldrá solo el texto.',
          enlace ? '' : '⚠ No está publicada en un portal: saldrá sin enlace.',
        ].filter((x, i) => i < 2 || x).join('\n'),
        items: p.fotos?.[0] ? [{ titulo: 'Foto que se enviará', foto: p.fotos[0] }] : undefined,
        acciones: [{ texto: 'Enviar ahora', enviar: { propiedadId: p.id, operacion: op === 'venta' || op === 'arriendo' ? op : undefined } }],
      };
    },
  },
  {
    nombre: 'resumen', uso: '/resumen', ayuda: 'Resumen del lead: qué busca, en qué quedaron y qué sigue.',
    ejecutar: async (c) => {
      const l = c.l; const b = busquedaTxt(l.busqueda);
      const lineas = [
        l.resumen, l.perfil && `Perfil: ${l.perfil}`, b && `Busca: ${b}`,
        l.proximaAccion?.texto && `Sigue: ${l.proximaAccion.texto}${l.proximaAccion.fecha ? ` (${l.proximaAccion.fecha.slice(0, 10)})` : ''}`,
        l.notas && `Notas: ${l.notas.slice(-300)}`,
      ].filter(Boolean) as string[];
      return { titulo: `Resumen · ${nombreDe(l)}`, texto: lineas.join('\n') || 'Todavía no hay resumen: la IA lo arma cuando hay conversación. Puedes pedir «Reanalizar» en la ficha.' };
    },
  },
  {
    nombre: 'nota', uso: '/nota', ayuda: 'Abre un formulario para guardar una nota interna en el lead. No se envía al cliente.',
    ejecutar: async (c, args) => ({
      titulo: `Nota para ${nombreDe(c.l)}`,
      texto: c.l.notas ? `Notas actuales:\n${c.l.notas.slice(-400)}` : undefined,
      form: {
        campos: [{ id: 'texto', etiqueta: 'Nota', area: true, valor: args.trim(), placeholder: 'Ej.: prefiere piso alto, llamar después de las 18:00' }],
        boton: 'Guardar nota',
        guardar: async (v) => {
          const t = (v.texto || '').trim(); if (!t) throw new Error('Escribe la nota.');
          await c.nota(t); return { titulo: 'Nota guardada', texto: t };
        },
      },
    }),
  },
  {
    nombre: 'plantilla', uso: '/plantilla', ayuda: 'Tus textos guardados: úsalos, créalos o bórralos (siguen contigo en cualquier equipo). Usa {nombre} y {propiedad} dentro del texto. También puedes escribir «/nombre» directo.',
    ejecutar: async (c, args) => {
      const [sub, nombreArg] = args.trim().split(/\s+/);
      if (sinTildes(sub || '') === 'borrar' && nombreArg) {
        const nombre = limpiarNombre(nombreArg);
        if (!c.plantillas.some((p) => p.nombre === nombre)) return tarjetaPlantillas(c, c.plantillas, `No tienes «/${nombre}».`);
        const lista = c.plantillas.filter((p) => p.nombre !== nombre);
        await c.guardarPlantillas(lista);
        return tarjetaPlantillas(c, lista, `Plantilla /${nombre} borrada.`);
      }
      return tarjetaPlantillas(c, c.plantillas);
    },
  },
  {
    nombre: 'ayuda', uso: '/ayuda', ayuda: 'Lista los comandos.',
    ejecutar: async (c) => ({
      titulo: 'Comandos',
      items: [...COMANDOS.map((x) => ({ titulo: x.uso, detalle: x.ayuda })), ...c.plantillas.map((p) => ({ titulo: `/${p.nombre}`, detalle: `Tu plantilla: ${p.texto.slice(0, 80)}` }))],
    }),
  },
];

/** los comandos (y las plantillas del usuario) que calzan con lo que lleva escrito */
export function sugerencias(escrito: string, plantillas: IPlantilla[]): { nombre: string; ayuda: string }[] {
  const q = sinTildes(escrito.slice(1));
  return [
    ...COMANDOS.map((c) => ({ nombre: c.nombre, ayuda: c.ayuda })),
    ...plantillas.filter((p) => !COMANDOS.some((c) => c.nombre === p.nombre)).map((p) => ({ nombre: p.nombre, ayuda: `Tu plantilla: ${p.texto.slice(0, 70)}` })),
  ].filter((s) => sinTildes(s.nombre).startsWith(q));
}
/** una «/palabra» dentro del texto: desde dónde hasta dónde está y qué se escribió (solo hasta el cursor) */
export interface IToken { ini: number; fin: number; nombre: string }
/** la «/palabra» que tiene el cursor: al principio o después de un espacio, en cualquier parte de lo que se escribe */
export function tokenEn(texto: string, pos: number): IToken | null {
  const m = /(^|\s)\/([^\s/]*)$/.exec(texto.slice(0, pos));
  if (!m) return null;
  const resto = /^[^\s/]*/.exec(texto.slice(pos))?.[0] ?? '';
  return { ini: pos - m[2].length - 1, fin: pos + resto.length, nombre: m[2] };
}
/** el primer «/comando» (o «/plantilla») completo dentro del texto: un comando nunca se manda al cliente */
export function comandoEnTexto(texto: string, plantillas: IPlantilla[]): IToken | null {
  const conocidos = new Set([...COMANDOS.map((c) => c.nombre), ...plantillas.map((p) => p.nombre)]);
  for (const m of texto.matchAll(/(^|\s)\/([^\s/]+)(?=\s|$)/g)) {
    const nombre = limpiarNombre(m[2]);
    if (conocidos.has(nombre)) { const ini = (m.index ?? 0) + m[1].length; return { ini, fin: ini + 1 + m[2].length, nombre }; }
  }
  return null;
}

export type TResultadoComando = { tarjeta: Omit<ITarjeta, 'id'> } | { poner: string };
/** corre «/comando args»; una plantilla suelta («/saludo») deja su texto en la caja */
export async function correr(escrito: string, c: IContexto): Promise<TResultadoComando> {
  const m = /^\/(\S*)\s*([\s\S]*)$/.exec(escrito.trim()); const nombre = limpiarNombre(m?.[1] || ''); const args = m?.[2] || '';
  const cmd = COMANDOS.find((x) => x.nombre === nombre);
  if (cmd) {
    try { return { tarjeta: await cmd.ejecutar(c, args) }; }
    catch (e) { return { tarjeta: { titulo: `/${nombre}`, texto: (e as Error).message || 'No se pudo.', error: true } }; }
  }
  const p = c.plantillas.find((x) => x.nombre === nombre);
  if (p) return { poner: rellenar(p.texto, c.l) };
  return { tarjeta: { titulo: 'Comando desconocido', texto: `«/${nombre}» no existe. Escribe «/ayuda» para ver la lista. No se envió nada al cliente.`, error: true } };
}
