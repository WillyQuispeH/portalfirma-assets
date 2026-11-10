// Ficha de la propiedad: cabecera con «volver» a la cartera y acciones, franja de resumen y pestañas (Resumen,
// Propietario, Negocios, Firmas y documentos, Portales, Historial). Se abre con Inmo.abrirFicha(id)
// (src/renderer/inmo.js), que la monta en #view-cartera, el mismo contenedor de la lista.
// Hecha con el kit: Layout (cabecera con «volver» y acciones), Boton, Tabs, Card, Badge, ItemLista, ListaDatos,
// LineaTiempo, Select, Input y Textarea.
//
// Las pestañas se dibujan todas y se ocultan con .hidden, como antes: las pruebas y el recorrido de Aprende
// buscan sus elementos aunque no estén a la vista. La pestaña elegida queda en el store (por propiedad) y
// el código antiguo la cambia con Inmo.fichaTab(k).
// Siguen fuera de React: «Datos básicos» y «Nueva persona» (inmo.js), «Ficha completa» (ficha-bloques.js),
// «Publicar» (publicaciones.js), publicar en Portal Inmobiliario (inmo.js), la captación (etapas.js),
// las fotos desde Drive (dictado.js) y el Agente (gestion.js). Se llaman por utils/app.ts.
// Las pruebas y Aprende usan .im-ficha, la cabecera .im-ft (con h1 e .im-code), #fBack, #fPub, #fAg, #fGen,
// #fFicha, #fEdit, #fArch, #fMapa, #fStrip (.im-sc[data-go], #fStripCapt), .im-ftabs [data-tab] y [data-pane].
import { useEffect } from 'react';
import Layout from '../../ui/Layout';
import Boton from '../../ui/Boton';
import Tabs, { type TTabOpcion } from '../../ui/Tabs';
import EstadoVacio from '../../ui/EstadoVacio';
import Icono from '../../ui/Icono';
import { ESTADO, TIPO } from '../cartera/catalogos';
import { direccion } from '../cartera/filtrar';
import { precio } from './comun';
import Resumen from './Resumen';
import Propietario from './Propietario';
import { Firmas, Historial, Negocios, Portales } from './Paneles';
import { useFicha, type TFichaTab } from '../../../store/hooks/useFicha.hook';
import { usePerfil } from '../../../store/hooks/usePerfil.hook';
import {
  abrirCartera, abrirUrl, avisar, avisarAyuda, editarPropiedad, fichaCompleta, generarDocumentoPropiedad,
  publicarPropiedad, verPropiedadEnAgente,
} from '../../../utils/app';
import { fechaHora } from '../../../utils/formato';
import { cx } from '../../../utils/cx';
import { SUAVE, type TTono } from '../../ui/tonos';
import type { ReactNode } from 'react';
import type { IPropiedad } from '../../../store/interfaces/propiedad.interface';

// Acciones de la cabecera: van sueltas (no en un componente) para que CabeceraPagina deje dos a la vista y el resto en «⋯»
function acciones(p: IPropiedad, recargar: () => void, archivar: (si: boolean) => Promise<Parameters<typeof avisar>[0]>) {
  return <>
    <Boton id="fEdit" variante="secundario" icono="edit" onClick={() => editarPropiedad(p)}>Datos básicos</Boton>
    <Boton id="fPub" icono="export" onClick={() => publicarPropiedad(p.id)}>Publicar</Boton>
    <Boton id="fAg" variante="secundario" icono="sparkle" onClick={() => verPropiedadEnAgente(p.id, p.codigo)}>Ver en el Agente</Boton>
    <Boton id="fGen" variante="secundario" icono="filePlus" onClick={() => generarDocumentoPropiedad(p.id)}>Generar documento</Boton>
    <Boton id="fFicha" variante="secundario" icono="listCheck" onClick={() => fichaCompleta(p.id, recargar)}>Ficha completa</Boton>
    <Boton id="fArch" variante="secundario" icono={p.archivada ? 'undo' : 'folder'} onClick={async () => avisar(await archivar(!p.archivada))}>{p.archivada ? 'Restaurar' : 'Archivar'}</Boton>
  </>;
}

