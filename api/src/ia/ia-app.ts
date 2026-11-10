// IA de la app de escritorio a través del servidor: la clave de Claude vive solo aquí (IA_CLAVE) y la app nunca la ve.
// Antes cada computador llevaba una clave incluida en el instalador (build/ia/clave.bin) o la ponía el administrador.
//  · POST /v1/ia/mensajes   un mensaje a Claude en el formato de la API de Anthropic ({ tarea, system, messages,
//                           tools?, max_tokens? }). El modelo lo elige el servidor según la tarea:
//                             agente     → IA_MODELO_APP (Sonnet), sin razonar entre herramientas (encadena rápido);
//                             documento  → IA_MODELO_APP, razonamiento medio (leer y revisar documentos);
//                             corto      → IA_MODELO_CORTO (Haiku), esfuerzo bajo (retocar un WhatsApp).
//                           Devuelve el mensaje tal cual (content, stop_reason, usage, model).
//  · GET  /v1/ia/estado     si hay IA, qué modelos usa cada tarea y si el dictado puede transcribir.
//  · POST /v1/ia/transcribir  { audio (base64), mime }: audio → { texto, crudo, avisos } (TranscripcionService). Claude no
//                           transcribe audio: usa la transcripción de OpenAI (OPENAI_CLAVE); sin ella responde 503.
// Cada llamada queda en ia_consumo con uso «app:<tarea>» (IaService), para cobrarla a la corredora.
/* eslint-disable @typescript-eslint/no-unsafe-assignment -- los mensajes y herramientas llegan en el formato de la API
   de Anthropic y se pasan tal cual al SDK, que los valida */
import {
  Body,
  Controller,
  Get,
  HttpException,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { IaService, SinIaError } from '../whatsapp/ia';
import { TranscripcionService } from './transcripcion';
import type { Env } from '../config/env';

type Tarea = 'agente' | 'documento' | 'corto';

const mensajeEsquema = z.object({
  tarea: z.enum(['agente', 'documento', 'corto']),
  system: z.string().max(200_000).default(''),
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.any() }))
    .min(1)
    .max(400),
  tools: z
    .array(
      z.object({ name: z.string().max(128), description: z.string().max(10_000).default(''), input_schema: z.any() }),
    )
    .max(128)
    .optional(),
  max_tokens: z.number().int().min(1).max(16_000).optional(),
});

const transcribirEsquema = z.object({
  audio: z.string().min(2000).max(30_000_000),
  mime: z.string().max(80).default('audio/webm'),
});

@Controller('ia')
export class IaAppController {
  private readonly modelos: Record<Tarea, string>;

  constructor(
    private readonly ia: IaService,
    private readonly transcripcion: TranscripcionService,
    config: ConfigService<Env, true>,
  ) {
    const app = config.get('IA_MODELO_APP', { infer: true });
    this.modelos = { agente: app, documento: app, corto: config.get('IA_MODELO_CORTO', { infer: true }) };
  }

  @Get('estado')
  async estado(@UsuarioActual() u: UsuarioToken) {
    return { disponible: await this.ia.disponible(u.corredoraId), modelos: this.modelos, transcribir: await this.transcripcion.disponible(u.corredoraId) };
  }

  @Post('mensajes')
  async mensajes(
    @UsuarioActual() u: UsuarioToken,
    @Body(new ZodPipe(mensajeEsquema)) b: z.infer<typeof mensajeEsquema>,
  ) {
    const ajustes: Record<Tarea, Partial<Anthropic.Beta.MessageCreateParamsNonStreaming>> = {
      // el agente encadena herramientas (buscar → crear → agendar): sin razonar entre una y otra, como antes con
      // «razonamiento mínimo»; así tampoco hay bloques de razonamiento que devolver en cada vuelta
      agente: { thinking: { type: 'between_tools' }, output_config: { effort: 'medium' } },
      documento: { output_config: { effort: 'medium' } },
      corto: { output_config: { effort: 'low' } },
    };
    try {
      const r = await this.ia.mensaje(u.corredoraId, `app:${b.tarea}`, this.modelos[b.tarea], {
        max_tokens: b.max_tokens ?? (b.tarea === 'corto' ? 1000 : 8000),
        ...(b.system ? { system: b.system } : {}),
        messages: b.messages as Anthropic.Beta.BetaMessageParam[],
        ...(b.tools?.length ? { tools: b.tools as Anthropic.Beta.BetaTool[] } : {}),
        ...ajustes[b.tarea],
      });
      return { model: r.model, content: r.content, stop_reason: r.stop_reason, usage: r.usage };
    } catch (e) {
      if (e instanceof SinIaError) throw new ServiceUnavailableException({ message: e.message, codigo: 'SIN_IA' });
      // errores de la API de Anthropic: se devuelven con su estado (429 sin saldo o límite, 400 mensaje inválido…)
      const st = (e as { status?: number }).status;
      if (st && st >= 400 && st < 600)
        throw new HttpException(
          { message: `La IA respondió con error ${st}: ${(e as Error).message}`, codigo: 'IA_ERROR' },
          st === 401 ? 502 : st,
        );
      throw e;
    }
  }

  @Post('transcribir')
  async transcribir(
    @UsuarioActual() u: UsuarioToken,
    @Body(new ZodPipe(transcribirEsquema)) b: z.infer<typeof transcribirEsquema>,
  ) {
    // { texto (ya normalizado), crudo, avisos }: ver transcripcion.ts
    return this.transcripcion.transcribir(u.corredoraId, Buffer.from(b.audio, 'base64'), b.mime);
  }
}
