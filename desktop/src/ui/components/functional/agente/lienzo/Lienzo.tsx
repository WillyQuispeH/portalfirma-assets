// El lienzo (columna derecha del Agente a pantalla completa). Los datos los trae controlador.ts; aquí se dibujan con
// el kit: Card, ItemLista, Badge, LineaTiempo, Avatar, EstadoVacio y Boton. Las clases lz-* y los data-* (data-lz,
// data-etapa, data-tarea, data-confev…) los usan las pruebas.
/* eslint-disable @typescript-eslint/no-explicit-any -- datos del proceso principal sin tipos */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Boton from '../../../ui/Boton';
import Badge from '../../../ui/Badge';
import Card from '../../../ui/Card';
import Icono from '../../../ui/Icono';
import Avatar from '../../../ui/Avatar';
import Input from '../../../ui/Input';
import ItemLista, { Miniatura } from '../../../ui/ItemLista';
import LineaTiempo from '../../../ui/LineaTiempo';
import EstadoVacio from '../../../ui/EstadoVacio';
import { cx } from '../../../../utils/cx';
import { toast } from '../../../../utils/app';
import { Ag, Etapas, W, amable, api, dirTxt, estadoFirma, estadoProp, fechaCorta, precio } from '../tarjetas/comun';
import { mostrar, refrescar, useLienzo, type TVista } from './controlador';

