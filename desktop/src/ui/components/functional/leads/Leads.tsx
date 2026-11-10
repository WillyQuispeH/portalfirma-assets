// Leads: la bandeja de conversaciones (WhatsApp, Instagram, correo) con KPIs, filtros y lista.
// Hecha con el kit: Layout (cabecera con ilustración), Boton, Buscador y Select. Los filtros de la lista llevan su número
// (antes eran 4 tarjetas arriba: se quitaron para dar el alto a la bandeja).
//
// La conversación y la ficha del lead (columnas #ldChat y #ldFicha) siguen en src/renderer/leads.js:
// React deja esos dos contenedores vacíos y nunca dibuja dentro. Puente en los dos sentidos:
//  - React → leads.js: mostrarLead() con el elegido y los datos de la lista (los usa la ficha).
//  - leads.js → React: el evento «pf:leads» (al guardar, asignar, importar…) pide recargar la lista.
// Los id ldQ, ldChips (con data-f en cada filtro), ldItems, ldOrigen, ldBroker, ldFile, ldFileIg, ldCorBtn,
// ldCuentas, ldImp2, ldIg2 y la clase .ld-vacio los usan las pruebas y leads.js.
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useLead } from '../../../store/hooks/useLead.hook';
import { leadsComoExportar, leadsComoInstagram, leadsCuentas, leadsImportar, mostrarLead, rutaDe } from '../../../utils/app';
import { cx } from '../../../utils/cx';
import { abrirUsuarios } from '../usuarios/controlador';
import Layout from '../../ui/Layout';
import Boton from '../../ui/Boton';
import Buscador from '../../ui/Buscador';
import Select from '../../ui/Select';
import Icono from '../../ui/Icono';
import EstadoVacio from '../../ui/EstadoVacio';
import LeadItem from './LeadItem';
import { FILTROS } from './formato';
import type { TLeadFiltro } from '../../../store/interfaces/lead.interface';

const PASOS: [string, ReactNode][] = [
  ['iPhone', <>Abre el chat › toca el nombre arriba › <b>Exportar chat</b> › <b>Sin archivos</b> o <b>Incluir archivos</b>.</>],
  ['Android', <>Abre el chat › ⋮ › <b>Más</b> › <b>Exportar chat</b> › <b>Sin archivos</b> o <b>Incluir archivos</b>.</>],
];

interface ILeadsProps {
  sel?: string | null; // al abrir un lead desde otra pantalla o después de importar
  filtro?: TLeadFiltro;
}

/** alto de las columnas: desde donde empiezan hasta el borde de abajo de la ventana (en pantallas anchas) */
function useAltoHastaAbajo() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const medir = () => {
      if (!el.offsetParent || window.innerWidth <= 1180) { el.style.height = ''; return; } // oculta o angosta: la de styles.css
      const arriba = el.getBoundingClientRect().top + window.scrollY;
      el.style.height = `${Math.max(460, window.innerHeight - arriba - 20)}px`;
    };
    medir();
    const obs = new ResizeObserver(medir); obs.observe(document.body);
    window.addEventListener('resize', medir);
    return () => { obs.disconnect(); window.removeEventListener('resize', medir); };
  }, []);
  return ref;
}

