// Gestión documental › Firmas presenciales (trámites notariales del cliente final). Portalfirma es el puente
// entre el cliente y la notaría:
//   1 Trámite (escritura pública · protocolización · reducción a escritura pública)
//   2 Documento (minuta Word, o el documento privado en Word, PDF o foto)
//   3 Revisión: materia según la planilla de precios, actos adicionales, observaciones con corrección de un clic,
//     comparecientes (quién asiste a firmar y su contacto)
//   4 Vista previa: escritura con formato notarial o carátula de protocolización
//   5 Notaría y pago con el saldo de la cuenta → la notaría recibe los archivos. Repertorio, número, fecha y datos
//     del notario los completa la notaría: quedan marcados [ ] en los documentos.
// Diseño de lista + detalle, como «Mis operaciones». Estilos con Tailwind (tw:, ver estilos.ts); la raíz .es pone
// el estilo de los botones y campos de la pantalla (styles/globals.css). Los id y las clases es-* que quedan los usan las pruebas.
import Icono from '../../../ui/Icono';
import { Chip } from './Visor';
import { ElegirTramite, SubirDocumento } from './Inicio';
import Trabajo from './Trabajo';
import DetalleTramite from './DetalleTramite';
import { useEscritura } from '../../../../store/hooks/useEscritura.hook';
import Reglas from './Reglas';
import { COLOR_ESTADO, TRAMITES, fechaCorta, hayDocumento, tituloDoc } from '../../../../utils/escrituras';
import { esAdministrador, nuevoTramite } from './controlador';
import { cx } from '../../../../utils/cx';
import { PANEL } from './estilos';

const DETALLE = cx(PANEL, 'tw:py-[22px] tw:px-6 tw:min-w-0 tw:min-h-[520px]');
// Un elemento de la lista; el elegido lleva una barra a la izquierda. es-item y on los usan las pruebas.
const elemento = (on: boolean, admin = false) => cx('es-item tw:w-full tw:flex tw:items-center tw:gap-[11px] tw:py-[11px] tw:px-3 tw:rounded-[14px]! tw:text-left tw:text-text tw:relative',
  admin ? 'tw:m-2 tw:mt-auto tw:border-t-line tw:[border-top-style:dashed]' : 'tw:m-0',
  on ? "on tw:bg-[color-mix(in_srgb,var(--brand)_7%,var(--card))] tw:border-[color-mix(in_srgb,var(--brand)_18%,transparent)] tw:before:content-[''] tw:before:absolute tw:before:-left-px tw:before:top-2.5 tw:before:bottom-2.5 tw:before:w-[3px] tw:before:rounded-[3px] tw:before:bg-brand"
    : 'tw:bg-transparent tw:hover:bg-[color-mix(in_srgb,var(--brand)_4%,var(--card))]');
const ICONO = 'tw:size-9 tw:rounded-[11px] tw:grid tw:place-items-center tw:shrink-0';
const ICONO_OK = 'tw:bg-[color-mix(in_srgb,var(--ok)_10%,var(--card))] tw:text-ok';
const TEXTO = 'xp-tx tw:flex-1 tw:min-w-0';
const TITULO = 'tw:font-semibold tw:text-[13.5px]';

// El panel de reglas de detección (interno de Portalfirma, Reglas.tsx). Al cambiar una regla se vuelven a cargar
// en el motor notarial.
function PanelReglas() {
  const { escrituraRecargarReglas } = useEscritura();
  return <section className={DETALLE} id="esBody"><Reglas alCambiar={escrituraRecargarReglas} /></section>;
}

function Detalle() {
  const S = useEscritura();
  if (S.sel && S.sel !== 'draft') { const o = S.ops.find((x) => x.operation === S.sel); if (o) return <DetalleTramite key={o.operation} o={o} />; }
  if (!S.tramite || S.paso === 'tramite') return <ElegirTramite />;
  if (!hayDocumento(S) || S.paso === 'doc') return <SubirDocumento />;
  return <Trabajo />;
}

