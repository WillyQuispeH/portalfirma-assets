/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument -- lo que devuelve la IA es JSON libre */
// El análisis de un lead con IA (qué busca, resumen, perfil, estado sugerido y próxima acción), a partir de su conversación. Lo usan el observador
// (conversaciones de Instagram, Facebook y correo que llegan por wechatia) y el registro de un chat exportado de WhatsApp (leads-acciones.ts).
// Vive aparte para no crear un ciclo de imports entre el observador, el puente y el equipo de WhatsApp.
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { IaService } from '../whatsapp/ia';
import { LeadsWaService } from '../whatsapp/leads-wa';
import { hoy, telNorm } from '../whatsapp/comun';

type J = Record<string, any>;

export const SISTEMA_LEAD = `Eres el asistente de una corredora de propiedades en Chile. Lees la conversación (WhatsApp, Instagram o correo) entre un broker y un cliente (lead) y devuelves SOLO un JSON:
{"resumen": "1 o 2 frases: qué busca y en qué quedaron", "busqueda": {"operacion": "arriendo"|"venta"|null, "tipo": "departamento"|"casa"|"oficina"|"local_comercial"|"parcela"|"terreno_construccion"|"bodega"|"estacionamiento"|null, "comunas": [..], "presupuesto": {"valor": número, "moneda": "CLP"|"UF"} o null, "dormitorios": número o null, "banos": número o null, "estacionamiento": true|false|null, "mascotas": true|false|null, "plazo": "cuándo lo necesita" o null, "otros": ["requisitos cortos"]},
 "email": string o null, "rut": string o null, "telefono": "celular que el cliente haya dado" o null, "perfil": "quién es: para quién busca, familia o socios, trabajo o giro, motivo y urgencia, forma de pago (contado, crédito, subsidio), lo que se sepa; 1 a 3 frases" o null, "estadoSugerido": "nuevo"|"contactado"|"visita"|"negociando"|"ganado"|"perdido", "proximaAccion": {"texto": "acción concreta para el broker", "fecha": "YYYY-MM-DD" o null}}
Reglas: «lucas» = miles de pesos (290 lucas = 290000 CLP). Usa solo lo que dice la conversación; si no se dijo, null. Si el cliente cambió de idea, usa lo último. «visita» si quedaron de ir a ver una propiedad; «perdido» si dijo que ya no busca o encontró otra.`;

@Injectable()
export class AnalisisLeadService {
  constructor(
    private readonly ia: IaService,
    private readonly leads: LeadsWaService,
  ) {}

  /** la IA lee una conversación (líneas «[DD/MM HH:MM] Cliente: …») y devuelve búsqueda, resumen, perfil, estado y próxima acción */
  async leerConversacion(corredoraId: string, conv: string): Promise<J> {
    if (conv.length > 14000) conv = '…\n' + conv.slice(-14000);
    return (await this.ia.json({
      corredoraId,
      uso: 'observador',
      sistema: SISTEMA_LEAD,
      usuario: `EXTRAER_LEAD\nHoy: ${hoy()}\nCONVERSACION:\n${conv}`,
    })) as J;
  }

  /** deja en el lead lo que la IA entendió (nunca pisa una próxima acción puesta a mano) */
  async aplicar(id: string, j: J) {
    const b = (j.busqueda || {}) as J;
    const n = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    await this.leads.cambiar(id, (d, l) => {
      d.busqueda = {
        operacion: ['arriendo', 'venta'].includes(b.operacion) ? b.operacion : null,
        tipo: b.tipo || null,
        comunas: (Array.isArray(b.comunas) ? b.comunas : []).map(String).filter(Boolean).slice(0, 8),
        presupuesto:
          b.presupuesto && n(b.presupuesto.valor)
            ? { valor: n(b.presupuesto.valor), moneda: b.presupuesto.moneda === 'UF' ? 'UF' : 'CLP' }
            : null,
        dormitorios: n(b.dormitorios),
        banos: n(b.banos),
        estacionamiento: typeof b.estacionamiento === 'boolean' ? b.estacionamiento : null,
        mascotas: typeof b.mascotas === 'boolean' ? b.mascotas : null,
        plazo: b.plazo ? String(b.plazo).slice(0, 80) : null,
        otros: (Array.isArray(b.otros) ? b.otros : []).map(String).slice(0, 8),
      };
      d.resumen = String(j.resumen || '').slice(0, 400);
      const cols: Prisma.LeadUpdateManyMutationInput = {};
      if (j.email && !d.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(j.email)) {
        d.email = j.email;
        cols.email = String(j.email).toLowerCase();
      }
      if (j.rut && !d.rut) d.rut = String(j.rut).slice(0, 14);
      if (j.telefono && !d.telefono && telNorm(j.telefono)) {
        d.telefono = String(j.telefono).trim().slice(0, 20);
        if (!l.telefonoNorm) cols.telefonoNorm = telNorm(j.telefono);
      }
      if (j.perfil) d.perfil = String(j.perfil).slice(0, 500);
      if (
        l.estado === 'nuevo' &&
        ['contactado', 'visita', 'negociando', 'ganado', 'perdido'].includes(j.estadoSugerido)
      )
        cols.estado = j.estadoSugerido;
      if (j.proximaAccion?.texto && !d.proximaAccion?.manual)
        d.proximaAccion = {
          texto: String(j.proximaAccion.texto).slice(0, 160),
          fecha: /^\d{4}-\d{2}-\d{2}$/.test(j.proximaAccion.fecha || '') ? j.proximaAccion.fecha : null,
        };
      d.analizado = new Date().toISOString();
      d.actualizado = d.analizado;
      return { datos: d, cols };
    });
  }
}
