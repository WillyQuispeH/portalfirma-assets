// Evaluación del arrendatario y sus avales. Se instala al cargar el bundle (index.tsx) como window.Evaluacion:
//  · abrir(negocioId, alTerminar?): la ventana (modal-125) donde el corredor pide los documentos por WhatsApp, ve el
//    análisis de cada uno con su porcentaje de aprobación y decide. La abre el paso «Evaluación del arrendatario».
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import EvaluacionArriendo from './EvaluacionArriendo';

export function abrirEvaluacion(negocioId: string, alTerminar?: () => void) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const raiz = createRoot(host);
  const cerrar = () => { raiz.unmount(); host.remove(); alTerminar?.(); };
  function Contenedor() {
    const [abierto, setAbierto] = useState(true);
    return abierto ? <EvaluacionArriendo negocioId={negocioId} onCerrar={() => { setAbierto(false); cerrar(); }} /> : null;
  }
  raiz.render(<Contenedor />);
}

export function instalarEvaluacion() {
  window.Evaluacion = { abrir: abrirEvaluacion };
}
