/* eslint-disable @typescript-eslint/no-base-to-string, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- los datos del lead son JSON de la app */
// Lo que los asistentes del servidor hacen con los leads (la app los ve al sincronizar, como si los hubiera cambiado
// otro equipo): buscarlos por teléfono, anotar los mensajes de la conversación (lead_mensajes, clave «wc<id>» del
// mensaje de wechatia, así nunca se duplican) y cambiar sus datos con `version` (si la app lo cambió entremedio, se
// vuelve a leer y se reintenta).
import { Injectable } from '@nestjs/common';
import { Prisma, type Lead } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { telNorm } from './comun';

export type DatosLead = Record<string, any>;
export interface MensajeLead {
  k: string;
  fecha: string;
  de: 'cliente' | 'broker' | 'agente';
  autor: string;
  texto: string;
  tipo?: string;
  datos?: Record<string, unknown>;
}

export const nuevoIdLead = () => 'l' + Date.now().toString(36) + randomBytes(3).toString('hex');
const ESTADO_TXT: Record<string, string> = { cliente: 'cliente', broker: 'broker', agente: 'broker' };

@Injectable()
export class LeadsWaService {
  constructor(private readonly db: PrismaService) {}

  /** el lead vivo con ese celular */
  porTelefono(corredoraId: string, telefono: string | null | undefined) {
    const t = telNorm(telefono);
    return t
      ? this.db.lead.findFirst({
          where: { corredoraId, telefonoNorm: t, eliminadoEn: null },
          orderBy: { creadoEn: 'asc' },
        })
      : Promise.resolve(null);
  }

  datos = (l: Lead) => (l.datos ?? {}) as DatosLead;

  /**
   * Cambia el lead: `cambio` recibe los datos y columnas actuales y devuelve lo nuevo (o null si no hay nada que
   * cambiar). Reintenta si otro lo cambió entremedio.
   */
  async cambiar(
    id: string,
    cambio: (
      d: DatosLead,
      l: Lead,
    ) => { datos?: DatosLead; cols?: Prisma.LeadUpdateManyMutationInput & { personaId?: string | null } } | null,
  ): Promise<Lead | null> {
    for (let i = 0; i < 4; i++) {
      const l = await this.db.lead.findUnique({ where: { id } });
      if (!l || l.eliminadoEn) return null;
      const r = cambio({ ...this.datos(l) }, l);
      if (!r) return l;
      const { personaId, ...cols } = r.cols ?? {};
      const n = await this.db.lead.updateMany({
        where: { id, version: l.version },
        data: {
          ...cols,
          ...(personaId !== undefined ? { personaId } : {}),
          ...(r.datos ? { datos: r.datos } : {}),
          version: { increment: 1 },
        },
      });
      if (n.count) return this.db.lead.findUnique({ where: { id } });
    }
    return null;
  }

  /**
   * «Contactado»: el administrador (o el corredor a cargo) respondió por WhatsApp o tomó la conversación. Solo si el lead
   * seguía en «Nuevo»: no retrocede ni pisa un estado más avanzado.
   */
  contactado(l: Lead, motivo: string) {
    return this.cambiar(l.id, (d, act) => {
      if (act.estado !== 'nuevo') return null;
      const ahora = new Date().toISOString();
      d.historial = [...(((d as { historial?: unknown[] }).historial as unknown[]) ?? []), { fecha: ahora, texto: motivo, tipo: 'estado' }].slice(-200) as never;
      d.actualizado = ahora;
      return { datos: d, cols: { estado: 'contactado' } };
    });
  }

  /** agrega mensajes a la conversación del lead (los repetidos no se duplican) y deja su resumen al día */
  async anotar(l: Lead, mensajes: MensajeLead[], o: { atiende?: boolean } = {}) {
    if (!mensajes.length) return { agregados: 0 };
    const ya = new Set(
      (
        await this.db.leadMensaje.findMany({
          where: { leadId: l.id, k: { in: mensajes.map((m) => m.k) } },
          select: { k: true },
        })
      ).map((m) => m.k),
    );
    const nuevos = mensajes.filter((m) => !ya.has(m.k));
    if (!nuevos.length) return { agregados: 0 };
    await this.db.leadMensaje.createMany({
      skipDuplicates: true,
      data: nuevos.map((m) => ({
        leadId: l.id,
        corredoraId: l.corredoraId,
        k: m.k,
        fecha: m.fecha,
        de: m.de,
        autor: m.autor.slice(0, 200),
        texto: m.texto.slice(0, 6000),
        tipo: m.tipo ?? 'texto',
        datos: { wa: true, ...(m.datos ?? {}) },
      })),
    });
    const total = await this.db.leadMensaje.count({ where: { leadId: l.id } });
    const u = [...nuevos].sort((a, b) => a.fecha.localeCompare(b.fecha)).at(-1)!;
    const delCliente = nuevos.filter((m) => m.de === 'cliente').length;
    const links = nuevos.flatMap((m) => m.texto.match(/https?:\/\/[^\s<>()]+/g) || []);
    await this.cambiar(l.id, (d, act) => {
      const previo = String(d.ultimo?.fecha || act.ultimoEn || '');
      const masNuevo = u.fecha >= previo;
      d.mensajes = total;
      if (masNuevo) d.ultimo = { fecha: u.fecha, de: ESTADO_TXT[u.de], texto: u.texto.slice(0, 140) };
      d.noLeidos = (Number(d.noLeidos) || 0) + delCliente;
      if (links.length) d.links = [...new Set([...(d.links || []), ...links])].slice(0, 40);
      if (o.atiende) {
        d.wa = true;
        d.atiende ||= 'agente';
      }
      d.actualizado = new Date().toISOString();
      return { datos: d, cols: masNuevo ? { ultimoEn: u.fecha } : {} };
    });
    return { agregados: nuevos.length, delCliente: delCliente > 0 };
  }

  /** un lead nuevo (desde una conversación de WhatsApp o de otro canal) */
  async crear(
    corredoraId: string,
    o: {
      nombre: string;
      telefono: string;
      email?: string;
      origen: string;
      corredorId?: string | null;
      personaId?: string | null;
      canal?: Record<string, unknown> | null;
      datos?: DatosLead;
    },
  ) {
    const ahora = new Date().toISOString();
    const datos: DatosLead = {
      nombre: o.nombre,
      chatCon: o.nombre || o.telefono || o.email || '',
      telefono: o.telefono,
      email: o.email ?? '',
      rut: '',
      busqueda: {},
      resumen: '',
      propiedades: [],
      links: [],
      proximaAccion: null,
      notas: '',
      creado: ahora,
      actualizado: ahora,
      mensajes: 0,
      ultimo: null,
      noLeidos: 0,
      importaciones: [],
      canales: o.canal ? [o.canal] : [],
      historial: [
        {
          fecha: ahora,
          texto: `Llegó por ${o.origen === 'whatsapp' ? 'WhatsApp de la empresa' : o.origen}`,
          tipo: 'canal',
        },
      ],
      ...(o.datos ?? {}),
    };
    return this.db.lead.create({
      data: {
        id: nuevoIdLead(),
        corredoraId,
        estado: 'nuevo',
        origen: o.origen,
        corredorId: o.corredorId ?? null,
        personaId: o.personaId ?? null,
        telefonoNorm: telNorm(o.telefono),
        email: o.email && o.email.includes('@') ? o.email.toLowerCase().slice(0, 200) : null,
        convIds: o.canal?.conv ? [String(o.canal.conv)] : [],
        datos: datos,
      },
    });
  }
}
