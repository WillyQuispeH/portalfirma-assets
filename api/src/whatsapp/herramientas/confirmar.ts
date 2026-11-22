// Confirmación en dos pasos de las herramientas que COBRAN o ENVÍAN algo a terceros (enviar a firmar, mandar el contrato a revisión, reenviar
// un enlace de firma). La exige el SERVIDOR y no solo la IA, igual que la orden de visita (../orden-visita.ts):
//   1. la herramienta ARMA el documento y deja anotado qué se le mostró al corredor (`preparar`);
//   2. con `confirmado: true` solo avanza si lo preparado es lo mismo (misma huella de los datos), se preparó hace menos de 15 minutos y el
//      último mensaje del corredor es un «sí» puro (`exigir`). Se ejecuta con los argumentos de la preparación (el modelo no los recuerda bien).
import { createHash } from 'crypto';
import { asiente } from '../orden-visita';
import type { CtxHerr } from './tipos';

const VIGENCIA_MS = 15 * 60_000;

export interface Pendiente {
  /** la herramienta que lo ejecuta (enviar_mandato…) */
  herramienta: string;
  /** a qué documento o firma se refiere (id de la propiedad, el negocio o la operación) */
  ref: string;
  /** huella de lo que se le mostró al corredor */
  clave: string;
  en: number;
  args: Record<string, unknown>;
}

export const huellaDe = (v: unknown) => createHash('sha1').update(JSON.stringify(v)).digest('hex');

export class Confirmaciones {
  private readonly pendientes = new Map<string, Pendiente>();

  /** deja anotado lo que se preparó y se le muestra al corredor (reemplaza lo anterior de ese usuario) */
  preparar(c: CtxHerr, herramienta: string, ref: string, datos: unknown, args: Record<string, unknown>) {
    this.pendientes.set(c.usuarioId, { herramienta, ref, clave: huellaDe(datos), en: Date.now(), args: { ...args, confirmado: false } });
    if (this.pendientes.size > 500) for (const k of this.pendientes.keys()) { this.pendientes.delete(k); break; }
  }

  /** lo preparado por esta herramienta, si sigue vigente y el corredor dijo que sí; si no, el error para la IA */
  exigir(c: CtxHerr, herramienta: string): { error: string } | { pend: Pendiente } {
    const p = this.pendientes.get(c.usuarioId);
    if (!p || p.herramienta !== herramienta || Date.now() - p.en > VIGENCIA_MS)
      return {
        error: `Primero hay que preparar el documento y mostrarle al corredor los datos (llama primero la herramienta de preparar, o esta misma sin confirmado). No hay nada preparado para esto o venció (15 minutos).`,
      };
    if (!asiente(c.texto))
      return {
        error:
          'El corredor todavía no confirmó: pregúntale si lo envías y espera su sí. Si pidió un cambio, prepáralo de nuevo con el cambio.',
      };
    return { pend: p };
  }

  /** ¿lo que hay ahora es lo mismo que se le mostró? */
  igual(p: Pendiente, datos: unknown) {
    return p.clave === huellaDe(datos);
  }

  /** ya se usó: un segundo «sí» no lo repite */
  usar(c: CtxHerr) {
    this.pendientes.delete(c.usuarioId);
  }
}
