// Ventanas en React que abre el código antiguo de este grupo (src/renderer). Cada una se registra aquí con su nombre
// («inmo.algo») y se abre desde el JS antiguo con window.Ventanas.abrir('inmo.algo', props, { clave: 'modal-N' }).
// Ver registro.tsx. Los componentes están en ventanas/inmo/.
import type { TVentanas } from './registro';
import { Propiedad } from './inmo/Propiedad';
import { Espera, Importada } from './inmo/Cartera';
import { Publicar, Existentes } from './inmo/PortalInmobiliario';
import { FichaCompleta } from './inmo/FichaCompleta';
import { Reprogramar, MenuPaso } from './inmo/Etapas';

export const ventanas: TVentanas = {
  'inmo.propiedad': Propiedad, // modal-26 · inmo.js, formProp
  'inmo.espera': Espera, // modal-27, modal-29, modal-31 · inmo.js (importar, revisar para el portal, buscar avisos)
  'inmo.importada': Importada, // modal-28 · inmo.js, importar
  'inmo.publicarPI': Publicar, // modal-30 · inmo.js, publicarModal
  'inmo.avisosExistentes': Existentes, // modal-32 · inmo.js, existentesModal
  'inmo.fichaCompleta': FichaCompleta, // modal-20 · ficha-bloques.js
  'inmo.reprogramar': Reprogramar, // modal-12 · etapas.js
  'inmo.menuPaso': MenuPaso, // modal-13 · etapas.js
};
