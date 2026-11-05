// Ficha de la propiedad: encabezado con acciones, franja de resumen y pestañas (Resumen, Propietario, Negocios,
// Firmas y documentos, Portales, Historial). Se abre con Inmo.abrirFicha(id) (src/renderer/inmo.js), que la
// monta en #view-cartera, el mismo contenedor de la lista.
//
// Las pestañas se dibujan todas y se ocultan con .hidden, como antes: las pruebas y el recorrido de Aprende
// buscan sus elementos aunque no estén a la vista. La pestaña elegida queda en el store (por propiedad) y
// el código antiguo la cambia con Inmo.fichaTab(k).
// Siguen fuera de React: «Datos básicos» y «Nueva persona» (inmo.js), «Ficha completa» (ficha-bloques.js),
// «Publicar» (publicaciones.js), publicar en Portal Inmobiliario (inmo.js), la captación (etapas.js),
// las fotos desde Drive (dictado.js) y el Agente (gestion.js). Se llaman por utils/app.ts.
import { useEffect } from 'react';
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
import type { ReactNode } from 'react';
import type { IPropiedad } from '../../../store/interfaces/propiedad.interface';

function Encabezado({ p }: { p: IPropiedad }) {
  const { fichaRecargar, fichaArchivar } = useFicha();
  return (
    <div className="im-fh">
      <button className="ghost" id="fBack" onClick={abrirCartera}><Icono nombre="chevL" tam={16} /> Cartera</button>
      <span className="spacer" />
      <button className="primary" id="fPub" onClick={() => publicarPropiedad(p.id)}><Icono nombre="export" tam={15} /> Publicar</button>
      <button className="secondary" id="fAg" onClick={() => verPropiedadEnAgente(p.id, p.codigo)}><Icono nombre="sparkle" tam={15} /> Ver en el Agente</button>
      <button className="secondary" id="fGen" onClick={() => generarDocumentoPropiedad(p.id)}><Icono nombre="filePlus" tam={15} /> Generar documento</button>
      <button className="secondary" id="fFicha" onClick={() => fichaCompleta(p.id, () => { fichaRecargar(); })}><Icono nombre="edit" tam={15} /> Ficha completa</button>
      <button className="secondary" id="fEdit" onClick={() => editarPropiedad(p)}>Datos básicos</button>
      <button className="ghost" id="fArch" onClick={async () => avisar(await fichaArchivar(!p.archivada))}>{p.archivada ? 'Restaurar' : 'Archivar'}</button>
    </div>
  );
}

function Titulo({ p }: { p: IPropiedad }) {
  const n = p.editados?.length || 0;
  return (
    <div className="im-ft">
      <small className="im-code">{p.codigo || ''} · {TIPO[p.tipo] || p.tipo}{p.rol ? ' · Rol ' + p.rol : ''}</small>
      <h1>{p.titulo}</h1>
      <p className="muted"><Icono nombre="pin" tam={14} /> {direccion(p) || 'Sin dirección'}{p.region ? ', ' + p.region : ''}
        {p.lat != null && <> · <a href="#" id="fMapa" onClick={(e) => { e.preventDefault(); abrirUrl(`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`); }}>ver en el mapa</a></>}
      </p>
      {p.origen && (
        <p className="im-orig"><Icono nombre="link" tam={13} /> Importada desde Portalfirma{p.origen.fuente ? ` (origen ${p.origen.fuente})` : ''} · {fechaHora(p.origen.importado)}
          {n > 0 && ` · ${n} ${n === 1 ? 'dato editado' : 'datos editados'} aquí se mantienen al actualizar`}</p>
      )}
    </div>
  );
}

