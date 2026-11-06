// Asistente legal sobre el documento abierto en el editor (lo que pasa fuera de un componente):
//  · Revisar: ortografía, redacción, coherencia de datos, lo que falta y riesgos; cada sugerencia se acepta o
//    descarta y al aceptarla se reescribe el párrafo con la misma fuente.
//  · Redactar: primero se busca un modelo aprobado de Portalfirma; si no hay, lo redacta la IA. Se abre como formulario.
//  · Mejorar con IA o editar a mano el texto de un documento redactado.
//  · Preguntar: consultas sobre el documento abierto.
// La clave de API vive cifrada en el proceso principal; aquí nunca se ve. El estado del proveedor y la billetera de
// tokens están en asistente.store.ts; las ventanas de consentimiento, tokens y «Redactar» en components/functional/asistente.
// Se instala al cargar el bundle (index.tsx) como window.Asistente, con la API de siempre.
/* eslint-disable @typescript-eslint/no-explicit-any -- respuestas JSON de la IA */
import { abrirModal } from '../../../../utils/modal';
import { Bloqueado, EditarTexto, ElegirModelo } from './Modales';
import { consentimiento, redactar, verTokens } from '../../asistente/controlador';
import { asistenteEstado } from '../../../../store/hooks/useAsistente.hook';
import { editorArchivos, tocar } from '../../../../store/hooks/useEditor.hook';
import { blocksFor } from '../../../../utils/editor-pdf/bloques';
import { normText } from '../../../../utils/editor-pdf/comun';
import { DRAFT_SYSTEM, LEYENDA, MAX_CHARS, SYSTEM, blockedDoc, cleanSpec, htmlText, localChecks, mdToHtml, modelSpec, modelosQueCalzan, parseJson, promptRevisar, replaceInHtml, specHtml, type IBloqueado, type IModeloLista } from '../../../../utils/asistente-legal';
import * as M from '../../../../utils/editor-pdf/motor';
import { buildAiDoc } from '../editor-pdf/plantillas';
import { esMiembro, pedirSesion, toast } from '../../../../utils/app';
import type { IAsistenteDoc, IDocumento, IObservacion, ISpec } from '../../../../store/interfaces/editor.interface';
import type { IAsistenteEstado, IBilletera } from '../../../../store/interfaces/asistente.interface';

const { ed, step } = M;
const nuevoAi = (): IAsistenteDoc => ({ tab: 'review', items: null, chat: [] });
const MOTIVO = 'El asistente legal con IA es exclusivo para clientes de Portalfirma. Inicia sesión con tu cuenta para usarlo.';

export const status = (refrescar?: boolean): Promise<IAsistenteEstado> => asistenteEstado().asistenteEstado(!!refrescar);
export const wallet = (refrescar?: boolean): Promise<IBilletera> => asistenteEstado().asistenteBilletera(!!refrescar);
export const ensureConsent = () => consentimiento();
export const tokensDialog = (motivo?: string) => verTokens(motivo);

// ---------- texto del documento (con lo editado) ----------
export async function docText() {
  const T = ed(); const parts: string[] = []; let scanned = 0;
  for (let i = 0; i < T.count; i++) {
    let bl: Awaited<ReturnType<typeof blocksFor>> = []; try { bl = await blocksFor(T, i); } catch { /* página ilegible */ }
    const ovs = (T.overlays[i] || []).filter((o) => o.type === 'rich');
    const lines = bl.map((b) => { const o = ovs.find((x) => x.blockId === b.id); return o ? htmlText(o.html!) : b.text.replace(/\s*\n\s*/g, ' '); });
    for (const o of ovs) if (!o.blockId) lines.push(htmlText(o.html!));
    if (!lines.join('').trim()) scanned++;
    parts.push(`[Página ${i + 1}]\n` + lines.filter(Boolean).join('\n\n'));
  }
  let text = parts.join('\n\n');
  const cut = text.length > MAX_CHARS; if (cut) text = text.slice(0, MAX_CHARS);
  return { text, cut, scanned };
}

