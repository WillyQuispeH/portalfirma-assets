// Ventanas en React para el código antiguo (src/renderer/*.js). En vez de armar HTML con modal(`…`), el JS antiguo abre
// una ventana hecha con el kit (VentanaCabecera, VentanaCuerpo, VentanaPie, Boton, Input…) por su nombre:
//
//   window.Ventanas.abrir('leads.eliminar', { nombre: 'Ana', alConfirmar: async () => { … } }, { clave: 'modal-37' });
//   window.Ventanas.cerrar();
//
// · Cada grupo registra las suyas en su archivo (inmo.tsx, leads.tsx, negocios.tsx, agente.tsx, gestion.tsx), con el
//   prefijo del grupo: { 'leads.eliminar': EliminarLead }. Los componentes viven junto a su pantalla
//   (components/functional/<pantalla>/Ventanas*.tsx) o en esta carpeta si la pantalla todavía es JS antiguo.
// · Las props llevan los datos y las funciones del JS antiguo (guardar, borrar…): la lógica no cambia de lugar.
// · Volver a llamar a abrir() con el mismo nombre y otras props actualiza la ventana abierta (p. ej. un avance).
// · La clave («modal-N») es la que la ventana ya tenía: no se cambia.
// Se dibujan en #modalCard (utils/modal.tsx), así que conservan #mOk, #mCancel y los id que usan las pruebas.
import type { ComponentType } from 'react';
import { abrirModal, cerrarModal } from '../../../utils/modal';
import { ventanas as inmo } from './inmo';
import { ventanas as leads } from './leads';
import { ventanas as negocios } from './negocios';
import { ventanas as agente } from './agente';
import { ventanas as gestion } from './gestion';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- cada ventana define sus props
export type TVentanas = Record<string, ComponentType<any>>;

const todas: TVentanas = { ...inmo, ...leads, ...negocios, ...agente, ...gestion };

export function abrirVentana(nombre: string, props: object = {}, opciones: { clave?: string; ancho?: boolean } = {}) {
  const V = todas[nombre];
  if (!V) throw new Error(`No existe la ventana «${nombre}» (components/functional/ventanas)`);
  abrirModal(<V {...props} />, opciones);
}

export function instalarVentanas() {
  window.Ventanas = { abrir: abrirVentana, cerrar: cerrarModal };
}

declare global {
  interface Window {
    /** ventanas React para el código antiguo (components/functional/ventanas/registro.tsx) */
    Ventanas: { abrir: typeof abrirVentana; cerrar: () => void };
  }
}
