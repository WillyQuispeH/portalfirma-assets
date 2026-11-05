// Formularios en ventana de las plantillas con campos (en el modal de la app, utils/modal.tsx).
// Los id (#fLabel, #fType, #fWords, #fSigner, #fRole, #fAttr, #tName, #mOk…) y las clases (.ai-det, .ai-det-lbl) los usan las pruebas.
import { useEffect, useRef, useState } from 'react';
import Icono from '../../../ui/Icono';
import { cerrarModal } from '../../../../utils/modal';
import { FIELD_TYPES, SIGNER_ATTRS, guessField, newFieldId } from '../../../../utils/editor-pdf/plantillas';
import type { ICampo, TTipoCampo } from '../../../../store/interfaces/editor.interface';

// Nuevo campo (desde una selección) o editar uno que ya existe
export function CampoForm({ campo, muestra, existentes, alListo }: { campo?: ICampo; muestra?: string; existentes: ICampo[]; alListo: (f: ICampo, nuevo: boolean) => void }) {
  const editando = !!campo;
  const g: Partial<ICampo> = campo || { ...guessField(muestra || ''), required: true };
  const roles = [...new Set(existentes.filter((x) => x.signer).map((x) => x.signer!.role))];
  const fo = g.format || {};
  const [existente, setExistente] = useState('');
  const [label, setLabel] = useState(g.label || ''); const [type, setType] = useState<TTipoCampo>(g.type || 'texto');
  const f2 = type === g.type ? fo : {};
  const [caso, setCaso] = useState(f2.case || 'normal'); const [fecha, setFecha] = useState(f2.date || 'largo');
  const [palabras, setPalabras] = useState(f2.words === 'solo' ? 'solo' : f2.words ? '1' : '');
  const [opciones, setOpciones] = useState((g.options || []).join('\n'));
  const [req, setReq] = useState(g.required !== false); const [firm, setFirm] = useState(!!g.signer);
  const [rol, setRol] = useState(g.signer?.role || roles[0] || '');
  const [attr, setAttr] = useState(g.signer?.attr || (g.type === 'rut' ? 'rut' : g.type === 'email' ? 'email' : g.type === 'telefono' ? 'phone' : 'fullName'));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { const t = setTimeout(() => ref.current?.select(), 30); return () => clearTimeout(t); }, []);
  const cambiarTipo = (t: TTipoCampo) => { setType(t); const f3 = t === g.type ? fo : {}; setCaso(f3.case || 'normal'); setFecha(f3.date || 'largo'); setPalabras(f3.words === 'solo' ? 'solo' : f3.words ? '1' : ''); };
  const ok = () => {
    if (existente) { cerrarModal(); alListo(existentes.find((x) => x.id === existente)!, false); return; }
    if (!label.trim()) { ref.current?.focus(); return; }
    const format: ICampo['format'] = {};
    if (type === 'texto') format.case = caso; if (type === 'fecha') format.date = fecha;
    if (type === 'monto' || type === 'numero') format.words = palabras === 'solo' ? 'solo' : !!palabras;
    const f: ICampo = editando ? campo! : { id: newFieldId(), sample: muestra, label: '', type: 'texto' };
    Object.assign(f, { label: label.trim(), type, format, required: req, options: type === 'opcion' ? opciones.split('\n').map((x) => x.trim()).filter(Boolean) : f.options,
      signer: firm && rol.trim() ? { role: rol.trim(), attr } : null });
    cerrarModal(); alListo(f, !editando);
  };
  return <>
    <h2>{editando ? 'Editar campo' : 'Nuevo campo'}</h2>
    {!editando && muestra ? <p className="muted small">Texto de ejemplo: «{muestra.slice(0, 120)}»</p> : null}
    {!editando && existentes.length ? <label>Usar un campo que ya existe<select id="fExisting" value={existente} onChange={(e) => setExistente(e.target.value)}><option value="">— Campo nuevo —</option>{existentes.map((x) => <option key={x.id} value={x.id}>{x.label} ({FIELD_TYPES[x.type]})</option>)}</select></label> : null}
    <div id="fNewBox" className={existente ? 'hidden' : ''}>
      <div className="grid2"><label>Nombre del campo<input id="fLabel" ref={ref} value={label} placeholder="Ej. Arrendatario: nombre" onChange={(e) => setLabel(e.target.value)} /></label>
        <label>Tipo<select id="fType" value={type} onChange={(e) => cambiarTipo(e.target.value as TTipoCampo)}>{Object.entries(FIELD_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label></div>
      <div id="fFmt">
        {type === 'texto' ? <label>Mayúsculas<select id="fCase" value={caso} onChange={(e) => setCaso(e.target.value)}><option value="normal">Como se escriba</option><option value="upper">TODO EN MAYÚSCULAS</option><option value="title">Nombre Propio</option></select></label>
          : type === 'fecha' ? <label>Formato<select id="fDate" value={fecha} onChange={(e) => setFecha(e.target.value)}><option value="largo">2 de octubre de 2026</option><option value="corto">02-10-2026</option><option value="barra">02/10/2026</option></select></label>
          : type === 'monto' ? <label>Formato<select id="fWords" value={palabras} onChange={(e) => setPalabras(e.target.value)}><option value="">$500.000</option><option value="1">$500.000 (quinientos mil pesos)</option><option value="solo">quinientos mil pesos</option></select></label>
          : type === 'numero' ? <label>Formato<select id="fWords" value={palabras} onChange={(e) => setPalabras(e.target.value)}><option value="">12</option><option value="1">doce (12)</option><option value="solo">doce</option></select></label>
          : type === 'opcion' ? <label>Opciones (una por línea)<textarea id="fOpts" rows={3} value={opciones} onChange={(e) => setOpciones(e.target.value)} /></label> : null}
      </div>
      <label className="radio"><input type="checkbox" id="fReq" checked={req} onChange={(e) => setReq(e.target.checked)} /> <span>Obligatorio</span></label>
      <label className="radio"><input type="checkbox" id="fSigner" checked={firm} onChange={(e) => setFirm(e.target.checked)} /> <span>Es un dato de un firmante (se usa al enviar a firmar)</span></label>
      <div className={'grid2' + (firm ? '' : ' hidden')} id="fSignerBox"><label>Rol del firmante<input id="fRole" list="fRoles" value={rol} placeholder="Ej. Arrendatario" onChange={(e) => setRol(e.target.value)} /><datalist id="fRoles">{roles.map((r) => <option key={r} value={r} />)}</datalist></label>
        <label>Dato<select id="fAttr" value={attr} onChange={(e) => setAttr(e.target.value)}>{Object.entries(SIGNER_ATTRS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label></div>
    </div>
    <div className="actions"><button className="secondary" id="mCancel" onClick={cerrarModal}>Cancelar</button><button className="primary" id="mOk" onClick={ok}>{editando ? 'Guardar' : 'Crear campo'}</button></div>
  </>;
}

// Campos que propuso la IA: se revisan, se desmarcan o se corrigen los nombres
export interface IDetectado { label: string; type: TTipoCampo; format: ICampo['format']; aps: string[]; signer: ICampo['signer']; on: boolean }
export function CamposDetectados({ lista, alCrear }: { lista: IDetectado[]; alCrear: (l: IDetectado[]) => void }) {
  const [l, setL] = useState(lista.map((c) => ({ ...c })));
  const fijar = (n: number, c: Partial<IDetectado>) => setL((x) => x.map((y, k) => (k === n ? { ...y, ...c } : y)));
  return <>
    <h2><Icono nombre="sparkle" tam={18} /> Campos detectados</h2>
    <p className="muted small">Revisa la lista: desmarca lo que no deba cambiar y corrige los nombres. Después puedes editar cada campo.</p>
    <div className="ai-detect">{l.map((c, n) => <label className="ai-det" key={n}><input type="checkbox" data-n={n} checked={c.on} onChange={(e) => fijar(n, { on: e.target.checked })} />
      <span><input className="ai-det-lbl" data-l={n} value={c.label} onChange={(e) => fijar(n, { label: e.target.value })} /><em>{FIELD_TYPES[c.type]}{c.signer ? ` · firmante «${c.signer.role}»` : ''}</em>
        <small>{c.aps.map((x) => '«' + x.slice(0, 60) + '»').join(' · ')}</small></span></label>)}</div>
    <div className="actions"><button className="secondary" id="mCancel" onClick={cerrarModal}>Cancelar</button>
      <button className="primary" id="mOk" onClick={() => { cerrarModal(); alCrear(l.map((c, n) => ({ ...c, label: c.label.trim() || lista[n].label })).filter((c) => c.on)); }}>Crear campos</button></div>
  </>;
}

export function GuardarPlantilla({ nombre, campos, parrafos, alGuardar }: { nombre: string; campos: number; parrafos: number; alGuardar: (n: string) => void }) {
  const [n, setN] = useState(nombre);
  return <>
    <h2>Guardar plantilla</h2><label>Nombre<input id="tName" value={n} onChange={(e) => setN(e.target.value)} /></label>
    <p className="muted small">{campos} campo(s) en {parrafos} párrafo(s). Queda en «Mis plantillas» en el inicio.</p>
    <div className="actions"><button className="secondary" id="mCancel" onClick={cerrarModal}>Cancelar</button><button className="primary" id="mOk" onClick={() => { cerrarModal(); alGuardar(n.trim() || 'Plantilla'); }}>Guardar</button></div>
  </>;
}

export function PlantillaGuardada({ nombre, alExportar, alLlenar }: { nombre: string; alExportar: () => void; alLlenar: () => void }) {
  return <>
    <h2>Plantilla guardada</h2><p>«{nombre}» está en <strong>Mis plantillas</strong>, en el inicio.</p>
    <div className="actions"><button className="secondary" id="mExp" onClick={() => { cerrarModal(); alExportar(); }}>Exportar archivo…</button><button className="secondary" id="mCancel" onClick={cerrarModal}>Seguir editando</button><button className="primary" id="mOk" onClick={() => { cerrarModal(); alLlenar(); }}>Llenar ahora</button></div>
  </>;
}

// Al abrir un PDF que trae una plantilla
export function PlantillaAbierta({ nombre, campos, alElegir }: { nombre: string; campos: number; alElegir: (modo: 'design' | 'fill') => void }) {
  return <>
    <h2><Icono nombre="template" tam={18} /> Plantilla «{nombre}»</h2><p>Este PDF es una plantilla con <strong>{campos}</strong> campo(s).</p>
    <div className="actions"><button className="secondary" id="mCancel" onClick={cerrarModal}>Ver como PDF</button><button className="secondary" id="mEd" onClick={() => { cerrarModal(); alElegir('design'); }}>Editar plantilla</button><button className="primary" id="mOk" onClick={() => { cerrarModal(); alElegir('fill'); }}>Llenar</button></div>
  </>;
}

export function SalirSinGuardar({ alSalir, alGuardar }: { alSalir: () => void; alGuardar: () => void }) {
  return <>
    <h2>¿Salir sin guardar la plantilla?</h2><p>Los campos marcados se mantienen en el documento, pero la plantilla no queda en «Mis plantillas».</p>
    <div className="actions"><button className="secondary" id="mCancel" onClick={cerrarModal}>Cancelar</button><button className="danger" id="mNo" onClick={() => { cerrarModal(); alSalir(); }}>Salir</button><button className="primary" id="mOk" onClick={() => { cerrarModal(); alGuardar(); }}>Guardar</button></div>
  </>;
}

// Documento importado desde Google Drive: ¿detectar los campos con IA?
export function Importada({ nombre, alDetectar }: { nombre: string; alDetectar: () => void }) {
  return <>
    <h2><Icono nombre="template" tam={18} /> «{nombre}» importado</h2><p>Ahora marca los datos que cambian para convertirlo en plantilla.</p>
    <p className="muted">¿Quieres que la IA detecte los campos (nombres, RUT, fechas, montos…)?</p>
    <div className="actions"><button className="secondary" id="mCancel" onClick={cerrarModal}>Los marco yo</button><button className="primary" id="mOk" onClick={() => { cerrarModal(); alDetectar(); }}><Icono nombre="sparkle" tam={15} /> Detectar con IA <small className="tk-cost">2 tokens</small></button></div>
  </>;
}
