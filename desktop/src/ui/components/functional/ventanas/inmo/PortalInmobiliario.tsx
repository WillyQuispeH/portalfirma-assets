// Ventanas de Portal Inmobiliario (Mercado Libre) que abre inmo.js: «Publicar en Portal Inmobiliario» (modal-30) y
// «Avisos existentes» (modal-32). Revisar, publicar y vincular siguen en inmo.js (alPublicar, alCambiarTipo, alVincular).
// Los id (#piTit, #piCnt, #piBar, #piTipo, #piCfg, #piErr, #mOk, #mCancel) y .im-ex con [data-i]/[data-p]/[data-o] los usan las pruebas.
import { useState, type ReactNode } from 'react';
import Boton from '../../../ui/Boton';
import Input from '../../../ui/Input';
import Select from '../../../ui/Select';
import ListaDatos from '../../../ui/ListaDatos';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../../ui/Ventana';
import { SUAVE, type TTono } from '../../../ui/tonos';
import { P } from '../../gestion/editor-pdf/Modales';
import { cerrarModal } from '../../../../utils/modal';
import { cx } from '../../../../utils/cx';

const fmtN = (n: number) => Number(n).toLocaleString('es-CL', { maximumFractionDigits: 2 });
const Logo = () => <span className="im-pilogo">PI</span>;

function Aviso({ tono, titulo, lista }: { tono: TTono; titulo: ReactNode; lista: string[] }) {
  return (
    <div className={cx('tw:rounded-[10px] tw:py-2.5 tw:px-3.5 tw:text-[13px]', SUAVE[tono])}>
      <b>{titulo}</b>
      <ul className="tw:mt-1.5 tw:mb-0 tw:pl-[18px]">{lista.map((e, i) => <li key={i}>{e}</li>)}</ul>
    </div>
  );
}

interface IBarrio { id: string; name: string }
interface IRevision {
  titulo?: string; errores: string[]; avisos: string[]; fotos: number; minFotos: number; tipoAviso?: string; paquete?: number | null;
  categoria?: { maxTitulo?: number; ruta: string[] } | null;
  ubicacion?: { city: { name: string }; state: { name: string }; barrios?: IBarrio[] } | null;
}
export interface IOpcionesAviso { tituloPortal: string; barrio: IBarrio | null; tipoAviso: string }

export function Publicar({ p, op, r, opts, tiposAviso, barrioSel, sinConexion, alCambiarTipo, alIrPortales, alPublicar }: {
  p: { codigo?: string }; op: string; r: IRevision; opts: { tituloPortal?: string }; tiposAviso: Record<string, string>; barrioSel?: string | null; sinConexion: boolean;
  alCambiarTipo: (v: IOpcionesAviso) => void; alIrPortales: () => void; alPublicar: (v: IOpcionesAviso) => Promise<void>;
}) {
  const max = r.categoria?.maxTitulo || 60; const barrios = r.ubicacion?.barrios || [];
  const [titulo, setTitulo] = useState(opts.tituloPortal ?? r.titulo ?? '');
  const [barrio, setBarrio] = useState(barrios.some((b) => b.id === barrioSel) ? String(barrioSel) : '');
  const [tipo, setTipo] = useState(r.tipoAviso && r.tipoAviso in tiposAviso ? r.tipoAviso : Object.keys(tiposAviso)[0]);
  const [publicando, setPublicando] = useState(false); const [err, setErr] = useState('');
  const actuales = (tipoAviso = tipo): IOpcionesAviso => {
    const b = barrios.find((x) => x.id === barrio);
    return { tituloPortal: titulo, barrio: b ? { id: b.id, name: b.name } : null, tipoAviso };
  };
  const publicar = async () => {
    setPublicando(true);
    try { await alPublicar(actuales()); } catch (e) { setPublicando(false); setErr((e as Error).message); }
  };

  return <>
    <VentanaCabecera titulo={<span className="im-pih"><Logo />Publicar en Portal Inmobiliario</span>}
      descripcion={`${p.codigo ?? ''} · ${op === 'venta' ? 'Venta' : 'Arriendo'} · también aparece en Mercado Libre`} />
    <VentanaCuerpo className="tw:flex tw:flex-col tw:gap-3.5">
      <Input id="piTit" maxLength={max} value={titulo} onChange={(e) => setTitulo(e.target.value)}
        etiqueta={<>Título del aviso <span id="piCnt" className="tw:font-normal tw:text-muted">{titulo.length}/{max}</span></>} />
      <ListaDatos datos={[['Categoría', r.categoria ? r.categoria.ruta.join(' › ') : '—'], ['Comuna', r.ubicacion ? `${r.ubicacion.city.name}, ${r.ubicacion.state.name}` : '—'],
        ['Fotos', `${r.fotos} de ${r.minFotos} recomendadas`]]} />
      <div className="tw:grid tw:grid-cols-2 tw:gap-3">
        <Select id="piBar" etiqueta={<>Barrio <span className="tw:font-normal tw:text-muted">(opcional)</span></>} value={barrio} onChange={(e) => setBarrio(e.target.value)}
          vacia="Sin barrio" opciones={barrios.map((b) => [b.id, b.name])} />
        <Select id="piTipo" etiqueta="Tipo de aviso" value={tipo} opciones={Object.entries(tiposAviso)}
          ayuda={r.paquete != null ? `Quedan ${r.paquete} en tu paquete` : undefined}
          onChange={(e) => { setTipo(e.target.value); alCambiarTipo(actuales(e.target.value)); }} />
      </div>
      {r.errores.length > 0 && <Aviso tono="rojo" titulo="Antes de publicar" lista={r.errores} />}
      {r.avisos.length > 0 && <Aviso tono="amarillo" titulo="Para mejorar el aviso" lista={r.avisos} />}
      {err && <p id="piErr" className="error tw:m-0 tw:text-[13px]" role="alert">{err}</p>}
    </VentanaCuerpo>
    <VentanaPie>
      {sinConexion && <Boton id="piCfg" variante="fantasma" className="tw:mr-auto" onClick={alIrPortales}>Ir a Portales</Boton>}
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
      <Boton id="mOk" disabled={r.errores.length > 0 || publicando} onClick={publicar}>{publicando ? 'Publicando…' : 'Publicar'}</Boton>
    </VentanaPie>
  </>;
}

