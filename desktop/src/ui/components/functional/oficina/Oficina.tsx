// «La oficina»: la pantalla de inicio. El equipo camina por una oficina vidriada y cada uno muestra lo suyo de hoy.
// La sala de reuniones son las firmas en curso y la mesa del frente es la tuya («Pedir algo»).
//
// Los personajes se animan con OfLienzo.montar() (src/renderer/oficina-lienzo.js) sobre el <canvas> y moviendo
// los botones .of-pj (estilos en línea que React no maneja); se vuelve a llamar después de cada cambio.
// La geometría de la escena viene de window.OF_GEO (oficina-geo.js). Los id of* los usa test/oficina-e2e.js.
//
// La escena ocupa toda la pantalla (oficina.css: se recorta como una foto de fondo, sin bandas). Arriba flotan el
// saludo («Te toca hoy») y el equipo; el panel de quien eliges va a la derecha. Saludo, equipo y panel con el kit
// (Boton, Badge, ItemLista, Textarea) sobre una tarjeta translúcida (VIDRIO). La luz (mañana, tarde, noche o según
// la hora) se elige en el menú de usuario (Luz de la oficina). Clases of-cab, of-dock, of-dk, of-toca, of-panel y
// of-tar: marcas para las pruebas.
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import Icono from '../../ui/Icono';
import Boton from '../../ui/Boton';
import Badge from '../../ui/Badge';
import ItemLista from '../../ui/ItemLista';
import Textarea from '../../ui/Textarea';
import MenuMas from '../../ui/MenuMas';
import { SUAVE, type TTono } from '../../ui/tonos';
import { cx } from '../../../utils/cx';
import { useOficina, type TSeleccion } from '../../../store/hooks/useOficina.hook';
import {
  abrirActividad, abrirFicha, abrirLead, abrirNegocio, abrirPestana, abrirUrl, accionPaso, avisarAyuda, enviarAlAgente, geometriaOficina, montarLienzoOficina, verHoy,
} from '../../../utils/app';
import { EQUIPO, ESTXT, IMG, POR, type IMiembro } from './equipo';
import type { IOficina, ITareaOficina, TMiembro, TTareaEstado } from '../../../store/interfaces/oficina.interface';

const pendientes = (d: IOficina, id: TMiembro) => (d.tareas[id] || []).filter((x) => x.e !== 'esp');
// tarjeta del kit, translúcida para leerse sobre la escena
const VIDRIO = 'tw:bg-card/85 tw:backdrop-blur-xl tw:backdrop-saturate-150 tw:rounded-2xl tw:border tw:border-solid tw:border-edge tw:border-b-[3px] tw:border-b-edge-b tw:shadow-lg tw:text-text';
const TONO_TAREA: Record<TTareaEstado, TTono> = { fail: 'rojo', pend: 'amarillo', esp: 'gris' };
const PUNTO: Record<string, string> = { fail: 'tw:bg-red-edge', pend: 'tw:bg-yellow-edge', ok: 'tw:bg-green-edge' };
const Punto = ({ e }: { e: string }) => <span aria-hidden className={cx('tw:inline-block tw:flex-none tw:w-2.5 tw:h-2.5 tw:rounded-full', PUNTO[e])} />;

// solo lo urgente lleva nube (máximo dos), para no saturar la vista
function globos(d: IOficina) {
  const out: Partial<Record<TMiembro, { tit: string; t: string; c: string }>> = {}; let n = 0;
  for (const p of EQUIPO) { const f = (d.tareas[p.id] || []).find((x) => x.e === 'fail'); if (f && n < 2) { out[p.id] = { tit: 'No logrado', t: f.texto, c: '#a61b12' }; n++; } }
  if (!n) for (const p of EQUIPO) { const f = (d.tareas[p.id] || []).find((x) => x.e === 'pend'); if (f) { out[p.id] = { tit: 'Te toca', t: f.texto, c: '#7a4f00' }; break; } }
  return out;
}

