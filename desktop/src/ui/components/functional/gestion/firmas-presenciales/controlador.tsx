// Lo que Firmas presenciales hace fuera de un componente: abrir la pantalla, recibir archivos (elegidos o soltados),
// pagar y descargar el Word. Se instala al cargar el bundle (index.tsx) como window.__escrituras, que usa
// src/renderer/escrituras.js para su API de siempre (window.Escrituras: open, dropFiles, _s…).
import { ConfirmarIA, Descartar, NoDisponibleAun, Pago } from './Modales';
import { escrituraArchivos, escrituraEstado } from '../../../../store/hooks/useEscritura.hook';
import { abrirModal } from '../../../../utils/modal';
import { esMiembro, esUsuarioAdmin, iniciarSesionPortalfirma, toast } from '../../../../utils/app';
import { bloquesEscritura, esPrivado, faltantes, hayDocumento, notariaDatos } from '../../../../utils/escrituras';
import { caratulaPdf, escrituraPdf } from '../../../../utils/escrituras-pdf';
import type { IArchivoNotarial, ICotizacion, TTramite } from '../../../../store/interfaces/escritura.interface';

// El panel de reglas es interno de Portalfirma: administradores (o modo de prueba)
export const esAdministrador = (mock: boolean) => esUsuarioAdmin() || mock;

export async function abrir(tramite?: TTramite) {
  const S = escrituraEstado();
  if (tramite) S.escrituraElegir(tramite);
  await S.escrituraPreparar();
  await escrituraEstado().escrituraListar();
}

export function nuevoTramite() {
  const S = escrituraEstado();
  if (!(S.tramite && hayDocumento(S))) return S.escrituraElegir(null);
  abrirModal(<Descartar />);
}

const confirmarIA = (archivos: IArchivoNotarial[]) => {
  const noWord = archivos.filter((f) => f.kind !== 'word'); if (!noWord.length) return Promise.resolve(true);
  return new Promise<boolean>((resolver) => abrirModal(<ConfirmarIA nombres={noWord.map((f) => f.name)} alResponder={resolver} />));
};

// Archivos leídos por el proceso principal: la minuta (escritura) o los documentos privados
async function tomar(archivos: IArchivoNotarial[]) {
  const S = escrituraEstado();
  if (esPrivado(S)) {
    if (!(await confirmarIA(archivos))) return;
    (await escrituraEstado().escrituraLeerPrivados(archivos)).forEach((e) => toast(e));
    return;
  }
  try { const err = S.escrituraMinuta(archivos[0]); if (err) toast(err, 5000); } catch (e) { toast('No se pudo leer: ' + ((e as Error).message || e)); }
}

export async function elegirArchivos() {
  const r = esPrivado(escrituraEstado()) ? await escrituraArchivos.elegirPrivados() : await escrituraArchivos.elegirMinuta();
  if (r.ok && r.data?.length) await tomar(r.data); else if (!r.ok) toast(r.error || '');
}

// Archivos soltados sobre la pantalla (app.js los manda aquí)
export async function soltar(rutas: string[]) {
  const S = escrituraEstado();
  if (!S.tramite || S.sel !== 'draft') { toast('Primero elige el tipo de trámite.'); return; }
  const r = esPrivado(S) ? await escrituraArchivos.leerPrivados(rutas) : await escrituraArchivos.leerMinutas(rutas);
  if (!r.ok) { toast(r.error || ''); return; }
  await tomar(esPrivado(S) ? r.data! : r.data!.slice(0, 1));
}

// «Pagar y enviar a la notaría» (o «Solicitar cotización»)
export function pagar(q: ICotizacion) {
  const falta = faltantes(escrituraEstado());
  if (falta.length) { toast('Falta: ' + falta[0]); document.getElementById('esFalta')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  if (q.cotizacion) { iniciarTramite(q); return; }
  if (!esMiembro()) { iniciarSesionPortalfirma(() => abrirFirmasPresenciales(), 'Inicia sesión con tu cuenta Portalfirma para pagar el trámite.'); return; }
  abrirModal(<Pago q={q} />);
}

export async function iniciarTramite(q: ICotizacion) {
  const privado = esPrivado(escrituraEstado());
  const r = await escrituraEstado().escrituraIniciar(q);
  if (r.ok) { toast(r.cotizacion ? 'Cotización solicitada' : 'Trámite pagado y enviado a la notaría'); return; }
  if (r.codigo === 'PENDIENTE_API') abrirModal(<NoDisponibleAun mensaje={r.error} privado={privado} />);
  else if (r.codigo === 'SALDO') toast('Tu saldo no alcanza. Recarga y vuelve a intentarlo.');
  else if (r.codigo === 'NEEDS_LOGIN') iniciarSesionPortalfirma(() => abrirFirmasPresenciales(), 'Tu sesión expiró. Inicia sesión para pagar.');
  else toast('No se pudo iniciar el trámite: ' + r.error, 5000);
}

export async function descargarWord() {
  const S = escrituraEstado();
  try {
    const nombre = `${(S.o?.titulo || 'Escritura').replace(/[\\/:*?"<>|]/g, '').slice(0, 70)}.docx`;
    const r = await escrituraArchivos.guardarWord('escritura', bloquesEscritura(S), notariaDatos(S), nombre);
    if (!r.ok) throw new Error(r.error); if (r.data) toast('Word guardado');
  } catch (e) { toast('No se pudo: ' + ((e as Error).message || e)); }
}

// Abre la pantalla como lo hace el menú (show + montar en src/renderer/escrituras.js)
const abrirFirmasPresenciales = () => window.Escrituras.open();

export function instalarEscrituras() {
  window.__escrituras = { abrir, soltar, estado: escrituraEstado, escrituraPdf, caratulaPdf };
}
