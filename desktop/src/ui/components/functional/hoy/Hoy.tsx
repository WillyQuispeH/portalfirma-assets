// «Hoy»: el inicio en vista de lista. Lo que necesita atención, lo que te toca, lo que espera a otros,
// la agenda del día y el avance de tus negocios. «Vista oficina» vuelve a «La oficina».
//
// La acción de cada paso, «Empezar algo nuevo» y la «luz guía» siguen en src/renderer/etapas.js; se llaman por
// utils/app.ts. Con el kit: Layout (cabecera con 2 botones a la vista y el resto en «⋯»), Kpi, Card, Badge, Boton,
// ItemLista y EstadoVacio. La luz guía (Etapas.luz) busca los <span class="luz"> (data-def: el recomendado) bajo la
// raíz y hace brillar el botón que envuelven. Marcas para las pruebas: hoy-ks, hoy-list, hoy-it (con atencion /
// tetoca / esperando), hoy-tx[data-ver], hoy-ac, [data-acc][data-l], hoy-agenda, hoy-ev, hoy-neg[data-hneg],
// et-segs, #hoyMas, #hoyEsp, #hoyNuevo, #hoyOficina, #hoyActividad y [data-do].
import { useEffect, useRef, type ReactNode } from 'react';
import Layout from '../../ui/Layout';
import Kpi from '../../ui/Kpi';
import Card from '../../ui/Card';
import Badge from '../../ui/Badge';
import Boton from '../../ui/Boton';
import ItemLista from '../../ui/ItemLista';
import EstadoVacio from '../../ui/EstadoVacio';
import { SUAVE, type TTono } from '../../ui/tonos';
import { cx } from '../../../utils/cx';
import { useHoy } from '../../../store/hooks/useHoy.hook';
import {
  abrirActividad, abrirAgenda, abrirFicha, abrirNegocio, abrirOficina, accionPaso, avisarAyuda, empezarAlgoNuevo,
  hayOficina, importarCartera, luzGuia, nuevaPropiedad,
} from '../../../utils/app';
import { IconoEstado, type TEstadoPaso } from './iconos';
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
const TONO_PASO: Record<TEstadoPaso, TTono> = { ok: 'verde', pend: 'amarillo', otro: 'gris', fail: 'rojo', todo: 'gris' };

function Segmentos({ ss }: { ss: IHoySegmento[] }) {
  return <span className="et-segs">{ss.map((s, i) => <span key={i}><i className={s.completa ? 'ok' : s.fail ? 'fail' : ''} style={{ width: `${s.pct}%` }} /></span>)}</span>;
}
const Circulo = ({ e }: { e: TEstadoPaso }) => (
  <span className={cx('tw:grid tw:flex-none tw:place-items-center tw:w-9 tw:h-9 tw:rounded-full', SUAVE[TONO_PASO[e]])}><IconoEstado e={e} /></span>
);
const Titulo = ({ children, tono }: { children: ReactNode; tono?: 'rojo' }) => (
  <h2 className={cx('tw:m-0 tw:mb-2 tw:flex tw:items-center tw:gap-2 tw:text-[12.5px] tw:font-bold tw:uppercase tw:tracking-wider', tono ? 'tw:text-red-softink' : 'tw:text-muted')}>{children}</h2>
);

const abrirItem = (x: { negocioId: string | null; propId: string | null }) => (x.negocioId ? abrirNegocio(x.negocioId) : x.propId && abrirFicha(x.propId));

