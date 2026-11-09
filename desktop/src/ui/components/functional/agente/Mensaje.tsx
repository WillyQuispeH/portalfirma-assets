// Un elemento de la conversación del Agente: mensajes, herramientas, confirmaciones, siguiente paso y tarjetas.
// Con el kit: Boton, Badge, Card e Input. Las clases ag-* (ag-msg, ag-tool, ag-conf, ag-sig…) las usan las pruebas.
import { useLayoutEffect, useRef } from 'react';
import Icono from '../../ui/Icono';
import Boton from '../../ui/Boton';
import Badge from '../../ui/Badge';
import Card from '../../ui/Card';
import Input from '../../ui/Input';
import { cx } from '../../../utils/cx';
import { LineaHecha } from './tarjetas/comun';
import { LogoAgente } from './Agente';
import type { TTono } from '../../ui/tonos';
import { estadoPropiedad } from '../../../utils/app';
import { SIG, accion, confirmar, datos, ocupado, usar } from './controlador';
import type { IAgenteItem } from '../../../store/interfaces/agente.interface';

const NOMBRE: Record<string, string> = {
  asset_resumen: 'Resumen del día', asset_buscar_propiedades: 'Buscar propiedades', asset_ver_propiedad: 'Ficha de la propiedad', asset_buscar_personas: 'Buscar personas', asset_ver_persona: 'Ficha de la persona',
  asset_listar_negocios: 'Negocios', asset_ver_negocio: 'Detalle del negocio', asset_agenda: 'Agenda', asset_interesados: 'Interesados', asset_crear_propiedad: 'Crear propiedad', asset_actualizar_propiedad: 'Actualizar propiedad',
  asset_cambiar_estado: 'Cambiar estado', asset_crear_persona: 'Crear persona', asset_vincular_persona: 'Vincular persona', asset_nota: 'Nota', asset_crear_negocio: 'Crear negocio', asset_mover_negocio: 'Mover negocio',
  asset_tarea_negocio: 'Tarea del negocio', asset_proxima_accion: 'Próxima acción', asset_vincular_firma: 'Vincular firma', asset_cerrar_negocio: 'Cerrar negocio', asset_crear_evento: 'Agendar', asset_actualizar_evento: 'Actualizar evento',
  asset_orden_visita: 'Orden de visita', asset_publicar_portal: 'Publicar en Portal Inmobiliario', asset_aviso_portal: 'Aviso del portal', asset_sincronizar_portal: 'Sincronizar portal', asset_abrir: 'Abrir pantalla',
  asset_plantillas: 'Plantillas de documentos', asset_formulario_documento: 'Preparar documento', asset_generar_documento: 'Generar documento', asset_seguimiento_firma: 'Seguimiento de firma',
  get_partner_session: 'Sesión de la empresa', ingest_document_tools: 'Subir documento', search_document_content: 'Buscar en el documento', extract_signers_document_tools: 'Extraer firmantes',
  send_to_sign_document_tools: 'Enviar a firmar', process_detail_get_by_operation: 'Detalle de operación', operation_get_operation_by_rut: 'Operaciones por RUT', operation_get_operation_by_phone: 'Operaciones por teléfono',
  operation_manage_signing_tools: 'Gestionar firmantes', sign_documents_cds_massive_tools: 'Firma con certificado CDS', wallet_manage_balance_tools: 'Saldo', template_manage_tools: 'Plantillas', property_manage_tools: 'Propiedades',
};
export const nombreHerramienta = (x: string) => NOMBRE[x] || x.replace(/_/g, ' ');
const ICO_ACC: Record<string, string> = { estadoProp: 'house', confirmar: 'whatsapp', agendar: 'calendar', documento: 'filePlus', orden: 'sign', mover: 'arrowR', negocio: 'briefcase', negocioNuevo: 'briefcase', publicar: 'export', interesados: 'users' };
const ESTADO_TOOL: Record<string, [string, TTono]> = { corriendo: ['trabajando…', 'amarillo'], ok: ['listo', 'verde'], error: ['error', 'rojo'], cancelado: ['cancelado', 'gris'], esperando: ['esperando tu confirmación', 'amarillo'] };
const SECRETO: Record<string, [string, string]> = { clave_certificado: ['Clave del certificado', 'password'], segundo_factor: ['Código recibido por SMS o WhatsApp', 'text'] };

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
// texto del agente: enlaces clicables, negritas, listas y saltos de línea (todo se escapa antes)
function md(t: string) {
  const fmt = (l: string) => l.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[\s(«])\*([^*\n]+)\*(?=$|[\s.,;:)»!?])/g, '$1<b>$2</b>')
    .replace(/(https?:\/\/[^\s<)]+)/g, (u) => `<a href="#" data-url="${u}">${/flow\.cl/.test(u) ? 'Pagar en Flow' : u.length > 48 ? u.slice(0, 46) + '…' : u}</a>`);
  let out = ''; let ul = false;
  for (const l0 of esc(t || '').split('\n')) {
    const l = fmt(l0);
    if (/^\s*[-•*]\s+/.test(l)) { if (!ul) { out += '<ul>'; ul = true; } out += '<li>' + l.replace(/^\s*[-•*]\s+/, '') + '</li>'; }
    else { if (ul) { out += '</ul>'; ul = false; } out += l + '<br>'; }
  }
  return (ul ? out + '</ul>' : out).replace(/(<br>)+$/, '');
}

