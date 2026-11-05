// La cuenta de PortalFirma Asset (login propio). Fuente de verdad: GET /v1/auth/yo de la API de Asset (src/asset.js).
export type RolAsset = 'ADMIN' | 'CORREDOR';

export interface IUsuarioAsset {
  id: string;
  email: string;
  nombre: string;
  rol: RolAsset;
  corredoraId: string;
  corredora: { id: string; nombre: string };
}

// cargando: revisando la sesión guardada · fuera: hay que ingresar · dentro: con sesión
export type EstadoAcceso = 'cargando' | 'fuera' | 'dentro';
