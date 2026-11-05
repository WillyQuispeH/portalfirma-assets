// Reglas del Asistente legal (sin pantalla): instrucciones para la IA, chequeos exactos (RUT, montos en palabras),
// reemplazo de una cita dentro de un párrafo, documentos que no se pueden firmar electrónicamente, limpieza de lo que
// redacta la IA y conversión de un modelo de Portalfirma al mismo formato.
/* eslint-disable @typescript-eslint/no-explicit-any -- respuestas JSON de la IA y modelos de la biblioteca */
import { esc, normText } from './editor-pdf/comun';
import { montoEnPalabras, rutDv } from './editor-pdf/plantillas';
import type { IObservacion, ISpec } from '../store/interfaces/editor.interface';

export const SYSTEM = `Eres un asistente legal para Chile que ayuda a redactar y revisar documentos (contratos, poderes, declaraciones, escritos).
Escribes en español de Chile, con lenguaje jurídico claro y preciso.
Reglas:
- No inventes leyes, artículos ni jurisprudencia. Si mencionas una norma, cítala solo si estás seguro, y siempre se entenderá como "por verificar".
- No inventes datos de las partes (nombres, RUT, montos, fechas, direcciones): si faltan, usa marcadores entre corchetes como [NOMBRE], [RUT], [FECHA].
- Tu trabajo es un apoyo: el documento final debe revisarlo una persona responsable.`;
export const TYPES: Record<string, string> = { ortografia: 'Ortografía', redaccion: 'Redacción', coherencia: 'Datos', falta: 'Falta', riesgo: 'Riesgo' };
export const MAX_CHARS = 120000;
export const tk = (n: number) => `${n} token${n === 1 ? '' : 's'}`;

export const htmlText = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; d.querySelectorAll('br').forEach((b) => b.replaceWith(' ')); return (d.textContent || '').replace(/\s+/g, ' ').trim(); };
export const parseJson = (t: string): any => { try { return JSON.parse(t); } catch { const m = /\{[\s\S]*\}/.exec(t); if (m) try { return JSON.parse(m[0]); } catch { /* sigue abajo */ } } throw new Error('La respuesta del asistente no vino en el formato esperado. Intenta de nuevo.'); };
// Las citas legales se marcan «por verificar» (HTML ya escapado)
export const verifyMarks = (s: string) => esc(s).replace(/((?:Ley|D\.?F\.?L\.?|Decreto(?: Ley)?)\s+(?:N[°º.]?\s*)?[\d.]+|art[íi]culos?\s+\d+[^\s,.;]*(?:\s+(?:del|de la)\s+(?:C[óo]digo|Ley)\s+[A-ZÁÉÍÓÚ][\wáéíóú]*(?:\s+N[°º]?\s*[\d.]+)?)?)/gi, '<mark class="verify" title="Cita legal: verifícala antes de usarla">$1</mark>');

// ---------- chequeos exactos (sin IA) ----------
export function localChecks(text: string): IObservacion[] {
  const out: IObservacion[] = [];
  for (const m of text.matchAll(/\b(\d{1,2}\.?\d{3}\.?\d{3})-([\dkK])\b/g)) {
    const body = m[1].replace(/\./g, ''); if (rutDv(body) !== m[2].toUpperCase()) out.push({ tipo: 'coherencia', gravedad: 'alta', cita: m[0], sugerencia: null, explicacion: `El RUT ${m[0]} tiene el dígito verificador incorrecto (debería terminar en ${rutDv(body)}). Revisa el número con la parte.`, local: true });
  }
  for (const m of text.matchAll(/\$\s?([\d.]{4,})\s*\(([^)]{6,120})\)/g)) {
    const n = Number(m[1].replace(/\./g, '')); const expect = normText(montoEnPalabras(n)).replace(/\s+/g, ' ');
    const got = normText(m[2]).replace(/\s+/g, ' ').replace(/\s*de\s+pesos|\s*pesos.*$/, '').trim();
    if (got && !expect.startsWith(got.replace(/ de$/, ''))) out.push({ tipo: 'coherencia', gravedad: 'alta', cita: m[0], sugerencia: null, explicacion: `El monto en cifras ($${m[1]}) no coincide con el monto en palabras («${m[2].trim()}»). En cifras corresponde a «${montoEnPalabras(n)}».`, local: true });
  }
  return out;
}

