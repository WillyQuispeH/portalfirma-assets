// Usuarios de la corredora. Se instala al cargar el bundle (index.tsx) como window.Usuarios:
//  · abrir(): la pestaña «Usuarios» de Configuración, con el equipo (y su administración, si el usuario es ADMIN). La abren
//    el menú del usuario, la ficha de la propiedad y «Avisar al corredor» cuando le falta el teléfono.
import { abrirConfiguracion } from '../integraciones/controlador';

export function abrirUsuarios() { abrirConfiguracion('usuarios'); }

export function instalarUsuarios() {
  window.Usuarios = { abrir: abrirUsuarios };
}
