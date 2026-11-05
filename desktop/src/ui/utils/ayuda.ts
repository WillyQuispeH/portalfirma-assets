// Buscador de dudas de la Ayuda: local, no usa IA ni gasta tokens.
// Normaliza (sin tildes ni mayúsculas), descarta palabras vacías, aplica sinónimos y puntúa cada guía:
// 3 si la palabra está en el título, 2 en las palabras clave y 1 en los pasos. Devuelve las 3 mejores.
import type { IGuia } from '../store/interfaces/ayuda.interface';

const SINONIMOS: Record<string, string> = { firma: 'firmar', firme: 'firmar', firmas: 'firmar', mandar: 'enviar', envio: 'enviar', mover: 'mover', arrastrar: 'mover', escanear: 'ocr', escaneado: 'ocr', fotocopia: 'ocr', juntar: 'combinar', unir: 'combinar', vence: 'vencimientos', vencimiento: 'vencimientos', modelo: 'plantilla', plantillas: 'plantilla', ia: 'asistente', clave: 'contraseña' };
const VACIAS = new Set(['como', 'que', 'para', 'por', 'una', 'uno', 'los', 'las', 'del', 'con', 'puedo', 'quiero', 'hago', 'hacer', 'mis', 'mi', 'el', 'la', 'de', 'en', 'un', 'y', 'o', 'a', 'se', 'es', 'me', 'al', 'lo']);

export const normalizar = (s: unknown) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function buscarGuias(q: string, guias: IGuia[]): IGuia[] {
  const palabras = normalizar(q).split(/[^a-z0-9ñ]+/).filter((t) => t.length > 1 && !VACIAS.has(t)).map((t) => normalizar(SINONIMOS[t] || t));
  if (!palabras.length) return [];
  return guias.map((g) => {
    const T = normalizar(g.title), K = normalizar(g.kw), S = normalizar(g.steps.join(' '));
    let puntos = 0;
    for (const t of palabras) {
      const raiz = t.length > 4 ? t.slice(0, t.length - 1) : t; // «muevo» encuentra «mueve»
      if (T.includes(raiz)) puntos += 3; if (K.includes(raiz)) puntos += 2; if (S.includes(raiz)) puntos += 1;
    }
    return { g, puntos };
  }).filter((x) => x.puntos >= 2).sort((a, b) => b.puntos - a.puntos).slice(0, 3).map((x) => x.g);
}
