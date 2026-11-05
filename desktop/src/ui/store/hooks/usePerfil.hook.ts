// Interfaz pública del perfil para los componentes.
import { useShallow } from 'zustand/react/shallow';
import { usePerfilStore } from '../zustand/perfil.store';

export function usePerfil() {
  return usePerfilStore(useShallow((s) => ({
    perfil: s.perfil,
    // sin perfil todavía (o si falla accEstado) se asume administrador, como el resto de la app
    esAdmin: s.perfil ? s.perfil.esAdmin : true,
    perfilGet: s.perfilGet,
  })));
}