const fmtDia = (f: string) => { try { const t = new Date(f + 'T12:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }); return t[0].toUpperCase() + t.slice(1); } catch { return f; } };
const ver = (fn: () => void) => () => { Ag().acoplar(); fn(); };

// ---------- piezas ----------
function Cabeza({ titulo, sub, icono, foto }: { titulo: ReactNode; sub?: ReactNode; icono: string; foto?: string | null }) {
  const inicio = useLienzo((s) => s.ctx.tipo === 'inicio');
  return (
    <div className="lz-h tw:flex tw:flex-col tw:gap-2">
      {!inicio && <Boton variante="fantasma" tamano="sm" className="lz-back tw:self-start tw:-ml-2" data-lz="inicio" icono="chevL" title="Volver a tu día" onClick={() => mostrar({ tipo: 'inicio' })}>Tu día</Boton>}
      <div className="lz-ht tw:flex tw:items-center tw:gap-3">
        {foto !== undefined ? <Miniatura src={foto} icono={icono} tam={48} />
          : <span className="lz-hic tw:grid tw:place-items-center tw:flex-none tw:size-11 tw:rounded-xl tw:bg-lav-soft tw:text-lav-softink"><Icono nombre={icono} tam={20} /></span>}
        <div className="tw:min-w-0"><b className="tw:block tw:text-[17px] tw:leading-tight tw:truncate">{titulo}</b>{sub && <small className="tw:block tw:mt-0.5 tw:text-[13px] tw:text-muted tw:truncate">{sub}</small>}</div>
      </div>
    </div>
  );
}
/** una sección: un Card del kit (sin relleno, para listas que llegan al borde) */
function Seccion({ icono, titulo, cuenta, children, className, relleno = false }: { icono: string; titulo: ReactNode; cuenta?: number; children: ReactNode; className?: string; relleno?: boolean }) {
  return (
    <Card relleno={relleno} className={cx('lz-sec lz-card', className)}
      titulo={<span className="tw:flex tw:items-center tw:gap-2 tw:text-[14px]"><span className="tw:text-muted tw:flex"><Icono nombre={icono} tam={15} /></span>{titulo}</span>}
      accion={!!cuenta && <Badge tono="lavanda">{cuenta}</Badge>}>
      <div className={relleno ? '' : 'tw:p-1.5'}>{children}</div>
    </Card>
  );
}
const Vacio = ({ children }: { children: ReactNode }) => <EstadoVacio compacto className="lz-vacio tw:px-3 tw:py-2" texto={children} />;
const Hora = ({ children }: { children: ReactNode }) => <span className="lz-hr tw:grid tw:place-items-center tw:flex-none tw:min-w-12 tw:h-10 tw:px-1.5 tw:rounded-xl tw:bg-lav-soft tw:text-lav-softink tw:text-[12.5px] tw:font-bold tw:leading-tight tw:text-center">{children}</span>;
const Punto = ({ tono }: { tono: 'bad' | 'wait' }) => <span className={cx('lz-dot', tono, 'tw:block tw:size-2.5 tw:rounded-full', tono === 'bad' ? 'tw:bg-err' : 'tw:bg-yellow-edge')} />;
function Barra({ pct, ok }: { pct: number; ok?: boolean }) {
  return <div className={cx('lz-bar', ok && 'ok', 'tw:flex-1 tw:h-2 tw:rounded-full tw:bg-sunken tw:overflow-hidden')}><i className={cx('tw:block tw:h-full tw:rounded-full', ok ? 'tw:bg-green-edge' : 'tw:bg-brand')} style={{ width: `${pct}%` }} /></div>;
}
function Meta({ texto, pct, ok, derecha }: { texto: ReactNode; pct: number; ok?: boolean; derecha: ReactNode }) {
  return <div className="lz-meta tw:flex tw:items-center tw:gap-3 tw:text-[13px] tw:text-muted"><span className="tw:whitespace-nowrap">{texto}</span><Barra pct={pct} ok={ok} /><b className="tw:text-text">{derecha}</b></div>;
}
const Acciones = ({ children }: { children: ReactNode }) => <div className="lz-acts tw:flex tw:flex-wrap tw:gap-2">{children}</div>;
function B({ k, icono, children, pri, onClick, ...resto }: { k: string; icono: string; children: ReactNode; pri?: boolean; onClick: (b: HTMLButtonElement) => void } & Record<string, unknown>) {
  return <Boton tamano="sm" variante={pri ? 'principal' : 'secundario'} icono={icono} data-lz={k} {...resto} onClick={(e) => onClick(e.currentTarget)}>{children}</Boton>;
}
// un botón que hace algo en el proceso principal: se deshabilita mientras trabaja y avisa si falla
const trabajar = (fn: () => Promise<unknown>) => async (b: HTMLButtonElement) => { b.disabled = true; try { await fn(); } catch (e) { b.disabled = false; toast((e as Error).message, 5000); } };
const moverNegocio = async (n: any, etapa: string, quien: string, festejar: boolean) => {
  const r = await api('assetEjecutar', 'asset_mover_negocio', { negocio: n.id, etapa });
  Ag().decir(`Negocio${quien ? ' de ' + quien : ''} en «${r.negocio.etapa}».${(r.avisos || []).length ? ' ' + r.avisos.join(' ') : ''}`);
  if (festejar) Ag().festejo?.(); W.AssetRefrescar?.(); refrescar();
};
const documento = (propId?: string | null) => (propId ? W.Gestion.documento(propId) : W.Gestion.iniciar({ destino: 'documento' }));
const agendar = (p: any, n: any) => W.Gestion.agendar({ propId: p?.id || n?.propId || null, personaId: n?.clienteId || null, negocioId: n?.id || null });

// ---------- tu día ----------
function Inicio({ v }: { v: Extract<TVista, { tipo: 'inicio' }> }) {
  const kpi = (k: string, icono: string, n: number, t: string, abrir: () => void) => (
    <button type="button" data-ver={k} onClick={ver(abrir)}
      className="tw:flex tw:flex-col tw:items-start tw:gap-1.5 tw:w-full tw:m-0 tw:p-3 tw:text-left tw:rounded-2xl tw:border tw:border-solid tw:border-edge tw:border-b-[3px] tw:border-b-edge-b tw:bg-card tw:cursor-pointer tw:font-[inherit] tw:hover:bg-hover">
      <span className="tw:grid tw:place-items-center tw:size-8 tw:rounded-lg tw:bg-lav-soft tw:text-lav-softink"><Icono nombre={icono} tam={15} /></span>
      <b className="tw:text-xl tw:leading-none">{n}</b><small className="tw:text-xs tw:text-muted tw:leading-tight">{t}</small>
    </button>
  );
  return <>
    <Cabeza titulo="Tu día" sub={fmtDia(v.hoy)} icono="compass" />
    <div className="lz-kpis tw:grid tw:grid-cols-3 tw:gap-2">
      {kpi('cartera', 'house', v.activas, 'propiedades', () => W.Inmo.cartera())}
      {kpi('negocios', 'briefcase', v.abiertos.length, 'negocios abiertos', () => W.Negocios.abrir())}
      {kpi('agenda', 'calendar', v.ev.filter((e) => e.estado === 'programado').length, 'eventos hoy', () => W.Agenda.abrir())}
    </div>
    {v.abiertos.length > 0 && <Meta texto="Avance de tus negocios" pct={v.meta} derecha={`${v.meta}%`} />}
    <Seccion icono="calendar" titulo="Agenda de hoy" cuenta={v.ev.length}>
      {v.ev.length ? <>
        {v.ev.slice(0, 4).map((e) => (
          <ItemLista key={e.id} className="lz-row lz-ag" data-ag={e.fecha} alTocar={() => mostrar({ tipo: 'agenda', fecha: e.fecha })} media={<Hora>{e.hora || '—'}</Hora>}
            titulo={e.titulo} detalle={e.lugar || ''} derecha={e.tipo === 'visita' && (e.orden?.operacion ? <Badge tono="verde">Con orden</Badge> : <Badge tono="amarillo">Sin orden</Badge>)} />
        ))}
        {v.ev.length > 4 && <Boton variante="fantasma" tamano="sm" bloque className="lz-mas" data-ver="agenda" iconoDerecha="chevR" onClick={ver(() => W.Agenda.abrir())}>Ver {v.ev.length - 4} más en la agenda</Boton>}
      </> : <Vacio>Nada agendado para hoy.</Vacio>}
    </Seccion>
    <Seccion icono="briefcase" titulo="Negocios que te necesitan" cuenta={v.urgentes.length}>
      {v.urgentes.length ? v.urgentes.map((n) => (
        <ItemLista key={n.id} className="lz-row" data-neg={n.id} flecha alTocar={() => mostrar({ tipo: 'negocio', id: n.id })} media={<Punto tono={n.vencida ? 'bad' : 'wait'} />}
          titulo={n.titulo} detalle={n.vencida ? 'Acción vencida: ' + (n.proximaAccion?.texto || '') : n.siguiente || ''} />
      )) : <Vacio>{v.abiertos.length ? 'Todo al día.' : 'Aún no hay negocios. Pídele al Agente: «crea un negocio…».'}</Vacio>}
    </Seccion>
    <Seccion icono="sign" titulo="Documentos en firma" cuenta={v.firmas.length}>
      {v.firmas.length ? v.firmas.map((f, i) => (
        <ItemLista key={i} className="lz-row" data-op={f.operacion || ''} data-pid={f.p.id} flecha media={<Punto tono="wait" />}
          alTocar={() => mostrar(f.operacion ? { tipo: 'operacion', op: Number(f.operacion), propId: f.p.id } : { tipo: 'propiedad', id: f.p.id })}
          titulo={f.plantilla} detalle={`${f.p.codigo}${f.operacion ? ' · operación ' + f.operacion : ''}`} />
      )) : <Vacio>No hay documentos esperando firmas.</Vacio>}
    </Seccion>
  </>;
}

// ---------- confirmación en línea (mover de etapa, cerrar como perdido) ----------
type TConf = { tipo: 'etapa'; i: number } | { tipo: 'perdido' } | null;
function Confirmar({ children, si, alNo, alSi }: { children: ReactNode; si: string; alNo: () => void; alSi: (b: HTMLButtonElement) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, []);
  return (
    <div ref={ref} className="lz-conf" id="lzConf">
      <Card tono="amarillo" pie={<div className="tw:flex tw:justify-end tw:gap-2">
        <Boton variante="fantasma" tamano="sm" data-cno onClick={alNo}>No</Boton>
        <Boton tamano="sm" data-csi onClick={(e) => alSi(e.currentTarget)}>{si}</Boton>
      </div>}>
        <div className="tw:flex tw:flex-col tw:gap-2 tw:text-[13.5px] tw:text-text">{children}</div>
      </Card>
    </div>
  );
}

// ---------- propiedad: cómo está y, si tiene negocio, sus etapas aquí mismo ----------
function Pasos({ n, et, conf, setConf }: { n: any; et: any[]; conf: TConf; setConf: (c: TConf) => void }) {
  const tareas = n.etapaInfo?.tareas || []; const f = n.firmas?.[n.etapa]; const firmaOk = f?.estado === 'firmado';
  const e = conf?.tipo === 'etapa' ? et[conf.i] : null; const atras = conf?.tipo === 'etapa' && conf.i < n.orden;
  const tarea = async (i: number, on: boolean, input: HTMLInputElement) => { try { await api('negTarea', n.id, n.etapa, i, on); W.AssetRefrescar?.(); refrescar(); } catch (er) { input.checked = !on; toast((er as Error).message, 4000); } };
  return <>
    <ol className="lz-steps clic tw:flex tw:flex-col tw:gap-0.5 tw:m-0 tw:p-0 tw:list-none">
      {et.map((x, i) => (
        <li key={x.id} className={cx(i < n.orden ? 'hecho' : i === n.orden ? 'ahora' : '')}>
          <button type="button" data-etapa={x.id} data-i={i} disabled={i === n.orden} title={i === n.orden ? 'Etapa actual' : 'Pasar a esta etapa'} onClick={() => setConf({ tipo: 'etapa', i })}
            className={cx('tw:flex tw:items-center tw:gap-3 tw:w-full tw:m-0 tw:px-2.5 tw:py-2 tw:text-left tw:rounded-xl tw:border-0 tw:cursor-pointer tw:font-[inherit] tw:disabled:cursor-default',
              i === n.orden ? 'tw:bg-lav-soft tw:text-lav-softink' : 'tw:bg-transparent tw:text-text tw:hover:bg-hover')}>
            <span className={cx('tw:grid tw:place-items-center tw:flex-none tw:size-6 tw:rounded-full tw:text-xs tw:font-bold', i < n.orden ? 'tw:bg-green-soft tw:text-green-softink' : i === n.orden ? 'tw:boton-brand tw:text-white' : 'tw:bg-sunken tw:text-muted')}>{i < n.orden ? <Icono nombre="check" tam={12} /> : i + 1}</span>
            <b className={cx('tw:text-[13.5px] tw:flex-1', i > n.orden && 'tw:font-medium tw:text-muted')}>{x.t}</b>
            {x.firma && <Badge tono="gris" icono="sign">{x.firma}</Badge>}
          </button>
        </li>
      ))}
    </ol>
    {e && (
      <Confirmar si={`Sí, ${atras ? 'volver' : 'pasar'}`} alNo={() => setConf(null)} alSi={trabajar(async () => { await moverNegocio(n, e.id, n.cliente?.nombre?.split(' ')[0] || '', !atras); setConf(null); })}>
        <b>¿{atras ? 'Volver' : 'Pasar'} a «{e.t}»?</b>
        {!atras && conf?.tipo === 'etapa' && conf.i > n.orden + 1 && <span className="tw:text-yellow-ink">Te saltas etapas: puede pasar si lo hiciste por fuera.</span>}
      </Confirmar>
    )}
    <div className="lz-ahora tw:flex tw:flex-col tw:gap-2.5 tw:p-3.5 tw:rounded-xl tw:bg-sunken">
      <h5 className="tw:m-0 tw:text-[13px] tw:font-bold">Ahora: {n.etapaInfo?.t || ''}</h5>
      {tareas.map((t: string, i: number) => (
        <label key={i} className="lz-tarea tw:flex tw:items-start tw:gap-2.5 tw:m-0 tw:text-[13px] tw:cursor-pointer">
          <input key={`${i}-${!!n.tareas?.[n.etapa]?.[i]}`} type="checkbox" className="tw:m-0 tw:mt-px tw:size-4 tw:w-4 tw:flex-none tw:accent-brand" data-tarea={i}
            defaultChecked={!!n.tareas?.[n.etapa]?.[i]} onChange={(ev) => tarea(i, ev.target.checked, ev.target)} />
          <span>{t}</span>
        </label>
      ))}
      {n.etapaInfo?.firma && (firmaOk
        ? <span className="lz-ok"><Badge tono="verde" icono="check" ajustar>{n.etapaInfo.firma} firmado{f.fuera ? ' fuera de Asset' : ''}</Badge></span>
        : <div className="lz-firma tw:flex tw:flex-wrap tw:items-center tw:gap-2">
          <span className="tw:w-full"><Badge tono="azul" icono="sign" ajustar>{n.etapaInfo.firma}{f?.operacion ? ` · operación ${f.operacion}` : ''}</Badge></span>
          {f?.operacion ? <B k="op-neg" icono="rotateR" onClick={() => mostrar({ tipo: 'operacion', op: f.operacion, propId: n.propId || null })}>Ver firma</B>
            : <B k="documento" icono="filePlus" onClick={() => documento(n.propId)}>Generar</B>}
          <Boton variante="fantasma" tamano="sm" data-lz="fuera" onClick={(ev) => trabajar(async () => { await api('negFirmaFuera', n.id, n.etapa); Ag().decir(`Anotado: ${n.etapaInfo.firma.toLowerCase()} firmado fuera de Asset.`); W.AssetRefrescar?.(); refrescar(); })(ev.currentTarget)}>Firmado fuera de Asset</Boton>
        </div>)}
      {n.proximaAccion?.texto && <span className={cx('lz-acc', n.vencida && 'bad')}><Badge tono={n.vencida ? 'rojo' : 'gris'} icono="clock" ajustar>{n.proximaAccion.texto}{n.proximaAccion.fecha ? ' · ' + n.proximaAccion.fecha : ''}</Badge></span>}
    </div>
  </>;
}

/** «¿Qué sigue?»: el paso natural de la etapa actual, con sus botones (nada obligatorio) */
function Guia({ p, n, s, sig, setConf }: { p: any; n: any; s: any; sig: any; setConf: (c: TConf) => void }) {
  const nom = (n.cliente?.nombre || '').split(' ')[0]; const N = nom ? nom[0] + nom.slice(1).toLowerCase() : 'el cliente';
  const vis = (s.proximos || []).find((e: any) => e.tipo === 'visita' && (!n.cliente || (e.personas || []).some((x: string) => x === n.cliente.nombre)));
  const avanzar = (t: string) => <B k="avanzar" icono="arrowR" pri onClick={trabajar(() => moverNegocio(n, sig.id, '', true))}>{t}</B>;
  const anotar = (t = 'Anotar') => <B k="anotar" icono="edit" onClick={() => W.Gestion.anotar(p.id)}>{t}</B>;
  let txt: ReactNode = ''; let acts: ReactNode = null;
  if (n.etapa === 'interes') { txt = `Primer contacto con ${N}. Lo natural es coordinar la visita.`; acts = <><B k="agendar" icono="calendar" pri onClick={() => agendar(p, n)}>Agendar visita</B>{anotar('Anotar llamada')}</>; }
  else if (n.etapa === 'visita') {
    txt = <>{vis && <>Visita el <b>{vis.fecha.slice(8)}/{vis.fecha.slice(5, 7)}{vis.hora ? ' a las ' + vis.hora : ''}</b>{vis.confirmada ? ' · confirmada ✓' : ''}{vis.orden ? ' · con orden de visita' : ''}.<br /></>}¿Cómo le fue a {N}?</>;
    acts = <>
      {vis && !vis.confirmada && <Boton variante="exito" tamano="sm" icono="whatsapp" className="lz-wab" data-confev={vis.id} onClick={() => W.Gestion.confirmar(vis.id)}>Confirmar por WhatsApp</Boton>}
      {vis && !vis.orden && <B k="orden-ev" icono="sign" data-ev={vis.id} onClick={() => Ag().accion({ tipo: 'orden', eventoId: vis.id })}>Orden de visita</B>}
      {sig && avanzar(`Le interesó: pasar a «${sig.t}»`)}
      <B k="perdido" icono="x" onClick={() => setConf({ tipo: 'perdido' })}>No siguió</B>
      {!vis && <B k="agendar" icono="calendar" onClick={() => agendar(p, n)}>Agendar visita</B>}
    </>;
  } else if (sig) { txt = `${N} está en «${n.etapaInfo?.t || ''}». Cuando esté listo, pasa a «${sig.t}».`; acts = <>{avanzar(`Pasar a «${sig.t}»`)}{anotar()}</>; }
  else { txt = `${N} está en la última etapa.`; acts = anotar(); }
  return (
    <div className="lz-guia">
      <Card tono="lavanda" titulo={<span className="tw:flex tw:items-center tw:gap-2 tw:text-[14px]"><Icono nombre="compass" tam={15} /> ¿Qué sigue?</span>}>
        <div className="tw:flex tw:flex-col tw:gap-3">
          <p className="tw:m-0 tw:text-[13.5px] tw:leading-snug tw:text-text">{txt}</p>
          <Acciones>{acts}</Acciones>
        </div>
      </Card>
    </div>
  );
}

function Propiedad({ v }: { v: Extract<TVista, { tipo: 'propiedad' }> }) {
  const { p, s, negs, n } = v; const et = n ? v.etapas[n.tipo] : []; const sig = n ? et[n.orden + 1] : null;
  const [conf, setConf] = useState<TConf>(null); const [motivo, setMotivo] = useState('');
  const hist = useLienzo((x) => x.histAbierto);
  useEffect(() => setConf(null), [n?.id, n?.orden]);
  return <>
    <Cabeza titulo={p.codigo} sub={p.titulo} icono="house" foto={p.fotos?.[0] || null} />
    <div className="lz-pp tw:flex tw:flex-col tw:gap-2">
      <span className="lz-dir tw:flex tw:items-center tw:gap-1.5 tw:text-[13px] tw:text-muted"><Icono nombre="pin" tam={13} /> {dirTxt(p) || 'Sin dirección'}</span>
      <div className="lz-prs tw:flex tw:flex-wrap tw:gap-x-4 tw:gap-y-1.5">
        {(['venta', 'arriendo'] as const).filter((o) => p[o]).map((o) => { const [t, tono] = estadoProp(p[o === 'venta' ? 'estadoVenta' : 'estadoArriendo']); return (
          <span key={o} className="lz-pr tw:inline-flex tw:items-center tw:gap-2 tw:text-[13px]"><span className="tw:text-muted">{o === 'venta' ? 'Venta' : 'Arriendo'}</span><b>{precio(o === 'venta' ? p.precioVenta : p.precioArriendo) || '—'}</b><Badge tono={tono}>{t}</Badge></span>
        ); })}
      </div>
    </div>
    {n ? (
      <Card className="lz-sec lz-neg" titulo={<span className="tw:flex tw:items-center tw:gap-2 tw:text-[14px]"><span className="tw:text-muted tw:flex"><Icono nombre="briefcase" tam={15} /></span>{negs.length > 1 ? 'Negocios en curso' : 'Negocio en curso'}</span>}>
        <div className="tw:flex tw:flex-col tw:gap-3.5">
          {negs.length > 1 && (
            <div className="lz-clis tw:flex tw:flex-col tw:gap-1.5">
              <small className="tw:text-xs tw:text-muted">Toca un cliente para ver su estado</small>
              {negs.map((x) => (
                <button key={x.id} type="button" data-tabneg={x.id} onClick={() => mostrar({ ...useLienzo.getState().ctx, negocio: x.id })}
                  className={cx('lz-cli', x.id === n.id && 'on', 'tw:flex tw:items-center tw:gap-2.5 tw:w-full tw:m-0 tw:px-3 tw:py-2 tw:text-left tw:rounded-xl tw:border tw:border-solid tw:cursor-pointer tw:font-[inherit]', x.id === n.id ? 'tw:border-lav-edge tw:bg-lav-soft' : 'tw:border-edge tw:bg-card tw:hover:bg-hover')}>
                  <Avatar nombre={x.cliente?.nombre || '?'} tamano="sm" />
                  <span className="tw:min-w-0 tw:flex-1"><b className="tw:block tw:text-[13px] tw:truncate">{x.cliente?.nombre || 'Sin cliente'}</b><small className="tw:block tw:text-xs tw:text-muted">{x.tipo === 'venta' ? 'Venta' : 'Arriendo'} · {x.etapaInfo?.t || ''}</small></span>
                  <span className="tw:w-16"><Etapas etapas={v.etapas[x.tipo]} orden={x.orden} /></span>
                </button>
              ))}
            </div>
          )}
          <div className="lz-nh tw:flex tw:items-center tw:gap-3">
            <Avatar nombre={n.cliente?.nombre || n.titulo} />
            <div className="tw:min-w-0 tw:flex-1 tw:flex tw:flex-col tw:gap-1">
              <b className="tw:text-[14px] tw:truncate">{n.cliente?.nombre || n.titulo}</b>
              <small className="tw:text-xs tw:text-muted">{n.tipo === 'venta' ? 'Venta' : 'Arriendo'} · etapa {n.orden + 1} de {n.total}</small>
              <Barra pct={Math.round((n.orden + 1) / n.total * 100)} />
            </div>
          </div>
          <Guia p={p} n={n} s={s} sig={sig} setConf={setConf} />
          {conf?.tipo === 'perdido' && (
            <Confirmar si="Sí, cerrar" alNo={() => setConf(null)} alSi={(b) => {
              const m = motivo.trim(); if (!m) { (document.querySelector('#lzMot') as HTMLInputElement | null)?.focus(); return; }
              trabajar(async () => { await api('negCerrar', n.id, 'perdido', m); Ag().decir(`Negocio de ${n.cliente?.nombre || p.codigo} cerrado: ${m}.`); W.AssetRefrescar?.(); setConf(null); refrescar(); })(b);
            }}>
              <b>¿Cerrar el negocio de {n.cliente?.nombre || ''} como perdido?</b>
              <Input id="lzMot" autoFocus aria-label="Motivo" placeholder="Motivo (ej.: no le gustó la ubicación)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </Confirmar>
          )}
          <Pasos n={{ ...n, propId: p.id }} et={et} conf={conf} setConf={setConf} />
          <Acciones>
            <B k="agendar" icono="calendar" onClick={() => agendar(p, n)}>Agendar</B>
            <B k="documento" icono="filePlus" onClick={() => documento(p.id)}>Documento</B>
            <B k="negocio-completo" icono="grid" onClick={ver(() => W.Negocios.abrirNegocio(n.id))}>Ver completo</B>
          </Acciones>
        </div>
      </Card>
    ) : (
      <Acciones>
        <B k="anotar" icono="edit" pri onClick={() => W.Gestion.anotar(p.id)}>Anotar</B>
        <B k="agendar" icono="calendar" onClick={() => agendar(p, null)}>Agendar visita</B>
        <B k="negocio-nuevo" icono="briefcase" onClick={() => Ag().prellenar(`Crea un negocio de ${p.arriendo ? 'arriendo' : 'venta'} de ${p.codigo} con `)}>Crear negocio</B>
        <B k="publicar" icono="export" onClick={() => W.Publicaciones.publicar(p.id)}>Publicar</B>
        <B k="ficha" icono="file" onClick={ver(() => W.Inmo.abrirFicha(p.id))}>Ficha</B>
      </Acciones>
    )}
    {s.sugerencias.length > 0 && (
      <div className="lz-sugs tw:flex tw:flex-wrap tw:items-center tw:gap-2">
        <span className="tw:w-full tw:inline-flex tw:items-center tw:gap-1.5 tw:text-[13px] tw:font-semibold tw:text-lav-softink"><Icono nombre="sparkle" tam={13} /> Te sugiero <span className="tw:font-normal tw:text-muted">(opcional)</span></span>
        {s.sugerencias.map((x: any, i: number) => <Boton key={i} variante="secundario" tamano="sm" data-sg={i} onClick={() => Ag().accion(x.accion)}>{x.label}</Boton>)}
      </div>
    )}
    <Seccion icono="calendar" titulo="Próximas visitas" cuenta={s.totalProximos > 1 ? s.totalProximos : undefined}>
      {s.proximos.length ? s.proximos.map((e: any) => (
        <ItemLista key={e.id} className="lz-rw" data-ag={e.fecha} alTocar={() => mostrar({ tipo: 'agenda', fecha: e.fecha })}
          media={<Hora>{e.fecha.slice(5).split('-').reverse().join('/')}<small className="tw:block tw:text-[10.5px] tw:font-medium">{e.hora || ''}</small></Hora>}
          titulo={e.titulo} detalle={e.personas?.length ? e.personas.join(', ') : undefined}
          derecha={<>
            {e.orden && <Badge tono="verde">Con orden</Badge>}
            {e.tipo === 'visita' && e.personas?.length > 0 && (
              <span role="button" tabIndex={0} className={cx('lz-wa', e.confirmada && 'ok', 'tw:grid tw:place-items-center tw:size-8 tw:rounded-lg tw:cursor-pointer', e.confirmada ? 'tw:bg-green-soft tw:text-green-softink' : 'tw:bg-sunken tw:text-muted tw:hover:text-green-softink')}
                data-confev={e.id} title={e.confirmada ? 'Confirmada por WhatsApp (enviar de nuevo)' : 'Confirmar por WhatsApp'}
                onClick={(ev) => { ev.stopPropagation(); W.Gestion.confirmar(e.id); }} onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.stopPropagation(); W.Gestion.confirmar(e.id); } }}>
                <Icono nombre={e.confirmada ? 'check' : 'whatsapp'} tam={14} />
              </span>
            )}
          </>} />
      )) : <Vacio>Sin visitas agendadas.</Vacio>}
    </Seccion>
    {(p.firmas || []).length > 0 && (
      <Seccion icono="sign" titulo="Documentos">
        {p.firmas.slice(0, 4).map((f: any, i: number) => { const [t, tono] = estadoFirma(f.estado); return (
          <ItemLista key={i} className="lz-row" data-op={f.operacion || ''} data-pid={p.id} flecha
            alTocar={() => mostrar(f.operacion ? { tipo: 'operacion', op: Number(f.operacion), propId: p.id } : { tipo: 'propiedad', id: p.id })}
            titulo={f.plantilla} detalle={f.operacion ? 'Operación ' + f.operacion : ''} derecha={<Badge tono={tono}>{t}</Badge>} />
        ); })}
      </Seccion>
    )}
    <details className="lz-sec lz-det tw:rounded-2xl tw:border tw:border-solid tw:border-edge tw:border-b-[3px] tw:border-b-edge-b tw:bg-card tw:px-4 tw:py-3" open={hist}
      onToggle={(e) => useLienzo.setState({ histAbierto: (e.target as HTMLDetailsElement).open })}>
      <summary className="tw:flex tw:items-center tw:gap-2 tw:cursor-pointer tw:list-none">
        <h4 className="tw:flex tw:items-center tw:gap-2 tw:m-0 tw:text-[14px] tw:font-bold tw:whitespace-nowrap"><span className="tw:text-muted tw:flex"><Icono nombre="clock" tam={15} /></span>Historial <Badge tono="gris">{s.historial.length}</Badge></h4>
        <span className="lz-dl tw:flex-1 tw:min-w-0 tw:truncate tw:text-xs tw:text-muted">{s.historial[0] ? fechaCorta(s.historial[0].fecha) + ' · ' + s.historial[0].texto : 'Sin movimientos'}</span>
        <Icono nombre="chevD" tam={14} />
      </summary>
      {s.historial.length > 0 && <LineaTiempo className="lz-hist tw:mt-3 tw:max-h-[260px] tw:overflow-y-auto" items={s.historial.map((h: any) => ({ texto: h.texto, fecha: fechaCorta(h.fecha), destacado: !!h.nota }))} />}
    </details>
  </>;
}

