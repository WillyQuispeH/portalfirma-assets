// Texto de una cláusula (el formato que guarda la API, api/src/documentos/bloques.ts) ⇄ documento del editor (JSON de TipTap).
// Sin DOM: lo usa EditorClausula y lo prueba test/formato-clausula-unit.js (ida y vuelta idéntica en las 7 plantillas).
//
// El formato:  «# Título» (primera línea) · línea en blanco = párrafo nuevo · salto simple = salto dentro del párrafo
//              «- » = ítem · **negrita** · __cursiva__ · {{dato}} · una línea sola «{{#dato}}» / «{{^dato}}» … «{{/dato}}»
//              = parte que solo aparece si hay (o si no hay) ese dato · dentro de una línea, {{#dato}}…{{/dato}} igual.
// En el editor:  título → campo aparte (titulo, el texto crudo después de «# »; partirTitulo separa el prefijo en cursiva)
//                párrafo/lista → paragraph / bulletList · dato → nodo «dato» · línea condicional → nodo «condicional»
//                condicional dentro de una línea → nodo «condInline» (su interior queda como texto crudo, no se edita)

export type TTipoBloque = 'clausula' | 'comparecencia' | string;

export interface IMarca { type: 'bold' | 'italic' }
export interface INodo {
  type: string;
  attrs?: Record<string, unknown>;
  content?: INodo[];
  marks?: IMarca[];
  text?: string;
}

