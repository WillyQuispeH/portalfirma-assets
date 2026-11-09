// Ventanas del Agente (las abre modales.ts y el dictado con window.Ventanas.abrir):
// adjuntar el documento abierto, las herramientas, la actividad, renombrar o borrar una conversación, la clave de IA
// y, del dictado, conectar Google Drive o elegir las fotos. Están registradas en ventanas/agente.tsx.
// La lógica (llamadas a pf, toasts, qué se refresca) llega en las props desde modales.ts y dictado/controlador.tsx.
// Los id (#agDoc, #agFile, #agNo, #agOk, #cvN, #cvE, #iaK, #iaErr, #iaQuitar, #fdCambiar, #mOk, #mCancel) y la clase
// ag-tl (con un div por fila) los usan las pruebas.
import { useEffect, useState } from 'react';
import Boton from '../../ui/Boton';
import Input from '../../ui/Input';
import Badge from '../../ui/Badge';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../ui/Ventana';
import { P, NOTA, FORM } from '../gestion/editor-pdf/Modales';
import { cerrarModal } from '../../../utils/modal';
import { cx } from '../../../utils/cx';

// lista de herramientas o de actividad: .ag-tl con un div por fila (las pruebas cuentan «.ag-tl > div»)
const LISTA = 'ag-tl tw:flex tw:flex-col tw:gap-1.5 tw:m-0 tw:min-w-0';
const FILA = 'tw:flex tw:flex-col tw:gap-0.5 tw:min-w-0 tw:py-2 tw:px-2.5 tw:rounded-[10px] tw:bg-bg';
const CODIGO = 'tw:text-[11px] tw:text-brand tw:break-all';
const CHICO = 'tw:text-[11.5px] tw:text-muted tw:leading-snug tw:break-words';

// ---------- modal-4: adjuntar al agente ----------
export function Adjuntar({ doc, alDocumento, alArchivo }: { doc: string; alDocumento: () => void; alArchivo: () => void }) {
  return <>
    <VentanaCabecera icono="filePlus" titulo="Adjuntar al agente" descripcion="Elige qué documento le pasas al agente." />
    <VentanaCuerpo className="tw:flex tw:flex-col tw:gap-2">
      <Boton id="agDoc" variante="secundario" icono="file" bloque className="tw:justify-start tw:h-auto tw:min-h-10 tw:py-2.5 tw:whitespace-normal tw:text-left" onClick={alDocumento}>
        <span>Documento abierto: «{doc}»</span>
      </Boton>
      <Boton id="agFile" variante="secundario" icono="folderOpen" bloque className="tw:justify-start" onClick={alArchivo}>Elegir PDF o Word…</Boton>
    </VentanaCuerpo>
    <VentanaPie><Boton id="agNo" variante="secundario" onClick={cerrarModal}>Cancelar</Boton></VentanaPie>
  </>;
}

// ---------- modal-5: herramientas del agente ----------
export interface IHerramienta { nombre: string; id: string; descripcion: string }
export function Herramientas({ herramientas }: { herramientas: IHerramienta[] }) {
  return <>
    <VentanaCabecera icono="sparkle" titulo="Herramientas del Agente"
      descripcion={`El agente usa ${herramientas.length} herramientas: las de PortalFirma Asset y las que publica hoy el servidor de Portalfirma. Si Portalfirma agrega nuevas, aparecen solas.`} />
    <VentanaCuerpo>
      <div className={LISTA}>{herramientas.map((t) => (
        <div key={t.id} className={FILA}><b className="tw:text-[13.5px]">{t.nombre}</b><code className={CODIGO}>{t.id}</code><small className={CHICO}>{t.descripcion}</small></div>
      ))}</div>
    </VentanaCuerpo>
    <VentanaPie><Boton id="agOk" onClick={cerrarModal}>Cerrar</Boton></VentanaPie>
  </>;
}

