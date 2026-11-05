// Publicaciones: Avisos (rendimiento y recomendaciones), Interesados (bandeja única) y Portales (conexiones).
//
// El flujo «Publicar» (calidad, portales, publicar) y sus formularios siguen en src/renderer/publicaciones.js;
// se llaman por utils/app.ts. Los id pbTabs, pbBody, pbSync, pbNew los usan las pruebas y el Agente.
import { useEffect } from 'react';
import Icono from '../../ui/Icono';
import { elegirParaPublicar, toast } from '../../../utils/app';
import { usePublicacion } from '../../../store/hooks/usePublicacion.hook';
import Avisos from './Avisos';
import Interesados from './Interesados';
import Portales from './Portales';
import type { TInteresadoEstado, TPubTab } from '../../../store/interfaces/publicacion.interface';

const TABS: [TPubTab, string][] = [['avisos', 'Avisos'], ['interesados', 'Interesados'], ['portales', 'Portales']];

interface IPublicacionesProps {
  tab?: TPubTab; // al abrirla desde otra pantalla (p. ej. el Agente: «interesados»)
  filtro?: TInteresadoEstado | '';
}

export default function Publicaciones({ tab: tabInicial, filtro: filtroInicial }: IPublicacionesProps) {
  const { tab, panel, nuevos, error, sincronizando, publicacionAbrir, publicacionSetTab, interesadosSetFiltro, publicacionSincronizar } = usePublicacion();

  useEffect(() => {
    if (filtroInicial !== undefined) interesadosSetFiltro({ filtro: filtroInicial });
    publicacionAbrir(tabInicial);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- solo al montar

  const sincronizar = async () => {
    const r = await publicacionSincronizar();
    toast(r.error || r.mensaje || '', 5000);
  };
  const cuenta: Record<TPubTab, number | ''> = { avisos: panel?.totales.avisos || '', interesados: nuevos || '', portales: '' };

  return (
    <div className="im-wrap pb-wrap">
      <div className="im-head fx-portales">
        <div>
          <h1>Publicaciones</h1>
          <p className="muted">Sube la propiedad, pulsa «Publicar» y Asset la lleva a los portales. Aquí ves cómo rinde cada aviso y a quién responder.</p>
        </div>
        <span className="pb-hb">
          <button className={`secondary${sincronizando ? ' spin' : ''}`} id="pbSync" disabled={sincronizando} onClick={sincronizar}><Icono nombre="rotateR" tam={15} /> Actualizar</button>
          <button className="primary" id="pbNew" onClick={elegirParaPublicar}><Icono nombre="export" tam={15} /> Publicar una propiedad</button>
        </span>
      </div>
      <div className="im-seg pb-tabs" id="pbTabs" role="group" aria-label="Secciones">
        {TABS.map(([k, t]) => (
          <button key={k} data-t={k} className={tab === k ? 'on' : ''} onClick={() => publicacionSetTab(k)}>
            {t}<i data-n={k} className={k === 'interesados' && nuevos ? 'hot' : ''}>{cuenta[k]}</i>
          </button>
        ))}
      </div>
      <div id="pbBody">
        {error && <p className="error">No se pudieron leer las publicaciones: {error}</p>}
        {!panel ? <div className="ga-load"><span className="spinner sm" />Cargando…</div>
          : tab === 'avisos' ? <Avisos d={panel} /> : tab === 'interesados' ? <Interesados /> : <Portales />}
      </div>
    </div>
  );
}
