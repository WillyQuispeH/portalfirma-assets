// Ventanas de Expedientes que abre el código antiguo (src/renderer/expedientes.js) con window.Ventanas.abrir:
// copiar desde Drive y preparar archivos (avance), nuevo expediente, más opciones, quitar de la lista y guardar el
// documento del editor en un expediente. Están registradas en ventanas/agente.tsx (agente.exp*).
// La lógica (llamadas a pf, toasts, qué se recarga) llega en las props desde expedientes.js.
// Los id (#xnName, #xnType, #xnNotes, los radios name="xnSt", #xmType, #xmNotes, #xmDel, #xsName, #xsExp, #xsNew,
// #mOk, #mCancel) los usan las pruebas.
import { useState } from 'react';
import Boton from '../../../ui/Boton';
import Input from '../../../ui/Input';
import Select from '../../../ui/Select';
import Icono from '../../../ui/Icono';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../../ui/Ventana';
import { P, NOTA, FORM, Opcion } from '../editor-pdf/Modales';
import { cerrarModal } from '../../../../utils/modal';
import { cx } from '../../../../utils/cx';

type TOpciones = [string, string][];
const Espera = () => <i className="bk-spin" />;

// ---------- modal-14 y modal-15: avance (no se puede interrumpir) ----------
export function Avance({ titulo, detalle, icono }: { titulo: string; detalle?: string; icono?: string }) {
  return <>
    <VentanaCabecera icono={icono} titulo={titulo} cerrable={false} />
    <VentanaCuerpo><p className={cx(NOTA, 'tw:flex tw:items-center tw:gap-2')}><Espera /> {detalle || 'Un momento…'}</p></VentanaCuerpo>
  </>;
}

// ---------- modal-16: nuevo expediente ----------
export interface INuevoExpediente { name: string; type: string; storage: 'local' | 'drive'; notes: string }
const LUGARES: ['local' | 'drive', string, string, string][] = [
  ['local', 'folder', 'En este computador', 'Carpeta «Expedientes PortalFirma» en Documentos.'],
  ['drive', 'drive', 'En Google Drive', 'Carpeta «Expedientes PortalFirma» en tu Drive: la ves desde cualquier equipo.'],
];
/** alCrear devuelve false si no se pudo crear (vuelve a habilitar «Crear») */
export function NuevoExpediente({ tipos, alCrear }: { tipos: TOpciones; alCrear: (o: INuevoExpediente) => Promise<boolean | void> }) {
  const [name, setName] = useState(''); const [type, setType] = useState(tipos[0]?.[0] || 'otro');
  const [storage, setStorage] = useState<'local' | 'drive'>('local'); const [notes, setNotes] = useState('');
  const [invalido, setInvalido] = useState(false); const [creando, setCreando] = useState(false);
  const crear = async () => {
    if (!name.trim()) { setInvalido(true); return; }
    setCreando(true);
    if ((await alCrear({ name: name.trim(), type, storage, notes: notes.trim() })) === false) setCreando(false);
  };
  return <>
    <VentanaCabecera icono="folderOpen" titulo="Nuevo expediente" descripcion="Una carpeta por caso, con sus documentos y su historial." />
    <VentanaCuerpo className={FORM}>
      <Input etiqueta="Nombre" id="xnName" autoFocus placeholder="Ej.: Depto Calle Nueva 120, torre 2" maxLength={90} value={name}
        error={invalido ? 'Ponle un nombre al expediente.' : null} className={invalido ? 'invalid' : undefined}
        onChange={(e) => { setName(e.target.value); setInvalido(false); }} />
      <Select etiqueta="Tipo" id="xnType" value={type} onChange={(e) => setType(e.target.value)} opciones={tipos} />
      <div className="tw:flex tw:flex-col tw:gap-1.5">
        <span className="tw:text-[13px] tw:font-semibold tw:text-text">¿Dónde se guarda?</span>
        {LUGARES.map(([v, ic, t, d]) => (
          <Opcion key={v} type="radio" name="xnSt" value={v} checked={storage === v} onChange={() => setStorage(v)}
            className={cx('tw:py-2.5 tw:px-3 tw:border tw:border-solid tw:rounded-xl', storage === v ? 'tw:border-brand tw:bg-brand-soft' : 'tw:border-line')}>
            <b className="tw:inline-flex tw:items-center tw:gap-1.5"><Icono nombre={ic} tam={14} /> {t}</b>
            <small className="tw:block tw:text-xs tw:text-muted">{d}</small>
          </Opcion>
        ))}
      </div>
      <Input etiqueta="Notas (opcional)" id="xnNotes" placeholder="Ej.: arriendo 2026, corredora SEC Propiedades" maxLength={200} value={notes} onChange={(e) => setNotes(e.target.value)} />
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
      <Boton id="mOk" cargando={creando} onClick={crear}>{creando ? 'Creando…' : 'Crear'}</Boton>
    </VentanaPie>
  </>;
}

