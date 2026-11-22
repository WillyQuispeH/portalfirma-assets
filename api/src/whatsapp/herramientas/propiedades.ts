/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument -- los argumentos de las herramientas son JSON libre de la IA */
// Herramientas de PROPIEDADES, PERSONAS, LEADS, AGENDA y PORTALES del equipo, en el servidor (ver LEEME.md). Son una capa DELGADA sobre los
// servicios de dominio, que tienen su endpoint REST y son los que usa también la app de escritorio:
//   PropiedadesAccionesService (propiedades/propiedades-acciones.ts) · PersonasAccionesService (personas/personas-acciones.ts)
//   LeadsAccionesService (leads/leads-acciones.ts) · AgendaAccionesService (agenda/agenda-acciones.ts)
//   PortalInmobiliarioService (conexiones/portal-inmobiliario.ts) · CorredorPerfilService (usuarios/corredor-perfil.ts)
// Aquí solo: los parámetros que ve la IA, resolver «CV-5514» o «Ana Rojas», los dos pasos con `confirmado` y dar la respuesta corta.
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { UsuarioToken } from '../../auth/usuario-actual';
import type { EntidadTipo } from '../../comun/actividad.service';
import { PropiedadesService } from '../../propiedades/propiedades.service';
import { mensajeDe, PropiedadesAccionesService } from '../../propiedades/propiedades-acciones';
import { aEntrada, faltan as faltanDictado, normalizarCampos, type CamposDictado } from '../../propiedades/dictado';
import { ESTADOS, TIPOS, type PropiedadEntrada } from '../../propiedades/propiedades.esquemas';
import { PersonasService } from '../../personas/personas.service';
import { PersonasAccionesService } from '../../personas/personas-acciones';
import { ROLES } from '../../personas/personas.esquemas';
import { AgendaAccionesService } from '../../agenda/agenda-acciones';
import { LeadsAccionesService, ORIGENES_LEAD, ESTADOS_LEAD } from '../../leads/leads-acciones';
import { pareceChat } from '../../leads/chat-whatsapp';
import { CorredorPerfilService } from '../../usuarios/corredor-perfil';
import { PortalInmobiliarioService } from '../../conexiones/portal-inmobiliario';
import { hoy, sumarDias } from '../comun';
import { AyudasHerramientas, fechaIso, pesos } from './ayudas';
import { esquema, type CtxHerr, type Herramienta, type ProveedorHerramientas } from './tipos';

type A = Record<string, unknown>;
type J = Record<string, any>;

const str = (description: string) => ({ type: 'string', description });
const num = (description: string) => ({ type: 'number', description });
const bool = (description: string) => ({ type: 'boolean', description });
const en = (valores: readonly string[], description?: string) => ({ type: 'string', enum: [...valores], ...(description ? { description } : {}) });
const REF_PROP = str('Propiedad: código (ej. PF-1001), id o texto (dirección, comuna, título).');
const REF_PER = str('Persona: id, RUT, nombre, correo o teléfono.');
const REF_NEG = str('Negocio: su código (NG-014) o su id.');
const MONEDAS = ['UF', 'CLP', 'USD'];

const CAMPOS_PROP = {
  titulo: str('Título de la ficha'),
  tipo: en(TIPOS, 'Tipo de propiedad'),
  venta: bool('¿Está en venta?'),
  arriendo: bool('¿Está en arriendo?'),
  precio_venta: num('Precio de venta'),
  moneda_venta: en(MONEDAS, 'Moneda del precio de venta (por defecto UF)'),
  precio_arriendo: num('Arriendo mensual'),
  moneda_arriendo: en(MONEDAS, 'Moneda del arriendo (por defecto CLP)'),
  direccion: str('Calle y número'),
  unidad: str('N° de depto, oficina o local'),
  comuna: str('Comuna'),
  region: str('Región'),
  rol: str('Rol SII'),
  sup_total: num('Superficie total m²'),
  sup_util: num('Superficie útil m²'),
  dormitorios: num('Dormitorios'),
  banos: num('Baños'),
  estacionamientos: num('Estacionamientos'),
  bodegas: num('Bodegas'),
  gastos_comunes: num('Gastos comunes en pesos'),
  amoblado: bool('Amoblada'),
  descripcion: str('Descripción pública'),
  notas_internas: str('Notas internas'),
};
const MAPA: Record<string, string> = {
  titulo: 'titulo', tipo: 'tipo', venta: 'venta', arriendo: 'arriendo', direccion: 'direccion', unidad: 'unidad', comuna: 'comuna', region: 'region', rol: 'rol',
  sup_total: 'supTotal', sup_util: 'supUtil', dormitorios: 'dormitorios', banos: 'banos', estacionamientos: 'estacionamientos', bodegas: 'bodegas',
  gastos_comunes: 'gastosComunes', amoblado: 'amoblado', descripcion: 'descripcion', notas_internas: 'notasInternas',
};
/** los parámetros de la IA → la entrada de propiedad (solo lo que vino) */
function entradaDeArgs(a: A, previa?: { precioVenta?: { moneda?: string } | null; precioArriendo?: { moneda?: string } | null }): PropiedadEntrada {
  const o: J = {};
  for (const [k, v] of Object.entries(MAPA)) if (a[k] !== undefined && a[k] !== null) o[v] = a[k];
  if (a.precio_venta != null) o.precioVenta = { valor: Number(a.precio_venta), moneda: a.moneda_venta || previa?.precioVenta?.moneda || 'UF' };
  if (a.precio_arriendo != null) o.precioArriendo = { valor: Number(a.precio_arriendo), moneda: a.moneda_arriendo || previa?.precioArriendo?.moneda || 'CLP' };
  return o as PropiedadEntrada;
}

const aToken = (c: CtxHerr): UsuarioToken => ({ sub: c.usuarioId, corredoraId: c.corredoraId, rol: c.admin ? 'ADMIN' : 'CORREDOR', sid: 'whatsapp' });
const txt = (a: A, k: string) => String(a[k] ?? '').trim();
const ES_MIN30 = 30 * 60_000;

