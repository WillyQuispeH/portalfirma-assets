// Interfaz pública de los usuarios de la corredora para los componentes (no importan el store directo).
import { useShallow } from 'zustand/react/shallow';
import { useUsuarioStore } from '../zustand/usuario.store';

export function useUsuario() {
  return useUsuarioStore(useShallow((s) => ({
    lista: s.lista, cargando: s.cargando, error: s.error,
    usuarioGetAll: s.usuarioGetAll, usuarioCrear: s.usuarioCrear, usuarioEditar: s.usuarioEditar,
    usuarioClave: s.usuarioClave,
  })));
}
