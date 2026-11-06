// Confirmar el envío (en el modal de la app, con las partes del kit: VentanaCabecera, VentanaCuerpo y VentanaPie):
// documento, firma, trámite, firmantes, pagador y saldo. #mOk y #mCancel los usan las pruebas.
import { useState } from 'react';
import Boton from '../../../ui/Boton';
import ListaDatos from '../../../ui/ListaDatos';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../../ui/Ventana';
import { envioEstado, envioOperacion } from '../../../../store/hooks/useEnvio.hook';
import { cerrarModal } from '../../../../utils/modal';
import { saldoSesion } from '../../../../utils/app';
import { monto } from '../../../../utils/formato';
import { resumenEnvio } from '../../../../utils/envio';
import { mostrarEnviado } from './controlador';
import type { IAnalisis, IArchivoEnvio, IPayloadEnvio } from '../../../../store/interfaces/envio.interface';

export default function ConfirmarEnvio({ analisis, archivo, payload: p }: { analisis: IAnalisis; archivo: IArchivoEnvio; payload: IPayloadEnvio }) {
  const [enviando, setEnviando] = useState(false);
  const { firma, tramite } = resumenEnvio(analisis, p);
  const confirmar = async () => {
    setEnviando(true);
    try {
      envioOperacion.guardarPagador(p.email);
      const r = await envioOperacion.enviar({ ...p, __fileName: archivo.name });
      cerrarModal(); mostrarEnviado(r);
    } catch (e) {
      cerrarModal();
      const m = (e as Error).message;
      envioEstado().envioDatos({ error: /^Portalfirma/.test(m) ? m : 'Portalfirma rechazó el envío: ' + m });
    }
  };
  return <>
    <VentanaCabecera icono="sign" titulo="Confirmar envío" cerrable={!enviando} />
    <VentanaCuerpo>
      <ListaDatos datos={[
        ['Documento', archivo.name],
        ['Firma', firma], ['Trámite notarial', tramite],
        ['Firmantes', p.signatories.map((s, i) => <span key={i}>{i > 0 && <br />}{i + 1}. {s.fullName} ({s.alias}) — {s.rut}</span>)],
        ['Pagador', p.email], ['Saldo actual', monto(saldoSesion(), 'CLP')],
      ]} />
      <p className="tw:mt-4 tw:mb-0 tw:text-[12.5px] tw:text-muted tw:leading-relaxed">La operación se cobrará según la tarifa de Portalfirma. Los firmantes recibirán su enlace de firma.</p>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Volver</Boton>
      <Boton id="mOk" disabled={enviando} onClick={confirmar}>{enviando ? 'Enviando…' : 'Confirmar y enviar'}</Boton>
    </VentanaPie>
  </>;
}
