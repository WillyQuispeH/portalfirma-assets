// Ventanas del Asistente legal que no dependen del editor (en el modal de la app, utils/modal.tsx, con las partes del kit:
// VentanaCabecera, VentanaCuerpo y VentanaPie): el aviso antes de usar IA, los tokens (comprar o activar un código) y
// «Redactar con el asistente». El panel de revisión sigue en src/renderer/asistente.js, con el editor.
// Los id (#mOk, #dq, #tkCode…) y las clases tk-* los usan las pruebas.
import { useEffect, useState } from 'react';
import Boton from '../../ui/Boton';
import Input from '../../ui/Input';
import Textarea from '../../ui/Textarea';
import { CAJA_ERROR } from '../../ui/Campo';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../ui/Ventana';
import { asistenteEstado, useAsistente } from '../../../store/hooks/useAsistente.hook';
import { cerrarModal } from '../../../utils/modal';
import { soporteWhatsApp, toast } from '../../../utils/app';

export const tokens = (n: number) => `${n} token${n === 1 ? '' : 's'}`;
const pesos = (n?: number) => '$' + Number(n || 0).toLocaleString('es-CL');
// textos del cuerpo: párrafo y nota en gris
const P = 'tw:mt-0 tw:mb-3 tw:leading-relaxed';
const NOTA = 'tw:m-0 tw:text-[12.5px] tw:text-muted tw:leading-relaxed';

export function Consentimiento({ proveedor, alResponder }: { proveedor: string; alResponder: (si: boolean) => void }) {
  const { asistenteConsentir } = useAsistente();
  return <>
    <VentanaCabecera icono="sparkle" titulo="Antes de usar el asistente" />
    <VentanaCuerpo>
      <p className={P}>Para revisar o responder, el <strong>texto del documento se envía a {proveedor}</strong>, que lo procesa con su modelo de IA. Revisa con tu equipo si los documentos de tus clientes pueden enviarse a ese servicio.</p>
      <p className={NOTA}>El asistente puede equivocarse. Sus sugerencias y las normas que cite deben verificarse; no reemplaza la revisión de un abogado.</p>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={() => { cerrarModal(); alResponder(false); }}>Cancelar</Boton>
      <Boton id="mOk" onClick={async () => { cerrarModal(); await asistenteConsentir(); alResponder(true); }}>Entiendo, continuar</Boton>
    </VentanaPie>
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
    <VentanaCabecera icono="sparkle" titulo="Tokens del asistente" />
    <VentanaCuerpo>
      {motivo && <p className="tk-warn tw:mt-0 tw:mb-3">{motivo}</p>}
      <div className="tk-big"><b>{tokens(w.balance)}</b><span>disponibles</span></div>
      <table className="tk-costs"><tbody>{filas.map(([a, b]) => <tr key={a}><td>{a}</td><td>{b}</td></tr>)}</tbody></table>
      <div className="tk-pack"><div><b>{p.name || 'Paquete de tokens'}</b><span>{p.tokens} tokens por {pesos(p.price)}</span></div>
        <Boton id="tkWa" variante="exito" icono="whatsapp" onClick={() => soporteWhatsApp(`Hola, quiero comprar un ${p.name || 'Paquete de tokens'} (${p.tokens} tokens por ${pesos(p.price)}) para el asistente de PortalFirma Asset.`)}>Comprar por WhatsApp</Boton></div>
      <div className="tw:flex tw:gap-2 tw:items-end">
        <Input id="tkCode" etiqueta="¿Ya pagaste? Ingresa el código que te envió soporte" clasesCampo="tw:flex-1 tw:min-w-0" autoComplete="off" spellCheck={false} placeholder="Código de activación"
          className={malo ? CAJA_ERROR : undefined} aria-invalid={malo || undefined} value={codigo}
          onChange={(e) => { setCodigo(e.target.value); setMalo(false); }} onKeyDown={(e) => { if (e.key === 'Enter') activar(); }} />
        <Boton id="tkGo" variante="secundario" onClick={activar}>Activar</Boton>
      </div>
    </VentanaCuerpo>
    <VentanaPie><Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cerrar</Boton></VentanaPie>
  </>;
}

export function Redactar({ inicial, alRedactar }: { inicial: string; alRedactar: (pedido: string) => void }) {
  const { billetera, asistenteBilletera } = useAsistente();
  const [pedido, setPedido] = useState(inicial);
  useEffect(() => { if (!billetera) asistenteBilletera(); }, [billetera, asistenteBilletera]);
  return <>
    <VentanaCabecera icono="sparkle" titulo="Redactar con el asistente" />
    <VentanaCuerpo>
      <Textarea id="dq" etiqueta="Describe el documento" rows={7} value={pedido} onChange={(e) => setPedido(e.target.value)}
        placeholder="Ej.: Contrato de arriendo de una oficina en Providencia por 12 meses, renta de $800.000 reajustable por IPC, con garantía de un mes." />
      <p className="tw:mt-3 tw:mb-0 tw:text-[12.5px] tw:text-muted tw:leading-relaxed">Se abre listo para completar los datos en un formulario; después puedes pedir cambios al texto. El asistente puede equivocarse: revisa el documento. No se pueden redactar pagarés, autorizaciones de salida del país de menores ni finiquitos (requieren notaría).</p>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
      <Boton id="mOk" icono="sparkle" onClick={() => { cerrarModal(); alRedactar(pedido); }}>Redactar <small className="tk-cost">{tokens(billetera?.costs?.draft ?? 2)}</small></Boton>
    </VentanaPie>
  </>;
}
