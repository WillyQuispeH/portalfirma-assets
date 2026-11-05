// Leads: la bandeja de conversaciones (WhatsApp, Instagram, correo) con KPIs, filtros y lista.
//
// La conversación y la ficha del lead (columnas #ldChat y #ldFicha) siguen en src/renderer/leads.js:
// React deja esos dos contenedores vacíos y nunca dibuja dentro. Puente en los dos sentidos:
//  - React → leads.js: mostrarLead() con el elegido y los datos de la lista (los usa la ficha).
//  - leads.js → React: el evento «pf:leads» (al guardar, asignar, importar…) pide recargar la lista.
// Los id ldQ, ldChips, ldKs, ldItems, ldOrigen, ldBroker, ldFile, ldFileIg los usan las pruebas y leads.js.
import { useEffect, useRef } from 'react';
import { useLead } from '../../../store/hooks/useLead.hook';
import { leadsComoExportar, leadsComoInstagram, leadsCuentas, leadsImportar, mostrarLead, rutaDe } from '../../../utils/app';
import { abrirUsuarios } from '../usuarios/controlador';
import Buscador from '../../ui/Buscador';
import Icono from '../../ui/Icono';
import LeadItem from './LeadItem';
import { FILTROS } from './formato';
import type { TLeadFiltro } from '../../../store/interfaces/lead.interface';

interface ILeadsProps {
  sel?: string | null; // al abrir un lead desde otra pantalla o después de importar
  filtro?: TLeadFiltro;
}

