// Leads: la bandeja de conversaciones (WhatsApp, Instagram, correo) con KPIs, filtros y lista.
// Hecha con el kit: Layout (cabecera con ilustración y, en la barra, los KPIs que filtran), Boton, Buscador y Select.
//
// La conversación y la ficha del lead (columnas #ldChat y #ldFicha) siguen en src/renderer/leads.js:
// React deja esos dos contenedores vacíos y nunca dibuja dentro. Puente en los dos sentidos:
//  - React → leads.js: mostrarLead() con el elegido y los datos de la lista (los usa la ficha).
//  - leads.js → React: el evento «pf:leads» (al guardar, asignar, importar…) pide recargar la lista.
// Los id ldQ, ldChips (con data-f en cada filtro), ldKs, ldItems, ldOrigen, ldBroker, ldFile, ldFileIg, ldCorBtn,
// ldCuentas, ldImp2, ldIg2 y la clase .ld-vacio los usan las pruebas y leads.js.
import { useEffect, useRef } from 'react';
import { useLead } from '../../../store/hooks/useLead.hook';
import { leadsComoExportar, leadsComoInstagram, leadsCuentas, leadsImportar, mostrarLead, rutaDe } from '../../../utils/app';
import { cx } from '../../../utils/cx';
import { abrirUsuarios } from '../usuarios/controlador';
import Layout from '../../ui/Layout';
import Boton from '../../ui/Boton';
import Buscador from '../../ui/Buscador';
import Select from '../../ui/Select';
import Icono from '../../ui/Icono';
import LeadItem from './LeadItem';
import { FILTROS } from './formato';
import type { TLeadFiltro } from '../../../store/interfaces/lead.interface';

interface ILeadsProps {
  sel?: string | null; // al abrir un lead desde otra pantalla o después de importar
  filtro?: TLeadFiltro;
}