interface IAvisoExistente { titulo: string; itemId: string; codigo?: string; moneda: string; precio: number; propId?: string | null; op?: string }
export interface IFilaAviso { propId: string; op: string; ok: boolean }

export function Existentes({ l, propiedades, alVincular }: { l: IAvisoExistente[]; propiedades: { id: string; codigo: string; titulo: string }[]; alVincular: (filas: IFilaAviso[]) => void }) {
  // como en un <select>: si la propiedad sugerida no está en la lista (archivada), queda sin elegir
  const [filas, setFilas] = useState<IFilaAviso[]>(() => l.map((x) => ({ propId: propiedades.some((p) => p.id === x.propId) ? String(x.propId) : '', op: x.op === 'arriendo' ? 'arriendo' : 'venta', ok: !!x.propId })));
  const poner = (i: number, c: Partial<IFilaAviso>) => setFilas((f) => f.map((x, j) => (j === i ? { ...x, ...c } : x)));
  const opcionesProp: [string, string][] = propiedades.map((p) => [p.id, `${p.codigo} · ${p.titulo.slice(0, 40)}`]);
  return <>
    <VentanaCabecera icono="link" titulo="Avisos existentes en Portal Inmobiliario"
      descripcion={l.length ? 'Asocia cada aviso a su ficha. Los que coinciden por código ya vienen marcados. Al vincularlos, la app los mantiene al día sin publicar de nuevo.' : undefined} />
    <VentanaCuerpo>
      {l.length ? (
        <div className="im-exl">
          {l.map((x, i) => (
            <div key={x.itemId + i} className="im-ex">
              <input type="checkbox" data-i={i} checked={filas[i].ok} onChange={(e) => poner(i, { ok: e.target.checked })} aria-label={`Vincular ${x.titulo}`} />
              <span className="im-ext"><b>{x.titulo}</b><small>{x.itemId}{x.codigo ? ` · código ${x.codigo}` : ''} · {x.moneda === 'CLF' ? 'UF ' + fmtN(x.precio) : '$' + fmtN(x.precio)}</small></span>
              <Select data-p={i} aria-label="Propiedad" vacia="Elegir propiedad…" opciones={opcionesProp} value={filas[i].propId} onChange={(e) => poner(i, { propId: e.target.value })} />
              <Select data-o={i} aria-label="Operación" opciones={[['venta', 'Venta'], ['arriendo', 'Arriendo']]} value={filas[i].op} onChange={(e) => poner(i, { op: e.target.value })} />
            </div>
          ))}
        </div>
      ) : <p className={P}>No hay avisos activos sin vincular en la cuenta.</p>}
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cerrar</Boton>
      {l.length > 0 && <Boton id="mOk" onClick={() => alVincular(filas)}>Vincular seleccionados</Boton>}
    </VentanaPie>
  </>;
}
