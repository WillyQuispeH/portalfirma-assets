// Mis operaciones: lo enviado a firmar con Portalfirma. Lista con filtros y búsqueda (se completa en segundo
// plano con el detalle de cada una), y el detalle de la elegida: etapas, vista previa, descargar, compartir,
// abrir en el editor y reenviar el enlace a quien falta firmar. Se sincroniza cada 5 minutos mientras se ve.
//
// Siguen en src/renderer/operaciones.js (por utils/app.ts): pedir el teléfono, el código de acceso a los
// documentos y el aviso de error del archivo. Los id ops*/opd* y la clase ops-row los usan las pruebas.
import { useEffect, useState } from 'react';
import Icono from '../../../ui/Icono';
import { estadoOperacion, estadoOperaciones, grupoOperacion, operacionArchivo, useOperacion, type TFiltroOps } from '../../../../store/hooks/useOperacion.hook';
import { abrirCarga, abrirCuentaPortalfirma, abrirEnEditor, abrirPlazos, confirmar, errorArchivoOperacion, iniciarSesionOperaciones, pedirTelefonoOperaciones, toast } from '../../../../utils/app';
import VistaPrevia from './VistaPrevia';
import type { IDetalleOperacion, IFirmante, IOperacion } from '../../../../store/interfaces/operacion.interface';

const PROC: Record<string, string> = { none: 'Firma electrónica', legalization: 'Legalizado ante notario', protocolization: 'Protocolizado' };
const FILTROS: [TFiltroOps, string][] = [['all', 'Todas'], ['pending', 'En firma'], ['signed', 'Firmadas'], ['notary', 'Legalizadas / protocolizadas'], ['action', 'Requieren acción']];
const fecha = (iso?: string) => { try { return iso ? new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; } catch { return ''; } };
const hace = (iso: string | null) => { if (!iso) return 'nunca'; const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? 'recién' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : fecha(iso); };
const nr = (r?: string) => String(r || '').replace(/[^0-9kK]/g, '').toUpperCase();
// lectura del estado para src/renderer/operaciones.js (window.Operaciones._ops: pruebas y depuración)
(window as unknown as Record<string, unknown>).__estadoOperaciones = estadoOperaciones;
const vista = () => !document.getElementById('view-ops')?.classList.contains('hidden');
// lecturas del estado actual, para los efectos que viven más que un render
const ultimaSincronizacion = () => estadoOperaciones().lastSync;
const elegidaAhora = () => estadoOperaciones().sel;

