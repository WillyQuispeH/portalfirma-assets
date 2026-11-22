/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument -- los datos del lead son JSON de la app */
// Reglas de leads que antes vivían solo en la app (desktop/src/leads.js), ahora UNA vez en el servidor: registrar un lead a mano
// (sin pedir RUT y sin escribirle al cliente), cambiar su estado o próxima acción, y registrar un lead desde un chat EXPORTADO de
// WhatsApp (.txt o .zip): se analiza con IA, se muestra el resumen y recién al confirmar se guarda.
//  · POST  /v1/leads-acciones/manual         { nombre?, telefono?, email?, origen?, busqueda?, notas?, proximaAccion? }
//  · PATCH /v1/leads-acciones/:id            { estado?, motivo?, proximaAccion?, notas?, nombre?, telefono?, email?, rut? }
//  · POST  /v1/leads-acciones/chat/analizar  { archivo (base64), nombre, cliente?, telefono? } → resumen para confirmar (no guarda)
//  · POST  /v1/leads-acciones/chat/importar  { token } → guarda el lead y su conversación
// El corredor ve y cambia lo suyo; el administrador, todo.
import { BadRequestException, Body, Controller, ForbiddenException, Injectable, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import type { Lead } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActividadService } from '../comun/actividad.service';
import { AlmacenamientoService } from '../archivos/almacenamiento.service';
import { TranscripcionService } from '../ia/transcripcion';
import { IaService } from '../whatsapp/ia';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { esAdmin, puedeVer } from '../comun/asignados';
import { normalizar } from '../comun/texto';
import { LeadsWaService, type MensajeLead } from '../whatsapp/leads-wa';
import { AnalisisLeadService } from './analisis-lead';
import { PersonasAccionesService, emailValido } from '../personas/personas-acciones';
import { claveMensaje, leerExportacion, parsear, type ChatLeido, type Exportacion } from './chat-whatsapp';

export const ESTADOS_LEAD = ['nuevo', 'contactado', 'visita', 'negociando', 'ganado', 'perdido'] as const;
export const ORIGENES_LEAD: Record<string, string> = {
  chat: 'Chat exportado', whatsapp: 'WhatsApp de la empresa', instagram: 'Instagram', facebook: 'Facebook Messenger', email: 'Correo', portal: 'Portal', web: 'Sitio web', referido: 'Referido', otro: 'Otro',
};
const ESTADO_TXT: Record<string, string> = { nuevo: 'Nuevo', contactado: 'Contactado', visita: 'Visita agendada', negociando: 'Negociando', ganado: 'Ganado', perdido: 'Perdido' };
const dig = (t: unknown) => String(t ?? '').replace(/\D/g, '');
const ult9 = (t: unknown) => (dig(t).length >= 8 ? dig(t).slice(-9) : null);
const esTelefono = (s: string) => {
  const d = dig(s);
  return d.length >= 8 && d.length <= 15 && /^[+\d\s().-]+$/.test(String(s).trim());
};
const n = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const MAX_MEDIOS = 60;
const MAX_ARCHIVO = 25 * 1024 * 1024;
const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', opus: 'audio/ogg', ogg: 'audio/ogg', m4a: 'audio/mp4', mp3: 'audio/mpeg', aac: 'audio/aac', amr: 'audio/amr', wav: 'audio/wav', mp4: 'video/mp4', mov: 'video/quicktime', '3gp': 'video/3gpp', pdf: 'application/pdf', vcf: 'text/vcard' };

type J = Record<string, any>;
export type LeadHallado = { ok: true; v: Lead } | { ok: false; error: string };

interface Pendiente {
  usuarioId: string;
  corredoraId: string;
  chat: ChatLeido;
  ex: Exportacion;
  cliente: string;
  telefono: string;
  analisis: J | null;
  hasta: number;
}

