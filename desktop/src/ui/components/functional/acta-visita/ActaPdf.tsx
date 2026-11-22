// modal-126: el PDF del acta de visita (la hoja entera, con páginas y zoom), para verlo, guardarlo o compartirlo por WhatsApp. El acta no se firma. La lógica (pedir el PDF,
// guardarlo y abrir WhatsApp) está en ActaVisita.tsx y llega en las props. Los id (#apGuardar, #apWa) los usan las pruebas.
import { useState } from 'react';
import Boton from '../../ui/Boton';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../ui/Ventana';
import VisorPdf from '../agenda/VisorPdf';

export function ActaPdf({ pdf, archivo, alGuardar, alCompartir }: { pdf: string; archivo: string; alGuardar: () => Promise<void>; alCompartir: () => Promise<void> }) {
  const [haciendo, setHaciendo] = useState<'' | 'guardar' | 'wa'>('');
  const correr = (k: 'guardar' | 'wa', f: () => Promise<void>) => async () => { setHaciendo(k); try { await f(); } finally { setHaciendo(''); } };
  return <>
    <VentanaCabecera icono="file" titulo="Acta de visita" descripcion={archivo} />
    <VentanaCuerpo>
      {/* la hoja entera dentro de la ventana, con flechas de página y zoom (al ampliar, se arrastra) */}
      <div className="tw:relative tw:h-[calc(100vh-300px)] tw:min-h-[420px]">
        <VisorPdf base64={pdf} ajustar="pagina" flotante sinCaja zoom />
      </div>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="apGuardar" variante="secundario" icono="download" cargando={haciendo === 'guardar'} disabled={!!haciendo} onClick={correr('guardar', alGuardar)}>Guardar PDF</Boton>
      <Boton id="apWa" icono="whatsapp" cargando={haciendo === 'wa'} disabled={!!haciendo} onClick={correr('wa', alCompartir)}>Compartir por WhatsApp</Boton>
    </VentanaPie>
  </>;
}