// una tarjeta de un flujo guiado (tarjetas/, con su propia raíz de React): el mismo nodo se vuelve a poner (conserva lo que el usuario escribió en ella)
function NodoAjeno({ node }: { node: HTMLElement }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { const s = ref.current; if (s && node.parentElement !== s) s.appendChild(node); }, [node]);
  return <div ref={ref} className="ag-slot" style={{ display: 'contents' }} />;
}

// las piezas a la izquierda llevan la sangría del avatar del Agente (28 px + 10 px), igual que las tarjetas (.ga)
const SANGRIA = 'tw:ml-[38px]';
const ENLACES = 'tw:[&_a]:font-semibold tw:[&_a]:text-brand tw:[&_ul]:my-1 tw:[&_ul]:pl-5';

function Confirmacion({ m }: { m: Extract<IAgenteItem, { k: 'confirm' }> }) {
  const caja = useRef<HTMLDivElement>(null);
  if (m.hecho) return (
    <div className={cx('ag-conf done', m.hecho, SANGRIA)}>
      <LineaHecha accion={<Badge tono={m.hecho === 'si' ? 'verde' : 'gris'}>{m.hecho === 'si' ? 'Confirmado' : 'Cancelado'}</Badge>}><b>{m.titulo}</b></LineaHecha>
    </div>
  );
  const responder = (ok: boolean) => {
    const secretos: Record<string, string> = {};
    caja.current?.querySelectorAll<HTMLInputElement>('input[data-sec]').forEach((i) => { secretos[i.dataset.sec!] = i.value; });
    if (confirmar(m.id, ok, secretos)) caja.current?.querySelectorAll<HTMLInputElement>('input[data-sec]').forEach((i) => { i.value = ''; }); // los datos protegidos no quedan en pantalla
  };
  return (
    <div className={cx('ag-conf', SANGRIA)} data-conf={m.id} ref={caja}>
      <Card tono="amarillo" titulo={<span className="ag-conf-h tw:flex tw:items-center tw:gap-2"><Icono nombre="alert" tam={16} />{m.titulo}</span>}
        pie={<div className="ag-conf-b tw:flex tw:justify-end tw:gap-2">
          <Boton variante="fantasma" data-no onClick={() => responder(false)}>Cancelar</Boton>
          <Boton data-si icono="check" onClick={() => responder(true)}>Confirmar</Boton>
        </div>}>
        <div className="tw:flex tw:flex-col tw:gap-3 tw:text-text tw:text-[13.5px]">
          {(m.detalle || []).length > 0 && <ul className="tw:m-0 tw:pl-5 tw:flex tw:flex-col tw:gap-0.5 tw:max-h-40 tw:overflow-auto">{m.detalle!.map((l, i) => <li key={i}>{l}</li>)}</ul>}
          {m.aviso && <p className="tw:m-0 tw:text-yellow-ink">{m.aviso}</p>}
          {(m.secretos || []).map((k) => (
            <Input key={k} etiqueta={<span className="ag-sec tw:inline-flex tw:items-center tw:gap-1.5"><Icono nombre="lock" tam={12} /> {SECRETO[k][0]}</span>}
              data-sec={k} type={SECRETO[k][1]} autoComplete="off" spellCheck={false} onKeyDown={(e) => { if (e.key === 'Enter') responder(true); }}
              ayuda="Se entrega directo a Portalfirma. No se guarda ni pasa por la IA." />
          ))}
        </div>
      </Card>
    </div>
  );
}

/** «Siguiente paso»: botones de acciones fijas (sin pasar por el modelo) */
function SiguientePaso({ titulo, children, className, ...resto }: { titulo: string; children: React.ReactNode; className?: string } & Record<string, unknown>) {
  return (
    <div {...resto} className={cx('ag-sig tw:flex tw:flex-wrap tw:items-center tw:gap-2', SANGRIA, className)}>
      <span className="tw:w-full tw:text-xs tw:font-semibold tw:uppercase tw:tracking-wide tw:text-muted">{titulo}</span>
      {children}
    </div>
  );
}

