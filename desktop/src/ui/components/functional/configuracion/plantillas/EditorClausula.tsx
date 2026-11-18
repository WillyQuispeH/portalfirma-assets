// Editor enriquecido de una cláusula (tipo Word, con TipTap): negrita, cursiva, lista, datos como fichas y partes
// condicionales. La persona nunca ve el formato guardado («# », «**», «{{dato}}»…): formatoClausula.ts convierte
// texto → documento al abrir y documento → texto en cada cambio (alCambiar recibe el texto ya en el formato de la API).
//   <EditorClausula id="plTexto" tipo="clausula" texto={t} variables={d.variables} alCambiar={setT} />
//   <EditorClausula tipo="clausula" texto={base} soloLectura />           (la base, para comparar)
// El título («# …») va en un campo aparte arriba; si trae un prefijo en cursiva («__Primero ·__ Inmueble»), el prefijo se
// muestra fijo en cursiva y se edita solo el resto (así el título nunca muestra códigos).
// Ids para pruebas: #<id> (contiene .ProseMirror), #plTitulo, #plNegrita, #plCursiva, #plLista, #plInsertar,
// #plInsertarBuscar, [data-dato-opcion], #plDeshacer, #plRehacer; en el documento [data-dato], [data-cond], [data-condicional].
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { EditorContent, NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type Editor, type NodeViewProps } from '@tiptap/react';
import { Extension, Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Boton from '../../../ui/Boton';
import Input from '../../../ui/Input';
import Icono from '../../../ui/Icono';
import { cx } from '../../../../utils/cx';
import { ORDEN_GRUPOS, datoConocido, etiquetaDato, grupoDato, vistaInterior } from './datos';
import { docATexto, partirTitulo, prefijoLegible, textoADoc, type INodo } from './formatoClausula';

// ------------------------------------------------------------------ nodos propios

const FICHA = 'tw:inline tw:mx-px tw:px-1.5 tw:py-px tw:rounded-[6px] tw:font-sans tw:text-[0.86em] tw:font-semibold tw:whitespace-nowrap tw:select-none tw:cursor-default '
  + 'tw:[box-decoration-break:clone]';

/** un dato del documento: ficha con su nombre legible, se borra entera */
const Dato = Node.create({
  name: 'dato', group: 'inline', inline: true, atom: true, selectable: true,
  addAttributes() { return { nombre: { default: '', rendered: false } }; },
  parseHTML() { return [{ tag: 'span[data-dato]', getAttrs: (el) => ({ nombre: (el as HTMLElement).dataset.dato ?? '' }) }]; },
  renderHTML({ node }) {
    const n = String(node.attrs.nombre);
    return ['span', { 'data-dato': n, contenteditable: 'false', title: 'Dato que se completa solo en cada documento', class: cx(FICHA, 'tw:bg-brand-soft tw:text-brand') }, etiquetaDato(n)];
  },
  renderText({ node }) { return etiquetaDato(String(node.attrs.nombre)); },
});

const textoCondInline = (nombre: string, invertida: boolean, interior: string) =>
  `${invertida ? 'si no hay' : 'si hay'} ${etiquetaDato(nombre)}: “${vistaInterior(interior)}”`;

/** una parte condicional dentro de un párrafo («, RUT …» solo si hay RUT): ficha con vista previa, se borra entera */
const CondInline = Node.create({
  name: 'condInline', group: 'inline', inline: true, atom: true, selectable: true,
  addAttributes() {
    return { nombre: { default: '', rendered: false }, invertida: { default: false, rendered: false }, interior: { default: '', rendered: false } };
  },
  parseHTML() {
    return [{ tag: 'span[data-cond]', getAttrs: (el) => { const d = (el as HTMLElement).dataset; return { nombre: d.cond ?? '', invertida: d.invertida === '1', interior: d.interior ?? '' }; } }];
  },
  renderHTML({ node }) {
    const { nombre, invertida, interior } = node.attrs as { nombre: string; invertida: boolean; interior: string };
    const t = textoCondInline(nombre, invertida, interior);
    const corto = t.length > 70 ? t.slice(0, 68) + '…”' : t;
    return ['span', { 'data-cond': nombre, 'data-invertida': invertida ? '1' : '0', 'data-interior': interior, contenteditable: 'false',
      title: `Texto que aparece ${t}`, class: cx(FICHA, 'tw:whitespace-normal tw:font-medium tw:italic tw:bg-lav-soft tw:text-lav-softink') }, corto];
  },
  renderText({ node }) { return vistaInterior(String(node.attrs.interior)); },
});

function VistaCondicional({ node, editor, deleteNode }: NodeViewProps) {
  const { nombre, invertida } = node.attrs as { nombre: string; invertida: boolean };
  return (
    <NodeViewWrapper data-condicional={nombre} className="tw:my-2 tw:rounded-r-control tw:border-0 tw:border-l-[3px] tw:border-solid tw:border-l-lav-edge tw:bg-lav-soft/60 tw:py-1 tw:pl-3 tw:pr-1.5">
      <div contentEditable={false} className="tw:flex tw:select-none tw:items-center tw:gap-2 tw:font-sans tw:text-[11.5px] tw:font-semibold tw:text-lav-softink">
        <span className="tw:flex-1">{invertida ? 'Solo aparece si NO hay' : 'Solo aparece si hay'}: {etiquetaDato(nombre)}</span>
        {editor.isEditable && (
          <button type="button" title="Quitar esta parte" aria-label="Quitar esta parte" onClick={() => deleteNode()}
            className="tw:grid tw:h-6 tw:w-6 tw:cursor-pointer tw:place-items-center tw:rounded-icono tw:border-0 tw:bg-transparent tw:p-0 tw:text-lav-softink tw:hover:bg-hover">
            <Icono nombre="trash" tam={13} />
          </button>
        )}
      </div>
      <NodeViewContent className="tw:min-h-[1em]" />
    </NodeViewWrapper>
  );
}

/** una parte que solo aparece si hay (o si no hay) un dato; adentro, párrafos y listas editables */
const Condicional = Node.create({
  name: 'condicional', group: 'block', content: 'block+', defining: true, isolating: true,
  addAttributes() { return { nombre: { default: '', rendered: false }, invertida: { default: false, rendered: false } }; },
  parseHTML() {
    return [{ tag: 'div[data-condicional]', getAttrs: (el) => ({ nombre: (el as HTMLElement).dataset.condicional ?? '', invertida: (el as HTMLElement).dataset.invertida === '1' }) }];
  },
  renderHTML({ node }) { return ['div', { 'data-condicional': node.attrs.nombre, 'data-invertida': node.attrs.invertida ? '1' : '0' }, 0]; },
  addNodeView() { return ReactNodeViewRenderer(VistaCondicional); },
});

/** la comparecencia es un solo párrafo: Enter hace salto de línea */
const DocUnParrafo = Node.create({ name: 'doc', topNode: true, content: 'paragraph' });
const EnterSalto = Extension.create({
  name: 'enterSalto',
  addKeyboardShortcuts() { return { Enter: () => this.editor.commands.setHardBreak() }; },
});

function extensiones(comparecencia: boolean) {
  const base = StarterKit.configure({
    heading: false, blockquote: false, codeBlock: false, code: false, horizontalRule: false, strike: false, orderedList: false, dropcursor: false,
    ...(comparecencia ? { document: false, bulletList: false, listItem: false } : {}),
  });
  return comparecencia ? [base, DocUnParrafo, EnterSalto, Dato, CondInline] : [base, Dato, CondInline, Condicional];
}

// ------------------------------------------------------------------ «Insertar dato»

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function InsertarDato({ variables, alElegir }: { variables: string[]; alElegir: (nombre: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const boton = useRef<HTMLButtonElement>(null);
  const caja = useRef<HTMLDivElement>(null);

  const grupos = useMemo(() => {
    const f = sinTildes(q.trim());
    const lista = variables.filter(datoConocido).map((v) => ({ v, e: etiquetaDato(v), g: grupoDato(v) }))
      .filter((x) => !f || sinTildes(`${x.e} ${x.g}`).includes(f))
      .sort((a, b) => a.e.localeCompare(b.e, 'es'));
    return ORDEN_GRUPOS.map((g) => ({ g, items: lista.filter((x) => x.g === g) })).filter((x) => x.items.length);
  }, [variables, q]);

  useLayoutEffect(() => {
    if (!abierto || !boton.current) return;
    const r = boton.current.getBoundingClientRect();
    const ancho = 300;
    setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, document.documentElement.clientWidth - ancho - 8)) });
  }, [abierto]);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => { const t = e.target as globalThis.Node; if (!caja.current?.contains(t) && !boton.current?.contains(t)) setAbierto(false); };
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, [abierto]);

  const elegir = (v: string) => { setAbierto(false); setQ(''); alElegir(v); };
  const teclas = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setAbierto(false); boton.current?.focus(); return; }
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') { e.preventDefault(); const p = grupos[0]?.items[0]; if (p) elegir(p.v); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const lista = [...(caja.current?.querySelectorAll<HTMLButtonElement>('[data-dato-opcion]') ?? [])];
    const i = lista.indexOf(document.activeElement as HTMLButtonElement);
    const j = e.key === 'ArrowDown' ? Math.min(lista.length - 1, i + 1) : i - 1;
    e.preventDefault();
    if (j < 0) caja.current?.querySelector<HTMLInputElement>('input')?.focus(); else lista[j]?.focus();
  };

  return (
    <>
      <Boton ref={boton} id="plInsertar" variante="fantasma" tamano="sm" icono="plus" aria-haspopup="dialog" aria-expanded={abierto}
        title="Insertar un dato que se completa solo (nombre de la corredora, dirección, fecha…)"
        onMouseDown={(e) => e.preventDefault()} onClick={() => setAbierto((a) => !a)}>Insertar dato</Boton>
      {abierto && createPortal(
        <div ref={caja} role="dialog" aria-label="Insertar un dato" data-menu-mas onKeyDown={teclas} style={{ top: pos.top, left: pos.left }}
          className="tw:fixed tw:z-[90] tw:flex tw:max-h-[min(420px,60vh)] tw:w-[300px] tw:flex-col tw:gap-1.5 tw:rounded-card tw:border tw:border-b-[3px] tw:border-solid tw:border-edge tw:border-b-edge-b tw:bg-card tw:p-1.5 tw:shadow-[0_16px_40px_-12px_rgb(16_24_64/.28)] tw:animate-[menu-entra_.16s_cubic-bezier(.25,1,.5,1)]">
          <Input id="plInsertarBuscar" type="search" icono="search" placeholder="Buscar un dato…" aria-label="Buscar un dato" autoFocus spellCheck={false}
            value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="tw:min-h-0 tw:flex-1 tw:overflow-y-auto">
            {!grupos.length && <p className="tw:m-0 tw:px-2.5 tw:py-3 tw:text-sm tw:text-muted">No hay datos con ese nombre.</p>}
            {grupos.map(({ g, items }) => (
              <div key={g} role="group" aria-label={g}>
                <div className="tw:px-2.5 tw:pb-0.5 tw:pt-2 tw:text-[11px] tw:font-semibold tw:uppercase tw:tracking-wide tw:text-muted">{g}</div>
                {items.map((x) => (
                  <button key={x.v} type="button" data-dato-opcion={x.v} onClick={() => elegir(x.v)}
                    className="tw:m-0 tw:flex tw:h-8 tw:w-full tw:cursor-pointer tw:items-center tw:rounded-control tw:border-0 tw:bg-transparent tw:px-2.5 tw:text-left tw:text-sm tw:font-medium tw:text-text tw:hover:bg-hover tw:focus-visible:bg-hover tw:focus-visible:outline-none">
                    <span className="tw:truncate">{x.e}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// ------------------------------------------------------------------ barra de herramientas

function Herramienta({ id, titulo, activo, disabled, onClick, icono, children }: {
  id: string; titulo: string; activo?: boolean; disabled?: boolean; onClick: () => void; icono?: string; children?: ReactNode;
}) {
  return (
    <Boton id={id} variante="fantasma" tamano="sm" icono={icono} title={titulo} aria-label={titulo} aria-pressed={activo ?? undefined} disabled={disabled}
      className={cx('tw:w-8 tw:px-0', activo && 'tw:bg-brand-soft tw:text-brand tw:enabled:hover:bg-brand-soft tw:enabled:hover:text-brand')}
      onMouseDown={(e) => e.preventDefault()} onClick={onClick}>{children}</Boton>
  );
}

function Barra({ editor, comparecencia, variables }: { editor: Editor; comparecencia: boolean; variables: string[] }) {
  const insertar = (nombre: string) => { editor.chain().focus().insertContent({ type: 'dato', attrs: { nombre } }).run(); };
  return (
    <div role="toolbar" aria-label="Formato del texto" className="tw:flex tw:flex-nowrap tw:items-center tw:gap-0.5 tw:overflow-x-auto tw:px-1.5 tw:pt-1.5">
      {/* N y K: como en Word en español */}
      <Herramienta id="plNegrita" titulo="Negrita (Ctrl+B)" activo={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
        <b className="tw:font-serif tw:text-[15px]">N</b>
      </Herramienta>
      <Herramienta id="plCursiva" titulo="Cursiva (Ctrl+I)" activo={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <i className="tw:font-serif tw:text-[15px] tw:font-semibold">K</i>
      </Herramienta>
      {!comparecencia && (
        <Herramienta id="plLista" titulo="Lista con viñetas" icono="listCheck" activo={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
      )}
      <span aria-hidden className="tw:mx-1 tw:h-5 tw:w-px tw:bg-edge" />
      <InsertarDato variables={variables} alElegir={insertar} />
      <span className="tw:flex-1" />
      <Herramienta id="plDeshacer" titulo="Deshacer (Ctrl+Z)" icono="undo" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()} />
      <Herramienta id="plRehacer" titulo="Rehacer (Ctrl+Y)" icono="rotateR" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()} />
    </div>
  );
}

// ------------------------------------------------------------------ el editor

// el documento: tipografía serif como el PDF; párrafos, listas y la ficha seleccionada
const HOJA = 'tw:font-[Georgia,\'Times_New_Roman\',serif] tw:text-[14px] tw:leading-[1.6] tw:text-text '
  + 'tw:[&_.ProseMirror]:outline-none tw:[&_.ProseMirror]:min-h-[120px] tw:[&_.ProseMirror]:whitespace-pre-wrap '
  + 'tw:[&_p]:my-2 tw:[&_p:first-child]:mt-0 tw:[&_p:last-child]:mb-0 '
  + 'tw:[&_ul]:my-2 tw:[&_ul]:pl-6 tw:[&_ul]:list-disc tw:[&_li_p]:my-0.5 '
  + 'tw:[&_strong_[data-dato]]:font-black '
  + 'tw:[&_.ProseMirror-selectednode]:ring-2 tw:[&_.ProseMirror-selectednode]:ring-brand/60 tw:[&_.ProseMirror-selectednode]:rounded-[6px]';

interface IEditorClausulaProps {
  /** id del área del documento (contiene .ProseMirror) */
  id?: string;
  tipo: string;
  /** el texto en el formato de la API */
  texto: string | null | undefined;
  /** los datos de la plantilla (para «Insertar dato») */
  variables?: string[];
  soloLectura?: boolean;
  alCambiar?: (texto: string) => void;
  etiqueta?: string;
}

export default function EditorClausula({ id, tipo, texto, variables = [], soloLectura = false, alCambiar, etiqueta }: IEditorClausulaProps) {
  const comparecencia = tipo === 'comparecencia';
  const inicial = useMemo(() => textoADoc(texto, tipo), []); // solo al montar: los cambios de afuera los recarga el efecto de abajo
  const [titulo, setTitulo] = useState<string | null>(inicial.titulo);
  const tituloRef = useRef(inicial.titulo);
  const ultimo = useRef(texto ?? '');
  const avisar = useRef(alCambiar); avisar.current = alCambiar;

  const emitir = (ed: Editor) => {
    const t = docATexto(tituloRef.current, ed.getJSON() as INodo, tipo);
    ultimo.current = t;
    avisar.current?.(t);
  };

  const editor = useEditor({
    extensions: extensiones(comparecencia),
    content: inicial.doc as never,
    editable: !soloLectura,
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { 'aria-label': etiqueta ?? 'Texto de la cláusula', spellcheck: 'true', lang: 'es-CL' } },
    onUpdate: ({ editor: ed }) => emitir(ed),
  }, [comparecencia]);

  useEffect(() => { editor?.setEditable(!soloLectura); }, [editor, soloLectura]);

  // el texto cambió desde afuera (p. ej. «Volver a la base»): se recarga el documento
  useEffect(() => {
    const t = texto ?? '';
    if (!editor || t === ultimo.current) return;
    const p = textoADoc(t, tipo);
    ultimo.current = t;
    tituloRef.current = p.titulo; setTitulo(p.titulo);
    editor.commands.setContent(p.doc as never, false);
  }, [texto, tipo, editor]);

  const partes = partirTitulo(titulo ?? '');
  const cambiarTitulo = (resto: string) => {
    const nuevo = partes.prefijo + resto;
    tituloRef.current = nuevo; setTitulo(nuevo);
    if (editor) emitir(editor);
  };

  return (
    <div className="tw:flex tw:flex-col tw:gap-ui" data-editor-clausula={soloLectura ? 'lectura' : 'edicion'}>
      {!comparecencia && (soloLectura
        ? (titulo ? (
          <p className="tw:m-0 tw:font-[Georgia,'Times_New_Roman',serif] tw:text-[15px] tw:font-bold tw:text-text">
            {partes.prefijo && <i className="tw:font-normal">{prefijoLegible(partes.prefijo)} </i>}{partes.resto}
          </p>
        ) : null)
        : (
          <Input id="plTitulo" etiqueta="Título de la cláusula" value={partes.resto}
            onChange={(e) => cambiarTitulo(e.target.value.replace(/[\r\n]/g, ' '))} />
        ))}
      <div className={cx('tw:flex tw:flex-col tw:rounded-control',
        !soloLectura && 'tw:border-0 tw:border-b-2 tw:border-solid tw:border-b-edge tw:bg-gray-soft tw:transition-colors tw:focus-within:border-b-brand')}>
        {editor && !soloLectura && <Barra editor={editor} comparecencia={comparecencia} variables={variables} />}
        <div id={id} className={cx(HOJA, soloLectura ? 'tw:max-h-[260px] tw:overflow-y-auto tw:rounded-control tw:bg-sunken tw:px-4 tw:py-3'
          : 'tw:m-1.5 tw:cursor-text tw:rounded-[6px] tw:bg-card tw:px-4 tw:py-3 tw:shadow-[0_1px_2px_rgb(16_24_64/.08)]')}
          onClick={() => { if (!soloLectura && editor && !editor.isFocused) editor.commands.focus(); }}>
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
