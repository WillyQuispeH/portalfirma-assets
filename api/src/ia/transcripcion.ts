// Audio → texto, compartido por el dictado de la app (POST /v1/ia/transcribir) y los audios de WhatsApp que atiende el
// servidor. Claude no transcribe audio: se usa la transcripción de OpenAI (OPENAI_CLAVE).
//
// Afinado con audios de prueba (notas de voz en opus a 16 kbps con ruido; ver api/test/transcripcion-unit.js):
//  · gpt-4o-mini-transcribe con un prompt de VOCABULARIO (equipo, términos del negocio, comunas y calles de la cartera)
//    sube de 89 % a 95-96 % los datos bien transcritos frente al prompt anterior; gpt-4o-transcribe no mejora y
//    whisper-1 entiende «guion» como «WIA» (solo queda de respaldo).
//  · El prompt NO lleva cifras de ejemplo: el modelo las copiaba en la transcripción (un teléfono inventado).
//  · Los números largos (RUT, teléfonos) a veces salen mal dichos en dígitos: se validan y se normalizan aquí, y si algo
//    no cuadra se devuelve un aviso para que el asistente pida confirmarlo en vez de guardarlo.
import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import type { Env } from '../config/env';

const MODELO = 'gpt-4o-mini-transcribe';
const MODELO_RESPALDO = 'whisper-1';
const BASE_OPENAI = 'https://api.openai.com/v1';
const MAX_AUDIO = 25 * 1024 * 1024;
const VOCAB_MS = 10 * 60_000;

const BASE =
  'Mensaje de voz de un corredor de propiedades en Chile a su equipo de asistentes: Pedro, Juanita, Diego, Fernanda, Sofía y Tomás. ' +
  'Habla de propiedades con código PF, departamentos, casas y oficinas, dormitorios, baños, metros cuadrados útiles y totales, ' +
  'precios en UF, pesos y lucas, gastos comunes, RUT, teléfono, visitas, órdenes de visita, mandatos, promesas, negocios y leads.';
const COMUNAS_BASE = [
  'Ñuñoa', 'Providencia', 'Las Condes', 'La Reina', 'Lo Barnechea', 'Vitacura', 'Santiago', 'Macul', 'San Miguel', 'Maipú', 'Peñalolén',
];
const REGLA = 'Transcribe literalmente lo que se dice, sin agregar datos que no se dijeron.';
// segunda pasada (solo si el RUT o el teléfono no cuadraron): los números de contacto con letras, que el modelo
// transcribe bien, y se convierten aquí sin errores
const REGLA_LETRAS = 'Escribe con letras los números de teléfono y los RUT, tal como se dicen.';

// ---------------------------------------------------------------- números en palabras (RUT dictado con palabras)
const UNIDADES: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiun: 21, veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
  veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30, cuarenta: 40, cincuenta: 50,
  sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100, ciento: 100, doscientos: 200, trescientos: 300,
  cuatrocientos: 400, quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900,
};
const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** «quince millones cuatrocientos treinta y dos mil ochocientos setenta y seis» → 15432876 (null si no es un número) */
export function palabrasANumero(palabras: string[]): number | null {
  let total = 0;
  let parcial = 0;
  let alguna = false;
  for (const w0 of palabras) {
    const w = sinTildes(w0);
    if (w === 'y') continue;
    if (w in UNIDADES) parcial += UNIDADES[w];
    else if (w === 'mil') {
      total += (parcial || 1) * 1000;
      parcial = 0;
    } else if (w === 'millon' || w === 'millones') {
      total += (parcial || 1) * 1_000_000;
      parcial = 0;
    } else return null;
    alguna = true;
  }
  return alguna ? total + parcial : null;
}

/** «nueve cuarenta y cuatro noventa y siete» → «9449 7»…: los grupos dichos de a uno o de a dos dígitos; null si no es así */
function digitosDePalabras(ws: string[]): string | null {
  let out = '';
  for (let i = 0; i < ws.length; i++) {
    const v = UNIDADES[ws[i]];
    if (ws[i] === 'y' || v == null || v >= 100) return null;
    if (v >= 30 && v % 10 === 0 && ws[i + 1] === 'y') {
      const u = UNIDADES[ws[i + 2] ?? ''];
      if (u == null || u < 1 || u > 9) return null;
      out += String(v + u);
      i += 2;
    } else out += String(v);
  }
  return out;
}

