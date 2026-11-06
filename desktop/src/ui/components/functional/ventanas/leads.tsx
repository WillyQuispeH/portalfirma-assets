// Ventanas en React que abre el código antiguo de este grupo (src/renderer). Cada una se registra aquí con su nombre
// («leads.algo») y se abre desde el JS antiguo con window.Ventanas.abrir('leads.algo', props, { clave: 'modal-N' }).
// Ver registro.tsx.
import type { TVentanas } from './registro';
import { ComoExportar, VerImagen, EliminarLead, Derivar, ImportarChat, ErrorImportar, Cuentas, ComoInstagram, ImportarInstagram } from '../leads/VentanasAntiguas';
import { AjustarPrecio, AgregarInteresado, ContactoAvisos, ElegirPropiedad } from '../publicaciones/VentanasAntiguas';

export const ventanas: TVentanas = {
  // src/renderer/leads.js
  'leads.comoExportar': ComoExportar, // modal-33
  'leads.verImagen': VerImagen, // modal-34
  'leads.eliminar': EliminarLead, // modal-35
  'leads.derivar': Derivar, // modal-36
  'leads.importar': ImportarChat, // modal-37
  'leads.errorImportar': ErrorImportar, // modal-38
  'leads.cuentas': Cuentas, // modal-39
  'leads.comoInstagram': ComoInstagram, // modal-40
  'leads.importarInstagram': ImportarInstagram, // modal-41
  // src/renderer/publicaciones.js
  'leads.pubAjustarPrecio': AjustarPrecio, // modal-55
  'leads.pubAgregarInteresado': AgregarInteresado, // modal-56
  'leads.pubContacto': ContactoAvisos, // modal-57
  'leads.pubElegirPropiedad': ElegirPropiedad, // modal-58
};
