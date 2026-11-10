// Detalle de un negocio, ordenado como la ficha de la propiedad: cabecera con «volver» al tablero y acciones,
// franja de resumen, las etapas y dos columnas (el avance y el historial a la izquierda; la propiedad, las
// personas, la próxima acción, las condiciones y los documentos a la derecha).
// Lo monta Negocios.abrirNegocio(id) (src/renderer/negocios.js) en #view-negocios, el mismo contenedor del
// tablero, con el negocio ya leído (negObtener) y sus acciones: las llamadas a la API y las ventanas siguen allá.
// Los pasos (comercialización y postventa) los dibuja src/renderer/etapas.js (Etapas.bloque) en #ngEt, que React deja vacío.
// Las pruebas y Aprende usan .ng-ficha, .im-ft, #ngBack, #ngReab, #ngDel, #ngEt, .ng-steps [data-mv], .ng-etapa,
// .ng-tasks [data-task], .ng-fb (.ok, .wait, .need) con #ngEnv, #ngVin, #ngRev, #ngOp y #ngFq, .ng-acts con
// #ngLost, #ngNext y #ngWin, #ngPa (#ngPaT, #ngPaF), #ngNota (#ngNotaT), #ngProp (.ng-prop), #ngCorSel y #ngCond.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Layout from '../../ui/Layout';
import Boton from '../../ui/Boton';
import Card from '../../ui/Card';
import Badge from '../../ui/Badge';
import Avatar from '../../ui/Avatar';
import Icono from '../../ui/Icono';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import EstadoVacio from '../../ui/EstadoVacio';
import { ListaActividad, copiarCorreo, precio, whatsapp } from '../ficha/comun';
import { colorEtapa, conColor } from './colores';
import { abrirFicha, avisarAyuda } from '../../../utils/app';
import { fecha } from '../../../utils/formato';
import { cx } from '../../../utils/cx';
import { SUAVE, type TTono } from '../../ui/tonos';
import type { IEtapa, IFirmaEtapa, IMonto, INegocioDetalle } from '../../../store/interfaces/negocio.interface';

const TIPO = { venta: 'Venta', arriendo: 'Arriendo' } as const;
const CLIENTE = { venta: 'Comprador', arriendo: 'Arrendatario' } as const;
const COLUMNAS = 'tw:grid tw:gap-4 tw:lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)] tw:items-start';

const dias = (n = 0) => (n <= 0 ? 'Hoy' : n === 1 ? 'Hace 1 día' : `Hace ${n} días`);
// las fechas sin hora ('2026-11-14') se leen a mediodía, para que no cambien de día con la zona horaria
const dia = (f?: string | null) => (f ? fecha(f.length === 10 ? f + 'T12:00' : f) : '');
const valorTxt = (v: IMonto | null, tipo: keyof typeof TIPO) => (v ? precio(v) + (tipo === 'arriendo' ? '/mes' : '') : '');
const comisionTxt = (n: INegocioDetalle) => (n.comisionMonto != null ? precio({ valor: n.comisionMonto, moneda: n.valor?.moneda || 'UF' }) : '—');

export interface IFichaNegocioAcciones {
  volver: () => void;
  pasos: (el: HTMLElement) => void; // Etapas.bloque en #ngEt
  mover: (etapa: string) => void;
  tarea: (i: number, hecha: boolean) => void;
  siguiente: () => void;
  ganar: () => void;
  perder: () => void;
  reabrir: () => void;
  eliminar: () => void;
  corredor: (id: string) => void;
  proximaAccion: (texto: string, fecha: string) => void;
  nota: (texto: string) => void;
  condiciones: (c: { valor: string; moneda: string; comision: string; tipoComision: string }) => void;
  enviarFirma: () => void;
  vincularFirma: () => void;
  revisarFirmas: () => void;
  verOperacion: () => void;
  quitarFirma: () => void;
}

export interface IFichaNegocioProps {
  n: INegocioDetalle;
  etapas: IEtapa[];
  corredores?: { id: string; nombre: string }[] | null; // solo el administrador puede reasignar
  vez: number; // negocios.js la sube en cada recarga: los formularios vuelven a los datos guardados
  acc: IFichaNegocioAcciones;
}

