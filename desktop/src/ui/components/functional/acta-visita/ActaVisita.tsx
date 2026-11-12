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
import Textarea from '../../ui/Textarea';
import { ModalConfirmar } from '../../ui/Modal';
import InputArchivo from '../../ui/InputArchivo';
import VisorArchivo, { type IArchivoVisor } from './VisorArchivo';
import { actaVisitaService } from '../../../store/services/acta-visita.service';
import { api } from '../../../utils/api';
import { toast } from '../../../utils/app';
import type { IActaVisita } from '../../../store/interfaces/acta-visita.interface';

const MAX_SEG = 45 * 60;
const fmtT = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const fdm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;
const fhora = (iso: string) => new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));
const CAJA = 'tw:rounded-xl tw:border tw:border-solid tw:border-edge tw:p-3 tw:flex tw:flex-col tw:gap-2';
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

/** un bloque ordenado del acta: título con su cuenta y el contenido debajo */
function Seccion({ titulo, cuenta, children }: { titulo: string; cuenta?: number; children: ReactNode }) {
  return (
    <div className="tw:flex tw:flex-col tw:gap-2 tw:pt-2 tw:border-0 tw:border-t tw:border-solid tw:border-edge">
      <h4 className="tw:m-0 tw:text-[13px] tw:font-bold">{titulo}{cuenta ? <span className="tw:ml-1.5 tw:font-semibold tw:text-muted">({cuenta})</span> : null}</h4>
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
    <section key={a.id} className={CAJA} data-acta={a.id}>
      <div className="tw:flex tw:items-center tw:gap-2 tw:flex-wrap">
        <h3 className="tw:m-0 tw:text-sm tw:font-bold tw:flex-1">Visita del {fdm(a.fecha)}</h3>
        <Badge tono={a.estado === 'cerrada' ? 'verde' : 'amarillo'} punto>{a.estado === 'cerrada' ? 'Cerrada' : 'Abierta'}</Badge>
        {a.resumen && <Badge tono={INTERES[a.resumen.interes][0]}>{INTERES[a.resumen.interes][1]}</Badge>}
      </div>

      <Seccion titulo="Audio de la visita" cuenta={a.audios.length}>
        {editable && (
          <>
            <div className="tw:flex tw:flex-wrap tw:justify-end tw:gap-2" id="actaAgregar">
              <Boton id="actaGrabar" variante={grab.grabando ? 'peligro' : 'principal'} icono={grab.grabando ? undefined : 'mic'} cargando={trabajando === 'audio'} disabled={!!trabajando} onClick={grab.alternar}>
                {grab.grabando ? <><i className="tw:block tw:size-2.5 tw:rounded-full tw:bg-current tw:animate-pulse" />Detener · {fmtT(grab.seg)}</> : trabajando === 'audio' ? 'Transcribiendo…' : 'Grabar la visita'}
              </Boton>
              <Boton id="actaWa" variante="secundario" icono="whatsapp" cargando={trabajando === 'wa'} disabled={!!trabajando || grab.grabando} onClick={() => porWhatsapp(a)}>Mandar por WhatsApp</Boton>
            </div>
            <InputArchivo id="actaSubir" etiqueta="Subir un audio ya grabado" ayuda="Arrastra el archivo o pulsa aquí · MP3, M4A, OGG, WAV (hasta 25 MB)" icono="upload" accept="audio/*,.m4a,.opus,.ogg,.mp3,.wav,.amr,.aac,.webm" multiple
              cargando={trabajando === 'audio'} disabled={!!trabajando || grab.grabando} onArchivos={subirAudios} />
            <p className="tw:m-0 tw:text-xs tw:text-muted">Por WhatsApp también puedes mandarle el audio a la empresa y decir «guárdalo en el acta de visita»: se transcribe y se resume solo.</p>
          </>
        )}
        {a.audios.length > 0 && (
          <ul className="tw:list-none tw:m-0 tw:p-0 tw:flex tw:flex-col tw:gap-1.5">
            {a.audios.map((x) => (
              <li key={x.n} data-acta-audio={x.n} className="tw:flex tw:items-center tw:gap-2 tw:rounded-lg tw:border tw:border-solid tw:border-edge tw:px-2.5 tw:py-1.5">
                <div className="tw:flex tw:flex-col tw:min-w-0 tw:flex-1">
                  <b className="tw:text-[13px]">Audio {x.n}</b>
                  <small className="tw:text-xs tw:text-muted tw:truncate">{ORIGEN[x.origen]} · {fhora(x.recibido)} · {(x.bytes / 1048576).toFixed(1)} MB{x.error ? ' · sin transcripción' : ''}</small>
                </div>
                <Boton tamano="sm" variante="secundario" icono="mic" onClick={() => abrirAudio(a, x)}>Escuchar y leer</Boton>
              </li>
            ))}
          </ul>
        )}
        {!editable && a.audios.length === 0 && <p className="tw:m-0 tw:text-[13px] tw:text-muted">Sin audios.</p>}
      </Seccion>

      <Seccion titulo="Fotos de la visita" cuenta={a.fotos.length}>
        {editable && <InputArchivo id="actaFotos" etiqueta="Agregar fotos" ayuda="Arrastra las fotos o pulsa aquí · JPG, PNG, HEIC" icono="image" accept="image/*,.heic,.heif" multiple
          cargando={trabajando === 'foto'} disabled={!!trabajando || grab.grabando} onArchivos={subirFotos} />}
        {a.fotos.length > 0
          ? <div className="tw:grid tw:grid-cols-[repeat(auto-fill,minmax(110px,1fr))] tw:gap-1.5">
            {a.fotos.map((x) => <Boton key={x.n} variante="secundario" icono="image" bloque data-acta-foto={x.n} onClick={() => abrirFoto(a, x)}>Foto {x.n}</Boton>)}
          </div>
          : !editable && <p className="tw:m-0 tw:text-[13px] tw:text-muted">Sin fotos.</p>}
      </Seccion>

      {editable
        ? <Textarea id="actaNotas" etiqueta="Tus notas (opcional)" rows={2} placeholder="Algo que quieras dejar anotado de la visita" value={notas[a.id] ?? a.notas} onChange={(e) => setNotas((n) => ({ ...n, [a.id]: e.target.value }))} />
        : a.notas && <p className="tw:m-0 tw:text-[13px]"><b>Notas:</b> {a.notas}</p>}

      {a.resumen && (
        <div className="tw:flex tw:flex-col tw:gap-1.5 tw:rounded-lg tw:bg-lav-soft tw:p-2.5" data-acta-resumen>
          <h4 className="tw:m-0 tw:text-[13px] tw:font-bold">Resumen de la visita</h4>
          <p className="tw:m-0 tw:text-[13px] tw:whitespace-pre-wrap">{a.resumen.resumen}</p>
          {([['Lo que comentó el interesado', a.resumen.interesado], ['Lo que comentó el corredor', a.resumen.corredor], ['Objeciones', a.resumen.objeciones], ['Acuerdos', a.resumen.acuerdos], ['Próximos pasos', a.resumen.proximosPasos]] as const)
            .filter(([, l]) => l.length).map(([t, l]) => (
              <div key={t}><b className="tw:text-xs">{t}</b><ul className="tw:m-0 tw:mt-0.5 tw:pl-4 tw:text-[13px]">{l.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
            ))}
        </div>
      )}

      {editable && (
        <div className="tw:flex tw:flex-wrap tw:justify-end tw:gap-2">
          <Boton id="actaEliminar" variante="peligro" icono="trash" disabled={!!trabajando || grab.grabando} onClick={() => setAEliminar(a)}>Eliminar acta</Boton>
          <Boton id="actaResumir" variante="secundario" icono="sparkle" cargando={trabajando === 'resumir'} disabled={!!trabajando || grab.grabando || (!a.audios.length && !(notas[a.id] ?? a.notas).trim())}
            onClick={() => hacer('resumir', async () => { await guardarNotas(a); return actaVisitaService.resumir(a.id); })}>
            {a.resumen ? 'Rehacer el resumen' : 'Generar el resumen'}
          </Boton>
          <Boton id="actaCerrar" icono="check" cargando={trabajando === 'cerrar'} disabled={!!trabajando || grab.grabando} onClick={() => cerrar(a)}>Cerrar el acta</Boton>
        </div>
      )}
      {!editable && (
        <div className="tw:flex tw:flex-wrap tw:justify-end tw:gap-2">
          <Boton id="actaEliminar" variante="peligro" icono="trash" disabled={!!trabajando} onClick={() => setAEliminar(a)}>Eliminar acta</Boton>
        </div>
      )}
    </section>
  );

  return (
    <div className="tw:flex tw:flex-col tw:gap-3" id="actaPanel">
      <VisorArchivo archivo={visor} alCerrar={() => setVisor(null)} />
      <ModalConfirmar abierto={!!aEliminar} onCerrar={() => setAEliminar(null)} titulo="¿Eliminar el acta de la visita?" peligro textoConfirmar="Eliminar"
        mensaje={`Se borran sus ${aEliminar?.audios.length ?? 0} audio(s), ${aEliminar?.fotos.length ?? 0} foto(s), notas y resumen. No se puede deshacer.`}
        onConfirmar={async () => { if (aEliminar) await eliminar(aEliminar); setAEliminar(null); }} />
      {error && <p className="error tw:m-0 tw:text-[13px]" id="actaError">{error}</p>}
      {abierta ? ver(abierta, true) : (
        <section className={CAJA}>
          <div>
            <h3 className="tw:m-0 tw:text-sm tw:font-bold">Acta de la visita</h3>
            <p className="tw:mt-1 tw:mb-0 tw:text-[13px] tw:text-muted">Graba el audio de la visita (aquí o por WhatsApp), suma fotos y obtén un resumen de lo que comentó el interesado y de lo que comentaste tú.</p>
          </div>
          <div className="tw:flex tw:justify-end"><Boton id="actaNueva" icono="plus" cargando={trabajando === 'nueva'} disabled={!!trabajando} onClick={() => hacer('nueva', () => actaVisitaService.crear(negocioId))}>{cerradas.length ? 'Nueva acta de otra visita' : 'Hacer el acta de la visita'}</Boton></div>
        </section>
      )}
      {cerradas.map((a) => ver(a, false))}
    </div>
  );
}
