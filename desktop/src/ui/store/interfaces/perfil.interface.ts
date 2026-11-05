// Quién usa la app: el usuario de la sesión de Asset y lo que puede hacer. Fuente de verdad: estado() en
// src/permisos.js (accEstado). corredores: los usuarios activos de la corredora (para elegir captador o corredor).
export interface ICorredorResumen {
  id: string;
  nombre: string;
}

export interface IPerfil {
  rol: 'admin' | 'corredor';
  usuarioId: string | null;
  corredorId: string | null; // el id del usuario si es corredor (sus leads y negocios); null si es administrador
  nombre: string;
  esAdmin: boolean;
  soloAdmin: string[];
  corredores: ICorredorResumen[];
}
