// Gestión documental › Expedientes. La página solo invoca su componente functional.
import Expedientes from '../../../components/functional/gestion/expedientes/Expedientes';

export default function GestionExpedientesPage({ sel }: { sel?: string | null }) {
  return <Expedientes sel={sel} />;
}