// ---------- franja de resumen ----------
const INDICADOR = 'tw:flex tw:items-center tw:gap-3 tw:min-w-0 tw:px-4 tw:py-3 tw:rounded-2xl tw:border tw:border-solid tw:border-edge tw:border-b-[3px] tw:border-b-edge-b tw:bg-card tw:text-text';

function Indicador({ etiqueta, valor, detalle, icono, color, tono }: { etiqueta: string; valor: ReactNode; detalle?: ReactNode; icono: string; color: TTono; tono?: 'ok' | 'wait' | 'mal' }) {
  return (
    <div className={INDICADOR}>
      <span className={cx('tw:grid tw:size-10 tw:flex-none tw:place-items-center tw:rounded-xl', SUAVE[color])}><Icono nombre={icono} tam={18} /></span>
      <span className="tw:flex tw:min-w-0 tw:flex-col tw:gap-0.5">
        <small className="tw:text-xs tw:text-muted">{etiqueta}</small>
        <b className={cx('tw:truncate tw:text-[15px] tw:font-bold tw:leading-tight', tono === 'ok' && 'tw:text-green-softink', tono === 'wait' && 'tw:text-yellow-softink', tono === 'mal' && 'tw:text-red-softink')}>{valor}</b>
        <em className="tw:max-w-full tw:truncate tw:not-italic tw:text-xs tw:text-muted">{detalle}</em>
      </span>
    </div>
  );
}

function Franja({ n, etapas }: { n: INegocioDetalle; etapas: IEtapa[] }) {
  const docs = etapas.filter((x) => x.firma);
  const firmados = docs.filter((x) => n.firmas?.[x.id]?.estado === 'firmado').length;
  const pa = n.proximaAccion;
  return (
    <div className="tw:grid tw:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] tw:gap-3">
      <Indicador etiqueta={n.tipo === 'venta' ? 'Precio acordado' : 'Arriendo mensual'} icono={n.tipo === 'venta' ? 'coins' : 'key'} color="azul"
        valor={valorTxt(n.valor, n.tipo) || 'Sin valor'} detalle={TIPO[n.tipo]} />
      <Indicador etiqueta="Comisión estimada" icono="briefcase" color="amarillo" valor={comisionTxt(n)}
        detalle={n.comision ? (n.comision.tipo === '%' ? `${n.comision.valor}% · más IVA` : 'Monto fijo · más IVA') : 'Sin comisión'} />
      <Indicador etiqueta="Próxima acción" icono="calendar" color={n.vencida ? 'rojo' : 'durazno'} tono={n.vencida ? 'mal' : undefined}
        valor={pa?.fecha ? dia(pa.fecha) : pa?.texto ? 'Sin fecha' : 'Sin definir'} detalle={pa?.texto || n.siguiente || ''} />
      <Indicador etiqueta="Documentos firmados" icono="sign" color="verde" tono={docs.length && firmados === docs.length ? 'ok' : undefined}
        valor={`${firmados} de ${docs.length}`} detalle={docs.length ? 'Se firman con Portalfirma' : 'Este negocio no lleva firmas'} />
    </div>
  );
}

