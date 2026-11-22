// Acta de visita: el contenido del paso «Acta de visita» (etapa 1 · Comercialización) dentro de su ventana (modal-13,
// ventanas/inmo/Etapas.tsx › MenuPaso). El corredor:
//  1. abre un acta (una por visita) y le suma el audio de la visita: lo graba aquí, sube un archivo o lo manda por
//     WhatsApp (el acta queda «abierta» y lo que mande a la empresa cae en ella hasta que escriba «listo»);
//  2. le suma fotos desde el computador o por WhatsApp, y notas propias;
//  3. ve el resumen que arma la IA (qué comentó el interesado, qué comentó el corredor, objeciones, acuerdos, próximos
//     pasos) y cierra el acta: el paso queda logrado.
// El servidor hace el trabajo pesado (guarda, transcribe, resume). Los id (#actaPanel, #actaNueva, #actaGrabar, #actaSubir,
// #actaFotos, #actaWa, #actaResumir, #actaCerrar, #actaNotas, [data-acta]) los usan las pruebas.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Boton from '../../ui/Boton';
import Badge from '../../ui/Badge';
import Card from '../../ui/Card';
import Textarea from '../../ui/Textarea';
import { ModalConfirmar } from '../../ui/Modal';
import MenuMas from '../../ui/MenuMas';
import Icono from '../../ui/Icono';
import VisorArchivo, { type IArchivoVisor } from './VisorArchivo';
import { ActaPdf } from './ActaPdf';
import { actaVisitaService } from '../../../store/services/acta-visita.service';
import { api } from '../../../utils/api';
import { abrirModal, cerrarModal } from '../../../utils/modal';
import { abrirUrl, toast } from '../../../utils/app';
import type { IActaVisita } from '../../../store/interfaces/acta-visita.interface';

const MAX_SEG = 45 * 60;
const fmtT = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const fdm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;
const fhora = (iso: string) => new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));
const CAJA = 'tw:flex tw:flex-col tw:gap-5';   // sin caja ni borde: las secciones se separan por espacio
const INTERES = { alto: ['verde', 'Interés alto'], medio: ['amarillo', 'Interés medio'], bajo: ['rojo', 'Interés bajo'], sin_datos: ['gris', 'Sin datos de interés'] } as const;
const ORIGEN = { app: 'grabado en Asset', archivo: 'archivo subido', whatsapp: 'por WhatsApp' } as const;

/** graba con el micrófono; al detener entrega el audio (sin transcribir: el servidor lo hace al guardarlo en el acta) */
function useGrabadoraActa(alAudio: (bytes: Uint8Array, mime: string) => void, alError: (m: string) => void) {
  const [grabando, setGrabando] = useState(false);
  const [seg, setSeg] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const cb = useRef({ alAudio, alError }); cb.current = { alAudio, alError };
  const parar = () => { if (rec.current && rec.current.state !== 'inactive') rec.current.stop(); };
  useEffect(() => () => parar(), []);
  const alternar = async () => {
    if (rec.current?.state === 'recording') return parar();
    try { if ((await api('dictMic')) === false) return cb.current.alError('Asset no tiene permiso para el micrófono: actívalo en Ajustes del Sistema › Privacidad y seguridad › Micrófono.'); } catch { /* se intenta igual */ }
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch { return cb.current.alError('No pude usar el micrófono. Revisa el permiso o sube un audio ya grabado.'); }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';
    const r = new MediaRecorder(stream, mime ? { mimeType: mime } : {}); const partes: Blob[] = []; rec.current = r;
    const t0 = Date.now(); const tm = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); setSeg(s); if (s >= MAX_SEG) parar(); }, 500);
    r.ondataavailable = (e) => { if (e.data?.size) partes.push(e.data); };
    r.onstop = async () => {
      clearInterval(tm); stream.getTracks().forEach((t) => t.stop()); rec.current = null; setGrabando(false);
      const blob = new Blob(partes, { type: r.mimeType || mime || 'audio/webm' });
      cb.current.alAudio(new Uint8Array(await blob.arrayBuffer()), blob.type);
    };
    r.start(1000); setSeg(0); setGrabando(true);
  };
  return { grabando, seg, alternar };
}

