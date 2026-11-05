// Gestión documental › Carga masiva. La página solo invoca su componente functional.
import CargaMasiva from '../../../components/functional/gestion/carga-masiva/CargaMasiva';

export default function GestionCargaMasivaPage({ tab }: { tab?: 'load' | 'cds' }) {
  return <CargaMasiva tab={tab} />;
}