// ---------------------------------------------------------------- RUT, celulares y códigos
/** dígito verificador (módulo 11) */
export function dvRut(cuerpo: string) {
  let s = 0;
  let m = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    s += Number(cuerpo[i]) * m;
    m = m === 7 ? 2 : m + 1;
  }
  const d = 11 - (s % 11);
  return d === 11 ? '0' : d === 10 ? 'K' : String(d);
}
const puntos = (n: string) => n.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** celular chileno bien formado: «+56 9 XXXX XXXX» (9 dígitos que parten en 9, con o sin el 56); null si no lo es */
export function celularChileno(digitos: string) {
  const d = digitos.startsWith('56') && digitos.length === 11 ? digitos.slice(2) : digitos;
  return d.length === 9 && d[0] === '9' ? `+56 9 ${d.slice(1, 5)} ${d.slice(5)}` : null;
}

const DV_PALABRA: Record<string, string> = {
  cero: '0', uno: '1', dos: '2', tres: '3', cuatro: '4', cinco: '5', seis: '6', siete: '7', ocho: '8', nueve: '9', k: 'K', ka: 'K', kilo: 'K',
};

/**
 * Deja el texto transcrito en el formato que usa Asset y detecta lo que no cuadra:
 *  · «root/ruth» → RUT; RUT con puntos y guion (también si lo dijeron con palabras); dígito verificador validado;
 *  · celulares tras «teléfono / celular / fono / WhatsApp» con el formato +56 9 XXXX XXXX (o aviso si no es un celular);
 *  · códigos de propiedad «PF1002», «pf 1002» → «PF-1002» (según los prefijos de la corredora).
 */
export function normalizarTranscripcion(entrada: string, prefijos: string[] = ['PF']): { texto: string; avisos: string[] } {
  let t = String(entrada || '').trim();
  const avisos = new Set<string>();

  t = t.replace(/\b(?:root|ruth|rutt)\b(?=\s+(?:de|del|es|:|\d))/gi, 'RUT').replace(/\brut\b/gi, 'RUT');

  const rut = (cuerpoDigitos: string, dv: string) => {
    const cuerpo = cuerpoDigitos.replace(/\D/g, '');
    const f = `${puntos(cuerpo)}-${dv.toUpperCase()}`;
    if (cuerpo.length < 7 || cuerpo.length > 8 || dvRut(cuerpo) !== dv.toUpperCase())
      avisos.add(`El RUT ${f} que se escuchó no es válido (el dígito verificador no calza): pídele que lo confirme antes de usarlo.`);
    return f;
  };

  // RUT dicho con palabras: «quince millones … ochocientos setenta y seis guion nueve»
  t = t.replace(/((?:[a-záéíóúñ]+\s+){0,14}?[a-záéíóúñ]+)\s+gui[oó]n\s+([a-z]+|\d|[kK])\b/gi, (todo, antes: string, dvTxt: string) => {
    const dv = /^\d$/.test(dvTxt) ? dvTxt : DV_PALABRA[sinTildes(dvTxt)];
    if (!dv) return todo;
    const ws = antes.trim().split(/\s+/);
    for (let n = Math.min(ws.length, 12); n >= 2; n--) {
      const num = palabrasANumero(ws.slice(-n));
      if (num != null && num >= 1_000_000 && num <= 99_999_999)
        return `${ws.slice(0, ws.length - n).join(' ')}${ws.length > n ? ' ' : ''}${rut(String(num), dv)}`;
    }
    return todo;
  });
  // RUT en dígitos (con puntos, espacios o pegado) y guion
  t = t.replace(/\b(\d{1,2}(?:[.\s]?\d{3}){2})\s*[-–—]\s*([\dkK])\b/g, (_m, cuerpo: string, dv: string) => rut(cuerpo, dv));

  // celulares dichos con palabras después de la palabra que los anuncia («celular nueve ochenta y uno veintitrés …»)
  const aviso = /\b(?:tel[eé]fono|celular|fono|m[oó]vil|whatsapp|wasap|n[uú]mero de (?:contacto|tel[eé]fono|celular))\b(?:\s+(?:es|era)|:)?\s+/gi;
  const cambios: [number, number, string][] = [];
  for (let m = aviso.exec(t); m; m = aviso.exec(t)) {
    const ini = m.index + m[0].length;
    const resto = t.slice(ini);
    const ws: string[] = [];
    let fin = 0;
    for (const tk of resto.matchAll(/[A-Za-zÁÉÍÓÚáéíóúÑñ]+/g)) {
      const w = sinTildes(tk[0]);
      const hueco = resto.slice(fin, tk.index);
      if (ws.length ? !/^[\s,]+$/.test(hueco) : tk.index !== 0) break;
      if (!(w in UNIDADES) && w !== 'y') break;
      ws.push(w);
      fin = tk.index + tk[0].length;
    }
    while (ws.length && ws[ws.length - 1] === 'y') {
      ws.pop();
      fin = resto.lastIndexOf('y', fin - 1);
    }
    const dig = ws.length >= 4 ? digitosDePalabras(ws) : null;
    if (dig && celularChileno(dig)) cambios.push([ini, ini + fin, dig]);
    else if (dig)
      avisos.add(`El teléfono que se escuchó (${dig}) no tiene el largo de un celular chileno (9 dígitos que parten en 9): pídele que lo confirme antes de usarlo.`);
  }
  for (const [d, h, x] of cambios.reverse()) t = t.slice(0, d) + x + t.slice(h);

  // celulares después de la palabra que los anuncia
  t = t.replace(
    /(\b(?:tel[eé]fono|celular|fono|m[oó]vil|whatsapp|wasap|n[uú]mero de (?:contacto|tel[eé]fono|celular))\b(?:\s+(?:es|era|:)|:)?\s*)(\+?\d[\d\s.\-()]{6,17}\d)/gi,
    (todo, previo: string, numero: string) => {
      const bien = celularChileno(numero.replace(/\D/g, ''));
      if (bien) return previo + bien;
      avisos.add(`El teléfono «${numero.trim()}» no tiene el largo de un celular chileno (9 dígitos que parten en 9): pídele que lo confirme antes de usarlo.`);
      return todo;
    },
  );

  // códigos de propiedad
  for (const p of prefijos) {
    if (!/^[A-Z]{2,4}$/.test(p) || p === 'UF') continue;
    t = t.replace(new RegExp(`\\b(${p})[\\s-]?(\\d{3,6})\\b`, 'gi'), (_m, pre: string, n: string) => `${pre.toUpperCase()}-${n}`);
  }
  return { texto: t, avisos: [...avisos] };
}

