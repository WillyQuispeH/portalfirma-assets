// Piezas comunes de las tarjetas de los flujos guiados del Agente (Gestionar una propiedad, documentos, agendar,
// dictado…). Cada tarjeta es un nodo <div class="ga …"> con su propia raíz de React: el controlador del chat
// (controlador.tsx) lo pone en la conversación con Agente.tarjeta(node), y etapas.js puede llevarlo a su ventana.
// Por dentro es un Card del kit (Tarjeta): título, cerrar, contenido y pie con los botones.
// Las llamadas al Agente van siempre por window.Agente (etapas.js las redirige cuando hay una ventana abierta).
// Las clases ga-* y los data-* los usan las pruebas.
/* eslint-disable @typescript-eslint/no-explicit-any -- datos del proceso principal sin tipos */
import { StrictMode, createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import Card from '../../../ui/Card';
import Icono from '../../../ui/Icono';
import Boton from '../../../ui/Boton';
import Badge from '../../../ui/Badge';
import { cx } from '../../../../utils/cx';
import { precio } from '../../ficha/comun';
import type { TTono } from '../../../ui/tonos';

export const W = window as unknown as Record<string, any>;
/** el Agente (siempre por window: etapas.js reemplaza tarjeta/decir/bajar/contexto mientras su ventana está abierta) */
export const Ag = () => W.Agente;
export { precio };

// ---------- datos ----------
export interface ICartera { propiedades: any[]; personas: any[] }
/** la cartera (propiedades y personas) cargada por inmo.js */
export async function cartera(): Promise<ICartera> { await W.cargar(); return W.Inmo._IM.data; }
export const carteraActual = (): ICartera => W.Inmo?._IM?.data || { propiedades: [], personas: [] };
export const api = <T = any>(fn: string, ...a: unknown[]) => W.api(fn, ...a) as Promise<T>;

// ---------- texto ----------
export const norm = (s: unknown) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const cleanRut = (r: unknown) => String(r || '').replace(/[^0-9kK]/g, '').toUpperCase();
export const dirTxt = (p: any) => [p.direccion, p.unidad ? 'depto. ' + p.unidad : '', p.comuna].filter(Boolean).join(', ');
export const precios = (p: any) => [p.venta ? `Venta ${precio(p.precioVenta) || '—'}` : '', p.arriendo ? `Arriendo ${precio(p.precioArriendo) || '—'}` : ''].filter(Boolean).join(' · ');
export const primer = (n: unknown) => { const x = String(n || '').trim().split(/\s+/)[0] || ''; return x ? x[0].toUpperCase() + x.slice(1).toLowerCase() : ''; };
export const fechaCorta = (iso: string) => { try { return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }); } catch { return ''; } };
/** «Listo para pasar a Reserva» → «pasar a Reserva» */
export const amable = (t: unknown) => String(t || '').replace(/^Listo para pasar a /, 'pasar a ').replace(/^Falta firmar: /, 'firmar ').replace(/^Esperando firmas: /, 'esperando firmas de ').replace(/^./, (c) => c.toLowerCase());
export const hoyISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };

// ---------- estados (propiedad, firma) → etiqueta del kit ----------
export const EST_PROP: Record<string, [string, TTono]> = { disponible: ['Disponible', 'verde'], reservada: ['Reservada', 'amarillo'], vendida: ['Vendida', 'lavanda'], arrendada: ['Arrendada', 'lavanda'], no_disponible: ['No disponible', 'gris'] };
export const EST_FIRMA: Record<string, [string, TTono]> = { en_firma: ['En firma', 'azul'], firmado: ['Firmado', 'verde'], pendiente_pago: ['Pendiente de pago', 'rojo'] };
export const estadoProp = (e: string) => EST_PROP[e] || ['—', 'gris'];
export const estadoFirma = (e: string) => EST_FIRMA[e] || EST_FIRMA.en_firma;

// ---------- la tarjeta ----------
interface ITarjetaCtx {
  node: HTMLElement;
  /** la tarjeta queda como una línea con lo que se eligió (y «Cambiar», si se puede volver) */
  terminar: (contenido: ReactNode, resumen: string, cambiar?: () => void) => void;
  /** cerrar sin hacer nada */
  quitar: () => void;
}
const Ctx = createContext<ITarjetaCtx | null>(null);
export const useTarjeta = () => useContext(Ctx)!;

/** Línea de una tarjeta terminada (también la usan las conversaciones reabiertas, en Mensaje.tsx) */
export function LineaHecha({ children, accion }: { children: ReactNode; accion?: ReactNode }) {
  return (
    <div className="tw:flex tw:items-center tw:gap-2.5 tw:px-3.5 tw:py-2 tw:rounded-xl tw:border tw:border-dashed tw:border-edge tw:bg-sunken tw:text-[13px] tw:text-muted tw:[&_b]:text-text">
      <span className="ga-ok tw:grid tw:place-items-center tw:flex-none tw:size-5 tw:rounded-full tw:bg-green-soft tw:text-green-softink"><Icono nombre="check" tam={12} /></span>
      <span className="tw:flex-1 tw:min-w-0">{children}</span>
      {accion}
    </div>
  );
}