// ---------- negocio ----------
function Negocio({ v }: { v: Extract<TVista, { tipo: 'negocio' }> }) {
  const { n, et } = v; const sig = et[n.orden + 1]; const pct = n.estado === 'ganado' ? 100 : Math.round((n.orden + 1) / n.total * 100);
  const firmado = n.firmas?.[n.etapa]?.estado === 'firmado';
  return <>
    <Cabeza titulo={n.tipo === 'venta' ? 'Negocio de venta' : 'Negocio de arriendo'} sub={n.prop ? n.prop.codigo + ' · ' + n.prop.titulo : ''} icono="briefcase" />
    <div className="lz-tit tw:flex tw:items-center tw:gap-3"><Avatar nombre={n.cliente?.nombre || n.titulo} /><b className="tw:text-base">{n.cliente?.nombre || n.titulo}</b></div>
    <Meta texto={n.estado === 'abierto' ? `Etapa ${n.orden + 1} de ${n.total}` : n.estado === 'ganado' ? 'Cerrado con éxito' : 'Cerrado'} pct={pct} derecha={`${pct}%`} />
    {n.etapaInfo?.firma ? (firmado ? <Badge tono="verde" icono="check" ajustar>{n.etapaInfo.firma} firmado</Badge> : <span className="lz-falta"><Badge tono="amarillo" icono="sign" ajustar>Siguiente: {amable(n.siguiente)}</Badge></span>)
      : n.siguiente ? <span className="lz-falta"><Badge tono="amarillo" icono="arrowR" ajustar>Siguiente: {amable(n.siguiente)}</Badge></span> : null}
    {n.proximaAccion?.texto && <span className={cx('lz-acc', n.vencida && 'bad')}><Badge tono={n.vencida ? 'rojo' : 'gris'} icono="clock" ajustar>{n.proximaAccion.texto}{n.proximaAccion.fecha ? ' · ' + n.proximaAccion.fecha : ''}</Badge></span>}
    <Card relleno={false}>
      <ol className="lz-steps tw:flex tw:flex-col tw:gap-0.5 tw:m-0 tw:p-1.5 tw:list-none">
        {et.map((e, i) => (
          <li key={e.id} className={cx(i < n.orden ? 'hecho' : i === n.orden ? 'ahora' : '', 'tw:flex tw:items-center tw:gap-3 tw:px-2.5 tw:py-2 tw:rounded-xl', i === n.orden && 'tw:bg-lav-soft tw:text-lav-softink')}>
            <span className={cx('tw:grid tw:place-items-center tw:flex-none tw:size-6 tw:rounded-full tw:text-xs tw:font-bold', i < n.orden ? 'tw:bg-green-soft tw:text-green-softink' : i === n.orden ? 'tw:boton-brand tw:text-white' : 'tw:bg-sunken tw:text-muted')}>{i < n.orden ? <Icono nombre="check" tam={12} /> : i + 1}</span>
            <b className={cx('tw:text-[13.5px] tw:flex-1', i > n.orden && 'tw:font-medium tw:text-muted')}>{e.t}</b>
            {e.firma && <Badge tono="gris" icono="sign">{e.firma}</Badge>}
          </li>
        ))}
      </ol>
    </Card>
    <Acciones>
      {n.estado === 'abierto' && sig && <B k="avanzar" icono="arrowR" pri onClick={trabajar(() => moverNegocio(n, sig.id, '', true))}>Pasar a «{sig.t}»</B>}
      <B k="documento" icono="filePlus" onClick={() => documento(n.propId || n.prop?.id)}>Documento</B>
      <B k="agendar" icono="calendar" onClick={() => agendar(n.prop, n)}>Agendar</B>
      <B k="negocio-completo" icono="grid" onClick={ver(() => W.Negocios.abrirNegocio(n.id))}>Ver completo</B>
    </Acciones>
  </>;
}