// ---------------------------------------------------------------- servicio
@Injectable()
export class TranscripcionService {
  private readonly log = new Logger('Transcripcion');
  private readonly openai?: string;
  private readonly prod: boolean;
  private readonly vocab = new Map<string, { en: number; prompt: string; prefijos: string[] }>();

  constructor(
    private readonly db: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.openai = config.get('OPENAI_CLAVE', { infer: true });
    this.prod = config.get('NODE_ENV', { infer: true }) === 'production';
  }

  /** la base de la API de transcripción: la de OpenAI; fuera de producción, la falsa de una corredora de prueba */
  private async base(corredoraId: string) {
    if (!this.prod) {
      const c = await this.db.conexion.findFirst({
        where: { corredoraId, proveedor: 'wechatia', dueno: 'corredora' },
        select: { datos: true },
      });
      const b = (c?.datos as { transcribirBase?: string } | null)?.transcribirBase;
      if (b) return { url: b, clave: 'prueba' };
    }
    return this.openai ? { url: BASE_OPENAI, clave: this.openai } : null;
  }

  async disponible(corredoraId: string) {
    return !!(await this.base(corredoraId));
  }

  /** el vocabulario propio de la corredora: comunas y calles de su cartera, su equipo y los prefijos de sus códigos */
  private async vocabulario(corredoraId: string) {
    const c = this.vocab.get(corredoraId);
    if (c && Date.now() - c.en < VOCAB_MS) return c;
    const [props, usuarios] = await Promise.all([
      this.db.propiedad.findMany({
        where: { corredoraId, eliminadoEn: null },
        select: { codigo: true, direccion: true, comuna: true },
        orderBy: { actualizadoEn: 'desc' },
        take: 300,
      }),
      this.db.usuario.findMany({ where: { corredoraId, activo: true }, select: { nombre: true }, take: 30 }),
    ]);
    const unicos = (l: (string | null | undefined)[], max: number) => [...new Set(l.map((x) => (x ?? '').trim()).filter(Boolean))].slice(0, max);
    const comunas = unicos([...COMUNAS_BASE, ...props.map((p) => p.comuna)], 30);
    const calles = unicos(
      props.map((p) => /^\s*(?:(?:av(?:enida|\.)?|calle|pasaje|psje\.?)\s+)?([^\d,]{4,}?)\s*(?:\d|,|$)/i.exec(p.direccion ?? '')?.[1]),
      25,
    );
    const equipo = unicos(usuarios.map((u) => u.nombre.split(/\s+/)[0]), 15);
    const prefijos = unicos(
      [...props.map((p) => /^([A-Za-z]{2,4})-/.exec(p.codigo)?.[1]?.toUpperCase()), 'PF'],
      6,
    ) as string[];
    const prompt = [
      BASE,
      `Comunas: ${comunas.join(', ')}.`,
      calles.length ? `Calles: ${calles.join(', ')}.` : '',
      equipo.length ? `Corredores: ${equipo.join(', ')}.` : '',
      REGLA,
    ]
      .filter(Boolean)
      .join(' ');
    const r = { en: Date.now(), prompt, prefijos };
    this.vocab.set(corredoraId, r);
    return r;
  }