function Raiz({ node, children }: { node: HTMLElement; children: ReactNode }) {
  const [hecha, setHecha] = useState<{ contenido: ReactNode; cambiar?: () => void } | null>(null);
  const ctx = useMemo<ITarjetaCtx>(() => ({
    node,
    terminar: (contenido, resumen, cambiar) => {
      node.dataset.resumen = resumen; node.className = 'ga hecha';
      flushSync(() => setHecha({ contenido, cambiar })); Ag().guardar?.();
    },
    quitar: () => Ag().quitar(node),
  }), [node]);
  return (
    <Ctx.Provider value={ctx}>
      {hecha ? <LineaHecha accion={hecha.cambiar && <Boton variante="fantasma" tamano="sm" data-cambiar onClick={hecha.cambiar}>Cambiar</Boton>}>{hecha.contenido}</LineaHecha> : children}
    </Ctx.Provider>
  );
}

/** Crea la tarjeta (div.ga.<clase>) con su contenido de React y la pone en el chat. Devuelve el nodo. */
export function montar(clase: string, contenido: ReactNode, o: { usuario?: string; resumen?: string; prop?: string } = {}) {
  const node = document.createElement('div'); node.className = `ga ${clase}`;
  node.dataset.kit = ''; // trae su propio botón de cerrar (el controlador no agrega otro)
  if (o.resumen) node.dataset.resumen = o.resumen;
  if (o.prop) node.dataset.prop = o.prop;
  const raiz = createRoot(node);
  flushSync(() => raiz.render(<StrictMode><Raiz node={node}>{contenido}</Raiz></StrictMode>));
  Ag().tarjeta(node, o.usuario ? { usuario: o.usuario } : undefined);
  return node;
}

/**
 * La tarjeta: un Card del kit con título (y el número del paso o un ícono), cerrar, contenido y pie.
 * El pie lleva la clase ga-foot (las pruebas leen ahí lo que falta).
 */
export function Tarjeta({ n, icono, titulo, sub, pie, falta, cerrable = true, children }: {
  n?: number | null; icono?: string; titulo: ReactNode; sub?: ReactNode; pie?: ReactNode; falta?: ReactNode; cerrable?: boolean; children?: ReactNode;
}) {
  const { quitar } = useTarjeta();
  return (
    <Card
      titulo={<span className="ga-h tw:flex tw:items-center tw:gap-2.5">
        {(n || icono) && <span className="ga-n tw:grid tw:place-items-center tw:flex-none tw:size-7 tw:rounded-lg tw:bg-lav-soft tw:text-lav-softink tw:text-[13px] tw:font-bold">{n || <Icono nombre={icono!} tam={15} />}</span>}
        <span className="tw:min-w-0">{titulo}</span>
      </span>}
      subtitulo={sub}
      accion={cerrable && <Boton variante="fantasma" tamano="sm" className="ga-x tw:px-2 tw:-mr-2 tw:-mt-1" title="Cerrar" aria-label="Cerrar" icono="x" onClick={quitar} />}
      pie={pie && <div className="ga-foot tw:flex tw:flex-wrap tw:items-center tw:justify-end tw:gap-2"><span className="tw:mr-auto tw:min-w-0">{falta}</span>{pie}</div>}
    >
      <div className="tw:flex tw:flex-col tw:gap-4">{children}</div>
    </Card>
  );
}

