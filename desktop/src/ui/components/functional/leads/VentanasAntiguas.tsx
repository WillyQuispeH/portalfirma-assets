// Ventanas de Leads que abre el código antiguo (src/renderer/leads.js) con window.Ventanas.abrir('leads.…').
// Hechas con el kit (VentanaCabecera, VentanaCuerpo, VentanaPie, Boton, Input, Select…). La lógica (llamadas a la API,
// toasts, qué se recarga) sigue en leads.js: llega en las funciones de las props.
// Los id (#mOk, #mCancel, #ldTel, #ldTx, #ldIgDueno, #ldIgCuenta, #ldIgIA, #ldIgAut, #ldIgN, #ldErr2, #ldCtaIg, #ldObs…),
// los data-hilo, el name="ldCli" y las clases .ld-imp, .ld-igimp, .ld-cuentas, .ld-ol, .ld-cons, .ld-obs y .ld-pre
// los usan las pruebas (leads, instagram, observador y gestor-leads).
import { useEffect, useState, type ReactNode } from 'react';
import Boton from '../../ui/Boton';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import Icono from '../../ui/Icono';
import Avatar from '../../ui/Avatar';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../ui/Ventana';
import { Opcion, P, NOTA, FORM, DOS } from '../gestion/editor-pdf/Modales';
import { cerrarModal } from '../../../utils/modal';
import { cx } from '../../../utils/cx';
import { toast } from '../../../utils/app';

// mensaje de error bajo el formulario (vacío no ocupa lugar)
export const ERROR = 'tw:m-0 tw:text-[13px] tw:text-red-ink tw:empty:hidden';
// recuadro gris (pasos, avisos, cuentas)
const CAJITA = 'tw:rounded-xl tw:border tw:border-solid tw:border-line tw:bg-bg tw:px-3 tw:py-2.5';
const Cerrar = ({ texto = 'Cerrar', principal = false }: { texto?: string; principal?: boolean }) =>
  <Boton id="mCancel" variante={principal ? 'principal' : 'secundario'} onClick={cerrarModal}>{texto}</Boton>;
const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---------- modal-33 · cómo exportar un chat de WhatsApp ----------
export function ComoExportar() {
  return <>
    <VentanaCabecera icono="whatsapp" tonoIcono="verde" titulo="Cómo exportar un chat de WhatsApp" />
    <VentanaCuerpo>
      <div className="ld-pasos tw:grid tw:gap-2 tw:mt-0 tw:mb-3">
        <div className={cx(CAJITA, 'tw:text-[13px] tw:leading-relaxed')}><b className="tw:block">iPhone</b>Abre el chat › toca el nombre del contacto arriba › baja hasta <i>Exportar chat</i> › elige <i>Incluir archivos</i> (fotos y audios) o <i>Sin archivos</i> (más liviano).</div>
        <div className={cx(CAJITA, 'tw:text-[13px] tw:leading-relaxed')}><b className="tw:block">Android</b>Abre el chat › ⋮ (arriba a la derecha) › <i>Más</i> › <i>Exportar chat</i> › <i>Incluir archivos</i> o <i>Sin archivos</i>.</div>
      </div>
      <p className={P}><b>Luego, una de dos:</b></p>
      <ul className="tw:mt-0 tw:mb-3 tw:pl-5 tw:text-[13.5px] tw:leading-relaxed">
        <li>Envíalo por WhatsApp al número de la empresa (tu Agente lo registra y te confirma), o</li>
        <li>guárdalo en el computador y arrástralo a esta ventana.</li>
      </ul>
      <p className={NOTA}>Si exportas el mismo chat otra vez más adelante, Asset agrega solo los mensajes nuevos.</p>
    </VentanaCuerpo>
    <VentanaPie><Cerrar texto="Entendido" principal /></VentanaPie>
  </>;
}

// ---------- modal-34 · una foto de la conversación, en grande ----------
export function VerImagen({ src }: { src: string }) {
  return <>
    <VentanaCabecera icono="image" titulo="Foto" />
    <VentanaCuerpo><img src={src} className="ld-big" alt="" /></VentanaCuerpo>
    <VentanaPie><Cerrar /></VentanaPie>
  </>;
}

