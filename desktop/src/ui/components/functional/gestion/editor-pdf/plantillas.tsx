// Plantillas con campos (lo que pasa fuera de un componente):
//  · Diseño: sobre el propio documento se marcan palabras como campos (nombre, RUT, fecha, monto…), a mano o con IA.
//  · La plantilla es un PDF normal con la definición incrustada como archivo adjunto.
//  · Llenado: un formulario a la derecha; el texto del párrafo se vuelve a armar con la misma fuente, el original
//    se borra de verdad y el resultado se revisa antes de generar el documento.
//  · Documentos redactados por el Asistente: se abren directo como formulario.
// La API de siempre queda en window.Plantillas (la instala index.tsx).
import { abrirModal } from '../../../../utils/modal';
import { CampoForm, CamposDetectados, GuardarPlantilla, Importada, PlantillaAbierta, PlantillaGuardada, SalirSinGuardar, type IDetectado } from './ModalesPlantilla';
import { Confirmar, NOTA, P } from './Modales';
import { editorArchivos, editorEstado, nuevoDocumento, tocar } from '../../../../store/hooks/useEditor.hook';
import { cargarPdf, guardarPdf, nombreBase, nombreDeRuta, normText } from '../../../../utils/editor-pdf/comun';
import { blocksFor, detectDigitalBlocks, vp1 } from '../../../../utils/editor-pdf/bloques';
import { layoutRich } from '../../../../utils/editor-pdf/hornear';
import { FIELD_TYPES, MAX_SHRINK, SIGNER_ATTRS, TPL_FILE, fieldsIn, firmantesDe, formatField, guessField, montoEnPalabras, newFieldId, numeroALetras, quitarCampo, readTemplate, substitute, textoSinCampos, wrapText } from '../../../../utils/editor-pdf/plantillas';
import { promptDetectar, specHtml } from '../../../../utils/asistente-legal';
import * as M from '../../../../utils/editor-pdf/motor';
import { activate, addFiles, descartarPestana, irAlEditor, nuevaPestana } from './controlador';
import { asistenteIA } from '../asistente-legal/controlador';
import { esMiembro, pedirSesion, toast } from '../../../../utils/app';
import type { ICampo, IDocumento, IObjeto, IPlantillaArchivo, ISpec } from '../../../../store/interfaces/editor.interface';

const { ed, step, setBytes, setDirty } = M;
const allOverlays = (T: IDocumento = ed()) => Object.entries(T.overlays).flatMap(([p, l]) => l.map((o) => ({ page: Number(p), o })));
export const fieldUses = (id: string) => allOverlays().reduce((n, { o }) => n + fieldsIn(o.tplHtml || o.html).filter((x) => x === id).length, 0);
const repintarTodo = (T: IDocumento = ed()) => { for (let i = 0; i < T.count; i++) M.renderOverlaysFor(i); };
// Envuelve un texto en un campo dentro de un objeto (devuelve cuántas veces)
function marcar(o: IObjeto, text: string, fid: string) { const r = wrapText(o.html || '', text, fid); o.html = r.html; return r.n; }

// ============================================================================
// Diseño
// ============================================================================
export function enterDesign(def?: { name: string; fields: ICampo[] }) {
  const T = ed();
  if (!T.bytes) return toast('Abre primero el documento que quieres convertir en plantilla.');
  if (T.tpl?.mode === 'fill') return toast('Esta pestaña está llenando una plantilla. Usa «Editar plantilla».');
  if (T.ai) T.ai.open = false;
  T.tpl = { mode: 'design', def: def || { name: nombreBase(T.name), fields: [] }, values: {}, status: {} };
  M.setTool('edittext'); tocar();
  const p = document.getElementById('edPanel'); if (p) p.scrollTop = 0;
}
export function exitDesign() { const T = ed(); if (T.editing) M.stopEditing(); T.tpl = null; M.setTool('select'); tocar(); }
export function terminarDiseno() {
  if (!ed().tpl?.dirty) return exitDesign();
  abrirModal(<SalirSinGuardar alSalir={exitDesign} alGuardar={saveTemplate} />, { clave: 'modal-92' });
}

