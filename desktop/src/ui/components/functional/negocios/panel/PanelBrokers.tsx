// Panel de brokers: la pestaña «Panel» de Negocios. Indicadores del mes, avance hacia la meta, lo que requiere
// atención, facturación de los últimos 6 meses, próximos cierres y el detalle por broker.
// Hecho con el kit (Kpi, Card, Tabs, Badge, Avatar, Boton, ItemLista, EstadoVacio) y los colores de la app; el mes y
// el tipo se eligen en la barra de Negocios (filtros pMes y pTipo del store). Los cálculos están en calculo.ts.
// Roles: el administrador ve a todo el equipo; el corredor, solo lo suyo (ver brokers() en calculo.ts).
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNegocio } from '../../../../store/hooks/useNegocio.hook';
import { usePerfil } from '../../../../store/hooks/usePerfil.hook';
import { useCartera } from '../../../../store/hooks/useCartera.hook';
import { api } from '../../../../utils/api';
import { abrirFicha, abrirNegocio } from '../../../../utils/app';
import { monto, fecha } from '../../../../utils/formato';
import { cx } from '../../../../utils/cx';
import Avatar from '../../../ui/Avatar';
import Badge from '../../../ui/Badge';
import Boton from '../../../ui/Boton';
import Card from '../../../ui/Card';
import EstadoVacio from '../../../ui/EstadoVacio';
import ItemLista from '../../../ui/ItemLista';
import Kpi from '../../../ui/Kpi';
import Tabs from '../../../ui/Tabs';
import type { TTono } from '../../../ui/tonos';
import type { INegocio } from '../../../../store/interfaces/negocio.interface';
import {
  CATEGORIAS, EQUIPO, avance, brokers as armarBrokers, captaciones, cifras, cobradaEn, comisionPesos, conIva, dias,
  estadoNegocio, etapasDe, foco, hace, historial, meses, metaDe, millones, ordenarPendientes, pendientesDe, pesos, porCerrar,
  porcentaje, vigentes, type IMes, type IPendiente, type TCategoria, type TEstadoNegocio, type TMetas, type TOrden,
} from './calculo';

const TONO_ESTADO: Record<TEstadoNegocio, TTono> = { Cobrado: 'verde', Ganado: 'azul', 'Por cerrar': 'amarillo', 'En curso': 'gris', Perdido: 'gris' };
const TONO_CAT: Record<TCategoria, TTono> = { Documentos: 'lavanda', Marketing: 'azul', Seguimiento: 'durazno', Cierre: 'verde' };

/** barra de avance: riel hundido y relleno de la marca (verde al cumplir), como la de captación de la Cartera */
function Barra({ pct, alto = 'tw:h-2', verde = false, etiqueta }: { pct: number; alto?: string; verde?: boolean; etiqueta?: string }) {
  return (
    <span className={cx('tw:block tw:min-w-0 tw:grow tw:overflow-hidden tw:rounded-full tw:bg-edge', alto)}
      role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={etiqueta}>
      <i className={cx('tw:block tw:h-full tw:rounded-full', verde ? 'tw:bg-green-edge' : 'tw:bg-brand')} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </span>
  );
}

/** dato con rótulo chico arriba (cifras de un broker o de un negocio) */
const Dato = ({ rotulo, children, className }: { rotulo: string; children: ReactNode; className?: string }) => (
  <div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-0.5">
    <small className="tw:text-[11px] tw:font-semibold tw:uppercase tw:tracking-wide tw:text-muted">{rotulo}</small>
    <b className={cx('tw:font-bold tw:tabular-nums', className)}>{children}</b>
  </div>
);

