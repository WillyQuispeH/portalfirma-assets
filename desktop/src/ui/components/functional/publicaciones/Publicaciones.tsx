// Publicaciones: Avisos (rendimiento y recomendaciones), Interesados (bandeja única) y Portales (conexiones).
// Hecha con el kit: Layout (cabecera con ilustración y, en la barra, las pestañas), Boton y Tabs.
//
// El flujo «Publicar» (calidad, portales, publicar) y sus formularios siguen en src/renderer/publicaciones.js;
// se llaman por utils/app.ts. Los id pbTabs (con data-t en cada pestaña), pbBody, pbSync, pbNew los usan las pruebas y el Agente.
import { useEffect } from 'react';
import Layout from '../../ui/Layout';
import Boton from '../../ui/Boton';
import Tabs, { type TTabOpcion } from '../../ui/Tabs';
import { elegirParaPublicar, toast } from '../../../utils/app';
import { usePublicacion } from '../../../store/hooks/usePublicacion.hook';
import Avisos from './Avisos';
import Interesados from './Interesados';
import Portales from './Portales';
import type { TInteresadoEstado, TPubTab } from '../../../store/interfaces/publicacion.interface';

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
  // la cuenta de cada pestaña (sin número si es cero)
  const tabs: TTabOpcion<TPubTab>[] = [
    ['avisos', 'Avisos', panel?.totales.avisos || undefined],
    ['interesados', 'Interesados', nuevos || undefined],
    ['portales', 'Portales'],
  ];

  return (
    <Layout
      className="pb-wrap"
      titulo="Publicaciones"
      ilustracion={{ imagen: 'img/formas/portales.svg', tinte: '#e8890c' }}
      subtitulo="Sube la propiedad, pulsa «Publicar» y Asset la lleva a los portales. Aquí ves cómo rinde cada aviso y a quién responder."
      acciones={<>
        <Boton id="pbNew" icono="export" onClick={elegirParaPublicar}>Publicar una propiedad</Boton>
        <Boton variante="secundario" id="pbSync" icono="rotateR" cargando={sincronizando} onClick={sincronizar}>Actualizar</Boton>
      </>}
      barra={<Tabs id="pbTabs" dato="t" etiqueta="Secciones" opciones={tabs} valor={tab} alCambiar={publicacionSetTab} />}
    >
      <div id="pbBody" className="tw:flex tw:min-w-0 tw:flex-col tw:gap-4">
        {error && <p role="alert" className="tw:m-0 tw:text-red-softink">No se pudieron leer las publicaciones: {error}</p>}
        {!panel ? <div className="ga-load"><span className="spinner sm" />Cargando…</div>
          : tab === 'avisos' ? <Avisos d={panel} /> : tab === 'interesados' ? <Interesados /> : <Portales />}
      </div>
    </Layout>
  );
}
