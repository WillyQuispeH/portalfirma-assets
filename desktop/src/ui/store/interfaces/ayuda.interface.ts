// Ayuda contextual (botón «?») y recorridos guiados. Los nombres en inglés de IGuia se mantienen
// porque son parte de la API pública window.Ayuda.GUIDES, que otros módulos pueden leer o ampliar.

// inmo: Gestión inmobiliaria · esencial: Lo esencial · ahorro: Para ahorrar tiempo · avanzado: Avanzado
export type TNivelAyuda = 'inmo' | 'esencial' | 'ahorro' | 'avanzado';

export interface IGuia {
  id: string;
  level: TNivelAyuda;
  screens: string[]; // vistas donde la guía aparece en «En esta pantalla»
  title: string;
  kw: string; // palabras clave para el buscador
  steps: string[];
}

// [selector, título, descripción]: un globo del recorrido
export type TPasoRecorrido = [string, string, string];

// un paso del recorrido en curso, con el elemento ya encontrado en pantalla
export interface IPasoVisible {
  el: Element;
  t: string;
  d: string;
}

export interface IRecorrido {
  pantalla: string;
  pasos: IPasoVisible[];
  i: number;
}
