// «Hoy»: el inicio en vista de lista. Lo que necesita atención, lo que te toca, lo que espera a otros,
// la agenda del día y el avance de tus negocios.
//
// La acción de cada paso, «Empezar algo nuevo» y la «luz guía» de los botones siguen en
// src/renderer/etapas.js; se llaman por utils/app.ts. Los id hoy* los usan las pruebas (oficina, etapas).
// Armada con Layout (cabecera, orden y espaciado) y el kit (Badge, Boton, EstadoVacio). El fondo sigue siendo la foto
// desenfocada (.hoy-bg) y los botones .gl dentro de <span class="luz"> (con data-def el recomendado) se mantienen:
// Etapas.luz() los busca bajo la raíz. Las tarjetas de vidrio (.gl-card, .hoy-*) son el diseño propio de esta pantalla.
import { useEffect, useRef } from 'react';
import Icono from '../../ui/Icono';
import Layout from '../../ui/Layout';
import Badge from '../../ui/Badge';
import Boton from '../../ui/Boton';
import EstadoVacio from '../../ui/EstadoVacio';
import type { TTono } from '../../ui/tonos';
import { useHoy } from '../../../store/hooks/useHoy.hook';
import {
  abrirActividad, abrirAgenda, abrirFicha, abrirNegocio, abrirOficina, accionPaso, avisarAyuda, empezarAlgoNuevo,
  hayOficina, importarCartera, luzGuia, nuevaPropiedad,
} from '../../../utils/app';
import { IconoEstado } from './iconos';
import type { IHoyItem, IHoyNegocio, IHoySegmento } from '../../../store/interfaces/hoy.interface';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MAX = 5;
const fdm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;
function venceTxt(v: string | null | undefined, hoy: string) {
  if (!v) return '';
  return v === hoy ? 'Vence hoy' : v < hoy ? `Venció el ${fdm(v)}` : `Plazo: ${fdm(v)}`;
}
const ESTADO_NEG: Record<IHoyNegocio['estado'], string> = { atencion: 'Atención', tetoca: 'Te toca', esperando: 'Esperando', cerrado: 'Cerrado' };
const TONO_NEG: Record<IHoyNegocio['estado'], TTono> = { atencion: 'rojo', tetoca: 'amarillo', esperando: 'gris', cerrado: 'verde' };

function Segmentos({ ss }: { ss: IHoySegmento[] }) {
  return <span className="et-segs">{ss.map((s, i) => <span key={i}><i className={s.completa ? 'ok' : s.fail ? 'fail' : ''} style={{ width: `${s.pct}%` }} /></span>)}</span>;
}

const abrirItem = (x: { negocioId: string | null; propId: string | null }) => (x.negocioId ? abrirNegocio(x.negocioId) : x.propId && abrirFicha(x.propId));

interface IItemProps { x: IHoyItem; i: number; tipo: IHoyItem['clase']; destacado: boolean; hoy: string; alTerminar: () => void }
function Item({ x, i, tipo, destacado, hoy, alTerminar }: IItemProps) {
  const ic = tipo === 'atencion' ? 'fail' : tipo === 'esperando' ? 'otro' : 'pend';
  return (
    <div className={`hoy-it ${tipo}`}>
      <span className={`hoy-ic ${ic}`}><IconoEstado e={ic} /></span>
      <button className="hoy-tx" data-ver={i} data-l={tipo} title={`Abrir ${x.codigo}`} onClick={() => abrirItem(x)}>
        <b>{x.paso}{tipo === 'esperando' && <span className="hoy-q"> · esperando a {x.quien}</span>}</b>
        <small>{[x.codigo, x.titulo, x.cliente].filter(Boolean).join(' · ')}</small>
        {tipo === 'atencion' && x.d && <small className="hoy-d">{x.d}</small>}
      </button>
      <span className={`hoy-v ${x.hoy ? 'hoy' : ''}`}>{x.vence && tipo !== 'atencion' ? venceTxt(x.vence, hoy) : ''}</span>
      <span className="hoy-ac">
        {tipo !== 'esperando' && (
          <span className="luz" {...(destacado ? { 'data-def': '' } : {})}>
            <button className={`gl ${tipo === 'atencion' ? 'rojo' : 'azul'}`} data-acc={i} data-l={tipo} onClick={() => accionPaso(x, alTerminar)}>{x.accion}</button>
          </span>
        )}
      </span>
    </div>
  );
}

