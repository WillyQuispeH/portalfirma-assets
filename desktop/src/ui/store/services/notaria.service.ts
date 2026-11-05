// Llamadas al proceso principal de la Notaría virtual (catálogo de trámites de Portalfirma).
// Usan api(): devuelven los datos o lanzan un Error (y si la sesión venció, piden iniciar sesión).
import { api, apiCruda } from '../../utils/api';
import type { IFormulario, ITramite } from '../interfaces/notaria.interface';

export const notariaService = {
  // la búsqueda del conector es semántica: una categoría se busca por su nombre
  buscar: (q: string) => api<ITramite[] | { results?: ITramite[] }>('tplSearch', q),
  formulario: (id: string) => api<IFormulario>('tplForms', id),
  // genera el documento, cobra el trámite y envía los enlaces de firma (la respuesta tal cual, para mostrar el error)
  enviar: (id: string, valores: Record<string, string>, nombre: string) => apiCruda<object>('tplSend', id, valores, nombre),
};
