// Confirmar el envío (en el modal de la app, con las partes del kit: VentanaCabecera, VentanaCuerpo y VentanaPie):
// documento, firma, trámite, firmantes, dónde van las firmas y saldo. #mOk y #mCancel los usan las pruebas.
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
import { preguntarGuardarConfiguracion } from '../../configuracion/documentos/ventanas';
import type { IAnalisis, IArchivoEnvio, IPayloadEnvio } from '../../../../store/interfaces/envio.interface';

export default function ConfirmarEnvio({ analisis, archivo, payload: p }: { analisis: IAnalisis; archivo: IArchivoEnvio; payload: IPayloadEnvio }) {
  const [enviando, setEnviando] = useState(false);
  const { firma, tramite } = resumenEnvio(analisis, p);
  const confirmar = async () => {
    setEnviando(true);
    try {
      const r = await envioOperacion.enviar({ ...p, __fileName: archivo.name });
      cerrarModal(); mostrarEnviado(r);
      // al final, si era un tipo de documento que la corredora no tenía configurado: ¿guarda esta firma y trámite para los próximos?
      const tipo = (analisis.extract?.typeDocument || '').trim();
      if (r.operation != null && tipo && !analisis.extract?.tipoConocido) {
        const t = p.signatories[0]?.typeSign;
        void preguntarGuardarConfiguracion(tipo, (t === 'simple' || t === 'avanzada' || t === 'visada' || t === 'enrolada' ? t : 'avanzada'), p.protocolization === 'legalization' ? 'legalization' : 'none');
      }
    } catch (e) {
      cerrarModal();
      const m = (e as Error).message;
      envioEstado().envioDatos({ error: m });
    }
  };
  return <>
    <VentanaCabecera icono="sign" titulo="Confirmar envío" cerrable={!enviando} />
    <VentanaCuerpo>
      <ListaDatos datos={[
        ['Documento', archivo.name],
        ['Firma', firma], ['Trámite notarial', tramite],
        ['Firmantes', p.signatories.map((s, i) => <span key={i}>{i > 0 && <br />}{i + 1}. {s.fullName} ({s.alias}) — {s.rut}</span>)],
        ['Firmas', p.posiciones ? 'Ubicadas en el documento' : 'En una página para las firmas'], ['Saldo actual', monto(saldoSesion(), 'CLP')],
      ]} />
      <p className="tw:mt-4 tw:mb-0 tw:text-[12.5px] tw:text-muted tw:leading-relaxed">La operación se cobrará según la tarifa de Portalfirma. Los firmantes recibirán su enlace de firma.</p>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Volver</Boton>
      <Boton id="mOk" disabled={enviando} onClick={confirmar}>{enviando ? 'Enviando…' : 'Confirmar y enviar'}</Boton>
    </VentanaPie>
  </>;
}
