// Formularios en ventana de las plantillas con campos (en el modal de la app, utils/modal.tsx), con las partes del kit:
// VentanaCabecera, VentanaCuerpo y VentanaPie, sueltas en un fragmento.
// Los id (#fLabel, #fType, #fWords, #fSigner, #fRole, #fAttr, #tName, #mOk…) y las clases (.ai-det, .ai-det-lbl) los usan las pruebas.
import { useEffect, useState } from 'react';
import Boton from '../../../ui/Boton';
import Input from '../../../ui/Input';
import Select from '../../../ui/Select';
import Textarea from '../../../ui/Textarea';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../../ui/Ventana';
import { DOS, FORM, NOTA, Opcion, P } from './Modales';
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
  // el nombre del campo (el Input del kit no recibe ref): se selecciona al abrir y se enfoca si falta
  const nombreCampo = () => document.getElementById('fLabel') as HTMLInputElement | null;
  useEffect(() => { const t = setTimeout(() => nombreCampo()?.select(), 30); return () => clearTimeout(t); }, []);
  const cambiarTipo = (t: TTipoCampo) => { setType(t); const f3 = t === g.type ? fo : {}; setCaso(f3.case || 'normal'); setFecha(f3.date || 'largo'); setPalabras(f3.words === 'solo' ? 'solo' : f3.words ? '1' : ''); };
  const ok = () => {
    if (existente) { cerrarModal(); alListo(existentes.find((x) => x.id === existente)!, false); return; }
    if (!label.trim()) { nombreCampo()?.focus(); return; }
    const format: ICampo['format'] = {};
    if (type === 'texto') format.case = caso; if (type === 'fecha') format.date = fecha;
    if (type === 'monto' || type === 'numero') format.words = palabras === 'solo' ? 'solo' : !!palabras;
    const f: ICampo = editando ? campo! : { id: newFieldId(), sample: muestra, label: '', type: 'texto' };
    Object.assign(f, { label: label.trim(), type, format, required: req, options: type === 'opcion' ? opciones.split('\n').map((x) => x.trim()).filter(Boolean) : f.options,
      signer: firm && rol.trim() ? { role: rol.trim(), attr } : null });
    cerrarModal(); alListo(f, !editando);
  };
  return <>
    <VentanaCabecera icono="template" titulo={editando ? 'Editar campo' : 'Nuevo campo'}
      descripcion={!editando && muestra ? <>Texto de ejemplo: «{muestra.slice(0, 120)}»</> : undefined} />
    <VentanaCuerpo className={FORM}>
      {!editando && existentes.length ? <Select etiqueta="Usar un campo que ya existe" id="fExisting" value={existente} onChange={(e) => setExistente(e.target.value)} vacia="— Campo nuevo —">
        {existentes.map((x) => <option key={x.id} value={x.id}>{x.label} ({FIELD_TYPES[x.type]})</option>)}</Select> : null}
      <div id="fNewBox" className={existente ? 'hidden' : FORM}>
        <div className={DOS}>
          <Input etiqueta="Nombre del campo" id="fLabel" value={label} placeholder="Ej. Arrendatario: nombre" onChange={(e) => setLabel(e.target.value)} />
          <Select etiqueta="Tipo" id="fType" value={type} onChange={(e) => cambiarTipo(e.target.value as TTipoCampo)} opciones={Object.entries(FIELD_TYPES)} />
        </div>
        <div id="fFmt" className={['texto', 'fecha', 'monto', 'numero', 'opcion'].includes(type) ? '' : 'tw:hidden'}>
          {type === 'texto' ? <Select etiqueta="Mayúsculas" id="fCase" value={caso} onChange={(e) => setCaso(e.target.value)} opciones={[['normal', 'Como se escriba'], ['upper', 'TODO EN MAYÚSCULAS'], ['title', 'Nombre Propio']]} />
            : type === 'fecha' ? <Select etiqueta="Formato" id="fDate" value={fecha} onChange={(e) => setFecha(e.target.value)} opciones={[['largo', '2 de octubre de 2026'], ['corto', '02-10-2026'], ['barra', '02/10/2026']]} />
            : type === 'monto' ? <Select etiqueta="Formato" id="fWords" value={palabras} onChange={(e) => setPalabras(e.target.value)} opciones={[['', '$500.000'], ['1', '$500.000 (quinientos mil pesos)'], ['solo', 'quinientos mil pesos']]} />
            : type === 'numero' ? <Select etiqueta="Formato" id="fWords" value={palabras} onChange={(e) => setPalabras(e.target.value)} opciones={[['', '12'], ['1', 'doce (12)'], ['solo', 'doce']]} />
            : type === 'opcion' ? <Textarea etiqueta="Opciones (una por línea)" id="fOpts" rows={3} value={opciones} onChange={(e) => setOpciones(e.target.value)} /> : null}
        </div>
        <div className="tw:flex tw:flex-col tw:gap-2">
          <Opcion type="checkbox" id="fReq" checked={req} onChange={(e) => setReq(e.target.checked)}>Obligatorio</Opcion>
          <Opcion type="checkbox" id="fSigner" checked={firm} onChange={(e) => setFirm(e.target.checked)}>Es un dato de un firmante (se usa al enviar a firmar)</Opcion>
        </div>
        <div className={firm ? DOS : 'hidden'} id="fSignerBox">
          <Input etiqueta="Rol del firmante" id="fRole" list="fRoles" value={rol} placeholder="Ej. Arrendatario" onChange={(e) => setRol(e.target.value)} />
          <datalist id="fRoles">{roles.map((r) => <option key={r} value={r} />)}</datalist>
          <Select etiqueta="Dato" id="fAttr" value={attr} onChange={(e) => setAttr(e.target.value)} opciones={Object.entries(SIGNER_ATTRS)} />
        </div>
      </div>
    </VentanaCuerpo>
    <VentanaPie><Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cancelar</Boton><Boton id="mOk" onClick={ok}>{editando ? 'Guardar' : 'Crear campo'}</Boton></VentanaPie>
  </>;
}

