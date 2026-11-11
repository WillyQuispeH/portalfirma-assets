// Ventanas de un paso de las etapas (etapas.js): «Reprogramar / Volver a intentar» (modal-12) y el menú de estados del
// paso (modal-13). Marcar el paso sigue en etapas.js (alGuardar, alElegir).
// Los id (#rpF, #rpD, #emT, #emV, #emOk, #mOk, #mCancel) y .et-mopts [data-e] los usan las pruebas.
import { useState } from 'react';
import Boton from '../../../ui/Boton';
import Input from '../../../ui/Input';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../../ui/Ventana';
import { FORM } from '../../gestion/editor-pdf/Modales';
import { cerrarModal } from '../../../../utils/modal';
import PanelEvaluacion from '../../evaluacion/EvaluacionArriendo';

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
export function MenuPaso({ titulo, descripcion, manual, evaluacionNegocioId, alElegir, alGuardar }: {
  titulo: string; descripcion?: string; manual?: boolean;
  /** el paso «Evaluación del arrendatario» de un arriendo: la ventana trae también la solicitud de documentos y el análisis */
  evaluacionNegocioId?: string;
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
      {evaluacionNegocioId && <h3 className="tw:m-0 tw:mt-1 tw:text-sm tw:font-bold">Estado del paso</h3>}
      <div className="et-mopts tw:flex tw:flex-wrap tw:gap-2">
        <Boton variante="secundario" icono="check" data-e="ok" onClick={() => alElegir('ok')}>Logrado</Boton>
        <Boton variante={modo === 'fail' ? 'principal' : 'secundario'} icono="alert" data-e="fail" onClick={() => elegir('fail')}>No logrado</Boton>
        <Boton variante={modo === 'otro' ? 'principal' : 'secundario'} icono="clock" data-e="otro" onClick={() => elegir('otro')}>Esperando a alguien</Boton>
        {manual && <Boton variante="fantasma" data-e="auto" onClick={() => alElegir('auto')}>Volver a lo automático</Boton>}
      </div>
      {modo && (
        <div id="emX" className="tw:flex tw:flex-wrap tw:items-end tw:gap-2">
          <Input id="emT" etiqueta={modo === 'fail' ? 'Motivo' : '¿A quién esperas?'} clasesCampo="tw:flex-[1_1_200px]" value={t} onChange={(e) => setT(e.target.value)} />
          {modo === 'otro' && <Input id="emV" etiqueta="Plazo" type="date" clasesCampo="tw:flex-[1_1_160px]" value={v} onChange={(e) => setV(e.target.value)} />}
          <Boton id="emOk" onClick={() => alGuardar(modo, t, v)}>Guardar</Boton>
        </div>
      )}
    </VentanaCuerpo>
    <VentanaPie><Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cerrar</Boton></VentanaPie>
  </>;
}
