// Mis operaciones: lo enviado a firmar con Portalfirma. Lista con filtros y búsqueda (se completa en segundo
// plano con el detalle de cada una), y el detalle de la elegida: etapas, vista previa, descargar, compartir,
// abrir en el editor y reenviar el enlace a quien falta firmar. Se sincroniza cada 5 minutos mientras se ve.
//
// Siguen en src/renderer/operaciones.js (por utils/app.ts): pedir el teléfono, el código de acceso a los
// documentos y el aviso de error del archivo. Con el kit: Layout, Kpi, Tabs, Buscador, Card, ItemLista, Badge,
// Avatar, Boton y EstadoVacio. Los id ops*/opd* y las clases op-* son marcas para las pruebas (no opd-*: Plazos aún usa esos estilos).
import { useEffect, useState } from 'react';
import Icono from '../../../ui/Icono';
import Layout from '../../../ui/Layout';
import Kpi from '../../../ui/Kpi';
import Tabs from '../../../ui/Tabs';
import Buscador from '../../../ui/Buscador';
import Card from '../../../ui/Card';
import ItemLista from '../../../ui/ItemLista';
import Badge from '../../../ui/Badge';
import Avatar from '../../../ui/Avatar';
import Boton from '../../../ui/Boton';
import EstadoVacio from '../../../ui/EstadoVacio';
import type { TTono } from '../../../ui/tonos';
import { cx } from '../../../../utils/cx';
import { estadoOperacion, estadoOperaciones, grupoOperacion, operacionArchivo, useOperacion, type TFiltroOps } from '../../../../store/hooks/useOperacion.hook';
import { abrirCarga, abrirCuentaPortalfirma, abrirEnEditor, abrirPlazos, confirmar, errorArchivoOperacion, iniciarSesionOperaciones, pedirTelefonoOperaciones, toast } from '../../../../utils/app';
import VistaPrevia from './VistaPrevia';
import type { IDetalleOperacion, IFirmante, IOperacion } from '../../../../store/interfaces/operacion.interface';

