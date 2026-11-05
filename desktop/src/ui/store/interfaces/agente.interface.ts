// El Agente: la conversación (con sus tarjetas, herramientas y confirmaciones), los adjuntos y las conversaciones
// guardadas. Fuente de verdad: src/agente.js (eventos agent:event) y src/conversaciones.js. Si cambian, se actualizan aquí.

export type TEstadoHerramienta = 'corriendo' | 'ok' | 'error' | 'cancelado' | 'esperando';

// un elemento de la conversación (k = tipo)
export type IAgenteItem =
  | { k: 'user'; text: string; deCard?: number }
  | { k: 'bot' | 'nota' | 'error'; text: string }
  | { k: 'card'; id: number; node: HTMLElement } // tarjeta de un flujo guiado (nodo de src/renderer, con su estado)
  | { k: 'hecho'; text: string; propId?: string } // una tarjeta ya terminada, en una conversación reabierta
  | { k: 'sig'; opciones: string[]; datos?: Record<string, unknown> | null; usado?: boolean } // siguiente paso (acciones fijas)
  | { k: 'sug2'; lista: { label: string; accion?: { tipo?: string } & Record<string, unknown> }[]; usado?: boolean } // sugerencias del modelo
  | { k: 'pensando' }
  | { k: 'tool'; id: string; name: string; estado: TEstadoHerramienta; args?: { action?: string }; resumen?: string; url?: string | null }
  | { k: 'confirm'; id: string; titulo: string; detalle?: string[]; aviso?: string; secretos?: string[]; hecho?: 'si' | 'no' };

export interface IAdjunto { name: string; subido?: boolean }

export interface IConversacion {
  id: string;
  titulo?: string;
  resumen?: string;
  actualizado: string;
  fijada?: boolean;
}

// en qué se está trabajando (lo muestra el lienzo): { tipo: 'propiedad', id }, { tipo: 'operacion', op }…
export type TContexto = { tipo: string } & Record<string, unknown>;

export interface IRespuestaAgente {
  text?: string;
  herramientas?: string[];
  sugerencias?: { label: string; accion?: Record<string, unknown> }[];
}