export default function Leads({ sel: selInicial, filtro: filtroInicial }: ILeadsProps) {
  const { datos, sel, cargado, error, filtros: f, leadGetAll, leadSetFiltros, leadSeleccionar } = useLead();
  const archivo = useRef<HTMLInputElement>(null);
  const archivoIg = useRef<HTMLInputElement>(null);
  // el filtro actual, para el listener (vive mientras la pantalla esté montada y no debe ver un valor viejo)
  const filtroRef = useRef(f.filtro); filtroRef.current = f.filtro;

  useEffect(() => {
    if (selInicial) leadSeleccionar(selInicial);
    if (filtroInicial && filtroInicial !== f.filtro) leadSetFiltros({ filtro: filtroInicial }); // también recarga
    else leadGetAll();
    // leads.js pide recargar (con el elegido y el filtro que haya fijado, p. ej. después de importar)
    const recargar = (e: Event) => {
      const d = (e as CustomEvent<{ sel?: string | null; filtro?: TLeadFiltro }>).detail || {};
      if (d.sel !== undefined) leadSeleccionar(d.sel);
      if (d.filtro && d.filtro !== filtroRef.current) leadSetFiltros({ filtro: d.filtro });
      else leadGetAll();
    };
    window.addEventListener('pf:leads', recargar);
    return () => window.removeEventListener('pf:leads', recargar);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- solo al montar


  const total = datos ? Object.values(datos.cuenta).reduce((a, b) => a + b, 0) : 0;
  const hayLeads = cargado && total > 0;

  // cada vez que cambia la lista o el elegido, leads.js dibuja la conversación y la ficha
  useEffect(() => {
    if (hayLeads && datos) mostrarLead(sel, datos, f.filtro);
  }, [hayLeads, datos, sel]); // eslint-disable-line react-hooks/exhaustive-deps -- el filtro va con los datos

  const importar = (input: HTMLInputElement | null, canal?: string) => {
    const a = input?.files?.[0]; if (input) input.value = '';
    if (a) leadsImportar(rutaDe(a), canal);
  };

  const k = datos?.kpis;
  const Kpi = ({ n, t, s, filtro }: { n?: number; t: string; s?: string; filtro: TLeadFiltro }) => (
    <button className={`pv-k ld-k ${f.filtro === filtro ? 'on' : ''}`} data-f={filtro} onClick={() => leadSetFiltros({ filtro })}>
      <b>{n ?? 0}</b><span>{t}</span>{s && <small>{s}</small>}
    </button>
  );

  return (
    <div className="im-wrap ld-wrap">
      <div className="pv-h">
        <div>
          <h1>Leads</h1>
          <p className="muted">Tus conversaciones con clientes por WhatsApp, Instagram y correo: qué buscan, en qué quedaron y qué sigue.</p>
        </div>
        <span className="spacer" />
        <button className="secondary" id="ldCorBtn" title="El equipo de la corredora: a quién pertenece cada lead" onClick={abrirUsuarios}><Icono nombre="users" tam={15} /> Usuarios</button>
        <button className="secondary" id="ldCuentas" onClick={leadsCuentas}><Icono nombre="link" tam={15} /> Cuentas e historial</button>
        <button className="secondary" id="ldComo" onClick={leadsComoExportar}><Icono nombre="help" tam={15} /> Cómo exportar un chat</button>
        <button className="primary" id="ldImp" onClick={() => archivo.current?.click()}><Icono nombre="upload" tam={15} /> Importar chat</button>
        <input ref={archivo} type="file" id="ldFile" accept=".txt,.zip,text/plain,application/zip" className="hidden" onChange={(e) => importar(e.target)} />
        <input ref={archivoIg} type="file" id="ldFileIg" accept=".zip,application/zip" className="hidden" onChange={(e) => importar(e.target, 'instagram')} />
      </div>

      <div className="pv-ks ld-ks" id="ldKs">
        <Kpi n={k?.abiertos} t="abiertos" filtro="abiertos" />
        <Kpi n={k?.nuevos} t="nuevos" s="sin trabajar" filtro="nuevo" />
        <Kpi n={k?.seguimiento} t="por seguir" s="sin respuesta o acción vencida" filtro="seguimiento" />
        <Kpi n={k?.visitas} t="con visita" s="agendada" filtro="visita" />
      </div>

      {error && <p className="error">No se pudieron leer los leads: {error}</p>}

      <div className="ld-cols">
        <div className="ld-lista">
          <div className="ld-fil">
            <Buscador id="ldQ" clase="ac-q" valor={f.q} alCambiar={(q) => leadSetFiltros({ q })} espera={200} placeholder="Nombre, teléfono, comuna o mensaje" />
            <div className="ga-chips ld-chips" id="ldChips">
              {FILTROS.map(([k2, t]) => <button key={k2} data-f={k2} className={f.filtro === k2 ? 'on' : ''} onClick={() => leadSetFiltros({ filtro: k2 as TLeadFiltro })}>{t}</button>)}
            </div>
            <div className="ld-sel">
              <select id="ldOrigen" value={f.origen} onChange={(e) => leadSetFiltros({ origen: e.target.value })}>
                <option value="">Todos los orígenes</option>
                {Object.entries(datos?.origenes || {}).map(([k2, t]) => <option key={k2} value={k2}>{t}</option>)}
              </select>
              {datos?.corredores.length ? (
                <select id="ldBroker" value={f.broker} onChange={(e) => leadSetFiltros({ broker: e.target.value })}>
                  <option value="">Todos los corredores</option>
                  <option value="_sin">Sin corredor{datos.sinCorredor ? ` (${datos.sinCorredor})` : ''}</option>
                  {datos.corredores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              ) : (
                <select id="ldBroker" value={f.broker} onChange={(e) => leadSetFiltros({ broker: e.target.value })} className={(datos?.brokers.length || 0) < 2 ? 'hidden' : ''}>
                  <option value="">Todos los brokers</option>
                  {(datos?.brokers || []).map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              )}
            </div>
          </div>
          <div id="ldItems" className="ld-items">
            {hayLeads && (datos!.leads.length
              ? datos!.leads.map((l) => <LeadItem key={l.id} l={l} elegido={l.id === sel} verCorredor={!!datos!.corredores.length} alElegir={() => leadSeleccionar(l.id)} />)
              : <p className="muted small ld-nada">No hay leads con este filtro.</p>)}
          </div>
        </div>

        {hayLeads ? (
          <>
            {/* los llena src/renderer/leads.js (detalle): React no dibuja dentro */}
            <div className="ld-chat" id="ldChat" key="chat" />
            <div className="ld-ficha" id="ldFicha" key="ficha" />
          </>
        ) : cargado && (
          <>
            <div className="ld-chat" key="vacio">
              <div className="ld-vacio">
                <Icono nombre="whatsapp" tam={36} />
                <h2>Guarda aquí tus conversaciones con clientes</h2>
                <p className="muted">Exporta un chat de WhatsApp o el historial de Instagram y arrástralo a esta ventana. Asset lo ordena, entiende qué busca el cliente y te dice qué sigue.</p>
                <div className="ld-pasos">
                  <div><b>iPhone</b><span>Abre el chat › toca el nombre arriba › <i>Exportar chat</i> › <i>Sin archivos</i> o <i>Incluir archivos</i>.</span></div>
                  <div><b>Android</b><span>Abre el chat › ⋮ › <i>Más</i> › <i>Exportar chat</i> › <i>Sin archivos</i> o <i>Incluir archivos</i>.</span></div>
                </div>
                <div className="row tw:justify-center">
                  <button className="primary" id="ldImp2" onClick={() => archivo.current?.click()}><Icono nombre="upload" tam={15} /> Importar chat</button>
                  <button className="secondary" id="ldIg2" onClick={leadsComoInstagram}><Icono nombre="instagram" tam={15} /> Historial de Instagram</button>
                </div>
              </div>
            </div>
            <div className="ld-ficha" key="vacio-ficha" />
          </>
        )}
      </div>
    </div>
  );
}