// ---------- modal-35 · eliminar un lead ----------
export function EliminarLead({ nombre, mensajes, alEliminar }: { nombre: string; mensajes: number; alEliminar: () => Promise<void> }) {
  const [ocupado, setOcupado] = useState(false);
  const eliminar = async () => { setOcupado(true); try { await alEliminar(); } finally { setOcupado(false); } };
  return <>
    <VentanaCabecera icono="trash" tonoIcono="rojo" titulo="¿Eliminar este lead?" />
    <VentanaCuerpo>
      <p className={P}>Se borra la conversación guardada de <b>{nombre}</b> ({mensajes} mensajes) y sus fotos y audios. No se puede deshacer.</p>
    </VentanaCuerpo>
    <VentanaPie><Cerrar texto="Cancelar" /><Boton id="mOk" variante="peligro" cargando={ocupado} onClick={eliminar}>Eliminar</Boton></VentanaPie>
  </>;
}

// ---------- modal-36 · avisar al corredor por WhatsApp ----------
interface IDerivarProps {
  corredor: { nombre: string; celular?: string | null };
  texto: string;
  /** envía el aviso (leadsDerivar); si sale, cierra. Devuelve la respuesta para ofrecer el enlace si no salió */
  alEnviar: () => Promise<{ ok: boolean; motivo?: string; enlace?: string }>;
  alAbrirEnlace: (url: string) => void;
  alUsuarios: () => void;
}
export function Derivar({ corredor, texto, alEnviar, alAbrirEnlace, alUsuarios }: IDerivarProps) {
  const [ocupado, setOcupado] = useState(false); const [error, setError] = useState(''); const [enlace, setEnlace] = useState('');
  const enviar = async () => {
    if (enlace) { alAbrirEnlace(enlace); cerrarModal(); return; }
    setOcupado(true);
    try { const r = await alEnviar(); if (!r.ok) { setError('No salió desde el número de la empresa: ' + r.motivo); setEnlace(r.enlace || ''); } }
    catch (e) { setError(mensajeDe(e)); }
    finally { setOcupado(false); }
  };
  return <>
    <VentanaCabecera icono="whatsapp" tonoIcono="verde" titulo={`Avisar a ${corredor.nombre}`} />
    <VentanaCuerpo className={FORM}>
      {corredor.celular ? <>
        <p className="tw:m-0 tw:leading-relaxed">Se le envía este WhatsApp a <b>{corredor.celular}</b> desde el número de la empresa:</p>
        <pre className="ld-pre tw:m-0">{texto}</pre>
        <p className={NOTA}>Si {corredor.nombre.split(' ')[0]} no le ha escrito al número de la empresa en las últimas 24 horas, WhatsApp no deja enviarlo: en ese caso te dejo el enlace para mandárselo desde tu WhatsApp.</p>
      </> : <p className={cx(ERROR, 'tw:text-sm')}>Falta el teléfono de {corredor.nombre}. Agrégalo en Usuarios.</p>}
      <p className={ERROR} id="ldDvErr">{error}</p>
    </VentanaCuerpo>
    <VentanaPie>
      <Cerrar texto="Cancelar" />
      {corredor.celular
        ? <Boton id="mOk" icono={enlace ? 'whatsapp' : undefined} cargando={ocupado} onClick={enviar}>{ocupado ? 'Enviando…' : enlace ? 'Abrir mi WhatsApp' : 'Enviar aviso'}</Boton>
        : <Boton id="ldDvCor" onClick={alUsuarios}>Usuarios</Boton>}
    </VentanaPie>
  </>;
}

