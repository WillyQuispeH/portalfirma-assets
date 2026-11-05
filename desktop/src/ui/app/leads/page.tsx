// Pestaña «Leads». La página solo invoca su componente functional.
import Leads from '../../components/functional/leads/Leads';
import type { TLeadFiltro } from '../../store/interfaces/lead.interface';

export default function LeadsPage({ sel, filtro }: { sel?: string | null; filtro?: TLeadFiltro }) {
  return <Leads sel={sel} filtro={filtro} />;
}
