// Arriendos y cobranza: la etapa 3 de Asset, todavía en construcción. Mientras tanto, lleva a «Plazos y
// vencimientos» (Gestión documental), donde ya se ordenan los contratos por vencimiento.
// La prueba propiedades-e2e usa «Etapa 3» y [data-act="plazos"].
import Icono from '../../ui/Icono';
import { abrirPlazos } from '../../../utils/app';

export default function Arriendos() {
  return (
    <div className="im-wrap">
      <div className="im-soon">
        <span className="im-eic"><Icono nombre="key" tam={36} /></span>
        <small>Etapa 3 · en construcción</small>
        <h1>Arriendos y cobranza</h1>
        <p>Cobro mensual con enlace Flow o transferencia, reajuste IPC/UF, morosidad, liquidación al propietario, garantía, renovación y término, con avisos por WhatsApp.</p>
        <h3>Mientras tanto, desde Gestión documental</h3>
        <div className="im-soonb">
          <button className="im-at" data-act="plazos" onClick={abrirPlazos}>
            <span><b>Plazos y vencimientos</b><small>Tus contratos ordenados por vencimiento</small></span>
            <Icono nombre="chevR" tam={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