// Bajo el título: la dirección (con el mapa) y de dónde se importó
function Subtitulo({ p }: { p: IPropiedad }) {
  const n = p.editados?.length || 0;
  return <>
    <span className="tw:flex tw:flex-wrap tw:items-center tw:gap-1">
      <Icono nombre="pin" tam={14} /> {direccion(p) || 'Sin dirección'}{p.region ? ', ' + p.region : ''}
      {p.lat != null && <> · <a href="#" id="fMapa" onClick={(e) => { e.preventDefault(); abrirUrl(`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`); }}>ver en el mapa</a></>}
    </span>
    {p.origen && (
      <span className="tw:flex tw:flex-wrap tw:items-center tw:gap-1 tw:mt-1.5 tw:text-xs">
        <Icono nombre="link" tam={13} /> Importada desde Portalfirma{p.origen.fuente ? ` (origen ${p.origen.fuente})` : ''} · {fechaHora(p.origen.importado)}
        {n > 0 && ` · ${n} ${n === 1 ? 'dato editado' : 'datos editados'} aquí se mantienen al actualizar`}
      </span>
    )}
  </>;
}

// Franja de resumen: cada indicador lleva a su pestaña
const INDICADOR = 'im-sc tw:flex tw:items-center tw:gap-3 tw:min-w-0 tw:m-0 tw:px-4 tw:py-3 tw:text-left tw:font-[inherit] tw:cursor-pointer '
  + 'tw:rounded-2xl tw:border tw:border-solid tw:border-edge tw:border-b-[3px] tw:border-b-edge-b tw:bg-card tw:text-text tw:transition-colors tw:duration-100 '
  + 'tw:hover:bg-hover tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-lav-edge';

function Indicador({ etiqueta, valor, detalle, icono, color, tono, idValor, idDetalle, ...resto }: {
  etiqueta: string; valor: ReactNode; detalle?: ReactNode; icono: string; color: TTono; tono?: 'ok' | 'wait'; idValor?: string; idDetalle?: string;
  id?: string; 'data-go': TFichaTab; onClick: () => void;
}) {
  return (
    <button type="button" className={INDICADOR} {...resto}>
      <span className={cx('tw:grid tw:size-10 tw:flex-none tw:place-items-center tw:rounded-xl', SUAVE[color])}><Icono nombre={icono} tam={18} /></span>
      <span className="tw:flex tw:min-w-0 tw:flex-col tw:items-start tw:gap-0.5">
        <small className="tw:text-xs tw:text-muted">{etiqueta}</small>
        <b id={idValor} className={cx('tw:text-[15px] tw:font-bold tw:leading-tight', tono === 'ok' && 'tw:text-green-softink', tono === 'wait' && 'tw:text-yellow-softink')}>{valor}</b>
        <em id={idDetalle} className="tw:max-w-full tw:truncate tw:not-italic tw:text-xs tw:text-muted">{detalle}</em>
      </span>
    </button>
  );
}

function Franja({ p, irA }: { p: IPropiedad; irA: (t: TFichaTab) => void }) {
  const { negocios, captacion } = useFicha();
  const abiertos = negocios.filter((n) => n.estado === 'abierto');
  const enFirma = (p.firmas || []).filter((f) => f.operacion && !['firmado', 'anulado'].includes(f.estado || ''));
  const pub = (['venta', 'arriendo'] as const).filter((o) => p[o] && p.portales?.pi?.[o]?.status === 'active');
  const e = captacion?.etapas[0];
  const op = (o: 'venta' | 'arriendo') => (
    <Indicador data-go="resumen" onClick={() => irA('resumen')} etiqueta={o === 'venta' ? 'Venta' : 'Arriendo'}
      icono={o === 'venta' ? 'coins' : 'key'} color={o === 'venta' ? 'azul' : 'durazno'}
      valor={precio(o === 'venta' ? p.precioVenta : p.precioArriendo) || 'Sin precio'}
      detalle={ESTADO[(o === 'venta' ? p.estadoVenta : p.estadoArriendo) || 'disponible']?.[0] || ''} />
  );
  return (
    <div id="fStrip" className="tw:grid tw:grid-cols-[repeat(auto-fit,minmax(190px,1fr))] tw:gap-3">
      {p.venta && op('venta')}
      {p.arriendo && op('arriendo')}
      <Indicador id="fStripCaptB" data-go="resumen" onClick={() => irA('resumen')} etiqueta="Captación" icono="listCheck" color="lavanda"
        tono={captacion && !captacion.actual ? 'ok' : undefined}
        idValor="fStripCapt" valor={e ? `${e.ok} de ${e.total}` : '…'}
        idDetalle="fStripCaptD" detalle={captacion ? (captacion.actual ? captacion.actual.t : 'Completa') : ''} />
      <Indicador data-go="negocios" onClick={() => irA('negocios')} etiqueta="Negocios abiertos" icono="briefcase" color="amarillo" valor={abiertos.length}
        detalle={abiertos.length ? [...new Set(abiertos.map((n) => n.etapaInfo?.t))].slice(0, 2).join(' · ') : 'Ninguno'} />
      <Indicador data-go="firmas" onClick={() => irA('firmas')} etiqueta="En firma" icono="sign" color="azul" valor={enFirma.length} tono={enFirma.length ? 'wait' : undefined}
        detalle={enFirma.length ? enFirma[0].plantilla : 'Nada pendiente'} />
      <Indicador data-go="portales" onClick={() => irA('portales')} etiqueta="Portal Inmobiliario" icono="export" color="verde" tono={pub.length ? 'ok' : undefined}
        valor={pub.length ? 'Publicada' : 'No publicada'} detalle={pub.join(' y ')} />
    </div>
  );
}

