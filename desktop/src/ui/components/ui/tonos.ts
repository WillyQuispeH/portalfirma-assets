// Tonos del kit (colores pastel definidos en styles/globals.css). Las clases van completas,
// sin armarlas con plantillas, para que Tailwind las encuentre al compilar.
export type TTono = 'gris' | 'lavanda' | 'verde' | 'amarillo' | 'durazno' | 'azul' | 'rojo';

// relleno con borde y texto (botones de color, tarjetas de color)
export const RELLENO: Record<TTono, string> = {
  gris: 'tw:bg-gray tw:border-gray-edge tw:text-gray-ink',
  lavanda: 'tw:bg-lav tw:border-lav-edge tw:text-lav-ink',
  verde: 'tw:bg-green tw:border-green-edge tw:text-green-ink',
  amarillo: 'tw:bg-yellow tw:border-yellow-edge tw:text-yellow-ink',
  durazno: 'tw:bg-peach tw:border-peach-edge tw:text-peach-ink',
  azul: 'tw:bg-blue tw:border-blue-edge tw:text-blue-ink',
  rojo: 'tw:bg-red tw:border-red-edge tw:text-red-ink',
};

// fondo suave con su texto (badges)
export const SUAVE: Record<TTono, string> = {
  gris: 'tw:bg-gray-soft tw:text-gray-softink',
  lavanda: 'tw:bg-lav-soft tw:text-lav-softink',
  verde: 'tw:bg-green-soft tw:text-green-softink',
  amarillo: 'tw:bg-yellow-soft tw:text-yellow-softink',
  durazno: 'tw:bg-peach-soft tw:text-peach-softink',
  azul: 'tw:bg-blue-soft tw:text-blue-softink',
  rojo: 'tw:bg-red-soft tw:text-red-softink',
};

// solo el color del punto o del ícono
export const PUNTO: Record<TTono, string> = {
  gris: 'tw:bg-gray-softink', lavanda: 'tw:bg-lav-edge', verde: 'tw:bg-green-edge', amarillo: 'tw:bg-yellow-edge',
  durazno: 'tw:bg-peach-edge', azul: 'tw:bg-blue-edge', rojo: 'tw:bg-red-edge',
};