// Campos que propuso la IA: se revisan, se desmarcan o se corrigen los nombres
export interface IDetectado { label: string; type: TTipoCampo; format: ICampo['format']; aps: string[]; signer: ICampo['signer']; on: boolean }
export function CamposDetectados({ lista, alCrear }: { lista: IDetectado[]; alCrear: (l: IDetectado[]) => void }) {
  const [l, setL] = useState(lista.map((c) => ({ ...c })));
  const fijar = (n: number, c: Partial<IDetectado>) => setL((x) => x.map((y, k) => (k === n ? { ...y, ...c } : y)));
  return <>
    <VentanaCabecera icono="sparkle" titulo="Campos detectados" descripcion="Revisa la lista: desmarca lo que no deba cambiar y corrige los nombres. Después puedes editar cada campo." />
    <VentanaCuerpo>
      <div className="ai-detect tw:my-0">{l.map((c, n) => <label className="ai-det" key={n}><input type="checkbox" data-n={n} checked={c.on} onChange={(e) => fijar(n, { on: e.target.checked })} />
        <span><input className="ai-det-lbl" data-l={n} value={c.label} onChange={(e) => fijar(n, { label: e.target.value })} /><em>{FIELD_TYPES[c.type]}{c.signer ? ` · firmante «${c.signer.role}»` : ''}</em>
          <small>{c.aps.map((x) => '«' + x.slice(0, 60) + '»').join(' · ')}</small></span></label>)}</div>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
      <Boton id="mOk" onClick={() => { cerrarModal(); alCrear(l.map((c, n) => ({ ...c, label: c.label.trim() || lista[n].label })).filter((c) => c.on)); }}>Crear campos</Boton>
    </VentanaPie>
  </>;
}