// ---------- modal-6: actividad del agente ----------
export interface IActividad { ok: boolean; titulo: string; detalle: string; fecha: string }
export function Actividad({ acciones }: { acciones: IActividad[] }) {
  return <>
    <VentanaCabecera icono="listCheck" titulo="Actividad del agente" descripcion="Acciones realizadas en este computador (sin claves ni documentos)." />
    <VentanaCuerpo>
      <div className={LISTA}>{acciones.length ? acciones.map((x, i) => (
        <div key={i} className={cx(FILA, !x.ok && 'bad')}>
          <span className="tw:flex tw:items-center tw:gap-2">
            <b className={cx('tw:text-[13.5px] tw:min-w-0 tw:flex-1', !x.ok && 'tw:text-err')}>{x.titulo}</b>
            {!x.ok && <Badge tono="rojo">No resultó</Badge>}
          </span>
          <code className={CODIGO}>{x.detalle}</code><small className={CHICO}>{x.fecha}</small>
        </div>
      )) : <p className={NOTA}>Todavía no hay actividad.</p>}</div>
    </VentanaCuerpo>
    <VentanaPie><Boton id="agOk" onClick={cerrarModal}>Cerrar</Boton></VentanaPie>
  </>;
}

// ---------- modal-7: cambiar el nombre de una conversación ----------
/** alGuardar devuelve el error a mostrar, o nada si salió bien */
export function Renombrar({ titulo, alGuardar }: { titulo: string; alGuardar: (nombre: string) => Promise<string | void> }) {
  const [nombre, setNombre] = useState(titulo); const [error, setError] = useState('');
  useEffect(() => { const t = setTimeout(() => document.querySelector<HTMLInputElement>('#modalCard #cvN')?.select(), 30); return () => clearTimeout(t); }, []);
  const guardar = async () => { const e = await alGuardar(nombre); if (e) setError(e); };
  return <>
    <VentanaCabecera icono="edit" titulo="Cambiar nombre" />
    <VentanaCuerpo>
      <Input id="cvN" value={nombre} maxLength={80} aria-label="Nombre de la conversación"
        onChange={(e) => setNombre(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') guardar(); }} />
      <p id="cvE" className="tw:mt-2 tw:mb-0 tw:text-xs tw:text-err tw:empty:hidden">{error}</p>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
      <Boton id="mOk" onClick={guardar}>Guardar</Boton>
    </VentanaPie>
  </>;
}

// ---------- modal-8: eliminar una conversación ----------
export function BorrarConversacion({ titulo, alConfirmar }: { titulo: string; alConfirmar: () => void }) {
  return <>
    <VentanaCabecera icono="trash" tonoIcono="rojo" titulo="¿Eliminar la conversación?" />
    <VentanaCuerpo><p className={P}>«{titulo}» se borra de este computador. Lo que se hizo en ella (propiedades, negocios, agenda, firmas) no cambia.</p></VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
      <Boton id="mOk" variante="peligro" onClick={alConfirmar}>Eliminar</Boton>
    </VentanaPie>
  </>;
}

// ---------- modal-9: clave de IA ----------
/** alGuardar y alQuitar devuelven el error a mostrar, o nada si salió bien */
export function ClaveIA({ servidor, propia, incluida, termina, alGuardar, alQuitar }: { servidor?: boolean; propia?: boolean; incluida?: boolean; termina?: string; alGuardar: (clave: string) => Promise<string | void>; alQuitar: () => Promise<string | void> }) {
  const [clave, setClave] = useState(''); const [error, setError] = useState('');
  // con la cuenta de Asset, la IA la pone Portalfirma desde el servidor: no hay clave que poner en este computador
  if (servidor) return <>
    <VentanaCabecera icono="sparkle" titulo="IA de Asset" />
    <VentanaCuerpo>
      <p className={P}>El Agente, la atención de clientes (Sofía y Tomás) y la lectura de documentos usan la IA de Portalfirma (Claude), a través del servidor de Asset.</p>
      <p className={NOTA}>No necesitas una clave propia: tu cuenta ya la tiene incluida y nada queda guardado en este computador.</p>
    </VentanaCuerpo>
    <VentanaPie><Boton id="mOk" onClick={cerrarModal}>Entendido</Boton></VentanaPie>
  </>;
  const ahora = propia ? `Ahora usa una clave propia (termina en …${termina}).` : incluida ? 'Ahora usa la clave incluida con la app.' : termina ? `Clave guardada: termina en …${termina}.` : 'No hay clave.';
  const guardar = async () => { const k = clave.trim(); if (!k) { setError('Pega la clave.'); return; } const e = await alGuardar(k); setClave(''); if (e) setError(e); };
  const quitar = async () => { const e = await alQuitar(); if (e) setError(e); };
  return <>
    <VentanaCabecera icono="lock" titulo="Clave de IA" />
    <VentanaCuerpo className={FORM}>
      <div>
        <p className={P}>Asset usa OpenAI para el Agente, la atención de clientes (Sofía y Tomás) y la lectura de documentos. {ahora}</p>
        <p className={NOTA}>Si OpenAI rechaza la clave, crea una nueva en platform.openai.com › API keys (con límite de gasto) y pégala aquí. Queda cifrada en este computador y reemplaza a la incluida.</p>
      </div>
      <Input etiqueta="Nueva clave" id="iaK" type="password" autoComplete="off" spellCheck={false} placeholder="sk-…" value={clave} onChange={(e) => setClave(e.target.value)} />
      <p id="iaErr" className="tw:m-0 tw:text-xs tw:text-err tw:empty:hidden">{error}</p>
    </VentanaCuerpo>
    <VentanaPie>
      {propia && <Boton id="iaQuitar" variante="fantasma" className="tw:mr-auto" onClick={quitar}>Volver a la clave incluida</Boton>}
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
      <Boton id="mOk" onClick={guardar}>Guardar</Boton>
    </VentanaPie>
  </>;
}

// ---------- modal-10 (dictado): conectar Google Drive para las fotos ----------
export function ConectarDriveFotos({ alResponder }: { alResponder: (conectar: boolean) => void }) {
  return <>
    <VentanaCabecera icono="drive" titulo="Conectar Google Drive" />
    <VentanaCuerpo>
      <p className={P}>Para cargar las fotos, conecta la cuenta de Google que tiene acceso a la carpeta de <b>captaciones</b> de la empresa. Se abrirá tu navegador para autorizar.</p>
      <p className={NOTA}>Asset solo puede abrir los archivos que tú elijas en el selector de Google; no ve el resto del Drive.</p>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={() => alResponder(false)}>Cancelar</Boton>
      <Boton id="mOk" onClick={() => alResponder(true)}>Conectar</Boton>
    </VentanaPie>
  </>;
}

// ---------- modal-11 (dictado): con qué cuenta se eligen las fotos ----------
export function FotosDrive({ email, alResponder }: { email?: string; alResponder: (r: 'si' | 'no' | 'cambiar') => void }) {
  return <>
    <VentanaCabecera icono="drive" titulo="Fotos desde Google Drive" />
    <VentanaCuerpo>
      <p className={P}>Vas a elegir las fotos con la cuenta <b>{email || 'conectada'}</b>.</p>
      <p className={NOTA}>¿La carpeta de captaciones está en otra cuenta de Google? Cámbiala aquí.</p>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="fdCambiar" variante="fantasma" className="tw:mr-auto" onClick={() => alResponder('cambiar')}>Cambiar cuenta</Boton>
      <Boton id="mCancel" variante="secundario" onClick={() => alResponder('no')}>Cancelar</Boton>
      <Boton id="mOk" onClick={() => alResponder('si')}>Elegir fotos</Boton>
    </VentanaPie>
  </>;
}
