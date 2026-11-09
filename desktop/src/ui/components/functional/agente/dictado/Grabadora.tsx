// Grabar un audio y transcribirlo (dictMic, dictTranscribir): el botón del dictado y el micrófono del cuadro del Agente.
import { useEffect, useRef, useState } from 'react';
import Boton from '../../../ui/Boton';
import { cx } from '../../../../utils/cx';
import { toast } from '../../../../utils/app';
import { W, api } from '../tarjetas/comun';

const MAX_SEG = 240;
const fmtT = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const SIN_PERMISO = 'Asset no tiene permiso para el micrófono: actívalo en Ajustes del Sistema › Privacidad y seguridad › Micrófono.';

/** graba con el micrófono; al detener transcribe y entrega el texto. alError recibe los avisos para el usuario */
export function useGrabadora({ alTexto, alError }: { alTexto: (t: string) => void; alError: (m: string) => void }) {
  const [estado, setEstado] = useState<'listo' | 'grabando' | 'transcribiendo'>('listo');
  const [seg, setSeg] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const cb = useRef({ alTexto, alError }); cb.current = { alTexto, alError };
  const parar = () => { if (rec.current && rec.current.state !== 'inactive') rec.current.stop(); };
  useEffect(() => () => parar(), []);

  const alternar = async () => {
    if (rec.current?.state === 'recording') return parar();
    if (estado !== 'listo') return;
    if (W.Asistente?.ensureConsent && !(await W.Asistente.ensureConsent())) return;
    try { if ((await api('dictMic')) === false) return cb.current.alError(SIN_PERMISO); } catch { /* sin la consulta: se intenta igual */ }
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch { return cb.current.alError('No pude usar el micrófono. Revisa el permiso o escribe el texto.'); }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';
    const r = new MediaRecorder(stream, mime ? { mimeType: mime } : {}); const partes: Blob[] = []; rec.current = r;
    const t0 = Date.now(); const tm = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); setSeg(s); if (s >= MAX_SEG) parar(); }, 500);
    r.ondataavailable = (e) => { if (e.data?.size) partes.push(e.data); };
    r.onstop = async () => {
      clearInterval(tm); stream.getTracks().forEach((t) => t.stop()); rec.current = null; setEstado('transcribiendo');
      try {
        const blob = new Blob(partes, { type: r.mimeType || mime || 'audio/webm' });
        const x = await api<{ texto?: string }>('dictTranscribir', { bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type });
        if (x.texto) cb.current.alTexto(x.texto); else cb.current.alError('No se escuchó nada. Intenta de nuevo.');
      } catch (e) { cb.current.alError((e as Error).message); }
      setEstado('listo');
    };
    r.start(1000); setSeg(0); setEstado('grabando');
  };
  return { estado, seg, alternar };
}

/** punto rojo que late mientras graba */
const Punto = () => <i className="dc-rec tw:block tw:size-2.5 tw:rounded-full tw:bg-current tw:animate-pulse" />;

/** botón «Grabar audio» de las tarjetas del dictado */
export function Grabadora({ alTexto, etiqueta = 'Grabar audio' }: { alTexto: (t: string) => void; etiqueta?: string }) {
  const [aviso, setAviso] = useState('');
  const g = useGrabadora({ alTexto: (t) => { setAviso(''); alTexto(t); }, alError: setAviso });
  const grabando = g.estado === 'grabando';
  return (
    <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-3">
      <Boton data-mic className={cx('dc-mic', grabando && 'on')} variante={grabando ? 'peligro' : 'principal'} icono={grabando ? undefined : 'mic'}
        cargando={g.estado === 'transcribiendo'} onClick={() => { setAviso(''); g.alternar(); }}>
        {grabando ? <><Punto /><span>Detener · {fmtT(g.seg)}</span></> : g.estado === 'transcribiendo' ? <span>Transcribiendo…</span> : <span>{etiqueta}</span>}
      </Boton>
      <span className="dc-mic-est tw:text-[13px] tw:text-muted">{aviso || (grabando ? 'Habla con naturalidad: dirección, tipo, dormitorios, baños, metros, precio…' : '')}</span>
    </div>
  );
}

/** micrófono del cuadro del Agente: hablas y se envía como mensaje */
export function Microfono({ alTexto }: { alTexto: (t: string) => void }) {
  const g = useGrabadora({ alTexto, alError: (m) => toast(m, 6000) });
  const grabando = g.estado === 'grabando';
  return (
    <span id="agMic" className="ag-micw tw:inline-flex">
      <Boton tamano="sm" variante={grabando ? 'peligro' : 'fantasma'} className={cx('ag-mic', grabando && 'on', !grabando && 'tw:w-8 tw:px-0')}
        title="Hablarle al Agente (graba, transcribe y envía)" aria-label="Hablarle al Agente" icono={grabando ? undefined : 'mic'}
        cargando={g.estado === 'transcribiendo'} onClick={g.alternar}>
        {grabando && <><Punto /><small className="tw:text-[11px] tw:font-bold">{fmtT(g.seg)}</small></>}
      </Boton>
    </span>
  );
}