// Reemplaza `quote` por `repl` dentro del html, aunque el texto cruce negritas o cursivas. null si no lo encuentra.
export function replaceInHtml(html: string, quote: string, repl: string) {
  const d = document.createElement('div'); d.innerHTML = html;
  const nodes: Text[] = []; const walker = document.createTreeWalker(d, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  // texto normalizado (espacios colapsados) con su mapa a (nodo, posición)
  let norm = ''; const map: [number, number][] = []; let prevSpace = true;
  nodes.forEach((n, ni) => { for (let k = 0; k < n.data.length; k++) { const c = n.data[k]; const sp = /\s/.test(c); if (sp && prevSpace) continue; norm += sp ? ' ' : c; map.push([ni, k]); prevSpace = sp; } });
  const q = quote.replace(/\s+/g, ' ').trim(); let at = norm.indexOf(q);
  if (at < 0) at = norm.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return null;
  const [n0, k0] = map[at], [n1, k1] = map[at + q.length - 1];
  if (n0 === n1) { const n = nodes[n0]; n.data = n.data.slice(0, k0) + repl + n.data.slice(k1 + 1); }
  else {
    nodes[n0].data = nodes[n0].data.slice(0, k0) + repl;
    for (let x = n0 + 1; x < n1; x++) nodes[x].data = '';
    nodes[n1].data = nodes[n1].data.slice(k1 + 1);
  }
  return d.innerHTML;
}

export const promptRevisar = (text: string, cut: boolean) => `REVISAR\nRevisa el siguiente documento.${cut ? ' (El documento es largo: se envía solo la primera parte).' : ''}
Devuelve un objeto JSON con esta forma:
{"resumen": "2 a 3 frases sobre qué es el documento y su estado",
 "observaciones": [{"tipo": "ortografia|redaccion|coherencia|falta|riesgo", "gravedad": "alta|media|baja",
   "cita": "texto EXACTO copiado del documento, máximo 200 caracteres, o null si es algo que falta",
   "sugerencia": "texto que reemplaza exactamente a la cita, o null si no corresponde reemplazar",
   "explicacion": "por qué, en una o dos frases"}]}
Reglas: la cita debe ser literal (mismas palabras y mayúsculas) para poder ubicarla; máximo 25 observaciones, primero las más importantes; no repitas observaciones; si algo falta (plazo, domicilio, jurisdicción, firma, fecha de pago…) usa tipo "falta" y cita null.
Documento:
<<<
${text}
>>>`;

// Detectar campos con IA: el asistente lee el documento y propone los datos variables
export const promptDetectar = (text: string) => `VARIABLES
Este documento se va a convertir en una plantilla reutilizable. Identifica los DATOS VARIABLES: lo que cambia de un contrato a otro (nombres de las partes, RUT, domicilios, fechas, montos, plazos, direcciones de inmuebles, correos, teléfonos, números de cuotas…). NO incluyas texto fijo del contrato (cláusulas, títulos, nombres de leyes, roles como "el ARRENDADOR").
Devuelve un objeto JSON:
{"campos": [{"etiqueta": "nombre corto y claro, ej. 'Arrendatario: nombre'",
  "tipo": "texto|rut|fecha|monto|numero|email|telefono|parrafo",
  "apariciones": ["texto EXACTO como aparece en el documento (mismas mayúsculas y puntos); incluye cada forma distinta en que aparece el mismo dato"],
  "firmante": {"rol": "ej. Arrendatario", "dato": "fullName|rut|email|phone"} o null}]}
Reglas: cada aparición debe estar copiada literalmente del documento y ser solo el dato (sin "don", "RUT", ni puntuación alrededor); un mismo dato = un solo campo aunque aparezca varias veces; usa el mismo "rol" para los datos de la misma persona; máximo 40 campos.
Documento:
<<<
${text}
>>>`;

export function mdToHtml(md: string) {
  const lines = String(md).replace(/\r/g, '').split('\n'); let html = ''; let para: string[] = [];
  const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<i>$2</i>');
  const flush = () => { if (para.length) { html += `<p>${inline(para.join(' '))}</p>`; para = []; } };
  for (const l of lines) {
    const t = l.trim();
    if (!t) { flush(); continue; }
    if (/^#\s+/.test(t)) { flush(); html += `<h1>${inline(t.replace(/^#\s+/, ''))}</h1>`; continue; }
    if (/^#{2,}\s+/.test(t)) { flush(); html += `<h2>${inline(t.replace(/^#+\s+/, ''))}</h2>`; continue; }
    if (/^[-*]\s+/.test(t)) { flush(); html += `<p>• ${inline(t.replace(/^[-*]\s+/, ''))}</p>`; continue; }
    para.push(t);
  }
  flush(); return html;
}

// ============================================================================
// Redactar documentos: la IA entrega el texto con los datos variables marcados;
// se abre directo como formulario para completar, y se puede mejorar con el chat.
// ============================================================================
export const LEYENDA = 'El presente documento ha sido suscrito por los comparecientes mediante firma electrónica avanzada, acogiéndose a lo dispuesto en la Ley N° 19.799 sobre Documentos Electrónicos, Firma Electrónica y Servicios de Certificación de dicha Firma, y su reglamento. Conforme a dicha ley, los actos y contratos suscritos por medio de firma electrónica son válidos de la misma manera y producen los mismos efectos que los celebrados por escrito y en soporte de papel.';

// Documentos que no se pueden firmar electrónicamente (requieren comparecer en notaría)
export interface IBloqueado { kind?: string; title: string; msg: string; suggest?: string }
export function blockedDoc(text: string): IBloqueado | null {
  const t = normText(String(text || ''));
  if (/\bpagar[e]s?\b/.test(t) && !/\b(mandato|poder)\b/.test(t)) return { kind: 'pagare', title: 'Pagaré', msg: 'Un pagaré no puede firmarse de manera electrónica: requiere firma ante notario, en forma presencial.', suggest: 'Mandato para la suscripción de un pagaré: el mandante faculta a un mandatario para que, en su nombre y representación, suscriba ante notario un pagaré a favor de [beneficiario], por el monto y en las condiciones que se indiquen.' };
  if (/\b(sal(ida|ir|ga|gan)|viaj\w*)\b.{0,40}\b(pais|extranjero|chile)\b|\bpermiso de viaje\b/.test(t) && /\b(menor|menores|hij[oa]s?|nin[oa]s?|adolescentes?)\b/.test(t)) return { kind: 'menor', title: 'Autorización de salida del país de un menor', msg: 'La autorización para que un menor salga del país no puede firmarse de manera electrónica: requiere comparecer en notaría.' };
  if (/\bfiniquitos?\b/.test(t)) return { kind: 'finiquito', title: 'Finiquito', msg: 'Un finiquito no puede firmarse de manera electrónica en Portalfirma: requiere ratificación presencial ante un ministro de fe.' };
  return null;
}

export const DRAFT_SYSTEM = `Eres un abogado chileno experto en redacción de contratos y documentos privados, que trabaja para Portalfirma, una plataforma de firma electrónica avanzada.
Redactas documentos que cumplen la normativa chilena vigente (Código Civil, Código de Comercio, Código del Trabajo, Ley 18.101 de arrendamiento de predios urbanos, Ley 19.496 del consumidor, Ley 19.628 de datos personales y demás leyes especiales que correspondan al tipo de documento).

ESTILO
- Español jurídico de Chile, claro y preciso; sin anglicismos ni fórmulas de otros países.
- Comparecencia completa al inicio: «En [[Ciudad]], a [[Fecha del contrato]], comparecen: …». De cada persona natural: nombre, nacionalidad, estado civil, profesión u oficio, cédula de identidad y domicilio. De una persona jurídica: razón social, RUT, domicilio y su representante legal con su cédula. Cierra con «…los comparecientes mayores de edad, quienes acreditan su identidad con las cédulas citadas y exponen:».
- Cláusulas numeradas en palabras y en negrita: «**PRIMERO: Objeto.** …», «**SEGUNDO: …**». Incluye todos los elementos esenciales y de la naturaleza del acto (objeto, precio o contraprestación, forma y fecha de pago, plazo, obligaciones de cada parte, término anticipado, incumplimiento, garantías si corresponden) y una cláusula de domicilio y competencia de los Tribunales Ordinarios de Justicia.
- Cita normas solo si estás seguro del número de ley o artículo; si no, describe la regla sin citar.

DATOS VARIABLES
- TODO dato que cambia de un documento a otro va como marcador [[Etiqueta]]: nombres, RUT, nacionalidad, estado civil, profesión, domicilios, fechas, montos, plazos en días o meses, direcciones de inmuebles, patentes, números de cuotas, porcentajes, correos, etc.
- La etiqueta es corta y clara (máximo 40 caracteres); para los datos de una parte usa «Rol: dato» (ej. [[Arrendatario: nombre]], [[Arrendatario: RUT]]). Un mismo dato lleva SIEMPRE la misma etiqueta exacta, aunque aparezca varias veces.
- Montos: solo el marcador, sin «$» ni palabras (el sistema escribe «$800.000 (ochocientos mil pesos)»). Fechas: solo el marcador (el sistema escribe «3 de noviembre de 2026»). RUT y cédulas: solo el marcador.
- Si la descripción trae un dato concreto, igual va como marcador y pon ese dato en "valor" para que el formulario venga prellenado.
- Para cada parte que firma, agrega también su correo como campo solo de formulario (no va en el texto): {"etiqueta": "Rol: correo", "tipo": "email", "firmante": {"rol": "Rol", "dato": "email"}, "solo_formulario": true}.

PROHIBIDO
- No incluyas firmas, líneas para firmar, «p.p.», nombres bajo una línea ni lugares para huella: la plataforma agrega las firmas al firmar.
- No escribas la leyenda de firma electrónica ni menciones la Ley 19.799: la plataforma la agrega al final.
- No digas que se firma «en dos ejemplares» ni en papel: el documento es electrónico.
- No redactes pagarés, autorizaciones de salida del país de menores ni finiquitos (requieren presencialidad en notaría): en ese caso devuelve "bloqueado" con el motivo.

RESPUESTA
Solo un objeto JSON:
{"bloqueado": null o "motivo",
 "titulo": "TÍTULO EN MAYÚSCULAS",
 "cuerpo": "texto del documento en markdown (sin el título), párrafos separados por una línea en blanco, con los [[marcadores]]",
 "campos": [{"etiqueta": "igual al marcador", "tipo": "texto|rut|fecha|monto|numero|email|telefono|parrafo", "firmante": {"rol": "Arrendatario", "dato": "fullName|rut|email|phone"} o null, "valor": "dato ya conocido" o null, "solo_formulario": false}]}`;

// Limpia lo que el modelo no debe poner (firmas, leyenda) y deja la estructura lista
export function cleanSpec(out: any, prev?: ISpec): ISpec {
  if (!out || typeof out !== 'object') throw new Error('La respuesta del asistente no vino en el formato esperado. Intenta de nuevo.');
  let body = String(out.cuerpo || '').replace(/\r/g, '');
  body = body.split(/\n{2,}/).filter((p) => !/19\.?799/.test(p) && !/_{4,}|\[FIRMAS?\]|^\s*(firma|p\.p\.)\b/im.test(p)).join('\n\n').trim();
  body = body.replace(/^#\s+.+\n+/, '');
  const used = [...new Set([...body.matchAll(/\[\[([^\]\n]{1,60})\]\]/g)].map((m) => m[1].trim()))];
  const byLabel = new Map<string, any>((Array.isArray(out.campos) ? out.campos : []).map((c: any) => [String(c.etiqueta || '').trim(), c]));
  const okType = (t: string) => (['texto', 'rut', 'fecha', 'monto', 'numero', 'email', 'telefono', 'parrafo'].includes(t) ? t : 'texto');
  const sig = (f: any) => (f && f.rol && ['fullName', 'rut', 'email', 'phone'].includes(f.dato) ? { rol: String(f.rol).trim(), dato: f.dato } : null);
  const campos: ISpec['campos'] = used.map((l) => { const c = byLabel.get(l) || {}; return { etiqueta: l, tipo: okType(c.tipo), firmante: sig(c.firmante), valor: c.valor ?? null }; });
  for (const c of byLabel.values()) if (c.solo_formulario && c.etiqueta && !used.includes(c.etiqueta.trim())) campos.push({ etiqueta: c.etiqueta.trim(), tipo: okType(c.tipo), firmante: sig(c.firmante), valor: c.valor ?? null, solo_formulario: true });
  if (!body || !used.length) throw new Error('El asistente no entregó un documento con datos para completar. Intenta describirlo de nuevo.');
  return { titulo: String(out.titulo || prev?.titulo || 'Documento').trim().slice(0, 90), cuerpo: body, campos };
}
export function specHtml(spec: ISpec) {
  return `<h1>${esc(spec.titulo)}</h1>` + mdToHtml(spec.cuerpo).replace(/\[\[([^\]]+)\]\]/g, '<span class="ph">[$1]</span>') + `<p class="leyenda">${esc(LEYENDA)}</p>`;
}

// ---------- Redactar: primero se busca un modelo aprobado de Portalfirma; la IA solo si no hay uno que calce ----------
const STOP = new Set('para con por del los las una uno que mis sus mas sin entre sobre desde hasta este esta como donde cuando necesito quiero hacer documento contrato'.split(' '));
const SYN: Record<string, string> = { arrendamiento: 'arriendo', arrendar: 'arriendo', arrienda: 'arriendo', arrendatario: 'arriendo', arrendador: 'arriendo', pagare: 'pagare', pagares: 'pagare', nda: 'confidencialidad', confidencial: 'confidencialidad', domestica: 'particular', nana: 'particular', apoderado: 'poder', mandato: 'mandato', mandatos: 'mandato', poderes: 'poder', auto: 'vehiculo', vehiculos: 'vehiculo', camioneta: 'vehiculo', menor: 'menor', hijo: 'menor', hija: 'menor', deuda: 'deuda', deudas: 'deuda', mudanza: 'mudanza', trasteo: 'mudanza' };
const normTx = (s: string) => String(s || '').replace(/\b([A-Za-z])\.(?=[A-Za-z]\.)/g, '$1').replace(/\b([A-Za-z])\.(?![A-Za-z])/g, '$1').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const toks = (s: string) => normTx(s).split(' ').map((w) => SYN[w] || w.replace(/(es|s)$/, '')).filter((w) => w.length > 2 && !STOP.has(w));
export interface IModeloLista { id: string; nombre: string; descripcion?: string; categoria?: string; roles?: { alias: string }[] }
// Los modelos que calzan con lo pedido (el tipo de documento, la primera palabra, debe calzar)
export function modelosQueCalzan(modelos: IModeloLista[], q: string) {
  const qt = [...new Set(toks(q))]; if (!qt.length) return [];
  const nq = normTx(q).replace(/^(un|una|el|la)\s+/, '');
  return modelos.map((m) => {
    const nt = new Set(toks(m.nombre)); const ot = new Set(toks(`${m.descripcion} ${m.categoria}`));
    let score = 0; let inName = 0;
    for (const t of qt) { if (nt.has(t)) { score += 3; inName++; } else if (ot.has(t)) score += 1; }
    if (nq.length > 8 && normTx(m.nombre).includes(nq)) score += 4;
    return { m, score, inName, head: nt.has(qt[0]) };
  }).filter((x) => x.inName && x.score >= 3 && (x.head || x.score >= 6))
    .sort((a, b) => b.score - a.score).slice(0, 3).map((x) => x.m);
}
// Modelo de la biblioteca → mismo formato que entrega la IA (texto con [[Etiqueta]] y lista de campos)
const niceLb = (t: string) => { t = String(t || '').replace(/\s*\(.*$/, '').trim(); return t === t.toUpperCase() ? t.toLowerCase().replace(/^\S/, (c) => c.toUpperCase()).replace(/\brut\b/g, 'RUT').replace(/\buf\b/g, 'UF') : t; };
export function modelSpec(m: any): ISpec {
  const lines = m.texto.replace(/\r/g, '').split('\n'); const i = lines.findIndex((l: string) => l.trim());
  const titulo = lines[i].replace(/^#\s+/, '').replace(/\*\*/g, '').trim();
  let body = lines.slice(i + 1).join('\n').trim();
  const paras = body.split(/\n{2,}/); if (/^El presente documento ha sido suscrito/i.test(paras[paras.length - 1]?.replace(/\*\*/g, '').trim())) paras.pop(); // la leyenda la pone la app
  body = paras.join('\n\n');
  const labelOf = new Map<string, string>(); const used = new Set<string>();
  const cut = (t: string) => { if (t.length <= 34) return t; let o = ''; for (const w of t.split(' ')) { if ((o + ' ' + w).trim().length > 34) break; o = (o + ' ' + w).trim(); } return o.replace(/\s+(de|del|la|las|el|los|y|o|a|en|con|por|para)$/i, ''); };
  const plain = (f: any) => cut(niceLb(f.label).replace(/\s*["“”«»]?si existe["“”«»]?/i, '').replace(/["“”«»]/g, '').replace(/\s+/g, ' ').trim()); // datos cortos: caben en una línea
  const dupPlain = (f: any) => m.fields.some((g: any) => g.id !== f.id && plain(g).toLowerCase() === plain(f).toLowerCase());
  for (const f of m.fields) {
    // quien firma: «Arrendador: Nombre»; el resto, solo el dato (con su grupo si el nombre se repite)
    const l = f.signer ? `${f.groupLabel}: ${plain(f)}` : f.group === 'documento' || !dupPlain(f) ? plain(f) : `${plain(f)} (${f.groupLabel.toLowerCase()})`;
    let k = l; let n = 2; while (used.has(k)) k = `${l} ${n++}`; used.add(k); labelOf.set(f.id, k);
  }
  body = body.replace(/\[\[([^|\]]+)\|[^\]]*\]\]/g, (_: string, id: string) => `[[${labelOf.get(id) || id}]]`)
    .replace(/\*\*\s*(\[\[[^\]]+\]\])\s*\*\*/g, '$1') // el dato sin negrita (igual que en los documentos de la IA)
    .replace(/([^\s(«"“$])\[\[/g, '$1 [[').replace(/\]\]([^\s.,;:)»"”])/g, ']] $1') // espacio alrededor de cada dato
    .replace(/\]\]\s+([,.;:])/g, ']]$1').replace(/\*\*\s*\*\*/g, '').replace(/ {2,}/g, ' ');
  const tipo = (f: any) => (/(^|-)rut(-|$)/.test(f.key) && !/pasaporte/i.test(f.label) ? 'rut' : /^fecha/i.test(f.key) || /^FECHA/.test(f.label) ? 'fecha' : f.key === 'email' ? 'email' : /^tel[eé]fono/.test(f.key) ? 'telefono' : 'texto');
  const campos = m.fields.map((f: any) => ({ etiqueta: labelOf.get(f.id)!, tipo: tipo(f), firmante: f.signer && f.signerKey ? { rol: f.groupLabel, dato: f.signerKey } : null, valor: null }));
  return { titulo, cuerpo: body, campos, modelo: { id: m.id, nombre: m.nombre } };
}