function Detalle({ d, items, alRefrescar }: { d: IDetalleOperacion; items: IOperacion[]; alRefrescar: () => void }) {
  const it = items.find((x) => x.operation === d.operation) || { operation: d.operation, name: `Operación ${d.operation}`, stage: d.status };
  const [l, c] = estadoOperacion({ ...it, status: d.status, proc: d.protocolizationNumber });
  const sig = d.signatories || []; const hayDoc = !!d.processId;
  // calidad en que firma (arrendador, mandante…): la que informa Portalfirma o la que registró Asset al enviar
  const calidad = (s: IFirmante) => s.alias || (it.asset?.firmantes || []).find((x) => nr(x.rut) && nr(x.rut) === nr(s.rut))?.calidad || '';
  const archivo = async (f: () => Promise<{ ok: boolean; data?: string | null; error?: string; code?: string }>, ok: (data: string) => void) => { const r = await f(); if (!r.ok) return errorArchivoOperacion(r); if (r.data) ok(r.data); };
  const reenviar = async (s: IFirmante, porCorreo: boolean) => {
    const como = porCorreo ? `por correo a ${s.email}` : `por WhatsApp a ${s.phone || 'su teléfono'}`;
    if (!(await confirmar({ titulo: 'Reenviar enlace de firma', texto: `¿Enviar el enlace de firma de la operación ${d.operation} ${como}?`, boton: 'Enviar' }))) return;
    try {
      await operacionArchivo.reenviar(porCorreo ? { action: 'send_signature_link_by_email', email: s.email, name: s.name, link: (s.url || '').trim(), operation: d.operation } : { action: 'send_signature_link_by_whatsapp', operation: d.operation, personId: s.personId });
      toast('Enlace enviado ' + como);
    } catch (e) { toast('No se pudo enviar: ' + (e as Error).message, 5000); }
  };
  return (
    <div className="opd">
      <div className="opd-head">
        <div>
          <h3>{String(it.name).replace(/\.pdf$/i, '')}</h3>
          <div className="muted small">Operación N° {d.operation} · {PROC[d.protocolizationNumber || ''] || 'Firma electrónica'}{d.repertoireNumber ? ` · Repertorio ${d.repertoireNumber}` : ''}</div>
          <div className="muted small">Creada {fecha(d.createdDateAt)} · Actualizada {fecha(d.updatedDateAt)}</div>
        </div>
        <div className="opd-hr"><span className={`ops-chip ${c} big`}>{l}</span><button className="ibtn" id="opdRef" title="Actualizar" onClick={alRefrescar}><Icono nombre="rotateR" tam={15} /></button></div>
      </div>
      <div className="opd-steps">
        {d.versions.map((v, i) => (
          <span key={i} style={{ display: 'contents' }}>
            {i > 0 && <span className={`opd-line ${v.done ? 'done' : ''}`} />}
            <div className={`opd-step ${v.done ? 'done' : ''}`}><span className="dot"><Icono nombre={v.done ? 'check' : 'rotateR'} tam={v.done ? 15 : 12} /></span><b>{v.label}</b><small>{v.done ? 'Listo' : 'Pendiente'}</small></div>
          </span>
        ))}
      </div>
      <div className="opd-body">
        <div className="opd-prev">
          {hayDoc ? <VistaPrevia key={d.operation} op={d.operation} /> : <div className="opd-canvas" id="opdCanvas"><p className="muted">Esta operación no trae su identificador de documento.</p></div>}
        </div>
        <div className="opd-side">
          <div className="opd-acts">
            <button className="primary with-ic" id="opdDl" disabled={!hayDoc} onClick={() => archivo(() => operacionArchivo.guardar(d.operation), (ruta) => toast('Guardado en ' + ruta, 4000))}><Icono nombre="export" tam={15} /><span>Descargar documento</span></button>
            <button className="secondary with-ic" id="opdShare" disabled={!hayDoc} onClick={() => archivo(() => operacionArchivo.compartir(d.operation), (x) => { if (x === 'folder') toast('El archivo quedó marcado en la carpeta: arrástralo a tu correo o WhatsApp.', 5000); })}><Icono nombre="upload" tam={15} /><span>Compartir</span></button>
            <button className="ghost with-ic" id="opdOpen" disabled={!hayDoc} onClick={async () => { const r = await operacionArchivo.ver(d.operation); if (!r.ok) return errorArchivoOperacion(r); abrirEnEditor(r.data!.path); }}><Icono nombre="edit" tam={15} /><span>Abrir en el editor</span></button>
          </div>
          <h4>Firmantes <span className="muted small">{sig.filter((s) => s.signed).length} de {sig.length} firmaron</span></h4>
          <div className="opd-sigs">
            {sig.map((s, i) => {
              const nm = [s.name, s.paternalLastName, s.maternalLastName].filter(Boolean).join(' '); const ini = nm.split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase(); const cal = calidad(s);
              return (
                <div key={i} className="opd-sig">
                  <span className={`av ${s.signed ? 'ok' : ''}`}>{ini || '?'}</span>
                  <span className="nm"><b>{nm || 'Firmante'}</b><small>{cal && <><span className="ops-cal">{cal}</span> · </>}{s.rut || ''}{s.email ? ' · ' + s.email : ''}{s.phone ? ' · ' + s.phone : ''}</small></span>
                  {s.signed ? <span className="ops-chip ok">Firmó</span> : (
                    <span className="opd-sig-acts"><span className="ops-chip wait">Pendiente</span>
                      <button className="ghost small" data-copy={i} title="Copiar enlace de firma" onClick={async () => { await navigator.clipboard.writeText((s.url || '').trim()); toast('Enlace de firma copiado'); }}>Copiar enlace</button>
                      <button className="ghost small" data-mail={i} onClick={() => reenviar(s, true)}>Correo</button>
                      <button className="ghost small" data-wa={i} onClick={() => reenviar(s, false)}>WhatsApp</button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Operaciones({ sel: selInicial }: { sel?: number | null }) {
  const { items, lastSync, cuenta, filtro, q, sel, detalle, errorDetalle, sincronizando, operacionesGetAll, operacionesSincronizar, operacionesCompletar, operacionElegir, operacionesSetFiltro, operacionesSetCuenta } = useOperacion();
  const [listo, setListo] = useState(false);

  const sincronizar = async (callado?: boolean) => {
    const r = await operacionesSincronizar(callado);
    if (r.sinTelefono) return pedirTelefonoOperaciones();
    if (r.error) toast(r.error, 5000); else if (r.mensaje) toast(r.mensaje);
    operacionesCompletar(vista);
  };

  useEffect(() => {
    let reloj: ReturnType<typeof setInterval> | undefined;
    (async () => {
      const st = (await operacionArchivo.estado()).data;
      if (st?.apiAvailable && !st.api) return iniciarSesionOperaciones();
      if (!st?.api && !st?.phone) return pedirTelefonoOperaciones();
      operacionesSetCuenta(st.api ? st.account || '' : '');
      setListo(true);
      await operacionesGetAll();
      const ult = ultimaSincronizacion(); if (!ult || Date.now() - new Date(ult).getTime() > 5 * 60000) sincronizar(true); else operacionesCompletar(vista);
      if (selInicial) operacionElegir(selInicial);
      reloj = setInterval(() => { if (vista()) sincronizar(true); }, 5 * 60000);
    })();
    // el seguimiento automático detecta firmas: la lista se actualiza sola (lo avisa operaciones.js)
    const alCambiar = (e: Event) => { const op = (e as CustomEvent<{ op?: number }>).detail?.op; operacionesGetAll().then(() => { if (op && elegidaAhora() === op) operacionElegir(op); }); };
    window.addEventListener('pf:operaciones', alCambiar);
    return () => { clearInterval(reloj); window.removeEventListener('pf:operaciones', alCambiar); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- solo al montar

  if (!listo) return null;
  const n = (f: TFiltroOps) => (f === 'all' ? items.length : items.filter((x) => grupoOperacion(x) === f).length);
  const visibles = items.filter((it) => (filtro === 'all' || grupoOperacion(it) === filtro) && (!q || String(it.operation).includes(q) || String(it.name).toLowerCase().includes(q)));

  return (
    <div className="ops">
      <div className="ops-head">
        <div><h2>Mis operaciones</h2><span className="muted small" id="opsWhen">{items.length} operaciones · actualizado {hace(lastSync)}</span></div>
        <div className="ops-head-r">
          {cuenta
            ? <button className="ghost small" id="opsPhone" title={`Cuenta: ${cuenta} · cerrar sesión`} onClick={abrirCuentaPortalfirma}><Icono nombre="user" tam={14} /></button>
            : <button className="ghost small" id="opsPhone" title="Cambiar el teléfono de la cuenta" onClick={() => pedirTelefonoOperaciones(true)}><Icono nombre="edit" tam={14} /></button>}
          <button className="secondary small with-ic" id="opsPlz" onClick={abrirPlazos}><Icono nombre="calendar" tam={15} /><span>Plazos</span></button>
          <button className="secondary small with-ic" id="opsBulk" onClick={() => abrirCarga()}><Icono nombre="files" tam={15} /><span>Carga masiva</span></button>
          <button className={`primary small with-ic${sincronizando ? ' spin' : ''}`} id="opsSync" disabled={sincronizando} onClick={() => sincronizar()}><Icono nombre="rotateR" tam={15} /><span>Sincronizar</span></button>
        </div>
      </div>
      <div className="ops-tools">
        <div className="ops-search"><Icono nombre="search" tam={15} />
          <input id="opsQ" placeholder="Buscar por documento o número de operación" spellCheck={false} value={q}
            onChange={(e) => operacionesSetFiltro({ q: e.target.value.trim().toLowerCase() })}
            onKeyDown={(e) => { if (e.key === 'Enter' && /^\d{3,}$/.test(q) && !visibles.length) operacionElegir(Number(q)); }} />
        </div>
        <div className="ops-filters" id="opsFilters">{FILTROS.map(([k, t]) => <button key={k} className={`ops-f ${filtro === k ? 'on' : ''}`} data-f={k} onClick={() => operacionesSetFiltro({ filtro: k })}>{t}<b>{n(k)}</b></button>)}</div>
      </div>
      <div className="ops-grid">
        <div className="ops-list" id="opsList">
          {visibles.length ? visibles.map((it) => {
            const [l, c] = estadoOperacion(it);
            return (
              <div key={it.operation} className={`ops-row ${sel === it.operation ? 'sel' : ''}`} data-op={it.operation} onClick={() => operacionElegir(it.operation)}>
                <span className={`ops-ic ${c}`}><Icono nombre="file" tam={17} /></span>
                <span className="ops-main"><b>{String(it.name).replace(/\.pdf$/i, '')}</b>
                  <small>N° {it.operation}{it.asset?.codigo && <> · <span className="ops-asset" title="Enviado desde Asset">{it.asset.codigo}</span></>} · {fecha(it.updated || it.created)}{it.signers ? ` · ${it.signed}/${it.signers} firmaron` : ''}</small></span>
                <span className={`ops-chip ${c}`}>{l}</span>
              </div>
            );
          }) : <div className="ops-empty small"><p>{items.length ? 'No hay operaciones con ese filtro.' : 'Sincronizando tus operaciones…'}</p></div>}
        </div>
        <div className="ops-detail" id="opsDetail">
          {sel == null ? <div className="ops-empty"><Icono nombre="file" tam={34} /><p>Elige una operación para ver su documento, etapas y firmantes.</p></div>
            : errorDetalle ? <div className="ops-empty"><p className="error">{errorDetalle}</p></div>
              : !detalle ? <div className="ops-empty"><div className="spinner" /></div>
                : <Detalle d={detalle} items={items} alRefrescar={() => operacionElegir(detalle.operation, true)} />}
        </div>
      </div>
    </div>
  );
}