const PROC: Record<string, string> = { none: 'Firma electrónica', legalization: 'Legalizado ante notario', protocolization: 'Protocolizado' };
const FILTROS: [TFiltroOps, string][] = [['all', 'Todas'], ['pending', 'En firma'], ['signed', 'Firmadas'], ['notary', 'Notaría'], ['action', 'Requieren acción']];
// clase del estado (operacion.store) → tono e ícono del kit
const TONO: Record<string, TTono> = { ok: 'verde', wait: 'amarillo', bad: 'rojo', legal: 'lavanda', proto: 'lavanda', muted: 'gris' };
const ICONO: Record<string, string> = { ok: 'check', wait: 'clock', bad: 'alert', legal: 'notary', proto: 'notary', muted: 'file' };
const tono = (c: string): TTono => TONO[c] || 'gris';
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
  const firmaron = sig.filter((s) => s.signed).length;
  // calidad en que firma (arrendador, mandante…): la que informa Portalfirma o la que registró Asset al enviar
  const calidad = (s: IFirmante) => s.alias || (it.asset?.firmantes || []).find((x) => nr(x.rut) && nr(x.rut) === nr(s.rut))?.calidad || '';
  const archivo = async (f: () => Promise<{ ok: boolean; data?: string | null; error?: string; code?: string }>, ok: (data: string) => void) => { const r = await f(); if (!r.ok) return errorArchivoOperacion(r); if (r.data) ok(r.data); };
  const reenviar = async (s: IFirmante, porCorreo: boolean) => {
    const como = porCorreo ? `por correo a ${s.email}` : `por WhatsApp a ${s.phone || 'su teléfono'}`;
    if (!(await confirmar({ clave: 'modal-116', titulo: 'Reenviar enlace de firma', texto: `¿Enviar el enlace de firma de la operación ${d.operation} ${como}?`, boton: 'Enviar' }))) return;
    try {
      await operacionArchivo.reenviar(porCorreo ? { action: 'send_signature_link_by_email', email: s.email, name: s.name, link: (s.url || '').trim(), operation: d.operation } : { action: 'send_signature_link_by_whatsapp', operation: d.operation, personId: s.personId });
      toast('Enlace enviado ' + como);
    } catch (e) { toast('No se pudo enviar: ' + (e as Error).message, 5000); }
  };
  return (
    <div className="op-det tw:flex tw:flex-col tw:gap-4">
      <div className="op-cab tw:flex tw:items-start tw:gap-3">
        <div className="tw:min-w-0 tw:flex-1">
          <h3 className="tw:m-0 tw:text-lg tw:font-bold tw:text-text tw:break-words">{String(it.name).replace(/\.pdf$/i, '')}</h3>
          <p className="tw:m-0 tw:mt-1 tw:text-[13px] tw:text-muted">Operación N° {d.operation} · {PROC[d.protocolizationNumber || ''] || 'Firma electrónica'}{d.repertoireNumber ? ` · Repertorio ${d.repertoireNumber}` : ''}</p>
          <p className="tw:m-0 tw:text-[13px] tw:text-muted">Creada {fecha(d.createdDateAt)} · Actualizada {fecha(d.updatedDateAt)}</p>
        </div>
        <Badge tono={tono(c)} variante="tactil" icono={ICONO[c]}>{l}</Badge>
        <Boton variante="fantasma" tamano="sm" id="opdRef" icono="rotateR" title="Actualizar" aria-label="Actualizar" onClick={alRefrescar} />
      </div>

      {/* etapas: Enviado → Firmado → (Legalizado / Protocolizado) */}
      <div className="op-etapas tw:flex tw:items-center tw:gap-2 tw:p-3 tw:rounded-xl tw:bg-sunken tw:border tw:border-solid tw:border-edge">
        {d.versions.map((v, i) => (
          <span key={i} className="tw:contents">
            {i > 0 && <span className={cx('op-linea tw:h-0.5 tw:flex-1 tw:min-w-4 tw:rounded-full', v.done ? 'done tw:bg-green-edge' : 'tw:bg-edge')} />}
            <div className={cx('op-etapa tw:flex tw:items-center tw:gap-2', v.done && 'done')}>
              <span className={cx('tw:grid tw:place-items-center tw:w-7 tw:h-7 tw:rounded-full', v.done ? 'tw:bg-green-soft tw:text-green-softink' : 'tw:bg-gray-soft tw:text-gray-softink')}>
                <Icono nombre={v.done ? 'check' : 'clock'} tam={14} />
              </span>
              <span className="tw:flex tw:flex-col tw:leading-tight"><b className="tw:text-[13px] tw:text-text">{v.label}</b><small className="tw:text-[11.5px] tw:text-muted">{v.done ? 'Listo' : 'Pendiente'}</small></span>
            </div>
          </span>
        ))}
      </div>

      <div className="op-cuerpo tw:grid tw:gap-4 tw:grid-cols-1 tw:xl:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <div className="op-prev tw:min-w-0">
          {hayDoc ? <VistaPrevia key={d.operation} op={d.operation} /> : <div className="opd-canvas" id="opdCanvas"><EstadoVacio icono="file" texto="Esta operación no trae su identificador de documento." /></div>}
        </div>
        <div className="op-lado tw:flex tw:min-w-0 tw:flex-col tw:gap-4">
          <div className="op-acciones tw:flex tw:flex-col tw:gap-2">
            <Boton bloque id="opdDl" icono="download" disabled={!hayDoc} onClick={() => archivo(() => operacionArchivo.guardar(d.operation), (ruta) => toast('Guardado en ' + ruta, 4000))}>Descargar documento</Boton>
            <div className="tw:grid tw:grid-cols-2 tw:gap-2">
              <Boton variante="secundario" id="opdShare" icono="upload" disabled={!hayDoc} onClick={() => archivo(() => operacionArchivo.compartir(d.operation), (x) => { if (x === 'folder') toast('El archivo quedó marcado en la carpeta: arrástralo a tu correo o WhatsApp.', 5000); })}>Compartir</Boton>
              <Boton variante="secundario" id="opdOpen" icono="edit" disabled={!hayDoc} onClick={async () => { const r = await operacionArchivo.ver(d.operation); if (!r.ok) return errorArchivoOperacion(r); abrirEnEditor(r.data!.path); }}>Abrir en el editor</Boton>
            </div>
          </div>
          <Card relleno={false} className="op-firmas" titulo="Firmantes" subtitulo={`${firmaron} de ${sig.length} firmaron`}>
            <div className="op-firmantes tw:flex tw:flex-col tw:p-1.5">
              {!sig.length && <EstadoVacio compacto className="tw:px-2.5" texto="Portalfirma no informó los firmantes de esta operación." />}
              {sig.map((s, i) => {
                const nm = [s.name, s.paternalLastName, s.maternalLastName].filter(Boolean).join(' '); const cal = calidad(s);
                return (
                  <div key={i} className="op-firmante tw:flex tw:flex-col tw:gap-2 tw:px-1 tw:py-2 tw:border-0 tw:border-b tw:border-solid tw:border-edge tw:last:border-b-0">
                    <ItemLista className="tw:px-1.5 tw:py-0.5" media={<Avatar nombre={nm || 'Firmante'} tamano="sm" tono={s.signed ? 'verde' : undefined} />}
                      titulo={nm || 'Firmante'}
                      detalle={<>{cal && <><span className="op-calidad tw:font-semibold tw:text-lav-softink">{cal}</span> · </>}{[s.rut, s.email, s.phone].filter(Boolean).join(' · ')}</>}
                      derecha={s.signed ? <Badge tono="verde" icono="check">Firmó</Badge> : <Badge tono="amarillo" icono="clock">Pendiente</Badge>} />
                    {!s.signed && (
                      <div className="op-reenviar tw:flex tw:flex-wrap tw:gap-1.5 tw:pl-11">
                        <Boton variante="secundario" tamano="sm" data-copy={i} icono="link" title="Copiar enlace de firma" disabled={!s.url} onClick={async () => { await navigator.clipboard.writeText((s.url || '').trim()); toast('Enlace de firma copiado'); }}>Copiar enlace</Boton>
                        <Boton variante="secundario" tamano="sm" data-mail={i} icono="mail" disabled={!s.email} onClick={() => reenviar(s, true)}>Correo</Boton>
                        <Boton variante="secundario" tamano="sm" data-wa={i} icono="whatsapp" onClick={() => reenviar(s, false)}>WhatsApp</Boton>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
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
    let desmontado = false; // StrictMode monta dos veces: la primera no debe seguir (sincronizaría dos veces)
    (async () => {
      const st = (await operacionArchivo.estado()).data;
      if (desmontado) return;
      // con Portalfirma conectado por la corredora no se pide el correo y la contraseña de Portalfirma Empresa
      if (st?.apiAvailable && !st.api && !st.corredora) return iniciarSesionOperaciones();
      if (!st?.api && !st?.phone) return pedirTelefonoOperaciones();
      operacionesSetCuenta(st.api ? st.account || '' : '');
      setListo(true);
      await operacionesGetAll();
      if (desmontado) return;
      const ult = ultimaSincronizacion(); if (!ult || Date.now() - new Date(ult).getTime() > 5 * 60000) sincronizar(true); else operacionesCompletar(vista);
      if (selInicial) operacionElegir(selInicial);
      reloj = setInterval(() => { if (vista()) sincronizar(true); }, 5 * 60000);
    })();
    // el seguimiento automático detecta firmas: la lista se actualiza sola (lo avisa operaciones.js)
    const alCambiar = (e: Event) => { const op = (e as CustomEvent<{ op?: number }>).detail?.op; operacionesGetAll().then(() => { if (op && elegidaAhora() === op) operacionElegir(op); }); };
    window.addEventListener('pf:operaciones', alCambiar);
    return () => { desmontado = true; clearInterval(reloj); window.removeEventListener('pf:operaciones', alCambiar); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- solo al montar

  if (!listo) return null;
  const n = (f: TFiltroOps) => (f === 'all' ? items.length : items.filter((x) => grupoOperacion(x) === f).length);
  const visibles = items.filter((it) => (filtro === 'all' || grupoOperacion(it) === filtro) && (!q || String(it.operation).includes(q) || String(it.name).toLowerCase().includes(q)));
  const porAccion = n('action');

  return (
    <Layout
      titulo="Mis operaciones"
      ilustracion={{ imagen: 'img/formas/etapa.svg', tinte: '#6d5bd0' }}
      subtitulo={<span id="opsWhen">{items.length} operaciones enviadas a firmar · actualizado {hace(lastSync)}</span>}
      acciones={<>
        <Boton id="opsSync" icono="rotateR" cargando={sincronizando} disabled={sincronizando} onClick={() => sincronizar()}>Sincronizar</Boton>
        <Boton variante="secundario" id="opsBulk" icono="files" onClick={() => abrirCarga()}>Carga masiva</Boton>
        <Boton variante="secundario" id="opsPlz" icono="calendar" onClick={abrirPlazos}>Plazos</Boton>
        {cuenta
          ? <Boton variante="secundario" id="opsPhone" icono="user" title={`Cuenta: ${cuenta} · cerrar sesión`} onClick={abrirCuentaPortalfirma}>{cuenta}</Boton>
          : <Boton variante="secundario" id="opsPhone" icono="phone" title="Cambiar el teléfono con que se buscan las operaciones" onClick={() => pedirTelefonoOperaciones(true)}>Teléfono</Boton>}
      </>}
      barra={
        <div className="ng-kpis tw:w-full tw:m-0 tw:grid-cols-2 tw:lg:grid-cols-4">
          <Kpi icono="clock" valor={n('pending')} texto="en firma" />
          <Kpi icono="check" valor={n('signed')} texto="firmadas" />
          <Kpi icono="notary" valor={n('notary')} texto="legalizadas o protocolizadas" />
          <Kpi icono="alert" valor={porAccion} texto="requieren acción" alerta={porAccion > 0} />
        </div>
      }
    >
      <div className="op-cols tw:grid tw:gap-4 tw:items-start tw:grid-cols-1 tw:lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
        <Card relleno={false} className="tw:min-w-0">
          <div className="tw:flex tw:flex-col tw:gap-2.5 tw:p-3 tw:border-0 tw:border-b tw:border-solid tw:border-edge"
            onKeyDown={(e) => { if (e.key === 'Enter' && /^\d{3,}$/.test(q) && !visibles.length) operacionElegir(Number(q)); }}>
            <Buscador kit id="opsQ" className="tw:w-full" valor={q} alCambiar={(v) => operacionesSetFiltro({ q: v.trim().toLowerCase() })} espera={0} placeholder="Documento o número de operación" />
            <Tabs id="opsFilters" dato="f" etiqueta="Estado" className="tw:flex-wrap tw:self-start"
              opciones={FILTROS.map(([k, t]): [TFiltroOps, string, number] => [k, t, n(k)])} valor={filtro} alCambiar={(k) => operacionesSetFiltro({ filtro: k })} />
          </div>
          <div className="op-lista tw:flex tw:flex-col tw:gap-0.5 tw:p-1.5 tw:min-h-60 tw:max-h-[calc(100vh-320px)] tw:overflow-y-auto" id="opsList">
            {visibles.length ? visibles.map((it) => {
              const [l, c] = estadoOperacion(it); const on = sel === it.operation;
              return (
                <ItemLista key={it.operation} data-op={it.operation} alTocar={() => operacionElegir(it.operation)} aria-current={on || undefined}
                  className={cx('op-fila', on && 'sel tw:bg-lav-soft tw:hover:bg-lav-soft')}
                  media={<span className={cx('tw:grid tw:place-items-center tw:w-9 tw:h-9 tw:rounded-xl tw:text-muted', on ? 'tw:bg-card' : 'tw:bg-sunken')}><Icono nombre="file" tam={17} /></span>}
                  titulo={String(it.name).replace(/\.pdf$/i, '')}
                  detalle={<>N° {it.operation}{it.asset?.codigo && <> · <span className="op-asset tw:font-semibold tw:text-lav-softink" title="Enviado desde Asset">{it.asset.codigo}</span></>} · {fecha(it.updated || it.created)}{it.signers ? ` · ${it.signed}/${it.signers} firmaron` : ''}</>}
                  derecha={<Badge tono={tono(c)} punto>{l}</Badge>} />
              );
            }) : <EstadoVacio compacto className="tw:p-3" texto={items.length ? 'No hay operaciones con ese filtro.' : sincronizando ? 'Sincronizando tus operaciones…' : 'Aún no hay operaciones. Lo que envíes a firmar aparecerá aquí.'} />}
          </div>
        </Card>
        <Card className="op-detalle tw:min-w-0">
          <div id="opsDetail">
            {sel == null ? <EstadoVacio icono="file" titulo="Elige una operación" texto="Verás su documento, en qué etapa va y quién falta por firmar." />
              : errorDetalle ? <EstadoVacio icono="alert" titulo="No se pudo abrir la operación" texto={errorDetalle} accion={<Boton variante="secundario" icono="rotateR" onClick={() => operacionElegir(sel, true)}>Reintentar</Boton>} />
                : !detalle ? <div className="tw:grid tw:place-items-center tw:py-16"><div className="spinner" /></div>
                  : <Detalle d={detalle} items={items} alRefrescar={() => operacionElegir(detalle.operation, true)} />}
          </div>
        </Card>
      </div>
    </Layout>
  );
}