// Selección actual dentro del párrafo que se está editando
function currentSelection() {
  const T = ed(); const o = T.editing ? M.findOv(T.editing) : undefined; if (!o) return null;
  const rt = document.querySelector(`.ov[data-id="${o.id}"] .rt`); const s = getSelection();
  if (!rt || !s || !s.rangeCount || s.isCollapsed) return null;
  const r = s.getRangeAt(0); if (!rt.contains(r.commonAncestorContainer)) return null;
  const anc = r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer as Element : r.commonAncestorContainer.parentElement!;
  if (anc.closest('.pf-field')) return { inField: true as const };
  return { o, rt, range: r.cloneRange(), text: r.toString() };
}
export function convertSelection() {
  const sel = currentSelection();
  if (!sel) return toast('Haz clic en un párrafo y selecciona con el mouse las palabras que serán el campo.', 4500);
  if ('inField' in sel) return toast('Esas palabras ya son un campo.');
  const text = sel.text.replace(/\s+$/, '').replace(/^\s+/, '');
  if (!text) return toast('Selecciona al menos una palabra.');
  const T = ed();
  fieldDialog({ sample: text, onDone: (f) => {
    const { range, rt, o } = sel;
    const span = document.createElement('span'); span.className = 'pf-field'; span.dataset.field = f.id; span.contentEditable = 'false'; span.textContent = text;
    const lead = sel.text.match(/^\s*/)![0], trail = sel.text.match(/\s*$/)![0];
    range.deleteContents(); const frag = document.createDocumentFragment();
    if (lead) frag.append(lead); frag.append(span); if (trail) frag.append(trail);
    range.insertNode(frag); rt.normalize();
    o.html = rt.innerHTML; T.tpl!.dirty = true; setDirty(true);
    offerRepeats(f, text);
  } });
}
export function fieldDialog({ field, sample, onDone }: { field?: ICampo; sample?: string; onDone?: (f: ICampo) => void }) {
  const T = ed();
  abrirModal(<CampoForm campo={field} muestra={sample} existentes={T.tpl!.def.fields} alListo={(f, nuevo) => {
    if (field || nuevo) { if (nuevo) T.tpl!.def.fields.push(f); T.tpl!.dirty = true; tocar(); }
    onDone?.(f);
  }} />, { clave: 'modal-93' });
}
export function removeField(id: string) {
  const T = ed();
  for (const { o } of allOverlays()) if (fieldsIn(o.html).includes(id)) o.html = quitarCampo(o.html!, id);
  T.tpl!.def.fields = T.tpl!.def.fields.filter((f) => f.id !== id); T.tpl!.dirty = true;
  repintarTodo(); tocar();
}
// El mismo dato suele repetirse (el nombre del arrendatario aparece 5 veces): se ofrece marcarlo en todas.
async function offerRepeats(f: ICampo, text: string) {
  if (text.length < 3) return;
  const T = ed();
  const target = normText(text).replace(/\s+/g, ' ').trim();
  const opened = allOverlays().filter(({ o }) => o.type === 'rich' && normText(textoSinCampos(o.html || '')).replace(/\s+/g, ' ').includes(target));
  const usedBlocks = new Set(allOverlays().map(({ page, o }) => page + ':' + o.blockId));
  const closed: { page: number; b: Awaited<ReturnType<typeof blocksFor>>[number] }[] = [];
  for (let i = 0; i < T.count; i++) {
    let bl: Awaited<ReturnType<typeof blocksFor>> = []; try { bl = await blocksFor(T, i); } catch { /* página ilegible */ }
    for (const b of bl) if (!usedBlocks.has(i + ':' + b.id) && normText(b.text).replace(/\s+/g, ' ').includes(target)) closed.push({ page: i, b });
  }
  const n = opened.length + closed.length; if (!n || ed() !== T) return;
  abrirModal(<Confirmar icono="template" titulo="El mismo dato aparece en otras partes" boton="Sí, en todas" alAceptar={async () => {
    await step('Marcando el campo en el documento…', async () => {
      const keep = T.current; let count = 0;
      const byPage: Record<number, typeof closed[number]['b'][]> = {}; for (const c of closed) (byPage[c.page] ||= []).push(c.b);
      for (const [p, bl] of Object.entries(byPage)) { const os = await M.openBlocks(Number(p), bl); for (const o of os) count += marcar(o, text, f.id); }
      for (const { o } of opened) count += marcar(o, text, f.id);
      if (T.current !== keep) M.goto(keep);
      repintarTodo(); T.tpl!.dirty = true; setDirty(true);
      toast(`Campo «${f.label}» agregado en ${count} lugar(es) más.`);
    });
  }}>
    <p className={P}>«{text.slice(0, 80)}» aparece en <strong>{n}</strong> párrafo(s) más del documento.</p><p className={NOTA}>¿Usar el campo «{f.label}» también ahí? Así se llena una sola vez.</p>
  </Confirmar>, { clave: 'modal-94' });
}