// un KPI que además filtra la lista (el Kpi del kit no se puede tocar): mismo aspecto que una Card del kit
function KpiFiltro({ n, t, s, on, alTocar, filtro }: { n?: number; t: string; s?: string; on: boolean; alTocar: () => void; filtro: TLeadFiltro }) {
  return (
    <button type="button" data-f={filtro} aria-pressed={on} onClick={alTocar}
      className={cx(
        'tw:flex tw:flex-col tw:items-start tw:gap-0.5 tw:m-0 tw:px-5 tw:py-3 tw:text-left tw:rounded-2xl tw:cursor-pointer',
        'tw:border tw:border-solid tw:border-b-[3px] tw:transition-colors tw:duration-100',
        'tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-lav-edge',
        on ? 'tw:bg-lav-soft tw:border-lav-edge tw:text-lav-softink' : 'tw:bg-card tw:border-edge tw:border-b-edge-b tw:text-text tw:hover:bg-hover',
      )}>
      <b className="tw:text-2xl tw:font-bold tw:leading-tight tw:tabular-nums">{n ?? 0}</b>
      <span className={cx('tw:text-sm tw:font-semibold', !on && 'tw:text-muted')}>{t}</span>
      {s && <small className={cx('tw:text-xs', on ? 'tw:opacity-80' : 'tw:text-muted')}>{s}</small>}
    </button>
  );
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
  const kpi = (filtro: TLeadFiltro) => ({ filtro, on: f.filtro === filtro, alTocar: () => leadSetFiltros({ filtro }) });
  const cajaFiltro = 'tw:h-9 tw:pl-2.5 tw:pr-7 tw:text-[13px]';
  // las tres columnas con el borde de una Card del kit (react-ui.css va después de styles.css: gana a .ld-lista…)
  const columna = 'tw:rounded-2xl tw:border-edge tw:border-b-[3px] tw:border-b-edge-b';

  return (
    <Layout
      className="ld-wrap"
      titulo="Leads"
      ilustracion={{ imagen: 'img/formas/personas.svg', tinte: '#13a35b' }}
      subtitulo="Tus conversaciones con clientes por WhatsApp, Instagram y correo: qué buscan, en qué quedaron y qué sigue."
      acciones={<>
        <Boton id="ldImp" icono="upload" onClick={() => archivo.current?.click()}>Importar chat</Boton>
        <Boton variante="secundario" id="ldCuentas" icono="link" onClick={leadsCuentas}>Cuentas e historial</Boton>
        <Boton variante="secundario" id="ldComo" icono="help" onClick={leadsComoExportar}>Cómo exportar un chat</Boton>
        <Boton variante="secundario" id="ldCorBtn" icono="users" title="El equipo de la corredora: a quién pertenece cada lead" onClick={abrirUsuarios}>Usuarios</Boton>
        <input ref={archivo} type="file" id="ldFile" accept=".txt,.zip,text/plain,application/zip" className="hidden" onChange={(e) => importar(e.target)} />
        <input ref={archivoIg} type="file" id="ldFileIg" accept=".zip,application/zip" className="hidden" onChange={(e) => importar(e.target, 'instagram')} />
      </>}
      barra={
        <div id="ldKs" className="tw:grid tw:w-full tw:grid-cols-2 tw:lg:grid-cols-4 tw:gap-3">
          <KpiFiltro n={k?.abiertos} t="abiertos" {...kpi('abiertos')} />
          <KpiFiltro n={k?.nuevos} t="nuevos" s="sin trabajar" {...kpi('nuevo')} />
          <KpiFiltro n={k?.seguimiento} t="por seguir" s="sin respuesta o acción vencida" {...kpi('seguimiento')} />
          <KpiFiltro n={k?.visitas} t="con visita" s="agendada" {...kpi('visita')} />
        </div>
      }
    >
      {error && <p role="alert" className="tw:m-0 tw:text-red-softink">No se pudieron leer los leads: {error}</p>}

      <div className="ld-cols">
        <div className={cx('ld-lista', columna)}>
          <div className="tw:flex tw:flex-col tw:gap-2.5 tw:p-3 tw:border-0 tw:border-b tw:border-solid tw:border-edge">
            <Buscador kit id="ldQ" className="tw:w-full" valor={f.q} alCambiar={(q) => leadSetFiltros({ q })} espera={200} placeholder="Nombre, teléfono, comuna o mensaje" />
            {/* fichas de una sola opción (Chips del kit es de selección múltiple y Tabs no cabe en esta columna) */}
            <div id="ldChips" role="group" aria-label="Estado del lead" className="tw:flex tw:flex-wrap tw:gap-1.5">
              {FILTROS.map(([k2, t]) => {
                const on = f.filtro === k2;
                return (
                  <button key={k2} type="button" data-f={k2} aria-pressed={on} onClick={() => leadSetFiltros({ filtro: k2 as TLeadFiltro })}
                    className={cx(
                      'tw:inline-flex tw:items-center tw:h-7 tw:m-0 tw:px-2.5 tw:rounded-full tw:text-[12.5px] tw:font-semibold tw:cursor-pointer',
                      'tw:border tw:border-solid tw:transition-colors tw:duration-100 tw:focus-visible:outline-2 tw:focus-visible:outline-offset-1 tw:focus-visible:outline-lav-edge',
                      on ? 'tw:bg-lav-soft tw:text-lav-softink tw:border-lav-edge' : 'tw:bg-card tw:text-muted tw:border-edge tw:hover:text-text tw:hover:bg-hover',
                    )}>
                    {t}
                  </button>
                );
              })}
            </div>
            <div className="tw:flex tw:gap-2">
              <Select id="ldOrigen" aria-label="Origen" clasesCampo="tw:flex-1 tw:min-w-0" className={cajaFiltro}
                value={f.origen} onChange={(e) => leadSetFiltros({ origen: e.target.value })}
                vacia="Todos los orígenes" opciones={Object.entries(datos?.origenes || {})} />
              {datos?.corredores.length ? (
                <Select id="ldBroker" aria-label="Corredor" clasesCampo="tw:flex-1 tw:min-w-0" className={cajaFiltro}
                  value={f.broker} onChange={(e) => leadSetFiltros({ broker: e.target.value })} vacia="Todos los corredores">
                  <option value="_sin">Sin corredor{datos.sinCorredor ? ` (${datos.sinCorredor})` : ''}</option>
                  {datos.corredores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </Select>
              ) : (
                <Select id="ldBroker" aria-label="Broker" className={cajaFiltro}
                  clasesCampo={cx('tw:flex-1 tw:min-w-0', (datos?.brokers.length || 0) < 2 && 'hidden')}
                  value={f.broker} onChange={(e) => leadSetFiltros({ broker: e.target.value })}
                  vacia="Todos los brokers" opciones={(datos?.brokers || []).map((b): [string, string] => [b, b])} />
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
            <div className={cx('ld-chat', columna)} id="ldChat" key="chat" />
            <div className={cx('ld-ficha', columna)} id="ldFicha" key="ficha" />
          </>
        ) : cargado && (
          <>
            <div className={cx('ld-chat', columna)} key="vacio">
              {/* los botones van fuera de .ld-vacio: su regla «.ld-vacio svg» pintaría de verde los íconos del kit */}
              <div className="tw:flex tw:flex-col tw:items-center tw:m-auto tw:pb-7">
                <div className="ld-vacio tw:pb-3">
                  <Icono nombre="whatsapp" tam={36} />
                  <h2>Guarda aquí tus conversaciones con clientes</h2>
                  <p className="muted">Exporta un chat de WhatsApp o el historial de Instagram y arrástralo a esta ventana. Asset lo ordena, entiende qué busca el cliente y te dice qué sigue.</p>
                  <div className="ld-pasos">
                    <div><b>iPhone</b><span>Abre el chat › toca el nombre arriba › <i>Exportar chat</i> › <i>Sin archivos</i> o <i>Incluir archivos</i>.</span></div>
                    <div><b>Android</b><span>Abre el chat › ⋮ › <i>Más</i> › <i>Exportar chat</i> › <i>Sin archivos</i> o <i>Incluir archivos</i>.</span></div>
                  </div>
                </div>
                <div className="tw:flex tw:flex-wrap tw:justify-center tw:gap-2">
                  <Boton id="ldImp2" icono="upload" onClick={() => archivo.current?.click()}>Importar chat</Boton>
                  <Boton variante="secundario" id="ldIg2" icono="instagram" onClick={leadsComoInstagram}>Historial de Instagram</Boton>
                </div>
              </div>
            </div>
            <div className={cx('ld-ficha', columna)} key="vacio-ficha" />
          </>
        )}
      </div>
    </Layout>
  );
}