interface IItemProps { x: IHoyItem; i: number; tipo: IHoyItem['clase']; destacado: boolean; hoy: string; alTerminar: () => void }
function Item({ x, i, tipo, destacado, hoy, alTerminar }: IItemProps) {
  const ic: TEstadoPaso = tipo === 'atencion' ? 'fail' : tipo === 'esperando' ? 'otro' : 'pend';
  const vence = x.vence && tipo !== 'atencion' ? venceTxt(x.vence, hoy) : '';
  return (
    <div className={cx('hoy-it tw:flex tw:flex-wrap tw:items-center tw:gap-x-3 tw:gap-y-2 tw:px-4 tw:py-3 tw:border-0 tw:border-b tw:border-solid tw:border-edge tw:last:border-b-0', tipo)}>
      <Circulo e={ic} />
      <button type="button" className="hoy-tx tw:flex tw:min-w-0 tw:flex-[1_1_260px] tw:flex-col tw:items-start tw:m-0 tw:p-0 tw:border-0 tw:bg-transparent tw:text-left tw:cursor-pointer tw:font-[inherit] tw:text-text tw:hover:[&_b]:text-brand"
        data-ver={i} data-l={tipo} title={`Abrir ${x.codigo}`} onClick={() => abrirItem(x)}>
        <b className="tw:text-sm tw:font-semibold">{x.paso}{tipo === 'esperando' && <span className="tw:font-normal tw:text-muted"> · esperando a {x.quien}</span>}</b>
        <small className="tw:text-xs tw:text-muted">{[x.codigo, x.titulo, x.cliente].filter(Boolean).join(' · ')}</small>
        {tipo === 'atencion' && x.d && <small className="tw:mt-0.5 tw:text-xs tw:text-red-softink">{x.d}</small>}
      </button>
      {vence && <Badge tono={x.hoy ? 'amarillo' : 'gris'} className="hoy-v">{vence}</Badge>}
      {tipo !== 'esperando' && (
        <span className="hoy-ac tw:flex tw:flex-none">
          <span className="luz" {...(destacado ? { 'data-def': '' } : {})}>
            <Boton tamano="sm" variante={tipo === 'atencion' ? 'peligro' : 'principal'} data-acc={i} data-l={tipo} onClick={() => accionPaso(x, alTerminar)}>{x.accion}</Boton>
          </span>
        </span>
      )}
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
    // raiz: la «luz guía» (Etapas.luz) busca aquí los .luz y su .luz[data-def]
    <Layout
      ref={raiz}
      className="hoy"
      migas={[{ texto: 'Inicio', icono: 'home' }]}
      titulo={nombre ? `Hola, ${nombre}` : 'Hoy'}
      subtitulo={<span className="tw:inline-flex tw:flex-wrap tw:items-center tw:gap-2">
        {fecha[0].toUpperCase() + fecha.slice(1)}
        <Badge tono={tranquilo ? 'verde' : 'rojo'} punto>
          {tranquilo
            ? `Todo en orden · ${r.tetoca.length} ${r.tetoca.length === 1 ? 'pendiente' : 'pendientes'} en plazo`
            : `${r.atencion.length} ${r.atencion.length === 1 ? 'cosa necesita' : 'cosas necesitan'} tu atención`}
        </Badge>
      </span>}
      acciones={<>
        {/* a la vista: el principal y «Vista oficina» (volver a la oficina); lo demás va al menú «⋯» */}
        {hayOficina() && <Boton variante="secundario" id="hoyOficina" icono="house" title="Volver a la oficina con tu equipo" onClick={abrirOficina}>Vista oficina</Boton>}
        <Boton id="hoyNuevo" icono="plus" onClick={empezarAlgoNuevo}>Empezar algo nuevo</Boton>
        <Boton variante="secundario" id="hoyActividad" icono="clock" title="Todo lo que pasó en la cartera" onClick={abrirActividad}>Actividad</Boton>
      </>}
      barra={
        <div className="hoy-ks ng-kpis tw:w-full tw:m-0 tw:grid-cols-1 tw:md:grid-cols-3">
          <Kpi icono="check" valor={r.kpis.logrados} texto="logrados esta semana" />
          <Kpi icono="clock" valor={r.kpis.pendientes} texto="pendientes en plazo" />
          <Kpi icono="alert" valor={r.kpis.noLogrados} texto="no logrados" alerta={!!r.kpis.noLogrados} />
        </div>
      }
    >
      {!hayCartera && (
        <Card>
          <EstadoVacio icono="house" titulo="Trae tu cartera" texto="Importa las propiedades que ya tienes en Portalfirma o crea la primera."
            accion={(
              <div className="tw:flex tw:flex-wrap tw:justify-center tw:gap-2">
                <span className="luz" data-def=""><Boton data-do="importar" icono="download" onClick={importarCartera}>Importar desde Portalfirma</Boton></span>
                <span className="luz"><Boton variante="secundario" data-do="nuevaProp" icono="plus" onClick={nuevaPropiedad}>Nueva propiedad</Boton></span>
              </div>
            )} />
        </Card>
      )}

      <div className="tw:grid tw:items-start tw:gap-5 tw:grid-cols-1 tw:xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-5">
          {r.atencion.length > 0 && (
            <section>
              <Titulo tono="rojo">Necesita tu atención</Titulo>
              <Card relleno={false} tono="rojo" className="hoy-list tw:bg-card">
                {r.atencion.map((x, i) => <Item key={`a${i}`} x={x} i={i} tipo="atencion" destacado={i === 0} hoy={r.hoy} alTerminar={recargar} />)}
              </Card>
            </section>
          )}

          <section>
            <Titulo>Te toca a ti{r.tetoca.length > 0 && <Badge tono="lavanda">{r.tetoca.length}</Badge>}</Titulo>
            {r.tetoca.length ? (
              <>
                <Card relleno={false} className="hoy-list">
                  {r.tetoca.slice(0, verTodos ? 99 : MAX).map((x, i) => <Item key={`t${i}`} x={x} i={i} tipo="tetoca" destacado={i === 0 && tranquilo} hoy={r.hoy} alTerminar={recargar} />)}
                </Card>
                {masToca > 0 && <Boton variante="fantasma" tamano="sm" id="hoyMas" className="tw:mt-1" iconoDerecha={verTodos ? 'chevU' : 'chevD'} onClick={hoyAlternarTodos}>{verTodos ? 'Ver menos' : `Ver ${masToca} más`}</Boton>}
              </>
            ) : <Card><EstadoVacio compacto texto="Nada pendiente de tu parte. Lo demás está en manos de otros o ya está logrado." /></Card>}
          </section>

          {r.esperando.length > 0 && (
            <section>
              <Boton variante="fantasma" tamano="sm" id="hoyEsp" aria-expanded={verEsperando} icono={verEsperando ? 'chevD' : 'chevR'} className="tw:mb-2" onClick={hoyAlternarEsperando}>
                Esperando a otros ({r.esperando.length})
              </Boton>
              {verEsperando && <Card relleno={false} className="hoy-list">{r.esperando.map((x, i) => <Item key={`e${i}`} x={x} i={i} tipo="esperando" destacado={false} hoy={r.hoy} alTerminar={recargar} />)}</Card>}
            </section>
          )}
        </div>

        <aside className="tw:flex tw:min-w-0 tw:flex-col tw:gap-5">
          <section>
            <Titulo>Agenda de hoy</Titulo>
            <Card relleno={false} className="hoy-agenda">
              <div className="tw:flex tw:flex-col tw:gap-0.5 tw:p-1.5">
                {eventos.length ? eventos.map((e) => (
                  <ItemLista key={e.id} className="hoy-ev" data-ev="1" alTocar={abrirAgenda}
                    media={<b className="tw:block tw:w-12 tw:text-sm tw:font-bold tw:tabular-nums tw:text-text">{e.hora || '—'}</b>}
                    titulo={e.titulo} detalle={e.lugar || undefined}
                    derecha={e.tipo === 'visita' ? (e.orden?.operacion ? <Badge tono="verde">Con orden</Badge> : <Badge tono="amarillo">Sin orden</Badge>) : undefined} />
                )) : <EstadoVacio compacto className="tw:px-3 tw:py-2" texto="Nada agendado para hoy." />}
              </div>
            </Card>
          </section>
          <section className="tw:flex tw:flex-col tw:gap-2">
            <Titulo>Tus negocios ({r.negocios.length})</Titulo>
            {r.negocios.length ? r.negocios.map((n, i) => (
              <span key={i} className="luz blk">
                <button type="button" className="hoy-neg tw:flex tw:w-full tw:flex-col tw:gap-1.5 tw:m-0 tw:p-3.5 tw:text-left tw:cursor-pointer tw:font-[inherit] tw:text-text tw:bg-card tw:rounded-2xl tw:border tw:border-solid tw:border-edge tw:border-b-[3px] tw:border-b-edge-b tw:transition-shadow tw:hover:shadow-md"
                  data-hneg={i} onClick={() => abrirItem(n)}>
                  <span className="tw:flex tw:w-full tw:items-center tw:gap-2"><small className="tw:flex-1 tw:text-xs tw:text-muted">{n.codigo} · {n.op}</small><Badge tono={TONO_NEG[n.estado]}>{ESTADO_NEG[n.estado]}</Badge></span>
                  <b className="tw:text-sm tw:font-semibold">{n.titulo}</b>
                  <small className="tw:-mt-1 tw:text-xs tw:text-muted">{[n.cliente, n.etapa].filter(Boolean).join(' · ')}</small>
                  <Segmentos ss={n.segs} />
                </button>
              </span>
            )) : <Card><EstadoVacio compacto texto="Cuando tengas propiedades en captación o negocios abiertos, aparecen aquí con su avance." /></Card>}
          </section>
        </aside>
      </div>
    </Layout>
  );
}
