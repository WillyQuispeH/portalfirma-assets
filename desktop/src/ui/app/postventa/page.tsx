// Pestaña «Postventa». La página solo invoca su componente functional.
import Postventa from '../../components/functional/postventa/Postventa';
import type { TPvTab } from '../../store/interfaces/postventa.interface';

export default function PostventaPage({ tab }: { tab?: TPvTab }) {
  return <Postventa tab={tab} />;
}