// Pregunta a la IA (el proceso principal cobra los tokens y avisa si no alcanzan)
export async function ask(req: object): Promise<string> {
  const T = ed(); if (!T.ai) T.ai = nuevoAi();
  const r = await editorArchivos.iaPreguntar(req) as { ok: boolean; data?: any; error?: string; code?: string };
  if (!r.ok) {
    if (r.code === 'NEEDS_ACCOUNT') { setTimeout(() => pedirSesion(() => {}, undefined as unknown as string), 50); const e: any = new Error(r.error); e.silent = true; throw e; }
    if (r.code === 'NO_TOKENS') { if (r.data) asistenteEstado().asistenteFijarBilletera(r.data); setTimeout(() => tokensDialog(r.error), 50); const e: any = new Error(r.error); e.silent = true; throw e; }
    throw new Error(r.error);
  }
  if (T.ai) { T.ai.model = r.data.model; T.ai.usage = r.data.usage; }
  if (r.data.tokens) asistenteEstado().asistenteFijarBilletera(r.data.tokens);
  return r.data.text;
}

// ---------- el panel ----------
// El panel se vuelve a dibujar con cada cambio del documento (tocar)
const refrescar = () => tocar();
export function open() {
  if (!esMiembro()) return pedirSesion(open, MOTIVO);
  const T = ed(); if (!T.bytes) return redactar();
  T.ai = T.ai || nuevoAi(); T.ai.open = true; refrescar();
}
export function close() { const T = ed(); if (T.ai) T.ai.open = false; refrescar(); }
export const abrirOCerrar = () => (ed().ai?.open ? close() : pedirSesion(open, MOTIVO));
export function pestana(tab: IAsistenteDoc['tab']) { const T = ed(); if (!T.ai) T.ai = nuevoAi(); T.ai.tab = tab; refrescar(); }

// ---------- aplicar una sugerencia en el documento ----------
async function applySuggestion(item: IObservacion) {
  const T = ed();
  const q = item.cita!.replace(/\s+/g, ' ').trim(); const nq = normText(q).toLowerCase();
  for (let i = 0; i < T.count; i++) {
    // 1) párrafos ya abiertos (editados)
    for (const o of T.overlays[i] || []) {
      if (o.type !== 'rich' || o.locked) continue;
      if (!normText(htmlText(o.html!)).toLowerCase().includes(nq)) continue;
      const html = replaceInHtml(o.html!, q, item.sugerencia!); if (!html) continue;
      M.snapshot(); o.html = html; M.renderOverlaysFor(i); M.setDirty(true); return i;
    }
    // 2) párrafos del PDF aún sin abrir
    let bl: Awaited<ReturnType<typeof blocksFor>> = []; try { bl = await blocksFor(T, i); } catch { /* página ilegible */ }
    const used = new Set((T.overlays[i] || []).map((o) => o.blockId));
    const b = bl.find((x) => !used.has(x.id) && normText(x.text.replace(/\s+/g, ' ')).toLowerCase().includes(nq));
    if (!b) continue;
    M.snapshot();
    let o: Awaited<ReturnType<typeof M.openBlocks>>[number] | undefined;
    await step('Aplicando la sugerencia…', async () => { [o] = await M.openBlocks(i, [b]); });
    if (!o) return -1;
    const html = replaceInHtml(o.html!, q, item.sugerencia!);
    if (html) { o.html = html; M.renderOverlaysFor(i); M.setDirty(true); return i; }
    return -1;
  }
  return -1;
}
export async function aplicar(it: IObservacion) {
  const p = await applySuggestion(it);
  if (p >= 0) { it.done = 'aplicada'; M.goto(p); refrescar(); toast('Sugerencia aplicada. Puedes deshacerla con ⌘Z.'); }
  else toast('No encontré ese texto exacto en el documento. Aplícalo a mano con «Editar texto».', 5000);
}
export function descartar(it: IObservacion) { it.done = 'descartada'; refrescar(); }
export async function verCita(item: IObservacion) {
  if (!item.cita) return;
  await M.runFind(item.cita.slice(0, 60));
  M.find();
}