export default function Mensaje({ m, i }: { m: IAgenteItem; i: number }) {
  switch (m.k) {
    case 'user': return (
      <div className="ag-msg user tw:self-end tw:max-w-[85%] tw:px-4 tw:py-2.5 tw:rounded-2xl tw:rounded-br-md tw:bg-lav-soft tw:text-text tw:text-[14.5px] tw:leading-relaxed tw:break-words">
        {m.text.split('\n').map((l, j) => <span key={j}>{j > 0 && <br />}{l}</span>)}
      </div>
    );
    case 'bot': return (
      <div className="tw:flex tw:items-start tw:gap-2.5">
        <LogoAgente tam={28} />
        <div className={cx('ag-msg bot tw:min-w-0 tw:flex-1 tw:pt-0.5 tw:text-[14.5px] tw:leading-relaxed tw:text-text tw:break-words', ENLACES)} dangerouslySetInnerHTML={{ __html: md(m.text) }} />
      </div>
    );
    case 'nota': return <div className={cx('ag-msg bot soft tw:text-[13px] tw:text-muted', SANGRIA, ENLACES)} dangerouslySetInnerHTML={{ __html: md(m.text) }} />;
    case 'card': return <NodoAjeno node={m.node} />;
    case 'hecho': return (
      <div className="ga hecha"><LineaHecha accion={m.propId && <Boton variante="fantasma" tamano="sm" data-verp={m.propId} onClick={() => { if (!ocupado()) estadoPropiedad(m.propId!); }}>Ver estado</Boton>}>{m.text}</LineaHecha></div>
    );
    case 'sug2': return m.usado ? null : (
      <SiguientePaso titulo="Siguiente paso · opcional" className="sug2" data-sug2={i}>
        {m.lista.map((x, j) => (
          <Boton key={j} variante="secundario" tamano="sm" data-si2={j} icono={ICO_ACC[x.accion?.tipo || ''] || 'arrowR'} onClick={() => { if (ocupado()) return; usar(i); accion(x.accion); }}><span>{x.label}</span></Boton>
        ))}
        <Boton variante="fantasma" tamano="sm" className="ag-sig-no" data-no2 onClick={() => usar(i)}>Ahora no</Boton>
      </SiguientePaso>
    );
    case 'sig': return m.usado ? null : (
      <SiguientePaso titulo="Siguiente paso" data-sig={i}>
        {m.opciones.filter((k) => SIG[k]).map((k) => (
          <Boton key={k} variante="secundario" tamano="sm" data-sk={k} icono={SIG[k][0]} onClick={() => { if (ocupado()) return; usar(i); SIG[k][2](datos(m.datos || {})); }}><span>{SIG[k][1]}</span></Boton>
        ))}
      </SiguientePaso>
    );
    case 'error': return (
      <div className={cx('ag-msg err tw:flex tw:items-start tw:gap-2 tw:px-3.5 tw:py-2.5 tw:rounded-xl tw:bg-red-soft tw:text-red-softink tw:text-[13.5px]', SANGRIA)}>
        <Icono nombre="alert" tam={14} /> <span>{m.text}</span>
      </div>
    );
    case 'pensando': return (
      <div className={cx('ag-think tw:flex tw:items-center tw:gap-1.5 tw:py-2', SANGRIA)} aria-label="El Agente está pensando">
        {[0, 1, 2].map((j) => <span key={j} className="tw:size-2 tw:rounded-full tw:bg-lav-edge tw:animate-bounce" style={{ animationDelay: `${j * 0.15}s` }} />)}
      </div>
    );
    case 'tool': { const [t, tono] = ESTADO_TOOL[m.estado] || ['', 'gris' as TTono]; return (
      <div className={cx('ag-tool', m.estado, SANGRIA, 'tw:flex tw:flex-wrap tw:items-center tw:gap-2 tw:text-[13px]')} title={m.name}>
        <Badge tono={tono} punto>{nombreHerramienta(m.name)}{m.args?.action ? ` · ${m.args.action.replace(/_/g, ' ')}` : ''}</Badge>
        <em className="tw:not-italic tw:text-xs tw:text-muted">{t}</em>
        {m.url && <a href="#" data-url={m.url} className="tw:text-xs tw:font-semibold tw:text-brand">{/flow\.cl/.test(m.url) ? 'Pagar en Flow' : 'Abrir enlace'}</a>}
        {m.resumen && <small className="tw:basis-full tw:pl-1 tw:text-xs tw:text-muted">{m.resumen}</small>}
      </div>
    ); }
    case 'confirm': return <Confirmacion m={m} />;
    default: return null;
  }
}