  private async pedir(base: { url: string; clave: string }, modelo: string, audio: Buffer, mime: string, prompt: string) {
    const ext = /mp4|m4a/.test(mime) ? 'm4a' : /ogg|opus/.test(mime) ? 'ogg' : /wav/.test(mime) ? 'wav' : /mpeg|mp3/.test(mime) ? 'mp3' : 'webm';
    const fd = new FormData();
    fd.append('file', new Blob([new Uint8Array(audio)], { type: mime }), 'audio.' + ext);
    fd.append('model', modelo);
    fd.append('language', 'es');
    fd.append('prompt', prompt);
    const r = await fetch(`${base.url}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${base.clave}` },
      body: fd,
      signal: AbortSignal.timeout(180_000),
    });
    const j = (await r.json().catch(() => ({}))) as { text?: string; error?: { message?: string } };
    if (!r.ok) throw Object.assign(new Error(j.error?.message || `HTTP ${r.status}`), { status: r.status });
    return String(j.text || '').trim();
  }

  /** audio → { texto (normalizado), crudo (lo que devolvió el modelo), avisos (datos que conviene confirmar) } */
  async transcribir(corredoraId: string, audio: Buffer, mime = 'audio/ogg') {
    const base = await this.base(corredoraId);
    if (!base)
      throw new ServiceUnavailableException({
        message: 'El dictado por voz no está disponible: escribe o pega la descripción.',
        codigo: 'SIN_TRANSCRIPCION',
      });
    const tipo = mime.split(';')[0] || 'audio/ogg';
    const v = await this.vocabulario(corredoraId);
    let crudo: string;
    try {
      crudo = await this.pedir(base, MODELO, audio, tipo, v.prompt);
    } catch (e) {
      if ((e as { status?: number }).status !== 404)
        throw new BadRequestException(`No se pudo transcribir el audio: ${(e as Error).message}`);
      try {
        crudo = await this.pedir(base, MODELO_RESPALDO, audio, tipo, v.prompt);
      } catch (e2) {
        throw new BadRequestException(`No se pudo transcribir el audio: ${(e2 as Error).message}`);
      }
    }
    let { texto, avisos } = normalizarTranscripcion(crudo, v.prefijos);
    let reintento = false;
    if (avisos.length) {
      // el modelo a veces escribe mal los números largos en dígitos: se vuelve a pedir con esos números en letras
      try {
        const otro = normalizarTranscripcion(await this.pedir(base, MODELO, audio, tipo, `${v.prompt} ${REGLA_LETRAS}`), v.prefijos);
        if (otro.avisos.length < avisos.length) {
          ({ texto, avisos } = otro);
          reintento = true;
        }
      } catch (e) {
        this.log.warn(`segunda pasada de la transcripción: ${(e as Error).message}`);
      }
      this.log.log(`transcripción con avisos: ${avisos.length}${reintento ? ' (corregida en la segunda pasada)' : ''}`);
    }
    return { texto, crudo, avisos, reintento };
  }

  /** baja un audio de una URL (un adjunto de WhatsApp) y lo transcribe */
  async transcribirUrl(corredoraId: string, url: string) {
    const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!r.ok) throw new Error(`no se pudo bajar el audio (${r.status})`);
    const largo = Number(r.headers.get('content-length') || 0);
    if (largo > MAX_AUDIO) throw new Error('el audio es demasiado largo');
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_AUDIO) throw new Error('el audio es demasiado largo');
    if (buf.length < 1000) throw new Error('el audio está vacío');
    return this.transcribir(corredoraId, buf, r.headers.get('content-type') || 'audio/ogg');
  }
}
