// Bloques editables de una plantilla de documento (sistema de plantillas: base común + versión propia de cada corredora).
//
// Un bloque es una cláusula (<section class="cl …">…</section>) o la comparecencia (<p class="comparecencia">…</p>).
// Se edita como TEXTO simple, no como HTML:
//   # Título de la cláusula
//   Un párrafo. **negrita** con datos {{corredora.nombre}}.
//   (línea en blanco = otro párrafo; salto simple = salto de línea dentro del párrafo)
//   - un ítem de lista
//   {{#algo}}                ← una línea sola con un bloque condicional abre/cierra (se respeta tal cual)
// Todo lo que escribe la persona se escapa: nunca entra HTML. Los datos {{…}} solo pueden ser los que ya usa la plantilla
// base (así no se rompe el documento). Un bloque cuyo HTML no se puede pasar a texto y volver idéntico queda «solo
// lectura» (se muestra pero no se edita).
import { createHash } from 'node:crypto';

export interface Bloque {
  clave: string;
  titulo: string;
  tipo: 'clausula' | 'comparecencia';
  /** el texto editable de la base, o null si el bloque no se puede editar como texto */
  texto: string | null;
  /** el HTML de adentro, tal cual está en la base */
  html: string;
  /** dónde está en el archivo base (para reemplazar) */
  inicio: number;
  fin: number;
}

const ENT: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};
const desescapar = (s: string) => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (e) => ENT[e]);
const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const normal = (s: string) => s.replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim();

export const huella = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 12);

const slug = (t: string) =>
  desescapar(t.replace(/<[^>]+>/g, ''))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'clausula';

// ------------------------------------------------------------------ HTML ⇄ texto

/** texto de una línea (dentro de un párrafo o ítem) desde HTML: solo admite <b>, <br> y datos {{…}} */
function inlineATexto(h: string): string | null {
  const sinB = h
    .replace(/<b>([\s\S]*?)<\/b>/g, (_, x: string) => `**${x}**`)
    .replace(/<i>([\s\S]*?)<\/i>/g, (_, x: string) => `__${x}__`)
    .replace(/<br\s*\/?>/g, '\n');
  if (/<[^>]*>/.test(sinB)) return null; // otra etiqueta: no se puede editar como texto
  return desescapar(
    sinB
      .replace(/[ \t\r\n]*\n[ \t\r\n]*/g, '\n')
      .replace(/[ \t\r]+/g, ' ')
      .trim(),
  );
}
function textoAInline(t: string): string {
  return escapar(t.trim())
    .replace(/\*\*([\s\S]+?)\*\*/g, '<b>$1</b>')
    .replace(/__([\s\S]+?)__/g, '<i>$1</i>')
    .replace(/\n/g, '<br>');
}

