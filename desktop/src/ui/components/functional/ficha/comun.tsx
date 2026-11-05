// Piezas que comparten la ficha de la propiedad y el detalle de la persona.
// Usan las clases im-* de styles.css (las mismas de antes), así la pantalla se ve igual.
import type { ReactNode } from 'react';
import { monto, fechaHora } from '../../../utils/formato';
import { abrirUrl, toast } from '../../../utils/app';
import type { IMonto } from '../../../store/interfaces/negocio.interface';
import type { IRegistroActividad } from '../../../store/interfaces/propiedad.interface';

// 'UF 12.500' · '$650.000' · '' sin precio
export const precio = (p?: IMonto | null) => (!p || p.valor == null ? '' : monto(Number(p.valor), p.moneda));
export const num = (n: number) => Number(n).toLocaleString('es-CL', { maximumFractionDigits: 2 });

// estado de un documento enviado a firmar: [texto, clase de .im-st]
export const ESTADO_FIRMA: Record<string, [string, string]> = {
  en_firma: ['En firma', 'wait'], firmado: ['Firmado', 'ok'], pendiente_pago: ['Pendiente de pago', 'bad'],
};
export const estadoFirma = (e?: string) => ESTADO_FIRMA[e || ''] || ESTADO_FIRMA.en_firma;

// Una fila de una lista de datos (<dl class="im-dl">); sin valor no se muestra
export function Fila({ k, v }: { k: string; v: ReactNode }) {
  if (v === '' || v == null || v === false) return null;
  return <div><dt>{k}</dt><dd>{v}</dd></div>;
}

// El historial (lo último o completo): las notas escritas a mano se destacan
export function ListaActividad({ items }: { items: IRegistroActividad[] }) {
  return (
    <ul className="im-act sm">
      {items.map((a, i) => (
        <li key={`${a.fecha}-${i}`} className={a.tipo === 'nota' ? 'nota' : ''}><i /><span>{a.texto}<small>{fechaHora(a.fecha)}</small></span></li>
      ))}
    </ul>
  );
}

// Contacto rápido
export const whatsapp = (telefono: string) => abrirUrl('https://wa.me/' + telefono.replace(/\D/g, ''));
export async function copiarCorreo(email: string) {
  try { await navigator.clipboard.writeText(email); toast('Correo copiado.'); } catch (e) { toast((e as Error).message, 4000); }
}
