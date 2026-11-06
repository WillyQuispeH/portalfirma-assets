// Ventanas en React que abre el código antiguo de este grupo (src/renderer). Cada una se registra aquí con su nombre
// («negocios.algo») y se abre desde el JS antiguo con window.Ventanas.abrir('negocios.algo', props, { clave: 'modal-N' }).
// Ver registro.tsx.
import type { TVentanas } from './registro';
import { EliminarNegocio, EnviarDocumento, MarcarPerdido, NuevoNegocio, PasarSinFirma, VincularFirma } from '../negocios/VentanasAntiguas';
import { ConfirmarOrden, NuevoEvento, PreparandoOrden } from '../agenda/VentanasAntiguas';
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
  // postventa.js
  'negocios.postventaContratista': NuevoContratista, // modal-53
  'negocios.postventaReclamo': NuevoReclamo, // modal-54
};