// ---------- etapas del tablero: clic en una para mover el negocio ----------
function Etapas({ n, etapas, mover }: { n: INegocioDetalle; etapas: IEtapa[]; mover: (id: string) => void }) {
  const abierto = n.estado === 'abierto'; const ord = n.orden ?? 0;
  return (
    <Card relleno={false}>
      <ol className="ng-steps tw:m-0 tw:flex tw:list-none tw:gap-1 tw:overflow-x-auto tw:p-2">
        {etapas.map((x, i) => {
          const hecho = i < ord || n.estado === 'ganado'; const actual = i === ord && n.estado !== 'ganado';
          return (
            <li key={x.id} className={cx('tw:min-w-[118px] tw:flex-1', hecho && 'hecho', actual && 'actual')} style={conColor(colorEtapa(x, i))}>
              <button type="button" data-mv={abierto ? x.id : undefined} title={abierto && !actual ? `Mover a «${x.t}»` : undefined}
                aria-current={actual ? 'step' : undefined} onClick={() => { if (abierto && !actual) mover(x.id); }}
                className={cx('tw:flex tw:h-full tw:w-full tw:items-center tw:gap-2.5 tw:m-0 tw:px-3 tw:py-2.5 tw:rounded-xl tw:border-0 tw:text-left tw:font-[inherit] tw:text-[13px]',
                  actual ? 'tw:bg-[color-mix(in_srgb,var(--c)_14%,transparent)] tw:text-text tw:font-semibold' : 'tw:bg-transparent tw:text-muted',
                  abierto && !actual ? 'tw:cursor-pointer tw:hover:bg-hover' : 'tw:cursor-default')}>
                <span className={cx('tw:grid tw:size-7 tw:flex-none tw:place-items-center tw:rounded-full tw:text-xs tw:font-bold',
                  hecho ? 'tw:bg-green-edge tw:text-white' : actual ? 'tw:bg-[var(--c)] tw:text-white' : 'tw:bg-sunken tw:text-muted')}>
                  {hecho ? <Icono nombre="check" tam={14} /> : i + 1}
                </span>
                <span className={cx('tw:min-w-0 tw:leading-tight', hecho && 'tw:text-text')}>{x.t}</span>
                {x.firma && <span className="tw:ml-auto tw:text-muted" title={`Se firma: ${x.firma}`}><Icono nombre="sign" tam={13} /></span>}
              </button>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

// Los pasos de etapas.js se dibujan en el MISMO contenedor en cada recarga (como la captación de la ficha)
function Pasos({ vez, pasos }: { vez: number; pasos: (el: HTMLElement) => void }) {
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = caja.current; if (!el) return;
    pasos(el);
  }, [vez]); // eslint-disable-line react-hooks/exhaustive-deps -- «pasos» cambia en cada recarga junto con vez
  return <div id="ngEt" className="ng-et" ref={caja} />;
}

// ---------- etapa actual: tareas, firma de la etapa y cómo avanzar ----------
const CAJA_FIRMA: Record<'ok' | 'wait' | 'need', string> = {
  ok: 'tw:bg-green-soft tw:border-green-edge', wait: 'tw:bg-yellow-soft tw:border-yellow-edge', need: 'tw:bg-lav-soft tw:border-lav-edge',
};
const TINTA_FIRMA: Record<'ok' | 'wait' | 'need', string> = { ok: 'tw:text-green-softink', wait: 'tw:text-yellow-softink', need: 'tw:text-lav-softink' };

function BloqueFirma({ e, f, abierto, acc }: { e: IEtapa; f: IFirmaEtapa | null; abierto: boolean; acc: IFichaNegocioAcciones }) {
  const k = f?.estado === 'firmado' ? 'ok' : f?.operacion ? 'wait' : 'need';
  const [titulo, detalle] = k === 'ok'
    ? [`${e.firma} firmado`, `${f!.fuera ? 'Firmado fuera de Asset' : 'Operación ' + f!.operacion} · ${dia(f!.firmado)}`]
    : k === 'wait'
      ? [`${e.firma}: en firma`, [`Operación ${f!.operacion}`, f!.total ? `${f!.firmados} de ${f!.total} firmas` : '', f!.revisado ? 'revisado ' + dia(f!.revisado) : '', f!.error || ''].filter(Boolean).join(' · ')]
      : [`Falta firmar: ${e.firma}`, 'Al quedar firmado, el negocio pasa solo a la siguiente etapa.'];
  return (
    <div className={cx('ng-fb', k, 'tw:mt-4 tw:flex tw:flex-wrap tw:items-center tw:gap-3 tw:rounded-xl tw:border tw:border-solid tw:border-b-2 tw:px-4 tw:py-3', CAJA_FIRMA[k])}>
      <span className={cx('tw:grid tw:size-9 tw:flex-none tw:place-items-center tw:rounded-lg tw:bg-card', TINTA_FIRMA[k])}><Icono nombre={k === 'ok' ? 'check' : 'sign'} tam={18} /></span>
      <span className="tw:flex tw:min-w-[180px] tw:flex-1 tw:flex-col tw:gap-0.5">
        <b className="tw:text-sm tw:font-semibold tw:text-text">{titulo}</b>
        <small className="tw:text-xs tw:text-muted">{detalle}</small>
      </span>
      {k === 'wait' && <span className="tw:flex tw:flex-wrap tw:gap-1.5">
        <Boton id="ngRev" variante="secundario" tamano="sm" icono="rotateR" onClick={acc.revisarFirmas}>Revisar ahora</Boton>
        <Boton id="ngOp" variante="fantasma" tamano="sm" onClick={acc.verOperacion}>Ver operación</Boton>
        <Boton id="ngFq" variante="fantasma" tamano="sm" icono="x" title="Desvincular" aria-label="Desvincular" onClick={acc.quitarFirma} />
      </span>}
      {k === 'need' && <span className="tw:flex tw:flex-wrap tw:gap-1.5">
        <Boton id="ngEnv" tamano="sm" icono="sign" disabled={!abierto} onClick={acc.enviarFirma}>Enviar a firmar</Boton>
        <Boton id="ngVin" variante="secundario" tamano="sm" disabled={!abierto} onClick={acc.vincularFirma}>Ya lo envié</Boton>
      </span>}
    </div>
  );
}

function EtapaActual({ n, etapas, vez, acc }: { n: INegocioDetalle; etapas: IEtapa[]; vez: number; acc: IFichaNegocioAcciones }) {
  const e = n.etapaInfo!; const abierto = n.estado === 'abierto'; const sig = etapas[(n.orden ?? 0) + 1];
  const hechas = n.tareas?.[n.etapa] || [];
  return (
    <Card className="ng-etapa" titulo={`Etapa actual: ${e.t}`} subtitulo={e.d} accion={<Badge icono="clock">{dias(n.diasEnEtapa)}</Badge>}>
      {(e.tareas || []).length > 0 && (
        <div className="ng-tasks tw:flex tw:flex-col tw:gap-2">
          {e.tareas.map((t, i) => (
            <label key={i} className={cx('tw:m-0 tw:flex tw:items-center tw:gap-3 tw:rounded-xl tw:border tw:border-solid tw:border-b-2 tw:px-3.5 tw:py-2.5 tw:text-sm',
              hechas[i] ? 'tw:bg-green-soft tw:border-green-edge' : 'tw:bg-card tw:border-edge tw:border-b-edge-b',
              abierto ? 'tw:cursor-pointer tw:hover:bg-hover' : 'tw:cursor-default')}>
              <input key={vez} type="checkbox" data-task={i} defaultChecked={!!hechas[i]} disabled={!abierto} onChange={(ev) => acc.tarea(i, ev.target.checked)}
                className="tw:m-0 tw:size-[18px] tw:flex-none tw:p-0 tw:accent-[var(--ui-green-edge)]" />
              <span className={cx(hechas[i] ? 'tw:text-green-softink tw:line-through' : 'tw:text-text')}>{t}</span>
            </label>
          ))}
        </div>
      )}
      {e.firma && <BloqueFirma e={e} f={n.firmas?.[n.etapa] || null} abierto={abierto} acc={acc} />}
      {abierto
        ? (
          <div className="ng-acts tw:mt-4 tw:flex tw:flex-wrap tw:items-center tw:gap-2 tw:border-0 tw:border-t tw:border-solid tw:border-edge tw:pt-4">
            <Boton id="ngLost" variante="fantasma" icono="x" className="tw:text-red-softink!" onClick={acc.perder}>Marcar como perdido</Boton>
            <span className="tw:flex-1" />
            {e.final
              ? <Boton id="ngWin" variante="exito" icono="check" onClick={acc.ganar}>Cerrar negocio con éxito</Boton>
              : sig && <Boton id="ngNext" iconoDerecha="arrowR" onClick={acc.siguiente}>Pasar a «{sig.t}»</Boton>}
          </div>
        )
        : <p className="tw:mt-4 tw:mb-0 tw:text-[13px] tw:text-muted">El negocio está cerrado. Para seguir moviéndolo, usa «Reabrir».</p>}
    </Card>
  );
}

function Historial({ n, vez, nota }: { n: INegocioDetalle; vez: number; nota: (t: string) => void }) {
  const guardar = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault(); const t = String(new FormData(ev.currentTarget).get('nota') || '').trim();
    if (t) nota(t);
  };
  return (
    <Card titulo="Historial" subtitulo="Cambios de etapa, tareas, firmas y notas de este negocio">
      <form id="ngNota" key={vez} onSubmit={guardar} className="tw:mb-4 tw:flex tw:items-start tw:gap-2">
        <Input id="ngNotaT" name="nota" placeholder="Agregar una nota (llamada, oferta, acuerdo…)" aria-label="Nota" clasesCampo="tw:flex-1" />
        <Boton type="submit" variante="secundario" icono="plus">Guardar</Boton>
      </form>
      {(n.actividad || []).length ? <ListaActividad items={n.actividad!} /> : <EstadoVacio compacto texto="Todavía no hay movimientos." />}
    </Card>
  );
}

// ---------- columna derecha ----------
function Propiedad({ prop }: { prop: NonNullable<INegocioDetalle['prop']> }) {
  const [rota, setRota] = useState(false);
  return (
    <button type="button" id="ngProp" onClick={() => abrirFicha(prop.id)}
      className={cx('ng-prop tw:flex tw:w-full tw:items-center tw:justify-start tw:gap-3 tw:m-0 tw:p-3 tw:text-left tw:font-[inherit] tw:text-text tw:cursor-pointer',
        'tw:rounded-2xl tw:border tw:border-solid tw:border-edge tw:border-b-[3px] tw:border-b-edge-b tw:bg-card tw:transition-colors tw:duration-100 tw:hover:bg-hover',
        'tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-lav-edge')}>
      <span className="tw:grid tw:h-16 tw:w-[84px] tw:flex-none tw:place-items-center tw:overflow-hidden tw:rounded-xl tw:bg-lav-soft tw:text-lav-softink">
        {prop.foto && !rota ? <img src={prop.foto} alt="" loading="lazy" className="tw:size-full tw:object-cover" onError={() => setRota(true)} /> : <Icono nombre="house" tam={24} />}
      </span>
      <span className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-0.5">
        <small className="im-code tw:text-xs tw:text-muted">{prop.codigo}</small>
        <b className="tw:truncate tw:text-[15px] tw:font-semibold">{prop.titulo}</b>
        <small className="tw:text-xs tw:text-muted">{prop.comuna ? prop.comuna + ' · ' : ''}Ver ficha de la propiedad</small>
      </span>
      <span className="tw:text-muted"><Icono nombre="chevR" tam={16} /></span>
    </button>
  );
}

const FILA_PERSONA = 'tw:flex tw:items-center tw:gap-3 tw:py-3 tw:border-0 tw:border-t tw:border-solid tw:border-edge tw:first:border-t-0 tw:first:pt-0';

function Personas({ n, corredores, vez, acc }: { n: INegocioDetalle; corredores?: IFichaNegocioProps['corredores']; vez: number; acc: IFichaNegocioAcciones }) {
  const c = n.cliente; const duenos = n.prop?.propietarios || [];
  return (
    <Card titulo="Personas">
      <div className="tw:flex tw:flex-col">
        {c && (
          <div className={FILA_PERSONA}>
            <Avatar nombre={c.nombre} />
            <span className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col">
              <b className="tw:truncate tw:text-sm tw:font-semibold">{c.nombre}</b>
              <small className="tw:text-xs tw:text-muted">{CLIENTE[n.tipo]}{c.rut ? ' · ' + c.rut : ''}</small>
            </span>
            {c.telefono && <Boton variante="fantasma" tamano="sm" icono="whatsapp" title="WhatsApp" aria-label="WhatsApp" data-wa={c.telefono} onClick={() => whatsapp(c.telefono!)} />}
            {c.email && <Boton variante="fantasma" tamano="sm" icono="mail" title="Copiar correo" aria-label="Copiar correo" data-mail={c.email} onClick={() => copiarCorreo(c.email!)} />}
          </div>
        )}
        {duenos.map((d) => (
          <div key={d.id} className={FILA_PERSONA}>
            <Avatar nombre={d.nombre} />
            <span className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col">
              <b className="tw:truncate tw:text-sm tw:font-semibold">{d.nombre}</b>
              <small className="tw:text-xs tw:text-muted">Propietario{d.rut ? ' · ' + d.rut : ''}</small>
            </span>
          </div>
        ))}
        {!duenos.length && <p className={cx(FILA_PERSONA, 'tw:m-0 tw:text-[13px] tw:text-muted')}>La propiedad no tiene propietario registrado: agrégalo en su ficha para firmar.</p>}
        <div className={FILA_PERSONA}>
          <span className={cx('tw:grid tw:size-9 tw:flex-none tw:place-items-center tw:rounded-xl', SUAVE.gris)}><Icono nombre="user" tam={16} /></span>
          {corredores?.length
            ? <Select key={vez} id="ngCorSel" etiqueta="Corredor" clasesCampo="tw:flex-1" defaultValue={n.corredorId || ''} vacia="Sin corredor"
              opciones={corredores.map((x) => [x.id, x.nombre])} onChange={(ev) => acc.corredor(ev.target.value)} />
            : <span className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col">
              <b className="tw:truncate tw:text-sm tw:font-semibold">{n.corredor || 'Sin asignar'}</b>
              <small className="tw:text-xs tw:text-muted">Corredor</small>
            </span>}
        </div>
      </div>
    </Card>
  );
}

function ProximaAccion({ n, vez, guardar }: { n: INegocioDetalle; vez: number; guardar: IFichaNegocioAcciones['proximaAccion'] }) {
  const enviar = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault(); const d = new FormData(ev.currentTarget);
    guardar(String(d.get('texto') || ''), String(d.get('fecha') || ''));
  };
  return (
    <Card titulo="Próxima acción" subtitulo="Qué hay que hacer, con quién y cuándo">
      <form id="ngPa" key={vez} onSubmit={enviar} className="tw:flex tw:flex-col tw:gap-3">
        <Input id="ngPaT" name="texto" placeholder="Ej.: llamar al comprador para la segunda visita" aria-label="Qué hay que hacer" defaultValue={n.proximaAccion?.texto || ''} />
        <div className="tw:flex tw:items-start tw:gap-2">
          <Input id="ngPaF" name="fecha" type="date" aria-label="Fecha" defaultValue={n.proximaAccion?.fecha || ''} clasesCampo="tw:flex-1" />
          <Boton type="submit" variante="secundario">Guardar</Boton>
        </div>
        {n.vencida && n.proximaAccion?.fecha && (
          <p role="alert" className={cx('tw:m-0 tw:flex tw:items-center tw:gap-2 tw:rounded-xl tw:px-3 tw:py-2 tw:text-[13px]', SUAVE.rojo)}>
            <Icono nombre="alert" tam={15} />Esta acción venció el {dia(n.proximaAccion.fecha)}.
          </p>
        )}
      </form>
    </Card>
  );
}

function Condiciones({ n, vez, guardar }: { n: INegocioDetalle; vez: number; guardar: IFichaNegocioAcciones['condiciones'] }) {
  const enviar = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault(); const d = new FormData(ev.currentTarget); const s = (k: string) => String(d.get(k) || '');
    guardar({ valor: s('valor'), moneda: s('moneda'), comision: s('comision'), tipoComision: s('tipoComision') });
  };
  return (
    <Card titulo="Condiciones">
      <form key={vez} onSubmit={enviar} className="tw:flex tw:flex-col tw:gap-3">
        <div className="tw:grid tw:grid-cols-[minmax(0,1fr)_96px] tw:items-end tw:gap-2">
          <Input id="ngVal" name="valor" type="number" step="any" etiqueta={n.tipo === 'venta' ? 'Precio acordado' : 'Arriendo mensual'} defaultValue={n.valor?.valor ?? ''} />
          <Select id="ngMon" name="moneda" aria-label="Moneda" defaultValue={n.valor?.moneda || 'UF'} opciones={[['UF', 'UF'], ['CLP', 'CLP'], ['USD', 'USD']]} />
        </div>
        <div className="tw:grid tw:grid-cols-[minmax(0,1fr)_96px] tw:items-end tw:gap-2">
          <Input id="ngCom" name="comision" type="number" step="any" etiqueta="Comisión" defaultValue={n.comision?.valor ?? ''} />
          <Select id="ngComT" name="tipoComision" aria-label="Tipo de comisión" defaultValue={n.comision?.tipo || '%'} opciones={[['%', '%'], ['monto', 'Monto']]} />
        </div>
        <div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2 tw:border-0 tw:border-t tw:border-solid tw:border-edge tw:pt-3">
          <span className="tw:text-[13px] tw:text-muted">Comisión estimada: <b className="tw:text-text">{comisionTxt(n)}</b> + IVA</span>
          <Boton id="ngCond" type="submit" variante="secundario" tamano="sm">Guardar</Boton>
        </div>
      </form>
    </Card>
  );
}

function Documentos({ n, etapas }: { n: INegocioDetalle; etapas: IEtapa[] }) {
  const docs = etapas.filter((x) => x.firma);
  return (
    <Card titulo="Documentos del negocio" subtitulo="Lo que se firma en cada etapa">
      {docs.length ? (
        <div className="tw:flex tw:flex-col">
          {docs.map((x) => {
            const y = n.firmas?.[x.id]; const ok = y?.estado === 'firmado';
            return (
              <div key={x.id} className={cx(FILA_PERSONA, 'tw:py-2.5')}>
                <span className={cx('tw:grid tw:size-8 tw:flex-none tw:place-items-center tw:rounded-lg', ok ? SUAVE.verde : y?.operacion ? SUAVE.amarillo : 'tw:bg-sunken tw:text-muted')}>
                  <Icono nombre={ok ? 'check' : 'file'} tam={15} />
                </span>
                <span className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col">
                  <span className={cx('tw:text-sm', x.id === n.etapa && 'tw:font-semibold')}>{x.firma}</span>
                  <small className="tw:text-xs tw:text-muted">Etapa «{x.t}»</small>
                </span>
                <Badge tono={ok ? 'verde' : y?.operacion ? 'amarillo' : 'gris'} punto>{ok ? 'Firmado' : y?.operacion ? `En firma · op. ${y.operacion}` : 'Pendiente'}</Badge>
              </div>
            );
          })}
        </div>
      ) : <EstadoVacio compacto texto="Este tipo de negocio no lleva documentos para firmar." />}
    </Card>
  );
}

// ---------- la ficha ----------
function Subtitulo({ n }: { n: INegocioDetalle }) {
  const v = valorTxt(n.valor, n.tipo);
  return (
    <span className="tw:flex tw:flex-wrap tw:items-center tw:gap-x-2 tw:gap-y-1.5">
      <span>{CLIENTE[n.tipo]}: <b>{n.cliente?.nombre || '—'}</b>{v ? ' · ' + v : ''}</span>
      {n.estado === 'ganado' && <Badge tono="verde" punto>Cerrado con éxito</Badge>}
      {n.estado === 'perdido' && <Badge tono="rojo" punto ajustar>Perdido: {n.motivoPerdida || 'sin motivo'}</Badge>}
      {n.estado === 'abierto' && n.vencida && <Badge tono="rojo" icono="alert">Próxima acción vencida</Badge>}
    </span>
  );
}

export default function FichaNegocio({ n, etapas, corredores, vez, acc }: IFichaNegocioProps) {
  useEffect(() => { avisarAyuda('negocio'); }, [n.id]);
  return (
    <Layout
      className="im-ficha ng-ficha"
      cabeceraClassName="im-ft"
      volver={{ texto: 'Negocios', alTocar: acc.volver, id: 'ngBack' }}
      sobretitulo={<span className="im-code">{TIPO[n.tipo]} · {n.prop?.codigo || ''}</span>}
      titulo={n.prop?.titulo || 'Negocio'}
      subtitulo={<Subtitulo n={n} />}
      acciones={<>
        {n.estado !== 'abierto' && <Boton id="ngReab" variante="secundario" icono="undo" onClick={acc.reabrir}>Reabrir</Boton>}
        <Boton id="ngDel" variante="secundario" icono="trash" title="Eliminar negocio" onClick={acc.eliminar}>Eliminar</Boton>
      </>}
    >
      <Franja n={n} etapas={etapas} />
      <Etapas n={n} etapas={etapas} mover={acc.mover} />
      <div className={COLUMNAS}>
        <div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-4">
          <EtapaActual n={n} etapas={etapas} vez={vez} acc={acc} />
          <Pasos key={n.id} vez={vez} pasos={acc.pasos} />
          <Historial n={n} vez={vez} nota={acc.nota} />
        </div>
        <div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-4">
          {n.prop && <Propiedad prop={n.prop} />}
          <Personas n={n} corredores={corredores} vez={vez} acc={acc} />
          <ProximaAccion n={n} vez={vez} guardar={acc.proximaAccion} />
          <Condiciones n={n} vez={vez} guardar={acc.condiciones} />
          <Documentos n={n} etapas={etapas} />
        </div>
      </div>
    </Layout>
  );
}