export function GuardarPlantilla({ nombre, campos, parrafos, alGuardar }: { nombre: string; campos: number; parrafos: number; alGuardar: (n: string) => void }) {
  const [n, setN] = useState(nombre);
  return <>
    <VentanaCabecera icono="save" titulo="Guardar plantilla" />
    <VentanaCuerpo className={FORM}>
      <Input etiqueta="Nombre" id="tName" value={n} onChange={(e) => setN(e.target.value)} />
      <p className={NOTA}>{campos} campo(s) en {parrafos} párrafo(s). Queda en «Mis plantillas» en el inicio.</p>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
      <Boton id="mOk" onClick={() => { cerrarModal(); alGuardar(n.trim() || 'Plantilla'); }}>Guardar</Boton>
    </VentanaPie>
  </>;
}

export function PlantillaGuardada({ nombre, alExportar, alLlenar }: { nombre: string; alExportar: () => void; alLlenar: () => void }) {
  return <>
    <VentanaCabecera icono="check" tonoIcono="verde" titulo="Plantilla guardada" />
    <VentanaCuerpo><p className={P}>«{nombre}» está en <strong>Mis plantillas</strong>, en el inicio.</p></VentanaCuerpo>
    <VentanaPie>
      <Boton id="mExp" variante="fantasma" icono="export" className="tw:mr-auto" onClick={() => { cerrarModal(); alExportar(); }}>Exportar archivo…</Boton>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Seguir editando</Boton>
      <Boton id="mOk" onClick={() => { cerrarModal(); alLlenar(); }}>Llenar ahora</Boton>
    </VentanaPie>
  </>;
}

// Al abrir un PDF que trae una plantilla
export function PlantillaAbierta({ nombre, campos, alElegir }: { nombre: string; campos: number; alElegir: (modo: 'design' | 'fill') => void }) {
  return <>
    <VentanaCabecera icono="template" titulo={`Plantilla «${nombre}»`} />
    <VentanaCuerpo><p className={P}>Este PDF es una plantilla con <strong>{campos}</strong> campo(s).</p></VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Ver como PDF</Boton>
      <Boton id="mEd" variante="secundario" onClick={() => { cerrarModal(); alElegir('design'); }}>Editar plantilla</Boton>
      <Boton id="mOk" onClick={() => { cerrarModal(); alElegir('fill'); }}>Llenar</Boton>
    </VentanaPie>
  </>;
}

export function SalirSinGuardar({ alSalir, alGuardar }: { alSalir: () => void; alGuardar: () => void }) {
  return <>
    <VentanaCabecera icono="template" tonoIcono="amarillo" titulo="¿Salir sin guardar la plantilla?" />
    <VentanaCuerpo><p className={P}>Los campos marcados se mantienen en el documento, pero la plantilla no queda en «Mis plantillas».</p></VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
      <Boton id="mNo" variante="peligro" onClick={() => { cerrarModal(); alSalir(); }}>Salir</Boton>
      <Boton id="mOk" onClick={() => { cerrarModal(); alGuardar(); }}>Guardar</Boton>
    </VentanaPie>
  </>;
}

// Documento importado desde Google Drive: ¿detectar los campos con IA?
export function Importada({ nombre, alDetectar }: { nombre: string; alDetectar: () => void }) {
  return <>
    <VentanaCabecera icono="template" titulo={`«${nombre}» importado`} />
    <VentanaCuerpo>
      <p className={P}>Ahora marca los datos que cambian para convertirlo en plantilla.</p>
      <p className={NOTA}>¿Quieres que la IA detecte los campos (nombres, RUT, fechas, montos…)?</p>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Los marco yo</Boton>
      <Boton id="mOk" icono="sparkle" onClick={() => { cerrarModal(); alDetectar(); }}>Detectar con IA <small className="tk-cost">2 tokens</small></Boton>
    </VentanaPie>
  </>;
}
