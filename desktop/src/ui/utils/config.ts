// Configuración centralizada. Es el único archivo que lee variables de entorno.
// Vite reemplaza estos valores al compilar (yarn build:ui o yarn dev).
export const config = {
  desarrollo: process.env.NODE_ENV !== 'production',
};