const evento = (d: J, texto: string, tipo = 'info') => {
  d.historial = [...((d.historial as unknown[]) ?? []), { fecha: new Date().toISOString(), texto: String(texto).slice(0, 300), tipo }].slice(-200);
};

@Injectable()
export class LeadsAccionesService {
  /** análisis de chats a la espera del sí del usuario (30 minutos) */
  private readonly pendientes = new Map<string, Pendiente>();

  constructor(
    private readonly db: PrismaService,
    private readonly leads: LeadsWaService,
    private readonly personas: PersonasAccionesService,
    private readonly actividad: ActividadService,
    private readonly analisisLead: AnalisisLeadService,
    private readonly ia: IaService,
    private readonly r2: AlmacenamientoService,
    private readonly transcripcion: TranscripcionService,
  ) {}

  private visibles(u: UsuarioToken) {
    return { corredoraId: u.corredoraId, eliminadoEn: null, ...(esAdmin(u) ? {} : { corredorId: u.sub }) };
  }

  /** un lead por su id, celular o nombre, entre los que ve este usuario; si hay varios, el error los lista */
  async resolver(u: UsuarioToken, ref: unknown): Promise<LeadHallado> {
    const k = String(ref ?? '').trim();
    if (!k) return { ok: false, error: 'Falta indicar el lead (su nombre o celular).' };
    const l = await this.db.lead.findMany({ where: this.visibles(u), orderBy: { actualizadoEn: 'desc' }, take: 400 });
    const exacto = l.find((x) => x.id === k);
    if (exacto) return { ok: true, v: exacto };
    const t = ult9(k);
    const q = normalizar(k).split(/\s+/).filter((x) => x.length > 1);
    const hit = l.filter((x) => {
      const d = (x.datos ?? {}) as J;
      return (t && x.telefonoNorm === t) || (q.length > 0 && q.every((w) => normalizar(`${d.nombre} ${d.chatCon} ${d.telefono} ${d.email}`).includes(w)));
    });
    if (!hit.length) return { ok: false, error: `No encontré un lead que coincida con «${k}» entre los tuyos.` };
    if (hit.length > 1)
      return {
        ok: false,
        error: `Hay ${hit.length} leads que coinciden: ${hit
          .slice(0, 6)
          .map((x) => `${(x.datos as J)?.nombre || (x.datos as J)?.chatCon || 's/nombre'} (${(x.datos as J)?.telefono || 's/celular'}, ${x.estado})`)
          .join(' | ')}. Pregúntale al corredor cuál.`,
      };
    return { ok: true, v: hit[0] };
  }

  vista(l: Lead) {
    const d = (l.datos ?? {}) as J;
    return {
      id: l.id,
      nombre: d.nombre || d.chatCon || '',
      telefono: d.telefono || '',
      email: d.email || '',
      estado: l.estado,
      estadoTxt: ESTADO_TXT[l.estado] || l.estado,
      origen: ORIGENES_LEAD[l.origen] || l.origen,
      busca: d.resumen || '',
      busqueda: d.busqueda ?? {},
      proximaAccion: d.proximaAccion ?? null,
      motivoPerdida: d.motivoPerdida ?? null,
      personaId: l.personaId,
      version: l.version,
    };
  }

