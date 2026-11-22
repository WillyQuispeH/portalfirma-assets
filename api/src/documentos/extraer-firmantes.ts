// Extraer quién firma un documento (PDF normal o escaneado): función propia de Asset, sin Portalfirma. La IA (Claude, que lee el texto y
// también las imágenes de un PDF escaneado) busca las partes y sus bloques de firma y PROPONE la lista; no envía nada: la app se la muestra
// al corredor para que la revise y corrija antes de enviar a firmar.
//  · POST /v1/firmas-envio/firmantes  { pdf (base64) }  →  { legible, escaneado, tipoDocumento, firmantes: [{ nombre, rut, rutValido,
//    rol, email, telefono, pagina }], avisos }
// `pagina` (desde 1) es donde está su línea de firma: con ella la ventana «Ubicar las firmas» parte cerca de su lugar. Cada lectura queda
// en ia_consumo con uso «firmantes:lectura» (se cobra a la corredora, como el resto de la IA).
import { BadRequestException, Body, Controller, HttpCode, Injectable, Post } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { IaService } from '../whatsapp/ia';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { ZodPipe } from '../comun/zod.pipe';
import { formatearRut, limpiarRut, rutValido } from '../comun/texto';

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_FIRMANTES = 20;

const SISTEMA = `Eres un asistente de una corredora de propiedades en Chile. Recibes un documento (contrato, mandato, promesa, carta oferta, acta, poder…), en PDF con texto o escaneado, y tienes que decir QUIÉNES DEBEN FIRMARLO: las personas que aparecen como partes o comparecientes y tienen su línea o bloque de firma. Responde con este JSON:
{
 "legible": true|false (false si el documento no se puede leer o no es un documento con firmas),
 "escaneado": true|false (true si es una imagen escaneada o foto, sin texto seleccionable),
 "tipoDocumento": "qué documento es, en pocas palabras (ej. «Contrato de arriendo», «Mandato de venta»)",
 "firmantes": [{
   "nombre": "nombre completo de la PERSONA que firma",
   "rut": "su RUT tal como aparece (ej. «12.345.678-9»), o vacío",
   "rol": "su calidad en el documento, en minúscula y específica: arrendador, arrendatario, codeudor solidario, aval, comprador, vendedor, mandante, mandatario, promitente comprador, promitente vendedor, oferente, representante legal, testigo, propietario, visitante…",
   "email": "su correo si aparece, o vacío",
   "telefono": "su teléfono si aparece, o vacío",
   "pagina": número de la página (desde 1) donde está su línea de firma, o 0 si no se ve
 }],
 "avisos": ["cada duda importante en una frase corta (ej. «El documento no trae el RUT de uno de los firmantes»)"]
}
Reglas: si una parte es una EMPRESA, el firmante es la persona que firma por ella (su representante), con su rol «representante legal» y el nombre de la empresa en el aviso si hace falta; nunca pongas la empresa como firmante. Si una persona figura dos veces, una sola vez. No incluyas a notarios ni a quien solo redacta o autoriza, salvo que tengan línea de firma como parte. No inventes datos: lo que no aparece va vacío. Si no hay línea de firma pero sí partes claras, lista las partes y avísalo. Máximo ${MAX_FIRMANTES} firmantes. No incluyas texto fuera del JSON.`;

const pedidoEsquema = z.object({ pdf: z.string().min(100).max(40_000_000) });

const t = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
/** un celular o teléfono con su forma habitual; lo que no parece teléfono se descarta */
const telefonoDe = (v: unknown) => {
  const s = t(v).replace(/[^\d+]/g, '');
  const d = s.replace(/\D/g, '');
  return d.length >= 8 && d.length <= 13 ? s : '';
};

export interface FirmanteExtraido {
  nombre: string;
  rut: string;
  rutValido: boolean;
  rol: string;
  email: string;
  telefono: string;
  pagina: number;
}

@Injectable()
export class ExtraerFirmantesService {
  constructor(private readonly ia: IaService) {}

  async extraer(u: UsuarioToken, pdfBase64: string) {
    const buf = Buffer.from(pdfBase64.replace(/^data:[^,]*,/, ''), 'base64');
    if (buf.subarray(0, 4).toString() !== '%PDF') throw new BadRequestException('El archivo no es un PDF.');
    if (buf.length > MAX_BYTES) throw new BadRequestException('El PDF pesa más de 20 MB.');
    let j: Record<string, unknown>;
    try {
      j = await this.ia.leerDocumento({
        corredoraId: u.corredoraId,
        uso: 'firmantes:lectura',
        sistema: SISTEMA,
        contenido: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } },
          { type: 'text', text: 'Indica quiénes firman este documento y devuelve el JSON pedido.' },
        ] as Anthropic.Beta.BetaContentBlockParam[],
      });
    } catch (e) {
      throw new BadRequestException(`No pude leer el documento con la IA: ${(e as Error).message}`);
    }
    const avisos = (Array.isArray(j.avisos) ? j.avisos : []).map(t).filter(Boolean).slice(0, 8);
    const vistos = new Set<string>();
    const firmantes: FirmanteExtraido[] = [];
    for (const f of (Array.isArray(j.firmantes) ? j.firmantes : []) as Record<string, unknown>[]) {
      const nombre = t(f?.nombre).replace(/\s+/g, ' ');
      if (!nombre) continue;
      const rutCrudo = t(f?.rut);
      const limpio = limpiarRut(rutCrudo);
      const llave = limpio.length >= 2 ? limpio : nombre.toLowerCase();
      if (vistos.has(llave)) continue;
      vistos.add(llave);
      const email = t(f?.email).toLowerCase();
      const pagina = Math.trunc(Number(f?.pagina));
      firmantes.push({
        nombre: nombre.slice(0, 160),
        rut: limpio.length >= 2 ? formatearRut(limpio) : '',
        rutValido: limpio.length >= 2 && rutValido(limpio),
        rol: t(f?.rol).toLowerCase().slice(0, 80),
        email: emailOk(email) ? email.slice(0, 160) : '',
        telefono: telefonoDe(f?.telefono),
        pagina: Number.isFinite(pagina) && pagina > 0 && pagina < 1000 ? pagina : 0,
      });
      if (firmantes.length >= MAX_FIRMANTES) break;
    }
    // avisos propios, aparte de los de la IA: lo que impide enviar
    for (const f of firmantes) {
      if (f.rut && !f.rutValido) avisos.push(`El RUT de ${f.nombre} (${f.rut}) no es válido: revísalo.`);
      else if (!f.rut) avisos.push(`Falta el RUT de ${f.nombre}.`);
      if (!f.rol) avisos.push(`Falta el rol de ${f.nombre} en el documento.`);
    }
    return {
      legible: j.legible !== false,
      escaneado: j.escaneado === true,
      tipoDocumento: t(j.tipoDocumento).slice(0, 120),
      firmantes,
      avisos: [...new Set(avisos)].slice(0, 20),
    };
  }
}

@Controller('firmas-envio')
export class ExtraerFirmantesController {
  constructor(private readonly s: ExtraerFirmantesService) {}

  @Post('firmantes')
  @HttpCode(200)
  extraer(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(pedidoEsquema)) b: z.infer<typeof pedidoEsquema>) {
    return this.s.extraer(u, b.pdf);
  }
}