// ---------- modal-37 · importar un chat de WhatsApp exportado ----------
interface IImportarProps {
  total: number;
  rango: string; // «del 01/02/2026 al 15/03/2026»
  medios: string; // «3 fotos, 1 audio»
  existente?: { nombre?: string; nuevos: number } | null;
  cliente: string; // el que se deduce
  participantes: { nombre: string; n: number }[];
  telefono?: string;
  audios: number; // cuántos audios se pueden transcribir (0: no se ofrece)
  sinArchivos: boolean; // se exportó sin archivos y había fotos o audios
  alImportar: (v: { cliente: string; telefono: string; transcribir: boolean }) => Promise<void>;
}
export function ImportarChat({ total, rango, medios, existente, cliente: cliente0, participantes, telefono: tel0 = '', audios, sinArchivos, alImportar }: IImportarProps) {
  const [cliente, setCliente] = useState(cliente0); const [tel, setTel] = useState(tel0); const [tx, setTx] = useState(true);
  const [ocupado, setOcupado] = useState(false); const [error, setError] = useState('');
  const importar = async () => {
    if (!participantes.some((p) => p.nombre === cliente)) { setError('Elige quién es el cliente.'); return; }
    setOcupado(true);
    try { await alImportar({ cliente, telefono: tel.trim(), transcribir: !!audios && tx }); }
    catch (e) { setOcupado(false); setError(mensajeDe(e)); }
  };
  return <>
    <VentanaCabecera icono="whatsapp" tonoIcono="verde" titulo="Importar conversación" />
    <VentanaCuerpo className={cx('ld-imp', FORM)}>
      <p className="tw:m-0 tw:leading-relaxed"><b>{total} mensajes</b> {rango}{medios ? ` · ${medios}` : ''}.</p>
      {existente && <p className="tw:m-0 tw:flex tw:items-start tw:gap-2 tw:rounded-xl tw:bg-green-soft tw:text-green-softink tw:px-3 tw:py-2 tw:text-[13px]">
        <Icono nombre="check" tam={14} /><span>Ya tienes este chat con <b>{existente.nombre || cliente0}</b>: se agregan solo los <b>{existente.nuevos}</b> mensajes nuevos.</span></p>}
      <div>
        <p className="tw:mt-0 tw:mb-2 tw:font-semibold tw:text-sm">¿Quién es el cliente?</p>
        <div className="tw:flex tw:flex-col tw:gap-1.5">{participantes.map((p) => (
          <Opcion key={p.nombre} type="radio" name="ldCli" value={p.nombre} checked={cliente === p.nombre} onChange={() => setCliente(p.nombre)}>
            {p.nombre} <small className="tw:text-muted">· {p.n} mensajes</small>
          </Opcion>))}
        </div>
      </div>
      <Input id="ldTel" type="tel" etiqueta="Teléfono del cliente" ayuda="Si lo tienes guardado como contacto, la exportación no lo trae." value={tel} placeholder="+56 9 …" onChange={(e) => setTel(e.target.value)} />
      {audios > 0 && <Opcion type="checkbox" id="ldTx" checked={tx} onChange={(e) => setTx(e.target.checked)}>
        {audios > 1 ? `Transcribir los ${audios} audios` : 'Transcribir el audio'} para leerlo{audios > 1 ? 's' : ''} y analizarlo{audios > 1 ? 's' : ''}
      </Opcion>}
      {sinArchivos && <p className={NOTA}>Se exportó sin archivos: las fotos y audios aparecerán como «no incluidos». Si los necesitas, exporta con «Incluir archivos».</p>}
      <p className={NOTA}>Asset leerá la conversación con IA para anotar qué busca el cliente y la próxima acción (1 token).</p>
      <p className={ERROR} id="ldErr2">{error}</p>
    </VentanaCuerpo>
    <VentanaPie><Cerrar texto="Cancelar" /><Boton id="mOk" cargando={ocupado} onClick={importar}>{ocupado ? 'Importando…' : 'Importar'}</Boton></VentanaPie>
  </>;
}

// ---------- modal-38 · no se pudo importar ----------
export function ErrorImportar({ mensaje, instagram, alVerComo }: { mensaje: string; instagram: boolean; alVerComo: () => void }) {
  return <>
    <VentanaCabecera icono="alert" tonoIcono="rojo" titulo="No se pudo importar" />
    <VentanaCuerpo><p className={P}>{mensaje}</p></VentanaCuerpo>
    <VentanaPie>
      <Boton id="ldVer" variante="secundario" onClick={alVerComo}>{instagram ? 'Cómo descargar el historial de Instagram' : 'Cómo exportar un chat'}</Boton>
      <Cerrar principal />
    </VentanaPie>
  </>;
}