// ============================================================================
// Detectar campos con IA: el asistente lee el documento y propone los campos;
// el usuario revisa la lista y se marcan todas las apariciones de una vez.
// ============================================================================
export async function detectWithAi() {
  if (!esMiembro()) return pedirSesion(detectWithAi, 'Detectar campos con IA es exclusivo para clientes de Portalfirma. Inicia sesión con tu cuenta.');
  const A = asistenteIA;
  const T = ed(); if (T.editing) M.stopEditing();
  const s = await A.status(true);
  if (!s.hasKey) return toast('El asistente no está configurado. Abre «Asistente» → Ajustes.', 5000);
  if (!(await A.ensureConsent())) return;
  let list: IDetectado[] | null = null;
  await step('La IA está buscando los datos variables del documento…', async () => {
    const { text } = await A.docText();
    if (!text.replace(/\[Página \d+\]/g, '').trim()) throw new Error('El documento no tiene texto legible. Si es una fotocopia, usa primero «Reconocer texto».');
    const out = A.parseJson(await A.ask({ action: 'detect', system: A.SYSTEM, messages: [{ role: 'user', content: promptDetectar(text) }], json: true }));
    const flat = normText(text).replace(/\s+/g, ' ');
    const taken = new Set(T.tpl!.def.fields.flatMap((f) => [normText(f.sample || '').trim()]));
    list = (Array.isArray(out.campos) ? out.campos : []).map((c: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any -- JSON de la IA
      const aps = [...new Set<string>((c.apariciones || []).map((x: unknown) => String(x || '').replace(/\s+/g, ' ').trim()).filter((x: string) => x.length >= 2))]
        .filter((x) => flat.includes(normText(x)) && !taken.has(normText(x)));
      if (!aps.length || !c.etiqueta) return null;
      const g = guessField(aps[0]); const type = (FIELD_TYPES as Record<string, string>)[c.tipo] ? c.tipo : g.type;
      const signer = c.firmante && c.firmante.rol && SIGNER_ATTRS[c.firmante.dato] ? { role: String(c.firmante.rol).trim(), attr: c.firmante.dato } : null;
      return { label: String(c.etiqueta).trim().slice(0, 60), type, format: type === g.type ? g.format || {} : {}, aps, signer, on: true };
    }).filter(Boolean);
  });
  const l = list as IDetectado[] | null;
  if (!l || ed() !== T) return;
  if (!l.length) return toast('La IA no encontró datos variables nuevos en el documento.', 5000);
  abrirModal(<CamposDetectados lista={l} alCrear={(sel) => { applyDetected(sel); }} />, { clave: 'modal-95' });
}

