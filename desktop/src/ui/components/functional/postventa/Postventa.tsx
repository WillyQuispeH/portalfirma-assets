// Postventa (MVP): reclamos de propietarios con su garantía legal, atención por WhatsApp (wechatia), unidades
// entregadas (planilla Excel), cómo habla el asistente y contratistas.
//
// El detalle del reclamo con su «¿Qué sigue?», «Nuevo reclamo» y «Nuevo contratista» siguen en
// src/renderer/postventa.js. Cuando algo cambia allá (o llega un mensaje por WhatsApp), postventa.js dispara
// el evento «pf:postventa» y React recarga. Los id pvTabs, pvBody, pvNuevo y la clase pv-ks los usan las pruebas.
import { useEffect } from 'react';
import Icono from '../../ui/Icono';
import { usePostventa } from '../../../store/hooks/usePostventa.hook';
import { nuevoReclamo } from '../../../utils/app';
import Asistente from './Asistente';
import Reclamos from './Reclamos';
import WhatsApp from './WhatsApp';
import { Contratistas, Unidades } from './Pestanas';
import type { TPvFiltro, TPvTab } from '../../../store/interfaces/postventa.interface';

const TABS: [TPvTab, string][] = [['reclamos', 'Reclamos'], ['unidades', 'Unidades'], ['whatsapp', 'WhatsApp'], ['asistente', 'Asistente'], ['contratistas', 'Contratistas']];

function K({ n, l, s }: { n?: number | string | null; l: string; s?: string }) {
  return <div className="pv-k"><b>{n ?? '—'}</b><span>{l}</span>{s && <small>{s}</small>}</div>;
}

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
  return (
    <div className="im-wrap pv-wrap">
      <div className="pv-h">
        <div><h1>Postventa</h1><p className="muted">Reclamos de propietarios con su garantía legal, atendidos por WhatsApp.</p></div>
        <span className="spacer" />
        <span className={`pv-wa ${atendiendo ? 'on' : ''}`}><Icono nombre="whatsapp" tam={14} /> {atendiendo ? 'WhatsApp atendiendo' : 'WhatsApp en pausa'}</span>
        <button className="primary" id="pvNuevo" onClick={nuevoReclamo}><Icono nombre="plus" tam={15} /> Nuevo reclamo</button>
      </div>
      <div className="pv-ks">
        <K n={t?.abiertos} l="abiertos" s={t?.urgentes ? `${t.urgentes} urgentes` : ''} />
        <K n={t?.whatsapp} l="por WhatsApp" />
        <K n={t?.cierrePromedioDias} l="días promedio al cierre" />
        <K n={t?.satisfaccion != null ? `${t.satisfaccion}/5` : null} l="satisfacción" />
        <K n={t?.unidades} l="unidades en garantía" s={t?.proyectos ? `${t.proyectos} proyectos` : ''} />
      </div>
      <div className="pb-tabs" id="pvTabs">
        {TABS.map(([k, l]) => <button key={k} data-t={k} className={tab === k ? 'on' : ''} onClick={() => pvSetTab(k)}>{l}</button>)}
      </div>
      <div id="pvBody">
        {error && <p className="error">{error}</p>}
        {tab === 'reclamos' ? <Reclamos /> : tab === 'unidades' ? <Unidades /> : tab === 'whatsapp' ? <WhatsApp key={config ? 'c' : 'n'} /> : tab === 'asistente' ? <Asistente key={config ? 'c' : 'n'} /> : <Contratistas />}
      </div>
    </div>
  );
}