// ---------- modal-39 · cuentas e historial (Instagram, WhatsApp y en vivo desde wechatia) ----------
export interface IObsEstado {
  activo: boolean; ia: boolean; canales: Record<string, boolean>; canalesTxt: Record<string, string>; porCanal?: Record<string, number>;
  ultima?: string | null; leads?: number; ultimo?: { mensajes?: number } | null; diasInicio: number; error?: string | null;
}
interface ICuentasProps {
  consentimientos: { canal: string; cuenta?: string; autorizadoPor?: string; fecha: string; conversaciones: number }[];
  /** obsEstado: el panel «En vivo» se dibuja cuando llega */
  alCargarObs: () => Promise<IObsEstado | null>;
  fechaCorta: (f: string) => string;
  alInstagram: () => void;
  alWhatsApp: () => void;
  /** obsConfigurar: devuelve el estado nuevo */
  alConfigurar: (cfg: { canales: Record<string, boolean>; ia: boolean; activo?: boolean; autorizado?: boolean }) => Promise<IObsEstado>;
  /** obsRevisar (con su toast y la recarga de la lista): devuelve el estado nuevo */
  alRevisar: () => Promise<IObsEstado>;
}
function Cuenta({ icono, clase, titulo, texto, children, id, className }: { icono: string; clase: string; titulo: string; texto: string; children: ReactNode; id?: string; className?: string }) {
  return (
    <div id={id} className={cx(className, "tw:flex tw:items-center tw:gap-3 tw:rounded-xl tw:border tw:border-solid tw:border-line tw:bg-bg tw:p-3")}>
      <span className={cx('ld-cta-i', clase)}><Icono nombre={icono} tam={20} /></span>
      <div className="tw:min-w-0 tw:flex-1 tw:flex tw:flex-col tw:gap-0.5"><b className="tw:text-sm">{titulo}</b><small className="tw:text-[12.5px] tw:text-muted tw:leading-snug">{texto}</small></div>
      {children}
    </div>
  );
}
export function Cuentas({ consentimientos, alCargarObs, fechaCorta, alInstagram, alWhatsApp, alConfigurar, alRevisar }: ICuentasProps) {
  return <>
    <VentanaCabecera icono="link" titulo="Cuentas e historial" descripcion="Trae a Leads las conversaciones que la corredora ya tuvo con clientes. Asset solo lee: no responde ni publica nada en esas cuentas." />
    <VentanaCuerpo className="ld-cuentas tw:flex tw:flex-col tw:gap-2">
      <Cuenta icono="instagram" clase="ig" titulo="Instagram · historial de mensajes" texto="El dueño de la cuenta descarga sus mensajes desde Instagram y sube aquí el archivo. Cada conversación queda como un lead con su perfil y su historial.">
        <Boton id="ldCtaIg" tamano="sm" onClick={alInstagram}>Importar</Boton>
      </Cuenta>
      <Cuenta icono="whatsapp" clase="wa" titulo="WhatsApp · chat exportado" texto="Un chat a la vez, exportado desde el teléfono del corredor.">
        <Boton id="ldCtaWa" tamano="sm" variante="secundario" onClick={alWhatsApp}>Importar</Boton>
      </Cuenta>
      <Observador alCargarObs={alCargarObs} fechaCorta={fechaCorta} alConfigurar={alConfigurar} alRevisar={alRevisar} />
      {consentimientos.length > 0 && <>
        <h4 className="tw:mt-2 tw:mb-0 tw:text-[13px] tw:font-semibold">Autorizaciones registradas</h4>
        <ul className="ld-cons tw:m-0">{consentimientos.slice(0, 8).map((c, i) => (
          <li key={i} className="tw:flex tw:items-center tw:gap-1.5"><Icono nombre={c.canal === 'instagram' ? 'instagram' : 'whatsapp'} tam={12} />
            <span><b>{c.cuenta || '—'}</b> · autorizó {c.autorizadoPor || '—'} · {fechaCorta(c.fecha)} {c.fecha.slice(0, 4)} · {c.conversaciones} conversaciones</span></li>))}
        </ul>
      </>}
    </VentanaCuerpo>
    <VentanaPie><Cerrar /></VentanaPie>
  </>;
}
// «En vivo desde wechatia»: el panel se vuelve a dibujar con el estado que devuelve cada cambio
function Observador({ alCargarObs, fechaCorta, alConfigurar, alRevisar }: Pick<ICuentasProps, 'alCargarObs' | 'fechaCorta' | 'alConfigurar' | 'alRevisar'>) {
  const [o, setO] = useState<IObsEstado | null>(null);
  const [canales, setCanales] = useState<Record<string, boolean>>({}); const [ia, setIa] = useState(false); const [aut, setAut] = useState(false);
  const [error, setError] = useState(''); const [revisando, setRevisando] = useState(false);
  useEffect(() => { let vivo = true; alCargarObs().then((x) => { if (vivo) setO(x); }); return () => { vivo = false; }; }, [alCargarObs]);
  useEffect(() => { if (!o) return; setCanales({ ...o.canales }); setIa(!!o.ia); setAut(false); setError(''); }, [o]);
  const cfg = async (extra: { activo?: boolean; autorizado?: boolean } = {}, c = canales, i = ia) => {
    try { setO(await alConfigurar({ canales: c, ia: i, ...extra })); return true; } catch (e) { setError(mensajeDe(e)); return false; }
  };
  const hace = (f?: string | null) => { if (!f) return 'nunca'; const m = Math.round((Date.now() - new Date(f).getTime()) / 6e4); return m < 1 ? 'recién' : m < 60 ? `hace ${m} min` : fechaCorta(f); };
  const cambiarCanal = (k: string, v: boolean) => { const c = { ...canales, [k]: v }; setCanales(c); if (o?.activo) cfg({}, c); };
  const cambiarIa = (v: boolean) => { setIa(v); if (o?.activo) cfg({}, canales, v); };
  const activar = () => { if (!aut) { setError('Confirma la autorización de la corredora.'); return; } cfg({ activo: true, autorizado: true }).then((ok) => ok && toast('Leads en vivo activado: Asset revisa wechatia cada 2 minutos.', 5000)); };
  const revisar = async () => { setRevisando(true); try { setO(await alRevisar()); } catch (e) { setError(mensajeDe(e)); } finally { setRevisando(false); } };
  // al conectar wechatia el observador queda activo solo: la tarjeta únicamente aparece si está apagado o con error
  if (!o) return null; // mientras carga no se muestra la tarjeta (casi siempre queda activo y no hace falta)
  if (o.activo && !o.error) return <p className={NOTA} id="ldObs">
    Instagram, Facebook y correo llegan solos desde wechatia{o.leads ? ` · ${o.leads} lead${o.leads === 1 ? '' : 's'} en seguimiento` : ''} · última revisión {hace(o.ultima)}.
  </p>;
  return <div>
    <Cuenta id="ldObs"className={o ? 'tw:rounded-b-none' : undefined} icono="sparkle" clase="vivo" titulo="En vivo desde wechatia · Instagram, Facebook y correo" texto="Cada 2 minutos Asset lee los mensajes nuevos de las cuentas conectadas en wechatia y los anota en Leads. Solo lee: nunca responde por esos canales.">
      <span className={cx('ld-pronto', o?.activo && 'on')}>{!o ? '…' : o.activo ? 'Activo' : 'Apagado'}</span>
    </Cuenta>
    {o && <div className="ld-obs">
      <div className="ld-obs-can">
        {Object.entries(o.canalesTxt).map(([k, t]) => (
          <Opcion key={k} type="checkbox" data-can={k} checked={!!canales[k]} onChange={(e) => cambiarCanal(k, e.target.checked)}>
            {t}{o.porCanal?.[k] ? <small className="tw:text-muted"> · {o.porCanal[k]}</small> : null}
          </Opcion>))}
        <Opcion type="checkbox" id="ldObsIA" checked={ia} onChange={(e) => cambiarIa(e.target.checked)}>Leer con IA (perfil, qué busca, contacto)</Opcion>
      </div>
      {o.activo
        ? <p className={NOTA}>Última revisión: {hace(o.ultima)}{o.leads ? ` · ${o.leads} lead${o.leads === 1 ? '' : 's'} en seguimiento` : ''}{o.ultimo?.mensajes ? ` · ${o.ultimo.mensajes} mensajes nuevos en la última` : ''}.</p>
        : <>
          <p className={NOTA}>Al activarlo se traen las conversaciones de los últimos {o.diasInicio} días y desde ahí, lo nuevo.</p>
          <Opcion type="checkbox" id="ldObsAut" className={CAJITA} checked={aut} onChange={(e) => setAut(e.target.checked)}>La corredora es dueña de estas cuentas y autoriza que Asset lea y guarde sus conversaciones.</Opcion>
        </>}
      {o.error && <p className={ERROR}>{o.error}</p>}
      <p className={ERROR} id="ldObsErr">{error}</p>
      <div className="row">{o.activo
        ? <><Boton id="ldObsYa" tamano="sm" variante="secundario" cargando={revisando} onClick={revisar}>{revisando ? 'Revisando…' : 'Revisar ahora'}</Boton>
          <Boton id="ldObsOff" tamano="sm" variante="fantasma" onClick={() => cfg({ activo: false })}>Apagar</Boton></>
        : <Boton id="ldObsOn" tamano="sm" onClick={activar}>Activar</Boton>}
      </div>
    </div>}
  </div>;
}