  // ------------------------------------------------------------------ alta a mano
  /** registra un lead SIN pedir RUT y SIN escribirle al cliente; si ya hay uno con ese celular o correo, no lo duplica */
  async crearManual(
    u: UsuarioToken,
    o: { nombre?: string; telefono?: string; email?: string; origen?: string; busqueda?: J | null; notas?: string; proximaAccion?: { texto?: string; fecha?: string | null } | null },
  ) {
    const nombre = String(o.nombre ?? '').trim().slice(0, 120);
    const telefono = String(o.telefono ?? '').trim().slice(0, 40);
    const email = String(o.email ?? '').trim().toLowerCase().slice(0, 120);
    if (!nombre && !telefono && !email) throw new BadRequestException('Indica al menos el nombre, el celular o el correo del lead.');
    if (telefono && dig(telefono).length < 8) throw new BadRequestException('El celular no es válido.');
    if (email && !emailValido(email)) throw new BadRequestException('El correo no es válido.');
    const t = ult9(telefono);
    const ya = await this.db.lead.findFirst({
      where: { corredoraId: u.corredoraId, eliminadoEn: null, OR: [...(t ? [{ telefonoNorm: t }] : []), ...(email ? [{ email }] : [])] },
    });
    if (ya) return { lead: puedeVer(u, ya) ? this.vista(ya) : null, yaExistia: true, deOtro: !puedeVer(u, ya) };
    const b = o.busqueda ?? {};
    const origen = ORIGENES_LEAD[o.origen ?? ''] ? (o.origen as string) : 'otro';
    const usuario = await this.db.usuario.findUnique({ where: { id: u.sub }, select: { nombre: true } });
    const l = await this.leads.crear(u.corredoraId, {
      nombre,
      telefono,
      email,
      origen,
      corredorId: u.sub,
      datos: {
        chatCon: nombre || telefono || email,
        broker: usuario?.nombre ?? '',
        busqueda: {
          operacion: ['arriendo', 'venta'].includes(b.operacion) ? b.operacion : null,
          tipo: b.tipo ? String(b.tipo).slice(0, 40) : null,
          comunas: (Array.isArray(b.comunas) ? b.comunas : []).map(String).filter(Boolean).slice(0, 8),
          presupuesto: n(b.presupuesto) ? { valor: n(b.presupuesto), moneda: b.moneda === 'UF' ? 'UF' : 'CLP' } : null,
          dormitorios: n(b.dormitorios),
          banos: n(b.banos),
          estacionamiento: null,
          mascotas: null,
          plazo: null,
          otros: [],
        },
        proximaAccion: o.proximaAccion?.texto ? { texto: String(o.proximaAccion.texto).slice(0, 160), fecha: o.proximaAccion.fecha || null, manual: true } : null,
        notas: String(o.notas ?? '').slice(0, 2000),
        historial: [{ fecha: new Date().toISOString(), texto: `Registrado a mano (${ORIGENES_LEAD[origen]})`, tipo: 'canal' }],
      },
    });
    await this.vincularPersona(u, l);
    return { lead: this.vista((await this.db.lead.findUnique({ where: { id: l.id } })) ?? l), yaExistia: false, deOtro: false };
  }

  /** la persona del lead en el CRM: se crea (rol interesado) o se completa; el lead queda ligado a ella */
  private async vincularPersona(u: UsuarioToken, l: Lead) {
    const d = (l.datos ?? {}) as J;
    const p = await this.personas.deContacto(u, { nombre: d.nombre || d.chatCon, telefono: d.telefono, email: d.email, origen: ORIGENES_LEAD[l.origen] || l.origen, leadId: l.id });
    if (p && p.id !== l.personaId)
      await this.leads.cambiar(l.id, (dd) => {
        if (!l.personaId) evento(dd, `Quedó guardado en Personas como ${p.nombre}`, 'persona');
        return { datos: dd, cols: { personaId: p.id } };
      });
    return p;
  }