export default function PanelBrokers() {
  const { negocios, etapas, filtros: f } = useNegocio();
  const { perfil, esAdmin, perfilGet } = usePerfil();
  const { propiedades, captaciones: caps, cargado: carteraLista, carteraGetAll } = useCartera();
  const [uf, setUf] = useState<number | null>(null);
  const [metas, setMetas] = useState<TMetas>({});
  const [orden, setOrden] = useState<TOrden>('proy');
  const [cat, setCat] = useState<'Todos' | TCategoria>('Todos');
  const [verPend, setVerPend] = useState(false);
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const [detalle, setDetalle] = useState<Record<string, boolean>>({});

  useEffect(() => {
    perfilGet();
    if (!carteraLista) carteraGetAll();
    api<number | null>('ufHoy').then(setUf).catch(() => setUf(null));
    api<TMetas>('metasGet').then(setMetas).catch(() => setMetas({}));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- solo al montar

  const lista = useMemo(() => meses(6), []);
  const mes = (lista.find((m) => m.id === f.pMes) || lista[lista.length - 1]) as IMes;
  const tipo = f.pTipo;
  const delTipo = useMemo(() => negocios.filter((n) => tipo === 'todos' || n.tipo === tipo), [negocios, tipo]);
  const equipo = useMemo(() => armarBrokers(delTipo, perfil), [delTipo, perfil]);
  const conMeta = equipo.filter((b) => b.id !== 'sin');
  const sumaMeta = (k: 'facturacion' | 'captacion') => conMeta.reduce((a, b) => a + metaDe(metas, b.id, k), 0);
  const total = cifras(delTipo, mes, uf, sumaMeta('facturacion'));
  const graf = historial(delTipo, lista, uf);

  const capTotal = esAdmin ? captaciones(propiedades, caps, mes) : captaciones(propiedades, caps, mes, equipo[0]?.id);
  const capMeta = sumaMeta('captacion');
  const diaHoy = new Date().getDate();
  const diasMes = new Date(Number(mes.id.slice(0, 4)), Number(mes.id.slice(5, 7)), 0).getDate();
  const ritmo = (meta: number) => Math.round((meta * diaHoy) / diasMes);

  const pendientes = useMemo(() => ordenarPendientes(delTipo.flatMap((n) => pendientesDe(n))), [delTipo]);
  const porId = useMemo(() => new Map(negocios.map((n) => [n.id, n])), [negocios]);
  const nombreDe = (n: INegocio) => equipo.find((b) => b.id === (n.corredorId || 'sin'))?.nombre || n.corredor || 'Sin asignar';
  const urgentes = pendientes.filter((p) => p.urgente).length;
  const proximos = delTipo.filter(porCerrar).sort((a, b) => String(a.cierreEstimado).localeCompare(String(b.cierreEstimado))).slice(0, 6);
  const sinFecha = delTipo.filter((n) => n.estado === 'abierto' && !n.cierreEstimado).length;

  const filas = equipo.map((b) => {
    const c = cifras(b.negocios, mes, uf, metaDe(metas, b.id, 'facturacion'));
    return { b, c, pm: porcentaje(mes.enCurso ? c.proyeccion : c.ganado, c.meta) };
  }).sort((x, y) => (orden === 'nombre' ? x.b.nombre.localeCompare(y.b.nombre, 'es') : orden === 'meta' ? y.pm - x.pm : y.c.proyeccion - x.c.proyeccion));
  const todosAbiertos = filas.length > 0 && filas.every((x) => abiertos[x.b.id]);

  const escala = Math.max(1, ...graf.map((g) => g.ganado + (g.mes.enCurso ? g.porCerrar : 0))) * 1.1;
  const escalaMeta = Math.max(total.meta, total.proyeccion, total.ganado) * 1.1 || 1;
  const enMeta = (v: number) => `${(v / escalaMeta) * 100}%`;
  const pctMes = porcentaje(mes.enCurso ? total.proyeccion : total.ganado, total.meta);

  return (
    <div className="tw:flex tw:flex-col tw:gap-4" data-panel-brokers>
      <div className="ng-kpis">
        <Kpi icono="check" tono="verde" valor={pesos(total.ganado)} texto={`ganado en ${mes.largo.toLowerCase()} · con IVA ${pesos(conIva(total.ganado))}`} />
        <Kpi icono="coins" tono="amarillo" valor={pesos(total.cobrado)} texto={`comisión cobrada · con IVA ${pesos(conIva(total.cobrado))}`} />
        <Kpi icono="chart" tono="azul" valor={pesos(mes.enCurso ? total.proyeccion : total.ganado)} texto={mes.enCurso ? 'proyección de cierre' : 'cierre del mes'} />
        <Kpi icono="briefcase" tono="lavanda" valor={total.meta ? pesos(total.meta) : 'Sin definir'} texto="meta de facturación" />
        <Kpi icono="clock" tono="durazno" valor={mes.enCurso ? total.activos : total.cerradosMes} texto={mes.enCurso ? `negocios activos · ${urgentes} urgentes` : 'negocios cerrados'} alerta={mes.enCurso && urgentes > 0} />
      </div>
      <p role="status" className="tw:m-0 tw:text-xs tw:text-muted">
        Comisiones sin IVA (el «con IVA» suma 19%).
        {total.sinConvertir > 0 && <> {total.sinConvertir} {total.sinConvertir === 1 ? 'negocio no se pudo' : 'negocios no se pudieron'} pasar a pesos{uf ? ' (están en dólares)' : ' (falta el valor de la UF de hoy)'}.</>}
        {sinFecha > 0 && <> {sinFecha} {sinFecha === 1 ? 'negocio abierto no tiene' : 'negocios abiertos no tienen'} fecha de cierre estimada: no {sinFecha === 1 ? 'entra' : 'entran'} en la proyección.</>}
        {!total.meta && (esAdmin ? ' Define las metas en Configuración › Metas.' : ' El administrador aún no define tus metas.')}
      </p>

      <Card titulo={esAdmin ? 'Avance hacia la meta de la empresa' : 'Avance hacia tu meta'}
        subtitulo={`${mes.largo}${mes.enCurso ? ` · día ${diaHoy} de ${diasMes}` : ' · mes cerrado'}`}
        accion={total.meta > 0 && <Badge tono={pctMes >= 100 ? 'verde' : 'azul'}>{mes.enCurso ? `Proyecta ${pctMes}% de la meta` : `Cerró en ${pctMes}% de la meta`}</Badge>}>
        <div className="tw:relative tw:mt-6 tw:h-3 tw:rounded-full tw:bg-sunken">
          {mes.enCurso && <i className="tw:absolute tw:inset-y-0 tw:left-0 tw:rounded-full tw:bg-brand tw:opacity-30" style={{ width: enMeta(total.proyeccion) }} />}
          <i className="tw:absolute tw:inset-y-0 tw:left-0 tw:rounded-full tw:bg-brand" style={{ width: enMeta(total.ganado) }} />
          <i className="tw:absolute tw:-inset-y-1.5 tw:w-0.5 tw:bg-text" style={{ left: enMeta(total.meta) }} />
          <small className="tw:absolute tw:-top-6 tw:-translate-x-1/2 tw:whitespace-nowrap tw:text-[11px] tw:font-bold" style={{ left: enMeta(total.meta) }}>Meta {millones(total.meta)}</small>
        </div>
        <div className="tw:mt-3 tw:flex tw:flex-wrap tw:gap-x-5 tw:gap-y-1 tw:text-[13px] tw:text-muted">
          <span className="tw:inline-flex tw:items-center tw:gap-1.5"><i className="tw:size-2.5 tw:rounded-sm tw:bg-brand" />Ganado <b className="tw:text-text">{millones(total.ganado)}</b></span>
          {mes.enCurso && <span className="tw:inline-flex tw:items-center tw:gap-1.5"><i className="tw:size-2.5 tw:rounded-sm tw:bg-brand tw:opacity-30" />Proyectado <b className="tw:text-text">{millones(total.proyeccion)}</b></span>}
          <span className="tw:inline-flex tw:items-center tw:gap-1.5"><i className="tw:size-2.5 tw:rounded-sm tw:bg-green-edge" />Cobrado <b className="tw:text-text">{millones(total.cobrado)}</b></span>
          {total.meta > 0 && <span className="tw:inline-flex tw:items-center tw:gap-1.5"><i className="tw:h-3 tw:w-0.5 tw:bg-text" />Meta <b className="tw:text-text">{millones(total.meta)}</b></span>}
        </div>
        <div className="tw:mt-4 tw:flex tw:flex-col tw:gap-2 tw:border-0 tw:border-t tw:border-solid tw:border-edge tw:pt-4">
          <div className="tw:flex tw:flex-wrap tw:items-baseline tw:justify-between tw:gap-2 tw:text-[13px]">
            <b>{esAdmin ? 'Captaciones de la empresa' : 'Tus captaciones'}</b>
            <span className="tw:text-muted"><b className="tw:text-text">{capMeta ? `${capTotal} / ${capMeta}` : capTotal}</b> propiedades{!capMeta ? ' · sin meta definida' : capTotal >= capMeta ? ' · meta cumplida'
              : mes.enCurso ? ` · faltan ${capMeta - capTotal} · ritmo esperado al día ${diaHoy}: ${ritmo(capMeta)}` : ` · faltaron ${capMeta - capTotal}`}</span>
          </div>
          {capMeta > 0 && <Barra pct={(capTotal / capMeta) * 100} alto="tw:h-1.5" verde={capTotal >= capMeta} etiqueta="Captaciones del mes" />}
        </div>
      </Card>

      <Card titulo="Requiere atención"
        subtitulo={pendientes.length
          ? `${pendientes.length} ${pendientes.length === 1 ? 'tarea pendiente' : 'tareas pendientes'} en ${new Set(pendientes.map((p) => p.negocioId)).size} negocios · las urgentes primero`
          : 'Nada pendiente: todos los negocios están al día.'}
        accion={pendientes.length > 0 && (
          <Boton id="pnbVerPend" variante="secundario" tamano="sm" iconoDerecha={verPend ? 'chevU' : 'chevD'} aria-expanded={verPend} onClick={() => setVerPend(!verPend)}>
            {verPend ? 'Ocultar' : 'Ver pendientes'}
          </Boton>
        )}>
        {verPend && pendientes.length > 0 && (
          <div className="tw:flex tw:flex-col tw:gap-3">
            <Tabs etiqueta="Categoría" valor={cat} alCambiar={setCat} className="tw:self-start"
              opciones={(['Todos', ...CATEGORIAS] as ('Todos' | TCategoria)[]).map((c) => [c, c, c === 'Todos' ? pendientes.length : pendientes.filter((p) => p.cat === c).length])} />
            <div className="pnb-pendientes tw:grid tw:grid-cols-[repeat(auto-fill,minmax(260px,1fr))] tw:gap-3">
              {pendientes.filter((p) => cat === 'Todos' || p.cat === cat).map((p, i) => (
                <Pendiente key={p.negocioId + i} p={p} n={porId.get(p.negocioId)} broker={nombreDe} />
              ))}
            </div>
          </div>
        )}
      </Card>

      <div className="tw:grid tw:grid-cols-[repeat(auto-fit,minmax(320px,1fr))] tw:gap-4">
        <Card titulo="Facturación mensual" subtitulo={`Comisión ganada, últimos 6 meses · ${lista[lista.length - 1].corto.toLowerCase()} incluye lo que se espera cerrar`}>
          <div className="tw:flex tw:h-[200px] tw:items-end tw:gap-3" role="img" aria-label={graf.map((g) => `${g.mes.largo}: ${pesos(g.ganado)}`).join(', ')}>
            {graf.map((g) => {
              const activo = g.mes.id === mes.id; const extra = g.mes.enCurso ? g.porCerrar : 0;
              return (
                <div key={g.mes.id} className="tw:group tw:flex tw:h-full tw:min-w-0 tw:flex-1 tw:flex-col tw:items-center tw:justify-end tw:gap-1.5"
                  title={`${g.mes.largo}: ganado ${pesos(g.ganado)} · cobrado ${pesos(g.cobrado)}${extra ? ` · por cerrar ${pesos(extra)}` : ''}`}>
                  <small className="tw:whitespace-nowrap tw:text-[11px] tw:font-bold tw:text-muted">{millones(g.ganado + extra)}</small>
                  <span className="tw:flex tw:w-full tw:max-w-[46px] tw:flex-col">
                    {extra > 0 && <i className={cx('tw:block tw:rounded-t-md tw:border-2 tw:border-b-0 tw:border-dashed', activo ? 'tw:border-brand tw:bg-brand-soft' : 'tw:border-edge-b')} style={{ height: `${(extra / escala) * 150}px` }} />}
                    <i className={cx('tw:block tw:group-hover:opacity-85', extra ? 'tw:rounded-b-md' : 'tw:rounded-md', activo ? 'tw:bg-brand' : 'tw:bg-edge-b')}
                      style={{ height: `${Math.max(2, (g.ganado / escala) * 150)}px` }} />
                  </span>
                  <small className={cx('tw:text-xs', activo ? 'tw:font-bold tw:text-text' : 'tw:text-muted')}>{g.mes.corto}</small>
                </div>
              );
            })}
          </div>
        </Card>
        <Card titulo="Próximos cierres" subtitulo="Negocios abiertos con fecha de cierre estimada">
          {proximos.length
            ? <div className="tw:flex tw:flex-col">{proximos.map((n) => (
                <ItemLista key={n.id} titulo={n.prop?.titulo || n.titulo} detalle={`${nombreDe(n)} · ${comisionTexto(n, uf)}`}
                  derecha={<Badge tono="amarillo">{fecha(n.cierreEstimado)}</Badge>} alTocar={() => abrirNegocio(n.id)} />
              ))}</div>
            : <EstadoVacio compacto texto="Ningún negocio abierto tiene fecha de cierre estimada. Defínela en las condiciones de cada negocio." />}
        </Card>
      </div>

      <section className="pnb-brokers tw:flex tw:flex-col tw:gap-3" aria-label={EQUIPO.plural}>
        <div className="tw:flex tw:flex-wrap tw:items-end tw:justify-between tw:gap-3">
          <div>
            <h2 className="tw:m-0 tw:text-xl tw:font-bold">{esAdmin ? EQUIPO.plural : 'Tus negocios'}</h2>
            <p className="tw:m-0 tw:mt-1 tw:text-[13px] tw:text-muted">{esAdmin ? `${conMeta.length} ${conMeta.length === 1 ? EQUIPO.una : EQUIPO.plural.toLowerCase()} · ` : ''}{total.activos} negocios activos · {total.cerradosMes} cerrados en {mes.largo.toLowerCase()}</p>
          </div>
          {esAdmin && filas.length > 1 && (
            <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
              <Tabs etiqueta={`Ordenar ${EQUIPO.plural.toLowerCase()}`} valor={orden} alCambiar={setOrden} opciones={[['proy', 'Proyección'], ['meta', '% de meta'], ['nombre', 'Nombre']]} />
              <Boton variante="secundario" tamano="sm" onClick={() => setAbiertos(todosAbiertos ? {} : Object.fromEntries(filas.map((x) => [x.b.id, true])))}>
                {todosAbiertos ? 'Contraer todos' : 'Expandir todos'}
              </Boton>
            </div>
          )}
        </div>

        {filas.map(({ b, c, pm }) => {
          const abierto = abiertos[b.id] ?? !esAdmin; // el corredor ve sus negocios desplegados
          const deals = vigentes(b.negocios, mes, tipo);
          const pend = b.negocios.flatMap((n) => pendientesDe(n));
          const cap = captaciones(propiedades, caps, mes, b.id); const capMetaB = metaDe(metas, b.id, 'captacion'); const capOk = capMetaB > 0 && cap >= capMetaB;
          const capTono: [string, TTono] = !capMetaB ? ['Sin meta', 'gris'] : capOk ? ['Meta cumplida', 'verde'] : !mes.enCurso ? ['No cumplida', 'rojo'] : cap >= ritmo(capMetaB) ? ['Al ritmo esperado', 'azul'] : ['Bajo el ritmo', 'amarillo'];
          return (
            <Card key={b.id} relleno={false} className="pnb-broker">
              <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-5 tw:px-5 tw:pt-4 tw:pb-3">
                <div className="tw:flex tw:min-w-0 tw:flex-[1_1_220px] tw:items-center tw:gap-3">
                  <Avatar nombre={b.nombre} tamano="lg" />
                  <div className="tw:min-w-0">
                    <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
                      <b className="tw:text-base tw:font-bold">{b.nombre}</b>
                      {pend.length > 0 && <Badge tono={pend.some((p) => p.urgente) ? 'rojo' : 'gris'}>{pend.length} {pend.length === 1 ? 'pendiente' : 'pendientes'}</Badge>}
                    </div>
                    <small className="tw:block tw:truncate tw:text-xs tw:text-muted">{foco(b.negocios)}</small>
                  </div>
                </div>
                <div className="tw:grid tw:min-w-0 tw:flex-[999_1_520px] tw:grid-cols-[repeat(auto-fit,minmax(100px,1fr))] tw:gap-4">
                  <Dato rotulo="Ganado">{pesos(c.ganado)}</Dato>
                  <Dato rotulo="Cobrado">{pesos(c.cobrado)}</Dato>
                  <Dato rotulo={mes.enCurso ? 'Proyección' : 'Resultado'} className="tw:text-brand">{pesos(mes.enCurso ? c.proyeccion : c.ganado)}</Dato>
                  <Dato rotulo="Meta">{c.meta ? pesos(c.meta) : 'Sin definir'}</Dato>
                  <Dato rotulo="Activos / cerrados">{c.activos} / {c.cerradosMes}</Dato>
                </div>
                <Boton variante="fantasma" tamano="sm" icono={abierto ? 'chevU' : 'chevD'} aria-expanded={abierto} className="pnb-abrir"
                  aria-label={`${abierto ? 'Contraer' : 'Ver'} negocios de ${b.nombre}`} onClick={() => setAbiertos({ ...abiertos, [b.id]: !abierto })} />
              </div>
              {c.meta > 0 && (
                <div className="tw:flex tw:items-center tw:gap-3 tw:px-5 tw:pb-4">
                  <Barra pct={pm} verde={pm >= 100} etiqueta={`Avance de ${b.nombre} hacia su meta`} />
                  <small className="tw:whitespace-nowrap tw:text-xs tw:font-semibold tw:text-muted">{mes.enCurso ? 'Proyecta' : 'Cerró'} {pm}% de la meta</small>
                </div>
              )}

              {abierto && (
                <div className="tw:border-0 tw:border-t tw:border-solid tw:border-edge tw:bg-sunken tw:px-5 tw:pt-3 tw:pb-2">
                  {b.id !== 'sin' && (
                    <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-x-3 tw:gap-y-2 tw:border-0 tw:border-b tw:border-solid tw:border-edge tw:pb-3 tw:text-[13px]">
                      <b>Meta de captación</b>
                      <span className="tw:grid tw:min-w-[140px] tw:flex-[1_1_200px] tw:gap-0.5" style={{ gridTemplateColumns: `repeat(${Math.max(1, capMetaB || cap || 1)}, minmax(0, 1fr))` }} role="img" aria-label={`${cap} de ${capMetaB} propiedades captadas`}>
                        {Array.from({ length: Math.max(1, capMetaB || cap || 1) }, (_, k) => (
                          <i key={k} className={cx('tw:h-1.5 tw:rounded-sm', k < cap ? (capOk ? 'tw:bg-green-edge' : 'tw:bg-brand') : 'tw:bg-card')} />
                        ))}
                      </span>
                      <b className="tw:tabular-nums">{capMetaB ? `${cap} / ${capMetaB}` : cap}</b>
                      <Badge tono={capTono[1]}>{capTono[0]}</Badge>
                    </div>
                  )}
                  <div className="tw:flex tw:flex-wrap tw:items-baseline tw:justify-between tw:gap-2 tw:pt-3 tw:text-[13px]">
                    <b>Negocios de {b.nombre}</b>
                    <small className="tw:text-muted">{deals.length} {deals.length === 1 ? 'negocio' : 'negocios'} · en curso y cerrados en {mes.largo.toLowerCase()}</small>
                  </div>
                  {!deals.length && <EstadoVacio compacto className="tw:py-3" texto="No hay negocios de este tipo." />}
                  {deals.map((n) => (
                    <Negocio key={n.id} n={n} uf={uf} broker={b.nombre} etapas={etapasDe(n, etapas).map((e) => e.t)}
                      abierto={!!detalle[n.id]} alternar={() => setDetalle({ ...detalle, [n.id]: !detalle[n.id] })} />
                  ))}
                </div>
              )}
            </Card>
          );
        })}
        {!filas.length && <Card><EstadoVacio icono="briefcase" texto="Todavía no hay negocios ni corredores para mostrar." /></Card>}
      </section>
    </div>
  );
}

function comisionTexto(n: INegocio, uf: number | null) {
  const c = comisionPesos(n, uf);
  if (c) return pesos(c);
  return n.comisionMonto ? monto(n.comisionMonto, n.valor?.moneda) : 'sin comisión';
}

function Pendiente({ p, n, broker }: { p: IPendiente; n?: INegocio; broker: (n: INegocio) => string }) {
  if (!n) return null;
  return (
    <button type="button" onClick={() => abrirNegocio(n.id)}
      className={cx('tw:flex tw:cursor-pointer tw:flex-col tw:gap-2 tw:rounded-card tw:border tw:border-solid tw:border-b-[3px] tw:p-4 tw:text-left tw:font-[inherit] tw:text-text tw:hover:border-brand',
        p.urgente ? 'tw:border-red-edge tw:bg-red-soft' : 'tw:border-edge tw:border-b-edge-b tw:bg-card')}>
      <span className="tw:flex tw:items-center tw:justify-between tw:gap-2">
        <Badge tono={TONO_CAT[p.cat]} punto>{p.cat}</Badge>
        {p.urgente ? <Badge tono="rojo" variante="tactil">Urgente</Badge> : <Badge>Pendiente</Badge>}
      </span>
      <b className="tw:text-[15px] tw:leading-snug">{p.tarea}</b>
      <span>
        <b className="tw:block tw:text-[13px] tw:font-semibold">{n.prop?.titulo || n.titulo}{n.prop?.comuna ? ` · ${n.prop.comuna}` : ''}</b>
        <small className="tw:text-xs tw:text-muted">{p.detalle}</small>
      </span>
      <span className="tw:mt-auto tw:flex tw:items-center tw:justify-between tw:gap-2 tw:border-0 tw:border-t tw:border-dashed tw:border-edge tw:pt-2 tw:text-xs tw:text-muted">
        <span className="tw:truncate"><b className="tw:text-text">{broker(n)}</b> · {n.etapaInfo?.t}</span>
        <b className="tw:whitespace-nowrap">{hace(p.dias)}</b>
      </span>
    </button>
  );
}

function Negocio({ n, uf, broker, etapas, abierto, alternar }: {
  n: INegocio; uf: number | null; broker: string; etapas: string[]; abierto: boolean; alternar: () => void;
}) {
  const est = estadoNegocio(n);
  const pct = avance(n);
  const pend = pendientesDe(n);
  const listo = n.estado === 'ganado';
  const orden = listo ? etapas.length - 1 : n.orden ?? 0;
  return (
    <div className="pnb-negocio tw:flex tw:flex-col tw:gap-3 tw:border-0 tw:border-t tw:border-solid tw:border-edge tw:py-4">
      <div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-4">
        <div className="tw:min-w-0 tw:flex-[1_1_260px]">
          <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
            <b className="tw:text-[15px]">{n.prop?.titulo || n.titulo}</b>
            <Badge tono={n.tipo === 'venta' ? 'azul' : 'lavanda'}>{n.tipo === 'venta' ? 'Venta' : 'Arriendo'}</Badge>
          </div>
          <small className="tw:text-xs tw:text-muted">{[n.prop?.comuna, n.valor ? monto(n.valor.valor, n.valor.moneda) : null, n.cliente?.nombre].filter(Boolean).join(' · ')}</small>
        </div>
        <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-5 tw:text-sm">
          <Dato rotulo="Comisión + IVA">{comisionTexto(n, uf)}</Dato>
          <Dato rotulo={listo ? 'Cierre' : 'Cierre est.'}>{listo ? fecha(n.cierre) : n.cierreEstimado ? fecha(n.cierreEstimado) : '—'}</Dato>
          <Dato rotulo="Cobrada">{cobradaEn(n) ? fecha(cobradaEn(n)) : 'Pendiente'}</Dato>
          <Badge tono={TONO_ESTADO[est]}>{est}</Badge>
        </div>
      </div>
      <div>
        <div className="tw:flex tw:items-center tw:gap-3">
          <Barra pct={pct} alto="tw:h-2.5" verde={listo} etiqueta="Avance del negocio" />
          <b className="tw:min-w-11 tw:text-right tw:text-sm tw:tabular-nums">{pct}%</b>
        </div>
        <div className="tw:mt-1.5 tw:grid tw:gap-1.5 tw:pr-14" style={{ gridTemplateColumns: `repeat(${Math.max(1, etapas.length)}, minmax(0, 1fr))` }}>
          {etapas.map((t, i) => (
            <small key={t + i} className={cx('tw:text-[11px] tw:leading-tight',
              i === orden ? cx('tw:font-bold', listo ? 'tw:text-green-softink' : 'tw:text-brand') : i < orden ? 'tw:font-semibold tw:text-text' : 'tw:text-muted')}>{t}</small>
          ))}
        </div>
      </div>
      <div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2">
        <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
          <small className="tw:text-xs tw:text-muted">Última actividad: {hace(dias(n.actualizado || n.creado)).toLowerCase()}</small>
          {pend.map((p, i) => <Badge key={i} ajustar tono={p.urgente ? 'rojo' : 'gris'}>{p.tarea}</Badge>)}
        </div>
        <Boton variante="secundario" tamano="sm" iconoDerecha={abierto ? 'chevU' : 'chevD'} aria-expanded={abierto} className="pnb-ver" onClick={alternar}>
          {abierto ? 'Ocultar detalle' : 'Ver detalle'}
        </Boton>
      </div>
      {abierto && (
        <div className="pnb-detalle tw:flex tw:flex-col tw:gap-4 tw:rounded-card tw:border tw:border-solid tw:border-edge tw:bg-card tw:p-4">
          <div className="tw:grid tw:grid-cols-[repeat(auto-fit,minmax(180px,1fr))] tw:gap-4 tw:text-[13px]">
            <Dato rotulo="Próxima acción">{n.proximaAccion?.texto || n.siguiente || '—'}</Dato>
            <Dato rotulo="Etapa actual">{n.etapaInfo?.t || (listo ? 'Cerrado' : '—')} · paso {orden + 1} de {etapas.length}</Dato>
            <Dato rotulo="Responsable">{broker}</Dato>
            <Dato rotulo="Valor de la propiedad">{n.valor ? monto(n.valor.valor, n.valor.moneda) : '—'}</Dato>
          </div>
          <div className="tw:flex tw:flex-wrap tw:justify-end tw:gap-2">
            {n.prop && <Boton variante="secundario" tamano="sm" icono="house" onClick={() => abrirFicha(n.prop!.id)}>Ver la propiedad</Boton>}
            <Boton tamano="sm" icono="briefcase" onClick={() => abrirNegocio(n.id)}>Abrir el negocio</Boton>
          </div>
        </div>
      )}
    </div>
  );
}
