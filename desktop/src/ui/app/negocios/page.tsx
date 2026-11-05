// Pestaña «Negocios». La página solo invoca su componente functional.
import Negocios from '../../components/functional/negocios/Negocios';
import type { TNegocioTipo } from '../../store/interfaces/negocio.interface';

export default function NegociosPage({ tipo }: { tipo?: TNegocioTipo }) {
  return <Negocios tipo={tipo} />;
}