// ---------- modal-17: más opciones de un expediente ----------
export function MasOpcionesExpediente({ nombre, tipos, tipo, notas, detalle, alGuardar, alQuitar }: { nombre: string; tipos: TOpciones; tipo: string; notas?: string; detalle: string; alGuardar: (v: { type: string; notes: string }) => void; alQuitar: () => void }) {
  const [type, setType] = useState(tipo); const [notes, setNotes] = useState(notas || '');
  return <>
    <VentanaCabecera icono="folderOpen" titulo={nombre} descripcion={detalle} />
    <VentanaCuerpo className={FORM}>
      <Select etiqueta="Tipo" id="xmType" value={type} onChange={(e) => setType(e.target.value)} opciones={tipos} />
      <Input etiqueta="Notas" id="xmNotes" maxLength={200} value={notes} onChange={(e) => setNotes(e.target.value)} />
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="xmDel" variante="fantasma" icono="trash" className="tw:mr-auto tw:text-err" onClick={alQuitar}>Quitar de la lista</Boton>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
      <Boton id="mOk" onClick={() => alGuardar({ type, notes })}>Guardar</Boton>
    </VentanaPie>
  </>;
}

// ---------- modal-18: quitar un expediente de la lista ----------
export function QuitarExpediente({ nombre, enDrive, alConfirmar }: { nombre: string; enDrive: boolean; alConfirmar: () => void }) {
  return <>
    <VentanaCabecera icono="trash" tonoIcono="rojo" titulo="Quitar de la lista" />
    <VentanaCuerpo><p className={P}>«{nombre}» deja de aparecer en la app. <b>La carpeta y sus archivos no se borran</b>: siguen {enDrive ? 'en tu Google Drive' : 'en tu computador'}.</p></VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
      <Boton id="mOk" variante="peligro" onClick={alConfirmar}>Quitar</Boton>
    </VentanaPie>
  </>;
}

// ---------- modal-19: guardar el documento del editor en un expediente ----------
export function GuardarEnExpediente({ nombre, expedientes, alGuardar, alNuevo }: { nombre: string; expedientes: TOpciones; alGuardar: (id: string, nombre: string) => void; alNuevo: (nombre: string) => void }) {
  const [nm, setNm] = useState(nombre); const [id, setId] = useState(expedientes[0]?.[0] || '');
  return <>
    <VentanaCabecera icono="folderOpen" titulo="Guardar en un expediente" />
    <VentanaCuerpo className={FORM}>
      <Input etiqueta="Nombre del archivo" id="xsName" value={nm} onChange={(e) => setNm(e.target.value)} />
      {expedientes.length
        ? <Select etiqueta="Expediente" id="xsExp" value={id} onChange={(e) => setId(e.target.value)} opciones={expedientes} />
        : <p className={NOTA}>Todavía no tienes expedientes: crea uno.</p>}
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="xsNew" variante="fantasma" icono="plus" className="tw:mr-auto" onClick={() => alNuevo(nm)}>Nuevo expediente</Boton>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
      <Boton id="mOk" disabled={!expedientes.length} onClick={() => alGuardar(id, nm)}>Guardar</Boton>
    </VentanaPie>
  </>;
}
