// Ventanas en React que abre el código antiguo de este grupo (src/renderer). Cada una se registra aquí con su nombre
// («agente.algo») y se abre desde el JS antiguo con window.Ventanas.abrir('agente.algo', props, { clave: 'modal-N' }).
// Ver registro.tsx.
import type { TVentanas } from './registro';
import { Actividad, Adjuntar, BorrarConversacion, ClaveIA, ConectarDriveFotos, FotosDrive, Herramientas, Renombrar } from '../agente/VentanasAntiguas';
import { Avance, GuardarEnExpediente, MasOpcionesExpediente, NuevoExpediente, QuitarExpediente } from '../gestion/expedientes/VentanasAntiguas';

export const ventanas: TVentanas = {
  // agente.js
  'agente.adjuntar': Adjuntar, // modal-4
  'agente.herramientas': Herramientas, // modal-5
  'agente.actividad': Actividad, // modal-6
  'agente.renombrar': Renombrar, // modal-7
  'agente.borrarConversacion': BorrarConversacion, // modal-8
  'agente.claveIA': ClaveIA, // modal-9
  // dictado.js
  'agente.conectarDriveFotos': ConectarDriveFotos, // modal-10
  'agente.fotosDrive': FotosDrive, // modal-11
  // expedientes.js
  'agente.expAvance': Avance, // modal-14 y modal-15
  'agente.expNuevo': NuevoExpediente, // modal-16
  'agente.expMas': MasOpcionesExpediente, // modal-17
  'agente.expQuitar': QuitarExpediente, // modal-18
  'agente.expGuardar': GuardarEnExpediente, // modal-19
};
