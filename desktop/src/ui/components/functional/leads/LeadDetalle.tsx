// El lead elegido: su conversación como un chat de WhatsApp (cada mensaje con el ícono del canal por el que llegó:
// WhatsApp, Instagram, Messenger o correo, y quién lo escribió), la caja para escribirle y la ficha plegable a la derecha.
// Columnas de Leads.tsx: .ld-chat (#ldChat) y .ld-ficha (#ldFicha). Las pruebas usan #ldChB, .ld-m (.in / .out),
// .ld-ch-h, #ldRespTx, #ldRespOk y los de la ficha (FichaLead.tsx).
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { leadService } from '../../../store/services/lead.service';
import { abrirUrl, toast } from '../../../utils/app';
import { cx } from '../../../utils/cx';
import Avatar from '../../ui/Avatar';
import Boton from '../../ui/Boton';
import Icono from '../../ui/Icono';
import EstadoVacio from '../../ui/EstadoVacio';
import { CANALES, ChipCanal, IconoCanal, canalDe, canalDeSalida, canalDelLead } from './canal';
import { nombreDe } from './formato';
import FichaLead from './FichaLead';
import Divisor from './Divisor';
import { EsqueletoChat, EsqueletoFicha } from './EsqueletoLeads';
import { comandoEnTexto, correr, sugerencias, tokenEn, type IAccionTarjeta, type IContexto, type IPlantilla, type IToken, type ITarjeta } from './comandos';
import { MenuComandos, Tarjeta } from './TarjetaComando';
import type { ILeadDetalle, ILeadLista, IMensajeLead, TCanal } from '../../../store/interfaces/lead.interface';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
function dia(f: string) {
  const d = new Date(f.slice(0, 10) + 'T12:00:00');
  const t = `${DIAS[d.getDay()]} ${d.getDate()} de ${d.toLocaleString('es-CL', { month: 'long' })}${d.getFullYear() !== new Date().getFullYear() ? ' de ' + d.getFullYear() : ''}`;
  return t[0].toUpperCase() + t.slice(1);
}
const hora = (f: string) => f.slice(11, 16);

// texto con enlaces que se abren en el navegador
function ConEnlaces({ texto }: { texto: string }) {
  const partes = texto.split(/(https?:\/\/[^\s<>()]+)/g);
  return (
    <>{partes.map((p, i) => (/^https?:\/\//.test(p)
      ? <a key={i} href="#" onClick={(e) => { e.preventDefault(); abrirUrl(p); }} className="tw:text-blue-softink tw:break-all">{p.length > 60 ? p.slice(0, 57) + '…' : p}</a>
      : <Fragment key={i}>{p}</Fragment>))}</>
  );
}

function quienEscribe(m: IMensajeLead, l: ILeadDetalle) {
  if (m.de === 'cliente') return nombreDe(l);
  if (m.de === 'agente') return m.autor || 'Asistente';
  return m.autor || 'Corredor';
}

