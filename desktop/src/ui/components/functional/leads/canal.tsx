// De qué canal viene cada mensaje de un lead (WhatsApp, Instagram, Facebook Messenger o correo) y su ícono con color.
import Icono from '../../ui/Icono';
import { cx } from '../../../utils/cx';
import type { ILeadDetalle, IMensajeLead, TCanal } from '../../../store/interfaces/lead.interface';

export const CANALES: Record<TCanal, { nombre: string; icono: string; color: string; fondo: string }> = {
  whatsapp: { nombre: 'WhatsApp', icono: 'whatsapp', color: 'tw:text-[#1a9e55]', fondo: 'tw:bg-green-soft tw:text-green-softink' },
  instagram: { nombre: 'Instagram', icono: 'instagram', color: 'tw:text-[#d62976]', fondo: 'tw:bg-peach-soft tw:text-peach-softink' },
  facebook: { nombre: 'Messenger', icono: 'messenger', color: 'tw:text-[#1877f2]', fondo: 'tw:bg-blue-soft tw:text-blue-softink' },
  email: { nombre: 'Correo', icono: 'mail', color: 'tw:text-[#6b6f80]', fondo: 'tw:bg-gray-soft tw:text-gray-softink' },
};

const normal = (c?: string | null): TCanal | null =>
  c === 'whatsapp' || c === 'instagram' || c === 'facebook' || c === 'email' ? c : c === 'correo' ? 'email' : c === 'messenger' ? 'facebook' : null;

/** el canal del lead cuando el mensaje no lo dice (chats importados): por dónde llegó */
export function canalDelLead(l: Pick<ILeadDetalle, 'origen' | 'ig'>): TCanal {
  return normal(l.origen) ?? (l.ig ? 'instagram' : 'whatsapp');
}

export function canalDe(m: IMensajeLead, l: Pick<ILeadDetalle, 'origen' | 'ig'>): TCanal {
  return normal(m.canal) ?? (m.ig ? 'instagram' : canalDelLead(l));
}

/**
 * Por dónde saldría un mensaje del corredor (lo mismo que decide el servidor): por el canal en que el interesado escribió
 * por última vez si es Instagram o Facebook; si no, por WhatsApp si tiene celular. `fuera24` = WhatsApp sin mensaje del
 * interesado en las últimas 24 h (saldrá la plantilla de primer contacto y el mensaje quedará pendiente).
 */
export function canalDeSalida(l: ILeadDetalle): { canal: TCanal | null; fuera24: boolean } {
  const ultimo = [...l.mensajesLista].reverse().find((m) => m.de === 'cliente');
  const ultimoCanal = ultimo ? canalDe(ultimo, l) : null;
  const dm = (l.canales || []).find((c) => (c.canal === 'instagram' || c.canal === 'facebook') && c.contactId);
  const tel = !!String(l.telefono || '').replace(/\D/g, '');
  if (dm && (!tel || ultimoCanal === dm.canal)) return { canal: dm.canal as TCanal, fuera24: false };
  if (!tel) return { canal: null, fuera24: false };
  const ultimoWa = [...l.mensajesLista].reverse().find((m) => m.de === 'cliente' && canalDe(m, l) === 'whatsapp');
  const hace = ultimoWa ? Date.now() - new Date(ultimoWa.fecha.replace(' ', 'T')).getTime() : Infinity;
  return { canal: 'whatsapp', fuera24: !(hace < 24 * 36e5) };
}

/** el ícono del canal, con su color */
export function IconoCanal({ canal, tam = 13, className }: { canal: TCanal; tam?: number; className?: string }) {
  return <span className={cx('tw:inline-flex', CANALES[canal].color, className)} title={CANALES[canal].nombre}><Icono nombre={CANALES[canal].icono} tam={tam} /></span>;
}

/** «WhatsApp», «Instagram»… en una pastilla con su color */
export function ChipCanal({ canal, texto, className }: { canal: TCanal; texto?: string; className?: string }) {
  return (
    <span className={cx('tw:inline-flex tw:items-center tw:gap-1 tw:h-6 tw:px-2 tw:rounded-full tw:text-[11.5px] tw:font-semibold tw:whitespace-nowrap', CANALES[canal].fondo, className)}>
      <Icono nombre={CANALES[canal].icono} tam={12} />{texto ?? CANALES[canal].nombre}
    </span>
  );
}
