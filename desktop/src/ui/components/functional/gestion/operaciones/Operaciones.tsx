// Mis operaciones: lo enviado a firmar con Portalfirma. Lista con filtros y búsqueda (se completa en segundo
// plano con el detalle de cada una), y el detalle de la elegida: etapas, vista previa, descargar, compartir,
// abrir en el editor y reenviar el enlace a quien falta firmar. Se sincroniza cada 5 minutos mientras se ve.
//
// Siguen en src/renderer/operaciones.js (por utils/app.ts): pedir el teléfono, el código de acceso a los
// documentos y el aviso de error del archivo. Con el kit: Layout altoCompleto, Select, Buscador, Card, ItemLista,
// Badge, Avatar, Boton y EstadoVacio. Los id ops*/opd* y las clases op-* son marcas para las pruebas (no opd-*: Plazos aún usa esos estilos).
import { useEffect, useState } from 'react';
import Icono from '../../../ui/Icono';
import Layout from '../../../ui/Layout';
import Select from '../../../ui/Select';
import Buscador from '../../../ui/Buscador';
import Card from '../../../ui/Card';
import ItemLista from '../../../ui/ItemLista';
import Badge from '../../../ui/Badge';
import Avatar from '../../../ui/Avatar';
import Boton from '../../../ui/Boton';
import EstadoVacio from '../../../ui/EstadoVacio';
import Esqueleto, { EsqueletoZona } from '../../../ui/Esqueleto';
import type { TTono } from '../../../ui/tonos';
import { cx } from '../../../../utils/cx';
import { estadoOperacion, estadoOperaciones, grupoOperacion, operacionArchivo, useOperacion, type TFiltroOps } from '../../../../store/hooks/useOperacion.hook';
import { abrirCarga, abrirCuentaPortalfirma, abrirEnEditor, abrirPlazos, confirmar, errorArchivoOperacion, pedirTelefonoOperaciones, toast } from '../../../../utils/app';
import { abrirConfiguracion } from '../../integraciones/controlador';
import VistaPrevia from './VistaPrevia';
import type { IDetalleOperacion, IFirmante, IOperacion, TVersionDoc } from '../../../../store/interfaces/operacion.interface';

