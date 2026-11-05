// Documentos abiertos o guardados en este computador. Fuente de verdad: recent:list en src/main.js.
export interface IReciente {
  name: string;
  path: string;
  size?: number;
  date?: string;
  exists: boolean; // el archivo sigue en esa ubicación
}
