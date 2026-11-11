// Puente entre la interfaz actual (scripts sueltos en src/renderer) y React.
//
// Vite compila este archivo a src/renderer/react/react-ui.js, que queda en
// window.ReactUI. Desde cualquier módulo actual se monta una página así:
//
//   const vista = ReactUI.montar('Finanzas', document.getElementById('algo'), { ... });
//   vista.actualizar({ ... });   // cambia las props
//   vista.desmontar();           // o ReactUI.desmontar(el)
//
// Para que una página se pueda montar así, se registra en app/paginas.ts.
import { StrictMode, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { paginas } from './app/paginas';
import { instalarAgente } from './components/functional/agente/controlador';
import { instalarEnvio } from './components/functional/gestion/enviar-a-firmar/controlador';
import { instalarEscrituras } from './components/functional/gestion/firmas-presenciales/controlador';
import { instalarDrive } from './components/functional/drive/controlador';
import { instalarFicha } from './components/functional/ficha/controlador';
import { instalarAsistente } from './components/functional/asistente/controlador';
import { instalarEditor } from './components/functional/gestion/editor-pdf/controlador';
import { instalarPlantillas } from './components/functional/gestion/editor-pdf/plantillas';
import { instalarAsistenteLegal } from './components/functional/gestion/asistente-legal/controlador';
import { instalarNotaria } from './components/functional/gestion/notaria-virtual/controlador';
import { instalarCuenta } from './components/functional/cuenta/controlador';
import { instalarAcceso } from './components/functional/acceso/controlador';
import { instalarFormPersona } from './components/functional/personas/controlador';
import { instalarWhatsApp } from './components/functional/whatsapp/controlador';
import { instalarUsuarios } from './components/functional/usuarios/controlador';
import { instalarAyuda } from './components/functional/ayuda/controlador';
import { instalarAprende } from './components/functional/aprende/controlador';
import { instalarVentanas } from './components/functional/ventanas/registro';
import { liberarModal } from './utils/modal';
import './styles/globals.css';

type TProps = Record<string, unknown>;
const raices = new WeakMap<Element, Root>(); // elemento del DOM -> raíz de React

function render(raiz: Root, Pagina: ComponentType<TProps>, props: TProps) {
  raiz.render(<StrictMode><Pagina {...props} /></StrictMode>);
}

export function montar(nombre: string, el: Element | null, props: TProps = {}) {
  const Pagina = paginas[nombre];
  if (!Pagina) throw new Error(`ReactUI: no existe la página «${nombre}» (revisa src/ui/app/paginas.ts)`);
  if (!el) throw new Error(`ReactUI: falta el elemento donde montar «${nombre}»`);
  let raiz = raices.get(el);
  if (!raiz) { raiz = createRoot(el); raices.set(el, raiz); }
  render(raiz, Pagina, props);
  return {
    actualizar: (nuevas: TProps) => render(raiz, Pagina, { ...props, ...nuevas }),
    desmontar: () => desmontar(el),
  };
}

export function desmontar(el: Element) {
  const raiz = raices.get(el);
  if (raiz) { raiz.unmount(); raices.delete(el); }
}

export function disponibles() { return Object.keys(paginas); }

// app.js lo llama antes de escribir en #modalCard con modal(html), y al cerrarlo (utils/modal.tsx)
export { liberarModal };

// El Agente no es una página: es el chat que está en todas las pantallas (panel lateral o pestaña «Agente»).
// Se instala al cargar: window.Agente y los eventos del proceso principal.
instalarAgente();
// Lo que el código antiguo usa de las pantallas migradas: startAnalysis/showDone (app.js), window.Drive y window.Escrituras.
instalarEnvio();
instalarDrive();
instalarEscrituras();
// La pestaña de la ficha de la propiedad, que inmo.js elige con Inmo.fichaTab(k): window.__ficha
instalarFicha();
instalarAsistente();
// El editor PDF (window.editor), sus plantillas con campos (window.Plantillas), el Asistente legal sobre el
// documento (window.Asistente) y la Notaría virtual (window.openTemplates, window.Notaria)
instalarEditor();
instalarPlantillas();
instalarAsistenteLegal();
instalarNotaria();
// La cuenta de Portalfirma (window.Usuario, window.ApiDiag y el botón de arriba a la derecha) y el Agente por WhatsApp
instalarAcceso(); // primero: la pantalla de ingreso a Asset tapa todo hasta que hay sesión
instalarCuenta();
instalarFormPersona();
instalarWhatsApp();
instalarUsuarios();
// La Ayuda (botón «?», guías, recorridos guiados) y «Aprende a usarla»: window.Ayuda y window.Aprende
instalarAyuda();
instalarAprende();
instalarVentanas(); // window.Ventanas: las ventanas React que abre el código antiguo (src/renderer)
