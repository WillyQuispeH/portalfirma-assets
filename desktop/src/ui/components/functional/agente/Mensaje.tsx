// Un elemento de la conversación del Agente: mensajes, herramientas, confirmaciones, siguiente paso y tarjetas.
import { useLayoutEffect, useRef } from 'react';
import Icono from '../../ui/Icono';
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
const ESTADO_TOOL: Record<string, string> = { corriendo: 'trabajando…', ok: 'listo', error: 'error', cancelado: 'cancelado', esperando: 'esperando tu confirmación' };
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

// una tarjeta de src/renderer: el mismo nodo se vuelve a poner (conserva lo que el usuario escribió en ella)
function NodoAjeno({ node }: { node: HTMLElement }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { const s = ref.current; if (s && node.parentElement !== s) s.appendChild(node); }, [node]);
  return <div ref={ref} className="ag-slot" style={{ display: 'contents' }} />;
}

function Confirmacion({ m }: { m: Extract<IAgenteItem, { k: 'confirm' }> }) {
  const caja = useRef<HTMLDivElement>(null);
  if (m.hecho) return <div className={`ag-conf done ${m.hecho}`}><b>{m.titulo}</b><small>{m.hecho === 'si' ? 'Confirmado' : 'Cancelado'}</small></div>;
  const responder = (ok: boolean) => {
    const secretos: Record<string, string> = {};
    caja.current?.querySelectorAll<HTMLInputElement>('input[data-sec]').forEach((i) => { secretos[i.dataset.sec!] = i.value; });
    if (confirmar(m.id, ok, secretos)) caja.current?.querySelectorAll<HTMLInputElement>('input[data-sec]').forEach((i) => { i.value = ''; }); // los datos protegidos no quedan en pantalla
  };
  return (
    <div className="ag-conf" data-conf={m.id} ref={caja}>
      <div className="ag-conf-h"><Icono nombre="alert" tam={14} /><b>{m.titulo}</b></div>
      {(m.detalle || []).length > 0 && <ul>{m.detalle!.map((l, i) => <li key={i}>{l}</li>)}</ul>}
      {m.aviso && <p>{m.aviso}</p>}
      {(m.secretos || []).map((k) => (
        <label key={k} className="ag-sec"><Icono nombre="lock" tam={12} /> {SECRETO[k][0]}
          <input data-sec={k} type={SECRETO[k][1]} autoComplete="off" spellCheck={false} onKeyDown={(e) => { if (e.key === 'Enter') responder(true); }} />
        </label>
      ))}
      {(m.secretos || []).length > 0 && <small className="muted">Se entrega directo a Portalfirma. No se guarda ni pasa por la IA.</small>}
      <div className="ag-conf-b"><button className="ghost small" data-no onClick={() => responder(false)}>Cancelar</button><button className="primary small" data-si onClick={() => responder(true)}>Confirmar</button></div>
    </div>
  );
}

export default function Mensaje({ m, i }: { m: IAgenteItem; i: number }) {
  switch (m.k) {
    case 'user': return <div className="ag-msg user">{m.text.split('\n').map((l, j) => <span key={j}>{j > 0 && <br />}{l}</span>)}</div>;
    case 'bot': return <div className="ag-msg bot" dangerouslySetInnerHTML={{ __html: md(m.text) }} />;
    case 'nota': return <div className="ag-msg bot soft" dangerouslySetInnerHTML={{ __html: md(m.text) }} />;
    case 'card': return <NodoAjeno node={m.node} />;
    case 'hecho': return (
      <div className="ga hecha"><span className="ga-ok"><Icono nombre="check" tam={13} /></span><span>{m.text}</span>
        {m.propId && <button className="ghost small" data-verp={m.propId} onClick={() => { if (!ocupado()) estadoPropiedad(m.propId!); }}>Ver estado</button>}</div>
    );
    case 'sug2': return m.usado ? null : (
      <div className="ag-sig sug2" data-sug2={i}>
        <small>Siguiente paso · opcional</small>
        {m.lista.map((x, j) => (
          <button key={j} data-si2={j} onClick={() => { if (ocupado()) return; usar(i); accion(x.accion); }}><Icono nombre={ICO_ACC[x.accion?.tipo || ''] || 'arrowR'} tam={14} /><span>{x.label}</span></button>
        ))}
        <button className="ag-sig-no" data-no2 onClick={() => usar(i)}>Ahora no</button>
      </div>
    );
    case 'sig': return m.usado ? null : (
      <div className="ag-sig" data-sig={i}>
        <small>Siguiente paso</small>
        {m.opciones.filter((k) => SIG[k]).map((k) => (
          <button key={k} data-sk={k} onClick={() => { if (ocupado()) return; usar(i); SIG[k][2](datos(m.datos || {})); }}><Icono nombre={SIG[k][0]} tam={14} /><span>{SIG[k][1]}</span></button>
        ))}
      </div>
    );
    case 'error': return <div className="ag-msg err"><Icono nombre="alert" tam={13} /> {m.text}</div>;
    case 'pensando': return <div className="ag-think"><span /><span /><span /></div>;
    case 'tool': return (
      <div className={`ag-tool ${m.estado}`} title={m.name}>
        <span className="ag-dot" />{nombreHerramienta(m.name)}{m.args?.action ? ` · ${m.args.action.replace(/_/g, ' ')}` : ''}
        <em>{ESTADO_TOOL[m.estado] || ''}</em>
        {m.resumen && <small>{m.resumen}</small>}
        {m.url && <a href="#" data-url={m.url}>{/flow\.cl/.test(m.url) ? 'Pagar en Flow' : 'Abrir enlace'}</a>}
      </div>
    );
    case 'confirm': return <Confirmacion m={m} />;
    default: return null;
  }
}
