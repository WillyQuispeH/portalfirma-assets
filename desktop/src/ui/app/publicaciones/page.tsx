// Pestaña «Publicaciones». La página solo invoca su componente functional.
import Publicaciones from '../../components/functional/publicaciones/Publicaciones';
import type { TInteresadoEstado, TPubTab } from '../../store/interfaces/publicacion.interface';

export default function PublicacionesPage({ tab, filtro }: { tab?: TPubTab; filtro?: TInteresadoEstado | '' }) {
  return <Publicaciones tab={tab} filtro={filtro} />;
}