function Franja({ p, irA }: { p: IPropiedad; irA: (t: TFichaTab) => void }) {
  const { negocios, captacion } = useFicha();
  const abiertos = negocios.filter((n) => n.estado === 'abierto');
  const enFirma = (p.firmas || []).filter((f) => f.operacion && !['firmado', 'anulado'].includes(f.estado || ''));
  const pub = (['venta', 'arriendo'] as const).filter((o) => p[o] && p.portales?.pi?.[o]?.status === 'active');
  const e = captacion?.etapas[0];
  const op = (o: 'venta' | 'arriendo') => (
    <button className="im-sc" data-go="resumen" onClick={() => irA('resumen')}>
      <small>{o === 'venta' ? 'Venta' : 'Arriendo'}</small>
      <b>{precio(o === 'venta' ? p.precioVenta : p.precioArriendo) || 'Sin precio'}</b>
      <em>{ESTADO[(o === 'venta' ? p.estadoVenta : p.estadoArriendo) || 'disponible']?.[0] || ''}</em>
    </button>
  );
  return (
    <div className="im-strip" id="fStrip">
      {p.venta && op('venta')}
      {p.arriendo && op('arriendo')}
      <button className={`im-sc${captacion && !captacion.actual ? ' ok' : ''}`} data-go="resumen" id="fStripCaptB" onClick={() => irA('resumen')}>
        <small>Captación</small><b id="fStripCapt">{e ? `${e.ok} de ${e.total}` : '…'}</b><em id="fStripCaptD">{captacion ? (captacion.actual ? captacion.actual.t : 'Completa') : ''}</em>
      </button>
      <button className="im-sc" data-go="negocios" onClick={() => irA('negocios')}>
        <small>Negocios abiertos</small><b>{abiertos.length}</b>
        <em>{abiertos.length ? [...new Set(abiertos.map((n) => n.etapaInfo?.t))].slice(0, 2).join(' · ') : 'Ninguno'}</em>
      </button>
      <button className={`im-sc${enFirma.length ? ' wait' : ''}`} data-go="firmas" onClick={() => irA('firmas')}>
        <small>En firma</small><b>{enFirma.length}</b><em>{enFirma.length ? enFirma[0].plantilla : 'Nada pendiente'}</em>
      </button>
      <button className={`im-sc${pub.length ? ' ok' : ''}`} data-go="portales" onClick={() => irA('portales')}>
        <small>Portal Inmobiliario</small><b>{pub.length ? 'Publicada' : 'No publicada'}</b><em>{pub.join(' y ')}</em>
      </button>
    </div>
  );
}

interface IFichaPropiedadProps {
  id: string;
  vez?: number; // inmo.js la sube para pedir que se recargue (después de un formulario del código antiguo)
}

export default function FichaPropiedad({ id, vez }: IFichaPropiedadProps) {
  const { propiedad: p, cargado, error, tab, negocios, version, fichaGet, fichaSetTab } = useFicha();
  const { perfilGet } = usePerfil();

  useEffect(() => { fichaGet(id); perfilGet(); }, [id, vez, fichaGet, perfilGet]);
  useEffect(() => { avisarAyuda('ficha'); }, []);
  // la propiedad ya no está (borrada o fuera del perfil): vuelve a la cartera
  useEffect(() => { if (cargado && !error && !p) abrirCartera(); }, [cargado, error, p]);

  if (!p) return <div className="im-wrap">{error ? <p className="error">No se pudo leer la propiedad: {error}</p> : <p className="muted">Cargando…</p>}</div>;

  const irA = (t: TFichaTab) => fichaSetTab(p.id, t);
  const abiertos = negocios.filter((n) => n.estado === 'abierto').length;
  const enFirma = (p.firmas || []).filter((f) => f.operacion && !['firmado', 'anulado'].includes(f.estado || '')).length;
  const TABS: [TFichaTab, ReactNode][] = [
    ['resumen', 'Resumen'],
    ['propietario', <>Propietario{p.duenoVisible === false && <> <Icono nombre="lock" tam={12} /></>}</>],
    ['negocios', <>Negocios{abiertos > 0 && <> <b>{abiertos}</b></>}</>],
    ['firmas', <>Firmas y documentos{enFirma > 0 && <> <b>{enFirma}</b></>}</>],
    ['portales', 'Portales'],
    ['historial', 'Historial'],
  ];
  const pane = (k: TFichaTab, hijos: ReactNode) => <div className={`im-pane${tab === k ? '' : ' hidden'}`} data-pane={k}>{hijos}</div>;

  return (
    <div className="im-wrap im-ficha">
      <Encabezado p={p} />
      <Titulo p={p} />
      <Franja p={p} irA={irA} />
      <div className="im-ftabs" role="tablist">
        {TABS.map(([k, l]) => <button key={k} className={`im-ftab${k === tab ? ' on' : ''}`} data-tab={k} role="tab" onClick={() => irA(k)}>{l}</button>)}
      </div>
      {pane('resumen', <Resumen p={p} irA={irA} version={version} />)}
      {pane('propietario', <Propietario p={p} />)}
      {pane('negocios', <Negocios p={p} />)}
      {pane('firmas', <Firmas p={p} />)}
      {pane('portales', <Portales p={p} />)}
      {pane('historial', <Historial />)}
    </div>
  );
}
