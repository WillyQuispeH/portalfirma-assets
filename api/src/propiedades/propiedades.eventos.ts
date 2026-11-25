// Avisos internos de la cartera (sin depender de quién escucha): la publicación automática se entera de que una propiedad
// se creó o cambió, o de que se importó la cartera, sin que PropiedadesService la conozca (evita dependencias en círculo).
import { EventEmitter } from 'node:events';

export type EventoCartera =
  | { tipo: 'propiedad'; corredoraId: string; propiedadId: string }
  | { tipo: 'cartera'; corredoraId: string; origen: string }
  /** la corredora conectó (o se vio conectada) su cuenta de portales: revisar qué ya está publicado */
  | { tipo: 'portales'; corredoraId: string; forzar: boolean };

export const eventosCartera = new EventEmitter();
eventosCartera.setMaxListeners(20);

/** nunca lanza: quien escucha hace su trabajo aparte */
export const avisarCartera = (e: EventoCartera) => {
  try {
    eventosCartera.emit('cartera', e);
  } catch {
    /* nada */
  }
};
