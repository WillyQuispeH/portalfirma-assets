// La ORDEN DE VISITA desde el servidor: Juanita (o quien sea del equipo) la prepara y la envía a firmar por WhatsApp
// aunque el Asset del corredor esté cerrado. Antes solo se podía con la app abierta (la lógica vivía en el computador),
// pero el servidor ya tiene la sesión de Portalfirma de la corredora y los datos en la base.
//
// Dos pasos, y la confirmación la exige el SERVIDOR (no solo la IA), porque envía un documento a una persona y cobra
// del saldo de Portalfirma:
//  1. sin `confirmado`: arma la orden con la plantilla «Orden de visita» de la Notaría virtual, devuelve los datos que
//     llevaría el documento y qué falta; NO envía, NO cobra, NO agenda. Deja anotado qué se preparó.
//  2. con `confirmado: true`: solo si se preparó EXACTAMENTE lo mismo hace menos de 15 minutos y el último mensaje del
//     corredor es un sí claro. Envía a firmar, registra la firma, vincula al visitante y deja la visita en la agenda.
// Solo cubre la plantilla de la Notaría virtual. Con formatos propios de la corredora (PDF armado en el computador)
// hay que usar la app.
import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import type { Prisma, Propiedad, PropiedadFoto } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PortalfirmaService } from '../conexiones/portalfirma';
import { PersonasService } from '../personas/personas.service';
import { ActividadService } from '../comun/actividad.service';
import { dvRut } from '../ia/transcripcion';
import { normalizar } from '../comun/texto';
import { hoy, norm } from './comun';

export interface CtxOrden {
  corredoraId: string;
  usuarioId: string;
  /** lo que escribió (o dijo) el corredor en este turno */
  texto: string;
}
export interface ArgsOrden {
  codigo_propiedad?: string;
  visitante?: string;
  rut?: string;
  email?: string;
  telefono?: string;
  fecha?: string;
  hora?: string;
  operacion?: string;
  confirmado?: boolean;
}

const VIGENCIA_MS = 15 * 60_000;
// un «sí» puro: solo palabras de asentimiento («sí», «dale, envíala», «ok gracias»). «Sí, pero a las 12» NO lo es: pide
// un cambio, y el cambio exige preparar la orden de nuevo
const ASIENTE = ['si', 'dale', 'ok', 'okay', 'confirmo', 'confirmado', 'confirma', 'envia', 'enviala', 'envialo', 'manda', 'mandala', 'mandalo', 'hazlo', 'adelante', 'correcto', 'perfecto', 'claro', 'exacto', 'listo'];
const RELLENO = new Set(['de', 'acuerdo', 'por', 'favor', 'porfa', 'gracias', 'y', 'la', 'lo', 'ya', 'ahora', 'todo', 'nomas']);
const asiente = (texto: string) => {
  const w = norm(texto)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return w.length > 0 && w.length <= 6 && w.every((x) => ASIENTE.includes(x) || RELLENO.has(x)) && w.some((x) => ASIENTE.includes(x));
};

const limpioRut = (r: unknown) =>
  String(r ?? '')
    .replace(/[^0-9kK]/g, '')
    .toUpperCase();
const rutValido = (r: string) => {
  const c = limpioRut(r);
  return c.length >= 8 && c.length <= 9 && dvRut(c.slice(0, -1)) === c.slice(-1);
};
const rutFormato = (r: string) => {
  const c = limpioRut(r);
  return `${c.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${c.slice(-1)}`;
};
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

type Moneda = string | null;
const precio = (valor: Prisma.Decimal | number | null, moneda: Moneda) => {
  if (valor == null) return null;
  const n = Number(valor);
  if (!n) return null;
  return moneda === 'UF' ? `UF ${n.toLocaleString('es-CL')}` : `$${n.toLocaleString('es-CL')}`;
};