// ---------- partes ----------
export function Giro({ tam = 14 }: { tam?: number }) {
  return (
    <svg className="tw:animate-spin tw:flex-none" width={tam} height={tam} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
export function Cargando({ texto }: { texto: string }) {
  return <div className="ga-load tw:flex tw:items-center tw:gap-2 tw:py-1 tw:text-[13px] tw:text-muted"><Giro />{texto}</div>;
}
/** tarjeta mientras carga lo que necesita */
export function TarjetaCargando({ texto }: { texto: string }) {
  return <Card><Cargando texto={texto} /></Card>;
}
export function ErrorTexto({ texto }: { texto: string }) {
  return <p role="alert" className="error tw:m-0 tw:text-[13px] tw:text-err">{texto}</p>;
}
/** aviso destacado dentro de una tarjeta */
export function Nota({ children, icono = 'alert', tono = 'amarillo', className }: { children: ReactNode; icono?: string; tono?: 'amarillo' | 'azul' | 'verde'; className?: string }) {
  const c = { amarillo: 'tw:bg-yellow-soft tw:text-yellow-softink', azul: 'tw:bg-blue-soft tw:text-blue-softink', verde: 'tw:bg-green-soft tw:text-green-softink' }[tono];
  return <p className={cx('ga-nota tw:flex tw:items-start tw:gap-2 tw:m-0 tw:px-3 tw:py-2.5 tw:rounded-xl tw:text-[13px] tw:leading-snug', c, className)}><Icono nombre={icono} tam={14} /><span>{children}</span></p>;
}
export function Muted({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx('tw:m-0 tw:text-[13px] tw:text-muted tw:leading-snug', className)}>{children}</p>;
}

/** lo que falta para continuar (o «Todo completo»), en el pie */
export function Falta({ texto, ok }: { texto?: ReactNode; ok?: ReactNode }) {
  return (
    <span className="ga-falta tw:inline-flex tw:items-center tw:gap-1.5 tw:min-w-0 tw:text-[13px] tw:font-semibold">
      {texto ? <Badge tono="amarillo" icono="alert" ajustar>{texto}</Badge> : ok ? <span className="ok"><Badge tono="verde" icono="check">{ok}</Badge></span> : null}
    </span>
  );
}

/** etiqueta de un campo con, a la derecha, de dónde salió el dato */
export function Etiqueta({ texto, fuente, opcional }: { texto: ReactNode; fuente?: string; opcional?: boolean }) {
  return (
    <span className="tw:flex tw:items-baseline tw:gap-1.5">
      <span>{texto}</span>
      {opcional && <span className="tw:font-normal tw:text-muted">(opcional)</span>}
      {fuente && <span className="tw:ml-auto tw:text-[11.5px] tw:font-medium tw:text-lav-softink">{fuente}</span>}
    </span>
  );
}
/** rejilla de campos de dos columnas */
export function Campos({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('ga-fs tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-x-3 tw:gap-y-3', className)}>{children}</div>;
}
/** grupo de campos con título (un firmante, «Datos»…) */
export function Grupo({ titulo, extra, children, className, ...resto }: { titulo: ReactNode; extra?: ReactNode; children: ReactNode; className?: string } & Record<string, unknown>) {
  return (
    <section {...resto} className={cx('ga-g tw:flex tw:flex-col tw:gap-3 tw:p-4 tw:rounded-xl tw:bg-sunken', className)}>
      <h4 className="tw:flex tw:items-center tw:gap-2 tw:m-0 tw:text-[13px] tw:font-bold">{titulo}{extra && <Badge tono="lavanda">{extra}</Badge>}</h4>
      {children}
    </section>
  );
}
/** casilla de verificación con texto (no hay una en el kit: es el <input> del sistema con el color de la marca) */
export function Casilla({ children, className, ...resto }: { children: ReactNode; className?: string } & React.InputHTMLAttributes<HTMLInputElement> & Record<string, unknown>) {
  return (
    <label className={cx('ga-chk tw:inline-flex tw:items-start tw:gap-2.5 tw:m-0 tw:text-[13px] tw:leading-snug tw:text-text tw:cursor-pointer', className)}>
      <input type="checkbox" className="tw:m-0 tw:mt-px tw:size-4 tw:w-4 tw:flex-none tw:accent-brand" {...resto} /><span>{children}</span>
    </label>
  );
}

/** título chico de una sección dentro de una tarjeta */
export function Seccion({ icono, titulo, derecha, children, className }: { icono: string; titulo: ReactNode; derecha?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('ga-sec tw:flex tw:flex-col tw:gap-2', className)}>
      <h4 className="tw:flex tw:items-center tw:gap-2 tw:m-0 tw:text-[13px] tw:font-bold tw:text-text"><span className="tw:text-muted tw:flex"><Icono nombre={icono} tam={14} /></span>{titulo}{derecha && <span className="tw:ml-auto">{derecha}</span>}</h4>
      {children}
    </section>
  );
}
/** lista con borde (para ItemLista) */
export function Lista({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('tw:flex tw:flex-col tw:p-1 tw:rounded-xl tw:border tw:border-solid tw:border-edge tw:divide-y tw:divide-edge', className)}>{children}</div>;
}

/** puntos de las etapas de un negocio: hechas (h), la actual (a) y las que faltan */
export function Etapas({ etapas, orden }: { etapas: { t: string }[]; orden: number }) {
  return (
    <span className="ga-pipe tw:flex tw:gap-1">
      {etapas.map((e, i) => <i key={i} title={e.t} className={cx(i < orden ? 'h tw:bg-lav-edge' : i === orden ? 'a tw:bg-brand' : 'tw:bg-edge', 'tw:block tw:h-1.5 tw:flex-1 tw:min-w-3 tw:rounded-full')} />)}
    </span>
  );
}
