// Postventa (MVP): reclamos de propietarios con su garantía legal, atención por WhatsApp (wechatia), unidades
// entregadas (planilla Excel), cómo habla el asistente y contratistas.
// Hecha con el kit: Layout (cabecera con ilustración y, en la barra, los KPIs y las pestañas), Boton, Badge, Kpi y Tabs.
//
// El detalle del reclamo con su «¿Qué sigue?», «Nuevo reclamo» y «Nuevo contratista» siguen en
// src/renderer/postventa.js. Cuando algo cambia allá (o llega un mensaje por WhatsApp), postventa.js dispara
// el evento «pf:postventa» y React recarga. Los id pvTabs (con data-t en cada pestaña), pvBody, pvNuevo y las
// clases pv-ks y pv-wa (.on si atiende) los usan las pruebas.
import { useEffect } from 'react';
import Layout from '../../ui/Layout';
import Boton from '../../ui/Boton';
import Badge from '../../ui/Badge';
import Kpi from '../../ui/Kpi';
import Tabs from '../../ui/Tabs';
import { cx } from '../../../utils/cx';
import { usePostventa } from '../../../store/hooks/usePostventa.hook';
import { nuevoReclamo } from '../../../utils/app';
import Asistente from './Asistente';
import Reclamos from './Reclamos';
import WhatsApp from './WhatsApp';
import { Contratistas, Unidades } from './Pestanas';
import type { TPvFiltro, TPvTab } from '../../../store/interfaces/postventa.interface';

const TABS: [TPvTab, string][] = [['reclamos', 'Reclamos'], ['unidades', 'Unidades'], ['whatsapp', 'WhatsApp'], ['asistente', 'Asistente'], ['contratistas', 'Contratistas']];

export default function Postventa({ tab: tabInicial }: { tab?: TPvTab }) {
  const { tab, tablero: t, config, error, pvAbrir, pvSetTab } = usePostventa();

  useEffect(() => {
    pvAbrir({ tab: tabInicial });
    // postventa.js pide recargar (después de mover un reclamo, crear uno, o al llegar mensajes)
    const recargar = (e: Event) => {
      const d = (e as CustomEvent<{ tab?: TPvTab; sel?: string | null; filtro?: TPvFiltro }>).detail || {};
      pvAbrir(d);
    };
    window.addEventListener('pf:postventa', recargar);
    return () => window.removeEventListener('pf:postventa', recargar);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- solo al montar

  const atendiendo = !!(config?.auto && config.conectado);
  // el KPI del kit tiene un solo texto: el detalle (urgentes, proyectos) va a continuación
  const texto = (l: string, s?: string) => (s ? `${l} · ${s}` : l);
  return (
    <Layout
      className="pv-wrap"
      titulo="Postventa"
      ilustracion={{ imagen: 'img/formas/etapa.svg', tinte: '#0e9488' }}
      subtitulo="Reclamos de propietarios con su garantía legal, atendidos por WhatsApp."
      acciones={<>
        <Boton id="pvNuevo" icono="plus" onClick={nuevoReclamo}>Nuevo reclamo</Boton>
        {/* tw:border-0: sin el borde de .pv-wa (styles.css); .pv-wa.on la pinta de verde */}
        <Badge tono={atendiendo ? 'verde' : 'gris'} icono="whatsapp" className={cx('pv-wa tw:border-0', atendiendo && 'on')}>
          {atendiendo ? 'WhatsApp atendiendo' : 'WhatsApp en pausa'}
        </Badge>
      </>}
      barra={<>
        <div className="ng-kpis pv-ks tw:w-full tw:m-0">
          <Kpi icono="alert" valor={t?.abiertos ?? '—'} texto={texto('abiertos', t?.urgentes ? `${t.urgentes} urgentes` : '')} alerta={!!t?.urgentes} />
          <Kpi icono="whatsapp" valor={t?.whatsapp ?? '—'} texto="por WhatsApp" />
          <Kpi icono="clock" valor={t?.cierrePromedioDias ?? '—'} texto="días promedio al cierre" />
          <Kpi icono="check" valor={t?.satisfaccion != null ? `${t.satisfaccion}/5` : '—'} texto="satisfacción" />
          <Kpi icono="building" valor={t?.unidades ?? '—'} texto={texto('unidades en garantía', t?.proyectos ? `${t.proyectos} proyectos` : '')} />
        </div>
        <Tabs id="pvTabs" dato="t" etiqueta="Secciones" opciones={TABS} valor={tab} alCambiar={pvSetTab} className="tw:max-w-full tw:overflow-x-auto" />
      </>}
    >
      <div id="pvBody" className="tw:flex tw:min-w-0 tw:flex-col tw:gap-4">
        {error && <p role="alert" className="tw:m-0 tw:text-red-softink">{error}</p>}
        {tab === 'reclamos' ? <Reclamos /> : tab === 'unidades' ? <Unidades /> : tab === 'whatsapp' ? <WhatsApp key={config ? 'c' : 'n'} /> : tab === 'asistente' ? <Asistente key={config ? 'c' : 'n'} /> : <Contratistas />}
      </div>
    </Layout>
  );
}
