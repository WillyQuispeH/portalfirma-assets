// «La oficina»: la pantalla de inicio. El equipo camina por una oficina vidriada y cada uno muestra lo suyo de hoy.
// La sala de reuniones son las firmas en curso y la mesa del frente es la tuya («Pedir algo»).
//
// Los personajes se animan con OfLienzo.montar() (src/renderer/oficina-lienzo.js) sobre el <canvas> y moviendo
// los botones .of-pj (estilos en línea que React no maneja); se vuelve a llamar después de cada cambio.
// La geometría de la escena viene de window.OF_GEO (oficina-geo.js). Los id of* los usa test/oficina-e2e.js.
import { useEffect, useRef, type CSSProperties } from 'react';
import { useOficina, type TSeleccion } from '../../../store/hooks/useOficina.hook';
import {
  abrirActividad, abrirFicha, abrirLead, abrirNegocio, abrirPestana, abrirUrl, accionPaso, avisarAyuda, enviarAlAgente, geometriaOficina, montarLienzoOficina, verHoy,
} from '../../../utils/app';
import { EQUIPO, ESTXT, IMG, POR, SVG_LUZ, SvgFlecha, SvgMas, SvgWa, SvgX, type IMiembro } from './equipo';
import type { IOficina, ITareaOficina, TMiembro } from '../../../store/interfaces/oficina.interface';

const pendientes = (d: IOficina, id: TMiembro) => (d.tareas[id] || []).filter((x) => x.e !== 'esp');

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

function Cabecera({ d, nombre, toca, elegir, alternarToca }: { d: IOficina; nombre: string; toca: boolean; elegir: (s: TSeleccion) => void; alternarToca: () => void }) {
  const todas = EQUIPO.flatMap((p) => pendientes(d, p.id).map((x) => ({ ...x, p }))).sort((a, b) => (a.e === 'fail' ? 0 : 1) - (b.e === 'fail' ? 0 : 1));
  const h = new Date().getHours(); const sal = h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
  const urg = todas.some((x) => x.e === 'fail');
  return (
    <div className="of-cab of-vidrio">
      <h1>{sal}{nombre ? `, ${nombre}` : ''}</h1>
      <div className="of-cab-bt">
        <button className="of-pill" id="ofToca" aria-expanded={toca} onClick={alternarToca}>
          <span className="dot" style={{ background: urg ? '#d92d20' : todas.length ? '#f0a020' : '#12b76a' }} />
          {todas.length ? `Te toca hoy · ${todas.length}` : 'Todo al día'}{todas.length > 0 && <SvgFlecha abierto={toca} />}
        </button>
        <button className="of-pill suave" id="ofClasica" title="Ver la lista «Hoy» de siempre" onClick={verHoy}>Vista lista</button>
        <button className="of-pill suave" id="ofActividad" title="Todo lo que pasó en la cartera" onClick={abrirActividad}>Actividad</button>
      </div>
      {toca && todas.length > 0 && (
        <>
          {todas.slice(0, 7).map((x, i) => (
            <button key={i} className="of-toca" data-p={x.p.id} onClick={() => elegir(x.p.id)}>
              <img src={`${IMG}ava_${x.p.id}.png`} alt="" /><span style={{ flex: 1, minWidth: 0 }}>{x.texto}</span>
              <span className="dot" style={{ background: x.e === 'fail' ? '#d92d20' : '#f0a020' }} />
            </button>
          ))}
          {todas.length > 7 && <span className="of-vacio">y {todas.length - 7} más: toca a tu equipo abajo</span>}
        </>
      )}
    </div>
  );
}

function CabPanel({ img, titulo, sub, cerrar }: { img?: React.ReactNode; titulo: string; sub: string; cerrar: () => void }) {
  return (
    <div className="of-ph">{img}
      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 20, fontWeight: 800 }}>{titulo}</div><div style={{ color: '#4a5263' }}>{sub}</div></div>
      <button className="of-x" id="ofCerrar" aria-label="Cerrar" onClick={cerrar}><SvgX /></button>
    </div>
  );
}

