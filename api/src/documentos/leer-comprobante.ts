// Leer un COMPROBANTE DE PAGO (transferencia, depósito, boleta, vale vista…; PDF o foto): la IA saca monto, moneda, fecha, medio y referencia. No
// registra nada: el asistente de WhatsApp se lo muestra al ejecutivo y pregunta solo lo que el comprobante no trae.
//  · POST /v1/documentos/comprobante  { archivo (base64), mime }  →  { esComprobante, monto, moneda, fecha, medio, banco, referencia, emisor,
//    destinatario, concepto, avisos }
// Cada lectura queda en ia_consumo con uso «comprobante:lectura» (se cobra a la corredora, como el resto de la IA).
import { BadRequestException, Body, Controller, HttpCode, Injectable, Post } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { IaService } from '../whatsapp/ia';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { ZodPipe } from '../comun/zod.pipe';

const MAX_BYTES = 15 * 1024 * 1024;

const SISTEMA = `Eres un asistente de una corredora de propiedades en Chile. Recibes un COMPROBANTE DE PAGO (comprobante de transferencia de un banco chileno como BancoEstado, Santander, Banco de Chile, BCI, Itaú, Scotiabank, Falabella, Mercado Pago; un depósito; una boleta o recibo; un vale vista o un cheque), en PDF o foto, y extraes sus datos. Responde con este JSON:
{
 "esComprobante": true|false (false si el documento no es un comprobante de pago o no se puede leer),
 "monto": número del monto pagado SIN puntos ni símbolos (ej. 450000 o 12.5), o null si no se ve,
 "moneda": "CLP" | "UF" | "USD" | null (el símbolo «$» en un banco chileno es CLP; si no se ve, null),
 "fecha": "AAAA-MM-DD" de la fecha del pago (en Chile se escribe día/mes/año: «12/11/2026» es 2026-11-12), o null,
 "medio": "transferencia" | "deposito" | "efectivo" | "cheque" | "tarjeta" | "otro" | null,
 "banco": "banco o servicio que emite el comprobante, o vacío",
 "referencia": "número de operación, folio o código de transacción, o vacío",
 "emisor": "quien pagó (nombre) si aparece, o vacío",
 "destinatario": "quien recibió el pago (nombre, y su RUT si aparece), o vacío",
 "concepto": "el comentario o glosa del pago si aparece, o vacío",
 "avisos": ["cada duda importante en una frase corta (ej. «No se alcanza a leer la fecha»)"]
}
Reglas: no inventes ningún dato; lo que no aparece va null o vacío. Si hay varios montos (comisión, total, abono), usa el monto principal pagado y avisa. No incluyas texto fuera del JSON.`;

const pedidoEsquema = z.object({
  archivo: z.string().min(100).max(22_000_000),
  mime: z.string().max(80).default('application/pdf'),
});

const t = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');
const MEDIOS = new Set(['transferencia', 'deposito', 'efectivo', 'cheque', 'tarjeta', 'otro']);

export interface ComprobanteLeido {
  esComprobante: boolean;
  monto: number | null;
  moneda: 'CLP' | 'UF' | 'USD' | null;
  fecha: string | null;
  medio: string | null;
  banco: string;
  referencia: string;
  emisor: string;
  destinatario: string;
  concepto: string;
  avisos: string[];
}

@Injectable()
export class LeerComprobanteService {
  constructor(private readonly ia: IaService) {}

  async leer(u: UsuarioToken, archivoBase64: string, mime: string): Promise<ComprobanteLeido> {
    const buf = Buffer.from(archivoBase64.replace(/^data:[^,]*,/, ''), 'base64');
    if (buf.length > MAX_BYTES) throw new BadRequestException('El archivo pesa más de 15 MB.');
    const esPdf = buf.subarray(0, 4).toString() === '%PDF';
    const tipoImg = /png/i.test(mime) ? 'image/png' : /webp/i.test(mime) ? 'image/webp' : /gif/i.test(mime) ? 'image/gif' : 'image/jpeg';
    if (!esPdf && !/^image\//i.test(mime)) throw new BadRequestException('El comprobante tiene que ser un PDF o una imagen.');
    let j: Record<string, unknown>;
    try {
      j = await this.ia.leerDocumento({
        corredoraId: u.corredoraId,
        uso: 'comprobante:lectura',
        sistema: SISTEMA,
        contenido: [
          esPdf
            ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } }
            : { type: 'image', source: { type: 'base64', media_type: tipoImg, data: buf.toString('base64') } },
          { type: 'text', text: 'Lee este comprobante de pago y devuelve el JSON pedido.' },
        ] as Anthropic.Beta.BetaContentBlockParam[],
      });
    } catch (e) {
      throw new BadRequestException(`No pude leer el comprobante con la IA: ${(e as Error).message}`);
    }
    const montoN = Number(String(j.monto ?? '').replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
    const monto = Number.isFinite(montoN) && montoN > 0 && montoN < 1e12 ? montoN : null;
    const moneda = ['CLP', 'UF', 'USD'].includes(t(j.moneda).toUpperCase()) ? (t(j.moneda).toUpperCase() as 'CLP' | 'UF' | 'USD') : null;
    const f = t(j.fecha);
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(f) && !Number.isNaN(new Date(f + 'T12:00:00Z').getTime()) ? f : null;
    const medio = MEDIOS.has(t(j.medio).toLowerCase()) ? t(j.medio).toLowerCase() : null;
    const avisos = (Array.isArray(j.avisos) ? j.avisos : []).map(t).filter(Boolean).slice(0, 6);
    return {
      esComprobante: j.esComprobante !== false,
      monto,
      moneda,
      fecha,
      medio,
      banco: t(j.banco).slice(0, 80),
      referencia: t(j.referencia).slice(0, 80),
      emisor: t(j.emisor).slice(0, 120),
      destinatario: t(j.destinatario).slice(0, 160),
      concepto: t(j.concepto).slice(0, 200),
      avisos,
    };
  }
}

@Controller('documentos')
export class LeerComprobanteController {
  constructor(private readonly s: LeerComprobanteService) {}

  @Post('comprobante')
  @HttpCode(200)
  leer(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(pedidoEsquema)) b: z.infer<typeof pedidoEsquema>) {
    return this.s.leer(u, b.archivo, b.mime);
  }
}