export default function FirmasPresenciales() {
  const S = useEscritura();
  const q = S.q.toLowerCase();
  const borrador = !!S.tramite || S.sel === 'draft';
  const ops = S.ops.filter((o) => !q || `${o.titulo} ${o.materia} ${o.operation}`.toLowerCase().includes(q));
  const admin = esAdministrador(S.mock);
  return (
    <div className="bulk es tw:gap-[18px]">
      <div className="ops-head"><div><h2>Gestión de firmas presenciales</h2><span className="muted small">{S.ops.length} {S.ops.length === 1 ? 'trámite' : 'trámites'} · escrituras públicas, protocolizaciones y reducciones</span></div>
        <div className="ops-head-r"><button className="primary small with-ic" id="esNuevo" onClick={nuevoTramite}><Icono nombre="plus" tam={15} /><span>Nuevo trámite</span></button></div></div>
      <div className="es-layout tw:grid tw:grid-cols-[330px_1fr] tw:gap-4 tw:items-start tw:max-[1250px]:grid-cols-[280px_1fr]">
        <aside className={cx('es-list tw:p-3 tw:flex tw:flex-col tw:gap-2.5 tw:sticky tw:top-0 tw:max-h-[calc(100vh-170px)]', PANEL)}>
          <div className="ops-search"><Icono nombre="search" tam={14} /><input id="esQ" className="tw:border-0! tw:bg-transparent! tw:[box-shadow:none]! tw:m-0 tw:pl-1!" placeholder="Buscar trámite o número…" value={S.q} onChange={(e) => S.escrituraBuscar(e.target.value)} /></div>
          <div className="tw:flex tw:flex-col tw:gap-1 tw:overflow-auto">
            {borrador && (
              <button className={elemento(S.sel === 'draft')} data-sel="draft" onClick={() => S.escrituraSel('draft')}>
                <span className={cx(ICONO, 'tw:bg-[color-mix(in_srgb,var(--brand)_9%,var(--card))] tw:text-brand')}><Icono nombre={S.tramite ? TRAMITES[S.tramite].ic : 'plus'} tam={16} /></span>
                <span className={TEXTO}><b className={TITULO}>{S.tramite && hayDocumento(S) ? tituloDoc(S) : 'Nuevo trámite'}</b><small>{S.tramite ? TRAMITES[S.tramite].t : 'Elige el tipo de trámite'}</small></span>
                <Chip color="#64748b" clase="tw:shrink-0">{hayDocumento(S) ? 'En revisión' : 'Borrador'}</Chip>
              </button>
            )}
            {ops.map((o) => (
              <button key={o.operation} className={elemento(S.sel === o.operation)} data-sel={o.operation} onClick={() => S.escrituraSel(o.operation)}>
                <span className={cx(ICONO, ICONO_OK)}><Icono nombre={TRAMITES[o.tramite]?.ic || 'notary'} tam={16} /></span>
                <span className={TEXTO}><b className={TITULO}>{o.titulo || o.materia}</b><small>Nº {o.operation} · {fechaCorta(o.creado)}</small></span>
                <Chip color={COLOR_ESTADO[o.status] || '#64748b'} clase="tw:shrink-0">{o.status === 'cotizacion' ? 'Cotización' : o.status === 'pagado' ? 'Pagado' : o.estado}</Chip>
              </button>
            ))}
            {!borrador && !ops.length && <div className="ops-empty small"><p>Todavía no tienes trámites.</p></div>}
          </div>
          {admin && (
            <button className={elemento(S.sel === 'reglas', true)} data-sel="reglas" onClick={() => S.escrituraSel('reglas')}>
              <span className={cx(ICONO, ICONO_OK)}><Icono nombre="sparkle" tam={16} /></span><span className={TEXTO}><b className={TITULO}>Reglas de detección</b><small>Interno Portalfirma · aprender de los casos</small></span>
            </button>
          )}
        </aside>
        {S.sel === 'reglas' && admin ? <PanelReglas key="reglas" /> : <section className={DETALLE} id="esBody" key="detalle"><Detalle /></section>}
      </div>
    </div>
  );
}
