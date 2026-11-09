// El chat del Agente: conversaciones guardadas (izquierda), la conversación con su caja de texto, y el lienzo.
// Se dibuja dentro de #agDrawer (lo crea controlador.tsx), que es el panel lateral o la pestaña Agente
// («modo» del store). Hecho con el kit: Boton, MenuMas, Badge y EstadoVacio. Los id ag* y las clases ag-* los usan
// las demás pantallas y las pruebas. #agCanvas es el lienzo (lienzo/) y #agMic el micrófono (dictado/Grabadora.tsx).
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as PointerEventR } from 'react';
import Icono from '../../ui/Icono';
import Boton from '../../ui/Boton';
import Badge from '../../ui/Badge';
import MenuMas from '../../ui/MenuMas';
import { cx } from '../../../utils/cx';
import { useAgente } from '../../../store/hooks/useAgente.hook';
import { useAgenteStore } from '../../../store/zustand/agente.store';
import { abrirAgenteWhatsApp, adjuntarAlAgente, claveIA, verActividadAgente, verHerramientasAgente } from '../../../utils/app';
import { RAPIDAS, ajustarCaja, alDictar, enviar, listarConvs, nueva, ocupado, quitarAdjunto } from './controlador';
import { Microfono } from './dictado/Grabadora';
import Lienzo from './lienzo/Lienzo';
import { useLienzo } from './lienzo/controlador';
import Conversaciones from './Conversaciones';
import Mensaje from './Mensaje';

/** el ícono del Agente (degradado de la marca) */
export function LogoAgente({ tam = 32 }: { tam?: number }) {
  return (
    <span className="ag-logo tw:grid tw:place-items-center tw:flex-none tw:rounded-xl tw:text-white tw:boton-brand tw:border tw:border-solid tw:border-transparent"
      style={{ width: tam, height: tam }}><Icono nombre="sparkle" tam={Math.round(tam * 0.5)} /></span>
  );
}

// el ancho de las columnas a pantalla completa (conversaciones y lienzo): se arrastra y queda guardado
type TLado = 'side' | 'canvas';
const ANCHOS: Record<TLado, [number, number]> = { side: [200, 420], canvas: [300, 640] };
const CLAVE_ANCHOS = 'pf.agAnchos';
const MIN_CHAT = 440;
function leerAnchos(): Partial<Record<TLado, number>> {
  try { return JSON.parse(localStorage.getItem(CLAVE_ANCHOS) || '{}'); } catch { return {}; }
}
function ponerAncho(lado: TLado, px?: number | null) {
  const d = document.getElementById('agDrawer'); if (!d) return;
  if (px) d.style.setProperty(`--ag-${lado}-w`, `${px}px`); else d.style.removeProperty(`--ag-${lado}-w`);
}

/** la manija entre dos columnas: se arrastra, se mueve con ← → y con doble clic vuelve al ancho de siempre */
function Asa({ lado }: { lado: TLado }) {
  const panel = () => document.getElementById(lado === 'side' ? 'agSide' : 'agCanvas');
  const limitar = (px: number) => {
    const [min, max] = ANCHOS[lado];
    const d = document.getElementById('agDrawer'); const otro = document.getElementById(lado === 'side' ? 'agCanvas' : 'agSide');
    const libre = d ? d.clientWidth - (otro?.offsetWidth || 0) - MIN_CHAT : max;
    return Math.round(Math.max(min, Math.min(max, libre, px)));
  };
  const fijar = (px: number | null) => {
    const a = leerAnchos(); if (px) a[lado] = px; else delete a[lado];
    localStorage.setItem(CLAVE_ANCHOS, JSON.stringify(a)); ponerAncho(lado, px);
  };
  const arrastrar = (e: PointerEventR<HTMLDivElement>) => {
    const p = panel(); if (!p || e.button !== 0) return;
    e.preventDefault();
    const asa = e.currentTarget; asa.setPointerCapture(e.pointerId);
    const x0 = e.clientX; const w0 = p.offsetWidth; const signo = lado === 'side' ? 1 : -1; let w = w0;
    document.body.classList.add('ag-arrastrando');
    const mover = (ev: PointerEvent) => { w = limitar(w0 + signo * (ev.clientX - x0)); ponerAncho(lado, w); };
    const soltar = () => {
      asa.removeEventListener('pointermove', mover); asa.removeEventListener('pointerup', soltar); asa.removeEventListener('pointercancel', soltar);
      document.body.classList.remove('ag-arrastrando'); if (w !== w0) fijar(w);
    };
    asa.addEventListener('pointermove', mover); asa.addEventListener('pointerup', soltar); asa.addEventListener('pointercancel', soltar);
  };
  const teclas = (e: KeyboardEvent<HTMLDivElement>) => {
    const paso = e.key === 'ArrowLeft' ? -16 : e.key === 'ArrowRight' ? 16 : 0; const p = panel();
    if (!paso || !p) return;
    e.preventDefault(); fijar(limitar(p.offsetWidth + (lado === 'side' ? paso : -paso)));
  };
  return (
    <div className="ag-asa" data-asa={lado} role="separator" aria-orientation="vertical" tabIndex={0}
      aria-label={lado === 'side' ? 'Ancho de las conversaciones' : 'Ancho del panel derecho'} title="Arrastra para cambiar el ancho · doble clic para restablecer"
      onPointerDown={arrastrar} onKeyDown={teclas} onDoubleClick={() => fijar(null)} />
  );
}

