// Publicaciones › Publicar una propiedad. La página solo invoca su componente functional.
import PublicarAviso from '../../../components/functional/publicaciones/publicar/PublicarAviso';
import type { TPasoPublicar, TPubOperacion } from '../../../store/interfaces/publicacion.interface';

export default function PublicarAvisoPage(props: { propId: string; op: TPubOperacion; ops: TPubOperacion[]; paso?: TPasoPublicar }) {
  return <PublicarAviso {...props} />;
}