const MUSTACHE_SOLO = /^\{\{[#/^][\w.]+\}\}$/;

/** el HTML de adentro de una cláusula → texto (null si tiene algo que el texto no puede representar) */
function clausulaATexto(h: string): string | null {
  const partes: string[] = [];
  const re =
    /\s*(?:<h2>([\s\S]*?)<\/h2>|<p>([\s\S]*?)<\/p>|<ul class="sub">([\s\S]*?)<\/ul>|(\{\{[#/^][\w.]+\}\}))\s*/y;
  let i = 0;
  while (i < h.length) {
    re.lastIndex = i;
    const m = re.exec(h);
    if (!m) return h.slice(i).trim() ? null : partes.join('\n\n');
    i = re.lastIndex;
    if (m[1] !== undefined) {
      const t = inlineATexto(m[1]);
      if (t === null || t.includes('\n')) return null;
      partes.push('# ' + t);
    } else if (m[2] !== undefined) {
      const t = inlineATexto(m[2]);
      if (t === null) return null;
      partes.push(t);
    } else if (m[3] !== undefined) {
      const items: string[] = [];
      const ri = /\s*<li>([\s\S]*?)<\/li>\s*/y;
      let j = 0;
      while (j < m[3].length) {
        ri.lastIndex = j;
        const li = ri.exec(m[3]);
        if (!li) {
          if (m[3].slice(j).trim()) return null;
          break;
        }
        j = ri.lastIndex;
        const t = inlineATexto(li[1]);
        if (t === null || t.includes('\n')) return null;
        items.push('- ' + t);
      }
      partes.push(items.join('\n'));
    } else partes.push(m[4]);
  }
  return partes.join('\n\n');
}

/** texto → HTML de adentro de una cláusula */
function textoAClausula(t: string): string {
  const grupos = t
    .replace(/\r/g, '')
    .split(/\n[ \t]*\n/)
    .map((g) => g.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const g of grupos) {
    const lineas = g.split('\n');
    // un grupo puede mezclar título, ítems, condicionales y texto: se reparte línea por línea
    let parrafo: string[] = [];
    let items: string[] = [];
    const cerrarP = () => {
      if (parrafo.length) out.push(`<p>${textoAInline(parrafo.join('\n'))}</p>`);
      parrafo = [];
    };
    const cerrarUl = () => {
      if (items.length) out.push(`<ul class="sub">${items.map((x) => `<li>${textoAInline(x)}</li>`).join('')}</ul>`);
      items = [];
    };
    for (const l of lineas) {
      const s = l.trim();
      if (s.startsWith('# ')) {
        cerrarP();
        cerrarUl();
        out.push(`<h2>${textoAInline(s.slice(2))}</h2>`);
      } else if (s.startsWith('- ')) {
        cerrarP();
        items.push(s.slice(2));
      } else if (MUSTACHE_SOLO.test(s)) {
        cerrarP();
        cerrarUl();
        out.push(s);
      } else {
        cerrarUl();
        parrafo.push(s);
      }
    }
    cerrarP();
    cerrarUl();
  }
  return out.join('\n  ');
}

const BLOQUE_RE =
  /<(section|div) class="cl(?: [^"]*)?"[^>]*>([\s\S]*?)<\/\1>|<p class="comparecencia">([\s\S]*?)<\/p>/g;

/** los bloques de una plantilla base, en orden */
export function bloquesDe(html: string): Bloque[] {
  const vistos = new Map<string, number>();
  const out: Bloque[] = [];
  for (const m of html.matchAll(BLOQUE_RE)) {
    const esCl = m[2] !== undefined;
    const interior = esCl ? m[2] : m[3];
    const inicioInterior = (m.index ?? 0) + m[0].indexOf(interior);
    const h2 = esCl ? /<h2>([\s\S]*?)<\/h2>/.exec(interior)?.[1] : null;
    const titulo = esCl ? desescapar((h2 ?? 'Cláusula').replace(/<[^>]+>/g, '')).trim() : 'Comparecencia';
    let clave = esCl ? slug(h2 ?? '') : 'comparecencia';
    const n = (vistos.get(clave) ?? 0) + 1;
    vistos.set(clave, n);
    if (n > 1) clave += '-' + n;
    let texto = esCl ? clausulaATexto(interior) : inlineATexto(interior);
    // ida y vuelta: si el texto no reproduce el mismo HTML, el bloque queda solo lectura
    if (texto !== null) {
      const vuelta = esCl ? textoAClausula(texto) : textoAInline(texto);
      if (normal(vuelta) !== normal(interior)) texto = null;
    }
    out.push({
      clave,
      titulo,
      tipo: esCl ? 'clausula' : 'comparecencia',
      texto,
      html: interior,
      inicio: inicioInterior,
      fin: inicioInterior + interior.length,
    });
  }
  return out;
}

/** los datos {{…}} que usa una plantilla (los únicos permitidos al editar) */
export function variablesDe(html: string): Set<string> {
  const s = new Set<string>();
  for (const m of html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/\{\{[#/^]?([\w.]+)\}\}/g)) s.add(m[1]);
  return s;
}

/** revisa un texto editado: datos conocidos y bloques condicionales bien cerrados; devuelve el error o null */
export function revisarTexto(texto: string, permitidas: Set<string>): string | null {
  const pila: string[] = [];
  for (const m of texto.matchAll(/\{\{([#/^]?)([^}]*)\}\}/g)) {
    const [, tipo, nombre] = m;
    if (!/^[\w.]+$/.test(nombre)) return `«{{${tipo}${nombre}}}» no es un dato válido.`;
    if (!permitidas.has(nombre)) return `El dato «{{${nombre}}}» no existe en esta plantilla.`;
    if (tipo === '#' || tipo === '^') pila.push(nombre);
    else if (tipo === '/') {
      if (pila.pop() !== nombre) return `El bloque «{{/${nombre}}}» se cierra sin abrirse (o en otro orden).`;
    }
  }
  if (pila.length) return `Falta cerrar el bloque «{{#${pila[pila.length - 1]}}}» con «{{/${pila[pila.length - 1]}}}».`;
  if (/\{\{|\}\}/.test(texto.replace(/\{\{[#/^]?[\w.]+\}\}/g, ''))) return 'Hay llaves {{ }} sueltas.';
  return null;
}

/** la plantilla base con los textos propios de la corredora (los bloques que no existen o no se editan, se ignoran) */
export function aplicar(base: string, propios: Record<string, string>): string {
  const bloques = bloquesDe(base).filter((b) => b.texto !== null && typeof propios[b.clave] === 'string');
  let out = base;
  // de atrás para adelante: así no se corren las posiciones
  for (const b of [...bloques].sort((a, c) => c.inicio - a.inicio)) {
    const t = propios[b.clave];
    const html = b.tipo === 'clausula' ? '\n  ' + textoAClausula(t) + '\n' : textoAInline(t);
    out = out.slice(0, b.inicio) + html + out.slice(b.fin);
  }
  return out;
}
