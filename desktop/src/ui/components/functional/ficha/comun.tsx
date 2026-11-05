// Piezas que comparten la ficha de la propiedad y el detalle de la persona.
import LineaTiempo from '../../ui/LineaTiempo';
import Icono from '../../ui/Icono';
import { monto, fechaHora } from '../../../utils/formato';
import { abrirUrl, toast } from '../../../utils/app';
import type { IMonto } from '../../../store/interfaces/negocio.interface';
import type { IRegistroActividad } from '../../../store/interfaces/propiedad.interface';
import type { TTono } from '../../ui/tonos';

// 'UF 12.500' · '$650.000' · '' sin precio
export const precio = (p?: IMonto | null) => (!p || p.valor == null ? '' : monto(Number(p.valor), p.moneda));
export const num = (n: number) => Number(n).toLocaleString('es-CL', { maximumFractionDigits: 2 });

// estado de un documento enviado a firmar: [texto, clave del estado]
export const ESTADO_FIRMA: Record<string, [string, string]> = {
  en_firma: ['En firma', 'wait'], firmado: ['Firmado', 'ok'], pendiente_pago: ['Pendiente de pago', 'bad'],
};
export const estadoFirma = (e?: string) => ESTADO_FIRMA[e || ''] || ESTADO_FIRMA.en_firma;
// clave del estado → tono de su etiqueta (Badge)
export const TONO_FIRMA: Record<string, TTono> = { ok: 'verde', wait: 'amarillo', bad: 'rojo' };

// Ícono de una fila de documento (en ItemLista)
export function IconoDoc({ nombre }: { nombre: string }) {
  return <span className="tw:grid tw:place-items-center tw:w-9 tw:h-9 tw:rounded-xl tw:bg-sunken tw:text-muted"><Icono nombre={nombre} tam={16} /></span>;
}

// El historial (lo último o completo), en línea de tiempo: las notas escritas a mano se destacan (li[data-nota])
export function ListaActividad({ items }: { items: IRegistroActividad[] }) {
  return <LineaTiempo items={items.map((a) => ({ texto: a.texto, fecha: fechaHora(a.fecha), destacado: a.tipo === 'nota' }))} />;
}

// Contacto rápido
export const whatsapp = (telefono: string) => abrirUrl('https://wa.me/' + telefono.replace(/\D/g, ''));
export async function copiarCorreo(email: string) {
  try { await navigator.clipboard.writeText(email); toast('Correo copiado.'); } catch (e) { toast((e as Error).message, 4000); }
}
