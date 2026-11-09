// Formularios en ventana del Agente: adjuntar el documento abierto, lo que puede hacer, la actividad, renombrar o
// borrar una conversación y la clave de IA. Las ventanas están en VentanasAntiguas.tsx (registradas en
// ventanas/agente.tsx); aquí va lo que hacen. Las demás pantallas los usan como window.AgenteModales.
/* eslint-disable @typescript-eslint/no-explicit-any -- datos del proceso principal sin tipos */
import { toast } from '../../../utils/app';
import { cerrarModal } from '../../../utils/modal';
import { adjuntarBytes, alCambiarConv, elegirArchivo } from './controlador';
import { nombreHerramienta as nombre } from './Mensaje';

const W = window as unknown as Record<string, any>;
const abrir = (ventana: string, props: object, clave: string) => W.Ventanas.abrir(ventana, props, { clave });

async function adjuntar() {
  const doc = W.editor?.docName?.();
  if (!doc) return elegirArchivo();
  abrir('agente.adjuntar', {
    doc,
    alArchivo: () => { cerrarModal(); elegirArchivo(); },
    alDocumento: async () => {
      cerrarModal(); let bytes; try { bytes = await W.editor.finalBytes(); } catch (e) { return toast('No se pudo preparar el documento: ' + ((e as Error).message || e), 4000); } if (!bytes) return;
      adjuntarBytes(/\.pdf$/i.test(doc) ? doc : doc.replace(/\.[^.]+$/, '') + '.pdf', bytes);
    },
  }, 'modal-4');
}
async function herramientas() {
  const r = await W.pf.agentTools(); if (!r.ok) return toast(r.code === 'NEEDS_LOGIN' ? 'Inicia sesión en Portalfirma.' : r.error);
  abrir('agente.herramientas', { herramientas: r.data.map((t: any) => ({ nombre: nombre(t.name), id: t.name, descripcion: (t.description || '').slice(0, 220) })) }, 'modal-5');
}
async function actividad() {
  const r = await W.pf.agentLog(); const l = r.ok ? r.data : [];
  abrir('agente.actividad', { acciones: l.map((x: any) => ({ ok: !!x.ok, titulo: x.resumen || nombre(x.tool), detalle: nombre(x.tool) + (x.action ? ' · ' + x.action : ''), fecha: new Date(x.t).toLocaleString('es-CL') })) }, 'modal-6');
}
function renombrar(c: { id: string; titulo?: string }) {
  abrir('agente.renombrar', {
    titulo: c.titulo || '',
    alGuardar: async (valor: string) => { const r = await W.pf.convRenombrar(c.id, valor); if (!r.ok) return r.error; cerrarModal(); alCambiarConv(c.id, { titulo: r.data.titulo }); },
  }, 'modal-7');
}
function borrar(c: { id: string; titulo?: string }) {
  abrir('agente.borrarConversacion', {
    titulo: c.titulo || 'Conversación',
    alConfirmar: async () => { await W.pf.convBorrar(c.id); cerrarModal(); alCambiarConv(c.id, { borrada: true }); toast('Conversación eliminada.'); },
  }, 'modal-8');
}
async function claveIA() {
  const r = await W.pf.aiStatus?.(); const st = r?.ok ? r.data : {};
  abrir('agente.claveIA', {
    servidor: !!st.servidor, propia: !!st.propia, incluida: !!st.managed, termina: st.keyEnd || '',
    alQuitar: async () => { const x = await W.pf.aiConfig({ key: '' }); if (!x.ok) return x.error; cerrarModal(); toast('Vuelve a usar la clave incluida.'); },
    alGuardar: async (k: string) => { const x = await W.pf.aiConfig({ key: k }); if (!x.ok) return x.error; cerrarModal(); toast('Clave de IA guardada de forma cifrada en este computador.'); },
  }, 'modal-9');
}

export function instalarAgenteModales() { W.AgenteModales = { adjuntar, herramientas, actividad, renombrar, borrar, claveIA }; }