// ---------- agenda de un día ----------
function Agenda({ v }: { v: Extract<TVista, { tipo: 'agenda' }> }) {
  const orden = (e: any) => W.Agenda.ordenVisita(e, (r: any) => { refrescar(); Ag().decir(`Orden de visita enviada a firmar: operación ${r.operacion}.`); });
  return <>
    <Cabeza titulo="Agenda" sub={fmtDia(v.fecha)} icono="calendar" />
    <Acciones>
      <B k="agendar" icono="plus" pri onClick={() => W.Gestion.agendar({})}>Agendar otra</B>
      <B k="agenda-completa" icono="calendar" onClick={ver(() => W.Agenda.abrir())}>Agenda completa</B>
    </Acciones>
    <Seccion icono="clock" titulo="Eventos del día" cuenta={v.ev.length}>
      {v.ev.length ? v.ev.map((e) => (
        <div key={e.id} className={cx('lz-ev', e.estado, 'tw:flex tw:items-start tw:gap-3 tw:px-3 tw:py-2.5', e.estado !== 'programado' && 'tw:opacity-60')}>
          <Hora>{e.hora || '—'}</Hora>
          <div className="tw:min-w-0 tw:flex-1 tw:flex tw:flex-col tw:gap-1.5">
            <span className="tw:min-w-0"><b className="tw:block tw:text-[13.5px] tw:truncate">{e.titulo}</b><small className="tw:block tw:text-xs tw:text-muted tw:truncate">{[e.lugar, e.personas.map((c: any) => c.nombre).join(', ')].filter(Boolean).join(' · ')}</small></span>
            <span className="tw:flex tw:flex-wrap tw:gap-1.5">
              {e.tipo === 'visita' && (e.orden?.operacion ? <Badge tono="verde">Orden {e.orden.operacion}</Badge>
                : <Boton variante="secundario" tamano="sm" icono="sign" data-orden={e.id} onClick={() => orden(e)}>Generar orden de visita</Boton>)}
              {e.tipo === 'visita' && e.personas.length > 0 && e.estado === 'programado' && (
                <Boton variante={e.confirmacion ? 'secundario' : 'exito'} tamano="sm" icono={e.confirmacion ? 'check' : 'whatsapp'} data-confev={e.id} onClick={() => W.Gestion.confirmar(e.id)}>
                  {e.confirmacion ? 'Confirmada' : 'Confirmar por WhatsApp'}
                </Boton>
              )}
            </span>
          </div>
        </div>
      )) : <Vacio>No hay eventos este día.</Vacio>}
    </Seccion>
  </>;
}