const MUSTACHE_SOLO = /^\{\{([#/^])([\w.]+)\}\}$/;

// ------------------------------------------------------------------ texto de una línea → nodos en línea

type TToken =
  | { t: 'txt'; v: string }
  | { t: 'b' | 'i' | 'br' }
  | { t: 'dato'; nombre: string }
  | { t: 'cond'; nombre: string; invertida: boolean; interior: string };

function tokens(s: string): TToken[] {
  const out: TToken[] = [];
  const txt = (v: string) => {
    const u = out[out.length - 1];
    if (u && u.t === 'txt') u.v += v; else out.push({ t: 'txt', v });
  };
  let i = 0;
  while (i < s.length) {
    if (s.startsWith('{{', i)) {
      const sec = /^\{\{([#^])([\w.]+)\}\}/.exec(s.slice(i));
      if (sec) {
        // buscar su cierre, contando las del mismo nombre que se abren adentro
        const nombre = sec[2];
        const re = new RegExp(`\\{\\{([#^/])${nombre.replace(/\./g, '\\.')}\\}\\}`, 'g');
        re.lastIndex = i + sec[0].length;
        let prof = 1; let m: RegExpExecArray | null; let cierre = -1;
        while ((m = re.exec(s))) {
          if (m[1] === '/') { if (--prof === 0) { cierre = m.index; break; } } else prof++;
        }
        if (cierre >= 0) {
          out.push({ t: 'cond', nombre, invertida: sec[1] === '^', interior: s.slice(i + sec[0].length, cierre) });
          i = cierre + `{{/${nombre}}}`.length;
          continue;
        }
      }
      const dato = /^\{\{([\w.]+)\}\}/.exec(s.slice(i));
      if (dato) { out.push({ t: 'dato', nombre: dato[1] }); i += dato[0].length; continue; }
    }
    if (s.startsWith('**', i)) { out.push({ t: 'b' }); i += 2; continue; }
    if (s.startsWith('__', i)) { out.push({ t: 'i' }); i += 2; continue; }
    if (s[i] === '\n') { out.push({ t: 'br' }); i++; continue; }
    txt(s[i]); i++;
  }
  return out;
}

/** empareja las marcas como lo hace la API (regex no codiciosa: la 1.ª con la 2.ª, la 3.ª con la 4.ª…); las sueltas quedan como texto */
function emparejar(ts: TToken[], tipo: 'b' | 'i'): Set<number> {
  const pares = new Set<number>();
  let abierta = -1;
  ts.forEach((x, k) => {
    if (x.t !== tipo) return;
    if (abierta < 0) abierta = k;
    else if (k > abierta + 1) { pares.add(abierta); pares.add(k); abierta = -1; }
    // «****» (sin nada adentro) no es negrita: la segunda pasa a ser la que abre
    else abierta = k;
  });
  return pares;
}

export function inlineADoc(s: string): INodo[] {
  const ts = tokens(s);
  const pb = emparejar(ts, 'b'); const pi = emparejar(ts, 'i');
  let b = false; let it = false;
  const out: INodo[] = [];
  const marcas = (): IMarca[] | undefined => {
    const m: IMarca[] = [];
    if (b) m.push({ type: 'bold' });
    if (it) m.push({ type: 'italic' });
    return m.length ? m : undefined;
  };
  const conMarcas = (n: INodo): INodo => { const m = marcas(); if (m) n.marks = m; return n; };
  const texto = (v: string) => {
    if (!v) return;
    const m = marcas(); const u = out[out.length - 1];
    if (u && u.type === 'text' && JSON.stringify(u.marks) === JSON.stringify(m)) { u.text += v; return; }
    out.push(conMarcas({ type: 'text', text: v }));
  };
  ts.forEach((x, k) => {
    if (x.t === 'txt') texto(x.v);
    else if (x.t === 'b') { if (pb.has(k)) b = !b; else texto('**'); }
    else if (x.t === 'i') { if (pi.has(k)) it = !it; else texto('__'); }
    else if (x.t === 'br') out.push(conMarcas({ type: 'hardBreak' }));
    else if (x.t === 'dato') out.push(conMarcas({ type: 'dato', attrs: { nombre: x.nombre } }));
    else if (x.t === 'cond') out.push(conMarcas({ type: 'condInline', attrs: { nombre: x.nombre, invertida: x.invertida, interior: x.interior } }));
  });
  return out;
}

// ------------------------------------------------------------------ nodos en línea → texto de una línea

const ORDEN: Array<IMarca['type']> = ['bold', 'italic'];
const SIGNO: Record<IMarca['type'], string> = { bold: '**', italic: '__' };

export function docAInline(nodos: INodo[] | undefined, saltos = true): string {
  let out = '';
  const pila: Array<IMarca['type']> = [];
  for (const n of nodos ?? []) {
    const m = new Set((n.marks ?? []).map((x) => x.type).filter((x) => x === 'bold' || x === 'italic'));
    // cerrar desde la primera marca de la pila que este nodo ya no tiene
    const k = pila.findIndex((x) => !m.has(x));
    if (k >= 0) while (pila.length > k) out += SIGNO[pila.pop()!];
    for (const x of ORDEN) if (m.has(x) && !pila.includes(x)) { pila.push(x); out += SIGNO[x]; }
    if (n.type === 'text') out += n.text ?? '';
    else if (n.type === 'hardBreak') out += saltos ? '\n' : ' ';
    else if (n.type === 'dato') out += `{{${String(n.attrs?.nombre ?? '')}}}`;
    else if (n.type === 'condInline') {
      const nombre = String(n.attrs?.nombre ?? '');
      out += `{{${n.attrs?.invertida ? '^' : '#'}${nombre}}}${String(n.attrs?.interior ?? '')}{{/${nombre}}}`;
    }
  }
  while (pila.length) out += SIGNO[pila.pop()!];
  return out;
}

// ------------------------------------------------------------------ título

/** «__Primero ·__ Inmueble» → prefijo «__Primero ·__ » (fijo, se muestra en cursiva) y resto «Inmueble» (editable) */
export function partirTitulo(titulo: string): { prefijo: string; resto: string } {
  const m = /^(__(?:(?!__)[\s\S])+__[ \t]*)([\s\S]*)$/.exec(titulo);
  return m ? { prefijo: m[1], resto: m[2] } : { prefijo: '', resto: titulo };
}
/** el prefijo como se lee: «Primero ·» */
export const prefijoLegible = (prefijo: string) => prefijo.replace(/__/g, '').trim();

// ------------------------------------------------------------------ texto completo ⇄ documento

const parrafo = (s: string): INodo => {
  const c = inlineADoc(s);
  return c.length ? { type: 'paragraph', content: c } : { type: 'paragraph' };
};

/** texto guardado → título (texto crudo tras «# », o null) y documento del editor */
export function textoADoc(texto: string | null | undefined, tipo: TTipoBloque): { titulo: string | null; doc: INodo } {
  const t = (texto ?? '').replace(/\r/g, '');
  if (tipo === 'comparecencia') return { titulo: null, doc: { type: 'doc', content: [parrafo(t.trim())] } };

  const raiz: INodo[] = [];
  const pila: Array<{ nombre: string; contenido: INodo[] }> = [];
  const actual = () => (pila.length ? pila[pila.length - 1].contenido : raiz);
  let titulo: string | null = null;
  let primero = true;

  const grupos = t.split(/\n[ \t]*\n/).map((g) => g.trim()).filter(Boolean);
  for (const g of grupos) {
    let lineasP: string[] = [];
    let items: string[] = [];
    const cerrarP = () => { if (lineasP.length) actual().push(parrafo(lineasP.join('\n'))); lineasP = []; };
    const cerrarUl = () => {
      if (items.length) actual().push({ type: 'bulletList', content: items.map((x) => ({ type: 'listItem', content: [parrafo(x)] })) });
      items = [];
    };
    for (const l of g.split('\n')) {
      const s = l.trim();
      const ms = MUSTACHE_SOLO.exec(s);
      if (primero && s.startsWith('# ')) {
        titulo = s.slice(2);
      } else if (s.startsWith('# ')) {
        // otro título más abajo: queda como párrafo propio con su «# » (así vuelve igual)
        cerrarP(); cerrarUl(); actual().push(parrafo(s));
      } else if (s.startsWith('- ')) {
        cerrarP(); items.push(s.slice(2));
      } else if (ms && ms[1] !== '/') {
        cerrarP(); cerrarUl();
        const nodo: INodo = { type: 'condicional', attrs: { nombre: ms[2], invertida: ms[1] === '^' }, content: [] };
        actual().push(nodo);
        pila.push({ nombre: ms[2], contenido: nodo.content! });
      } else if (ms && pila.length && pila[pila.length - 1].nombre === ms[2]) {
        cerrarP(); cerrarUl();
        const c = pila.pop()!;
        if (!c.contenido.length) c.contenido.push({ type: 'paragraph' });
      } else {
        cerrarUl(); lineasP.push(s);
      }
      primero = false;
    }
    cerrarP(); cerrarUl();
  }
  for (const c of pila) if (!c.contenido.length) c.contenido.push({ type: 'paragraph' });
  if (!raiz.length) raiz.push({ type: 'paragraph' });
  return { titulo, doc: { type: 'doc', content: raiz } };
}

/** texto plano de un ítem (los saltos pasan a espacio: un ítem es una sola línea) */
function textoItem(li: INodo): string {
  return (li.content ?? [])
    .flatMap((c) => (c.type === 'paragraph' ? [docAInline(c.content, false)] : c.type === 'bulletList' ? (c.content ?? []).map(textoItem) : []))
    .map((x) => x.trim())
    .filter(Boolean)
    .join(' ');
}

function bloquesATexto(nodos: INodo[] | undefined, partes: string[]) {
  for (const n of nodos ?? []) {
    if (n.type === 'paragraph') {
      const s = docAInline(n.content).replace(/[ \t]+$/gm, '').trim();
      if (s) partes.push(s);
    } else if (n.type === 'bulletList') {
      const items = (n.content ?? []).map(textoItem).filter(Boolean).map((x) => '- ' + x);
      if (items.length) partes.push(items.join('\n'));
    } else if (n.type === 'condicional') {
      const nombre = String(n.attrs?.nombre ?? '');
      partes.push(`{{${n.attrs?.invertida ? '^' : '#'}${nombre}}}`);
      bloquesATexto(n.content, partes);
      partes.push(`{{/${nombre}}}`);
    }
  }
}

/** título + documento del editor → texto que se guarda */
export function docATexto(titulo: string | null | undefined, doc: INodo, tipo: TTipoBloque): string {
  if (tipo === 'comparecencia') {
    const lineas: string[] = [];
    const recorrer = (ns: INodo[] | undefined) => {
      for (const n of ns ?? []) {
        if (n.type === 'paragraph') lineas.push(docAInline(n.content));
        else if (n.type === 'listItem') lineas.push(textoItem(n));
        else recorrer(n.content);
      }
    };
    recorrer(doc.content);
    return lineas.map((x) => x.replace(/[ \t]+$/gm, '').trim()).filter(Boolean).join('\n');
  }
  const partes: string[] = [];
  const tt = (titulo ?? '').replace(/\s*\n\s*/g, ' ').trim();
  if (tt) partes.push('# ' + tt);
  bloquesATexto(doc.content, partes);
  return partes.join('\n\n');
}

/** los datos que usa un texto (para el menú y la prueba) */
export function datosDe(texto: string): string[] {
  return [...new Set([...texto.matchAll(/\{\{[#^/]?([\w.]+)\}\}/g)].map((m) => m[1]))];
}