// ---------- modal-40 · cómo descargar el historial de Instagram ----------
export function ComoInstagram({ alElegir }: { alElegir: () => void }) {
  return <>
    <VentanaCabecera icono="instagram" tonoIcono="rojo" titulo="Importar el historial de Instagram" />
    <VentanaCuerpo className="ld-cuentas">
      <p className={P}>Lo hace <b>el dueño de la cuenta</b> (o alguien con su clave), desde la app o desde instagram.com. Instagram tarda desde unos minutos hasta un par de días en preparar el archivo y avisa por correo.</p>
      <ol className="ld-ol">
        <li>En Instagram: <i>tu perfil</i> › menú <i>☰</i> › <i>Centro de cuentas</i>.</li>
        <li><i>Tu información y permisos</i> › <i>Descargar tu información</i> › <i>Descargar o transferir información</i>.</li>
        <li>Elige la cuenta de Instagram de la corredora › <i>Parte de tu información</i> › marca solo <b>Mensajes</b>.</li>
        <li><i>Descargar en el dispositivo</i> › Intervalo de fechas (por ejemplo, <i>Último año</i>) › Formato <b>JSON</b> (no HTML) › Calidad de archivos multimedia <i>Baja</i> (más liviano).</li>
        <li><i>Crear archivos</i>. Cuando llegue el correo, vuelve a <i>Descargar tu información</i> y pulsa <i>Descargar</i>.</li>
        <li>Sube aquí el .zip tal como se descargó (no lo descomprimas). Si Instagram lo dividió en varias partes, sube la que dice <i>messages</i>.</li>
      </ol>
      <p className={NOTA}>Asset muestra las conversaciones que trae el archivo y tú eliges cuáles importar. Queda registrado quién autorizó y cuándo. Si más adelante subes una descarga nueva, se agregan solo los mensajes nuevos.</p>
    </VentanaCuerpo>
    <VentanaPie><Cerrar /><Boton id="ldIgElegir" icono="upload" onClick={alElegir}>Elegir el archivo .zip</Boton></VentanaPie>
  </>;
}