// Crea los campos y marca todas sus apariciones (primero los textos más largos, para que
// «MARIA GONZALEZ ROJAS» no quede partido por un campo «MARIA»).
export async function applyDetected(list: IDetectado[], { quiet = false } = {}) {
  if (!list.length) return { made: 0, missing: [] as string[] };
  let made = 0, marks = 0; const missing: string[] = [];
  await step('Marcando los campos en el documento…', async () => {
    const T = ed();
    if (!quiet) M.snapshot();
    const keep = T.current;
    const fields = list.map((c) => ({ f: { id: newFieldId(), sample: c.aps[0], label: c.label, type: c.type, format: c.format, required: true, signer: c.signer } as ICampo, c }));
    const jobs = fields.flatMap(({ f, c }) => c.aps.map((text) => ({ f, text }))).sort((a, b) => b.text.length - a.text.length);
    const hits = new Map<string, number>();
    for (const { f, text } of jobs) {
      const target = normText(text).replace(/\s+/g, ' ');
      const usedBlocks = new Set(allOverlays().map(({ page, o }) => page + ':' + o.blockId));
      for (let i = 0; i < T.count; i++) {
        let bl: Awaited<ReturnType<typeof blocksFor>> = []; try { bl = await blocksFor(T, i); } catch { /* página ilegible */ }
        const closed = bl.filter((b) => !usedBlocks.has(i + ':' + b.id) && normText(b.text).replace(/\s+/g, ' ').includes(target));
        if (closed.length) await M.openBlocks(i, closed);
        for (const o of T.overlays[i] || []) if (o.type === 'rich' && !o.locked) { const k = marcar(o, text, f.id); if (k) hits.set(f.id, (hits.get(f.id) || 0) + k); }
      }
    }
    for (const { f, c } of fields) {
      if (hits.get(f.id)) { T.tpl!.def.fields.push(f); made++; marks += hits.get(f.id)!; } else missing.push(c.label);
    }
    if (T.current !== keep) M.goto(keep);
    repintarTodo(); T.tpl!.dirty = true; setDirty(true);
  });
  if (!quiet) toast(`${made} campo(s) creados en ${marks} lugar(es).${missing.length ? ` No pude ubicar: ${missing.join(', ')} (márcalos a mano).` : ' Revisa la lista y guarda la plantilla.'}`, 7000);
  return { made, missing };
}

// ============================================================================
// Documento redactado por la IA (o desde un modelo) → se abre directo como formulario
// (si `T0` viene, se rehace en esa misma pestaña conservando los datos ya escritos)
// ============================================================================
export async function buildAiDoc(spec: ISpec, T0?: IDocumento) {
  let ok = false; const prev = ed(); let T: IDocumento | null = T0 || null;
  const old = T0?.tpl ? Object.fromEntries(T0.tpl.def.fields.map((f) => [f.label, T0.tpl!.values[f.id]]).filter(([, v]) => v != null && v !== '')) : {};
  await step(T0 ? 'Actualizando el documento…' : 'Preparando el formulario…', async () => {
    const r = await editorArchivos.iaBorradorPdf(specHtml(spec), spec.titulo.slice(0, 60)); if (!r.ok) throw new Error(r.error);
    if (!T) { T = nuevoDocumento(); nuevaPestana(T); irAlEditor(); }
    else { editorEstado().editorUsar(T); if (T.editing) M.stopEditing(); T.overlays = {}; T.tpl = null; T.blocks = {}; T.ocr = {}; }
    const D = T;
    D.name = spec.titulo.charAt(0) + spec.titulo.slice(1).toLowerCase() + '.pdf'; D.path = null;
    await setBytes(new Uint8Array(r.data!.bytes), { keepPage: !!T0, structural: true, T: D });
    // marcar los [Etiqueta] del texto como campos
    D.tpl = { mode: 'design', def: { name: spec.titulo, fields: [] }, values: {}, status: {} };
    const inText = spec.campos.filter((c) => !c.solo_formulario);
    const list: IDetectado[] = inText.map((c) => {
      const type = ((FIELD_TYPES as Record<string, string>)[c.tipo] ? c.tipo : 'texto') as ICampo['type'];
      const format = type === 'monto' ? { words: true } : type === 'fecha' ? { date: 'largo' } : type === 'numero' ? { words: false } : { case: 'normal' };
      return { label: c.etiqueta, type, format, aps: ['[' + c.etiqueta + ']'], signer: c.firmante ? { role: c.firmante.rol, attr: c.firmante.dato } : null, on: true };
    });
    const res = await applyDetected(list, { quiet: true });
    if (res.missing.length) console.warn('campos sin ubicar', res.missing);
    const extra: ICampo[] = spec.campos.filter((c) => c.solo_formulario).map((c) => ({ id: newFieldId(), label: c.etiqueta, type: ((FIELD_TYPES as Record<string, string>)[c.tipo] ? c.tipo : 'texto') as ICampo['type'], format: {}, required: c.tipo !== 'email', signer: c.firmante ? { role: c.firmante.rol, attr: c.firmante.dato } : null, sample: '' }));
    for (const f of D.tpl.def.fields) f.sample = ''; // el ejemplo es solo «[Etiqueta]»
    const tpl: IPlantillaArchivo = { v: 1, app: 'PortalFirma Asset', name: spec.titulo, fields: [...D.tpl.def.fields, ...extra], blocks: templateBlocks() };
    await materialize(tpl, 'fill');
    for (const f of D.tpl!.def.fields) {
      const c = spec.campos.find((x) => x.etiqueta === f.label);
      const v = old[f.label] ?? (c?.valor != null ? String(c.valor) : null);
      if (v != null && v !== '') D.tpl!.values[f.id] = f.type === 'fecha' && !/^\d{4}-\d{2}-\d{2}$/.test(v) ? '' : String(v).replace(f.type === 'monto' ? /[^\d]/g : /^$/, '');
    }
    D.aiDoc = spec;
    D.notice = spec.modelo ? `Documento basado en el modelo «${spec.modelo.nombre}» de Portalfirma. Completa los datos en el panel derecho. Las firmas se agregan al enviar a firmar.` : 'Documento redactado por el asistente. Completa los datos en el panel derecho y revisa el texto antes de firmar. Las firmas se agregan al enviar a firmar.';
    await activate();
    await applyValues(true);
    ok = true;
  });
  if (!ok && !T0 && T && ed() !== prev && !ed().bytes) await descartarPestana(T, prev);
  return ok;
}