export default function Hoy() {
  const { datos: r, eventos, hayCartera, nombre, error, verTodos, verEsperando, hoyGetAll, hoyAlternarTodos, hoyAlternarEsperando } = useHoy();
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => { hoyGetAll(); avisarAyuda('inicio'); }, [hoyGetAll]);
  // la «luz guía» se engancha a los botones .luz cada vez que cambian
  useEffect(() => { if (raiz.current) luzGuia(raiz.current); }, [r, verTodos, verEsperando, eventos]);

  if (error) return <p className="error">{error}</p>;
  if (!r) return null;

  const d = new Date(); const fecha = `${DIAS[d.getDay()]} ${d.getDate()} de ${d.toLocaleString('es-CL', { month: 'long' })}`;
  const tranquilo = !r.atencion.length;
  const masToca = r.tetoca.length - MAX;
  const recargar = () => { hoyGetAll(); };

  return (
    <>
      {/* el fondo es la foto desenfocada (.hoy-bg), en vez del tinte del Layout */}
      <div className="hoy-bg" aria-hidden="true" />
      {/* raiz: la «luz guía» (Etapas.luz) busca aquí los .luz y su .luz[data-def] */}
      <Layout
        ref={raiz}
        fondo={false}
        className="hoy"
        migas={[{ texto: 'Inicio', icono: 'home' }]}
        titulo={nombre ? `Hola, ${nombre}` : 'Hoy'}
        subtitulo={fecha[0].toUpperCase() + fecha.slice(1)}
        acciones={<>
          {hayOficina() && <span className="luz"><button className="gl" id="hoyOficina" onClick={abrirOficina}>Ver la oficina</button></span>}
          <span className="luz"><button className="gl" id="hoyActividad" title="Todo lo que pasó en la cartera" onClick={abrirActividad}><Icono nombre="clock" tam={14} /> Actividad</button></span>
          <span className="luz"><button className="gl" id="hoyNuevo" onClick={empezarAlgoNuevo}><Icono nombre="plus" tam={14} /> Empezar algo nuevo</button></span>
          <Badge tono={tranquilo ? 'verde' : 'rojo'} punto className="tw:h-8 tw:px-3.5 tw:text-[13px]">
            {tranquilo
              ? `Todo en orden · ${r.tetoca.length} ${r.tetoca.length === 1 ? 'pendiente' : 'pendientes'} en plazo`
              : `${r.atencion.length} ${r.atencion.length === 1 ? 'cosa necesita' : 'cosas necesitan'} tu atención`}
          </Badge>
        </>}
      >
        {!hayCartera && (
          <div className="gl-card">
            <EstadoVacio icono="house" titulo="Trae tu cartera" texto="Importa las propiedades que ya tienes en Portalfirma o crea la primera."
              accion={(
                <div className="hoy-bt">
                  <span className="luz" data-def=""><button className="gl azul" data-do="importar" onClick={importarCartera}><Icono nombre="download" tam={15} /> Importar desde Portalfirma</button></span>
                  <span className="luz"><button className="gl" data-do="nuevaProp" onClick={nuevaPropiedad}><Icono nombre="plus" tam={15} /> Nueva propiedad</button></span>
                </div>
              )} />
          </div>
        )}

        <div className="hoy-cols">
          <div className="hoy-main">
            <div className="hoy-ks">
              <div className="gl-card hoy-k"><span className="hoy-ic ok"><IconoEstado e="ok" /></span><div><b>{r.kpis.logrados}</b><small>logrados esta semana</small></div></div>
              <div className="gl-card hoy-k"><span className="hoy-ic pend"><IconoEstado e="pend" /></span><div><b>{r.kpis.pendientes}</b><small>pendientes en plazo</small></div></div>
              <div className={`gl-card hoy-k ${r.kpis.noLogrados ? 'mal' : ''}`}><span className={`hoy-ic ${r.kpis.noLogrados ? 'fail' : 'todo'}`}><IconoEstado e="fail" /></span><div><b>{r.kpis.noLogrados}</b><small>no logrados</small></div></div>
            </div>

            {r.atencion.length > 0 && (
              <section>
                <h2 className="hoy-sec fail">Necesita tu atención</h2>
                <div className="gl-card hoy-list">{r.atencion.map((x, i) => <Item key={`a${i}`} x={x} i={i} tipo="atencion" destacado={i === 0} hoy={r.hoy} alTerminar={recargar} />)}</div>
              </section>
            )}

            <section>
              <h2 className="hoy-sec">Te toca a ti{r.tetoca.length > 0 && <> <Badge className="tw:ml-1 tw:h-5 tw:px-2">{r.tetoca.length}</Badge></>}</h2>
              {r.tetoca.length ? (
                <>
                  <div className="gl-card hoy-list">
                    {r.tetoca.slice(0, verTodos ? 99 : MAX).map((x, i) => <Item key={`t${i}`} x={x} i={i} tipo="tetoca" destacado={i === 0 && tranquilo} hoy={r.hoy} alTerminar={recargar} />)}
                  </div>
                  {masToca > 0 && <Boton variante="fantasma" tamano="sm" id="hoyMas" className="tw:self-start tw:mt-1" onClick={hoyAlternarTodos}>{verTodos ? 'Ver menos' : `Ver ${masToca} más`}</Boton>}
                </>
              ) : <div className="gl-card hoy-nada">Nada pendiente de tu parte. Lo demás está en manos de otros o ya está logrado.</div>}
            </section>

            {r.esperando.length > 0 && (
              <section>
                <button className="hoy-tog" id="hoyEsp" aria-expanded={verEsperando} onClick={hoyAlternarEsperando}>
                  <span className={verEsperando ? 'abierto' : ''}>›</span> Esperando a otros ({r.esperando.length})
                </button>
                {verEsperando && <div className="gl-card hoy-list">{r.esperando.map((x, i) => <Item key={`e${i}`} x={x} i={i} tipo="esperando" destacado={false} hoy={r.hoy} alTerminar={recargar} />)}</div>}
              </section>
            )}
          </div>

          <aside className="hoy-side">
            <h2 className="hoy-sec">Agenda de hoy</h2>
            <div className="gl-card hoy-agenda">
              {eventos.length ? eventos.map((e) => (
                <button key={e.id} className="hoy-ev" data-ev="1" onClick={abrirAgenda}>
                  <b>{e.hora || '—'}</b><span>{e.titulo}<small>{e.lugar || ''}</small></span>
                  {e.tipo === 'visita' && (e.orden?.operacion ? <Badge tono="verde">Con orden</Badge> : <Badge tono="amarillo">Sin orden</Badge>)}
                </button>
              )) : <p className="hoy-nada">Nada agendado para hoy.</p>}
            </div>
            <h2 className="hoy-sec" style={{ marginTop: 8 }}>Tus negocios ({r.negocios.length})</h2>
            {r.negocios.length ? r.negocios.map((n, i) => (
              <span key={i} className="luz blk">
                <button className="gl-card hoy-neg" data-hneg={i} onClick={() => abrirItem(n)}>
                  <span className="hoy-nr"><small>{n.codigo} · {n.op}</small><span className="spacer" /><Badge tono={TONO_NEG[n.estado]}>{ESTADO_NEG[n.estado]}</Badge></span>
                  <b>{n.titulo}</b>
                  <small>{[n.cliente, n.etapa].filter(Boolean).join(' · ')}</small>
                  <Segmentos ss={n.segs} />
                </button>
              </span>
            )) : <div className="gl-card hoy-nada">Cuando tengas propiedades en captación o negocios abiertos, aparecen aquí con su avance.</div>}
          </aside>
        </div>
      </Layout>
    </>
  );
}
