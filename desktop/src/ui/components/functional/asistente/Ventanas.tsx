// Ventanas del Asistente legal que no dependen del editor (en el modal de la app, utils/modal.tsx):
// el aviso antes de usar IA, los tokens (comprar o activar un código) y «Redactar con el asistente».
// El panel de revisión sigue en src/renderer/asistente.js, con el editor. Los id (#mOk, #dq, #tkCode…) los usan las pruebas.
import { useEffect, useState } from 'react';
import Icono from '../../ui/Icono';
import { asistenteEstado, useAsistente } from '../../../store/hooks/useAsistente.hook';
import { cerrarModal } from '../../../utils/modal';
import { soporteWhatsApp, toast } from '../../../utils/app';

export const tokens = (n: number) => `${n} token${n === 1 ? '' : 's'}`;
const pesos = (n?: number) => '$' + Number(n || 0).toLocaleString('es-CL');

export function Consentimiento({ proveedor, alResponder }: { proveedor: string; alResponder: (si: boolean) => void }) {
  const { asistenteConsentir } = useAsistente();
  return <>
    <h2><Icono nombre="sparkle" tam={18} /> Antes de usar el asistente</h2>
    <p>Para revisar o responder, el <strong>texto del documento se envía a {proveedor}</strong>, que lo procesa con su modelo de IA. Revisa con tu equipo si los documentos de tus clientes pueden enviarse a ese servicio.</p>
    <p className="muted small">El asistente puede equivocarse. Sus sugerencias y las normas que cite deben verificarse; no reemplaza la revisión de un abogado.</p>
    <div className="actions">
      <button className="secondary" id="mCancel" onClick={() => { cerrarModal(); alResponder(false); }}>Cancelar</button>
      <button className="primary" id="mOk" onClick={async () => { cerrarModal(); await asistenteConsentir(); alResponder(true); }}>Entiendo, continuar</button>
    </div>
  </>;
}

export function Tokens({ motivo, alActivar }: { motivo?: string; alActivar: () => void }) {
  const { billetera: w, asistenteCanjear } = useAsistente();
  const [codigo, setCodigo] = useState(''); const [malo, setMalo] = useState(false);
  if (!w) return null;
  const p = w.pack || {};
  const activar = async () => {
    const err = await asistenteCanjear(codigo);
    if (err) { setMalo(true); toast(err, 5000); return; }
    cerrarModal(); alActivar(); toast(`Paquete activado: ahora tienes ${tokens(asistenteEstado().billetera?.balance ?? 0)}.`, 4000);
  };
  const filas: [string, string][] = [
    ['Revisar documento', tokens(w.costs.review ?? 0)], [`Preguntar (bloque de ${w.askPerToken ?? 3} preguntas)`, tokens(w.costs.ask ?? 0)],
    ['Detectar campos de una plantilla', tokens(w.costs.detect ?? 0)], ['Redactar un documento', tokens(w.costs.draft ?? 0)],
    ['Cada cambio pedido a la IA en un documento', tokens(w.costs.edit ?? 0)], ['Analizar los plazos de un documento', tokens(w.costs.plazo ?? 0)],
    ['Chequeos de RUT y montos, aplicar sugerencias, editar el texto a mano', 'Gratis'],
  ];
  return <>
    <h2><Icono nombre="sparkle" tam={18} /> Tokens del asistente</h2>
    {motivo && <p className="tk-warn">{motivo}</p>}
    <div className="tk-big"><b>{tokens(w.balance)}</b><span>disponibles</span></div>
    <table className="tk-costs"><tbody>{filas.map(([a, b]) => <tr key={a}><td>{a}</td><td>{b}</td></tr>)}</tbody></table>
    <div className="tk-pack"><div><b>{p.name || 'Paquete de tokens'}</b><span>{p.tokens} tokens por {pesos(p.price)}</span></div>
      <button className="primary wa-btn with-ic" id="tkWa" onClick={() => soporteWhatsApp(`Hola, quiero comprar un ${p.name || 'Paquete de tokens'} (${p.tokens} tokens por ${pesos(p.price)}) para el asistente de PortalFirma Asset.`)}><Icono nombre="whatsapp" tam={16} /><span>Comprar por WhatsApp</span></button></div>
    <label>¿Ya pagaste? Ingresa el código que te envió soporte
      <div className="tk-row"><input id="tkCode" autoComplete="off" spellCheck={false} placeholder="Código de activación" className={malo ? 'invalid' : ''} value={codigo}
        onChange={(e) => { setCodigo(e.target.value); setMalo(false); }} onKeyDown={(e) => { if (e.key === 'Enter') activar(); }} />
        <button className="secondary" id="tkGo" onClick={activar}>Activar</button></div>
    </label>
    <div className="actions"><button className="secondary" id="mCancel" onClick={cerrarModal}>Cerrar</button></div>
  </>;
}

export function Redactar({ inicial, alRedactar }: { inicial: string; alRedactar: (pedido: string) => void }) {
  const { billetera, asistenteBilletera } = useAsistente();
  const [pedido, setPedido] = useState(inicial);
  useEffect(() => { if (!billetera) asistenteBilletera(); }, [billetera, asistenteBilletera]);
  return <>
    <h2><Icono nombre="sparkle" tam={18} /> Redactar con el asistente</h2>
    <label>Describe el documento<textarea id="dq" rows={7} style={{ width: '100%', marginTop: 6 }} value={pedido} onChange={(e) => setPedido(e.target.value)}
      placeholder="Ej.: Contrato de arriendo de una oficina en Providencia por 12 meses, renta de $800.000 reajustable por IPC, con garantía de un mes." /></label>
    <p className="muted small">Se abre listo para completar los datos en un formulario; después puedes pedir cambios al texto. El asistente puede equivocarse: revisa el documento. No se pueden redactar pagarés, autorizaciones de salida del país de menores ni finiquitos (requieren notaría).</p>
    <div className="actions"><button className="secondary" id="mCancel" onClick={cerrarModal}>Cancelar</button>
      <button className="primary" id="mOk" onClick={() => { cerrarModal(); alRedactar(pedido); }}>Redactar <small className="tk-cost">{tokens(billetera?.costs?.draft ?? 2)}</small></button></div>
  </>;
}