/** una foto del acta como miniatura (se toca para verla grande); el «⋯» de eliminar va en la esquina */
function Miniatura({ url, titulo, n, alAbrir, menu }: { url?: string; titulo: string; n: number; alAbrir: () => void; menu?: ReactNode }) {
  return (
    <li className="tw:relative tw:size-24 tw:flex-none">
      <button type="button" data-acta-foto={n} title={titulo} aria-label={titulo} onClick={alAbrir}
        className="tw:size-full tw:p-0 tw:m-0 tw:border-0 tw:rounded-control tw:overflow-hidden tw:bg-sunken tw:cursor-pointer tw:grid tw:place-items-center tw:text-muted">
        {url ? <img src={url} alt={titulo} loading="lazy" className="tw:size-full tw:object-cover" /> : <Icono nombre="image" tam={22} />}
      </button>
      {menu && <span className="tw:absolute tw:top-1 tw:right-1">{menu}</span>}
    </li>
  );
}

/** un bloque ordenado del acta: título con su cuenta y, a la derecha y en la misma fila, sus acciones */
function Seccion({ titulo, cuenta, acciones, children }: { titulo: string; cuenta?: number; acciones?: ReactNode; children: ReactNode }) {
  return (
    <div className="tw:flex tw:flex-col tw:gap-2.5">
      <div className="tw:flex tw:items-center tw:gap-2 tw:flex-nowrap">
        <h4 className="tw:m-0 tw:flex-1 tw:text-[13px] tw:font-bold">{titulo}{cuenta ? <span className="tw:ml-1.5 tw:font-semibold tw:text-muted">({cuenta})</span> : null}</h4>
        {acciones && <div className="tw:flex tw:flex-none tw:items-center tw:gap-2">{acciones}</div>}
      </div>
      {children}
    </div>
  );
}

