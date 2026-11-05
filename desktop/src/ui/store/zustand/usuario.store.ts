// Usuarios de la corredora: la lista (completa para el administrador, el equipo para el corredor), crear, editar,
// asignar clave y los usuarios de wechatia para vincular.
import { create } from 'zustand';
import { usuarioService } from '../services/usuario.service';
import type { IUsuario, IUsuarioCambios, IUsuarioNuevo, IWechatiaUsuarios } from '../interfaces/usuario.interface';

interface IUsuarioState {
  lista: IUsuario[];
  cargando: boolean;
  error: string | null;
  wechatia: IWechatiaUsuarios | null;
  usuarioGetAll: (admin: boolean) => Promise<void>;
  // cada acción devuelve null si resultó; si no, el error
  usuarioCrear: (o: IUsuarioNuevo) => Promise<string | null>;
  usuarioEditar: (id: string, o: IUsuarioCambios) => Promise<string | null>;
  usuarioClave: (id: string, clave: string) => Promise<string | null>;
  usuarioWechatia: () => Promise<void>;
}

export const useUsuarioStore = create<IUsuarioState>((set, get) => {
  let admin = false;
  const accion = async (fn: () => Promise<unknown>, recargar = true) => {
    try { await fn(); if (recargar) await get().usuarioGetAll(admin); return null; } catch (e) { return (e as Error).message; }
  };
  return {
    lista: [], cargando: false, error: null, wechatia: null,
    usuarioGetAll: async (esAdmin) => {
      admin = esAdmin; set({ cargando: true });
      try { set({ lista: await (esAdmin ? usuarioService.listar() : usuarioService.equipo()), error: null }); }
      catch (e) { set({ error: (e as Error).message }); }
      finally { set({ cargando: false }); }
    },
    usuarioCrear: (o) => accion(() => usuarioService.crear(o)),
    usuarioEditar: (id, o) => accion(() => usuarioService.editar(id, o)),
    usuarioClave: (id, clave) => accion(() => usuarioService.clave(id, clave), false),
    usuarioWechatia: async () => {
      try {
        const w = await usuarioService.wechatia(); set({ wechatia: w });
        if (w.vinculados) await get().usuarioGetAll(admin);
      } catch (e) { set({ wechatia: { usuarios: [], error: (e as Error).message } }); }
    },
  };
});