const FILTROS: [TFiltroOps, string][] = [['all', 'Todas'], ['pending', 'En firma'], ['signed', 'Firmadas'], ['notary', 'Notaría'], ['action', 'Requieren acción']];
// clase del estado (operacion.store) → tono e ícono del kit
const TONO: Record<string, TTono> = { ok: 'verde', wait: 'amarillo', bad: 'rojo', legal: 'lavanda', proto: 'lavanda', muted: 'gris' };
const ICONO: Record<string, string> = { ok: 'check', wait: 'clock', bad: 'alert', legal: 'notary', proto: 'notary', muted: 'file' };
const tono = (c: string): TTono => TONO[c] || 'gris';
const fechaHora = (iso?: string) => { try { if (!iso) return ''; const x = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); return `${p(x.getDate())}/${p(x.getMonth() + 1)}/${x.getFullYear()} ${p(x.getHours())}:${p(x.getMinutes())}`; } catch { return ''; } };
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
  // las versiones del documento que tiene Portalfirma: original, firmado y, si hay trámite notarial, legalizado (o protocolizado)
  const archivos = d.files || []; const sinInfo = !archivos.length;   // sin detalle de archivos se muestra el documento que haya
  const tiene = (k: TVersionDoc) => (sinInfo ? (k === 'original' || (k === 'signed' && d.status === 'finalized')) : archivos.some((f) => f.kind === k));
  const notarial = d.protocolizationNumber === 'legalization' || d.protocolizationNumber === 'protocolization';
  const versiones: { k: TVersionDoc; titulo: string; sub: string; icono: string; listo: boolean }[] = [
    { k: 'original', titulo: 'Documento Original', sub: fecha(d.createdDateAt), icono: 'file', listo: tiene('original') },
    { k: 'signed', titulo: 'Documento Firmado', sub: 'PDF', icono: 'sign', listo: tiene('signed') },
    ...(notarial ? [{ k: 'legalized' as TVersionDoc, titulo: d.protocolizationNumber === 'protocolization' ? 'Documento Protocolizado' : 'Documento Legalizado', sub: 'PDF', icono: 'notary', listo: tiene('legalized') }] : []),
  ];
  const masAvanzada = [...versiones].reverse().find((v) => v.listo)?.k ?? 'original';
  const [version, setVersion] = useState<TVersionDoc>(masAvanzada);
  useEffect(() => { setVersion(masAvanzada); }, [d.operation]); // eslint-disable-line react-hooks/exhaustive-deps -- al cambiar de operación se vuelve a la versión más avanzada
  const versionActual = versiones.find((v) => v.k === version) ?? versiones[0];
  // calidad en que firma (arrendador, mandante…): la que informa Portalfirma o la que registró Asset al enviar
  const calidad = (s: IFirmante) => s.alias || (it.asset?.firmantes || []).find((x) => nr(x.rut) && nr(x.rut) === nr(s.rut))?.calidad || '';
  const archivo = async (f: () => Promise<{ ok: boolean; data?: string | null; error?: string; code?: string }>, ok: (data: string) => void) => { const r = await f(); if (!r.ok) return errorArchivoOperacion(r); if (r.data) ok(r.data); };
  const reenviar = async (s: IFirmante) => {
    const a = [s.email, s.phone].filter(Boolean).join(' · ') || 'su contacto';
    if (!(await confirmar({ clave: 'modal-116', titulo: 'Reenviar enlace de firma', texto: `¿Reenviar el enlace de firma de la operación ${d.operation} a ${[s.name, s.paternalLastName].filter(Boolean).join(' ') || 'este firmante'} (${a})? Portalfirma lo manda por el canal que tenga.`, boton: 'Reenviar' }))) return;
    try {
      if (!s.id) throw new Error('Portalfirma no informó el identificador del firmante.');
      await operacionArchivo.reenviar({ operacion: d.operation, firmanteId: s.id });
      toast('Enlace reenviado');
    } catch (e) { toast('No se pudo reenviar: ' + (e as Error).message, 5000); }
  };
  return (
    <div className="op-det tw:flex tw:h-full tw:min-h-0 tw:flex-col tw:gap-ui">
      {/* barra: número de operación, fecha, estado y actualizar */}
      <div id="opdBarra" className="op-cab tw:flex tw:flex-none tw:flex-wrap tw:items-center tw:gap-2.5 tw:rounded-card tw:border tw:border-solid tw:border-edge tw:border-b-[3px] tw:border-b-edge-b tw:bg-card tw:p-2.5">
        {[['Operación', <b key="o" className="tw:text-[15px]">{d.operation}</b>], ['Fecha', <b key="f" className="tw:text-[15px]">{fechaHora(d.createdDateAt)}</b>],
          ['Estado', <Badge key="e" tono={tono(c)} variante="tactil" icono={ICONO[c]}>{l}</Badge>], ...(d.repertoireNumber ? [['Repertorio', <b key="r" className="tw:text-[15px]">{d.repertoireNumber}</b>]] : [])].map(([t, v]) => (
          <div key={String(t)} className="tw:flex tw:flex-col tw:gap-0.5 tw:rounded-control tw:bg-sunken tw:px-3.5 tw:py-2">
            <small className="tw:text-[11px] tw:font-semibold tw:uppercase tw:tracking-wide tw:text-muted">{t}</small>{v}
          </div>
        ))}
        <Boton variante="principal" tamano="sm" id="opdRef" icono="rotateR" className="tw:ml-auto" title="Actualizar" aria-label="Actualizar" onClick={alRefrescar} />
      </div>

      <div className="op-cuerpo tw:grid tw:min-h-0 tw:flex-1 tw:gap-ui tw:grid-cols-1 tw:max-xl:overflow-y-auto tw:xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
        <div className="op-lado tw:flex tw:min-h-0 tw:min-w-0 tw:flex-col tw:gap-ui tw:xl:overflow-y-auto">
          <Card relleno={false} className="op-versiones" titulo="Versiones del documento">
            <div className="tw:flex tw:flex-col tw:gap-2 tw:p-3">
              {versiones.map((v) => (
                <div key={v.k} data-version={v.k} data-listo={v.listo ? '' : undefined} aria-current={version === v.k || undefined}
                  className={cx('op-version tw:flex tw:items-center tw:gap-3 tw:rounded-control tw:border tw:border-solid tw:p-2.5', version === v.k && v.listo ? 'tw:border-lav-edge tw:bg-lav-soft' : 'tw:border-edge tw:bg-card')}>
                  <span className={cx('tw:grid tw:size-11 tw:flex-none tw:place-items-center tw:rounded-icono', v.listo ? 'tw:bg-green-soft tw:text-green-softink' : 'tw:bg-sunken tw:text-muted')}><Icono nombre={v.icono} tam={22} /></span>
                  <span className={cx('tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:leading-tight', !v.listo && 'tw:opacity-60')}><b className="tw:text-[13.5px] tw:break-words">{v.titulo}</b><small className="tw:text-[12px] tw:text-muted">{v.sub}</small></span>
                  <Badge tono={v.listo ? 'verde' : 'gris'} variante="tactil" className="tw:uppercase">{v.listo ? 'Completado' : 'Pendiente'}</Badge>
                  <Boton variante={version === v.k && v.listo ? 'principal' : 'secundario'} tamano="sm" data-ver={v.k} disabled={!v.listo} title={v.listo ? `Ver el ${v.titulo.toLowerCase()}` : 'Todavía no está disponible'} onClick={() => setVersion(v.k)}>Ver</Boton>
                </div>
              ))}
            </div>
          </Card>
          <div className="op-acciones tw:flex tw:flex-col tw:gap-2">
            <Boton bloque id="opdDl" icono="download" disabled={!hayDoc} onClick={() => archivo(() => operacionArchivo.guardar(d.operation, sinInfo ? undefined : version), (ruta) => toast('Guardado en ' + ruta, 4000))}>Descargar documento</Boton>
            <div className="tw:grid tw:grid-cols-2 tw:gap-2">
              <Boton variante="secundario" id="opdShare" icono="upload" disabled={!hayDoc} onClick={() => archivo(() => operacionArchivo.compartir(d.operation, sinInfo ? undefined : version), (x) => { if (x === 'folder') toast('El archivo quedó marcado en la carpeta: arrástralo a tu correo o WhatsApp.', 5000); })}>Compartir</Boton>
              <Boton variante="secundario" id="opdOpen" icono="edit" disabled={!hayDoc} onClick={async () => { const r = await operacionArchivo.ver(d.operation, sinInfo ? undefined : version); if (!r.ok) return errorArchivoOperacion(r); abrirEnEditor(r.data!.path); }}>Abrir en el editor</Boton>
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
                        <Boton variante="secundario" tamano="sm" data-reenviar={i} icono="mail" disabled={!s.id} title={s.id ? 'Reenviar el enlace de firma' : 'Portalfirma no informó el identificador del firmante'} onClick={() => reenviar(s)}>Reenviar enlace</Boton>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
        <Card relleno={false} className="op-prev tw:min-w-0 tw:xl:h-full" titulo={<span className="tw:flex tw:items-center tw:gap-2"><Icono nombre={versionActual.icono} tam={18} />{versionActual.titulo}</span>}>
          <div className="tw:h-full tw:p-3">
            {hayDoc ? <VistaPrevia key={`${d.operation}-${version}`} op={d.operation} version={sinInfo ? undefined : version} /> : <div className="opd-canvas" id="opdCanvas"><EstadoVacio icono="file" texto="Esta operación no trae su identificador de documento." /></div>}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function Operaciones({ sel: selInicial }: { sel?: number | null }) {
  const { items, lastSync, cuenta, filtro, q, sel, detalle, errorDetalle, sincronizando, operacionesGetAll, operacionesSincronizar, operacionesCompletar, operacionElegir, operacionesSetFiltro, operacionesSetCuenta } = useOperacion();
  const [listo, setListo] = useState(items.length > 0);   // con la lista de la vez anterior ya se ve al entrar (se actualiza enseguida)
  const [sinApi, setSinApi] = useState(false);   // la corredora no ha ingresado las credenciales de la API de Portalfirma

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
      // «Mis operaciones» se lee solo de la API de Portalfirma: sin las credenciales de la corredora (Integraciones) no hay qué mostrar
      if (!st?.integracion) { setSinApi(true); return; }
      operacionesSetCuenta('');
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

  if (sinApi) return (
    <Layout titulo="Mis operaciones" ilustracion={{ imagen: 'img/formas/etapa.svg', tinte: '#6d5bd0' }} subtitulo="Las operaciones se leen de la API de Portalfirma">
      <EstadoVacio icono="link" titulo="Conecta la API de Portalfirma"
        texto="El administrador de la corredora ingresa la clave «id», el customer_id, el correo y la contraseña de la empresa en Portalfirma, en Integraciones. Mientras tanto no se puede listar ni abrir operaciones."
        accion={<Boton id="opsIntegraciones" icono="link" onClick={() => abrirConfiguracion('integraciones')}>Abrir Integraciones</Boton>} />
    </Layout>
  );
  // mientras se sabe si hay cuenta conectada: la misma pantalla con esqueletos (no una pantalla vacía)
  if (!listo) return (
    <Layout altoCompleto titulo="Mis operaciones" ilustracion={{ imagen: 'img/formas/etapa.svg', tinte: '#6d5bd0' }} subtitulo="Leyendo tus operaciones…">
      <div className="op-cols">
        <Card relleno={false} className="op-lista-card">
          <EsqueletoZona etiqueta="Cargando tus operaciones" className="tw:flex tw:flex-col tw:gap-4 tw:p-4">
            <Esqueleto forma="control" alto={40} /><Esqueleto forma="control" alto={40} />
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="tw:flex tw:items-center tw:gap-3"><Esqueleto forma="icono" ancho={36} /><div className="tw:flex tw:flex-1 tw:flex-col tw:gap-2"><Esqueleto ancho="70%" alto={12} /><Esqueleto ancho="45%" alto={10} /></div><Esqueleto ancho={64} alto={22} /></div>
            ))}
          </EsqueletoZona>
        </Card>
        <div className="op-detalle"><div className="op-detalle-cuerpo"><Card relleno={false} className="op-detalle-lleno" /></div></div>
      </div>
    </Layout>
  );
  const n = (f: TFiltroOps) => (f === 'all' ? items.length : items.filter((x) => grupoOperacion(x) === f).length);
  const visibles = items.filter((it) => (filtro === 'all' || grupoOperacion(it) === filtro) && (!q || String(it.operation).includes(q) || String(it.name).toLowerCase().includes(q)));

  return (
    <Layout
      altoCompleto
      titulo="Mis operaciones"
      ilustracion={{ imagen: 'img/formas/etapa.svg', tinte: '#6d5bd0' }}
      subtitulo={<span id="opsWhen">{items.length} operaciones enviadas a firmar · actualizado {hace(lastSync)}</span>}
      acciones={<>
        <Boton id="opsSync" icono="rotateR" cargando={sincronizando} disabled={sincronizando} onClick={() => sincronizar()}>Sincronizar</Boton>
        <Boton variante="secundario" id="opsBulk" icono="files" onClick={() => abrirCarga()}>Firma masiva</Boton>
        <Boton variante="secundario" id="opsPlz" icono="calendar" onClick={abrirPlazos}>Plazos</Boton>
        {cuenta
          ? <Boton variante="secundario" id="opsPhone" icono="user" title={`Cuenta: ${cuenta} · cerrar sesión`} onClick={abrirCuentaPortalfirma}>{cuenta}</Boton>
          : <Boton variante="secundario" id="opsPhone" icono="phone" title="Cambiar el teléfono con que se buscan las operaciones" onClick={() => pedirTelefonoOperaciones(true)}>Teléfono</Boton>}
      </>}
    >
      {/* lista + detalle a alto fijo (.op-cols en globals.css); buscador y filtro quietos, solo la lista se desplaza */}
      <div className="op-cols">
        <Card relleno={false} className="op-lista-card">
          <div className="tw:flex tw:shrink-0 tw:flex-col tw:gap-2.5 tw:p-3 tw:border-0 tw:border-b tw:border-solid tw:border-edge"
            onKeyDown={(e) => { if (e.key === 'Enter' && /^\d{3,}$/.test(q) && !visibles.length) operacionElegir(Number(q)); }}>
            <Buscador kit id="opsQ" className="tw:w-full" valor={q} alCambiar={(v) => operacionesSetFiltro({ q: v.trim().toLowerCase() })} espera={0} placeholder="Documento o número de operación" />
            <Select id="opsFilters" aria-label="Estado" clasesCampo="tw:w-full"
              value={filtro} onChange={(e) => operacionesSetFiltro({ filtro: e.target.value as TFiltroOps })}
              opciones={FILTROS.map(([k, t]): [string, string] => [k, `${t} (${n(k)})`])} />
          </div>
          <div className="op-lista tw:flex tw:flex-col tw:gap-0.5 tw:p-1.5" id="opsList">
            {visibles.length ? visibles.map((it) => {
              const [l, c] = estadoOperacion(it); const on = sel === it.operation;
              return (
                <ItemLista key={it.operation} data-op={it.operation} alTocar={() => operacionElegir(it.operation)} aria-current={on || undefined}
                  className={cx('op-fila', on && 'sel tw:bg-lav-soft tw:hover:bg-lav-soft')}
                  media={<span className={cx('tw:grid tw:place-items-center tw:w-9 tw:h-9 tw:rounded-icono tw:text-muted', on ? 'tw:bg-card' : 'tw:bg-sunken')}><Icono nombre="file" tam={17} /></span>}
                  titulo={String(it.name).replace(/\.pdf$/i, '')}
                  detalle={<>N° {it.operation}{it.asset?.codigo && <> · <span className="op-asset tw:font-semibold tw:text-lav-softink" title="Enviado desde Asset">{it.asset.codigo}</span></>} · {fecha(it.updated || it.created)}{it.signers ? ` · ${it.signed}/${it.signers} firmaron` : ''}</>}
                  derecha={<Badge tono={tono(c)} punto>{l}</Badge>} />
              );
            }) : <EstadoVacio compacto className="tw:p-3" texto={items.length ? 'No hay operaciones con ese filtro.' : sincronizando ? 'Sincronizando tus operaciones…' : 'Aún no hay operaciones. Lo que envíes a firmar aparecerá aquí.'} />}
          </div>
        </Card>
        <div className="op-detalle">
          <div id="opsDetail" className="op-detalle-cuerpo">
            {sel == null ? <Card relleno={false} className="op-detalle-lleno"><EstadoVacio className="op-vacio" icono="file" titulo="Elige una operación" texto="Verás su documento, en qué etapa va y quién falta por firmar." /></Card>
              : errorDetalle ? <Card relleno={false} className="op-detalle-lleno"><EstadoVacio className="op-vacio" icono="alert" titulo="No se pudo abrir la operación" texto={errorDetalle} accion={<Boton variante="secundario" icono="rotateR" onClick={() => operacionElegir(sel, true)}>Reintentar</Boton>} /></Card>
                : !detalle ? <div className="op-vacio tw:grid tw:place-items-center"><div className="spinner" /></div>
                  : <Detalle d={detalle} items={items} alRefrescar={() => operacionElegir(detalle.operation, true)} />}
          </div>
        </div>
      </div>
    </Layout>
  );
}