  // ------------------------------------------------------------------ estado, próxima acción y datos
  async actualizar(
    u: UsuarioToken,
    id: string,
    c: { estado?: string; motivo?: string; proximaAccion?: { texto?: string; fecha?: string | null } | null; notas?: string; nombre?: string; telefono?: string; email?: string; rut?: string },
  ) {
    const l = await this.db.lead.findFirst({ where: { id, corredoraId: u.corredoraId, eliminadoEn: null } });
    if (!l) throw new NotFoundException('El lead ya no existe.');
    if (!puedeVer(u, l)) throw new ForbiddenException('Ese lead es de otro corredor.');
    if (c.estado !== undefined && !(ESTADOS_LEAD as readonly string[]).includes(c.estado)) throw new BadRequestException('Estado no válido.');
    if (c.email && !emailValido(c.email)) throw new BadRequestException('El correo no es válido.');
    if (c.telefono && dig(c.telefono).length < 8) throw new BadRequestException('El celular no es válido.');
    if (c.estado === 'perdido' && !String(c.motivo ?? (l.datos as J)?.motivoPerdida ?? '').trim()) throw new BadRequestException('Para marcarlo como perdido necesito el motivo.');
    const r = await this.leads.cambiar(id, (d, act) => {
      const cols: J = {};
      if (c.estado !== undefined) {
        cols.estado = c.estado;
        if (c.estado !== act.estado) evento(d, `Estado: ${ESTADO_TXT[c.estado]}`, 'estado');
        if (c.estado === 'perdido') d.motivoPerdida = String(c.motivo ?? d.motivoPerdida ?? '').slice(0, 200);
      }
      for (const k of ['nombre', 'telefono', 'email', 'rut', 'notas'] as const)
        if (c[k] !== undefined) d[k] = String(c[k] || '').trim().slice(0, k === 'notas' ? 2000 : 120);
      if (c.telefono !== undefined) cols.telefonoNorm = ult9(c.telefono);
      if (c.email !== undefined) cols.email = c.email ? c.email.toLowerCase().slice(0, 200) : null;
      if (c.proximaAccion !== undefined)
        d.proximaAccion = c.proximaAccion?.texto ? { texto: String(c.proximaAccion.texto).slice(0, 160), fecha: c.proximaAccion.fecha || null, manual: true } : null;
      d.actualizado = new Date().toISOString();
      return { datos: d, cols };
    });
    if (!r) throw new BadRequestException('Otra persona cambió el lead recién: vuelve a intentarlo.');
    if (c.estado && c.estado !== l.estado)
      for (const pid of ((l.datos as J)?.propiedades as string[]) ?? [])
        await this.actividad.registrar({ corredoraId: u.corredoraId, entidadTipo: 'propiedad', entidadId: pid, texto: `Lead ${(r.datos as J)?.nombre || (r.datos as J)?.telefono}: ${ESTADO_TXT[c.estado]}`, tipo: 'lead', ref2: id, usuarioId: u.sub }).catch(() => null);
    if (['nombre', 'telefono', 'email'].some((k) => c[k as 'nombre'] !== undefined)) await this.vincularPersona(u, r);
    return this.vista(r);
  }

  // ------------------------------------------------------------------ chat exportado de WhatsApp
  private limpiarPendientes() {
    for (const [k, v] of this.pendientes) if (v.hasta < Date.now()) this.pendientes.delete(k);
  }
  /** el análisis que espera confirmación de este usuario (del último chat que mandó) */
  pendienteDe(usuarioId: string) {
    this.limpiarPendientes();
    return [...this.pendientes.entries()].filter(([, v]) => v.usuarioId === usuarioId).sort((a, b) => b[1].hasta - a[1].hasta)[0] ?? null;
  }

