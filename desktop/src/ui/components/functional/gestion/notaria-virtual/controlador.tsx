// Notaría virtual fuera del componente: abrir la pantalla (window.openTemplates, desde las pestañas, el inicio y los
// negocios) y confirmar el envío con el saldo de la sesión, que termina en la pantalla «Enviado» de Enviar a firmar.
// Antes estaba en src/renderer/templates.js; se instala al cargar el bundle (index.tsx).
import { useState } from 'react';
import { abrirModal, cerrarModal } from '../../../../utils/modal';
import { mostrarEnviado, saldoSesion } from '../../../../utils/app';
import { notariaService } from '../../../../store/services/notaria.service';

const clp = (n: number | null | undefined) => (n == null ? '—' : '$' + Number(n).toLocaleString('es-CL'));
interface IEnvio { id: string; nombre: string; valores: Record<string, string>; firmantes: string[] }
interface IAvisos { alError: (msg: string) => void; alEnviar: () => void }

function ConfirmarEnvio({ d, avisos }: { d: IEnvio; avisos: IAvisos }) {
  const [enviando, setEnviando] = useState(false);
  const ok = async () => {
    setEnviando(true);
    const r = await notariaService.enviar(d.id, d.valores, d.nombre);
    cerrarModal();
    if (!r.ok) return avisos.alError(r.error || '');
    avisos.alEnviar(); mostrarEnviado(r.data!);
  };
  return <>
    <h2>Confirmar envío</h2>
    <dl><dt>Trámite</dt><dd>{d.nombre}</dd>
      <dt>Firmantes</dt><dd>{d.firmantes.length ? d.firmantes.map((f, i) => <span key={i}>{f}{i < d.firmantes.length - 1 ? <br /> : null}</span>) : '—'}</dd>
      <dt>Saldo actual</dt><dd>{clp(saldoSesion())}</dd></dl>
    <p className="muted small">Portalfirma generará el documento con estos datos, cobrará el trámite de la billetera y enviará los enlaces de firma.</p>
    <div className="actions"><button className="secondary" id="mCancel" onClick={cerrarModal}>Volver</button><button className="primary" id="mOk" disabled={enviando} onClick={ok}>{enviando ? 'Enviando…' : 'Confirmar y enviar'}</button></div>
  </>;
}

export function confirmarEnvio(d: IEnvio, avisos: IAvisos) { abrirModal(<ConfirmarEnvio d={d} avisos={avisos} />); }

export function instalarNotaria() {
  const w = window as unknown as { openTemplates: () => void; Notaria: object; ReactUI: { montar: (n: string, el: Element | null) => void } };
  // el estado vive en el store: al volver sigue donde quedó
  w.openTemplates = () => w.ReactUI.montar('GestionNotariaVirtual', document.getElementById('tplBody'));
  w.Notaria = { confirmarEnvio };
}