// ---------- firma ----------
function Operacion({ v }: { v: Extract<TVista, { tipo: 'operacion' }> }) {
  const { r } = v; const [t, tono] = estadoFirma(r.estado); const pct = r.total ? Math.round(r.firmados / r.total * 100) : 0;
  return <>
    <Cabeza titulo={`Operación ${r.operacion}`} sub="Seguimiento de la firma" icono="sign" />
    <Meta texto={`${r.firmados} de ${r.total} firmaron`} pct={pct} ok={r.estado === 'firmado'} derecha={<Badge tono={tono} punto>{t}</Badge>} />
    <Seccion icono="users" titulo="Firmantes" cuenta={r.firmantes.length}>
      {r.firmantes.map((s: any, i: number) => (
        <ItemLista key={i} className="lz-row st" media={<Avatar nombre={s.nombre || '?'} tamano="sm" />} titulo={s.nombre} detalle={s.rut || ''}
          derecha={<Badge tono={s.firmo ? 'verde' : 'amarillo'}>{s.firmo ? 'Firmó' : 'Pendiente'}</Badge>} />
      ))}
    </Seccion>
    <Acciones>
      <B k="op-actualizar" icono="rotateR" pri onClick={() => mostrar()}>Actualizar</B>
      <B k="op-operaciones" icono="listCheck" onClick={() => W.Gestion.operaciones(r.operacion)}>Seguir en Operaciones</B>
      {v.propId && <B k="op-prop" icono="house" onClick={() => mostrar({ tipo: 'propiedad', id: v.propId })}>Ver propiedad</B>}
    </Acciones>
  </>;
}

/** el contenido de #agCanvas */
export default function Lienzo() {
  const { vista: v, anim } = useLienzo();
  if (!v) return null;
  return (
    <div key={anim} className="lz-in lz-anim tw:flex tw:flex-col tw:gap-4 tw:p-5">
      {v.tipo === 'inicio' ? <Inicio v={v} /> : v.tipo === 'propiedad' ? <Propiedad v={v} /> : v.tipo === 'negocio' ? <Negocio v={v} />
        : v.tipo === 'agenda' ? <Agenda v={v} /> : v.tipo === 'operacion' ? <Operacion v={v} />
          : <><Cabeza titulo="Tu día" icono="compass" /><EstadoVacio icono="alert" texto={v.mensaje} /></>}
    </div>
  );
}