// ---------- Guardar ----------
function templateBlocks() {
  const blocks: { page: number; o: IObjeto }[] = [];
  for (const { page, o } of allOverlays()) {
    if (o.type !== 'rich' || !fieldsIn(o.html).length) continue;
    const el = document.querySelector(`.ov[data-id="${o.id}"]`); if (el) M.syncRichHeight(o, el);
    const { id, tplHtml, locked, baseSize, maxBottom, ...rest } = o; void id; void tplHtml; void locked; void baseSize; void maxBottom;
    blocks.push({ page, o: JSON.parse(JSON.stringify(rest)) });
  }
  return blocks;
}
export function saveTemplate() {
  const T = ed();
  if (T.editing) M.stopEditing();
  const blocks = templateBlocks();
  const used = new Set(blocks.flatMap((b) => fieldsIn(b.o.html)));
  const fields = T.tpl!.def.fields.filter((f) => used.has(f.id));
  if (!fields.length) return toast('Agrega al menos un campo antes de guardar la plantilla.', 4000);
  abrirModal(<GuardarPlantilla nombre={T.tpl!.def.name || nombreBase(T.name)} campos={fields.length} parrafos={blocks.length} alGuardar={async (name) => {
    if (name !== T.tpl!.def.saved && (await editorArchivos.plantillaExiste(name)).data) {
      const go = await new Promise<boolean>((res) => abrirModal(<Confirmar icono="alert" tonoIcono="amarillo" titulo={`Ya existe «${name}»`} boton="Reemplazar" alAceptar={() => res(true)} alCancelar={() => res(false)}><p className={P}>¿Reemplazar la plantilla guardada?</p></Confirmar>, { clave: 'modal-97' }));
      if (!go) return;
    }
    await step('Guardando plantilla…', async () => {
      const tpl = { v: 1, app: 'PortalFirma Asset', name, fields, blocks };
      const doc = await cargarPdf(await M.bakeDoc(false));
      await doc.attach(new TextEncoder().encode(JSON.stringify(tpl)), TPL_FILE, { mimeType: 'application/json', description: 'Plantilla de PortalFirma Asset', creationDate: new Date(), modificationDate: new Date() });
      const bytes = await guardarPdf(doc);
      const r = await editorArchivos.plantillaGuardar(name, bytes, { fields: fields.length, pages: T.count, signers: [...new Set(fields.filter((f) => f.signer).map((f) => f.signer!.role))] });
      if (!r.ok) throw new Error(r.error);
      T.tpl!.def.name = name; T.tpl!.def.saved = name; T.tpl!.dirty = false; T.tpl!.file = r.data; tocar();
      abrirModal(<PlantillaGuardada nombre={name} alExportar={() => { editorArchivos.guardarComo(bytes, name + ' (plantilla).pdf'); }} alLlenar={() => { openTemplateFile(r.data!, 'fill'); }} />, { clave: 'modal-98' });
    });
  }} />, { clave: 'modal-96' });
}

