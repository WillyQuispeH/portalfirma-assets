// Gestión documental › Mis operaciones. La página solo invoca su componente functional.
import Operaciones from '../../../components/functional/gestion/operaciones/Operaciones';

export default function GestionOperacionesPage({ sel }: { sel?: number | null }) {
  return <Operaciones sel={sel} />;
}