/** el resumen corto de una propiedad (como lo muestra la app) */
function resumenProp(p: J) {
  const portal = Object.entries((p.portales?.pi ?? {}) as J)
    .filter(([, x]) => x?.itemId)
    .map(([op, x]) => `${op}: ${ESTADO_AVISO[x.status] ?? x.status}`);
  return {
    codigo: p.codigo,
    titulo: p.titulo,
    tipo: p.tipo,
    direccion: [p.direccion, p.unidad ? 'depto. ' + p.unidad : ''].filter(Boolean).join(' '),
    comuna: p.comuna,
    venta: p.venta ? { precio: p.precioVenta ? pesos(p.precioVenta.valor, p.precioVenta.moneda) : null, estado: p.estadoVenta } : null,
    arriendo: p.arriendo ? { precio: p.precioArriendo ? pesos(p.precioArriendo.valor, p.precioArriendo.moneda) : null, estado: p.estadoArriendo } : null,
    dormitorios: p.dormitorios,
    banos: p.banos,
    m2Utiles: p.supUtil,
    avisoEnPortal: portal.length ? portal : null,
  };
}
const ESTADO_AVISO: Record<string, string> = { active: 'activo', paused: 'pausado', closed: 'finalizado', under_review: 'en revisión' };

/** el resumen del dictado o de la ficha que se le muestra al corredor para confirmar */
function resumenCampos(c: J) {
  const o: J = {
    titulo: c.titulo || null,
    tipo: c.tipo || null,
    operacion: [c.venta ? 'venta' : '', c.arriendo ? 'arriendo' : ''].filter(Boolean).join(' y ') || null,
    precioVenta: c.precioVenta?.valor ? pesos(c.precioVenta.valor, c.precioVenta.moneda) : null,
    precioArriendo: c.precioArriendo?.valor ? pesos(c.precioArriendo.valor, c.precioArriendo.moneda) : null,
    direccion: [c.direccion, c.unidad ? 'depto. ' + c.unidad : ''].filter(Boolean).join(' ') || null,
    comuna: c.comuna || null,
    dormitorios: c.dormitorios ?? null,
    banos: c.banos ?? null,
    estacionamientos: c.estacionamientos ?? null,
    bodegas: c.bodegas ?? null,
    m2Utiles: c.supUtil ?? null,
    m2Totales: c.supTotal ?? null,
    gastosComunes: c.gastosComunes ?? null,
    amoblado: c.amoblado ?? null,
    caracteristicas: c.caracteristicas?.length ? c.caracteristicas : null,
    descripcion: c.descripcion ? String(c.descripcion).slice(0, 200) : null,
    propietario: c.propietario ? [c.propietario.nombre, c.propietario.rut, c.propietario.telefono, c.propietario.email].filter(Boolean).join(' · ') : null,
  };
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));
}

@Injectable()
export class HerramientasPropiedades implements ProveedorHerramientas {
  /** lo último que dictó cada usuario (para pasar a crear la propiedad); vence a los 30 minutos */
  private readonly borradores = new Map<string, { campos: CamposDictado; hasta: number }>();
  /** lo que se le mostró a cada usuario para confirmar (clave → huella): sin esto, `confirmado` se rechaza */
  private readonly vistas = new Map<string, { huella: string; hasta: number }>();

  constructor(
    private readonly db: PrismaService,
    private readonly ayudas: AyudasHerramientas,
    private readonly propiedades: PropiedadesService,
    private readonly acciones: PropiedadesAccionesService,
    private readonly personasSrv: PersonasService,
    private readonly personas: PersonasAccionesService,
    private readonly agenda: AgendaAccionesService,
    private readonly leads: LeadsAccionesService,
    private readonly perfil: CorredorPerfilService,
    private readonly portal: PortalInmobiliarioService,
  ) {}

  // ------------------------------------------------------------------ ayudas comunes
  /** cualquier error del dominio → { error } con el texto para el corredor (sin lanzar) */
  private async seguro(fn: () => Promise<unknown>): Promise<unknown> {
    try {
      return await fn();
    } catch (e) {
      const code = (e as { getResponse?: () => { code?: string } }).getResponse?.()?.code;
      return { error: mensajeDe(e), ...(code === 'CRUCE' ? { conflicto: true } : {}) };
    }
  }
  private async propiedad(c: CtxHerr, ref: unknown) {
    return this.acciones.resolver(aToken(c), ref);
  }
  /** una persona que este usuario puede ver (los dueños de propiedades ajenas están reservados) */
  private async persona(c: CtxHerr, ref: unknown) {
    const r = await this.ayudas.persona(c, ref);
    if (r.ok && !c.admin && (await this.personasSrv.reservadas(aToken(c))).has(r.v.id))
      return { ok: false as const, error: 'No tienes acceso a los datos de esa persona (es propietaria de una propiedad que no captaste).' };
    return r;
  }
  /** dos pasos: marca lo que se le mostró al corredor, o exige que se le haya mostrado igual */
  private previa(c: CtxHerr, clave: string, huella: string, confirmado: unknown): { ok: true; nuevo: boolean } | { ok: false; error: string } {
    const k = `${c.usuarioId}:${clave}`;
    const v = this.vistas.get(k);
    if (confirmado !== true) {
      this.vistas.set(k, { huella, hasta: Date.now() + ES_MIN30 });
      return { ok: true, nuevo: true };
    }
    if (!v || v.hasta < Date.now())
      return { ok: false, error: 'Primero hay que mostrarle el resumen al corredor: llama esta herramienta SIN confirmado, muéstraselo y espera su sí.' };
    if (v.huella !== huella)
      return { ok: false, error: 'Los datos cambiaron desde el resumen que se le mostró: llámala de nuevo SIN confirmado, muéstrale el nuevo resumen y espera su sí.' };
    this.vistas.delete(k);
    return { ok: true, nuevo: false };
  }
  private borrador(c: CtxHerr) {
    const b = this.borradores.get(c.usuarioId);
    return b && b.hasta > Date.now() ? b : null;
  }

