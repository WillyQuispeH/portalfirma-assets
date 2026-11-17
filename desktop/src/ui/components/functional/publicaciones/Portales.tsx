// Pestaña «Portales» de Publicaciones: el contacto de los avisos en una línea y las tarjetas de todos los portales (las mismas
// de Cartera › Portales, ver CardsPortales.tsx). El CRUD de cada aviso (publicar, actualizar, pausar, reactivar, retirar y
// eliminar) está en la pestaña «Avisos». El id pbCt lo usa test/publicaciones-e2e.js.
import Icono from '../../ui/Icono';
import Boton from '../../ui/Boton';
import Card from '../../ui/Card';
import { editarContactoAvisos } from '../../../utils/app';
import { usePublicacion } from '../../../store/hooks/usePublicacion.hook';
import { EsqueletoGrilla, GrillaPortales, NOTA_PORTALES, useCuentaML } from './CardsPortales';

export default function Portales() {
  const { portales } = usePublicacion();
  const cuenta = useCuentaML();
  if (!portales) return <EsqueletoGrilla />;
  const c = portales.contacto;
  return (
    <>
      <Card>
        <div className="tw:flex tw:items-center tw:gap-ui tw:text-sm">
          <span className="tw:grid tw:place-items-center tw:flex-none tw:size-9 tw:rounded-icono tw:bg-lav-soft tw:text-lav-softink"><Icono nombre="phone" tam={16} /></span>
          <span className="tw:flex-1 tw:min-w-0"><b>Contacto de los avisos:</b> {[c.nombre, c.email, c.whatsapp ? 'WhatsApp ' + c.whatsapp : 'sin WhatsApp'].filter(Boolean).join(' · ') || 'sin configurar'}</span>
          <Boton variante="secundario" tamano="sm" icono="edit" id="pbCt" onClick={() => editarContactoAvisos(c)}>Editar</Boton>
        </div>
      </Card>
      <GrillaPortales cuenta={cuenta} />
      <p className="tw:m-0 tw:text-xs tw:text-muted">{NOTA_PORTALES}</p>
    </>
  );
}
