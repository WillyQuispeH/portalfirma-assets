// Carga masiva: subir muchos documentos y enviarlos a firmar de una vez (la firma masiva con certificado se quitó: la API de
// integración de Portalfirma no la ofrece).
//
// Sin documentos, solo está la zona de carga, centrada (como «Enviar a firmar»). Al cargar, cada documento es una tarjeta con su
// PDF, en una fila que se desplaza hacia el lado; la altura de la tarjeta es la del PDF. Se analizan solos (una barra recorre el PDF)
// y cada tarjeta tiene «Analizar» y «Firmantes»: este último abre, encima del PDF, los datos de los firmantes, la página para las
// firmas y el trámite. «Sincronizar PDF» copia esa configuración a todos los demás. Al enviar, la tarjeta muestra que está
// enviando; si se envió desaparece y si falló queda marcada con el error.
//
// La cola la procesa el proceso principal (src/bulk.js) y manda su estado en vivo (pf.onBulk → masiva.js → evento «pf:bulk»).
// Los id #bkDrop, #bkDrive, #bkOps, la clase bk-card y los data-a (analyze, edit, send, sync…) los usan las pruebas.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Icono from '../../../ui/Icono';
import Layout from '../../../ui/Layout';
import Boton from '../../../ui/Boton';
import Input from '../../../ui/Input';
import Select from '../../../ui/Select';
import Switch from '../../../ui/Switch';
import MenuMas from '../../../ui/MenuMas';
import { cola, estadoMasiva, useMasiva } from '../../../../store/hooks/useMasiva.hook';
import { envioOperacion } from '../../../../store/hooks/useEnvio.hook';
import { abrirDrive, abrirOperaciones, confirmar, confirmarEnvioMasivo, toast } from '../../../../utils/app';
import { TIPOS_FIRMA, TRAMITES_NOTARIALES } from '../../../../utils/envio';
import PdfConFirmas, { degradadoFirmante, type IPos } from '../../agenda/PdfConFirmas';
import { HojaLeyendo } from '../enviar-a-firmar/Analizando';
import type { IColaMasiva, IDocMasiva, IFirmanteMasiva, TEstadoDoc } from '../../../../store/interfaces/masiva.interface';

// nombre y color de cada estado (colores sólidos con el número en blanco: así se lee)
const C = { gris: '#6b7280', azul: '#3f4fe6', verde: '#1f8f55', ambar: '#b45f06', rojo: '#d63b3b' };
const ESTADO: Record<TEstadoDoc, [string, string]> = {
  queued: ['En cola', C.gris], converting: ['Convirtiendo a PDF', C.azul], uploading: ['Leyendo el documento', C.azul], analyzing: ['Analizando', C.azul],
  ready: ['Listo', C.verde], needs_data: ['Faltan datos', C.ambar], sending: ['Enviando', C.azul], sent: ['Enviado', C.verde],
  error: ['Error', C.rojo], send_error: ['No se envió', C.rojo], skipped: ['Omitido', C.gris],
};
const ANALIZANDO: TEstadoDoc[] = ['queued', 'converting', 'uploading', 'analyzing'];
const OCUPADO: TEstadoDoc[] = [...ANALIZANDO, 'sending'];
// lectura del estado para src/renderer/masiva.js (window.Masiva._bk: pruebas y depuración)
(window as unknown as Record<string, unknown>).__estadoMasiva = estadoMasiva;

const RAZON_HOJA = 612 / 792;   // la hoja carta; las demás caben igual dentro de ese espacio
const ALTO_CABECERA = 0;        // la tarjeta no tiene cabecera: el PDF llega hasta arriba
const ALTO_PIE = 46;            // botones de la tarjeta
const ANCHO_PANEL = 460;

const vacio = (): IFirmanteMasiva => ({ fullName: '', rut: '', email: '', phone: '', alias: '' });

