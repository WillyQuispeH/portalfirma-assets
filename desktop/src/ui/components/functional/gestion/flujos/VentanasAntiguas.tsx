// Ventana «Muestra» de Flujos documentales (modal-21) que abre el código antiguo (src/renderer/flujos.js) con
// window.Ventanas.abrir. Mientras se genera, sin firmantes; después, con la fila y sus firmantes. Las páginas del PDF las
// dibuja flujos.js con pdf.js dentro de #flPdf (React no le pone hijos a ese div). La confirmación del envío está en
// carga-masiva/Ventanas.tsx (ConfirmarEnvioLote). Las pruebas usan #flPdf, .fl-sig y #mCancel.
import Boton from '../../../ui/Boton';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../../ui/Ventana';
import { cerrarModal } from '../../../../utils/modal';
import { NOTA } from '../editor-pdf/Modales';

interface IFirmanteMuestra { alias: string; fullName?: string; rut?: string; email?: string }

export function MuestraFlujo({ fila, firmantes, alAbrirEditor }: { fila?: number; firmantes?: IFirmanteMuestra[]; alAbrirEditor?: () => void }) {
  if (!firmantes) return <>
    <VentanaCabecera icono="file" titulo="Muestra" cerrable={false} />
    <VentanaCuerpo><p className={NOTA}><i className="bk-spin" /> Generando…</p></VentanaCuerpo>
  </>;
  return <>
    <VentanaCabecera icono="file" titulo={`Muestra · fila ${fila}`} />
    <VentanaCuerpo>
      <div className="fl-pdf" id="flPdf" />
      <h4 className="tw:mt-4 tw:mb-2 tw:text-sm tw:font-bold">Firmantes</h4>
      <ul className="fl-sig">
        {firmantes.map((s, i) => <li key={i}><b>{s.alias}</b>: {s.fullName || '—'} · {s.rut || 'sin RUT'} · {s.email || 'sin correo'}</li>)}
      </ul>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="flOpenEd" variante="secundario" icono="edit" onClick={alAbrirEditor}>Abrir en el editor</Boton>
      <Boton id="mCancel" onClick={cerrarModal}>Cerrar</Boton>
    </VentanaPie>
  </>;
}
