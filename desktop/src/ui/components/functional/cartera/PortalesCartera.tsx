// Cartera › Portales: el contacto que sale en los avisos y las tarjetas de todos los portales (Portal Inmobiliario por API;
// Chilepropiedades, Broku, TOCTOC y Yapo por feed), las mismas de Publicaciones › Portales (publicaciones/CardsPortales.tsx).
// Se abre con Inmo.portales() (src/renderer/inmo.js), que la monta en #view-cartera, el mismo contenedor de la lista.
// Hecha con el kit: Layout, Card, Input, Select, Boton y Esqueleto; los espacios salen de --ui-gap (tw:gap-ui).
// Las pruebas buscan #poBack, #coNom, #coMail, #coWa, #coTel, #coWeb, #coTipo, #coSave y #coErr.
import { useEffect, useState } from 'react';
import Layout from '../../ui/Layout';
import Card from '../../ui/Card';
import Boton from '../../ui/Boton';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import { api } from '../../../utils/api';
import { abrirCartera, toast } from '../../../utils/app';
import { usePublicacion } from '../../../store/hooks/usePublicacion.hook';
import { EsqueletoGrilla, GrillaPortales, NOTA_PORTALES, TIPO_AVISO, useCuentaML } from '../publicaciones/CardsPortales';

function ContactoAvisos({ cuenta }: { cuenta: ReturnType<typeof useCuentaML> }) {
  const { e, cargar } = cuenta;
  const { portalesGetAll } = usePublicacion();
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const c = e?.contacto || {};
  const guardar = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault(); const d = new FormData(ev.currentTarget); const v = (k: string) => String(d.get(k) ?? '');
    setGuardando(true);
    try {
      await api('mlContacto', { nombre: v('nombre'), email: v('email'), whatsapp: v('whatsapp'), telefono: v('telefono'), web: v('web') }, v('tipo'));
      setError(''); toast('Contacto guardado.'); void cargar(); void portalesGetAll();
    } catch (er) { setError((er as Error).message); }
    setGuardando(false);
  };
  return (
    <Card titulo="Contacto que aparece en los avisos" subtitulo={e?.whatsappEmpresa ? `Lo ven los interesados en todos los portales. El WhatsApp de los avisos es el de la corredora en wechatia: ${e.whatsappEmpresa}.` : 'Lo ven los interesados en todos los portales. El WhatsApp es obligatorio.'}
      pie={<div className="tw:flex tw:justify-end"><Boton id="coSave" type="submit" form="frmContactoAvisos" cargando={guardando}>Guardar contacto</Boton></div>}>
      <form id="frmContactoAvisos" key={JSON.stringify(c) + (e?.tipoAviso ?? '')} onSubmit={guardar} className="tw:flex tw:flex-col tw:gap-ui">
        <div className="tw:grid tw:grid-cols-1 tw:md:grid-cols-3 tw:gap-ui">
          <Input id="coNom" name="nombre" etiqueta="Nombre de la corredora" defaultValue={c.nombre || ''} />
          <Input id="coMail" name="email" type="email" etiqueta="Correo para consultas" defaultValue={c.email || ''} />
          <Input id="coWa" name="whatsapp" etiqueta={e?.whatsappEmpresa ? 'WhatsApp de respaldo' : 'WhatsApp'} placeholder={e?.whatsappEmpresa || '+56 9 1234 5678'} defaultValue={c.whatsapp || ''}
            ayuda={e?.whatsappEmpresa ? 'Solo se usa si la corredora no tiene número en wechatia.' : undefined} />
          <Input id="coTel" name="telefono" etiqueta="Teléfono" defaultValue={c.telefono || ''} />
          <Input id="coWeb" name="web" etiqueta="Sitio web" placeholder="https://" defaultValue={c.web || ''} />
          <Select id="coTipo" name="tipo" etiqueta="Tipo de aviso por defecto" defaultValue={e?.tipoAviso || 'silver'} opciones={Object.entries(TIPO_AVISO)} />
        </div>
        <p id="coErr" role="alert" className="tw:m-0 tw:min-h-[1.2em] tw:text-sm tw:text-red-softink">{error}</p>
      </form>
    </Card>
  );
}

export default function PortalesCartera() {
  const { portales, portalesGetAll } = usePublicacion();
  const cuenta = useCuentaML();
  useEffect(() => { void portalesGetAll(); }, [portalesGetAll]);
  return (
    <Layout volver={{ texto: 'Cartera', alTocar: abrirCartera, id: 'poBack' }} titulo="Portales" ilustracion={{ imagen: 'img/formas/portales.svg' }}
      subtitulo="Conecta cada portal y deja el contacto de los avisos. Cada cambio de precio, fotos o estado se refleja solo en lo publicado.">
      {cuenta.error && <p role="alert" className="tw:m-0 tw:text-red-softink">No se pudo leer el estado de los portales: {cuenta.error}</p>}
      {!cuenta.e && !cuenta.error ? <EsqueletoGrilla /> : (
        <>
          <ContactoAvisos cuenta={cuenta} />
          {portales ? <GrillaPortales cuenta={cuenta} /> : <EsqueletoGrilla />}
          <p className="tw:m-0 tw:text-xs tw:text-muted">{NOTA_PORTALES}</p>
        </>
      )}
    </Layout>
  );
}
