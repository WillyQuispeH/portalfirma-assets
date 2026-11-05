// Formulario de persona (FormPersona) abierto desde cualquier parte, también desde el código antiguo.
// Se instala al cargar el bundle (index.tsx): window.__formPersona lo usa window.Inmo.formPersona (inmo.js), que llaman
// Leads, Negocios y «Gestionar una propiedad». Al guardar: avisa, recarga la lista y sigue con `despues` o abre la ficha.
import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import FormPersona from './FormPersona';
import { personasEstado } from '../../../store/hooks/usePersonas.hook';
import { abrirPersona, toast } from '../../../utils/app';
import type { IPersona, TPersonaRol } from '../../../store/interfaces/persona.interface';

export interface IOpcionesFormPersona {
  rol?: TPersonaRol;
  pre?: Partial<IPersona>;
  despues?: (p: IPersona) => void;
}

let raiz: Root | null = null;
let caja: HTMLDivElement | null = null;

function cerrar() {
  const r = raiz; raiz = null; r?.unmount();
  caja?.remove(); caja = null;
}

export function abrirFormPersona(persona: Partial<IPersona> | null = null, opt: IOpcionesFormPersona = {}) {
  cerrar();
  // si se abre desde una ventana antigua (vincular, nuevo negocio…), la reemplaza como antes: esa ventana se cierra
  // y quien la abrió la vuelve a mostrar en `despues` (así no quedan dos ventanas ni dos botones #mOk)
  if (!document.getElementById('modal')?.classList.contains('hidden')) window.closeModal();
  caja = document.createElement('div'); document.body.appendChild(caja);
  raiz = createRoot(caja);
  const r = raiz;
  const onGuardar = async (datos: Partial<IPersona>) => {
    const { persona: p, error } = await personasEstado().personaGuardar(datos);
    if (error || !p) return error || 'No se pudo guardar.';
    cerrar();
    toast(persona?.id ? 'Datos guardados.' : 'Persona creada.');
    if (opt.despues) opt.despues(p); else abrirPersona(p.id);
    return null;
  };
  // sincrónico: quien lo abre (y las pruebas) encuentran los campos justo después
  const contenido = <StrictMode><FormPersona persona={persona} rol={opt.rol} pre={opt.pre} onGuardar={onGuardar} onCerrar={cerrar} /></StrictMode>;
  try { flushSync(() => r.render(contenido)); } catch { r.render(contenido); }
}

export function instalarFormPersona() {
  window.__formPersona = (c, opt) => abrirFormPersona((c as Partial<IPersona>) ?? null, (opt ?? {}) as IOpcionesFormPersona);
}
