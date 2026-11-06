// Formularios en ventana del Asistente legal sobre el editor (en el modal de la app, utils/modal.tsx, con las partes del
// kit: VentanaCabecera, VentanaCuerpo y VentanaPie). Los id (#mOk, #aiFree, #eTitle, #eBody) y las clases (.ai-model)
// los usan las pruebas.
import { useState } from 'react';
import Boton from '../../../ui/Boton';
import Input from '../../../ui/Input';
import Textarea from '../../../ui/Textarea';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../../ui/Ventana';
import { cerrarModal } from '../../../../utils/modal';
import { tk, type IBloqueado, type IModeloLista } from '../../../../utils/asistente-legal';
import { useAsistente } from '../../../../store/hooks/useAsistente.hook';
import type { ISpec } from '../../../../store/interfaces/editor.interface';

// textos del cuerpo: párrafo y nota en gris
const P = 'tw:mt-0 tw:mb-3 tw:leading-relaxed';
const NOTA = 'tw:m-0 tw:text-[12.5px] tw:text-muted tw:leading-relaxed';
// el costo en tokens dentro de un botón secundario (en el principal lo pinta .tk-cost de styles.css)
const COSTO_SEC = 'tk-cost tw:bg-[color-mix(in_srgb,#8b3fe0_12%,transparent)]';

// Un documento que requiere presencialidad (pagaré, salida de un menor, finiquito)
export function Bloqueado({ b, alRedactar }: { b: IBloqueado; alRedactar?: (s: string) => void }) {
  return <>
    <VentanaCabecera icono="notary" tonoIcono="amarillo" titulo={`${b.title}: requiere presencialidad`} />
    <VentanaCuerpo>
      <p className={b.suggest ? P : 'tw:m-0 tw:leading-relaxed'}>{b.msg}</p>
      {b.suggest ? <p className={NOTA}>Lo que sí se puede firmar electrónicamente es un <strong>mandato</strong> para que otra persona suscriba el pagaré en tu nombre ante notario.</p> : null}
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cerrar</Boton>
      {b.suggest ? <Boton id="mOk" icono="sparkle" onClick={() => { cerrarModal(); alRedactar?.(b.suggest!); }}>Redactar el mandato</Boton> : null}
    </VentanaPie>
  </>;
}

// Hay modelos aprobados de Portalfirma para lo pedido
export function ElegirModelo({ modelos, alUsar, alRedactar }: { modelos: IModeloLista[]; alUsar: (id: string) => void; alRedactar: () => void }) {
  const [pick, setPick] = useState(modelos[0].id);
  const { billetera } = useAsistente();
  return <>
    <VentanaCabecera icono="template" titulo="Hay un modelo de Portalfirma para esto"
      descripcion="Son modelos aprobados de la Notaría Virtual: el texto ya está revisado y solo completas los datos. No gasta tokens." />
    <VentanaCuerpo>
      <div className="ai-models tw:mt-0">{modelos.map((m) => <label key={m.id} className={'ai-model' + (pick === m.id ? ' on' : '')}><input type="radio" name="aiM" value={m.id} checked={pick === m.id} onChange={() => setPick(m.id)} />
        <span><b>{m.nombre}</b><small>{m.descripcion || ''}</small><small className="muted">{m.roles?.length ? 'Firman: ' + m.roles.map((r) => r.alias).join(', ') : ''}</small></span></label>)}</div>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="fantasma" className="tw:mr-auto" onClick={cerrarModal}>Cancelar</Boton>
      <Boton id="aiFree" variante="secundario" icono="sparkle" onClick={() => { cerrarModal(); alRedactar(); }}>Prefiero que la IA lo redacte <small className={COSTO_SEC}>{tk(billetera?.costs?.draft ?? 2)}</small></Boton>
      <Boton id="mOk" icono="template" onClick={() => { cerrarModal(); alUsar(pick); }}>Usar este modelo</Boton>
    </VentanaPie>
  </>;
}

// Editar a mano el texto de un documento redactado (los [[marcadores]] son los campos)
export function EditarTexto({ spec, alAplicar }: { spec: ISpec; alAplicar: (titulo: string, cuerpo: string) => void }) {
  const [titulo, setTitulo] = useState(spec.titulo); const [cuerpo, setCuerpo] = useState(spec.cuerpo);
  return <>
    <VentanaCabecera icono="textEdit" titulo="Editar texto"
      descripcion="Los datos entre [[ ]] son los campos del formulario: puedes moverlos, borrarlos o crear nuevos escribiendo [[Nombre del dato]]. Las cláusulas van en **negrita** con doble asterisco." />
    <VentanaCuerpo>
      <div className="tw:flex tw:flex-col tw:gap-3.5">
        <Input id="eTitle" etiqueta="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        <Textarea id="eBody" etiqueta="Texto" rows={18} className="tw:font-mono tw:text-[13px] tw:leading-[1.45]" value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} />
      </div>
      <p className="tw:mt-3 tw:mb-0 tw:text-[12.5px] tw:text-muted tw:leading-relaxed">La leyenda de firma electrónica avanzada (Ley 19.799) se agrega siempre al final.</p>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
      <Boton id="mOk" onClick={() => { cerrarModal(); alAplicar(titulo.trim(), cuerpo); }}>Aplicar</Boton>
    </VentanaPie>
  </>;
}