// ---------- modal-41 · elegir qué conversaciones de Instagram importar ----------
export interface IIgConversacion {
  id: string; cliente?: string; usuario?: string; total: number; desde?: string; hasta?: string; fotos?: number;
  solicitud?: boolean; grupo?: boolean; delCliente: number; existente?: { nuevos: number } | null;
}
interface IImportarInstagramProps {
  conversaciones: IIgConversacion[];
  dueno?: string | null; // la cuenta de la corredora, si el archivo la trae
  participantes: string[]; // para elegirla si no
  alImportar: (v: { hilos: string[]; dueno: string; cuenta: string; analizarIA: boolean }) => Promise<void>;
}
export function ImportarInstagram({ conversaciones: conv, dueno: dueno0, participantes, alImportar }: IImportarInstagramProps) {
  const sugerido = (c: IIgConversacion) => c.delCliente > 0 && !c.grupo && (!c.existente || c.existente.nuevos > 0);
  const [marcadas, setMarcadas] = useState<string[]>(() => conv.filter(sugerido).map((c) => c.id));
  const [dueno, setDueno] = useState(dueno0 || participantes[0] || ''); const [cuenta, setCuenta] = useState('');
  const [ia, setIa] = useState(true); const [aut, setAut] = useState(false);
  const [ocupado, setOcupado] = useState(false); const [error, setError] = useState('');
  const fmt = (f?: string) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(2, 4)}` : '');
  const n = conv.filter((c) => marcadas.includes(c.id) && c.delCliente).length;
  const marcar = (id: string, v: boolean) => setMarcadas((m) => (v ? [...m, id] : m.filter((x) => x !== id)));
  const importar = async () => {
    if (!marcadas.length) { setError('Elige al menos una conversación.'); return; }
    if (!aut) { setError('Confirma que tienes la autorización del dueño de la cuenta.'); return; }
    setOcupado(true);
    try { await alImportar({ hilos: conv.filter((c) => marcadas.includes(c.id)).map((c) => c.id), dueno, cuenta: cuenta.trim(), analizarIA: ia }); }
    catch (e) { setOcupado(false); setError(mensajeDe(e)); }
  };
  return <>
    <VentanaCabecera icono="instagram" tonoIcono="rojo" titulo="Historial de Instagram" />
    <VentanaCuerpo className={cx('ld-imp ld-igimp', FORM)}>
      <p className="tw:m-0"><b>{conv.length} conversaciones</b> en el archivo.</p>
      <div className={DOS}>
        {dueno0
          ? <Input id="ldIgDueno" etiqueta="Cuenta de la corredora" ayuda="Sus mensajes quedan como «Tú»." value={dueno0} readOnly />
          : <Select id="ldIgDueno" etiqueta="Cuenta de la corredora" ayuda="Sus mensajes quedan como «Tú»." value={dueno} onChange={(e) => setDueno(e.target.value)} opciones={participantes.map((p) => [p, p])} />}
        <Input id="ldIgCuenta" etiqueta="Usuario de Instagram (opcional)" placeholder="@thelivingprop" value={cuenta} onChange={(e) => setCuenta(e.target.value)} />
      </div>
      <div>
        <div className="tw:flex tw:items-center tw:gap-1.5 tw:mb-1.5">
          <b className="tw:text-sm tw:flex-1">Conversaciones</b>
          <Boton id="ldIgTodas" tamano="sm" variante="fantasma" onClick={() => setMarcadas(conv.map((c) => c.id))}>Todas</Boton>
          <Boton id="ldIgNinguna" tamano="sm" variante="fantasma" onClick={() => setMarcadas([])}>Ninguna</Boton>
        </div>
        <div className="tw:max-h-[300px] tw:overflow-auto tw:rounded-xl tw:border tw:border-solid tw:border-line">
          {conv.map((c) => (
            <label key={c.id} className="tw:flex tw:items-center tw:gap-2.5 tw:m-0 tw:px-3 tw:py-2 tw:border-0 tw:border-b tw:border-solid tw:border-line tw:last:border-b-0 tw:cursor-pointer tw:hover:bg-hover">
              <input type="checkbox" className="tw:size-4 tw:m-0 tw:flex-none" data-hilo={c.id} checked={marcadas.includes(c.id)} onChange={(e) => marcar(c.id, e.target.checked)} />
              <Avatar nombre={c.cliente || c.usuario || '?'} tamano="sm" tono="durazno" />
              <span className="tw:min-w-0 tw:flex tw:flex-col">
                <span className="tw:text-sm"><b>{c.cliente || c.usuario}</b>{c.usuario ? <small className="tw:text-muted"> @{c.usuario}</small> : null}</span>
                <small className="tw:text-xs tw:text-muted">{c.total} mensajes · {fmt(c.desde)} a {fmt(c.hasta)}{c.fotos ? ` · ${c.fotos} foto${c.fotos > 1 ? 's' : ''}` : ''}
                  {c.solicitud && <> · <i>solicitud de mensaje</i></>}{c.grupo && <> · <i>grupo</i></>}{!c.delCliente && <> · <i>sin respuesta del cliente</i></>}
                  {c.existente && <> · <i>ya está en Leads: {c.existente.nuevos} nuevos</i></>}</small>
              </span>
            </label>))}
        </div>
      </div>
      <Opcion type="checkbox" id="ldIgIA" checked={ia} onChange={(e) => setIa(e.target.checked)}>
        Leer cada conversación con IA para anotar perfil, qué busca y próxima acción (<span id="ldIgN">{n}</span> token<span id="ldIgS">{n === 1 ? '' : 's'}</span>)
      </Opcion>
      <Opcion type="checkbox" id="ldIgAut" className={CAJITA} checked={aut} onChange={(e) => setAut(e.target.checked)}>
        Soy el dueño de esta cuenta de Instagram o tengo su autorización para guardar estas conversaciones en Asset.
      </Opcion>
      <p className={ERROR} id="ldErr2">{error}</p>
    </VentanaCuerpo>
    <VentanaPie><Cerrar texto="Cancelar" /><Boton id="mOk" cargando={ocupado} onClick={importar}>{ocupado ? 'Importando…' : `Importar ${marcadas.length}`}</Boton></VentanaPie>
  </>;
}