/** los datos de los firmantes de un documento, encima de su PDF: se guardan solos al escribir */
function PanelFirmantes({ it, alCerrar }: { it: IDocMasiva; alCerrar: () => void }) {
  const { opciones } = useMasiva();
  const [filas, setFilas] = useState<IFirmanteMasiva[]>(() => (it.signers?.length ? it.signers.map((s) => ({ ...s })) : [vacio()]));
  const ref = useRef(filas); const t = useRef<number | undefined>(undefined); const pendiente = useRef(false);
  const volcar = () => { clearTimeout(t.current); if (pendiente.current) { pendiente.current = false; cola.actualizar(it.id, { signers: ref.current }); } };
  const poner = (l: IFirmanteMasiva[]) => { ref.current = l; setFilas(l); pendiente.current = true; clearTimeout(t.current); t.current = window.setTimeout(volcar, 450); };
  useEffect(() => volcar, []); // eslint-disable-line react-hooks/exhaustive-deps -- al cerrar el panel se guarda lo que falte
  const cambiar = (i: number, k: keyof IFirmanteMasiva, v: string) => poner(ref.current.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  return (
    <div data-panel={it.id} className="tw:absolute tw:inset-0 tw:z-20 tw:flex tw:flex-col tw:gap-3 tw:overflow-y-auto tw:rounded-[6px] tw:bg-card tw:px-3 tw:pb-3">
      <div className="tw:sticky tw:top-0 tw:z-10 tw:-mx-3 tw:flex tw:items-center tw:gap-2 tw:border-b tw:border-line tw:bg-card tw:px-3 tw:py-2">
        <b className="tw:min-w-0 tw:flex-1 tw:truncate tw:text-[13px]">Firmantes y configuración</b>
        <Boton id="bkListo" tamano="sm" icono="check" onClick={() => { volcar(); alCerrar(); }}>Listo</Boton>
      </div>
      {filas.map((s, i) => (
        <div key={i} className="bk-sigrow-card tw:rounded-control tw:border tw:border-line tw:p-2.5" data-i={i}>
          <div className="tw:mb-2 tw:flex tw:items-center tw:gap-2">
            <span className="order" style={{ background: degradadoFirmante(i), color: '#fff' }}>{i + 1}</span>
            <strong className="tw:min-w-0 tw:flex-1 tw:truncate tw:text-[13px]">{s.fullName || 'Nuevo firmante'}</strong>
            <Boton variante="fantasma" tamano="sm" icono="trash" title="Quitar" aria-label="Quitar firmante" data-rm={i} disabled={filas.length === 1} className="tw:px-2 tw:text-red-ink"
              onClick={() => poner(ref.current.filter((_, j) => j !== i))} />
          </div>
          <div className="tw:grid tw:grid-cols-2 tw:gap-2">
            <Input data-i={i} data-k="fullName" etiqueta="Nombre completo *" value={s.fullName} onChange={(e) => cambiar(i, 'fullName', e.target.value)} />
            <Input data-i={i} data-k="rut" etiqueta="RUT *" value={s.rut} placeholder="12.345.678-9" onChange={(e) => cambiar(i, 'rut', e.target.value)} />
            <Input data-i={i} data-k="alias" etiqueta="Rol en el documento *" value={s.alias} placeholder="arrendador, comprador…" onChange={(e) => cambiar(i, 'alias', e.target.value)} />
            <Input data-i={i} data-k="email" type="email" etiqueta="Correo *" value={s.email} placeholder="nombre@correo.cl" onChange={(e) => cambiar(i, 'email', e.target.value)} />
            <Input data-i={i} data-k="phone" type="tel" etiqueta="Teléfono" value={s.phone} placeholder="+56 9 1234 5678" onChange={(e) => cambiar(i, 'phone', e.target.value)} />
            <Select data-i={i} data-k="typeSign" etiqueta="Tipo de firma" value={s.typeSign || opciones.typeSign} opciones={Object.entries(TIPOS_FIRMA)} onChange={(e) => cambiar(i, 'typeSign', e.target.value)} />
          </div>
        </div>
      ))}
      <Boton variante="secundario" tamano="sm" icono="plus" id="bkAdd" bloque onClick={() => poner([...ref.current, vacio()])}>Agregar firmante</Boton>
      <Select id="bkTramite" etiqueta="Trámite notarial" value={it.tramite || opciones.protocolization} opciones={Object.entries(TRAMITES_NOTARIALES)} onChange={(e) => cola.actualizar(it.id, { tramite: e.target.value })} />
      <Switch id="bkPaginaExtra" activo={it.paginaExtra === true} alCambiar={(v) => cola.actualizar(it.id, { paginaExtra: v })} etiqueta="Agregar página para las firmas" />
      {!!it.missing?.length && it.status === 'needs_data' && <p className="tw:m-0 tw:text-[12px] tw:text-red-softink" data-faltan>{it.missing.join(' · ')}</p>}
    </div>
  );
}

/** el PDF de la tarjeta: con las firmas ya puestas, que se arrastran ahí mismo (se guardan solas en el documento) */
function PdfDeTarjeta({ it, ruta }: { it: IDocMasiva; ruta: string }) {
  const [pdf, setPdf] = useState('');
  const ultima = useRef<IPos[] | null>(null); const t = useRef<number | undefined>(undefined);
  const guardar = useCallback(() => { clearTimeout(t.current); if (ultima.current) { cola.actualizar(it.id, { posiciones: ultima.current }); ultima.current = null; } }, [it.id]);
  useEffect(() => {
    let vivo = true; envioOperacion.vistaPrevia(ruta).then((b) => { if (vivo && b) setPdf(b); }).catch(() => null);
    return () => { vivo = false; guardar(); };
  }, [ruta, guardar]);
  const alCambiar = useCallback((p: IPos[] | null) => { if (!p) return; ultima.current = p; clearTimeout(t.current); t.current = window.setTimeout(guardar, 400); }, [guardar]);
  const firmantes = (it.signers || []).map((x, i) => ({ nombre: x.fullName.trim() || `Firmante ${i + 1}`, rol: x.alias || undefined, pagina: x.pagina || undefined }));
  if (!pdf) return <HojaLeyendo ruta={ruta} barrido={false} />;
  // con otra cantidad de firmantes se vuelve a armar (las firmas ubicadas ya no corresponden)
  return <PdfConFirmas key={`${it.id}-${firmantes.length}-${it.syncRev || 0}`} pdf={pdf} firmantes={firmantes} alCambiar={alCambiar} alto="100%" sinFirmas={it.paginaExtra === true}
    posicionesIniciales={it.posiciones?.length === firmantes.length ? it.posiciones : undefined} />;
}

/** una tarjeta por documento: su PDF (de la altura del PDF) con la «x» flotante, y los botones debajo */
function Tarjeta({ it, hoja, abierta, saliendo, alAbrir }: { it: IDocMasiva; hoja: number; abierta: boolean; saliendo: boolean; alAbrir: () => void }) {
  const caja = useRef<HTMLDivElement>(null);
  const [cerca, setCerca] = useState(false);
  useEffect(() => {   // el PDF se carga cuando la tarjeta se acerca a la parte visible (puede haber decenas)
    const el = caja.current; if (!el) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setCerca(true); return undefined; }
    const o = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setCerca(true); }, { rootMargin: '0px 600px 0px 600px' });
    o.observe(el); return () => o.disconnect();
  }, []);
  const analizando = ANALIZANDO.includes(it.status); const enviando = it.status === 'sending'; const fallo = it.status === 'error' || it.status === 'send_error';
  const ruta = it.pdfPath || (/\.pdf$/i.test(it.path || '') ? it.path : undefined);
  const conFirmantes = !!it.signers?.length && ['ready', 'needs_data', 'sending', 'sent', 'send_error'].includes(it.status);
  const ancho = abierta ? ANCHO_PANEL : Math.round((hoja - 12) * RAZON_HOJA) + 12 + 18;   // la hoja entera en la altura, más su aire y el borde de la tarjeta
  const quitar = async () => { if (await confirmar({ clave: 'modal-151', titulo: 'Quitar documento', texto: `¿Quitar «${it.name}» de la lista? No se envía a firmar.`, boton: 'Quitar', peligro: true })) cola.quitar(it.id); };
  return (
    <div ref={caja} data-id={it.id} data-estado={it.status} title={it.name} className={`bk-card tw:flex tw:flex-none tw:flex-col tw:gap-1.5 tw:overflow-hidden tw:rounded-card tw:border tw:border-solid tw:bg-card tw:p-2 tw:transition-[width,max-width,opacity,margin] tw:duration-500 tw:ease-[cubic-bezier(.22,1,.36,1)] ${fallo ? 'tw:border-red-edge' : abierta ? 'tw:border-lav-edge' : 'tw:border-edge'} tw:border-b-[3px] ${it.status === 'skipped' ? 'tw:opacity-70' : ''}`}
      style={{ width: saliendo ? 0 : ancho, maxWidth: saliendo ? 0 : undefined, opacity: saliendo ? 0 : undefined, marginRight: saliendo ? -12 : undefined, padding: saliendo ? 0 : undefined, borderWidth: saliendo ? 0 : undefined }}>
      <div className="tw:relative tw:overflow-hidden tw:rounded-[4px] tw:bg-sunken" style={{ height: hoja }}>
        {cerca && ruta && !abierta
          ? (conFirmantes && !analizando ? <PdfDeTarjeta it={it} ruta={ruta} /> : <HojaLeyendo ruta={ruta} barrido={analizando} />)
          : !abierta && <div className="tw:grid tw:h-full tw:place-items-center tw:px-3 tw:text-center tw:text-[12px] tw:text-muted">{analizando ? 'Preparando el documento…' : ''}</div>}
        {abierta && <PanelFirmantes it={it} alCerrar={alAbrir} />}
        {!OCUPADO.includes(it.status) && it.status !== 'sent' && !abierta && (
          <Boton variante="secundario" tamano="sm" icono="x" data-a="rm" title="Quitar de la lista" aria-label="Quitar de la lista" onClick={quitar}
            className="tw:absolute! tw:top-2 tw:right-3 tw:z-30 tw:size-8 tw:rounded-full! tw:p-0! tw:shadow-[0_2px_8px_rgb(16_24_64/.25)]" />
        )}
        {(fallo || it.status === 'skipped') && it.error && !abierta && <p className={`tw:absolute tw:inset-x-0 tw:bottom-0 tw:z-10 tw:m-0 tw:line-clamp-3 tw:px-2.5 tw:py-2 tw:text-[11.5px] ${fallo ? 'tw:bg-red tw:text-red-ink' : 'tw:bg-yellow tw:text-yellow-ink'}`} title={it.error} data-error>{it.error}</p>}
        {enviando && (
          <div role="status" aria-label="Enviando a firmar" className="tw:absolute tw:inset-0 tw:z-30 tw:grid tw:place-items-center tw:bg-card/75 tw:backdrop-blur-[1px]">
            <div className="tw:flex tw:flex-col tw:items-center tw:gap-2 tw:text-[13px] tw:font-semibold"><div className="spinner" />Enviando a firmar…</div>
          </div>
        )}
        {it.status === 'sent' && (
          <div className="tw:absolute tw:inset-0 tw:z-30 tw:grid tw:place-items-center tw:bg-card/80">
            <div className="tw:flex tw:flex-col tw:items-center tw:gap-1 tw:text-green-softink"><Icono nombre="check" tam={34} /><b className="tw:text-[13px]">Enviado a firmar</b>{it.operation ? <small>Operación {it.operation}</small> : null}</div>
          </div>
        )}
      </div>

      <div className="tw:flex tw:items-center tw:justify-end tw:gap-1.5 tw:[&>button]:flex-1" style={{ minHeight: ALTO_PIE - 8 }}>
        {it.status === 'send_error'
          ? <Boton variante="secundario" tamano="sm" data-a="rearm" title="Revisa antes en Mis operaciones que no se haya creado" onClick={() => cola.volverAListo(it.id)}>Volver a listo</Boton>
          : it.status === 'skipped' && (it.forzable || it.dupSent || /ya se envi|repetido|No se pudo leer/i.test(it.error || ''))
            ? <Boton variante="secundario" tamano="sm" data-a="force" title="Seguir con este documento de todos modos" onClick={() => cola.cargarIgual(it.id)}>Reintentar</Boton>
            : <Boton variante="secundario" tamano="sm" data-a="analyze" disabled={OCUPADO.includes(it.status) || it.status === 'sent' || it.status === 'skipped'} cargando={analizando} onClick={() => cola.reanalizar(it.id)}>Analizar</Boton>}
        <Boton variante={abierta ? 'principal' : 'secundario'} tamano="sm" icono="users" data-a="edit" disabled={!['ready', 'needs_data'].includes(it.status)} onClick={alAbrir}
          title={it.status === 'needs_data' ? 'Faltan datos de los firmantes' : undefined}>
          Firmantes{it.status === 'needs_data' && !abierta && <i aria-hidden="true" className="tw:size-2 tw:rounded-full tw:bg-yellow-edge" data-faltan-punto />}
        </Boton>
      </div>
    </div>
  );
}