function Escena({ d, sel, luz, elegir, escenaRef }: { d: IOficina; sel: TSeleccion; luz: string; elegir: (s: TSeleccion) => void; escenaRef: React.Ref<HTMLDivElement> }) {
  const G = geometriaOficina(); const g = globos(d); const nf = d.firmas.length;
  const zona = (k: string, t: string, c: string) => G.zonas?.[k] && (
    <span key={`z${k}`} className="of-zona" style={{ left: `${G.zonas[k][0]}%`, top: `${G.zonas[k][1]}%` }}><i style={{ background: c }} />{t}</span>
  );
  const brillo = (k: string, label: string, on: boolean, s: TSeleccion) => { const r = G.glow?.[k]; return r && (
    <button key={`g${k}`} className={`of-esc${on ? ' sel' : ''}`} data-esc={k} aria-label={label} onClick={() => elegir(s)}
      style={{ left: `${r[0]}%`, top: `${r[1]}%`, width: `${r[2]}%`, height: `${r[3]}%` }}><img src={`${IMG}glow_${k}.png`} alt="" /></button>
  ); };
  return (
    <div className="of-vista">
      <div className="of-escena" ref={escenaRef}>
        <img className="of-fondo" src={`${IMG}fondo_${luz}.jpg`} alt="La oficina: escritorios de captación, leads, documentos y seguimiento, un living, la sala de reuniones vidriada y tu mesa" />
        {G.gab && <img className="of-gab" src={`${IMG}gabinete_abierto.png`} alt="" style={{ left: `${G.gab[0]}%`, top: `${G.gab[1]}%`, width: `${G.gab[2]}%`, height: `${G.gab[3]}%` }} />}
        <canvas className="of-lienzo" aria-hidden="true" />
        {EQUIPO.map((p) => zona(p.id, p.area, p.color))}
        {zona('sala', `Firmas en curso${nf ? ' · ' + nf : ''}`, '#3b5bdb')}
        {zona('mesa', 'Tu mesa', '#1b1f2a')}
        {EQUIPO.map((p) => brillo(p.id, `Escritorio de ${p.nombre} · ${p.area}`, sel === p.id, p.id))}
        {brillo('sala', 'Sala de reuniones: firmas en curso', sel === 'sala', 'sala')}
        {brillo('mesa', 'Tu mesa: pedir algo', sel === 'yo', 'yo')}
        {(['pedro', 'fernanda', 'juanita', 'diego'] as TMiembro[]).map((id) => {
          const p = POR[id]; const n = pendientes(d, id).length; const gl = g[id];
          return (
            <button key={id} className={`of-pj of-pj-${id}${sel === id ? ' sel' : ''}`} data-p={id} aria-pressed={sel === id}
              aria-label={`${p.nombre}, ${p.area}${n ? `: ${n} pendientes` : ''}`} onClick={() => elegir(id)}>
              {gl && <span className={`of-globo${id === 'diego' ? ' der' : ''}`} style={{ '--gc': gl.c } as CSSProperties}><b>{gl.tit}</b>{gl.t}</span>}
              <span className="of-chip"><i style={{ background: p.color }} />{p.nombre}{n > 0 && <em className="of-bur">{n}</em>}</span>
              {(G.acts?.[id] || []).map(([i, t]: [number, string]) => <span key={i} className={`of-act of-a${i}`}>{t}</span>)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Cabecera({ d, toca, elegir, alternarToca }: { d: IOficina; toca: boolean; elegir: (s: TSeleccion) => void; alternarToca: () => void }) {
  const todas = EQUIPO.flatMap((p) => pendientes(d, p.id).map((x) => ({ ...x, p }))).sort((a, b) => (a.e === 'fail' ? 0 : 1) - (b.e === 'fail' ? 0 : 1));
  const urg = todas.some((x) => x.e === 'fail');
  return (
    <div className={cx('of-cab tw:pointer-events-auto tw:flex tw:flex-wrap tw:items-center tw:gap-x-3 tw:gap-y-2 tw:w-max tw:max-w-[min(560px,100%)] tw:p-2', VIDRIO)}>
      <div className="tw:flex tw:flex-wrap tw:gap-1">
        <Boton variante="secundario" tamano="sm" id="ofToca" aria-expanded={toca} onClick={alternarToca} iconoDerecha={todas.length ? (toca ? 'chevU' : 'chevD') : undefined}>
          <Punto e={urg ? 'fail' : todas.length ? 'pend' : 'ok'} />{todas.length ? `Te toca hoy · ${todas.length}` : 'Todo al día'}
        </Boton>
        <Boton variante="fantasma" tamano="sm" id="ofClasica" icono="listCheck" title="Ver la lista «Hoy» de siempre" onClick={verHoy}>Vista lista</Boton>
        <MenuMas id="ofMas" tamano="sm" etiqueta="Más acciones" opciones={[{ id: 'ofActividad', texto: 'Actividad', icono: 'clock', title: 'Todo lo que pasó en la cartera', alTocar: () => abrirActividad() }]} />
      </div>
      {toca && todas.length > 0 && (
        <div className="tw:flex tw:basis-full tw:flex-col tw:gap-0.5 tw:max-h-[50vh] tw:overflow-y-auto">
          {todas.slice(0, 7).map((x, i) => (
            <ItemLista key={i} className="of-toca tw:py-1.5" data-p={x.p.id} alTocar={() => elegir(x.p.id)}
              media={<img src={`${IMG}ava_${x.p.id}.png`} alt="" className="tw:block tw:w-8 tw:h-8 tw:rounded-full tw:object-cover" style={{ background: x.p.suave }} />}
              titulo={<span className="tw:font-medium">{x.texto}</span>} derecha={<Punto e={x.e} />} />
          ))}
          {todas.length > 7 && <p className="tw:m-0 tw:px-3 tw:py-1 tw:text-xs tw:text-muted">y {todas.length - 7} más: toca a tu equipo arriba</p>}
        </div>
      )}
    </div>
  );
}

function CabPanel({ img, titulo, sub, cerrar }: { img?: ReactNode; titulo: string; sub: string; cerrar: () => void }) {
  return (
    <div className="tw:flex tw:items-center tw:gap-3">{img}
      <div className="tw:min-w-0 tw:flex-1"><h2 className="tw:m-0 tw:text-lg tw:font-extrabold tw:leading-tight">{titulo}</h2><p className="tw:m-0 tw:mt-0.5 tw:text-[13px] tw:text-muted">{sub}</p></div>
      <Boton variante="fantasma" tamano="sm" id="ofCerrar" icono="x" aria-label="Cerrar" onClick={cerrar} />
    </div>
  );
}
const Rotulo = ({ children, color }: { children: ReactNode; color?: string }) => <div className="tw:text-[11.5px] tw:font-extrabold tw:uppercase tw:tracking-wider tw:text-muted" style={color ? { color } : undefined}>{children}</div>;
const Vacio = ({ children }: { children: ReactNode }) => <p className="tw:m-0 tw:text-[13px] tw:text-muted">{children}</p>;
// una tarea (o firma) del panel: estado, texto y su acción
const ICONO_TAREA: Record<TTareaEstado, string> = { fail: 'alert', pend: 'clock', esp: 'dots' };
function Tarea({ e, texto, sub, accion }: { e: TTareaEstado; texto: string; sub?: string; accion?: ReactNode }) {
  return (
    <div className="of-tar tw:flex tw:items-start tw:gap-2.5 tw:p-2.5 tw:rounded-xl tw:bg-sunken tw:border tw:border-solid tw:border-edge">
      <span className={cx('tw:grid tw:flex-none tw:place-items-center tw:w-7 tw:h-7 tw:rounded-full', SUAVE[TONO_TAREA[e]])} title={ESTXT[e][1]}><Icono nombre={ICONO_TAREA[e]} tam={14} /></span>
      <span className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-2">
        <span className="tw:flex tw:flex-col"><b className="tw:text-[13.5px] tw:font-semibold">{texto}</b>{sub && <small className="tw:text-xs tw:text-muted">{sub}</small>}</span>
        {accion && <span className="tw:flex">{accion}</span>}
      </span>
    </div>
  );
}

function Panel({ d, sel, cerrar, alTerminar }: { d: IOficina; sel: TSeleccion; cerrar: () => void; alTerminar: () => void }) {
  const pedido = useRef<HTMLTextAreaElement>(null);
  if (!sel) return null;
  // Diego trabaja a la derecha: su panel va a la izquierda (bajo el saludo) para no taparlo
  const caja = (izq = false) => cx('of-panel tw:absolute tw:z-[1000] tw:flex tw:flex-col tw:gap-3 tw:w-[380px] tw:max-w-[calc(100%-24px)] tw:p-4 tw:overflow-y-auto tw:animate-[ofEntra_.22s_ease-out]',
    izq ? 'izq tw:left-5 tw:top-[136px] tw:max-h-[calc(100%-160px)]' : 'tw:right-5 tw:top-[104px] tw:max-h-[calc(100%-128px)]', VIDRIO);
  if (sel === 'sala') return (
    <aside className={caja()}>
      <CabPanel titulo="Firmas en curso" sub="La sala de reuniones · las lleva Juanita" cerrar={cerrar} />
      {d.firmas.length ? d.firmas.map((f, i) => (
        <Tarea key={i} e="esp" texto={f.texto} sub={[f.codigo, f.cliente, f.d].filter(Boolean).join(' · ')}
          accion={<Boton variante="secundario" tamano="sm" data-firma={i} onClick={() => (f.negocioId ? abrirNegocio(f.negocioId) : f.propId && abrirFicha(f.propId))}>Ver</Boton>} />
      )) : <Vacio>No hay documentos esperando firmas. Cuando Juanita envíe uno, aparece aquí hasta que todos firmen.</Vacio>}
    </aside>
  );
  if (sel === 'yo') {
    const pedir = () => { const t = pedido.current?.value.trim(); if (!t) return pedido.current?.focus(); enviarAlAgente(t); };
    return (
      <aside className={caja()}>
        <CabPanel titulo="Tu mesa" sub="Pide lo que necesites: el Agente lo deriva a quien corresponde" cerrar={cerrar} />
        <Textarea id="ofPide" ref={pedido} etiqueta="¿Qué necesitas?" rows={4} placeholder="Ej.: capté un depto en Ñuñoa, 2D 1B, 120 millones…" />
        <div className="tw:flex tw:flex-wrap tw:gap-2"><Boton id="ofPedir" icono="sparkle" onClick={pedir}>Pedírselo al Agente</Boton></div>
        {d.wa.activo && <Vacio>También desde el celular: escribe el nombre de quien necesitas (Pedro, Juanita, Diego o Fernanda) al {d.wa.numeroEmpresa}.</Vacio>}
      </aside>
    );
  }
  const p: IMiembro = POR[sel]; const ts = d.tareas[p.id] || []; const pr = ts[0];
  const tocar = (x: ITareaOficina) => (x.leadId ? abrirLead(x.leadId) : accionPaso(x, alTerminar));
  return (
    <aside className={caja(p.id === 'diego')}>
      <CabPanel img={<img className="tw:flex-none tw:w-14 tw:h-14 tw:rounded-full tw:object-cover tw:border-2 tw:border-solid tw:border-white tw:shadow" src={`${IMG}ava_${p.id}.png`} alt="" style={{ background: p.suave }} />}
        titulo={p.nombre} sub={`${p.area} · ${p.rol}`} cerrar={cerrar} />
      <div className="tw:p-3 tw:rounded-xl tw:border tw:border-solid tw:border-edge" style={{ background: p.suave, color: '#1b1f2a' }}>
        <Rotulo color={p.color}>Ahora</Rotulo>
        <div className="tw:mt-0.5 tw:font-semibold">{pr ? (pr.e === 'esp' ? `Esperando ${pr.quien ? 'a ' + pr.quien : 'a otros'}: ${pr.texto}` : pr.texto) : 'Todo al día por mi lado.'}</div>
      </div>
      <Rotulo>Hoy</Rotulo>
      {ts.length ? ts.slice(0, 8).map((x, i) => (
        <Tarea key={i} e={x.e} texto={x.texto} sub={[x.titulo, x.cliente, x.e === 'fail' ? x.d : ''].filter(Boolean).join(' · ') || undefined}
          accion={x.leadId ? <Boton variante="secundario" tamano="sm" data-t={i} onClick={() => tocar(x)}>Abrir</Boton>
            : x.accion && x.e !== 'esp' ? <Boton variante={x.e === 'fail' ? 'peligro' : 'principal'} tamano="sm" data-t={i} onClick={() => tocar(x)}>{x.accion}</Boton>
              : <Badge tono={TONO_TAREA[x.e]} className="tw:flex-none">{ESTXT[x.e][1]}</Badge>} />
      )) : <Vacio>Nada pendiente en mi área. ¡Bien!</Vacio>}
      <div className="tw:p-3 tw:rounded-xl tw:bg-green-soft tw:text-green-softink tw:text-[13px]">
        {d.wa.activo
          ? <>Por WhatsApp: escribe «<b>{p.nombre}</b>» al {d.wa.numeroEmpresa} y te atiende {p.nombre === 'Juanita' || p.nombre === 'Fernanda' ? 'ella' : 'él'}; tu conversación con cada uno no se mezcla.</>
          : 'Vincula tu celular (Agente › WhatsApp) y podrás hablarle escribiendo su nombre.'}
      </div>
      <div className="tw:flex tw:flex-wrap tw:gap-2">
        {d.wa.numeroEmpresa && <Boton variante="exito" id="ofWa" icono="whatsapp" onClick={() => abrirUrl(`https://wa.me/${d.wa.numeroEmpresa.replace(/\D/g, '')}?text=${encodeURIComponent(p.nombre)}`)}>Escribirle por WhatsApp</Boton>}
        <Boton variante="secundario" id="ofVer" onClick={() => abrirPestana(p.vista)}>{p.verTxt}</Boton>
      </div>
    </aside>
  );
}

// el equipo, arriba al centro: tocar a alguien abre su panel; «Pedir algo» abre tu mesa
function Dock({ d, sel, elegir }: { d: IOficina; sel: TSeleccion; elegir: (s: TSeleccion) => void }) {
  const boton = 'of-dk tw:relative tw:flex tw:flex-col tw:items-center tw:gap-0.5 tw:min-w-[60px] tw:m-0 tw:px-1.5 tw:py-1 tw:rounded-xl tw:border-0 tw:bg-transparent tw:cursor-pointer tw:font-[inherit] tw:text-[11.5px] tw:font-semibold tw:text-text tw:hover:bg-hover tw:focus-visible:outline-2 tw:focus-visible:outline-lav-edge';
  const on = 'on tw:bg-lav-soft tw:hover:bg-lav-soft';
  return (
    <nav className={cx('of-dock tw:pointer-events-auto tw:flex tw:items-center tw:gap-1 tw:p-1.5', VIDRIO)} aria-label="Tu equipo">
      {EQUIPO.map((p) => { const n = pendientes(d, p.id).length; return (
        <button key={p.id} type="button" className={cx(boton, sel === p.id && on)} data-p={p.id} aria-label={`${p.nombre}, ${p.area}${n ? `, ${n} pendientes` : ''}`} onClick={() => elegir(p.id)}>
          <img src={`${IMG}ava_${p.id}.png`} alt="" className="tw:block tw:w-10 tw:h-10 tw:rounded-full tw:object-cover tw:border-2 tw:border-solid tw:border-white tw:shadow" style={{ background: p.suave }} />
          {n > 0 && <span className="n tw:absolute tw:right-1 tw:top-0 tw:grid tw:place-items-center tw:min-w-[18px] tw:h-[18px] tw:px-1 tw:rounded-full tw:border-2 tw:border-solid tw:border-white tw:text-[10.5px] tw:font-extrabold tw:text-white" style={{ background: p.color }}>{n}</span>}
          <span>{p.nombre}</span>
        </button>
      ); })}
      <span className="tw:w-px tw:h-9 tw:mx-1 tw:bg-edge" aria-hidden="true" />
      <button type="button" className={cx(boton, sel === 'yo' && on)} data-p="yo" aria-label="Tu mesa: pedir algo" onClick={() => elegir('yo')}>
        <span className="tw:grid tw:place-items-center tw:w-10 tw:h-10 tw:rounded-full tw:boton-brand tw:text-white tw:border tw:border-solid"><Icono nombre="plus" tam={18} /></span><span>Pedir algo</span>
      </button>
    </nav>
  );
}

export default function Oficina() {
  const { datos: d, error, sel, toca, luz, oficinaGetAll, oficinaElegir, oficinaAlternarToca } = useOficina();
  const escena = useRef<HTMLDivElement>(null);

  useEffect(() => { oficinaGetAll(); avisarAyuda('inicio'); }, [oficinaGetAll]);
  // los personajes: se vuelven a montar en el lienzo cada vez que cambia la escena (como pintar() antes)
  useEffect(() => { if (d && escena.current) montarLienzoOficina(escena.current, { luz, sel }); }, [d, luz, sel, toca]);

  if (error) return <p className="error">{error}</p>;
  if (!d) return null;
  return (
    <div className={`of l-${luz}`}>
      <Escena d={d} sel={sel} luz={luz} elegir={oficinaElegir} escenaRef={escena} />
      {/* arriba: el saludo a la izquierda y el equipo al centro (la franja deja pasar los clics a la escena) */}
      <div className="tw:absolute tw:inset-x-5 tw:top-4 tw:z-[1000] tw:flex tw:items-start tw:gap-3 tw:pointer-events-none">
        <Cabecera d={d} toca={toca} elegir={oficinaElegir} alternarToca={oficinaAlternarToca} />
        {/* en ventanas anchas, centrado en la pantalla; en angostas, en el espacio que deja el saludo */}
        <div className="tw:flex tw:min-w-0 tw:flex-1 tw:justify-center tw:xl:absolute tw:xl:inset-x-0 tw:xl:top-0"><Dock d={d} sel={sel} elegir={oficinaElegir} /></div>
      </div>
      <Panel key={String(sel)} d={d} sel={sel} cerrar={() => oficinaElegir(null)} alTerminar={() => { oficinaGetAll(); }} />
    </div>
  );
}
