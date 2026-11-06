// IA del servidor (Claude, API de Anthropic con el SDK oficial) para los asistentes de WhatsApp: Sofía y Tomás
// (conversación con herramientas), el retoque de los mensajes de postventa y el análisis de leads del observador.
//  · La clave es de la plataforma: IA_CLAVE en el .env del servidor (la app nunca la ve). Sin ella, `disponible()` es
//    false y cada asistente hace lo suyo sin IA (avisar al corredor, enviar el texto sin retocar…).
//  · Cada llamada queda en ia_consumo (corredora, uso, modelo, tokens) para cobrarla después.
//  · Respaldo ante un rechazo de los filtros de seguridad: `fallbacks: "default"` (el servidor de Anthropic reintenta
//    con otro modelo dentro de la misma llamada).
//  · Fuera de producción, IA_URL apunta a otra dirección (las pruebas levantan una IA falsa).
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../prisma/prisma.service';
import type { Env } from '../config/env';

export interface HerramientaIa {
  name: string;
  description: string;
  input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
}
export interface TurnoIa {
  role: 'user' | 'assistant';
  content: string;
}
type Mensaje = Anthropic.Beta.BetaMessageParam;

export class SinIaError extends Error {
  constructor() {
    super('La IA del servidor no está configurada (IA_CLAVE).');
  }
}

@Injectable()
export class IaService {
  private readonly log = new Logger('IA');
  private readonly cliente: Anthropic | null;
  private readonly modelo: string;
  private readonly prod: boolean;
  /** solo fuera de producción: IA falsa de una corredora de prueba (wechatia de prueba con datos.iaBase) */
  private readonly deprueba = new Map<string, Anthropic>();

  constructor(
    private readonly db: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    const clave = config.get('IA_CLAVE', { infer: true });
    const url = config.get('IA_URL', { infer: true });
    this.prod = config.get('NODE_ENV', { infer: true }) === 'production';
    this.modelo = config.get('IA_MODELO', { infer: true });
    this.cliente = clave
      ? new Anthropic({ apiKey: clave, maxRetries: 2, timeout: 90_000, ...(url && !this.prod ? { baseURL: url } : {}) })
      : null;
  }

  private async clienteDe(corredoraId: string): Promise<Anthropic | null> {
    if (!this.prod) {
      const c = await this.db.conexion.findFirst({
        where: { corredoraId, proveedor: 'wechatia', dueno: 'corredora' },
        select: { datos: true },
      });
      const base = (c?.datos as { iaBase?: string } | null)?.iaBase;
      if (base) {
        if (!this.deprueba.has(base))
          this.deprueba.set(base, new Anthropic({ apiKey: 'prueba', baseURL: base, maxRetries: 0 }));
        return this.deprueba.get(base)!;
      }
    }
    return this.cliente;
  }

  /** ¿hay IA para esta corredora? */
  async disponible(corredoraId: string) {
    return !!(await this.clienteDe(corredoraId));
  }

  private async llamar(
    corredoraId: string,
    uso: string,
    p: Omit<Anthropic.Beta.MessageCreateParamsNonStreaming, 'model' | 'betas' | 'fallbacks'>,
  ) {
    const cliente = await this.clienteDe(corredoraId);
    if (!cliente) throw new SinIaError();
    const r = await cliente.beta.messages.create({
      model: this.modelo,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      ...p,
    } as Anthropic.Beta.MessageCreateParamsNonStreaming);
    await this.db.iaConsumo
      .create({
        data: {
          corredoraId,
          uso,
          modelo: String(r.model || this.modelo).slice(0, 80),
          entrada: r.usage?.input_tokens ?? 0,
          salida: r.usage?.output_tokens ?? 0,
        },
      })
      .catch((e: Error) => this.log.warn(`consumo: ${e.message}`));
    return r;
  }

  private texto(r: Anthropic.Beta.BetaMessage) {
    return r.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
  }

  /**
   * Una conversación con herramientas: la IA puede llamar varias veces a `ejecutar` (hasta `vueltas`) antes de
   * responder. Devuelve el texto final ('' si no respondió nada).
   */
  async conversar(o: {
    corredoraId: string;
    uso: string;
    sistema: string;
    historial: TurnoIa[];
    herramientas: HerramientaIa[];
    ejecutar: (nombre: string, entrada: Record<string, unknown>) => Promise<unknown>;
    vueltas?: number;
  }): Promise<string> {
    const mensajes: Mensaje[] = o.historial.map((m) => ({ role: m.role, content: m.content }));
    for (let i = 0; i < (o.vueltas ?? 5); i++) {
      const r = await this.llamar(o.corredoraId, o.uso, {
        max_tokens: 4000,
        system: o.sistema,
        output_config: { effort: 'low' },
        tools: o.herramientas,
        messages: mensajes,
      });
      if (r.stop_reason === 'refusal') return '';
      const usos = r.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
      if (r.stop_reason !== 'tool_use' || !usos.length) return this.texto(r);
      mensajes.push({ role: 'assistant', content: r.content as Anthropic.Beta.BetaContentBlockParam[] });
      const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const u of usos) {
        let salida: unknown;
        let error = false;
        try {
          salida = await o.ejecutar(u.name, (u.input ?? {}) as Record<string, unknown>);
        } catch (e) {
          salida = { error: (e as Error).message };
          error = true;
        }
        resultados.push({
          type: 'tool_result',
          tool_use_id: u.id,
          content: JSON.stringify(salida ?? null).slice(0, 6000),
          ...(error ? { is_error: true } : {}),
        });
      }
      mensajes.push({ role: 'user', content: resultados });
    }
    return '';
  }

  /** Un pedido que devuelve un objeto JSON (análisis de un lead). */
  async json(o: {
    corredoraId: string;
    uso: string;
    sistema: string;
    usuario: string;
  }): Promise<Record<string, unknown>> {
    const r = await this.llamar(o.corredoraId, o.uso, {
      max_tokens: 4000,
      system: o.sistema + '\nResponde SOLO con un objeto JSON válido, sin texto antes ni después.',
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: o.usuario }],
    });
    const t = this.texto(r)
      .replace(/^```(json)?|```$/g, '')
      .trim();
    const j = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)) as unknown;
    if (!j || typeof j !== 'object') throw new Error('La IA no devolvió un objeto.');
    return j as Record<string, unknown>;
  }

  /** Un texto corto (reescribir un mensaje), con tiempo máximo: si tarda, lanza y se usa el texto original. */
  async redactar(o: { corredoraId: string; uso: string; sistema: string; usuario: string; ms?: number }) {
    let reloj: NodeJS.Timeout | undefined;
    const tope = new Promise<never>((_, rej) => {
      reloj = setTimeout(() => rej(new Error('tiempo')), o.ms ?? 8000);
    });
    try {
      const r = await Promise.race([
        this.llamar(o.corredoraId, o.uso, {
          max_tokens: 1000,
          system: o.sistema,
          output_config: { effort: 'low' },
          messages: [{ role: 'user', content: o.usuario }],
        }),
        tope,
      ]);
      return this.texto(r);
    } finally {
      clearTimeout(reloj);
    }
  }
}
