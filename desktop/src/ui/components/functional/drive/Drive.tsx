// Ventanas de Google Drive (en el modal de la app): la cuenta conectada, conectar, el selector de Google,
// el explorador de carpetas y la descarga. La lógica de qué hacer con lo elegido está en controlador.tsx.
// Estilos con Tailwind (tw:). Los id (#mOk, #drvCambiar, data-do…) y las clases drv, drv-item, drv-nm, drv-scope y drv-crumbs
// los usan las pruebas; .drv además ensancha la ventana (styles/globals.css).
import { useEffect, useState, type ReactNode } from 'react';
import Icono from '../../ui/Icono';
import { useDrive } from '../../../store/hooks/useDrive.hook';
import { cerrarModal } from '../../../utils/modal';
import { toast } from '../../../utils/app';
import type { IDriveArchivo, TDriveAccion } from '../../../store/interfaces/drive.interface';
import { cx } from '../../../utils/cx';

const CARPETA = 'application/vnd.google-apps.folder';
const TIPO: Record<string, string> = { 'application/vnd.google-apps.document': 'Google Docs', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word', 'application/msword': 'Word', 'application/pdf': 'PDF', [CARPETA]: 'Carpeta' };
const fecha = (iso: string) => { try { return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return ''; } };
const iconoArchivo = (f: IDriveArchivo) => (f.mimeType === 'application/pdf' ? 'file' : 'textEdit');

const Titulo = ({ children, clase }: { children: ReactNode; clase?: string }) => <h2 className={clase}><Icono nombre="drive" tam={18} /> {children}</h2>;

const ARRIBA = 'tw:flex tw:justify-between tw:items-baseline tw:gap-2.5';
const LISTA = 'tw:max-h-[48vh] tw:min-h-[220px] tw:overflow-auto tw:my-2.5 tw:mx-0 tw:flex tw:flex-col tw:gap-1';
// Un archivo o carpeta (drv-item la usan las pruebas). El elegido va resaltado.
const item = (sel: boolean) => cx('drv-item tw:flex tw:items-center tw:gap-2.5 tw:py-2 tw:px-2.5 tw:border tw:rounded-[9px] tw:cursor-pointer',
  sel ? 'tw:bg-brand-soft tw:border-[color-mix(in_srgb,var(--brand)_40%,transparent)]' : 'tw:border-line tw:hover:bg-bg');
const ICONO = 'tw:text-brand tw:inline-flex';
const MARCA = 'tw:size-4 tw:m-0 tw:flex-none';
const NOMBRE = 'drv-nm tw:flex-1 tw:min-w-0 tw:flex tw:flex-col tw:[&_b]:text-[13px] tw:[&_b]:overflow-hidden tw:[&_b]:text-ellipsis tw:[&_b]:whitespace-nowrap tw:[&_small]:text-muted tw:[&_small]:text-[11.5px]';
const PIE = 'tw:flex tw:justify-between tw:items-center tw:gap-2.5 tw:flex-wrap tw:border-t tw:border-line tw:pt-3';
const pestana = (on: boolean) => cx('tw:w-auto tw:m-0 tw:py-1.5 tw:px-3 tw:border-0 tw:rounded-[8px] tw:text-[12.5px] tw:cursor-pointer',
  on ? 'on tw:bg-card tw:text-text tw:font-semibold tw:[box-shadow:0_1px_2px_rgba(0,0,0,.08)]' : 'tw:bg-transparent tw:text-muted');

export function Cuenta({ email, alDesconectar, alCambiar }: { email?: string; alDesconectar: () => void; alCambiar: () => void }) {
  return <>
    <Titulo>Cuenta de Google Drive</Titulo>
    <p>Asset está conectado con <b>{email || 'una cuenta de Google'}</b>. Con esta cuenta se eligen las fotos y los documentos de Drive.</p>
    <p className="muted small">Para usar el Drive de la empresa, conecta la cuenta que tiene acceso a la carpeta de captaciones. Al cambiar, Google te deja elegir la cuenta.</p>
    <div className="actions"><button className="ghost" id="drvDes" onClick={alDesconectar}>Desconectar</button><span className="spacer" /><button className="secondary" id="mCancel" onClick={cerrarModal}>Cerrar</button><button className="primary" id="drvCambiar" onClick={alCambiar}>Cambiar cuenta</button></div>
  </>;
}

export function CambiandoCuenta() {
  return <>
    <Titulo>Cambiar cuenta de Google</Titulo>
    <p><i className="bk-spin" /> Se abrió tu navegador: <b>elige la cuenta</b> de Google que quieres usar y autoriza a PortalFirma Asset.</p>
    <p className="muted small">Si no aparece la cuenta, usa «Usar otra cuenta» en la página de Google.</p>
    <div className="actions"><button className="secondary" id="mCancel" onClick={cerrarModal}>Cancelar</button></div>
  </>;
}

export function EsperandoSelector({ uno, email, alCancelar, alReabrir }: { uno: boolean; email: string; alCancelar: () => void; alReabrir: () => void }) {
  return <>
    <Titulo>Google Drive</Titulo>
    <p><i className="bk-spin" /> Se abrió Google Drive <b>en tu navegador</b>: elige ahí {uno ? 'el documento' : 'uno o varios documentos (o una carpeta)'} y vuelve a la app.</p>
    <p className="muted small">Se usa tu navegador porque ahí ya tienes iniciada tu sesión de Google. Si tienes varias cuentas, elige la misma que conectaste a la app{email ? ` (${email})` : ''}. PortalFirma Asset solo puede abrir los archivos que elijas; no ve el resto de tu Drive.</p>
    <div className="actions"><button className="secondary" id="gpCancel" onClick={alCancelar}>Cancelar</button><button className="primary" id="gpAgain" onClick={alReabrir}>Abrir de nuevo en el navegador</button></div>
  </>;
}

// Los botones de acción según para qué se abrió Drive y cuántos documentos hay elegidos
function Acciones({ n, para, explorador, alHacer }: { n: number; para: string; explorador: boolean; alHacer: (a: TDriveAccion) => void }) {
  return (
    <div className="tw:flex tw:gap-2 tw:flex-wrap tw:[&_button]:w-auto tw:[&_button]:m-0 tw:[&_button]:inline-flex tw:[&_button]:items-center tw:[&_button]:gap-1.5">
      <button className="secondary" id="mCancel" onClick={cerrarModal}>Cerrar</button>
      <button className="secondary" data-do="open" disabled={!n} onClick={() => alHacer('open')}>Abrir en el editor</button>
      {(explorador || n === 1) && <button className="secondary" data-do="template" disabled={n !== 1} title={explorador ? 'Solo un documento a la vez' : undefined} onClick={() => alHacer('template')}>Convertir en plantilla</button>}
      {para === 'plazos' && <button className={explorador ? 'secondary' : 'primary'} data-do="plazos" disabled={!n} onClick={() => alHacer('plazos')}><Icono nombre="calendar" tam={15} /> Agregar a Plazos</button>}
      {explorador && para === 'exp' && <button className="secondary" data-do="exp" disabled={!n} onClick={() => alHacer('exp')}><Icono nombre="folderOpen" tam={15} /> Agregar al expediente</button>}
      <button className={!explorador && para === 'plazos' ? 'secondary' : 'primary'} data-do="sign" disabled={!n} onClick={() => alHacer('sign')}><Icono nombre="sign" tam={15} /> Enviar a firmar{n > 1 ? ` (${n})` : ''}</button>
    </div>
  );
}

export function Elegidos({ alHacer, alElegirOtros, alDesconectar }: { alHacer: (a: TDriveAccion) => void; alElegirOtros: () => void; alDesconectar: () => void }) {
  const { elegidos, email, para } = useDrive();
  const lista = [...elegidos.values()]; const n = lista.length;
  return (
    <div className="drv">
      <div className={ARRIBA}><Titulo clase="tw:m-0">{n === 1 ? 'Documento elegido' : `${n} documentos elegidos`}</Titulo><span className="muted small">{email || 'Google Drive'} · <a href="#" id="drvOut" onClick={(e) => { e.preventDefault(); alDesconectar(); }}>Desconectar</a></span></div>
      <div className={LISTA}>{lista.map((f) => (
        <div key={f.id} className={item(true)}><span className={ICONO}><Icono nombre={iconoArchivo(f)} tam={17} /></span><span className={NOMBRE}><b>{f.name}</b><small>{TIPO[f.mimeType] || ''}</small></span></div>
      ))}</div>
      <div className={PIE}><button className="ghost small" id="drvAgain" onClick={alElegirOtros}><Icono nombre="drive" tam={14} /> Elegir otros</button>
        <Acciones n={n} para={para} explorador={false} alHacer={alHacer} /></div>
    </div>
  );
}

export function NoDisponible({ alSoporte, alActivar }: { alSoporte: () => void; alActivar: () => void }) {
  return <>
    <Titulo>Google Drive</Titulo>
    <p>La conexión con Google Drive todavía no está disponible en esta versión de PortalFirma Asset. Estará lista en la próxima actualización.</p>
    <p className="muted small">Mientras tanto, descarga el archivo desde Drive y arrástralo a la app.</p>
    <div className="actions"><a href="#" id="drvAdmin" className="muted small" style={{ marginRight: 'auto' }} onClick={(e) => { e.preventDefault(); alActivar(); }}>Soy administrador</a>
      <button className="secondary" id="mCancel" onClick={cerrarModal}>Cerrar</button>
      <button className="primary wa-btn with-ic" id="mOk" onClick={alSoporte}><Icono nombre="whatsapp" tam={15} /><span>Escribir a soporte</span></button></div>
  </>;
}

export function Conectar({ otraVez, alConectar }: { otraVez: boolean; alConectar: () => void }) {
  const [esperando, setEsperando] = useState(false);
  if (esperando) return <>
    <Titulo>Esperando la autorización…</Titulo><p>Termina de autorizar en el navegador y vuelve aquí.</p>
    <div className="actions"><button className="secondary" id="mCancel" onClick={cerrarModal}>Cancelar</button></div>
  </>;
  return <>
    <Titulo>{otraVez ? 'Vuelve a conectar Google Drive' : 'Conectar Google Drive'}</Titulo>
    {otraVez && <p className="muted small">Cambiamos la forma de conectar Google Drive para que sea más segura: ahora la app solo accede a los archivos que tú eliges.</p>}
    <p>Se abrirá tu navegador para que inicies sesión en Google y autorices a PortalFirma Asset. La app <strong>solo puede abrir los archivos que elijas</strong> en el selector de Google; no ve el resto de tu Drive y nunca modifica ni borra nada.</p>
    <div className="actions"><button className="secondary" id="mCancel" onClick={cerrarModal}>Cancelar</button><button className="primary" id="mOk" onClick={() => { setEsperando(true); alConectar(); }}>Conectar</button></div>
  </>;
}

export function Explorador({ alHacer, alDesconectar, alReconectar }: { alHacer: (a: TDriveAccion) => void; alDesconectar: () => void; alReconectar: () => void }) {
  const { para, email, ambito, ruta, consulta, archivos, siguiente, cargando, error, sinConexion, elegidos, driveCargar, driveAmbito, driveBuscar, driveEntrar, driveSubirA, driveMarcar, driveCarpetaCompleta } = useDrive();
  const [q, setQ] = useState(consulta);
  useEffect(() => { driveCargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- al abrir
  useEffect(() => { if (sinConexion) alReconectar(); }, [sinConexion]); // eslint-disable-line react-hooks/exhaustive-deps -- Google cerró la conexión
  const n = elegidos.size;
  const tocar = (f: IDriveArchivo) => (f.mimeType === CARPETA ? driveEntrar(f) : driveMarcar(f));
  const todaLaCarpeta = () => driveCarpetaCompleta().then((m) => toast(m)).catch((e) => toast((e as Error).message, 5000));
  return (
    <div className="drv">
      <div className={ARRIBA}><Titulo clase="tw:m-0">Google Drive</Titulo><span className="muted small">{email || 'Conectado'} · <a href="#" id="drvOut" onClick={(e) => { e.preventDefault(); alDesconectar(); }}>Desconectar</a></span></div>
      <div className="tw:flex tw:gap-2.5 tw:items-center tw:mt-3 tw:mx-0 tw:mb-2">
        <div className="drv-scope tw:flex tw:gap-0.5 tw:p-0.5 tw:rounded-[10px] tw:bg-bg tw:border tw:border-line tw:flex-none">
          <button data-sc="mine" className={pestana(ambito === 'mine' && !consulta)} onClick={() => { setQ(''); driveAmbito('mine'); }}>Mi unidad</button>
          <button data-sc="shared" className={pestana(ambito === 'shared' && !consulta)} onClick={() => { setQ(''); driveAmbito('shared'); }}>Compartidos conmigo</button>
        </div>
        <div className="ops-search tw:min-w-0"><Icono nombre="search" tam={14} /><input id="drvQ" placeholder="Buscar en todo tu Drive…" value={q} spellCheck={false} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') driveBuscar(q.trim()); }} /></div>
      </div>
      <div className="drv-crumbs tw:flex tw:items-center tw:gap-1 tw:text-[13px] tw:text-muted tw:min-h-[30px] tw:flex-wrap tw:[&_a]:text-brand tw:[&_a]:no-underline tw:[&_a]:font-semibold tw:[&_button]:mt-0 tw:[&_button]:mr-0 tw:[&_button]:mb-0 tw:[&_button]:ml-auto tw:[&_button]:w-auto">
        {consulta ? `Resultados para «${consulta}»` : ambito === 'shared' ? 'Compartidos conmigo'
          : ruta.map((p, i) => <span key={p.id + i}>{i > 0 && <> <Icono nombre="chevR" tam={12} /> </>}<a href="#" data-crumb={i} onClick={(e) => { e.preventDefault(); driveSubirA(i); }}>{p.name}</a></span>)}
        {!consulta && ambito === 'mine' && <button className="ghost small" id="drvAll" title="Seleccionar todos los documentos de esta carpeta" onClick={todaLaCarpeta}>Seleccionar toda la carpeta</button>}
      </div>
      <div className={LISTA} id="drvList">
        {error ? <p className="hint bad">{error}</p>
          : !archivos.length ? <p className="hint">{cargando ? 'Cargando…' : consulta ? 'No hay documentos que coincidan.' : 'Esta carpeta no tiene documentos PDF, Word ni Google Docs.'}</p>
          : <>
            {archivos.map((f) => {
              const dir = f.mimeType === CARPETA; const sel = elegidos.has(f.id);
              return (
                <div key={f.id} className={item(sel)} data-id={f.id} data-dir={dir ? '' : undefined} onClick={() => tocar(f)}>
                  {dir ? <><span className={MARCA} /><span className="tw:text-[#d97706] tw:inline-flex"><Icono nombre="folder" tam={17} /></span></>
                    : <><input type="checkbox" className={MARCA} checked={sel} readOnly /><span className={ICONO}><Icono nombre={iconoArchivo(f)} tam={17} /></span></>}
                  <span className={NOMBRE}><b>{f.name}</b><small>{TIPO[f.mimeType] || ''}{f.modifiedTime ? ' · ' + fecha(f.modifiedTime) : ''}{f.owner ? ' · ' + f.owner : ''}</small></span>
                  {dir && <span className="muted"><Icono nombre="chevR" tam={15} /></span>}
                </div>
              );
            })}
            {siguiente && <button className="ghost small" id="drvMore" onClick={() => driveCargar(true)}>Ver más</button>}
          </>}
      </div>
      <div className={PIE}><span className="muted small" id="drvCount">{n ? `${n} documento(s) seleccionado(s)` : 'Marca uno o varios documentos'}</span>
        <Acciones n={n} para={para} explorador alHacer={alHacer} /></div>
    </div>
  );
}

export function Descargando({ hechos, total }: { hechos: number; total: number }) {
  return <>
    <Titulo>Descargando de Google Drive…</Titulo>
    <div className="bk-prog"><div className="bk-prog-in" id="dlProg" style={{ width: `${Math.round((hechos / total) * 100)}%` }} /></div>
    <p className="muted small" id="dlTxt">{hechos} de {total}</p>
  </>;
}