  readonly herramientas: Herramienta[] = [
    // ======================= propiedades =======================
    {
      name: 'dictar_propiedad',
      description:
        'Pasa lo que el corredor describió o dictó (texto o nota de voz) de una propiedad NUEVA a los campos de la ficha (tipo, operación, precio, dirección, dormitorios, baños, metros, equipamiento, propietario…) y dice qué falta y qué le pareció dudoso. NO crea la propiedad: muéstrale el resumen y, si dice que sí, usa crear_propiedad con desde_dictado: true. Pasa en «texto» lo que dijo TAL CUAL. Si está corrigiendo lo recién dictado («no, son 92 metros»), pasa correccion: true.',
      input_schema: esquema({ texto: str('La descripción de la propiedad, tal cual la dijo o escribió el corredor'), correccion: bool('true si corrige o agrega a lo recién dictado') }),
      ejecutar: (c, a) =>
        this.seguro(async () => {
          const previo = a.correccion === true ? this.borrador(c)?.campos : null;
          const r = await this.acciones.dictar(aToken(c), txt(a, 'texto') || c.texto, previo);
          this.borradores.set(c.usuarioId, { campos: r.campos, hasta: Date.now() + ES_MIN30 });
          const faltan = r.faltan.map((x) => x.t);
          return {
            resumen: resumenCampos(r.campos),
            faltan,
            dudas: r.dudas,
            avisos: r.avisos,
            indicacion: `Muéstrale el resumen al corredor${faltan.length ? ` y dile en una línea qué falta (${faltan.join(', ').toLowerCase()})` : ''}${r.dudas.length ? ' y las dudas' : ''}. Si confirma, llama crear_propiedad con desde_dictado: true y el confirmado cuando diga que sí. No la crees sin su sí.`,
          };
        }),
    },
    {
      name: 'crear_propiedad',
      description:
        'Crea una propiedad nueva. Dos pasos: 1) SIN confirmado devuelve el resumen para mostrárselo al corredor (con lo que falta); 2) con confirmado: true, SOLO después de que dijo que sí, la guarda (y deja al propietario en el CRM, vinculado). Mínimo: título, tipo y si va en venta y/o arriendo. Para lo dictado: desde_dictado: true (usa lo último de dictar_propiedad; los otros parámetros lo corrigen). El propietario puede ir como objeto (nombre, RUT, correo, celular) o como persona ya existente.',
      input_schema: esquema({
        ...CAMPOS_PROP,
        desde_dictado: bool('true: tomar los campos de lo último que dictó (dictar_propiedad)'),
        propietario: { type: 'object', description: 'Datos del propietario si los dio', properties: { nombre: { type: 'string' }, rut: { type: 'string' }, email: { type: 'string' }, telefono: { type: 'string' } } },
        propietario_persona: str('Propietario que ya está en el CRM (id, RUT o nombre)'),
        confirmado: bool('true solo después de que el corredor confirmó el resumen'),
      }),
      ejecutar: (c, a) =>
        this.seguro(async () => {
          const u = aToken(c);
          const sinCampos = !Object.keys(MAPA).some((k) => a[k] !== undefined) && a.precio_venta == null && a.precio_arriendo == null && !a.propietario && !a.propietario_persona;
          let campos: CamposDictado | null = null;
          let entrada: PropiedadEntrada;
          let propietario: { nombre: string; rut: string; email: string; telefono: string } | { personaId: string } | null = null;
          if (a.desde_dictado === true || (sinCampos && this.borrador(c))) {
            const b = this.borrador(c);
            if (!b) return { error: 'No hay nada dictado reciente: dicta la propiedad primero (dictar_propiedad) o pasa sus datos.' };
            const m: J = { ...b.campos };
            for (const [k, v] of Object.entries(MAPA)) if (a[k] !== undefined && a[k] !== null) m[v] = a[k];
            if (a.precio_venta != null) m.precioVenta = { valor: a.precio_venta, moneda: a.moneda_venta || 'UF' };
            if (a.precio_arriendo != null) m.precioArriendo = { valor: a.precio_arriendo, moneda: a.moneda_arriendo || 'CLP' };
            if (a.propietario && typeof a.propietario === 'object') m.propietario = a.propietario;
            campos = normalizarCampos(m);
            entrada = aEntrada(campos);
            propietario = campos.propietario;
          } else {
            entrada = entradaDeArgs(a);
            if (!entrada.titulo) return { error: 'Falta el título de la ficha (por ejemplo «Departamento 2D1B en Ñuñoa»).' };
            if (!entrada.tipo) return { error: `Falta el tipo de propiedad (${TIPOS.join(', ')}).` };
            if (entrada.venta == null && entrada.arriendo == null) {
              entrada.venta = !!entrada.precioVenta || !entrada.precioArriendo;
              entrada.arriendo = !!entrada.precioArriendo;
            }
            if (a.propietario && typeof a.propietario === 'object') {
              const p = a.propietario as J;
              propietario = { nombre: String(p.nombre ?? ''), rut: String(p.rut ?? ''), email: String(p.email ?? ''), telefono: String(p.telefono ?? '') };
            }
          }
          if (a.propietario_persona) {
            const r = await this.persona(c, a.propietario_persona);
            if (!r.ok) return { error: r.error };
            propietario = { personaId: r.v.id };
          }
          if (!entrada.tipo || (!entrada.venta && !entrada.arriendo)) return { error: 'Falta el tipo de propiedad o si va en venta, arriendo o ambas.' };
          const resumen = resumenCampos(campos ?? { ...entrada, propietario: propietario && !('personaId' in propietario) ? propietario : null });
          const faltan = faltanDictado({ ...entrada, ficha: entrada.ficha ?? {} } as Partial<CamposDictado>).map((x) => x.t);
          const paso = this.previa(c, 'crear_propiedad', JSON.stringify([entrada, propietario]), a.confirmado);
          if (!paso.ok) return { error: paso.error };
          if (paso.nuevo)
            return {
              necesitaConfirmacion: true,
              resumen,
              faltan,
              indicacion: 'Muéstrale este resumen al corredor y pregúntale si la creo. Cuando diga que sí, llámala de nuevo con confirmado: true (y los mismos datos).',
            };
          const r = campos ? await this.acciones.crearDesdeDictado(u, campos as unknown as J) : await this.acciones.crear(u, entrada, propietario);
          this.borradores.delete(c.usuarioId);
          const ficha = await this.acciones.fichaPendiente(u, r.propiedad.id);
          return {
            ok: true,
            mensaje: `Creé ${r.propiedad.codigo} · ${r.propiedad.titulo}.`,
            propiedad: resumenProp(r.propiedad),
            propietario: r.propietario,
            avisos: 'avisos' in r ? r.avisos : [],
            siguiente: ficha.pedirAhora.length ? { bloque: ficha.bloqueActual?.nombre, pedir: ficha.pedirAhora } : null,
          };
        }),
    },
    {
      name: 'actualizar_propiedad',
      description: 'Cambia datos de una propiedad (precio, superficies, descripción, dirección…). Si está publicada en Portal Inmobiliario, el aviso se actualiza solo (precio, título, fotos). Para N° de depto, piso, orientación o equipamiento usa completar_ficha.',
      input_schema: esquema({ propiedad: REF_PROP, ...CAMPOS_PROP }, ['propiedad']),
      ejecutar: (c, a) =>
        this.seguro(async () => {
          const p = await this.propiedad(c, a.propiedad);
          if (!p.ok) return { error: p.error };
          const u = aToken(c);
          const previa = await this.propiedades.obtener(u, p.v.id);
          const o = entradaDeArgs(a, previa);
          if (!Object.keys(o).length) return { error: 'No indicaste qué cambiar.' };
          const r = await this.acciones.cambiar(u, p.v.id, o);
          return { ok: true, propiedad: resumenProp(r.propiedad), portal: r.portal };
        }),
    },
    {
      name: 'ficha_pendiente',
      description: 'Qué le falta a la ficha de una propiedad, por bloques (lo esencial, datos para portales, propietario y legal, equipamiento, cómo se visita), y qué hay que pedir ahora. Úsala antes de pedirle datos de una propiedad al corredor.',
      input_schema: esquema({ propiedad: REF_PROP }, ['propiedad']),
      ejecutar: (c, a) =>
        this.seguro(async () => {
          const p = await this.propiedad(c, a.propiedad);
          if (!p.ok) return { error: p.error };
          const r = await this.acciones.fichaPendiente(aToken(c), p.v.id);
          return {
            propiedad: r.propiedad,
            bloques: r.bloques,
            pedirAhora: r.pedirAhora,
            indicacion: r.bloqueActual
              ? `Pídele SOLO lo de «${r.bloqueActual.nombre}», todo en un mensaje y en lista corta: ${r.pedirAhora.join(', ')}. Lo marcado como clave no puede quedar fuera.${r.bloqueActual.id === 'equip' ? ' Para el equipamiento pregúntale qué tiene la propiedad (lo que no diga queda en No).' : ''}`
              : 'La ficha tiene todo lo clave. Si quiere, puede agregar equipamiento (qué tiene la propiedad).',
          };
        }),
    },
    {
      name: 'completar_ficha',
      description: 'Completa la ficha de una propiedad YA creada con lo que el corredor cuenta o dicta (cualquier dato: N° de depto, piso, orientación, año, mascotas, rol, forma de visitar, lo que tiene: piscina, quincho, conserje, y los datos del propietario si captó la propiedad). Pasa en «texto» lo que dijo TAL CUAL. Devuelve lo guardado y lo que sigue faltando.',
      input_schema: esquema({ propiedad: REF_PROP, texto: str('Lo que dijo el corredor, tal cual') }, ['propiedad']),
      ejecutar: (c, a) =>
        this.seguro(async () => {
          const p = await this.propiedad(c, a.propiedad);
          if (!p.ok) return { error: p.error };
          const r = await this.acciones.completarFicha(aToken(c), p.v.id, txt(a, 'texto') || c.texto);
          if (!r.ok) return { ok: false, error: `${r.motivo} Pregúntale de nuevo.`, avisos: r.avisos };
          return { ok: true, guardado: r.guardado, dudas: r.dudas, avisos: r.avisos, portal: r.portal, sigueFaltando: r.sigueFaltando };
        }),
    },
    {
      name: 'cambiar_estado_propiedad',
      description: 'Cambia el estado comercial de una propiedad en venta o arriendo (disponible, reservada, vendida, arrendada, no_disponible). Si tiene aviso activo en Portal Inmobiliario, lo pausa solo al quedar vendida, arrendada, reservada o no disponible, y lo reactiva si vuelve a disponible.',
      input_schema: esquema({ propiedad: REF_PROP, operacion: en(['venta', 'arriendo']), estado: en(ESTADOS) }, ['propiedad', 'operacion', 'estado']),
      ejecutar: (c, a) =>
        this.seguro(async () => {
          const p = await this.propiedad(c, a.propiedad);
          if (!p.ok) return { error: p.error };
          const r = await this.acciones.cambiarEstado(aToken(c), p.v.id, a.operacion as 'venta' | 'arriendo', a.estado as (typeof ESTADOS)[number]);
          return { ok: true, propiedad: resumenProp(r.propiedad), portal: r.portal };
        }),
    },
    {
      name: 'configurar_corredor',
      description: 'Guarda el nombre, el teléfono y el correo del corredor (el usuario) que van en las órdenes de visita, mandatos, contratos y demás documentos. Úsala cuando un documento diga que falta el corredor y el usuario te dé esos datos. El correo es también con el que entra a Asset: cambiarlo pide confirmación (confirmado: true tras su sí).',
      input_schema: esquema({ corredor_nombre: str('Nombre completo del corredor'), corredor_email: str('Correo del corredor'), corredor_telefono: str('Teléfono (opcional)'), confirmado: bool('true solo después de que confirmó cambiar su correo') }),
      ejecutar: (c, a) => this.seguro(async () => this.perfil.guardar(aToken(c), { nombre: txt(a, 'corredor_nombre'), email: txt(a, 'corredor_email'), telefono: txt(a, 'corredor_telefono'), confirmado: a.confirmado === true })),
    },

    // ======================= personas =======================
    {
      name: 'ver_persona',
      description: 'Datos de una persona del CRM, las propiedades a las que está vinculada (con su rol), sus negocios y sus próximos eventos.',
      input_schema: esquema({ persona: REF_PER }, ['persona']),
      ejecutar: (c, a) =>
        this.seguro(async () => {
          const r = await this.persona(c, a.persona);
          if (!r.ok) return { error: r.error };
          const x = r.v;
          const [vinc, negs, evs] = await Promise.all([
            this.db.propiedadPersona.findMany({ where: { personaId: x.id, propiedad: { eliminadoEn: null } }, include: { propiedad: { select: { codigo: true, titulo: true, captadorId: true } } } }),
            this.db.negocio.findMany({ where: { corredoraId: c.corredoraId, clienteId: x.id, eliminadoEn: null, ...this.ayudas.mio(c) }, take: 10 }),
            this.db.evento.findMany({ where: { corredoraId: c.corredoraId, personaIds: { has: x.id }, eliminadoEn: null, estado: 'programado', fecha: { gte: new Date(hoy() + 'T00:00:00Z') }, ...this.ayudas.mio(c) }, orderBy: { fecha: 'asc' }, take: 5 }),
          ]);
          return {
            nombre: x.nombre,
            rut: x.rutFormato,
            tipo: x.tipo,
            telefono: x.telefono,
            email: x.email,
            roles: x.roles,
            notas: x.notas,
            registradoEl: fechaIso(x.creadoEn),
            propiedades: vinc.map((v) => ({ codigo: v.propiedad.codigo, titulo: v.propiedad.titulo, rol: v.rol })),
            negocios: negs.map((n) => ({ codigo: (n.datos as J)?.codigo ?? n.id, tipo: n.tipo, estado: n.estado, etapa: n.etapa })),
            proximosEventos: evs.map((e) => ({ id: e.id, fecha: fechaIso(e.fecha), hora: e.hora, tipo: e.tipo, titulo: (e.datos as J)?.titulo })),
          };
        }),
    },
    {
      name: 'crear_persona',
      description: 'Agrega una persona al CRM (propietario, comprador, arrendatario, codeudor, proveedor…). El RUT es OPCIONAL (un interesado puede no tenerlo aún); si lo da debe ser válido y no estar repetido. Opcionalmente la vincula a una propiedad con su rol. Para un interesado que llegó por un portal, Instagram o un referido, mejor usa crear_lead.',
      input_schema: esquema(
        {
          nombre: str('Nombre completo o razón social'), rut: str('RUT (opcional)'), email: str('Correo'), telefono: str('Teléfono'),
          roles: { type: 'array', items: en(ROLES) }, tipo: en(['natural', 'juridica']), direccion: str('Dirección'), estado_civil: str('Estado civil'), profesion: str('Profesión'), notas: str('Notas'),
          propiedad: REF_PROP, rol_en_propiedad: en(ROLES, 'Rol con el que se vincula a esa propiedad (por defecto interesado)'),
        },
        ['nombre'],
      ),
      ejecutar: (c, a) =>
        this.seguro(async () => {
          const u = aToken(c);
          const prop = a.propiedad ? await this.propiedad(c, a.propiedad) : null;
          if (prop && !prop.ok) return { error: prop.error };
          const rol = (a.rol_en_propiedad as string | undefined) ?? 'interesado';
          const p = (await this.personas.crear(u, {
            nombre: txt(a, 'nombre'), rut: txt(a, 'rut'), email: txt(a, 'email'), telefono: txt(a, 'telefono'),
            roles: (a.roles as string[] | undefined) ?? (a.rol_en_propiedad ? [rol] : []), tipo: (a.tipo as 'natural' | 'juridica' | undefined) ?? null,
            direccion: txt(a, 'direccion'), estadoCivil: txt(a, 'estado_civil'), profesion: txt(a, 'profesion'), notas: txt(a, 'notas'),
          })) as J;
          let vinculo: J = {};
          if (prop?.ok) {
            try {
              await this.propiedades.vincular(u, prop.v.id, { personaId: p.id, rol: rol as (typeof ROLES)[number] });
              vinculo = { vinculadaA: prop.v.codigo, como: rol };
            } catch (e) {
              vinculo = { vinculadaA: null, motivoSinVinculo: mensajeDe(e) };
            }
          }
          return { ok: true, persona: { id: p.id, nombre: p.nombre, rut: p.rut || null }, ...vinculo };
        }),
    },
    {
      name: 'vincular_persona',
      description: 'Vincula una persona del CRM a una propiedad con un rol (propietario, arrendatario, comprador, codeudor, interesado, proveedor). El propietario lo vincula quien captó la propiedad o el administrador.',
      input_schema: esquema({ propiedad: REF_PROP, persona: REF_PER, rol: en(ROLES) }, ['propiedad', 'persona', 'rol']),
      ejecutar: (c, a) =>
        this.seguro(async () => {
          const p = await this.propiedad(c, a.propiedad);
          if (!p.ok) return { error: p.error };
          const x = await this.persona(c, a.persona);
          if (!x.ok) return { error: x.error };
          await this.propiedades.vincular(aToken(c), p.v.id, { personaId: x.v.id, rol: a.rol as (typeof ROLES)[number] });
          return { ok: true, texto: `${x.v.nombre} quedó vinculado a ${p.v.codigo} como ${a.rol}.` };
        }),
    },
    {
      name: 'nota',
      description: 'Agrega una nota al historial de una propiedad, una persona o un negocio (indica solo UNO de los tres).',
      input_schema: esquema({ propiedad: REF_PROP, persona: REF_PER, negocio: REF_NEG, texto: str('La nota') }, ['texto']),
      ejecutar: (c, a) =>
        this.seguro(async () => {
          let tipo: EntidadTipo;
          let id: string;
          let donde: string;
          if (a.negocio) {
            const n = await this.ayudas.negocio(c, a.negocio, false);
            if (!n.ok) return { error: n.error };
            [tipo, id, donde] = ['negocio', n.v.id, `el negocio ${(n.v.datos as J)?.codigo ?? n.v.id}`];
          } else if (a.propiedad) {
            const p = await this.propiedad(c, a.propiedad);
            if (!p.ok) return { error: p.error };
            [tipo, id, donde] = ['propiedad', p.v.id, p.v.codigo];
          } else if (a.persona) {
            const p = await this.persona(c, a.persona);
            if (!p.ok) return { error: p.error };
            [tipo, id, donde] = ['persona', p.v.id, p.v.nombre];
          } else return { error: 'Indica dónde va la nota (propiedad, persona o negocio).' };
          await this.personas.nota(aToken(c), tipo, id, txt(a, 'texto'));
          return { ok: true, mensaje: `Nota anotada en ${donde}.` };
        }),
    },

    // ======================= leads =======================
    {
      name: 'crear_lead',
      description: 'Registra un LEAD (interesado que llegó por un portal, Instagram, un referido o el teléfono) en Leads, SIN pedir RUT y SIN escribirle al cliente. Guarda lo que busca. Si ya hay un lead con ese celular o correo, no lo duplica. Para alguien que ya es cliente del CRM (comprador, arrendatario, propietario) usa crear_persona.',
      input_schema: esquema({
        nombre: str('Nombre'), telefono: str('Celular'), email: str('Correo'), canal: en(['whatsapp', 'instagram', 'facebook', 'email', 'portal', 'web', 'referido', 'otro'], 'Por dónde llegó'),
        operacion: en(['venta', 'arriendo'], 'Qué busca'), tipo: str('Tipo de propiedad (departamento, casa…)'), comunas: { type: 'array', items: { type: 'string' }, description: 'Comunas de interés' },
        presupuesto: num('Presupuesto máximo'), moneda: en(['CLP', 'UF']), dormitorios: num('Dormitorios'), banos: num('Baños'), notas: str('Notas'),
        proxima_accion: str('Próxima acción para el corredor'), fecha_proxima_accion: str('AAAA-MM-DD'),
      }),
      ejecutar: (c, a) =>
        this.seguro(async () => {
          const r = await this.leads.crearManual(aToken(c), {
            nombre: txt(a, 'nombre'), telefono: txt(a, 'telefono'), email: txt(a, 'email'), origen: (a.canal as string) || 'otro',
            busqueda: { operacion: a.operacion, tipo: a.tipo, comunas: a.comunas, presupuesto: a.presupuesto, moneda: a.moneda, dormitorios: a.dormitorios, banos: a.banos },
            notas: txt(a, 'notas'), proximaAccion: a.proxima_accion ? { texto: txt(a, 'proxima_accion'), fecha: txt(a, 'fecha_proxima_accion') || null } : null,
          });
          if (r.deOtro) return { ok: true, yaExistia: true, indicacion: 'Ya hay un lead con ese celular o correo y es de otro corredor: no se duplicó.' };
          return {
            ok: true,
            yaExistia: r.yaExistia,
            lead: r.lead,
            indicacion: r.yaExistia ? 'Ya existía un lead con ese celular o correo: no se duplicó.' : 'Quedó en Leads y también en Personas. No se le escribió al cliente.',
          };
        }),
    },
    {
      name: 'actualizar_lead',
      description: `Cambia el estado de un lead (${ESTADOS_LEAD.join(', ')}), su próxima acción (con fecha), sus notas o sus datos de contacto. Al marcarlo como perdido pide el motivo. Identifícalo por su nombre o celular.`,
      input_schema: esquema(
        {
          lead: str('Lead: nombre o celular'), estado: en(ESTADOS_LEAD), motivo: str('Motivo si pasa a perdido'), proxima_accion: str('Qué hay que hacer'), fecha_proxima_accion: str('AAAA-MM-DD'),
          notas: str('Notas'), nombre: str('Nombre'), telefono: str('Celular'), email: str('Correo'),
        },
        ['lead'],
      ),
      ejecutar: (c, a) =>
        this.seguro(async () => {
          const u = aToken(c);
          const l = await this.leads.resolver(u, a.lead);
          if (!l.ok) return { error: l.error };
          const cambios: J = {};
          for (const k of ['estado', 'motivo', 'notas', 'nombre', 'telefono', 'email']) if (a[k] !== undefined) cambios[k] = a[k];
          if (a.proxima_accion !== undefined) cambios.proximaAccion = txt(a, 'proxima_accion') ? { texto: txt(a, 'proxima_accion'), fecha: txt(a, 'fecha_proxima_accion') || null } : null;
          if (!Object.keys(cambios).length) return { error: 'No indicaste qué cambiar del lead.' };
          return { ok: true, lead: await this.leads.actualizar(u, l.v.id, cambios) };
        }),
    },
    {
      name: 'registrar_lead_desde_chat',
      description:
        'Registra un lead desde un chat EXPORTADO de WhatsApp (el .txt o .zip que el corredor manda con «Exportar chat»). Dos pasos: 1) con el archivo adjunto y SIN confirmado: lo lee, lo analiza con IA (qué busca, estado, próxima acción) y devuelve el resumen; muéstraselo y pide su sí. Si devuelve preguntar «cliente», pregúntale cuál de los participantes es el cliente y vuelve a llamarla con cliente. 2) con confirmado: true (sin el archivo, tras su sí): guarda el lead con su conversación; si ya existía, solo agrega lo nuevo.',
      input_schema: esquema({ cliente: str('Nombre del participante que es el cliente (si hubo que preguntarlo)'), telefono: str('Celular del cliente si lo dio'), confirmado: bool('true solo después de que el corredor confirmó el resumen') }),
      ejecutar: (c, a) =>
        this.seguro(async () => {
          const u = aToken(c);
          const archivo = c.adjuntos.find((x) => pareceChat(x.nombre, x.mime));
          if (a.confirmado === true) {
            const p = this.leads.pendienteDe(u.sub);
            if (!p) return { error: 'No tengo un chat analizado para guardar: mándame el archivo del chat exportado otra vez.' };
            return { ok: true, ...(await this.leads.importarChat(u, p[0], { cliente: txt(a, 'cliente') || undefined, telefono: txt(a, 'telefono') || undefined })) };
          }
          if (!archivo) return { error: 'No veo el archivo del chat. En WhatsApp: abre el chat › ⋮ › Exportar chat (con o sin multimedia) y mándamelo aquí.' };
          const r = await this.leads.analizarChat(u, { bytes: archivo.bytes, nombre: archivo.nombre, cliente: txt(a, 'cliente') || undefined, telefono: txt(a, 'telefono') || undefined, miNombre: c.nombre });
          if (r.token === null)
            return { preguntar: 'cliente', participantes: r.participantes.map((p) => `${p.nombre} (${p.n} mensajes)`), indicacion: 'No sé cuál de los participantes es el cliente: pregúntaselo al corredor y vuelve a llamar con cliente.' };
          return {
            necesitaConfirmacion: true,
            cliente: r.cliente,
            telefono: r.telefono || null,
            mensajes: r.total,
            desde: r.desde,
            hasta: r.hasta,
            medios: r.medios,
            existente: r.existente,
            analisis: r.analisis,
            aviso: r.aviso,
            indicacion: r.existente
              ? `Ya hay un lead de ${r.existente.nombre}: se agregarían ${r.existente.nuevos} mensajes nuevos. Muéstrale el resumen y pregúntale si lo guardo; si dice que sí, llámala con confirmado: true.`
              : 'Muéstrale el resumen y pregúntale si guardo el lead con su conversación; si dice que sí, llámala con confirmado: true (sin volver a adjuntar el archivo).',
          };
        }),
    },

    // ======================= agenda =======================
    {
      name: 'buscar_eventos',
      description: 'Eventos de la agenda (visitas, reuniones, firmas, llamadas, tareas) CON SU ID, para reprogramarlos o cerrarlos. Por defecto desde hoy a 14 días, sin los cancelados.',
      input_schema: esquema({
        desde: str('AAAA-MM-DD (por defecto hoy)'), hasta: str('AAAA-MM-DD (por defecto en 14 días)'), tipo: en(['visita', 'reunion', 'firma', 'llamada', 'tarea', 'otro']),
        propiedad: REF_PROP, persona: REF_PER, texto: str('Texto: título, lugar, persona'), incluir_cancelados: bool('Incluir cancelados'),
      }),
      ejecutar: (c, a) =>
        this.seguro(async () => {
          const u = aToken(c);
          const p = a.propiedad ? await this.propiedad(c, a.propiedad) : null;
          if (p && !p.ok) return { error: p.error };
          const x = a.persona ? await this.persona(c, a.persona) : null;
          if (x && !x.ok) return { error: x.error };
          return this.agenda.listar(u, {
            desde: txt(a, 'desde') || hoy(), hasta: txt(a, 'hasta') || sumarDias(hoy(), 14), tipo: txt(a, 'tipo') || undefined, propiedadId: p?.ok ? p.v.id : undefined,
            personaId: x?.ok ? x.v.id : undefined, texto: txt(a, 'texto') || undefined, incluirCancelados: a.incluir_cancelados === true, limite: 25,
          });
        }),
    },
    {
      name: 'crear_evento',
      description:
        'Agenda una visita, reunión, firma, llamada o tarea, con fecha y hora, ligada a propiedad, personas y negocio. SOLO agenda: no genera documentos ni cobra. Una visita necesita la propiedad. Las visitas de una propiedad (o de un corredor) no se pueden sobreponer: si hay cruce, devuelve el conflicto y hay que proponer otro horario. Confirma el día y la hora con el corredor antes. Si dijo el día de la semana («el jueves 13»), pásalo en dia_semana: se verifica que coincida con la fecha.',
      input_schema: esquema(
        {
          tipo: en(['visita', 'reunion', 'firma', 'llamada', 'tarea', 'otro']), dia_semana: str('El día de la semana que dijo el usuario (lunes…domingo), si lo dijo'), fecha: str('AAAA-MM-DD'),
          hora: str('HH:MM (24 h)'), duracion: num('Minutos (visita 45, otros 30)'), titulo: str('Título (opcional)'), propiedad: REF_PROP,
          personas: { type: 'array', items: { type: 'string' }, description: 'Personas: ids, RUT o nombres' }, negocio: REF_NEG, lugar: str('Lugar (por defecto, la dirección de la propiedad)'), notas: str('Notas'),
        },
        ['tipo', 'fecha'],
      ),
      ejecutar: (c, a) =>
        this.seguro(async () => {
          const u = aToken(c);
          const p = a.propiedad ? await this.propiedad(c, a.propiedad) : null;
          if (p && !p.ok) return { error: p.error };
          const ids: string[] = [];
          for (const ref of (a.personas as string[] | undefined) ?? []) {
            const x = await this.persona(c, ref);
            if (!x.ok) return { error: x.error };
            ids.push(x.v.id);
          }
          let negocioId: string | null = null;
          let propId = p?.ok ? p.v.id : null;
          if (a.negocio) {
            const n = await this.ayudas.negocio(c, a.negocio);
            if (!n.ok) return { error: n.error };
            negocioId = n.v.id;
            if (!propId && n.v.propiedadId) propId = n.v.propiedadId;
            if (!ids.length && n.v.clienteId && !a.personas) ids.push(n.v.clienteId);
          }
          const e = (await this.agenda.crear(u, {
            tipo: txt(a, 'tipo'), fecha: txt(a, 'fecha'), hora: txt(a, 'hora') || null, duracion: a.duracion != null ? Number(a.duracion) : null, titulo: txt(a, 'titulo') || null,
            propiedadId: propId, personaIds: ids, negocioId, lugar: txt(a, 'lugar') || null, notas: txt(a, 'notas') || null, diaSemana: txt(a, 'dia_semana') || null,
          })) as J;
          return { ok: true, evento: { id: e.id, tipo: e.tipo, titulo: e.titulo, fecha: e.fecha, hora: e.hora, lugar: e.lugar, duracion: e.duracion, propiedad: p?.ok ? p.v.codigo : null } };
        }),
    },
    {
      name: 'actualizar_evento',
      description: 'Reprograma (nueva fecha u hora), marca como hecho o cancela un evento de la agenda. Identifícalo por su id (de buscar_eventos) o por un texto que lo distinga. Si es una visita, el nuevo horario tampoco puede cruzarse con otra.',
      input_schema: esquema(
        { evento: str('Id del evento (de buscar_eventos) o texto para encontrarlo'), fecha: str('Nueva fecha AAAA-MM-DD'), hora: str('Nueva hora HH:MM'), estado: en(['programado', 'hecho', 'cancelado']), notas: str('Notas') },
        ['evento'],
      ),
      ejecutar: (c, a) =>
        this.seguro(async () => {
          const u = aToken(c);
          let id = txt(a, 'evento');
          if (!/^v[a-z0-9]{5,}$|^[\w-]{20,64}$/i.test(id) || !(await this.db.evento.findFirst({ where: { id, corredoraId: c.corredoraId, eliminadoEn: null, ...this.ayudas.mio(c) }, select: { id: true } }))) {
            const r = await this.agenda.listar(u, { desde: hoy(), hasta: sumarDias(hoy(), 365), texto: id, limite: 6 });
            if (!r.eventos.length) return { error: `No encontré un evento que coincida con «${id}». Búscalo con buscar_eventos.` };
            if (r.eventos.length > 1)
              return { error: `Hay ${r.total} eventos que coinciden: ${r.eventos.map((e) => `${e.id} (${e.tipo} ${e.fecha} ${e.hora ?? ''} ${e.propiedad ?? e.titulo})`).join(' | ')}. Pregúntale al corredor cuál.` };
            id = r.eventos[0].id;
          }
          const cambios: J = {};
          if (a.fecha !== undefined) cambios.fecha = txt(a, 'fecha');
          if (a.hora !== undefined) cambios.hora = txt(a, 'hora') || null;
          if (a.estado !== undefined) cambios.estado = a.estado;
          if (a.notas !== undefined) cambios.notas = txt(a, 'notas');
          if (!Object.keys(cambios).length) return { error: 'No indicaste qué cambiar del evento.' };
          const e = (await this.agenda.actualizar(u, id, cambios)) as J;
          return { ok: true, evento: { id: e.id, tipo: e.tipo, titulo: e.titulo, fecha: e.fecha, hora: e.hora, estado: e.estado } };
        }),
    },

    // ======================= portales (Portal Inmobiliario) =======================
    {
      name: 'publicar_portal',
      description:
        'Publica la propiedad en Portal Inmobiliario (Mercado Libre). Dos pasos: 1) SIN confirmado revisa la ficha: si falta algo, dice qué (hay que pedírselo al corredor o completarlo con completar_ficha); si está lista, devuelve el resumen del aviso (título, categoría, fotos, paquete) para mostrárselo; 2) con confirmado: true, SOLO después de su sí, publica (usa una publicación del paquete de la corredora).',
      input_schema: esquema({ propiedad: REF_PROP, operacion: en(['venta', 'arriendo']), titulo_portal: str('Título para el aviso, máx. 60 caracteres'), confirmado: bool('true solo después de que el corredor confirmó') }, ['propiedad', 'operacion']),
      ejecutar: (c, a) =>
        this.seguro(async () => {
          const u = aToken(c);
          const p = await this.propiedad(c, a.propiedad);
          if (!p.ok) return { error: p.error };
          const op = a.operacion as 'venta' | 'arriendo';
          const opts = a.titulo_portal ? { tituloPortal: txt(a, 'titulo_portal') } : {};
          const r = await this.portal.revisar(u, p.v.id, op, opts);
          if (r.errores.length) return { error: 'No se puede publicar todavía: ' + r.errores.join(' '), faltan: r.errores, avisos: r.avisos };
          const paso = this.previa(c, `publicar:${p.v.id}:${op}`, JSON.stringify([a.titulo_portal ?? null]), a.confirmado);
          if (!paso.ok) return { error: paso.error };
          if (paso.nuevo)
            return {
              necesitaConfirmacion: true,
              resumen: { propiedad: `${p.v.codigo} · ${op}`, titulo: r.titulo, categoria: r.categoria?.ruta.join(' › '), fotos: r.fotos, avisos: r.avisos, paquete: `Usa una publicación del paquete «${r.tipoAviso}» (quedan ${r.paquete ?? '—'}).` },
              indicacion: 'Muéstrale el resumen al corredor y pregúntale si publico. Cuando diga que sí, llámala de nuevo con confirmado: true.',
            };
          const x = await this.portal.publicar(u, p.v.id, op, opts);
          return { ok: true, mensaje: `Publicado en Portal Inmobiliario (${op}).`, aviso: this.avisoTxt(x.aviso) };
        }),
    },
    {
      name: 'aviso_portal',
      description: 'Pausa, reactiva, actualiza o finaliza el aviso de Portal Inmobiliario de una propiedad. Dos pasos: 1) SIN confirmado dice qué haría (finalizar no se puede deshacer); 2) con confirmado: true, SOLO después del sí del corredor.',
      input_schema: esquema({ propiedad: REF_PROP, operacion: en(['venta', 'arriendo']), accion: en(['pausar', 'reactivar', 'actualizar', 'finalizar']), confirmado: bool('true solo después de que el corredor confirmó') }, ['propiedad', 'operacion', 'accion']),
      ejecutar: (c, a) =>
        this.seguro(async () => {
          const u = aToken(c);
          const p = await this.propiedad(c, a.propiedad);
          if (!p.ok) return { error: p.error };
          const op = a.operacion as 'venta' | 'arriendo';
          const accion = a.accion as 'pausar' | 'reactivar' | 'actualizar' | 'finalizar';
          const prop = await this.propiedades.obtener(u, p.v.id);
          const aviso = (prop.portales as J)?.pi?.[op];
          if (!aviso?.itemId) return { error: `${p.v.codigo} no tiene aviso de ${op} en Portal Inmobiliario.` };
          const paso = this.previa(c, `aviso:${p.v.id}:${op}:${accion}`, accion, a.confirmado);
          if (!paso.ok) return { error: paso.error };
          if (paso.nuevo)
            return {
              necesitaConfirmacion: true,
              resumen: `${accion[0].toUpperCase() + accion.slice(1)} el aviso de Portal Inmobiliario de ${p.v.codigo} (${op}, ${aviso.itemId}, hoy ${ESTADO_AVISO[aviso.status] ?? aviso.status}).`,
              aviso: accion === 'finalizar' ? 'Un aviso finalizado no se puede reactivar.' : '',
              indicacion: 'Pídele el sí al corredor y llámala de nuevo con confirmado: true.',
            };
          const r = await this.portal.accion(u, p.v.id, op, accion);
          return { ok: true, mensaje: `Aviso ${r.accion}.`, aviso: this.avisoTxt(r.aviso) };
        }),
    },
    {
      name: 'sincronizar_portal',
      description: 'Trae de Portal Inmobiliario el estado de los avisos y los interesados nuevos (quedan en la propiedad y en el CRM como interesados).',
      input_schema: esquema(),
      ejecutar: (c) => this.seguro(async () => ({ ok: true, ...(await this.portal.sincronizar(aToken(c))) })),
    },
    {
      name: 'rendimiento_avisos',
      description: 'Cómo van los avisos en Portal Inmobiliario: visitas, contactos, interesados, calidad y recomendaciones de precio o de aviso por propiedad (últimos 30 días). Sin propiedad, todos los avisos.',
      input_schema: esquema({ propiedad: REF_PROP }),
      ejecutar: (c, a) =>
        this.seguro(async () => {
          const p = a.propiedad ? await this.propiedad(c, a.propiedad) : null;
          if (p && !p.ok) return { error: p.error };
          const r = await this.portal.rendimiento(aToken(c), p?.ok ? p.v.id : undefined);
          return { ...r, avisos: r.avisos.slice(0, 12) };
        }),
    },
    {
      name: 'bandeja_interesados',
      description: 'Bandeja de interesados que llegaron desde los portales (nuevos, contactados, en visita, descartados), de toda la cartera o de una propiedad.',
      input_schema: esquema({ estado: en(['nuevo', 'contactado', 'visita', 'descartado']), propiedad: REF_PROP }),
      ejecutar: (c, a) =>
        this.seguro(async () => {
          const p = a.propiedad ? await this.propiedad(c, a.propiedad) : null;
          if (p && !p.ok) return { error: p.error };
          return this.portal.bandeja(aToken(c), txt(a, 'estado') || undefined, p?.ok ? p.v.id : undefined);
        }),
    },
  ];

  private avisoTxt(a: J | null | undefined) {
    return a ? { estado: ESTADO_AVISO[a.status] ?? a.status, enlace: a.permalink ?? null, id: a.itemId ?? null } : null;
  }
}