function Burbuja({ m, l, verImagen }: { m: IMensajeLead; l: ILeadDetalle; verImagen: (src: string) => void }) {
  const entra = m.de === 'cliente';
  const ia = m.de === 'agente';
  const canal = canalDe(m, l);
  let adjunto = null;
  const chip = (icono: string, t: string) => <span className="tw:inline-flex tw:items-center tw:gap-1.5 tw:text-[12.5px] tw:text-muted"><Icono nombre={icono} tam={14} />{t}</span>;
  if (m.tipo === 'imagen') adjunto = m.url
    ? <img src={m.url} alt="" loading="lazy" onClick={() => verImagen(m.url!)} className="tw:block tw:max-w-[240px] tw:max-h-[260px] tw:rounded-control tw:cursor-zoom-in" />
    : chip('image', 'Foto (no incluida en la exportación)');
  else if (m.tipo === 'audio') adjunto = <>{m.url ? <audio controls preload="none" src={m.url} className="tw:max-w-[260px]" /> : chip('mic', 'Audio (no incluido)')}
    {m.transcripcion && <span className="tw:text-[12.5px] tw:italic tw:text-muted">«{m.transcripcion}»</span>}</>;
  else if (m.tipo === 'video') adjunto = chip('file', `Video${m.archivo ? ' · ' + m.archivo : ''}`);
  else if (m.tipo === 'documento' || m.tipo === 'contacto') adjunto = chip('file', m.archivo || 'Archivo');
  else if (m.tipo === 'omitido') adjunto = chip('file', 'Archivo no incluido en la exportación');
  return (
    <div className={cx(
      'ld-m tw:relative tw:flex tw:flex-col tw:gap-1 tw:max-w-[78%] tw:px-3 tw:pt-1.5 tw:pb-1 tw:rounded-card tw:text-[13.5px] tw:leading-snug tw:text-text tw:shadow-[0_1px_0.5px_rgba(0,0,0,.12)]',
      entra ? 'in tw:self-start tw:bg-card tw:rounded-tl-sm' : 'out tw:self-end tw:rounded-tr-sm',
      !entra && (ia ? 'ld-ia tw:bg-lav-soft' : 'tw:bg-green-soft'),
      m.fallido && 'ld-nok tw:outline tw:outline-1 tw:outline-dashed tw:outline-red-edge',
    )}>
      <span className={cx('tw:flex tw:items-center tw:gap-1.5 tw:text-[11.5px] tw:font-bold', entra ? 'tw:text-text' : ia ? 'tw:text-lav-softink' : 'tw:text-green-softink')}>
        <IconoCanal canal={canal} tam={12} />
        {ia && <Icono nombre="sparkle" tam={11} />}
        <span className="tw:truncate">{quienEscribe(m, l)}</span>
      </span>
      {adjunto}
      {m.texto && <span className="tw:whitespace-pre-wrap tw:break-words"><ConEnlaces texto={m.texto} /></span>}
      <span className="tw:flex tw:items-center tw:justify-end tw:gap-1.5 tw:text-[10.5px] tw:text-muted">
        {m.fallido && <span className="tw:inline-flex tw:items-center tw:gap-1 tw:font-semibold tw:text-red-softink" title={m.fallido}><Icono nombre="alert" tam={11} /> No entregado</span>}
        <small>{hora(m.fecha)}</small>
      </span>
    </div>
  );
}

interface ILeadDetalleProps {
  id: string;
  datos: ILeadLista;
  /** cambia cuando la lista se recarga (algo cambió: mensajes nuevos, otro equipo…) */
  version: unknown;
  /** algo cambió aquí: que la bandeja se recargue */
  alCambiar: () => void;
}

const LLAVE_FICHA = 'pfLeadFicha';
/** si la ficha del lead está a la vista (se recuerda); Leads la usa también para el esqueleto de la carga inicial */
export const leerFicha = () => { try { return localStorage.getItem(LLAVE_FICHA) !== '0'; } catch { return true; } };