function Panel({ d, sel, cerrar, alTerminar }: { d: IOficina; sel: TSeleccion; cerrar: () => void; alTerminar: () => void }) {
  const pedido = useRef<HTMLTextAreaElement>(null);
  if (!sel) return null;
  if (sel === 'sala') return (
    <aside className="of-panel of-vidrio">
      <CabPanel titulo="Firmas en curso" sub="La sala de reuniones · las lleva Juanita" cerrar={cerrar} />
      {d.firmas.length ? d.firmas.map((f, i) => (
        <div key={i} className="of-tar"><span className="ic esp">…</span>
          <span className="tx"><b>{f.texto}</b><small>{[f.codigo, f.cliente, f.d].filter(Boolean).join(' · ')}</small></span>
          <button data-firma={i} onClick={() => (f.negocioId ? abrirNegocio(f.negocioId) : f.propId && abrirFicha(f.propId))}>Ver</button>
        </div>
      )) : <p className="of-vacio">No hay documentos esperando firmas. Cuando Juanita envíe uno, aparece aquí hasta que todos firmen.</p>}
    </aside>
  );
  if (sel === 'yo') {
    const pedir = () => { const t = pedido.current?.value.trim(); if (!t) return pedido.current?.focus(); enviarAlAgente(t); };
    return (
      <aside className="of-panel of-vidrio">
        <CabPanel titulo="Tu mesa" sub="Pide lo que necesites: el Agente lo deriva a quien corresponde" cerrar={cerrar} />
        <label className="of-lbl" htmlFor="ofPide">¿Qué necesitas?</label>
        <textarea id="ofPide" ref={pedido} className="of-campo" placeholder="Ej.: capté un depto en Ñuñoa, 2D 1B, 120 millones…" />
        <div className="of-bts"><button className="of-bt" id="ofPedir" onClick={pedir}>Pedírselo al Agente</button></div>
        <p className="of-vacio">{d.wa.activo ? `También desde el celular: escribe el nombre de quien necesitas (Pedro, Juanita, Diego o Fernanda) al ${d.wa.numeroEmpresa}.` : ''}</p>
      </aside>
    );
  }
  const p: IMiembro = POR[sel]; const ts = d.tareas[p.id] || []; const pr = ts[0];
  const tocar = (x: ITareaOficina) => (x.leadId ? abrirLead(x.leadId) : accionPaso(x, alTerminar));
  return (
    <aside className={`of-panel of-vidrio${p.id === 'diego' ? ' izq' : ''}`}>
      <CabPanel img={<img className="of-ava" src={`${IMG}ava_${p.id}.png`} alt="" style={{ background: p.suave }} />} titulo={p.nombre} sub={`${p.area} · ${p.rol}`} cerrar={cerrar} />
      <div className="of-ahora">
        <div className="of-lbl" style={{ color: p.color, padding: 0 }}>Ahora</div>
        <div style={{ fontWeight: 600, marginTop: 2 }}>{pr ? (pr.e === 'esp' ? `Esperando ${pr.quien ? 'a ' + pr.quien : 'a otros'}: ${pr.texto}` : pr.texto) : 'Todo al día por mi lado.'}</div>
      </div>
      <div className="of-lbl">Hoy</div>
      {ts.length ? ts.slice(0, 8).map((x, i) => (
        <div key={i} className="of-tar"><span className={`ic ${x.e}`}>{ESTXT[x.e][0]}</span>
          <span className="tx"><b style={{ fontWeight: 600 }}>{x.texto}</b>
            {(x.titulo || x.cliente || x.d) && <small>{[x.titulo, x.cliente, x.e === 'fail' ? x.d : ''].filter(Boolean).join(' · ')}</small>}</span>
          {x.leadId ? <button data-t={i} onClick={() => tocar(x)}>Abrir</button>
            : x.accion && x.e !== 'esp' ? <button className={x.e === 'fail' ? 'rojo' : ''} data-t={i} onClick={() => tocar(x)}>{x.accion}</button>
              : <span className={`of-tag ${x.e}`}>{ESTXT[x.e][1]}</span>}
        </div>
      )) : <p className="of-vacio">Nada pendiente en mi área. ¡Bien!</p>}
      <div className="of-wa">
        {d.wa.activo
          ? <>Por WhatsApp: escribe «<b>{p.nombre}</b>» al {d.wa.numeroEmpresa} y te atiende {p.nombre === 'Juanita' || p.nombre === 'Fernanda' ? 'ella' : 'él'}; tu conversación con cada uno no se mezcla.</>
          : 'Vincula tu celular (Agente › WhatsApp) y podrás hablarle escribiendo su nombre.'}
      </div>
      <div className="of-bts">
        {d.wa.numeroEmpresa && <button className="of-bt" id="ofWa" onClick={() => abrirUrl(`https://wa.me/${d.wa.numeroEmpresa.replace(/\D/g, '')}?text=${encodeURIComponent(p.nombre)}`)}><SvgWa /> Escribirle por WhatsApp</button>}
        <button className="of-bt sec" id="ofVer" onClick={() => abrirPestana(p.vista)}>{p.verTxt}</button>
      </div>
    </aside>
  );
}