// ============================================================================
// Abrir una plantilla (para llenarla o editarla)
// ============================================================================
export async function openTemplateFile(file: string, mode: 'design' | 'fill') {
  const r = await editorArchivos.plantillaLeer(file); if (!r.ok) return toast(r.error || '', 5000);
  return openTemplateBytes(r.data!, mode);
}
export async function openTemplateBytes(bytes: Uint8Array, mode: 'design' | 'fill', tplKnown?: IPlantillaArchivo) {
  let ok = false; const prev = ed(); let T: IDocumento | null = null;
  await step('Abriendo plantilla…', async () => {
    T = nuevoDocumento(); nuevaPestana(T); irAlEditor();
    await setBytes(new Uint8Array(bytes), { keepPage: false, structural: true, T });
    const tpl = tplKnown || await readTemplate(T.pdf);
    if (!tpl) throw new Error('Este archivo no es una plantilla de PortalFirma Asset.');
    T.name = tpl.name + (mode === 'fill' ? '' : ' (plantilla)') + '.pdf';
    await materialize(tpl, mode);
    ok = true;
  });
  if (!ok && T && editorEstado().pestanas.includes(T)) await descartarPestana(T, prev);
  return ok;
}
// Borra del PDF el texto de ejemplo de los párrafos con campos y los vuelve objetos de texto.
async function materialize(tpl: IPlantillaArchivo, mode: 'design' | 'fill') {
  const T = ed(); const byPage: Record<number, IPlantillaArchivo['blocks']> = {};
  for (const b of tpl.blocks) (byPage[b.page] ||= []).push(b);
  T.overlays = {};
  for (const [p, list] of Object.entries(byPage)) {
    const page = Number(p);
    const rects = list.map(({ o }) => { const c = o.cover || o; const x = Math.min(c.x, o.x), y = Math.min(c.y, o.y); return { x, y, w: Math.max(c.x + c.w, o.x + o.w) - x, h: Math.max(c.y + c.h, o.y + o.h) - y }; });
    try { await M.removeOriginal(page, rects); } catch (e) { console.warn(e); }
  }
  // espacio libre bajo cada párrafo (hasta el siguiente texto o el margen inferior)
  for (const [p, list] of Object.entries(byPage)) {
    const page = Number(p); const v = await vp1(T, page);
    let others: Awaited<ReturnType<typeof detectDigitalBlocks>> = []; try { others = await detectDigitalBlocks(T, page); } catch { /* página ilegible */ }
    for (const b of list) {
      const o: IObjeto = { ...JSON.parse(JSON.stringify(b.o)), id: M.nuevoId(), transparent: true };
      const bottom = Math.max(o.y + o.h, o.cover ? o.cover.y + o.cover.h : 0);
      // lo que hay debajo: texto que quedó en el PDF y los otros párrafos de la plantilla
      const boxes = [...others.map((x) => x.box), ...list.filter((x) => x !== b).map((x) => x.o.cover || x.o)];
      const below = boxes.filter((q) => q.y >= bottom - 2 && q.x < o.x + o.w && q.x + q.w > o.x).map((q) => q.y);
      o.maxBottom = (below.length ? Math.min(...below) - 2 : v.height - 36);
      if (mode === 'fill') { o.tplHtml = o.html; o.locked = true; o.baseSize = o.size; }
      (T.overlays[page] ||= []).push(o);
    }
  }
  T.tpl = { mode, def: { name: tpl.name, fields: tpl.fields, saved: tpl.name }, values: {}, status: {}, errs: {}, src: tpl };
  if (T.ai) T.ai.open = false;
  T.undo = []; T.dirty = false;
  M.setTool(mode === 'design' ? 'edittext' : 'select');
  repintarTodo(T);
  if (mode === 'fill') await applyValues(true);
  setDirty(false);
}
// «Editar plantilla» desde el formulario (o «Guardar como plantilla…» de un documento redactado)
export function aDiseno() { const t = ed().tpl; if (t?.src) materialize(t.src, 'design'); }
// Al abrir un PDF cualquiera: si trae una plantilla, se ofrece llenarla.
export async function comprobarPlantilla(T: IDocumento) {
  const tpl = await readTemplate(T.pdf); if (!tpl || ed() !== T) return;
  abrirModal(<PlantillaAbierta nombre={tpl.name} campos={tpl.fields.length} alElegir={async (mode) => {
    T.name = tpl.name + (mode === 'fill' ? '' : ' (plantilla)') + '.pdf'; T.path = null; await step('Abriendo plantilla…', () => materialize(tpl, mode));
  }} />, { clave: 'modal-99' });
}