function Cargar() {
  const { cola: st, opciones } = useMasiva();
  const [abierto, setAbierto] = useState<string | null>(null);
  const [saliendo, setSaliendo] = useState<Set<string>>(new Set());
  const fila = useRef<HTMLDivElement>(null);
  const [alto, setAlto] = useState(560);
  const programados = useRef<Set<string>>(new Set());
  const [tip, setTip] = useState<{ it: IDocMasiva; x: number; y: number } | null>(null);
  // lleva la fila hasta una tarjeta (la deja al centro)
  const irA = (id: string) => {
    const f = fila.current; const c = f?.querySelector<HTMLElement>(`[data-id="${id}"]`); if (!f || !c) return;
    f.scrollTo({ left: Math.max(0, c.offsetLeft - (f.clientWidth - c.offsetWidth) / 2), behavior: 'smooth' });
  };
  // con la rueda hacia arriba/abajo la fila avanza hacia el lado (dentro de un PDF, la rueda sigue siendo de sus hojas; con Shift siempre es de la fila)
  const alRodar = (e: React.WheelEvent<HTMLDivElement>) => {
    if (Math.abs(e.deltaX) >= Math.abs(e.deltaY) || (e.target as HTMLElement).closest('#pcfScroll,[data-panel]')) return;
    fila.current!.scrollLeft += e.deltaY;
  };

  // la altura de la fila manda: la hoja del PDF ocupa todo lo que queda bajo el nombre y sobre los botones
  useLayoutEffect(() => {
    const el = fila.current; if (!el) return undefined;
    const medir = () => setAlto(Math.max(300, el.clientHeight));
    medir(); const o = new ResizeObserver(medir); o.observe(el); return () => o.disconnect();
  });
  const hoja = Math.max(220, alto - 16 - 6 - ALTO_CABECERA - ALTO_PIE - 14);   // padding, huecos, cabecera y pie

  // lo enviado se queda un momento con su «Enviado» y sale de la fila
  useEffect(() => {
    for (const it of st.items) {
      if (it.status !== 'sent' || programados.current.has(it.id)) continue;
      programados.current.add(it.id);
      setTimeout(() => setSaliendo((s) => new Set(s).add(it.id)), 1300);
      setTimeout(() => { cola.quitar(it.id); setSaliendo((s) => { const n = new Set(s); n.delete(it.id); return n; }); programados.current.delete(it.id); setAbierto((a) => (a === it.id ? null : a)); }, 1900);
    }
  }, [st.items]);

  const n = st.items.length;
  const listos = st.items.filter((x) => x.status === 'ready');
  const trabajando = st.items.some((x) => OCUPADO.includes(x.status));
  const origen = (abierto && st.items.find((x) => x.id === abierto && x.signers?.length)) || st.items.find((x) => ['ready', 'needs_data'].includes(x.status) && x.signers?.length);
  const vaciar = async () => {
    if (await confirmar({ clave: 'modal-152', titulo: 'Vaciar la lista', texto: `¿Quitar los ${n} documentos de la lista? No se envía ninguno a firmar.`, boton: 'Vaciar', peligro: true })) { setAbierto(null); cola.vaciar('all'); }
  };
  const sincronizar = async () => {
    if (!origen) return;
    const r = await cola.sincronizar(origen.id);
    if (!r.ok) return toast(r.error || 'No se pudo sincronizar', 5000);
    const k = (r.data as { sincronizados?: number })?.sincronizados ?? 0;
    toast(k ? `Listo: ${k} ${k === 1 ? 'PDF quedó' : 'PDF quedaron'} con la configuración de «${origen.name}»` : 'No hay otros PDF para sincronizar');
  };

  const zona = (
    <div id="bkDrop" role="button" tabIndex={0} className="dropzone tw:m-auto tw:min-h-0! tw:w-full tw:max-w-[760px] tw:flex-none tw:gap-ui tw:py-10" style={{ height: 'min(100%, 520px)' }}
      onClick={(e) => { if ((e.target as HTMLElement).closest('#bkDrive')) return abrirDrive(); cola.elegir(); }} onKeyDown={(e) => { if (e.key === 'Enter') cola.elegir(); }}>
      <div className="drop-icon"><Icono nombre="upload" tam={44} /></div>
      <h2>Arrastra aquí tus documentos</h2>
      <p className="muted">PDF o Word, hasta 20 MB cada uno. Se analizan solos apenas se cargan.</p>
      <div className="tw:flex tw:flex-wrap tw:justify-center tw:gap-ui">
        <Boton variante="secundario" id="bkPick">Elegir archivos…</Boton>
        <Boton variante="secundario" icono="drive" id="bkDrive">Desde Google Drive</Boton>
      </div>
    </div>
  );

  return (
    <Layout altoCompleto migas={false} titulo="Firma masiva" ilustracion={{ imagen: 'img/formas/etapa.svg', tinte: '#6d5bd0' }}
      subtitulo={n ? undefined : 'Sube muchos documentos y envíalos a firmar de una vez.'}
      acciones={<Boton variante="secundario" icono="listCheck" id="bkOps" onClick={abrirOperaciones}>Mis operaciones</Boton>}
      pieIzquierda={n ? <>
        {n > 1 && (
          <nav id="bkMini" aria-label="Ir a un documento" className="bk-mini tw:flex tw:max-h-[68px] tw:min-w-0 tw:flex-wrap tw:items-center tw:gap-1.5 tw:overflow-y-auto tw:py-0.5">
            {st.items.map((it, i) => (
              <button key={it.id} type="button" data-mini={it.id} aria-label={`Ir al documento ${i + 1}: ${it.name}`} onClick={() => irA(it.id)}
                onMouseEnter={(e) => { const b = e.currentTarget.getBoundingClientRect(); setTip({ it, x: b.left + b.width / 2, y: b.top }); }} onMouseLeave={() => setTip(null)} onFocus={(e) => { const b = e.currentTarget.getBoundingClientRect(); setTip({ it, x: b.left + b.width / 2, y: b.top }); }} onBlur={() => setTip(null)}
                style={{ background: ESTADO[it.status][1] }}
                className={`tw:inline-grid tw:size-8 tw:flex-none tw:cursor-pointer tw:place-items-center tw:rounded-[7px] tw:border-0 tw:p-0 tw:text-[12.5px] tw:font-bold tw:leading-none tw:text-white tw:transition-transform hover:tw:-translate-y-0.5`}>
                {OCUPADO.includes(it.status) ? <span className="spinner sm" aria-hidden="true" /> : it.status === 'sent' ? <Icono nombre="check" tam={15} /> : i + 1}
              </button>
            ))}
          </nav>
        )}
      </> : undefined}
      pieAcciones={n ? <>
        <MenuMas id="bkMas2" etiqueta="Más acciones" opciones={[{ id: 'bkVaciar', texto: 'Vaciar la lista', icono: 'trash', disabled: trabajando || !!st.sending, alTocar: vaciar }]} />
        <Boton variante="secundario" icono="layers" data-a="sync" disabled={!origen || n < 2 || st.sending} title="Copia los firmantes y la configuración de este PDF a todos los demás" onClick={sincronizar}>Sincronizar PDF</Boton>
        {st.sending
          ? <Boton variante="secundario" data-a="stop" onClick={() => cola.detener()}>Detener el envío</Boton>
          : <Boton icono="sign" data-a="send" disabled={!listos.length} onClick={() => confirmarEnvioMasivo(listos.map((x) => x.id), opciones)}>Enviar {listos.length} a firmar</Boton>}
      </> : undefined}>
      {n === 0
        ? <div className="envio-cols" data-solo><div className="envio-der">{zona}</div></div>
        : (
          <div className="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-2">
            <div ref={fila} id="bkFila" onWheel={alRodar} className="tw:relative tw:flex tw:min-h-0 tw:flex-1 tw:items-stretch tw:gap-3 tw:overflow-x-auto tw:overflow-y-hidden tw:pb-2">
              {st.items.map((it) => <Tarjeta key={it.id} it={it} hoja={hoja} abierta={abierto === it.id} saliendo={saliendo.has(it.id)} alAbrir={() => setAbierto((a) => (a === it.id ? null : it.id))} />)}
              <div id="bkMas" role="button" tabIndex={0} title="Agregar más documentos" onClick={(e) => { if ((e.target as HTMLElement).closest('#bkDrive')) return abrirDrive(); cola.elegir(); }}
                className="dropzone tw:min-h-0! tw:flex-none tw:gap-2 tw:px-4 tw:py-4" style={{ width: 190 }}>
                <span className="tw:text-lav-softink"><Icono nombre="plus" tam={26} /></span>
                <b className="tw:text-[13px]">Agregar más</b>
                <Boton variante="secundario" tamano="sm" icono="drive" id="bkDrive">Drive</Boton>
              </div>
            </div>
          </div>
        )}
      {tip && (
        <div role="tooltip" data-bk-tip className="tw:pointer-events-none tw:fixed tw:z-[200] tw:max-w-[260px] tw:rounded-control tw:border tw:border-solid tw:border-edge tw:bg-card tw:px-3 tw:py-2 tw:text-[12.5px] tw:shadow-[0_6px_20px_rgb(16_24_64/.22)]"
          style={{ left: Math.min(Math.max(8, tip.x - 130), window.innerWidth - 268), bottom: window.innerHeight - tip.y + 8 }}>
          <b className="tw:block tw:truncate">{tip.it.name}</b>
          <span className="tw:block tw:text-muted">{ESTADO[tip.it.status][0]}{['skipped', 'error', 'send_error'].includes(tip.it.status) && tip.it.error ? `: ${tip.it.error}` : ''}</span>
          <span className="tw:block tw:text-muted">{tip.it.signers?.length ? `${tip.it.signers.length} ${tip.it.signers.length === 1 ? 'firmante' : 'firmantes'}: ${tip.it.signers.map((x) => x.fullName || x.rut || '?').slice(0, 3).join(', ')}${tip.it.signers.length > 3 ? '…' : ''}` : 'Sin firmantes'}</span>
        </div>
      )}
    </Layout>
  );
}

export default function CargaMasiva() {
  const { masivaSetCola } = useMasiva();
  useEffect(() => {
    cola.estado().then((r) => { if (r.ok && r.data) masivaSetCola(r.data); });
    const alCambiar = (e: Event) => masivaSetCola((e as CustomEvent<IColaMasiva>).detail);
    window.addEventListener('pf:bulk', alCambiar);
    return () => window.removeEventListener('pf:bulk', alCambiar);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- solo al montar
  return <Cargar />;
}