function Dock({ d, sel, luz, elegir, setLuz }: { d: IOficina; sel: TSeleccion; luz: string; elegir: (s: TSeleccion) => void; setLuz: (l: 'dia' | 'tarde' | 'noche') => void }) {
  const NOM = { dia: 'Mañana', tarde: 'Tarde', noche: 'Noche' };
  return (
    <nav className="of-dock" aria-label="Tu equipo">
      {EQUIPO.map((p) => { const n = pendientes(d, p.id).length; return (
        <button key={p.id} className={`of-dk${sel === p.id ? ' on' : ''}`} data-p={p.id} aria-label={`${p.nombre}, ${p.area}${n ? `, ${n} pendientes` : ''}`} onClick={() => elegir(p.id)}>
          <img src={`${IMG}ava_${p.id}.png`} alt="" style={{ background: p.suave }} />{n > 0 && <span className="n" style={{ background: p.color }}>{n}</span>}<span>{p.nombre}</span>
        </button>
      ); })}
      <button className={`of-dk${sel === 'yo' ? ' on' : ''}`} data-p="yo" aria-label="Tu mesa: pedir algo" onClick={() => elegir('yo')}><span className="ic"><SvgMas /></span><span>Pedir algo</span></button>
      <span className="of-sep" aria-hidden="true" />
      <div className="of-luz" role="group" aria-label="Luz de la oficina">
        {(['dia', 'tarde', 'noche'] as const).map((l) => <button key={l} className={luz === l ? 'on' : ''} data-luz={l} aria-label={NOM[l]} title={NOM[l]} onClick={() => setLuz(l)}>{SVG_LUZ[l]}</button>)}
      </div>
    </nav>
  );
}

export default function Oficina() {
  const { datos: d, nombre, error, sel, toca, luz, oficinaGetAll, oficinaElegir, oficinaAlternarToca, oficinaSetLuz } = useOficina();
  const escena = useRef<HTMLDivElement>(null);

  useEffect(() => { oficinaGetAll(); avisarAyuda('inicio'); }, [oficinaGetAll]);
  // los personajes: se vuelven a montar en el lienzo cada vez que cambia la escena (como pintar() antes)
  useEffect(() => { if (d && escena.current) montarLienzoOficina(escena.current, { luz, sel }); }, [d, luz, sel, toca]);

  if (error) return <p className="error">{error}</p>;
  if (!d) return null;
  return (
    <div className={`of l-${luz}`}>
      <Escena d={d} sel={sel} luz={luz} elegir={oficinaElegir} escenaRef={escena} />
      <Cabecera d={d} nombre={nombre} toca={toca} elegir={oficinaElegir} alternarToca={oficinaAlternarToca} />
      <Panel key={String(sel)} d={d} sel={sel} cerrar={() => oficinaElegir(null)} alTerminar={() => { oficinaGetAll(); }} />
      <Dock d={d} sel={sel} luz={luz} elegir={oficinaElegir} setLuz={oficinaSetLuz} />
    </div>
  );
}
