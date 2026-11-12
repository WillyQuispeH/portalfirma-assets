// Ventanas de un paso de las etapas (etapas.js): «Reprogramar / Volver a intentar» (modal-12) y el menú de estados del
// paso (modal-13). Marcar el paso sigue en etapas.js (alGuardar, alElegir).
// Los id (#rpF, #rpD, #emT, #emV, #emOk, #mOk, #mCancel) y .et-mopts [data-e] los usan las pruebas.
import { useState } from 'react';
import Boton from '../../../ui/Boton';
import Input from '../../../ui/Input';
import Badge from '../../../ui/Badge';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../../ui/Ventana';
import { FORM } from '../../gestion/editor-pdf/Modales';
import { cerrarModal } from '../../../../utils/modal';
import PanelEvaluacion from '../../evaluacion/EvaluacionArriendo';
import PanelActa from '../../acta-visita/ActaVisita';

export function Reprogramar({ titulo, hoy, alGuardar }: { titulo: string; hoy: string; alGuardar: (v: { vence: string; d: string }) => void }) {
  const [vence, setVence] = useState(hoy); const [d, setD] = useState('');
  return <>
    <VentanaCabecera icono="calendar" titulo={titulo} />
    <VentanaCuerpo className={FORM}>
      <Input id="rpF" etiqueta="Nueva fecha" type="date" value={vence} onChange={(e) => setVence(e.target.value)} />
      <Input id="rpD" etiqueta="Nota (opcional)" placeholder="Ej.: se reagendó con el cliente" value={d} onChange={(e) => setD(e.target.value)} />
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
      <Boton id="mOk" onClick={() => alGuardar({ vence, d })}>Guardar</Boton>
    </VentanaPie>
  </>;
}

type TModo = 'fail' | 'otro';
interface IDocPaso { nombre: string; estado: string; fecha?: string; operacion?: string | null; firmantes?: string[] }
export function MenuPaso({ titulo, descripcion, manual, evaluacionNegocioId, actaNegocioId, alActaCerrada, documentos, alEnviar, etiquetaEnviar, accionTxt, alAccion, alElegir, alGuardar }: {
  titulo: string; descripcion?: string; manual?: boolean;
  /** pasos con firma (orden de visita, contrato…): los documentos ya generados y cómo enviarlos a firmar */
  documentos?: IDocPaso[]; alEnviar?: () => void; etiquetaEnviar?: string;
  /** la acción propia del paso (agendar, completar…), dentro de la misma ventana */
  accionTxt?: string; alAccion?: () => void;
  /** el paso «Evaluación del arrendatario» de un arriendo: la ventana trae también la solicitud de documentos y el análisis */
  evaluacionNegocioId?: string;
  /** el paso «Acta de visita»: la ventana trae el acta (audio de la visita, fotos y resumen) */
  actaNegocioId?: string; alActaCerrada?: () => void;
  /** «Logrado» o «Volver a lo automático»: se marca de inmediato */
  alElegir: (e: 'ok' | 'auto') => void;
  /** «No logrado» (motivo) o «Esperando a alguien» (a quién y plazo) */
  alGuardar: (modo: TModo, texto: string, vence: string) => void;
}) {
  const [modo, setModo] = useState<TModo | null>(null); const [t, setT] = useState(''); const [v, setV] = useState('');
  const elegir = (m: TModo) => { setModo(m); setTimeout(() => document.getElementById('emT')?.focus(), 0); };
  return <>
    <VentanaCabecera icono="listCheck" titulo={titulo} descripcion={descripcion || 'Elige cómo está este paso.'} />
    <VentanaCuerpo className={FORM}>
      {evaluacionNegocioId && <PanelEvaluacion negocioId={evaluacionNegocioId} />}
      {actaNegocioId && <PanelActa negocioId={actaNegocioId} alCerrada={alActaCerrada} />}
      {documentos && (
        <section className="tw:rounded-xl tw:border tw:border-solid tw:border-edge tw:p-3 tw:flex tw:flex-col tw:gap-2" id="pasoDocs">
          <h3 className="tw:m-0 tw:text-sm tw:font-bold">Documentos generados</h3>
          {documentos.length === 0
            ? <p className="tw:m-0 tw:text-[13px] tw:text-muted">Todavía no hay documentos generados para este paso.</p>
            : <ul className="tw:list-none tw:m-0 tw:p-0 tw:flex tw:flex-col tw:gap-1.5">
              {documentos.map((d, i) => (
                <li key={i} className="tw:flex tw:flex-col tw:gap-0.5" data-doc-paso>
                  <div className="tw:flex tw:items-center tw:gap-2 tw:flex-wrap tw:text-sm">
                    <span className="tw:flex-1 tw:min-w-0 tw:truncate tw:font-semibold">{d.nombre}</span>
                    <Badge tono={d.estado === 'Firmado' ? 'verde' : d.estado === 'En firma' ? 'amarillo' : 'gris'} punto>{d.estado}</Badge>
                  </div>
                  <small className="tw:text-xs tw:text-muted">
                    {[d.fecha && (d.estado === 'Firmado' ? `Firmado el ${d.fecha}` : `Del ${d.fecha}`), d.operacion && `Operación ${d.operacion}`, d.firmantes?.length ? `Firmantes: ${d.firmantes.join(', ')}` : ''].filter(Boolean).join(' · ')}
                  </small>
                </li>
              ))}
            </ul>}
          {alEnviar && <div className="tw:flex tw:justify-end"><Boton id="pasoEnviar" icono="sign" onClick={alEnviar}>{etiquetaEnviar || (documentos.length ? 'Enviar a firmar' : 'Preparar y enviar a firmar')}</Boton></div>}
        </section>
      )}
      {alAccion && <div className="tw:flex tw:justify-end"><Boton id="pasoAccion" onClick={alAccion}>{accionTxt}</Boton></div>}
      {modo && (
        <div id="emX" className="tw:flex tw:flex-wrap tw:items-end tw:gap-2">
          <Input id="emT" etiqueta={modo === 'fail' ? 'Motivo' : '¿A quién esperas?'} clasesCampo="tw:flex-[1_1_200px]" value={t} onChange={(e) => setT(e.target.value)} />
          {modo === 'otro' && <Input id="emV" etiqueta="Plazo" type="date" clasesCampo="tw:flex-[1_1_160px]" value={v} onChange={(e) => setV(e.target.value)} />}
          <Boton id="emOk" className="tw:ml-auto" onClick={() => alGuardar(modo, t, v)}>Guardar</Boton>
        </div>
      )}
    </VentanaCuerpo>
    {/* el estado del paso va siempre en el pie, pegado a la derecha (son casi los mismos botones en todos los pasos) */}
    <VentanaPie>
      <Boton id="mCancel" variante="fantasma" className="tw:mr-auto" onClick={cerrarModal}>Cerrar</Boton>
      <span className="et-mopts tw:contents">
        {manual && <Boton variante="fantasma" data-e="auto" onClick={() => alElegir('auto')}>Volver a lo automático</Boton>}
        <Boton variante="secundario" icono="clock" data-e="otro" className={modo === 'otro' ? 'tw:ring-2 tw:ring-lav-edge' : ''} onClick={() => elegir('otro')}>Esperando a alguien</Boton>
        <Boton variante="secundario" icono="alert" data-e="fail" className={modo === 'fail' ? 'tw:ring-2 tw:ring-lav-edge' : ''} onClick={() => elegir('fail')}>No logrado</Boton>
        <Boton icono="check" data-e="ok" onClick={() => alElegir('ok')}>Logrado</Boton>
      </span>
    </VentanaPie>
  </>;
}