// las últimas propiedades que miraste (las guarda tarjetas/gestion.tsx): un toque muestra cómo están hoy
function Retomar() {
  let l: { id: string; codigo: string; titulo?: string }[] = [];
  try { l = JSON.parse(localStorage.getItem('pf.recientes') || '[]'); } catch { l = []; }
  if (!l.length) return null;
  return (
    <div className="ag-rec tw:flex tw:flex-wrap tw:justify-center tw:gap-2 tw:mt-2">
      <span className="tw:w-full tw:text-xs tw:font-semibold tw:uppercase tw:tracking-wide tw:text-muted">Retomar</span>
      {l.slice(0, 4).map((x) => (
        <Boton key={x.id} variante="secundario" tamano="sm" icono="house" data-rec={x.id} data-cod={x.codigo}
          onClick={() => { if (!ocupado()) window.Gestion.estado(x.id, { usuario: `Retomar ${x.codigo}` }); }}>
          <span><b>{x.codigo}</b> <span className="tw:font-normal">{String(x.titulo || '').slice(0, 34)}</span></span>
        </Boton>
      ))}
    </div>
  );
}

export default function Agente() {
  const { items, adjuntos, busy, nombre } = useAgente();
  const completo = useAgenteStore((s) => s.modo === 'full');
  const cargandoLienzo = useLienzo((x) => x.cargando);
  const [rapidas, setRapidas] = useState(false);
  const cuerpo = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLTextAreaElement>(null);
  const vacio = !items.length;
  const ancho = completo ? 'tw:w-full tw:max-w-[780px] tw:mx-auto' : 'tw:w-full';

  // la conversación siempre termina a la vista; y #agDrawer marca si está vacía
  useLayoutEffect(() => {
    const b = cuerpo.current; if (b) b.scrollTop = b.scrollHeight;
    document.getElementById('agDrawer')?.classList.toggle('vacio', vacio);
  }, [items, vacio]);
  // la caja crece con el texto; también cuando otra pantalla escribe en ella y llama a q.oninput()
  useEffect(() => { if (caja.current) caja.current.oninput = ajustarCaja; }, []);
  // el menú de acciones se cierra al tocar fuera
  useEffect(() => {
    const cerrar = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('#agQuick, #agMas')) setRapidas(false); };
    document.addEventListener('click', cerrar); return () => document.removeEventListener('click', cerrar);
  }, []);
  useEffect(() => { listarConvs(); }, []);
  useLayoutEffect(() => { const a = leerAnchos(); ponerAncho('side', a.side); ponerAncho('canvas', a.canvas); }, []);

  const caja_ = (
    <div className="ag-foot tw:relative tw:flex tw:flex-col tw:gap-2 tw:px-4 tw:pb-4 tw:pt-1">
      <div className={ancho}>
        {rapidas && (
          <div id="agQuick" role="menu" className="ag-quick tw:absolute tw:bottom-full tw:z-20 tw:mb-1 tw:min-w-[260px] tw:p-1.5 tw:rounded-xl tw:border tw:border-solid tw:border-edge tw:border-b-[3px] tw:border-b-edge-b tw:bg-card tw:shadow-[0_16px_40px_-12px_rgb(16_24_64/.28)]">
            {RAPIDAS.map(([id, ic, t, fn]) => (
              <button key={id} type="button" data-rapida={id} role="menuitem" onClick={() => { setRapidas(false); if (!ocupado()) fn(); }}
                className="tw:flex tw:w-full tw:items-center tw:gap-2.5 tw:m-0 tw:h-9 tw:px-2.5 tw:rounded-lg tw:border-0 tw:bg-transparent tw:text-left tw:text-sm tw:font-medium tw:text-text tw:cursor-pointer tw:hover:bg-hover">
                <span className="tw:text-lav-softink tw:flex"><Icono nombre={ic} tam={16} /></span><span>{t}</span>
              </button>
            ))}
          </div>
        )}
        <div className="ag-box tw:flex tw:flex-col tw:gap-1 tw:px-2 tw:pt-2 tw:pb-2 tw:rounded-2xl tw:border tw:border-solid tw:border-edge tw:border-b-[3px] tw:border-b-edge-b tw:bg-card tw:transition-[border-color,box-shadow] tw:focus-within:border-lav-edge tw:focus-within:ring-[3px] tw:focus-within:ring-lav/60">
          {adjuntos.length > 0 && (
            <div className="ag-att tw:flex tw:flex-wrap tw:gap-1.5 tw:px-1" id="agAtt">
              {adjuntos.map((a) => (
                <span key={a.name} className="ag-chip tw:inline-flex tw:items-center tw:gap-1">
                  <Badge tono={a.subido ? 'verde' : 'lavanda'} icono="file">{a.name}{a.subido && ' · subido'}</Badge>
                  <Boton variante="fantasma" tamano="sm" className="tw:h-6 tw:w-6 tw:px-0" data-rm={a.name} title="Quitar" aria-label={`Quitar ${a.name}`} icono="x" onClick={() => quitarAdjunto(a.name)} />
                </span>
              ))}
            </div>
          )}
          {!adjuntos.length && <div id="agAtt" className="ag-att tw:hidden" />}
          <textarea id="agQ" ref={caja} rows={1} placeholder="Pídele algo al Agente…" disabled={busy} aria-label="Mensaje para el Agente"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
            className={cx('tw:block tw:w-full tw:m-0 tw:px-2 tw:py-1.5 tw:border-0 tw:bg-transparent tw:resize-none tw:font-[inherit] tw:leading-relaxed tw:text-text tw:placeholder:text-muted tw:focus:outline-none tw:focus:ring-0 tw:focus:shadow-none',
              completo ? 'tw:text-[15px] tw:min-h-12' : 'tw:text-sm tw:min-h-8')} />
          <div className="ag-boxb tw:flex tw:items-center tw:gap-1.5">
            <Boton variante="fantasma" tamano="sm" className="tw:w-8 tw:px-0" id="agClip" title="Adjuntar PDF o Word" aria-label="Adjuntar PDF o Word" icono="plus" onClick={adjuntarAlAgente} />
            <Boton variante="secundario" tamano="sm" id="agMas" icono="flow" aria-haspopup="menu" aria-expanded={rapidas} onClick={(e) => { e.stopPropagation(); setRapidas((x) => !x); }}>Acciones</Boton>
            <span className="tw:flex-1" />
            {completo && <small className="ag-hint tw:text-xs tw:text-muted tw:mr-1">Enter envía · Mayús+Enter salto</small>}
            <Microfono alTexto={alDictar} />
            <Boton tamano="sm" className="ag-send tw:w-9 tw:px-0" id="agSend" title="Enviar" aria-label="Enviar" icono="arrowR" disabled={busy} onClick={() => enviar()} />
          </div>
        </div>
        <small className="ag-note tw:flex tw:items-center tw:justify-center tw:gap-1.5 tw:mt-2 tw:text-xs tw:text-muted"><Icono nombre="lock" tam={11} /> Lo que cobra o envía te pide confirmación. Las claves van directo a Portalfirma.</small>
      </div>
    </div>
  );

  return (
    <>
      <div className="ag-side" id="agSide"><Conversaciones /></div>
      <Asa lado="side" />
      <div className="ag-main">
        <div className={cx('ag-head tw:flex tw:items-center tw:gap-2', completo ? 'tw:justify-end tw:px-4 tw:pt-3 tw:pb-1' : 'tw:px-4 tw:py-2.5 tw:border-b tw:border-solid tw:border-0 tw:border-edge')}>
          {completo ? <h1 className="tw:sr-only">Agente Asset</h1> : <>
            <LogoAgente tam={26} />
            <b className="ag-t tw:min-w-0 tw:flex-1 tw:truncate tw:text-[14px]">Agente Asset</b>
          </>}
          <Boton variante="secundario" tamano="sm" className="ag-wab tw:w-8 tw:px-0" id="agWa" title="Agente por WhatsApp" aria-label="Agente por WhatsApp" icono="whatsapp" onClick={abrirAgenteWhatsApp} />
          <MenuMas id="agMore" etiqueta="Más opciones" tamano="sm" opciones={[
            { id: 'agReset', texto: 'Nueva conversación', icono: 'plus', alTocar: () => { nueva(); } },
            { id: 'agTools', texto: 'Lo que puede hacer el Agente', icono: 'grid', alTocar: verHerramientasAgente },
            { id: 'agLog', texto: 'Actividad', icono: 'listCheck', alTocar: verActividadAgente },
            { id: 'agIA', texto: 'IA de Asset', icono: 'lock', alTocar: claveIA },
          ]} />
          {!completo && <>
            <Boton variante="fantasma" tamano="sm" className="ag-only-panel tw:w-8 tw:px-0" id="agFull" title="Abrir en pantalla completa" aria-label="Abrir en pantalla completa" icono="maximize" onClick={() => window.Agente.vista?.()} />
            <Boton variante="fantasma" tamano="sm" className="ag-only-panel tw:w-8 tw:px-0" id="agClose" title="Cerrar" aria-label="Cerrar" icono="x" onClick={() => window.Agente.close?.()} />
          </>}
        </div>

        <div className={cx('ag-body tw:flex-1 tw:min-h-0 tw:overflow-y-auto tw:flex tw:flex-col', vacio ? 'tw:justify-center' : '')} id="agBody" ref={cuerpo}>
          <div className={cx(ancho, 'tw:flex tw:flex-col tw:gap-3.5 tw:px-4 tw:py-4')}>
            {vacio ? (
              <div className="ag-empty tw:flex tw:flex-col tw:items-center tw:text-center tw:gap-3 tw:py-8">
                <LogoAgente tam={completo ? 60 : 48} />
                <h1 className={cx('ag-hola tw:m-0 tw:font-bold tw:tracking-tight tw:text-text', completo ? 'tw:text-[34px]' : 'tw:text-2xl')}>{nombre ? `Hola, ${nombre}` : 'Hola'}</h1>
                <p className="tw:m-0 tw:max-w-[420px] tw:text-[15px] tw:text-muted">Pídemelo en tus palabras o con un audio. También puedes empezar con una de estas acciones:</p>
                <div className="tw:flex tw:flex-wrap tw:justify-center tw:gap-2">
                  {RAPIDAS.slice(0, 4).map(([id, ic, t, fn]) => <Boton key={id} variante="secundario" tamano="sm" icono={ic} data-inicio={id} onClick={() => { if (!ocupado()) fn(); }}>{t}</Boton>)}
                </div>
                <Retomar />
              </div>
            ) : items.map((m, i) => <Mensaje key={m.k === 'card' ? `c${m.id}` : i} m={m} i={i} />)}
          </div>
        </div>

        {caja_}
      </div>
      <Asa lado="canvas" />
      <aside className={`ag-canvas${cargandoLienzo ? ' cargando' : ''}`} id="agCanvas"><Lienzo /></aside>
    </>
  );
}