/** el número de operación que devuelve Portalfirma al enviar a firmar (en JSON o dentro del texto) */
export function operacionDe(r: unknown): number | null {
  if (r == null) return null;
  if (typeof r === 'number') return r;
  if (typeof r === 'string') {
    try {
      return operacionDe(JSON.parse(r));
    } catch {
      const m = /operaci[oó]n\D{0,12}(\d{3,})/i.exec(r) || /operation\D{0,12}(\d{3,})/i.exec(r);
      return m ? Number(m[1]) : null;
    }
  }
  if (typeof r === 'object') {
    const o = r as Record<string, unknown>;
    const v = o.operation ?? o.operacion ?? o.operationNumber ?? o.numberOperation ?? o.operation_number;
    if (v != null && Number(v)) return Number(v);
    for (const k of Object.keys(o)) {
      const x = o[k];
      if (typeof x === 'object' && x) {
        const d = operacionDe(x);
        if (d) return d;
      }
    }
    if (typeof o.message === 'string') return operacionDe(o.message);
    if (typeof o.text === 'string') return operacionDe(o.text);
  }
  return null;
}

type Variable = { id: string; name?: string; label?: string; required?: boolean; kind?: string; input_type?: string };
type Grupo = { type?: string; variables?: Variable[] };

@Injectable()
export class OrdenVisitaService {
  private readonly log = new Logger('OrdenVisita');
  /** lo último que se preparó por corredor (solo en memoria: vale 15 minutos) */
  private readonly preparadas = new Map<string, { clave: string; en: number; args: ArgsOrden }>();

  constructor(
    private readonly db: PrismaService,
    private readonly pf: PortalfirmaService,
    private readonly personas: PersonasService,
    private readonly actividad: ActividadService,
  ) {}

  // ---------------------------------------------------------------- Portalfirma
  private async herramienta(corredoraId: string, args: Record<string, unknown>) {
    const r = await this.pf.llamarComo({ corredoraId, usuarioId: null }, 'template_manage_tools', args);
    const texto = (r.content || [])
      .map((c) => (c.type === 'text' ? (c.text ?? '') : ''))
      .join('\n')
      .trim();
    return { texto, error: !!r.isError || /^\s*Error\b/.test(texto) };
  }

  // ---------------------------------------------------------------- el visitante
  private async visitante(c: CtxOrden, a: ArgsOrden) {
    const q = String(a.visitante ?? '').trim();
    if (!q) return { error: 'Indica quién es el visitante (nombre completo y RUT, o una persona del CRM).' };
    const digitos = limpioRut(q);
    const porRut = (a.rut ? limpioRut(a.rut) : '') || (digitos.length >= 8 && /\d/.test(digitos) && !/[a-z]/i.test(q.replace(/[kK]/g, '')) ? digitos : '');
    let persona = porRut
      ? await this.db.persona.findFirst({ where: { corredoraId: c.corredoraId, eliminadoEn: null, rut: porRut } })
      : null;
    if (!persona) {
      const l = await this.db.persona.findMany({
        where: { corredoraId: c.corredoraId, eliminadoEn: null, busqueda: { contains: normalizar(q) } },
        take: 5,
      });
      const exactas = l.filter((x) => norm(x.nombre) === norm(q));
      if (exactas.length === 1) persona = exactas[0];
      else if (l.length === 1) persona = l[0];
      else if (l.length > 1)
        return { error: `Hay varias personas que calzan con «${q}»: ${l.map((x) => `${x.nombre} (${x.rutFormato || 'sin RUT'})`).join('; ')}. Pregúntale cuál.` };
    }
    const email = String(a.email ?? '').trim() || persona?.email || '';
    const telefono = String(a.telefono ?? '').trim() || persona?.telefono || '';
    if (email && !emailOk(email)) return { error: `El correo «${email}» no es válido.` };
    if (!persona) {
      const rut = a.rut ? limpioRut(a.rut) : '';
      if (!rut) return { error: `«${q}» no está en el CRM: para la orden necesito su nombre completo y su RUT (y su correo).` };
      if (!rutValido(rut)) return { error: `El RUT ${rutFormato(rut)} no es válido (el dígito verificador no calza): pídele que lo confirme.` };
      return { nueva: { nombre: q, rut: rutFormato(rut), email, telefono }, nombre: q, rut: rutFormato(rut), email, telefono };
    }
    return { persona, nombre: persona.nombre, rut: persona.rutFormato || persona.rut || '', email, telefono };
  }