// ============================================================================
// Llenado
// ============================================================================
const sustituir = (T: IDocumento, html: string, final: boolean) => substitute(html, T.tpl!.def.fields, T.tpl!.values, T.tpl!.status, final);
let fitTimer = 0;
export async function applyValues(now?: boolean) {
  const T = ed(); if (T.tpl?.mode !== 'fill') return;
  for (const { o } of allOverlays(T)) if (o.tplHtml) o.html = sustituir(T, o.tplHtml, false);
  repintarTodo(T);
  clearTimeout(fitTimer);
  const run = async () => { if (ed() !== T || !T.tpl) return; await fitAll(); for (const { o } of allOverlays(T)) if (o.tplHtml) o.html = sustituir(T, o.tplHtml, false); repintarTodo(T); updateFillStatus(); };
  if (now) await run(); else fitTimer = window.setTimeout(run, 200);
}
// Reglas para que no se descomponga: reacomodar en el párrafo, usar el blanco de abajo, achicar hasta medio punto, si no avisar.
async function fitAll() {
  const T = ed(); const st: Record<string, { overflow: boolean }> = {};
  for (const f of T.tpl!.def.fields) st[f.id] = { overflow: false };
  for (const { o } of allOverlays(T)) {
    if (!o.tplHtml) continue;
    o.size = o.baseSize; o.shrunk = 0; o.overflow = false;
    const limit = o.maxBottom! - o.y;
    const measure = async () => (await layoutRich({ ...o, html: sustituir(T, o.tplHtml!, true) })).height;
    let h = await measure();
    if (h > limit + 0.5) {
      for (const d of [0.25, MAX_SHRINK]) { o.size = o.baseSize! - d; h = await measure(); if (h <= limit + 0.5) { o.shrunk = d; break; } }
      if (h > limit + 0.5) {
        o.size = o.baseSize; o.overflow = true;
        // se marca el dato que creció respecto del ejemplo (si ninguno, todos los del párrafo)
        const ids = [...new Set(fieldsIn(o.tplHtml))];
        const grown = ids.filter((id) => { const f = T.tpl!.def.fields.find((x) => x.id === id); return f && formatField(f, T.tpl!.values[id]).text.length > (f.sample || '').length + 2; });
        for (const id of grown.length ? grown : ids) if (st[id]) st[id].overflow = true;
      }
    }
  }
  T.tpl!.status = st;
}
// El error que se ve bajo un dato (strict: al salir del campo o al generar)
export function showErr(id: string, strict: boolean) {
  const t = ed().tpl; if (!t) return;
  const f = t.def.fields.find((x) => x.id === id); if (!f) return;
  const r = formatField(f, t.values[id]); const of = t.status[id]?.overflow;
  const msg = of ? 'No cabe en el espacio del documento: acorta el dato' : (r.error && (strict || !r.empty) && !(r.empty && !strict)) ? r.error : '';
  (t.errs ||= {})[id] = msg; tocar();
}
function updateFillStatus() {
  const t = ed().tpl; if (!t || t.mode !== 'fill') return;
  for (const f of t.def.fields) if (t.status[f.id]?.overflow || t.errs?.[f.id]) showErr(f.id, false);
  tocar();
}
// Lo que dice el estado bajo el formulario
export function estadoLlenado(T: IDocumento) {
  const t = T.tpl!;
  const filled = t.def.fields.filter((f) => !formatField(f, t.values[f.id]).empty).length;
  const all = allOverlays(T);
  return { filled, total: t.def.fields.length, shr: all.filter(({ o }) => o.shrunk).length, ovf: all.filter(({ o }) => o.overflow).length };
}
export function cambiarValor(id: string, v: string, strict: boolean) {
  const t = ed().tpl; if (!t) return;
  t.values[id] = v; applyValues(); showErr(id, strict);
}
// Un clic sobre un campo en el documento lleva a su dato en el formulario
export function focoCampo(id: string) { const el = document.querySelector(`[data-in="${id}"]`) as HTMLElement | null; if (el) { el.focus(); el.scrollIntoView({ block: 'center' }); } }

