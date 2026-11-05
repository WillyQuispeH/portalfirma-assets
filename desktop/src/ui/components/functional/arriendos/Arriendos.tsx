// Arriendos y cobranza: la etapa 3 de Asset, todavía en construcción. Mientras tanto, lleva a «Plazos y
// vencimientos» (Gestión documental), donde ya se ordenan los contratos por vencimiento.
// Hecha con el kit: Layout (cabecera con ilustración), Card e ItemLista.
// La prueba propiedades-e2e usa «Etapa 3» y [data-act="plazos"].
import Layout from '../../ui/Layout';
import Card from '../../ui/Card';
import ItemLista from '../../ui/ItemLista';
import Icono from '../../ui/Icono';
import { abrirPlazos } from '../../../utils/app';

export default function Arriendos() {
  return (
    <Layout
      titulo="Arriendos y cobranza"
      sobretitulo="Etapa 3 · en construcción"
      ilustracion={{ imagen: 'img/formas/cartera.svg', tinte: '#d6336c' }}
      subtitulo="Cobro mensual con enlace Flow o transferencia, reajuste IPC/UF, morosidad, liquidación al propietario, garantía, renovación y término, con avisos por WhatsApp."
    >
      <Card titulo="Mientras tanto, desde Gestión documental">
        <ItemLista data-act="plazos" alTocar={abrirPlazos} flecha className="tw:-mx-3"
          media={<span className="tw:grid tw:place-items-center tw:size-10 tw:rounded-xl tw:bg-lav-soft tw:text-lav-softink"><Icono nombre="calendar" tam={18} /></span>}
          titulo="Plazos y vencimientos" detalle="Tus contratos ordenados por vencimiento" />
      </Card>
    </Layout>
  );
}