  // ---------------------------------------------------------------- los datos del documento
  private valorDe(v: Variable, p: Propiedad & { fotos: PropiedadFoto[] }, op: string, corredor: { nombre: string; email: string; telefono: string }, fecha: string): string | null {
    const k = norm(`${v.name ?? ''} ${v.label ?? ''}`);
    if (/fecha/.test(k)) return fecha;
    if (/corredor/.test(k)) {
      if (/mail|correo/.test(k)) return corredor.email || null;
      if (/telefono|fono|celular/.test(k)) return corredor.telefono || null;
      if (/nombre/.test(k)) return corredor.nombre || null;
    }
    if (v.kind === 'image' || v.input_type === 'image' || /imagen|foto/.test(k)) return p.fotos.find((f) => /^https:\/\//.test(f.url))?.url ?? null;
    if (/ciudad/.test(k)) return 'Santiago';
    if (/comuna/.test(k)) return p.comuna;
    if (/region/.test(k)) return p.region;
    if (/\brol\b|rol-de|avaluo/.test(k)) return p.rol;
    if (/codigo/.test(k)) return p.codigo;
    if (/tipo-de-gestion|operacion|gestion/.test(k)) return op;
    if (/tipo-de-(inmueble|propiedad)|tipo de (inmueble|propiedad)|^tipo\b/.test(k)) return String(p.tipo || '').replace(/_/g, ' ');
    if (/gastos-comunes|gastos comunes/.test(k)) return p.gastosComunes ? `$${Number(p.gastosComunes).toLocaleString('es-CL')}` : null;
    if (/canon|renta|arriendo-mensual|monto-del-arriendo/.test(k)) return precio(p.precioArriendo, p.monedaArriendo);
    if (/precio-venta|precio venta/.test(k)) return precio(p.precioVenta, p.monedaVenta) || precio(p.precioArriendo, p.monedaArriendo);
    if (/precio-arriendo|precio arriendo/.test(k)) return precio(p.precioArriendo, p.monedaArriendo) || precio(p.precioVenta, p.monedaVenta);
    if (/precio|valor-de-venta|valor/.test(k))
      return (op === 'arriendo' ? precio(p.precioArriendo, p.monedaArriendo) : precio(p.precioVenta, p.monedaVenta)) || precio(p.precioVenta, p.monedaVenta) || precio(p.precioArriendo, p.monedaArriendo);
    if (/superficie|m2|metros/.test(k)) return p.supTotal || p.supUtil ? `${Number(p.supTotal || p.supUtil)} m²` : null;
    if (/dormitorio/.test(k)) return p.dormitorios != null ? String(p.dormitorios) : null;
    if (/bano/.test(k)) return p.banos != null ? String(p.banos) : null;
    if (/estacionamiento/.test(k)) return p.estacionamientos != null ? String(p.estacionamientos) : null;
    if (/bodega/.test(k)) return p.bodegas != null ? String(p.bodegas) : null;
    if (/direcc|domicilio|ubicacion/.test(k)) return [p.direccion, p.unidad ? `depto. ${p.unidad}` : ''].filter(Boolean).join(', ');
    return null;
  }

  // ---------------------------------------------------------------- la herramienta
  async ejecutar(c: CtxOrden, pedido: ArgsOrden): Promise<Record<string, unknown>> {
    let a = pedido;
    if (pedido.confirmado) {
      // el modelo no recuerda con exactitud los argumentos del turno anterior: se envía EXACTAMENTE lo que se le mostró
      // al corredor (lo último que se preparó), y solo ante un «sí» puro de este turno
      const pend = this.preparadas.get(c.usuarioId);
      if (!pend || Date.now() - pend.en > VIGENCIA_MS)
        return { error: 'Primero hay que preparar la orden y mostrarle los datos (llámala sin confirmado). No hay nada preparado o venció (15 minutos).' };
      if (!asiente(c.texto))
        return { error: 'El corredor todavía no confirmó: pregúntale si la envías y espera su sí. Si pidió un cambio, prepárala de nuevo con el cambio.' };
      a = { ...pend.args, confirmado: true };
    }
    const codigo = String(a.codigo_propiedad ?? '').trim();
    if (!codigo) return { error: 'Indica el código de la propiedad (por ejemplo PF-1001).' };
    const fecha = String(a.fecha ?? '').trim() || hoy();
    const hora = String(a.hora ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: 'La fecha de la visita va como AAAA-MM-DD.' };
    if (hora && !/^\d{2}:\d{2}$/.test(hora)) return { error: 'La hora va como HH:MM.' };

    const p = await this.db.propiedad.findFirst({
      where: { corredoraId: c.corredoraId, eliminadoEn: null, codigo: { equals: codigo, mode: 'insensitive' } },
      include: { fotos: { orderBy: { orden: 'asc' } } },
    });
    if (!p) return { error: `No encontré la propiedad ${codigo}.` };
    const usuario = await this.db.usuario.findUnique({ where: { id: c.usuarioId } });
    if (!usuario) return { error: 'No encontré tu usuario.' };

    const vis = await this.visitante(c, a);
    if ('error' in vis) return { error: vis.error };
    if (!vis.email) return { error: `Falta el correo de ${vis.nombre}: ahí recibe el enlace para firmar. Pídeselo.` };

    // la plantilla y su formulario, desde la Notaría virtual de Portalfirma
    let plantilla: { template_version_id: string; name?: string } | undefined;
    let formulario: { groups?: Grupo[] } | null = null;
    let pfId: string | null = p.origenSistema === 'portalfirma' ? p.origenId : null;
    try {
      const b = await this.herramienta(c.corredoraId, { action: 'search', query: 'Orden de visita', top_k: 5 });
      if (b.error) return { error: `Portalfirma: ${b.texto.slice(0, 200)}` };
      let l: { template_version_id: string; name?: string }[] = [];
      try {
        const j = JSON.parse(b.texto) as unknown;
        l = Array.isArray(j) ? j : ((j as { results?: typeof l }).results ?? []);
      } catch {
        /* sin resultados */
      }
      plantilla = l.find((x) => /^orden de visita/i.test(x.name || '')) ?? l.find((x) => /visita/i.test(x.name || ''));
      if (!plantilla) return { error: 'No encontré la plantilla «Orden de visita» en la Notaría virtual de la cuenta.' };
      let f = await this.herramienta(c.corredoraId, { action: 'get_forms', template_version_id: plantilla.template_version_id, ...(pfId ? { property_id: pfId } : {}) });
      if (pfId && (f.error || !/^\s*[[{]/.test(f.texto))) {
        pfId = null;
        f = await this.herramienta(c.corredoraId, { action: 'get_forms', template_version_id: plantilla.template_version_id });
      }
      try {
        formulario = JSON.parse(f.texto) as { groups?: Grupo[] };
      } catch {
        formulario = null;
      }
      if (!formulario?.groups) return { error: `Portalfirma no devolvió el formulario de la plantilla${f.texto ? `: «${f.texto.slice(0, 200)}»` : ''}.` };
    } catch (e) {
      const m = (e as { response?: { codigo?: string } }).response;
      if (m?.codigo === 'NECESITA_CONEXION') return { error: 'La corredora no tiene Portalfirma conectado: el administrador debe conectarlo en Asset › Integraciones.' };
      this.log.warn(`orden de visita: ${(e as Error).message}`);
      return { error: `No pude consultar Portalfirma: ${(e as Error).message}` };
    }

    const op = a.operacion === 'arriendo' || a.operacion === 'venta' ? a.operacion : p.arriendo && !p.venta ? 'arriendo' : 'venta';
    const corredor = { nombre: usuario.nombre, email: usuario.email, telefono: usuario.telefono ?? '' };
    const values: Record<string, string> = {};
    const datosDelDocumento: { campo: string; valor: string }[] = [];
    const faltan: string[] = [];
    for (const g of formulario.groups ?? [])
      for (const v of g.variables ?? []) {
        const k = norm(`${v.name ?? ''} ${v.label ?? ''}`);
        let val: string | null = null;
        if (g.type === 'signer')
          val = /rut/.test(k) ? vis.rut : /correo|email|mail/.test(k) ? vis.email : /telefono|fono|celular/.test(k) ? vis.telefono : /nombre/.test(k) ? vis.nombre : null;
        else val = this.valorDe(v, p, op, corredor, fecha);
        if (val) {
          values[v.id] = String(val);
          datosDelDocumento.push({ campo: v.label || v.name || v.id, valor: v.kind === 'image' || v.input_type === 'image' ? '(foto de la propiedad)' : String(val).slice(0, 120) });
        } else if (v.required)
          faltan.push(v.kind === 'image' || v.input_type === 'image' ? 'una foto de la propiedad (mándala a este chat con el código en el mensaje)' : `${(v.label || v.name || v.id).toLowerCase()}`);
      }
    if (faltan.length) return { error: `Para la orden de visita falta: ${faltan.join(', ')}.` };

    const resumen = {
      propiedad: `${p.codigo} · ${p.titulo}`,
      visitante: vis.nombre,
      rut: vis.rut,
      correo: vis.email,
      fecha,
      hora: hora || null,
      plantilla: plantilla.name ?? 'Orden de visita',
      datosDelDocumento,
    };
    const clave = createHash('sha1')
      .update(JSON.stringify([p.id, norm(vis.nombre), vis.rut, vis.email, vis.telefono, fecha, hora, op, plantilla.template_version_id]))
      .digest('hex');

    // ---- paso 1: preparar
    if (!a.confirmado) {
      this.preparadas.set(c.usuarioId, { clave, en: Date.now(), args: { ...a, confirmado: false } });
      return {
        ok: true,
        enviada: false,
        necesitaConfirmacion: true,
        ...resumen,
        indicacion:
          'La orden NO se envió, NO se cobró y NO se agendó. Muéstrale estos datos y pregúntale si la envías (se cobra del saldo de Portalfirma y el visitante recibe el enlace para firmar en su correo). Cuando conteste que sí, vuelve a llamar esta herramienta con confirmado: true y EXACTAMENTE los mismos datos. Sin su sí, no la envíes.',
      };
    }

    // ---- paso 2: enviar lo que se mostró (si los datos cambiaron desde entonces, se vuelve a mostrar)
    const previa = this.preparadas.get(c.usuarioId);
    if (!previa || previa.clave !== clave)
      return { error: 'Los datos cambiaron desde que se los mostraste (la ficha, el visitante o la plantilla): prepárala de nuevo y muéstraselos otra vez.' };

    const r = await this.herramienta(c.corredoraId, {
      action: 'send_sign',
      template_version_id: plantilla.template_version_id,
      values,
      ...(pfId ? { property_id: pfId } : {}),
    });
    this.preparadas.delete(c.usuarioId);
    if (r.error) return { error: `Portalfirma no generó la orden: ${r.texto.slice(0, 240)}` };
    const operacion = operacionDe(r.texto);

    // ---- lo que queda registrado
    try {
      const token = { sub: c.usuarioId, corredoraId: c.corredoraId, rol: usuario.rol, sid: '' };
      let personaId = vis.persona?.id ?? null;
      if (vis.nueva) {
        const nueva = await this.personas.crear(token, { nombre: vis.nueva.nombre, rut: vis.nueva.rut, email: vis.nueva.email || undefined, telefono: vis.nueva.telefono || undefined, roles: ['interesado'] });
        personaId = (nueva as { id: string }).id;
      } else if (vis.persona && ((!vis.persona.email && vis.email) || (!vis.persona.telefono && vis.telefono)))
        await this.db.persona.update({ where: { id: vis.persona.id }, data: { ...(vis.persona.email ? {} : { email: vis.email }), ...(vis.persona.telefono || !vis.telefono ? {} : { telefono: vis.telefono }), version: { increment: 1 } } });
      if (personaId)
        await this.db.propiedadPersona.upsert({
          where: { propiedadId_personaId_rol: { propiedadId: p.id, personaId, rol: 'interesado' } },
          create: { propiedadId: p.id, personaId, rol: 'interesado' },
          update: {},
        });
      if (operacion)
        await this.db.firma.upsert({
          where: { corredoraId_operacion: { corredoraId: c.corredoraId, operacion } },
          create: {
            id: `op${operacion}`,
            corredoraId: c.corredoraId,
            operacion,
            documento: 'Orden de visita',
            origen: 'agente',
            estado: 'en_firma',
            propiedadIds: [p.id],
            enviadoPorId: c.usuarioId,
            total: 1,
            firmantes: [{ nombre: vis.nombre, rut: vis.rut, rol: 'Visitante', personaId, email: vis.email, telefono: vis.telefono, firmo: false }] as Prisma.InputJsonValue,
            datos: { plantillaId: plantilla.template_version_id, enviadaPor: 'whatsapp' },
          },
          update: {},
        });
      // la visita en la agenda: si ya había una de esa propiedad ese día a la misma hora, se le anota la orden; si no, se
      // crea (otra visita el mismo día, de otra persona, no se toca)
      const dia = new Date(`${fecha}T00:00:00Z`);
      const ya = await this.db.evento.findFirst({ where: { corredoraId: c.corredoraId, propiedadId: p.id, tipo: 'visita', fecha: dia, hora: hora || null, eliminadoEn: null, estado: 'programado' } });
      if (ya)
        await this.db.evento.update({
          where: { id: ya.id },
          data: { datos: { ...(ya.datos as object), orden: { operacion }, actualizado: new Date().toISOString() } as Prisma.InputJsonValue, ...(hora && !ya.hora ? { hora } : {}), version: { increment: 1 } },
        });
      else
        await this.db.evento.create({
          data: {
            id: 'v' + Date.now().toString(36) + randomBytes(2).toString('hex'),
            corredoraId: c.corredoraId,
            tipo: 'visita',
            fecha: dia,
            hora: hora || null,
            propiedadId: p.id,
            personaIds: personaId ? [personaId] : [],
            corredorId: c.usuarioId,
            creadoPorId: c.usuarioId,
            datos: { titulo: `Visita de ${vis.nombre} a ${p.codigo}`, duracion: 45, lugar: [p.direccion, p.unidad, p.comuna].filter(Boolean).join(', '), notas: operacion ? `Orden de visita: operación ${operacion}` : '', orden: { operacion }, creado: new Date().toISOString(), actualizado: new Date().toISOString(), ext: { fuente: 'whatsapp' } } as Prisma.InputJsonValue,
          },
        });
      await this.actividad.registrar({
        corredoraId: c.corredoraId,
        entidadTipo: 'propiedad',
        entidadId: p.id,
        texto: `Orden de visita enviada a firmar a ${vis.nombre}${operacion ? ` (operación ${operacion})` : ''} por WhatsApp`,
        usuarioId: c.usuarioId,
      });
    } catch (e) {
      // la orden ya salió: lo que falle al registrar no debe esconderlo
      this.log.error(`orden de visita enviada pero sin registrar del todo: ${(e as Error).message}`);
      return { ok: true, enviada: true, operacion, visitante: vis.nombre, aviso: 'La orden se envió, pero no pude registrarla del todo en Asset: ábrelo para revisarla.' };
    }
    return {
      ok: true,
      enviada: true,
      operacion,
      visitante: vis.nombre,
      correo: vis.email,
      fecha,
      hora: hora || null,
      indicacion: `La orden se envió a firmar${operacion ? ` (operación ${operacion})` : ''}: ${vis.nombre} recibe el enlace en ${vis.email}. Se cobró del saldo de Portalfirma. La visita quedó en la agenda.`,
    };
  }
}
