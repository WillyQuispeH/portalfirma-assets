// Ventanas de Google Drive (en el modal de la app, con las partes del kit: VentanaCabecera, VentanaCuerpo y VentanaPie):
// la cuenta conectada, conectar, el selector de Google, el explorador de carpetas y la descarga. La lógica de qué hacer
// con lo elegido está en controlador.tsx.
// Estilos con Tailwind (tw:). Los id (#mOk, #drvCambiar, data-do…) y las clases drv, drv-item, drv-nm, drv-scope y drv-crumbs
// los usan las pruebas; .drv además ensancha la ventana (styles/globals.css).
import { useEffect, useState } from 'react';
import Icono from '../../ui/Icono';
import Boton from '../../ui/Boton';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../ui/Ventana';
import { useDrive } from '../../../store/hooks/useDrive.hook';
import { cerrarModal } from '../../../utils/modal';
import { toast } from '../../../utils/app';
import type { IDriveArchivo, TDriveAccion } from '../../../store/interfaces/drive.interface';
import { cx } from '../../../utils/cx';

const CARPETA = 'application/vnd.google-apps.folder';
const TIPO: Record<string, string> = { 'application/vnd.google-apps.document': 'Google Docs', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word', 'application/msword': 'Word', 'application/pdf': 'PDF', [CARPETA]: 'Carpeta' };
const fecha = (iso: string) => { try { return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return ''; } };
const iconoArchivo = (f: IDriveArchivo) => (f.mimeType === 'application/pdf' ? 'file' : 'textEdit');

const LISTA = 'tw:max-h-[48vh] tw:min-h-[220px] tw:overflow-auto tw:my-2.5 tw:mx-0 tw:flex tw:flex-col tw:gap-1';
// Un archivo o carpeta (drv-item la usan las pruebas). El elegido va resaltado.
const item = (sel: boolean) => cx('drv-item tw:flex tw:items-center tw:gap-2.5 tw:py-2 tw:px-2.5 tw:border tw:rounded-[9px] tw:cursor-pointer',
  sel ? 'tw:bg-brand-soft tw:border-[color-mix(in_srgb,var(--brand)_40%,transparent)]' : 'tw:border-line tw:hover:bg-bg');
const ICONO = 'tw:text-brand tw:inline-flex';
const MARCA = 'tw:size-4 tw:m-0 tw:flex-none';
const NOMBRE = 'drv-nm tw:flex-1 tw:min-w-0 tw:flex tw:flex-col tw:[&_b]:text-[13px] tw:[&_b]:overflow-hidden tw:[&_b]:text-ellipsis tw:[&_b]:whitespace-nowrap tw:[&_small]:text-muted tw:[&_small]:text-[11.5px]';
const pestana = (on: boolean) => cx('tw:w-auto tw:m-0 tw:py-1.5 tw:px-3 tw:border-0 tw:rounded-[8px] tw:text-[12.5px] tw:cursor-pointer',
  on ? 'on tw:bg-card tw:text-text tw:font-semibold tw:[box-shadow:0_1px_2px_rgba(0,0,0,.08)]' : 'tw:bg-transparent tw:text-muted');
// textos del cuerpo: párrafo y nota en gris
const P = 'tw:mt-0 tw:mb-3 tw:leading-relaxed';
const NOTA = 'tw:m-0 tw:text-[12.5px] tw:text-muted tw:leading-relaxed';
const Espera = () => <i className="bk-spin" />;

/** la cuenta conectada y «Desconectar», en la descripción del encabezado */
function CuentaYSalir({ email, alDesconectar, vacio }: { email: string; alDesconectar: () => void; vacio: string }) {
  return <>{email || vacio} · <a href="#" id="drvOut" onClick={(e) => { e.preventDefault(); alDesconectar(); }}>Desconectar</a></>;
}

export function Cuenta({ email, alDesconectar, alCambiar }: { email?: string; alDesconectar: () => void; alCambiar: () => void }) {
  return <>
    <VentanaCabecera icono="drive" titulo="Cuenta de Google Drive" />
    <VentanaCuerpo>
      <p className={P}>Asset está conectado con <b>{email || 'una cuenta de Google'}</b>. Con esta cuenta se eligen las fotos y los documentos de Drive.</p>
      <p className={NOTA}>Para usar el Drive de la empresa, conecta la cuenta que tiene acceso a la carpeta de captaciones. Al cambiar, Google te deja elegir la cuenta.</p>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="drvDes" variante="fantasma" className="tw:mr-auto" onClick={alDesconectar}>Desconectar</Boton>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cerrar</Boton>
      <Boton id="drvCambiar" onClick={alCambiar}>Cambiar cuenta</Boton>
    </VentanaPie>
  </>;
}

export function CambiandoCuenta() {
  return <>
    <VentanaCabecera icono="drive" titulo="Cambiar cuenta de Google" />
    <VentanaCuerpo>
      <p className={P}><Espera /> Se abrió tu navegador: <b>elige la cuenta</b> de Google que quieres usar y autoriza a PortalFirma Asset.</p>
      <p className={NOTA}>Si no aparece la cuenta, usa «Usar otra cuenta» en la página de Google.</p>
    </VentanaCuerpo>
    <VentanaPie><Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cancelar</Boton></VentanaPie>
  </>;
}

export function EsperandoSelector({ uno, email, alCancelar, alReabrir }: { uno: boolean; email: string; alCancelar: () => void; alReabrir: () => void }) {
  return <>
    <VentanaCabecera icono="drive" titulo="Google Drive" onCerrar={alCancelar} />
    <VentanaCuerpo>
      <p className={P}><Espera /> Se abrió Google Drive <b>en tu navegador</b>: elige ahí {uno ? 'el documento' : 'uno o varios documentos (o una carpeta)'} y vuelve a la app.</p>
      <p className={NOTA}>Se usa tu navegador porque ahí ya tienes iniciada tu sesión de Google. Si tienes varias cuentas, elige la misma que conectaste a la app{email ? ` (${email})` : ''}. PortalFirma Asset solo puede abrir los archivos que elijas; no ve el resto de tu Drive.</p>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="gpCancel" variante="secundario" onClick={alCancelar}>Cancelar</Boton>
      <Boton id="gpAgain" onClick={alReabrir}>Abrir de nuevo en el navegador</Boton>
    </VentanaPie>
  </>;
}

// Los botones de acción según para qué se abrió Drive y cuántos documentos hay elegidos
function Acciones({ n, para, explorador, alHacer }: { n: number; para: string; explorador: boolean; alHacer: (a: TDriveAccion) => void }) {
  return <>
    <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cerrar</Boton>
    <Boton variante="secundario" data-do="open" disabled={!n} onClick={() => alHacer('open')}>Abrir en el editor</Boton>
    {(explorador || n === 1) && <Boton variante="secundario" data-do="template" disabled={n !== 1} title={explorador ? 'Solo un documento a la vez' : undefined} onClick={() => alHacer('template')}>Convertir en plantilla</Boton>}
    {para === 'plazos' && <Boton variante={explorador ? 'secundario' : 'principal'} icono="calendar" data-do="plazos" disabled={!n} onClick={() => alHacer('plazos')}>Agregar a Plazos</Boton>}
    {explorador && para === 'exp' && <Boton variante="secundario" icono="folderOpen" data-do="exp" disabled={!n} onClick={() => alHacer('exp')}>Agregar al expediente</Boton>}
    <Boton variante={!explorador && para === 'plazos' ? 'secundario' : 'principal'} icono="sign" data-do="sign" disabled={!n} onClick={() => alHacer('sign')}>Enviar a firmar{n > 1 ? ` (${n})` : ''}</Boton>
  </>;
}

export function Elegidos({ alHacer, alElegirOtros, alDesconectar }: { alHacer: (a: TDriveAccion) => void; alElegirOtros: () => void; alDesconectar: () => void }) {
  const { elegidos, email, para } = useDrive();
  const lista = [...elegidos.values()]; const n = lista.length;
  return <>
    <VentanaCabecera icono="drive" titulo={n === 1 ? 'Documento elegido' : `${n} documentos elegidos`}
      descripcion={<CuentaYSalir email={email} alDesconectar={alDesconectar} vacio="Google Drive" />} />
    <VentanaCuerpo className="drv">
      <div className={LISTA}>{lista.map((f) => (
        <div key={f.id} className={item(true)}><span className={ICONO}><Icono nombre={iconoArchivo(f)} tam={17} /></span><span className={NOMBRE}><b>{f.name}</b><small>{TIPO[f.mimeType] || ''}</small></span></div>
      ))}</div>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="drvAgain" variante="fantasma" tamano="sm" icono="drive" className="tw:mr-auto" onClick={alElegirOtros}>Elegir otros</Boton>
      <Acciones n={n} para={para} explorador={false} alHacer={alHacer} />
    </VentanaPie>
  </>;
}

export function NoDisponible({ alSoporte, alActivar }: { alSoporte: () => void; alActivar: () => void }) {
  return <>
    <VentanaCabecera icono="drive" titulo="Google Drive" />
    <VentanaCuerpo>
      <p className={P}>La conexión con Google Drive todavía no está disponible en esta versión de PortalFirma Asset. Estará lista en la próxima actualización.</p>
      <p className={NOTA}>Mientras tanto, descarga el archivo desde Drive y arrástralo a la app.</p>
    </VentanaCuerpo>
    <VentanaPie>
      <a href="#" id="drvAdmin" className="tw:mr-auto tw:text-[12.5px] tw:text-muted" onClick={(e) => { e.preventDefault(); alActivar(); }}>Soy administrador</a>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cerrar</Boton>
      <Boton id="mOk" icono="whatsapp" onClick={alSoporte}>Escribir a soporte</Boton>
    </VentanaPie>
  </>;
}

export function Conectar({ otraVez, alConectar }: { otraVez: boolean; alConectar: () => void }) {
  const [esperando, setEsperando] = useState(false);
  if (esperando) return <>
    <VentanaCabecera icono="drive" titulo="Esperando la autorización…" />
    <VentanaCuerpo><p className="tw:m-0"><Espera /> Termina de autorizar en el navegador y vuelve aquí.</p></VentanaCuerpo>
    <VentanaPie><Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cancelar</Boton></VentanaPie>
  </>;
  return <>
    <VentanaCabecera icono="drive" titulo={otraVez ? 'Vuelve a conectar Google Drive' : 'Conectar Google Drive'} />
    <VentanaCuerpo>
      {otraVez && <p className={cx(NOTA, 'tw:mb-3')}>Cambiamos la forma de conectar Google Drive para que sea más segura: ahora la app solo accede a los archivos que tú eliges.</p>}
      <p className="tw:m-0 tw:leading-relaxed">Se abrirá tu navegador para que inicies sesión en Google y autorices a PortalFirma Asset. La app <strong>solo puede abrir los archivos que elijas</strong> en el selector de Google; no ve el resto de tu Drive y nunca modifica ni borra nada.</p>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
      <Boton id="mOk" onClick={() => { setEsperando(true); alConectar(); }}>Conectar</Boton>
    </VentanaPie>
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
  return <>
    <VentanaCabecera icono="drive" titulo="Google Drive" descripcion={<CuentaYSalir email={email} alDesconectar={alDesconectar} vacio="Conectado" />} />
    <VentanaCuerpo className="drv">
      <div className="tw:flex tw:gap-2.5 tw:items-center tw:mb-2">
        <div className="drv-scope tw:flex tw:gap-0.5 tw:p-0.5 tw:rounded-[10px] tw:bg-bg tw:border tw:border-line tw:flex-none">
          <button data-sc="mine" className={pestana(ambito === 'mine' && !consulta)} onClick={() => { setQ(''); driveAmbito('mine'); }}>Mi unidad</button>
          <button data-sc="shared" className={pestana(ambito === 'shared' && !consulta)} onClick={() => { setQ(''); driveAmbito('shared'); }}>Compartidos conmigo</button>
        </div>
        <div className="ops-search tw:min-w-0"><Icono nombre="search" tam={14} /><input id="drvQ" placeholder="Buscar en todo tu Drive…" value={q} spellCheck={false} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') driveBuscar(q.trim()); }} /></div>
      </div>
      <div className="drv-crumbs tw:flex tw:items-center tw:gap-1 tw:text-[13px] tw:text-muted tw:min-h-[30px] tw:flex-wrap tw:[&_a]:text-brand tw:[&_a]:no-underline tw:[&_a]:font-semibold">
        {consulta ? `Resultados para «${consulta}»` : ambito === 'shared' ? 'Compartidos conmigo'
          : ruta.map((p, i) => <span key={p.id + i}>{i > 0 && <> <Icono nombre="chevR" tam={12} /> </>}<a href="#" data-crumb={i} onClick={(e) => { e.preventDefault(); driveSubirA(i); }}>{p.name}</a></span>)}
        {!consulta && ambito === 'mine' && <Boton id="drvAll" variante="fantasma" tamano="sm" className="tw:ml-auto" title="Seleccionar todos los documentos de esta carpeta" onClick={todaLaCarpeta}>Seleccionar toda la carpeta</Boton>}
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
            {siguiente && <Boton id="drvMore" variante="fantasma" tamano="sm" onClick={() => driveCargar(true)}>Ver más</Boton>}
          </>}
      </div>
    </VentanaCuerpo>
    <VentanaPie>
      <span className="tw:mr-auto tw:text-[12.5px] tw:text-muted" id="drvCount">{n ? `${n} documento(s) seleccionado(s)` : 'Marca uno o varios documentos'}</span>
      <Acciones n={n} para={para} explorador alHacer={alHacer} />
    </VentanaPie>
  </>;
}

export function Descargando({ hechos, total }: { hechos: number; total: number }) {
  return <>
    <VentanaCabecera icono="drive" titulo="Descargando de Google Drive…" cerrable={false} />
    <VentanaCuerpo>
      <div className="bk-prog"><div className="bk-prog-in" id="dlProg" style={{ width: `${Math.round((hechos / total) * 100)}%` }} /></div>
      <p className="tw:mt-2 tw:mb-0 tw:text-[12.5px] tw:text-muted" id="dlTxt">{hechos} de {total}</p>
    </VentanaCuerpo>
  </>;
}
