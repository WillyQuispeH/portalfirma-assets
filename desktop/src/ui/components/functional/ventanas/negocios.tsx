// Ventanas en React que abre el código antiguo de este grupo (src/renderer). Cada una se registra aquí con su nombre
// («negocios.algo») y se abre desde el JS antiguo con window.Ventanas.abrir('negocios.algo', props, { clave: 'modal-N' }).
// Ver registro.tsx.
import type { TVentanas } from './registro';
import { EliminarNegocio, EnviarDocumento, MarcarPerdido, NuevoNegocio, PasarSinFirma, VincularFirma } from '../negocios/VentanasAntiguas';
import { ConfirmarOrden, NuevoEvento, PreparandoOrden } from '../agenda/VentanasAntiguas';
import { CartaOferta } from '../negocios/CartaOferta';
import { ContratoArriendo } from '../negocios/ContratoArriendo';
import { ActaEntrega } from '../negocios/ActaEntrega';
import { MandatoArriendo } from '../negocios/MandatoArriendo';
import { MandatoVenta } from '../negocios/MandatoVenta';
import { PromesaCompraventa } from '../negocios/PromesaCompraventa';
import { EscrituraCompraventa } from '../negocios/EscrituraCompraventa';
import { NuevoContratista, NuevoReclamo } from '../postventa/VentanasAntiguas';

export const ventanas: TVentanas = {
  // negocios.js
  'negocios.nuevo': NuevoNegocio, // modal-44
  'negocios.pasarSinFirma': PasarSinFirma, // modal-45
  'negocios.perdido': MarcarPerdido, // modal-46
  'negocios.eliminar': EliminarNegocio, // modal-47
  'negocios.vincularFirma': VincularFirma, // modal-48
  'negocios.enviarDocumento': EnviarDocumento, // modal-49
  // agenda.js
  'negocios.agendaNuevo': NuevoEvento, // modal-1
  'negocios.agendaPreparandoOrden': PreparandoOrden, // modal-2
  'negocios.agendaOrdenVisita': ConfirmarOrden, // modal-3
  // etapas.js (carta oferta)
  'negocios.cartaOferta': CartaOferta, // modal-125
  'negocios.contratoArriendo': ContratoArriendo, // modal-127
  'negocios.actaEntrega': ActaEntrega, // modal-128
  'negocios.mandatoArriendo': MandatoArriendo, // modal-129
  'negocios.mandatoVenta': MandatoVenta, // modal-131
  'negocios.promesaCompraventa': PromesaCompraventa, // modal-147
  'negocios.escrituraCompraventa': EscrituraCompraventa, // modal-148
  // postventa.js
  'negocios.postventaContratista': NuevoContratista, // modal-53
  'negocios.postventaReclamo': NuevoReclamo, // modal-54
};
