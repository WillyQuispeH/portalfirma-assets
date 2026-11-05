// Confirmar el envío (en el modal de la app): documento, firma, trámite, firmantes, pagador y saldo.
import { useState } from 'react';
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
    <h2>Confirmar envío</h2>
    <dl>
      <dt>Documento</dt><dd>{archivo.name}</dd>
      <dt>Firma</dt><dd>{firma}</dd><dt>Trámite notarial</dt><dd>{tramite}</dd>
      <dt>Firmantes</dt><dd>{p.signatories.map((s, i) => <span key={i}>{i > 0 && <br />}{i + 1}. {s.fullName} ({s.alias}) — {s.rut}</span>)}</dd>
      <dt>Pagador</dt><dd>{p.email}</dd><dt>Saldo actual</dt><dd>{monto(saldoSesion(), 'CLP')}</dd>
    </dl>
    <p className="muted small">La operación se cobrará según la tarifa de Portalfirma. Los firmantes recibirán su enlace de firma.</p>
    <div className="actions">
      <button className="secondary" id="mCancel" onClick={cerrarModal}>Volver</button>
      <button className="primary" id="mOk" disabled={enviando} onClick={confirmar}>{enviando ? 'Enviando…' : 'Confirmar y enviar'}</button>
    </div>
  </>;
}
