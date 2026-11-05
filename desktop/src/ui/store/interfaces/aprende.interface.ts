// «Aprende a usarla»: una lección por panel de la app.
export interface ILeccion {
  id: string;
  ic: string; // ícono de src/renderer/icons.js
  t: string; // título
  sub: string; // subtítulo
  para: string; // para qué sirve el panel
  pasos: string[];
  tips: string[];
  ir: () => Promise<boolean>; // abre el panel en vivo; false si no se pudo (p. ej. no hay propiedades)
  tour: string; // recorrido guiado de la Ayuda que se muestra al llegar
}
