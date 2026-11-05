// Formularios en ventana del Asistente legal sobre el editor (en el modal de la app, utils/modal.tsx).
// Los id (#mOk, #aiFree, #eTitle, #eBody) y las clases (.ai-model) los usan las pruebas.
import { useState } from 'react';
import Icono from '../../../ui/Icono';
import { cerrarModal } from '../../../../utils/modal';
import { tk, type IBloqueado, type IModeloLista } from '../../../../utils/asistente-legal';
import { useAsistente } from '../../../../store/hooks/useAsistente.hook';
import type { ISpec } from '../../../../store/interfaces/editor.interface';

// Un documento que requiere presencialidad (pagaré, salida de un menor, finiquito)
export function Bloqueado({ b, alRedactar }: { b: IBloqueado; alRedactar?: (s: string) => void }) {
  return <>
    <h2>{b.title}: requiere presencialidad</h2><p>{b.msg}</p>
    {b.suggest ? <p className="muted">Lo que sí se puede firmar electrónicamente es un <strong>mandato</strong> para que otra persona suscriba el pagaré en tu nombre ante notario.</p> : null}
    <div className="actions"><button className="secondary" id="mCancel" onClick={cerrarModal}>Cerrar</button>{b.suggest ? <button className="primary" id="mOk" onClick={() => { cerrarModal(); alRedactar?.(b.suggest!); }}>Redactar el mandato</button> : null}</div>
  </>;
}

// Hay modelos aprobados de Portalfirma para lo pedido
export function ElegirModelo({ modelos, alUsar, alRedactar }: { modelos: IModeloLista[]; alUsar: (id: string) => void; alRedactar: () => void }) {
  const [pick, setPick] = useState(modelos[0].id);
  const { billetera } = useAsistente();
  return <>
    <h2><Icono nombre="template" tam={18} /> Hay un modelo de Portalfirma para esto</h2>
    <p className="muted small">Son modelos aprobados de la Notaría Virtual: el texto ya está revisado y solo completas los datos. No gasta tokens.</p>
    <div className="ai-models">{modelos.map((m) => <label key={m.id} className={'ai-model' + (pick === m.id ? ' on' : '')}><input type="radio" name="aiM" value={m.id} checked={pick === m.id} onChange={() => setPick(m.id)} />
      <span><b>{m.nombre}</b><small>{m.descripcion || ''}</small><small className="muted">{m.roles?.length ? 'Firman: ' + m.roles.map((r) => r.alias).join(', ') : ''}</small></span></label>)}</div>
    <div className="actions"><button className="ghost" id="mCancel" onClick={cerrarModal}>Cancelar</button>
      <button className="secondary" id="aiFree" onClick={() => { cerrarModal(); alRedactar(); }}>Prefiero que la IA lo redacte <small className="tk-cost">{tk(billetera?.costs?.draft ?? 2)}</small></button>
      <button className="primary" id="mOk" onClick={() => { cerrarModal(); alUsar(pick); }}>Usar este modelo</button></div>
  </>;
}

// Editar a mano el texto de un documento redactado (los [[marcadores]] son los campos)
export function EditarTexto({ spec, alAplicar }: { spec: ISpec; alAplicar: (titulo: string, cuerpo: string) => void }) {
  const [titulo, setTitulo] = useState(spec.titulo); const [cuerpo, setCuerpo] = useState(spec.cuerpo);
  return <>
    <h2>Editar texto</h2><p className="muted small">Los datos entre [[ ]] son los campos del formulario: puedes moverlos, borrarlos o crear nuevos escribiendo [[Nombre del dato]]. Las cláusulas van en **negrita** con doble asterisco.</p>
    <label>Título<input id="eTitle" value={titulo} onChange={(e) => setTitulo(e.target.value)} /></label>
    <textarea id="eBody" rows={18} style={{ width: '100%', font: '13px/1.45 ui-monospace,Menlo,monospace' }} value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} />
    <p className="muted small">La leyenda de firma electrónica avanzada (Ley 19.799) se agrega siempre al final.</p>
    <div className="actions"><button className="secondary" id="mCancel" onClick={cerrarModal}>Cancelar</button><button className="primary" id="mOk" onClick={() => { cerrarModal(); alAplicar(titulo.trim(), cuerpo); }}>Aplicar</button></div>
  </>;
}