// ---------- acciones ----------
export async function review() {
  if (!(await ensureConsent())) return;
  const T = ed(); if (!T.ai) T.ai = nuevoAi();
  await step('El asistente está revisando el documento…', async () => {
    const { text, cut, scanned } = await docText();
    if (!text.replace(/\[Página \d+\]/g, '').trim()) throw new Error('El documento no tiene texto legible. Si es una fotocopia, usa primero «Reconocer texto».');
    const out = parseJson(await ask({ system: SYSTEM, messages: [{ role: 'user', content: promptRevisar(text, cut) }], json: true, action: 'review' }));
    const items: IObservacion[] = [...localChecks(text), ...(Array.isArray(out.observaciones) ? out.observaciones : [])]
      .filter((x: any) => x && x.explicacion).map((x: any): IObservacion => ({ ...x, cita: x.cita ? String(x.cita) : null, sugerencia: x.sugerencia ? String(x.sugerencia) : null }));
    const rank: Record<string, number> = { alta: 0, media: 1, baja: 2 }; items.sort((a, b) => (rank[a.gravedad || ''] ?? 1) - (rank[b.gravedad || ''] ?? 1));
    T.ai!.items = items; T.ai!.summary = (out.resumen || '') + (scanned ? ` (${scanned} página(s) sin texto: usa «Reconocer texto» para incluirlas.)` : '');
  });
  refrescar();
}

export async function askDoc(q: string) {
  q = q.trim(); if (!q) return;
  if (!(await ensureConsent())) return;
  const T = ed(); if (!T.ai) T.ai = nuevoAi(); const a = T.ai;
  if (!a.chat.some((m) => m.ctx)) { const { text } = await docText(); a.chat.push({ role: 'user', ctx: true, content: `Este es el documento sobre el que te voy a preguntar:\n<<<\n${text}\n>>>` }, { role: 'assistant', ctx: true, content: 'Entendido. ¿Qué quieres saber del documento?' }); }
  a.chat.push({ role: 'user', content: q }); refrescar();
  await step('El asistente está respondiendo…', async () => {
    const ans = await ask({ action: 'ask', system: SYSTEM + '\nResponde de forma breve y concreta, citando la cláusula del documento cuando corresponda.', messages: a.chat.map(({ role, content }) => ({ role, content })) });
    a.chat.push({ role: 'assistant', content: ans });
  });
  refrescar();
}

// Documentos que no se pueden firmar electrónicamente
function showBlocked(b: IBloqueado, onSuggest?: (s: string) => void) { abrirModal(<Bloqueado b={b} alRedactar={onSuggest} />, { clave: 'modal-78' }); }