  /**
   * Lee el archivo (.txt o .zip) y devuelve qué trae, sin guardar nada: quién parece ser el cliente, cuántos mensajes, el análisis de
   * la IA (qué busca, estado, próxima acción) y si ya hay un lead de ese cliente. Si no se sabe quién es el cliente, `preguntar` lo dice.
   */
  async analizarChat(u: UsuarioToken, o: { bytes: Buffer; nombre: string; cliente?: string; telefono?: string; miNombre?: string }) {
    let ex: Exportacion;
    try {
      ex = leerExportacion(o.bytes, o.nombre);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    const chat = parsear(ex.texto, ex.nombre);
    if (!chat) throw new BadRequestException('Este archivo no parece un chat exportado de WhatsApp. En el chat: ⋮ o el nombre del contacto › Exportar chat.');
    const yo = normalizar(o.miNombre ?? '');
    const con = normalizar(chat.chatCon ?? '');
    let cliente =
      (o.cliente && chat.participantes.find((p) => normalizar(p.nombre) === normalizar(o.cliente))?.nombre) ||
      (con && chat.participantes.find((p) => normalizar(p.nombre) === con)?.nombre) ||
      (yo && chat.participantes.length === 2 ? chat.participantes.find((p) => !normalizar(p.nombre).includes(yo.split(' ')[0]))?.nombre : null) ||
      (chat.participantes.length === 1 ? chat.participantes[0].nombre : null) ||
      null;
    const reales = chat.mensajes.filter((m) => m.tipo !== 'sistema');
    if (!reales.length) throw new BadRequestException('El chat no trae mensajes.');
    if (o.cliente && !cliente) cliente = null;
    const base = { participantes: chat.participantes, total: reales.length, desde: reales[0]?.fecha ?? null, hasta: reales.at(-1)?.fecha ?? null, chatCon: chat.chatCon };
    if (!cliente) return { ...base, preguntar: 'cliente' as const, token: null, cliente: null };
    const telefono = o.telefono || (esTelefono(cliente) ? cliente : '');
    const medios: Record<string, number> = {};
    for (const m of reales) if (m.tipo !== 'texto') medios[m.tipo] = (medios[m.tipo] || 0) + 1;
    const existente = await this.buscarExistente(u, cliente, telefono);
    let nuevos = reales.length;
    if (existente) {
      const ya = new Set((await this.db.leadMensaje.findMany({ where: { leadId: existente.id }, select: { k: true } })).map((m) => m.k));
      nuevos = reales.filter((m) => !ya.has(claveMensaje(m))).length;
    }
    // la IA lee la conversación (si no hay IA, el lead se guarda igual, sin resumen)
    let analisis: J | null = null;
    let sinIa: string | null = null;
    if (await this.ia.disponible(u.corredoraId)) {
      const lineas = reales.map((m) => `[${m.fecha.slice(8, 10)}/${m.fecha.slice(5, 7)} ${m.fecha.slice(11, 16)}] ${m.autor === cliente ? 'Cliente' : 'Broker'}: ${(m.texto || `(${m.tipo})`).replace(/\s*\n\s*/g, ' ')}`);
      try {
        analisis = await this.analisisLead.leerConversacion(u.corredoraId, lineas.join('\n'));
      } catch (e) {
        sinIa = `No pude analizar la conversación con IA (${(e as Error).message}); el lead se guardará igual.`;
      }
    } else sinIa = 'La IA no está disponible: el lead se guardará sin resumen.';
    this.limpiarPendientes();
    for (const [k, v] of this.pendientes) if (v.usuarioId === u.sub) this.pendientes.delete(k); // un solo análisis pendiente por usuario
    const token = randomBytes(9).toString('hex');
    this.pendientes.set(token, { usuarioId: u.sub, corredoraId: u.corredoraId, chat, ex, cliente, telefono, analisis, hasta: Date.now() + 30 * 60_000 });
    const b = (analisis?.busqueda ?? {}) as J;
    return {
      ...base,
      token,
      cliente,
      telefono,
      medios,
      conArchivos: ex.medios.size > 0,
      existente: existente ? { id: existente.id, nombre: (existente.datos as J)?.nombre || (existente.datos as J)?.chatCon, nuevos } : null,
      analisis: analisis
        ? {
            resumen: String(analisis.resumen ?? '').slice(0, 400),
            perfil: analisis.perfil ? String(analisis.perfil).slice(0, 300) : null,
            estadoSugerido: analisis.estadoSugerido ?? null,
            busca: {
              operacion: b.operacion ?? null, tipo: b.tipo ?? null, comunas: b.comunas ?? [], presupuesto: b.presupuesto ?? null, dormitorios: b.dormitorios ?? null,
            },
            proximaAccion: analisis.proximaAccion?.texto ? { texto: analisis.proximaAccion.texto, fecha: analisis.proximaAccion.fecha ?? null } : null,
          }
        : null,
      aviso: sinIa,
    };
  }

  private async buscarExistente(u: UsuarioToken, nombre: string, telefono: string) {
    const t = ult9(telefono);
    const l = await this.db.lead.findMany({ where: this.visibles(u), take: 400 });
    return (
      l.find((x) => {
        const d = (x.datos ?? {}) as J;
        return (t && x.telefonoNorm === t) || (nombre && normalizar(d.chatCon || d.nombre) === normalizar(nombre));
      }) ?? null
    );
  }

  /** guarda (o completa) el lead con la conversación del análisis pendiente (las fotos y audios del .zip van a R2; los audios se transcriben) */
  async importarChat(u: UsuarioToken, token: string, extra: { cliente?: string; telefono?: string; origen?: string } = {}) {
    this.limpiarPendientes();
    const p = this.pendientes.get(token);
    if (!p || p.usuarioId !== u.sub) throw new BadRequestException('El análisis del archivo expiró. Vuelve a mandar el chat.');
    const { chat, ex } = p;
    const cliente = extra.cliente && chat.participantes.some((x) => x.nombre === extra.cliente) ? extra.cliente : p.cliente;
    const telefono = extra.telefono || p.telefono || (esTelefono(cliente) ? cliente : '');
    const origen = ORIGENES_LEAD[extra.origen ?? ''] ? (extra.origen as string) : 'chat';
    let l = await this.buscarExistente(u, cliente, telefono);
    const nuevo = !l;
    const usuario = await this.db.usuario.findUnique({ where: { id: u.sub }, select: { nombre: true } });
    if (!l)
      l = await this.leads.crear(u.corredoraId, {
        nombre: esTelefono(cliente) ? '' : cliente,
        telefono,
        email: '',
        origen,
        corredorId: u.sub,
        datos: { chatCon: cliente, broker: usuario?.nombre ?? '' },
      });
    const lead = l;
    // los mensajes (lo que ya estaba no se repite: su clave es la huella del mensaje)
    const ya = new Set((await this.db.leadMensaje.findMany({ where: { leadId: lead.id }, select: { k: true } })).map((m) => m.k));
    const mensajes: MensajeLead[] = [];
    let medios = 0;
    let transcritos = 0;
    for (const m0 of chat.mensajes) {
      if (m0.tipo === 'sistema') continue;
      const k = claveMensaje(m0);
      if (ya.has(k)) continue;
      ya.add(k);
      const m: MensajeLead = { k, fecha: m0.fecha, de: m0.autor === cliente ? 'cliente' : 'broker', autor: m0.autor ?? '', texto: m0.texto, tipo: m0.tipo, datos: { wa: false, chat: true } };
      if (m0.archivo && ex.medios.has(m0.archivo) && medios < MAX_MEDIOS && ['imagen', 'audio', 'video', 'documento'].includes(m0.tipo)) {
        try {
          const buf = ex.medios.get(m0.archivo)!();
          const ext = (m0.archivo.split('.').pop() || 'bin').toLowerCase();
          if (buf.length > 0 && buf.length <= MAX_ARCHIVO) {
            m.mediaUrl = await this.r2.subir(this.r2.claveLead(u.corredoraId, lead.id, ext), buf, MIME[ext] || 'application/octet-stream');
            medios++;
            if (m0.tipo === 'audio' && transcritos < 10) {
              transcritos++;
              const t = await this.transcripcion.transcribir(u.corredoraId, buf, /m4a|mp4/.test(ext) ? 'audio/mp4' : 'audio/ogg').catch(() => null);
              if (t?.texto) m.datos = { ...m.datos, transcripcion: t.texto };
            }
          }
        } catch {
          /* el mensaje queda sin su archivo */
        }
      }
      mensajes.push(m);
    }
    await this.leads.anotar(lead, mensajes);
    const reales = chat.mensajes.filter((m) => m.tipo !== 'sistema');
    await this.leads.cambiar(lead.id, (d, act) => {
      d.importaciones = [...((d.importaciones as unknown[]) ?? []), { fecha: new Date().toISOString(), nuevos: mensajes.length, archivo: ex.nombre }].slice(-20);
      if (telefono && !d.telefono) d.telefono = telefono;
      if (nuevo) evento(d, `Llegó por ${ORIGENES_LEAD[origen] || origen} (chat importado)`, 'canal');
      d.actualizado = new Date().toISOString();
      const cols: J = {};
      if (telefono && !act.telefonoNorm) cols.telefonoNorm = ult9(telefono);
      return { datos: d, cols };
    });
    if (p.analisis && mensajes.some((m) => m.de === 'cliente')) await this.analisisLead.aplicar(lead.id, p.analisis).catch(() => null);
    const final = (await this.db.lead.findUnique({ where: { id: lead.id } })) ?? lead;
    await this.vincularPersona(u, final);
    this.pendientes.delete(token);
    const guardado = (await this.db.lead.findUnique({ where: { id: lead.id } })) ?? final;
    return { lead: this.vista(guardado), nuevo, agregados: mensajes.length, total: reales.length, archivosGuardados: medios, audiosTranscritos: transcritos };
  }
}

const manualEsquema = z.object({
  nombre: z.string().max(120).optional(),
  telefono: z.string().max(40).optional(),
  email: z.string().max(120).optional(),
  origen: z.enum(Object.keys(ORIGENES_LEAD)).optional(),
  busqueda: z.record(z.string(), z.unknown()).nullish(),
  notas: z.string().max(2000).optional(),
  proximaAccion: z.object({ texto: z.string().max(160), fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish() }).nullish(),
});
const cambiosEsquema = z.object({
  estado: z.enum(ESTADOS_LEAD).optional(),
  motivo: z.string().max(200).optional(),
  proximaAccion: z.object({ texto: z.string().max(160), fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish() }).nullish(),
  notas: z.string().max(2000).optional(),
  nombre: z.string().max(120).optional(),
  telefono: z.string().max(40).optional(),
  email: z.string().max(120).optional(),
  rut: z.string().max(20).optional(),
});
const analizarEsquema = z.object({ archivo: z.string().min(8), nombre: z.string().max(200).default('chat.txt'), cliente: z.string().max(120).optional(), telefono: z.string().max(40).optional() });
const importarEsquema = z.object({ token: z.string().min(8).max(64), cliente: z.string().max(120).optional(), telefono: z.string().max(40).optional(), origen: z.enum(Object.keys(ORIGENES_LEAD)).optional() });

@Controller('leads-acciones')
export class LeadsAccionesController {
  constructor(
    private readonly s: LeadsAccionesService,
    private readonly db: PrismaService,
  ) {}

  @Post('manual')
  manual(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(manualEsquema)) b: z.infer<typeof manualEsquema>) {
    return this.s.crearManual(u, b);
  }

  @Post('chat/analizar')
  async analizar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(analizarEsquema)) b: z.infer<typeof analizarEsquema>) {
    const yo = await this.db.usuario.findUnique({ where: { id: u.sub }, select: { nombre: true } });
    return this.s.analizarChat(u, { bytes: Buffer.from(b.archivo, 'base64'), nombre: b.nombre, cliente: b.cliente, telefono: b.telefono, miNombre: yo?.nombre });
  }

  @Post('chat/importar')
  importar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(importarEsquema)) b: z.infer<typeof importarEsquema>) {
    return this.s.importarChat(u, b.token, b);
  }

  @Patch(':id')
  actualizar(@UsuarioActual() u: UsuarioToken, @Param('id') id: string, @Body(new ZodPipe(cambiosEsquema)) b: z.infer<typeof cambiosEsquema>) {
    return this.s.actualizar(u, id, b);
  }
}
