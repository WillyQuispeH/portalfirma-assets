// Llamadas puras al proceso principal. Sin manejo de errores: eso lo hace el store o el componente.
import { api } from '../../utils/api';
import type { ILeadCambios, ILeadConsulta, ILeadDetalle, ILeadLista, IResultadoEnvio } from '../interfaces/lead.interface';

export const leadService = {
  getAll: (consulta: ILeadConsulta) => api<ILeadLista>('leadsListar', consulta),
  obtener: (id: string) => api<ILeadDetalle>('leadsObtener', id),
  actualizar: (id: string, cambios: ILeadCambios) => api<ILeadDetalle>('leadsActualizar', id, cambios),
  asignar: (id: string, corredorId: string | null) => api<unknown>('leadsAsignar', id, corredorId),
  reanalizar: (id: string) => api<unknown>('leadsReanalizar', id),
  // plantillas de texto del usuario (comandos del chat): viven en el servidor, siguen con él a otro equipo
  plantillas: () => api<{ plantillas: { nombre: string; texto: string }[]; version: number }>('cmdCargar'),
  guardarPlantillas: (l: { nombre: string; texto: string }[], version: number) => api<{ plantillas: { nombre: string; texto: string }[]; version: number }>('cmdGuardar', l, version),
  // una propiedad de la cartera: foto, datos y enlace del aviso en el portal (POST /leads/:id/enviar-propiedad)
  enviarPropiedad: (id: string, propiedadId: string, operacion?: string) => api<ILeadDetalle & { envio?: IResultadoEnvio }>('leadsEnviarPropiedad', id, propiedadId, operacion),
  // le escribe al interesado por el número de la empresa (o Instagram / Facebook): mismas reglas que el puente del servidor
  enviar: (id: string, texto: string) => api<ILeadDetalle & { envio?: IResultadoEnvio }>('leadsResponder', id, texto),
};