interface IFichaPropiedadProps {
  id: string;
  vez?: number; // inmo.js la sube para pedir que se recargue (después de un formulario del código antiguo)
}

export default function FichaPropiedad({ id, vez }: IFichaPropiedadProps) {
  const { propiedad: p, cargado, error, tab, negocios, version, fichaGet, fichaSetTab, fichaRecargar, fichaArchivar } = useFicha();
  const { perfilGet } = usePerfil();

  useEffect(() => { fichaGet(id); perfilGet(); }, [id, vez, fichaGet, perfilGet]);
  useEffect(() => { avisarAyuda('ficha'); }, []);
  // la propiedad ya no está (borrada o fuera del perfil): vuelve a la cartera
  useEffect(() => { if (cargado && !error && !p) abrirCartera(); }, [cargado, error, p]);

  if (!p) return <Layout>{error ? <p role="alert" className="tw:m-0 tw:text-red-softink">No se pudo leer la propiedad: {error}</p> : <EstadoVacio compacto texto="Cargando…" />}</Layout>;

  const irA = (t: TFichaTab) => fichaSetTab(p.id, t);
  const abiertos = negocios.filter((n) => n.estado === 'abierto').length;
  const enFirma = (p.firmas || []).filter((f) => f.operacion && !['firmado', 'anulado'].includes(f.estado || '')).length;
  const TABS: TTabOpcion<TFichaTab>[] = [
    ['resumen', 'Resumen'],
    ['propietario', 'Propietario', undefined, p.duenoVisible === false ? 'lock' : undefined],
    ['negocios', 'Negocios', abiertos || undefined],
    ['firmas', 'Firmas y documentos', enFirma || undefined],
    ['portales', 'Portales'],
    ['historial', 'Historial'],
  ];
  const pane = (k: TFichaTab, hijos: ReactNode) => <div className={cx('im-pane', tab !== k && 'hidden')} data-pane={k}>{hijos}</div>;

  return (
    <Layout
      className="im-ficha"
      cabeceraClassName="im-ft"
      volver={{ texto: 'Cartera', alTocar: abrirCartera, id: 'fBack' }}
      sobretitulo={<span className="im-code">{p.codigo || ''} · {TIPO[p.tipo] || p.tipo}{p.rol ? ' · Rol ' + p.rol : ''}</span>}
      titulo={p.titulo}
      subtitulo={<Subtitulo p={p} />}
      acciones={acciones(p, () => { fichaRecargar(); }, fichaArchivar)}
    >
      <Franja p={p} irA={irA} />
      {/* las pestañas quedan fijas bajo la cabecera de la pantalla (--cab-visible: su alto fija, lo pone CabeceraPagina) */}
      <div data-ficha-fija className="tw:sticky tw:top-[calc(56px+var(--cab-visible,0px))] tw:z-[3] tw:-mx-1 tw:px-1 tw:bg-bg">
        <Tabs variante="linea" etiqueta="Secciones de la ficha" className="im-ftabs tw:max-w-full tw:overflow-x-auto tw:overflow-y-hidden" opciones={TABS} valor={tab} alCambiar={irA} />
      </div>
      {pane('resumen', <Resumen p={p} irA={irA} version={version} />)}
      {pane('propietario', <Propietario p={p} />)}
      {pane('negocios', <Negocios p={p} />)}
      {pane('firmas', <Firmas p={p} />)}
      {pane('portales', <Portales p={p} />)}
      {pane('historial', <Historial />)}
    </Layout>
  );
}