let MODELS: IModeloLista[] | null = null;
async function findModels(q: string) {
  if (!MODELS) { const r = await editorArchivos.modelos(); MODELS = r.ok ? r.data as IModeloLista[] : []; }
  return modelosQueCalzan(MODELS, q);
}
async function useModel(id: string, q: string) {
  let spec: ISpec | null = null;
  await step('Preparando el modelo de Portalfirma…', async () => {
    const r = await editorArchivos.modelo(id); if (!r.ok || !r.data) throw new Error('No encontré el modelo.');
    spec = modelSpec(r.data); spec.desc = q; spec.history = [];
  });
  if (spec) await buildAiDoc(spec);
}
export async function draft(q: string, opts: { models?: boolean } = {}): Promise<void> {
  if (!q || q.trim().length < 15) { toast('Describe el documento con un poco más de detalle.'); return; }
  const b = blockedDoc(q); if (b) return showBlocked(b, (s) => draft(s));
  if (opts.models !== false) { const c = await findModels(q).catch(() => []); if (c.length) { abrirModal(<ElegirModelo modelos={c} alUsar={(id) => useModel(id, q)} alRedactar={() => draft(q, { models: false })} />, { clave: 'modal-79' }); return; } }
  if (!(await ensureConsent())) return;
  let spec: (ISpec & { blocked?: string }) | null = null;
  await step('El asistente está redactando el documento… (puede tardar hasta un minuto)', async () => {
    const out = parseJson(await ask({ action: 'draft', json: true, system: DRAFT_SYSTEM, messages: [{ role: 'user', content: `REDACTAR\nRedacta el documento que se describe:\n${q}` }] }));
    if (out.bloqueado) { spec = { blocked: String(out.bloqueado) } as any; return; }
    spec = cleanSpec(out); spec.desc = q; spec.history = [];
  });
  const s = spec as (ISpec & { blocked?: string }) | null;
  if (!s) return;
  if (s.blocked) return showBlocked({ title: 'Documento no disponible', msg: s.blocked });
  await buildAiDoc(s);
}
// Mejorar el documento con instrucciones (1 token por modificación)
export async function improveDoc(instr: string): Promise<void> {
  if (!esMiembro()) return pedirSesion(() => improveDoc(instr), undefined as unknown as string);
  const T = ed(); const spec = T.aiDoc; if (!spec || !instr || instr.trim().length < 4) return;
  const b = blockedDoc(instr); if (b && b.kind !== 'pagare') return showBlocked(b);
  if (b) return showBlocked(b, (s) => draft(s));
  if (!(await ensureConsent())) return;
  let next: (ISpec & { blocked?: string }) | null = null; let note = '';
  await step('El asistente está modificando el documento…', async () => {
    const cur = { titulo: spec.titulo, cuerpo: spec.cuerpo, campos: spec.campos };
    const out = parseJson(await ask({ action: 'edit', json: true, system: DRAFT_SYSTEM, messages: [{ role: 'user', content: `MODIFICAR\nEste es el documento actual (JSON):\n<<<JSON\n${JSON.stringify(cur)}\nJSON>>>\nAplica este cambio y devuelve el documento COMPLETO con el mismo formato JSON, conservando las etiquetas de los marcadores que no cambian. Agrega "resumen_cambio" con una frase sobre lo que cambiaste.\nCambio pedido: ${instr}` }] }));
    if (out.bloqueado) { next = { blocked: String(out.bloqueado) } as any; return; }
    next = cleanSpec(out, spec); note = String(out.resumen_cambio || instr).slice(0, 200);
  });
  const n = next as (ISpec & { blocked?: string }) | null;
  if (!n) return;
  if (n.blocked) return showBlocked({ title: 'Cambio no disponible', msg: n.blocked });
  n.desc = spec.desc; n.history = [...(spec.history || []), { instr, note }];
  await buildAiDoc(n, T);
  toast('Documento modificado: ' + note, 5000);
}
// Editar el texto a mano (gratis): el texto con los [[marcadores]]
export function editDocText() {
  const T = ed(); const spec = T.aiDoc; if (!spec) return;
  abrirModal(<EditarTexto spec={spec} alAplicar={async (titulo, cuerpo) => {
    const b = blockedDoc(titulo); if (b && b.kind !== 'pagare') return showBlocked(b);
    let next: ISpec; try { next = cleanSpec({ titulo, cuerpo, campos: spec.campos }, spec); } catch (e) { return toast((e as Error).message, 5000); }
    next.desc = spec.desc; next.history = spec.history || [];
    await buildAiDoc(next, T as IDocumento);
  }} />, { clave: 'modal-80' });
}

// Lo que usan las plantillas («Detectar con IA»)
export const asistenteIA = { status, ensureConsent, docText, ask, parseJson, SYSTEM };

// window.Asistente de siempre (inicio, plantillas, dictado, Plazos, Flujos, el Agente y las pruebas)
export function instalarAsistenteLegal() {
  (window as any).Asistente = {
    _paintTokens: () => tocar(), open, close, draftDialog: (prefill = '') => redactar(prefill), draft, _findModels: findModels, _modelSpec: modelSpec, _useModel: useModel,
    improveDoc, blockedDoc, _cleanSpec: cleanSpec, _specHtml: specHtml, LEYENDA, tokensDialog, wallet, SYSTEM, ensureConsent, status, docText, parseJson,
    ask: (req: object) => { const T = ed(); T.ai = T.ai || nuevoAi(); return ask(req); },
    actualizarTokens: (b: object) => asistenteEstado().asistenteFijarBilletera(b as IBilletera),
    _localChecks: localChecks, _replaceInHtml: replaceInHtml, _mdToHtml: mdToHtml,
  };
}