export default function ActaVisita({ negocioId, alCerrada }: { negocioId: string; alCerrada?: () => void }) {
  const [actas, setActas] = useState<IActaVisita[] | null>(null);
  const [error, setError] = useState('');
  const [trabajando, setTrabajando] = useState('');
  const [notas, setNotas] = useState<Record<string, string>>({});
  const [visor, setVisor] = useState<IArchivoVisor | null>(null);
  const [aEliminar, setAEliminar] = useState<IActaVisita | null>(null);
  const entradaAudio = useRef<HTMLInputElement>(null);
  const entradaFotos = useRef<HTMLInputElement>(null);
  const [minis, setMinis] = useState<Record<string, string>>({});   // miniaturas: enlaces firmados de las fotos, por «acta:n»
  const [aBorrar, setABorrar] = useState<{ acta: IActaVisita; tipo: 'audio' | 'foto'; n: number } | null>(null);

  const cargar = useCallback(async () => {
    try { setActas((await actaVisitaService.listar(negocioId)).items); setError(''); } catch (e) { setError(mensaje(e)); setActas([]); }
  }, [negocioId]);
  useEffect(() => { cargar(); }, [cargar]);
  // lo que llega por WhatsApp aparece solo: se vuelve a leer mientras haya un acta abierta (y no se esté subiendo algo)
  const hayAbierta = !!actas?.some((a) => a.estado === 'abierta');
  useEffect(() => {
    if (!hayAbierta || trabajando) return;
    const t = setInterval(cargar, 15_000);
    return () => clearInterval(t);
  }, [hayAbierta, trabajando, cargar]);

  useEffect(() => {
    (actas ?? []).forEach((a) => a.fotos.forEach((f) => {
      const k = `${a.id}:${f.n}`;
      if (minis[k] !== undefined) return;
      setMinis((m) => ({ ...m, [k]: '' }));
      actaVisitaService.archivo(a.id, 'foto', f.n).then((r) => setMinis((m) => ({ ...m, [k]: r.url }))).catch(() => null);
    }));
  }, [actas, minis]);
  const abierta = actas?.find((a) => a.estado === 'abierta') ?? null;
  const cerradas = (actas ?? []).filter((a) => a.estado === 'cerrada');

  const poner = (a: IActaVisita) => setActas((l) => [a, ...(l ?? []).filter((x) => x.id !== a.id)].sort((x, y) => y.creadaEn.localeCompare(x.creadaEn)));
  const hacer = async (que: string, f: () => Promise<IActaVisita | void>) => {
    setTrabajando(que); setError('');
    try { const r = await f(); if (r) poner(r); } catch (e) { setError(mensaje(e)); }
    setTrabajando('');
  };
  const grab = useGrabadoraActa((bytes, mime) => { if (abierta) hacer('audio', () => actaVisitaService.audio(abierta.id, bytes, mime, 'app')); }, setError);

  const subirAudios = (l: File[]) => {
    if (!abierta || !l.length) return;
    hacer('audio', async () => {
      let r: IActaVisita | undefined;
      for (const f of l) r = await actaVisitaService.audio(abierta.id, new Uint8Array(await f.arrayBuffer()), f.type || 'audio/mpeg', 'archivo');
      return r;
    });
  };
  const subirFotos = (l: File[]) => {
    if (!abierta || !l.length) return;
    hacer('foto', async () => {
      let r: IActaVisita | undefined;
      for (const f of l) r = await actaVisitaService.foto(abierta.id, new Uint8Array(await f.arrayBuffer()), f.type || 'image/jpeg');
      return r;
    });
  };
  const abrirAudio = (a: IActaVisita, x: IActaVisita['audios'][number]) => setVisor({ actaId: a.id, tipo: 'audio', n: x.n, titulo: `Audio ${x.n}`, detalle: `${ORIGEN[x.origen]} · ${fhora(x.recibido)}`, transcripcion: x.transcripcion });
  const abrirFoto = (a: IActaVisita, x: IActaVisita['fotos'][number]) => setVisor({ actaId: a.id, tipo: 'foto', n: x.n, titulo: `Foto ${x.n}`, detalle: `${x.origen === 'whatsapp' ? 'por WhatsApp' : 'subida desde Asset'} · ${fhora(x.recibido)}` });
  const porWhatsapp = (a: IActaVisita) => hacer('wa', async () => {
    const r = await actaVisitaService.whatsapp(a.id);
    toast(`Te escribí por WhatsApp${r.telefono ? ' al ' + r.telefono : ''}: manda el audio y las fotos, y escribe «listo» al terminar.`, 7000);
  });
  const borrarArchivo = async (x: { acta: IActaVisita; tipo: 'audio' | 'foto'; n: number }) => { poner(await actaVisitaService.borrarArchivo(x.acta.id, x.tipo, x.n)); toast(x.tipo === 'audio' ? 'Audio eliminado.' : 'Foto eliminada.'); };
  // el acta cerrada no se firma: su PDF se ve, se guarda y se comparte por WhatsApp (el servidor lo arma con los audios y las fotos)
  const abrirPdf = (a: IActaVisita) => hacer('pdf', async () => {
    const r = await actaVisitaService.pdf(a.id);
    abrirModal(<ActaPdf pdf={r.pdf} archivo={r.archivo}
      alGuardar={async () => { const ruta = await window.pf.edSave(Uint8Array.from(atob(r.pdf), (c) => c.charCodeAt(0)), r.archivo); if (ruta) toast('PDF guardado.'); }}
      alCompartir={async () => {
        const c = await actaVisitaService.compartir(a.id);
        abrirUrl(c.wa);
        toast(c.telefono ? `Se abrió WhatsApp con el mensaje para ${c.visitante ?? c.telefono}.` : 'Se abrió WhatsApp: elige a quién enviarlo.', 5000);
      }} />, { ancho: true, clave: 'modal-126' });
  });
  const compartirYa = (a: IActaVisita) => hacer('wa-pdf', async () => {
    const c = await actaVisitaService.compartir(a.id);
    abrirUrl(c.wa);
    toast(c.telefono ? `Se abrió WhatsApp con el mensaje para ${c.visitante ?? c.telefono}.` : 'Se abrió WhatsApp: elige a quién enviarlo.', 5000);
  });
  // el visitante no quedó interesado: se cierra el negocio como perdido, con el motivo
  const noInteresado = () => (window as unknown as { Ventanas: { abrir: (n: string, p: object, o: object) => void } }).Ventanas.abrir('negocios.perdido', {
    alGuardar: async (m: string) => { await api('negCerrar', negocioId, 'perdido', m); cerrarModal(); toast('Negocio marcado como perdido.'); alCerrada?.(); },
  }, { clave: 'modal-46' });
  const guardarNotas = async (a: IActaVisita) => { if (notas[a.id] != null && notas[a.id] !== a.notas) await actaVisitaService.notas(a.id, notas[a.id]); };
  const eliminar = async (a: IActaVisita) => {
    await actaVisitaService.eliminar(a.id);
    setActas((l) => (l ?? []).filter((x) => x.id !== a.id));
    toast('Acta eliminada.');
  };
  const cerrar = (a: IActaVisita) => hacer('cerrar', async () => {
    await guardarNotas(a);
    const r = await actaVisitaService.cerrar(a.id, negocioId);
    toast('Acta de visita cerrada.'); alCerrada?.();
    return r;
  });

  if (actas === null) return <p className="tw:m-0 tw:text-[13px] tw:text-muted">Cargando las actas…</p>;

  const ver = (a: IActaVisita, editable: boolean) => (
    <div key={a.id} data-acta={a.id}>
      <Card titulo={`Visita del ${fdm(a.fecha)}`} accion={
        <div className="tw:flex tw:items-center tw:gap-2 tw:flex-nowrap">
          <Badge tono={a.estado === 'cerrada' ? 'verde' : 'amarillo'} punto>{a.estado === 'cerrada' ? 'Cerrada' : 'Abierta'}</Badge>
          {a.resumen && <Badge tono={INTERES[a.resumen.interes][0]}>{INTERES[a.resumen.interes][1]}</Badge>}
          <MenuMas tamano="sm" etiqueta="Más acciones del acta" opciones={[
            ...(a.estado === 'cerrada' ? [{ id: 'actaNoInteresado', texto: 'El visitante no quedó interesado…', icono: 'x', disabled: !!trabajando, alTocar: noInteresado }] : []),
            { id: 'actaEliminar', texto: 'Eliminar acta', icono: 'trash', disabled: !!trabajando || grab.grabando, alTocar: () => setAEliminar(a) },
          ]} />
        </div>}>
      <div className={CAJA}>
      <Seccion titulo="Audio de la visita" cuenta={a.audios.length} acciones={editable ? <>
        <Boton id="actaGrabar" variante={grab.grabando ? 'peligro' : 'principal'} icono={grab.grabando ? undefined : 'mic'} cargando={trabajando === 'audio'} disabled={!!trabajando} onClick={grab.alternar}>
          {grab.grabando ? <><i className="tw:block tw:size-2.5 tw:rounded-full tw:bg-current tw:animate-pulse" />Detener · {fmtT(grab.seg)}</> : trabajando === 'audio' ? 'Transcribiendo…' : 'Grabar la visita'}
        </Boton>
        <MenuMas tamano="md" etiqueta="Otras formas de sumar el audio" opciones={[
          { id: 'actaSubirItem', texto: 'Subir un audio ya grabado', icono: 'upload', disabled: !!trabajando || grab.grabando, alTocar: () => entradaAudio.current?.click() },
          { id: 'actaWa', texto: 'Mandar el audio por WhatsApp', icono: 'whatsapp', disabled: !!trabajando || grab.grabando, alTocar: () => porWhatsapp(a) },
        ]} />
      </> : undefined}>
        {editable && a.audios.length === 0 && <p className="tw:m-0 tw:text-xs tw:text-muted">Graba la visita aquí, o súbela / mándala por WhatsApp desde el menú «⋯»: se transcribe y se resume sola.</p>}
        {a.audios.length > 0 && (
          <ul className="tw:list-none tw:m-0 tw:p-0 tw:flex tw:flex-col tw:gap-1">
            {a.audios.map((x) => (
              <li key={x.n} data-acta-audio={x.n} className="tw:flex tw:items-center tw:gap-1 tw:flex-nowrap">
                <button type="button" title="Escuchar y leer la transcripción" onClick={() => abrirAudio(a, x)}
                  className="tw:flex tw:min-w-0 tw:flex-1 tw:items-center tw:gap-3 tw:p-1.5 tw:m-0 tw:border-0 tw:rounded-control tw:bg-transparent tw:text-left tw:font-[inherit] tw:text-text tw:cursor-pointer tw:hover:bg-hover">
                  <span className="tw:grid tw:size-9 tw:flex-none tw:place-items-center tw:rounded-full tw:bg-lav-soft tw:text-lav-softink"><Icono nombre="mic" tam={16} /></span>
                  <span className="tw:flex tw:min-w-0 tw:flex-col">
                    <b className="tw:text-[13px]">Audio {x.n}</b>
                    <small className="tw:text-xs tw:text-muted tw:truncate">{ORIGEN[x.origen]} · {fhora(x.recibido)} · {(x.bytes / 1048576).toFixed(1)} MB{x.error ? ' · sin transcripción' : ''}</small>
                  </span>
                </button>
                {editable && <MenuMas tamano="sm" etiqueta="Más acciones del audio" opciones={[{ texto: 'Eliminar audio', icono: 'trash', disabled: !!trabajando, alTocar: () => setABorrar({ acta: a, tipo: 'audio', n: x.n }) }]} />}
              </li>
            ))}
          </ul>
        )}
        {!editable && a.audios.length === 0 && <p className="tw:m-0 tw:text-[13px] tw:text-muted">Sin audios.</p>}
      </Seccion>

      <Seccion titulo="Fotos de la visita" cuenta={a.fotos.length}>
        {a.fotos.length > 0 || editable
          ? <ul className="tw:list-none tw:m-0 tw:p-0 tw:flex tw:flex-wrap tw:gap-2">
            {a.fotos.map((x) => (
              <Miniatura key={x.n} n={x.n} titulo={`Foto ${x.n}`} url={minis[`${a.id}:${x.n}`] || undefined} alAbrir={() => abrirFoto(a, x)}
                menu={editable ? <MenuMas tamano="sm" etiqueta="Más acciones de la foto" opciones={[{ texto: 'Eliminar foto', icono: 'trash', disabled: !!trabajando, alTocar: () => setABorrar({ acta: a, tipo: 'foto', n: x.n }) }]} /> : undefined} />
            ))}
            {editable && (
              <li className="tw:size-24 tw:flex-none">
                <button type="button" id="actaFotosBtn" title="Agregar fotos" aria-label="Agregar fotos" disabled={!!trabajando || grab.grabando} onClick={() => entradaFotos.current?.click()}
                  className="tw:size-full tw:p-0 tw:m-0 tw:border-0 tw:rounded-control tw:bg-sunken tw:text-muted tw:grid tw:place-items-center tw:cursor-pointer tw:hover:bg-hover tw:disabled:opacity-50">
                  {trabajando === 'foto' ? <div className="spinner" /> : <Icono nombre="plus" tam={24} />}
                </button>
              </li>
            )}
          </ul>
          : <p className="tw:m-0 tw:text-[13px] tw:text-muted">Sin fotos.</p>}
      </Seccion>

      {editable
        ? <Textarea id="actaNotas" etiqueta="Tus notas (opcional)" rows={2} placeholder="Algo que quieras dejar anotado de la visita" value={notas[a.id] ?? a.notas} onChange={(e) => setNotas((n) => ({ ...n, [a.id]: e.target.value }))} />
        : a.notas && <p className="tw:m-0 tw:text-[13px]"><b>Notas:</b> {a.notas}</p>}

      {a.resumen && (
        <div className="tw:flex tw:flex-col tw:gap-1.5 tw:rounded-control tw:bg-lav-soft tw:p-3" data-acta-resumen>
          <h4 className="tw:m-0 tw:text-[13px] tw:font-bold">Resumen de la visita</h4>
          <p className="tw:m-0 tw:text-[13px] tw:whitespace-pre-wrap">{a.resumen.resumen}</p>
          {([['Lo que comentó el interesado', a.resumen.interesado], ['Lo que comentó el corredor', a.resumen.corredor], ['Objeciones', a.resumen.objeciones], ['Acuerdos', a.resumen.acuerdos], ['Próximos pasos', a.resumen.proximosPasos]] as const)
            .filter(([, l]) => l.length).map(([t, l]) => (
              <div key={t}><b className="tw:text-xs">{t}</b><ul className="tw:m-0 tw:mt-0.5 tw:pl-4 tw:text-[13px]">{l.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
            ))}
        </div>
      )}

      {!editable && (
        <div className="tw:flex tw:items-center tw:justify-end tw:gap-2 tw:flex-nowrap">
          <span className="tw:mr-auto tw:text-xs tw:text-muted">El acta no se firma: se comparte su PDF.</span>
          <Boton id="actaVerPdf" variante="secundario" icono="file" cargando={trabajando === 'pdf'} disabled={!!trabajando} onClick={() => abrirPdf(a)}>Ver PDF</Boton>
          <Boton id="actaCompartir" icono="whatsapp" cargando={trabajando === 'wa-pdf'} disabled={!!trabajando} onClick={() => compartirYa(a)}>Compartir por WhatsApp</Boton>
        </div>
      )}
      {editable && (
        <div className="tw:flex tw:items-center tw:justify-end tw:gap-2 tw:flex-nowrap">
          <Boton id="actaResumir" variante="secundario" icono="sparkle" cargando={trabajando === 'resumir'} disabled={!!trabajando || grab.grabando || (!a.audios.length && !(notas[a.id] ?? a.notas).trim())}
            onClick={() => hacer('resumir', async () => { await guardarNotas(a); return actaVisitaService.resumir(a.id); })}>
            {a.resumen ? 'Rehacer el resumen' : 'Generar el resumen'}
          </Boton>
          <Boton id="actaCerrar" icono="check" cargando={trabajando === 'cerrar'} disabled={!!trabajando || grab.grabando} onClick={() => cerrar(a)}>Cerrar el acta</Boton>
        </div>
      )}
      </div>
      </Card>
    </div>
  );

  return (
    <div className="tw:flex tw:flex-col tw:gap-3" id="actaPanel">
      <input ref={entradaAudio} id="actaSubir" type="file" style={{ display: 'none' }} accept="audio/*,.m4a,.opus,.ogg,.mp3,.wav,.amr,.aac,.webm" multiple onChange={(e) => { const l = Array.from(e.target.files ?? []); e.target.value = ''; subirAudios(l); }} />
      <input ref={entradaFotos} id="actaFotos" type="file" style={{ display: 'none' }} accept="image/*,.heic,.heif" multiple onChange={(e) => { const l = Array.from(e.target.files ?? []); e.target.value = ''; subirFotos(l); }} />
      <VisorArchivo archivo={visor} alCerrar={() => setVisor(null)} />
      <ModalConfirmar abierto={!!aEliminar} onCerrar={() => setAEliminar(null)} titulo="¿Eliminar el acta de la visita?" peligro textoConfirmar="Eliminar"
        mensaje={`Se borran sus ${aEliminar?.audios.length ?? 0} audio(s), ${aEliminar?.fotos.length ?? 0} foto(s), notas y resumen. No se puede deshacer.`}
        onConfirmar={async () => { if (aEliminar) await eliminar(aEliminar); setAEliminar(null); }} />
      <ModalConfirmar abierto={!!aBorrar} onCerrar={() => setABorrar(null)} titulo={aBorrar?.tipo === 'audio' ? '¿Eliminar este audio?' : '¿Eliminar esta foto?'} peligro textoConfirmar="Eliminar"
        mensaje="Se borra del acta y de los archivos. El resumen ya armado no cambia: puedes rehacerlo. No se puede deshacer."
        onConfirmar={async () => { if (aBorrar) { try { await borrarArchivo(aBorrar); } catch (e) { setError(mensaje(e)); } } setABorrar(null); }} />
      {error && <p className="error tw:m-0 tw:text-[13px]" id="actaError">{error}</p>}
      {abierta ? ver(abierta, true) : (
        <div className="tw:flex tw:justify-end"><Boton id="actaNueva" icono="plus" cargando={trabajando === 'nueva'} disabled={!!trabajando} onClick={() => hacer('nueva', () => actaVisitaService.crear(negocioId))}>{cerradas.length ? 'Nueva acta de otra visita' : 'Hacer el acta de la visita'}</Boton></div>
      )}
      {cerradas.map((a) => ver(a, false))}
    </div>
  );
}
