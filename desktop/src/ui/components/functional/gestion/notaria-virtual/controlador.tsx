// Notaría virtual fuera del componente: abrir la pantalla (window.openTemplates, desde las pestañas, el inicio y los
// negocios) y confirmar el envío con el saldo de la sesión, que termina en la pantalla «Enviado» de Enviar a firmar.
// Antes estaba en src/renderer/templates.js; se instala al cargar el bundle (index.tsx).
import { useState } from 'react';
import Boton from '../../../ui/Boton';
import ListaDatos from '../../../ui/ListaDatos';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../../ui/Ventana';
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
    <VentanaCabecera icono="sign" titulo="Confirmar envío" cerrable={!enviando} />
    <VentanaCuerpo>
      <ListaDatos datos={[
        ['Trámite', d.nombre],
        ['Firmantes', d.firmantes.length ? d.firmantes.map((f, i) => <span key={i}>{f}{i < d.firmantes.length - 1 ? <br /> : null}</span>) : '—'],
        ['Saldo actual', clp(saldoSesion())],
      ]} />
      <p className="tw:mt-4 tw:mb-0 tw:text-[12.5px] tw:text-muted tw:leading-relaxed">Portalfirma generará el documento con estos datos, cobrará el trámite de la billetera y enviará los enlaces de firma.</p>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Volver</Boton>
      <Boton id="mOk" disabled={enviando} onClick={ok}>{enviando ? 'Enviando…' : 'Confirmar y enviar'}</Boton>
    </VentanaPie>
  </>;
}

export function confirmarEnvio(d: IEnvio, avisos: IAvisos) { abrirModal(<ConfirmarEnvio d={d} avisos={avisos} />, { clave: 'modal-115' }); }

export function instalarNotaria() {
  const w = window as unknown as { openTemplates: () => void; Notaria: object; ReactUI: { montar: (n: string, el: Element | null) => void } };
  // el estado vive en el store: al volver sigue donde quedó
  w.openTemplates = () => w.ReactUI.montar('GestionNotariaVirtual', document.getElementById('tplBody'));
  w.Notaria = { confirmarEnvio };
}