export default function Leads({ sel: selInicial, filtro: filtroInicial }: ILeadsProps) {
  const { datos, sel, cargado, error, filtros: f, leadGetAll, leadSetFiltros, leadSeleccionar } = useLead();
  const archivo = useRef<HTMLInputElement>(null);
  const archivoIg = useRef<HTMLInputElement>(null);
  const columnas = useAltoHastaAbajo();
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

  // cuántos hay en cada filtro (al lado de su nombre) y qué significa cada uno (en el globo)
  const k = datos?.kpis;
  const cuantos: Record<string, number | undefined> = {
    abiertos: k?.abiertos, nuevo: k?.nuevos, seguimiento: k?.seguimiento, visita: k?.visitas,
    ganado: datos?.cuenta.ganado, perdido: datos?.cuenta.perdido, todos: datos ? total : undefined,
  };
  const AYUDA: Record<string, string> = { nuevo: 'Sin trabajar', seguimiento: 'Sin respuesta o con la acción vencida', visita: 'Con visita agendada' };
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
    >
      {error && <p role="alert" className="tw:m-0 tw:text-red-softink">No se pudieron leer los leads: {error}</p>}

      <div className="ld-cols" ref={columnas}>
        <div className={cx('ld-lista', columna)}>
          <div className="tw:flex tw:flex-col tw:gap-2.5 tw:p-3 tw:border-0 tw:border-b tw:border-solid tw:border-edge">
            <Buscador kit id="ldQ" className="tw:w-full" valor={f.q} alCambiar={(q) => leadSetFiltros({ q })} espera={200} placeholder="Nombre, teléfono, comuna o mensaje" />
            {/* fichas de una sola opción (Chips del kit es de selección múltiple y Tabs no cabe en esta columna) */}
            <div id="ldChips" role="group" aria-label="Estado del lead" className="tw:flex tw:flex-wrap tw:gap-1.5">
              {FILTROS.map(([k2, t]) => {
                const on = f.filtro === k2; const n = cuantos[k2];
                return (
                  <button key={k2} type="button" data-f={k2} aria-pressed={on} title={AYUDA[k2]} onClick={() => leadSetFiltros({ filtro: k2 as TLeadFiltro })}
                    className={cx(
                      'tw:inline-flex tw:items-center tw:h-7 tw:m-0 tw:px-2.5 tw:rounded-full tw:text-[12.5px] tw:font-semibold tw:cursor-pointer',
                      'tw:border tw:border-solid tw:transition-colors tw:duration-100 tw:focus-visible:outline-2 tw:focus-visible:outline-offset-1 tw:focus-visible:outline-lav-edge',
                      on ? 'tw:bg-lav-soft tw:text-lav-softink tw:border-lav-edge' : 'tw:bg-card tw:text-muted tw:border-edge tw:hover:text-text tw:hover:bg-hover',
                    )}>
                    {t}
                    {n != null && <span className={cx('tw:ml-1.5 tw:min-w-[18px] tw:h-[18px] tw:px-1 tw:rounded-full tw:text-[11px] tw:leading-[18px] tw:text-center tw:tabular-nums',
                      on ? 'tw:bg-card tw:text-lav-softink' : 'tw:bg-gray-soft tw:text-gray-softink')}>{n}</span>}
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
              : <EstadoVacio compacto texto="No hay leads con este filtro." className="tw:p-4" />)}
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
              <div className="ld-vacio tw:m-auto tw:flex tw:max-w-[520px] tw:flex-col tw:items-center tw:gap-2 tw:p-7 tw:text-center">
                <span className="tw:grid tw:size-14 tw:place-items-center tw:rounded-2xl tw:border tw:border-solid tw:border-green-edge/40 tw:border-b-[3px] tw:border-b-green-edge tw:bg-green-soft tw:text-green-softink">
                  <Icono nombre="whatsapp" tam={28} />
                </span>
                <h2 className="tw:mt-2 tw:mb-0 tw:text-lg tw:font-bold tw:text-text">Guarda aquí tus conversaciones con clientes</h2>
                <p className="tw:m-0 tw:text-sm tw:leading-relaxed tw:text-muted">Exporta un chat de WhatsApp o el historial de Instagram y arrástralo a esta ventana. Asset lo ordena, entiende qué busca el cliente y te dice qué sigue.</p>
                <div className="tw:my-2 tw:grid tw:w-full tw:gap-2 tw:text-left">
                  {PASOS.map(([so, texto]) => (
                    <div key={so} className="tw:flex tw:gap-3 tw:rounded-xl tw:border tw:border-solid tw:border-edge tw:border-b-2 tw:border-b-edge-b tw:bg-sunken tw:px-3 tw:py-2.5 tw:text-[13px] tw:leading-relaxed">
                      <b className="tw:w-16 tw:flex-none">{so}</b><span>{texto}</span>
                    </div>
                  ))}
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