export async function generate() {
  const src = ed(); const t = src.tpl!; await fitAll();
  let bad = 0;
  for (const f of t.def.fields) { showErr(f.id, true); if (t.errs?.[f.id]) bad++; }
  updateFillStatus();
  if (bad) { toast(`Revisa ${bad} campo(s) marcado(s) en rojo.`, 4000); setTimeout(() => (document.querySelector('.tf.bad [data-in]') as HTMLElement | null)?.focus(), 30); return; }
  const signers = firmantesDe(t.def.fields, t.values);
  const first = t.def.fields.find((f) => f.type === 'texto' && t.values[f.id]);
  const name = `${t.def.name}${first ? ' - ' + formatField(first, t.values[first.id]).text : ''}`.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 120) + '.pdf';
  const overlays: Record<number, IObjeto[]> = {};
  for (const [p, list] of Object.entries(src.overlays)) overlays[Number(p)] = list.map((o) => { const c = { ...o, cover: o.cover && { ...o.cover } }; if (o.tplHtml) { c.html = sustituir(src, o.tplHtml, true); delete c.tplHtml; delete c.locked; } return c; });
  await step('Generando documento…', async () => {
    const T = nuevoDocumento(); T.name = name; nuevaPestana(T); irAlEditor();
    await setBytes(src.bytes!.slice(), { keepPage: false, T });
    T.overlays = overlays; T.signers = signers;
    await M.bakeAll();
    T.dirty = true;
    T.notice = `Documento generado desde la plantilla «${t.def.name}». Revísalo y guárdalo o presiona «Enviar a firmar»${signers.length ? ` (los ${signers.length} firmante(s) ya vienen cargados)` : ''}.`;
    await activate();
  });
}

// ============================================================================
// Mis plantillas (inicio) e importar desde Google Drive
// ============================================================================
export const exportarPlantilla = async (file: string) => { const r = await editorArchivos.plantillaLeer(file); if (r.ok) editorArchivos.guardarComo(r.data!, nombreDeRuta(file).replace(/\.pdf$/, ' (plantilla).pdf')); };
export function borrarPlantilla(file: string, nombre: string, despues: () => void) {
  abrirModal(<Confirmar icono="trash" tonoIcono="rojo" titulo="Eliminar plantilla" boton="Eliminar" peligro alAceptar={async () => { await editorArchivos.plantillaBorrar(file); despues(); }}>
    <p className={P}>¿Eliminar «{nombre}» de Mis plantillas? Los documentos ya generados no se afectan.</p>
  </Confirmar>, { clave: 'modal-100' });
}
// Google Drive: el explorador está en components/functional/drive; desde aquí se abre para convertir un documento en plantilla
export const driveDialog = () => window.Drive.open({ purpose: 'template' });
export async function importFromDrive(f: { id: string; name: string }) {
  let file: string | null = null;
  await step(`Descargando «${f.name}» desde Google Drive…`, async () => { const r = await editorArchivos.descargarDeDrive(f.id); if (!r.ok) throw new Error(r.error); file = r.data!; });
  if (!file) return;
  const before = editorEstado().pestanas.length;
  irAlEditor();
  await addFiles([file], { replace: true });
  if (editorEstado().pestanas.length === before && !ed().bytes) return;
  enterDesign();
  abrirModal(<Importada nombre={f.name} alDetectar={detectWithAi} />, { clave: 'modal-101' });
}

// window.Plantillas de siempre (home.js, Drive, las pruebas)
export function instalarPlantillas() {
  (window as unknown as { Plantillas: object }).Plantillas = {
    driveDialog, importFromDrive, buildAiDoc, detectWithAi, _applyDetected: applyDetected, enterDesign, exitDesign, focusField: focoCampo,
    checkOpened: comprobarPlantilla, openTemplateFile, openTemplateBytes,
    _formatField: formatField, _numeroALetras: numeroALetras, _montoEnPalabras: montoEnPalabras, _guessField: guessField,
    _wrapText: (o: IObjeto, text: string, fid: string) => marcar(o, text, fid),
  };
}
