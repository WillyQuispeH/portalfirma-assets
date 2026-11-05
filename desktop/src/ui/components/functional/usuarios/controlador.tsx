// Usuarios de la corredora. Se instala al cargar el bundle (index.tsx) como window.Usuarios:
//  · abrir(): la ventana con el equipo (y su administración, si el usuario es ADMIN). La abren el menú del usuario,
//    Leads › «Usuarios» y «Avisar al corredor» cuando le falta el teléfono.
import Usuarios from './Usuarios';
import { abrirModal } from '../../../utils/modal';

export function abrirUsuarios() { abrirModal(<Usuarios />, { ancho: true }); }

export function instalarUsuarios() {
  window.Usuarios = { abrir: abrirUsuarios };
}