export default function LeadDetalle({ id, datos, version, alCambiar }: ILeadDetalleProps) {
  const [l, setL] = useState<ILeadDetalle | null>(null);
  const [error, setError] = useState('');
  const [ficha, setFicha] = useState(leerFicha);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  // comandos «/»: tarjetas privadas del chat y las plantillas del usuario (viven en el servidor)
  const [tarjetas, setTarjetas] = useState<ITarjeta[]>([]);
  const [plantillas, setPlantillas] = useState<IPlantilla[]>([]);
  const [idx, setIdx] = useState(0);
  const [pos, setPos] = useState(0); // dónde está el cursor en la caja
  const versionPl = useRef(0); const sigTarjeta = useRef(1);
  const caja = useRef<HTMLTextAreaElement>(null);
  const cuerpo = useRef<HTMLDivElement>(null);
  const idRef = useRef(id); idRef.current = id;

  const cargar = async () => {
    try { const x = await leadService.obtener(id); if (idRef.current === id) { setL(x); setError(''); } }
    catch (e) { if (idRef.current === id) setError((e as Error).message); }
  };
  useEffect(() => { setL(null); setTexto(''); setTarjetas([]); void cargar(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { leadService.plantillas().then((r) => { setPlantillas(r.plantillas); versionPl.current = r.version; }).catch(() => { /* sin plantillas: los comandos igual funcionan */ }); }, []);
  useEffect(() => { if (l) void cargar(); }, [version]); // eslint-disable-line react-hooks/exhaustive-deps -- la lista se recargó

  // siempre abajo, en lo último (como WhatsApp); si una foto termina de cargar y crece, sigue abajo salvo que el
  // usuario haya subido a leer
  const nMsgs = l?.mensajesLista.length ?? 0;
  const pegado = useRef(true);
  useLayoutEffect(() => { const b = cuerpo.current; if (b) { b.scrollTop = b.scrollHeight; pegado.current = true; } }, [id, nMsgs, tarjetas.length, !!l]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const b = cuerpo.current; if (!b) return;
    const alMover = () => { pegado.current = b.scrollHeight - b.scrollTop - b.clientHeight < 60; };
    const obs = new ResizeObserver(() => { if (pegado.current) b.scrollTop = b.scrollHeight; });
    for (const hijo of Array.from(b.children)) obs.observe(hijo);
    b.addEventListener('scroll', alMover);
    return () => { obs.disconnect(); b.removeEventListener('scroll', alMover); };
  }, [id, nMsgs, !!l]); // eslint-disable-line react-hooks/exhaustive-deps

  const plegar = () => { const v = !ficha; setFicha(v); try { localStorage.setItem(LLAVE_FICHA, v ? '1' : '0'); } catch { /* sin almacenamiento */ } };

  if (error && !l) return <div className="ld-chat tw:rounded-card" id="ldChat"><p role="alert" className="tw:m-4 tw:text-red-softink">{error}</p></div>;
  if (!l) return <><EsqueletoChat />{ficha && <><Divisor lado="ficha" /><EsqueletoFicha /></>}</>;

  const perfil = (window as unknown as { PERFIL?: { esAdmin?: boolean; usuarioId?: string | null } }).PERFIL;
  const esMio = !perfil || perfil.esAdmin || (!!l.corredorId && l.corredorId === perfil.usuarioId);
  const { canal: salida, fuera24 } = canalDeSalida(l);
  const canalesUsados = [...new Set<TCanal>(l.mensajesLista.length ? l.mensajesLista.map((m) => canalDe(m, l)) : [canalDelLead(l)])];
  const bloqueo = !esMio
    ? 'Este lead lo atiende otro corredor: solo él o un administrador puede escribirle.'
    : !salida ? 'No hay por dónde escribirle: agrega su celular en la ficha (o espera a que escriba por Instagram o Messenger).' : '';

  // ---- comandos ----
  const guardarPlantillas = async (lista: IPlantilla[]) => {
    let r;
    try { r = await leadService.guardarPlantillas(lista, versionPl.current); }
    catch { const a = await leadService.plantillas(); versionPl.current = a.version; r = await leadService.guardarPlantillas(lista, a.version); } // otro equipo la cambió: se reintenta una vez
    setPlantillas(r.plantillas); versionPl.current = r.version;
  };
  const nota = async (t: string) => {
    const f = new Date(); const p = (n: number) => String(n).padStart(2, '0');
    const nuevo = `${l.notas ? l.notas + '\n' : ''}${p(f.getDate())}/${p(f.getMonth() + 1)} ${p(f.getHours())}:${p(f.getMinutes())} · ${t}`.slice(-2000);
    await leadService.actualizar(l.id, { notas: nuevo });
    await cargar(); alCambiar(); // la respuesta de actualizar no trae la conversación: se vuelve a leer el lead
  };
  const ctx: IContexto = { l, plantillas, guardarPlantillas, nota };
  /** corre «/comando args»; `en` es el pedazo del texto donde se escribió (en medio de una frase): el comando sale de ahí y una plantilla se inserta en su lugar */
  const correrComando = async (escrito: string, en?: { antes: string; despues: string }) => {
    const r = await correr(escrito, ctx);
    if ('poner' in r) { setTexto(en ? en.antes + r.poner + en.despues : r.poner); caja.current?.focus(); return; }
    if (en) setTexto((en.antes + en.despues).replace(/ {2,}/g, ' ').replace(/^ +/, ''));
    setTarjetas([{ id: sigTarjeta.current++, ...r.tarjeta }]); // solo hay un comando activo: el nuevo reemplaza al anterior
  };
  /** el formulario de una tarjeta se guardó: la tarjeta que devuelve ocupa su lugar */
  const guardarForm = async (t: ITarjeta, valores: Record<string, string>) => {
    const r = await t.form!.guardar(valores);
    setTarjetas([{ id: sigTarjeta.current++, ...r }]);
  };
  const enviarPropiedad = async (propiedadId: string, operacion?: string) => {
    if (enviando || bloqueo) { if (bloqueo) toast(bloqueo, 5000); return; }
    setEnviando(true);
    try {
      const r = await leadService.enviarPropiedad(l.id, propiedadId, operacion);
      setL(r); setTarjetas([]);
      if (r.envio?.mensaje) toast(r.envio.mensaje.replace(/^[^\p{L}]+/u, ''), 5000);
      alCambiar();
    } catch (e) { toast((e as Error).message, 6000); }
    finally { setEnviando(false); }
  };
  const accionTarjeta = (a: IAccionTarjeta) => {
    if (a.enviar) void enviarPropiedad(a.enviar.propiedadId, a.enviar.operacion);
    else if (a.poner != null) { setTexto(a.poner); caja.current?.focus(); }
    else if (a.cmd) void correrComando(a.cmd);
  };
  // el comando se puede escribir donde sea: «hola, tengo esta propiedad /cartera»
  const token = tokenEn(texto, pos);
  const sug = token ? sugerencias('/' + token.nombre, plantillas) : [];
  const act = Math.min(idx, Math.max(0, sug.length - 1));
  /** ejecuta el comando de ese pedazo del texto (al principio se lleva lo que sigue como argumentos) */
  const ejecutarEn = (t: { ini: number; fin: number }, nombre: string) => {
    const antes = texto.slice(0, t.ini); const despues = texto.slice(t.fin);
    setIdx(0);
    if (t.ini === 0) { const args = despues.trim(); setTexto(''); void correrComando(`/${nombre}${args ? ' ' + args : ''}`); return; }
    void correrComando(`/${nombre}`, { antes, despues });
  };
  /** completa «/car» como «/cartera » sin ejecutar */
  const completar = (t: IToken, nombre: string) => {
    const antes = texto.slice(0, t.ini); const despues = texto.slice(t.fin).replace(/^ +/, '');
    const nuevo = `${antes}/${nombre} ${despues}`; const cursor = antes.length + nombre.length + 2;
    setTexto(nuevo); setPos(cursor); setIdx(0);
    setTimeout(() => { caja.current?.focus(); caja.current?.setSelectionRange(cursor, cursor); }, 0);
  };
  const elegir = (nombre: string, ejecutar: boolean) => {
    if (!token) return;
    if (!ejecutar) completar(token, nombre);
    else ejecutarEn(token, nombre);
  };

  const enviar = async () => {
    const t = texto.trim(); if (!t || enviando || bloqueo) return;
    // un comando nunca se manda al cliente: si hay uno en el texto (al principio o en medio), se corre en vez de enviar
    const cmd = comandoEnTexto(texto, plantillas);
    if (cmd) { ejecutarEn(cmd, cmd.nombre); return; }
    if (t.startsWith('/')) { setTexto(''); void correrComando(t); return; } // «/algo» que no existe: avisa y no se envía
    setEnviando(true);
    try {
      const r = await leadService.enviar(l.id, t);
      setTexto('');
      setL(r);
      if (r.envio?.mensaje) toast(r.envio.mensaje.replace(/^[^\p{L}]+/u, ''), 5000);
      alCambiar();
    } catch (e) { toast((e as Error).message, 6000); }
    finally { setEnviando(false); }
  };
  const teclas = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (sug.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((act + 1) % sug.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((act - 1 + sug.length) % sug.length); return; }
      if (e.key === 'Escape') { e.preventDefault(); setTexto(''); return; }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing)) { e.preventDefault(); elegir(sug[act].nombre, e.key === 'Enter'); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void enviar(); }
  };

  let diaAnt = '';
  const verImagen = (src: string) => window.Ventanas?.abrir('leads.verImagen', { src }, { clave: 'modal-34' });
  return (
    <>
      <div className="ld-chat tw:rounded-card tw:border-edge tw:border-b-[3px] tw:border-b-edge-b" id="ldChat">
        {/* cabecera: quién es, por dónde escribe y su número corto para responder desde WhatsApp */}
        <div className="ld-ch-h tw:flex tw:items-center tw:gap-3 tw:px-4 tw:py-2.5 tw:border-0 tw:border-b tw:border-solid tw:border-edge tw:bg-card">
          <Avatar nombre={nombreDe(l)} tono={canalesUsados[0] === 'instagram' ? 'durazno' : undefined} />
          <div className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-0.5">
            <b className="tw:truncate tw:text-[14.5px]">{nombreDe(l)}</b>
            <span className="tw:flex tw:flex-wrap tw:items-center tw:gap-1.5 tw:text-[12px] tw:text-muted">
              {canalesUsados.map((c) => <ChipCanal key={c} canal={c} texto={c === 'instagram' && l.ig?.usuario ? '@' + l.ig.usuario : undefined} />)}
              {l.telefono && l.nombre && <span>{l.telefono}</span>}
              {l.origenTxt && !['whatsapp', 'instagram', 'facebook', 'email'].includes(l.origen || '') && <span>{l.origenTxt}</span>}
              {l.corto ? <span title="Para responderle desde tu WhatsApp: «#n tu mensaje»">#{l.corto}</span> : null}
            </span>
          </div>
          <Boton variante="secundario" tamano="sm" icono="layers" id="ldFichaBtn" aria-pressed={ficha} onClick={plegar}
            title={ficha ? 'Ocultar la ficha del lead' : 'Ver la ficha del lead'}>{ficha ? 'Ocultar ficha' : 'Ficha'}</Boton>
        </div>

        {/* la conversación (fondo tipo WhatsApp Mac: .ld-ch-b en styles.css) */}
        <div ref={cuerpo} id="ldChB" className="ld-ch-b tw:flex tw:flex-1 tw:flex-col tw:gap-1.5 tw:overflow-y-auto tw:px-5 tw:py-4">
          {!l.mensajesLista.length && <EstadoVacio compacto texto="Todavía no hay mensajes." className="tw:m-auto" />}
          {l.mensajesLista.map((m, i) => {
            const d = m.fecha.slice(0, 10); const nuevoDia = d !== diaAnt; diaAnt = d;
            return (
              <Fragment key={m.k || i}>
                {nuevoDia && <div className="ld-dia tw:self-center tw:my-2"><span className="tw:inline-block tw:px-3 tw:py-1 tw:rounded-card tw:bg-card tw:text-[11.5px] tw:font-semibold tw:text-muted tw:shadow-[0_1px_0.5px_rgba(0,0,0,.1)]">{dia(m.fecha)}</span></div>}
                <Burbuja m={m} l={l} verImagen={verImagen} />
              </Fragment>
            );
          })}
          {tarjetas.map((t) => <Tarjeta key={t.id} t={t} alAccion={accionTarjeta} alGuardar={(v) => guardarForm(t, v)} alCerrar={() => setTarjetas((x) => x.filter((y) => y.id !== t.id))} />)}
          {l.pendiente?.texto && (
            <div className="ld-m out ld-pend tw:self-end tw:flex tw:max-w-[78%] tw:flex-col tw:gap-1 tw:rounded-control tw:rounded-tr-sm tw:border tw:border-dashed tw:border-yellow-edge tw:bg-yellow-soft tw:px-3 tw:pt-1.5 tw:pb-1 tw:text-[13.5px]">
              <span className="tw:flex tw:items-center tw:gap-1.5 tw:text-[11.5px] tw:font-bold tw:text-yellow-softink"><Icono nombre="clock" tam={12} /> Pendiente · {l.pendiente.corredor}</span>
              <span className="tw:whitespace-pre-wrap">{l.pendiente.texto}</span>
              <small className="tw:text-[10.5px] tw:text-yellow-softink">Se le mandó la plantilla de primer contacto: este mensaje sale solo cuando responda.</small>
            </div>
          )}
        </div>

        {/* escribirle: barra plana tipo WhatsApp Mac (sin caja con borde) */}
        <div className="ld-resp tw:flex tw:flex-col tw:gap-1 tw:px-3 tw:py-2 tw:border-0 tw:border-t tw:border-solid tw:border-edge">
          {bloqueo
            ? <p className="tw:m-0 tw:flex tw:items-center tw:gap-2 tw:px-1 tw:py-1.5 tw:text-[12.5px] tw:text-muted"><Icono nombre="lock" tam={13} /> {bloqueo}</p>
            : <>
              <MenuComandos items={sug} activo={act} alElegir={(n) => elegir(n, false)} />
              <div className="tw:flex tw:items-end tw:gap-2">
                <textarea id="ldRespTx" ref={caja} rows={1} value={texto} onChange={(e) => { setTexto(e.target.value); setPos(e.target.selectionStart); setIdx(0); }} onSelect={(e) => setPos(e.currentTarget.selectionStart)} onKeyDown={teclas} disabled={enviando}
                  placeholder={`Escríbele a ${nombreDe(l)}… (/ para comandos)`} aria-label={`Mensaje para ${nombreDe(l)}`}
                  className="tw:block tw:flex-1 tw:min-h-10 tw:max-h-40 tw:m-0 tw:px-4 tw:py-2.5 tw:rounded-[22px] tw:border-0 tw:bg-card tw:text-[15px] tw:leading-snug tw:text-text tw:placeholder:text-muted tw:font-[inherit] tw:resize-none tw:field-sizing-content tw:shadow-none tw:focus:outline-none tw:focus:ring-0" />
                <Boton id="ldRespOk" tamano="md" icono={salida ? CANALES[salida].icono : 'arrowR'} cargando={enviando} disabled={!texto.trim()} onClick={() => void enviar()}
                  className="tw:h-10 tw:shrink-0 tw:rounded-[22px] tw:px-4"
                  title={[salida ? `Sale por ${CANALES[salida].nombre}` : '', fuera24 ? 'No ha escrito por WhatsApp en 24 h: saldrá la plantilla de primer contacto y tu mensaje quedará pendiente hasta que responda.' : ''].filter(Boolean).join(' · ') || undefined}>Enviar</Boton>
              </div>
            </>}
        </div>
      </div>
      {ficha && <>
        <Divisor lado="ficha" />
        <FichaLead l={l} datos={datos} alCambiar={() => { void cargar(); alCambiar(); }} alPlegar={plegar} />
      </>}
    </>
  );
}
