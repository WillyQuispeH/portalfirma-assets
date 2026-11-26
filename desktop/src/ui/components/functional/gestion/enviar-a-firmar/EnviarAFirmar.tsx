// Gestión documental › Enviar a firmar. Son cuatro pantallas que comparten el estado (envio.store.ts):
//   drop     soltar o elegir el documento (también desde Google Drive)
//   working  Portalfirma lo sube y detecta los firmantes
//   review   revisar la firma, el trámite notarial, el pago y los firmantes; confirmar y enviar
//   done     enviado: número de operación y los enlaces de firma
// Cada una se monta en su <section id="view-…"> de index.html, porque muchos módulos abren una con show('drop'),
// show('review')… El arrastre de archivos sobre la ventana sigue en app.js (es de toda la app).
// Los id (#sendBtn, #pcfUbicar, #doneOp…) los usan las pruebas.
import { useCallback, useEffect, useState } from 'react';
import Icono from '../../../ui/Icono';
import Layout from '../../../ui/Layout';
import Card from '../../../ui/Card';
import { EsqueletoTexto, EsqueletoZona } from '../../../ui/Esqueleto';
import Firmantes from './Firmantes';
import PdfConFirmas from '../../agenda/PdfConFirmas';
import Analizando, { HojaLeyendo } from './Analizando';
import DetalleOperacion from './DetalleOperacion';
import ConfirmarEnvio from './ConfirmarEnvio';
import { envioEstado, envioOperacion, useEnvio } from '../../../../store/hooks/useEnvio.hook';
import { abrirDrive, abrirEnEditor, abrirOperaciones, irAlEditor, toast, verOperacion, mostrarVista } from '../../../../utils/app';
import { abrirModal } from '../../../../utils/modal';
import { TIPOS_FIRMA, TRAMITES_NOTARIALES, configBloqueada, construirPayload, erroresFirmante } from '../../../../utils/envio';
import { analizarDocumento } from './controlador';

import Boton from '../../../ui/Boton';
import Select from '../../../ui/Select';
import Switch from '../../../ui/Switch';
export type TPasoEnvio = 'drop' | 'working' | 'review' | 'done';

/** cargar el documento: en pantalla solo está la zona de carga; la revisión (datos a la izquierda, PDF a la derecha) llega al terminar el análisis */
function Soltar() {
  const elegir = async () => { try { const f = await envioOperacion.elegirArchivo(); if (f) analizarDocumento(f); } catch (e) { toast((e as Error).message, 4000); } };
  return (
    <Layout altoCompleto migas={false} titulo="Enviar a firmar" ilustracion={{ imagen: 'img/formas/etapa.svg', tinte: '#6d5bd0' }} subtitulo="Sube un documento, revisa sus firmantes, ubica sus firmas y envíalo a firmar con Portalfirma.">
      <div className="envio-cols" data-solo>
        <div className="envio-der">
          <div id="dropzone" className="dropzone tw:m-auto tw:min-h-0! tw:w-full tw:max-w-[760px] tw:flex-none tw:gap-ui tw:py-10" style={{ height: 'min(100%, 520px)' }}>
            <div className="drop-icon"><Icono nombre="upload" tam={44} /></div>
            <h2>Arrastra aquí tu documento</h2>
            <p className="muted">PDF o Word (se convierte a PDF antes de subirlo), hasta 20 MB · Excel, imágenes o varios archivos se abren en el Editor</p>
            <div className="tw:flex tw:flex-wrap tw:justify-center tw:gap-ui">
              <Boton variante="secundario" id="pickBtn" onClick={elegir}>Elegir archivo…</Boton>
              <Boton variante="secundario" icono="drive" id="pickDrive" onClick={() => abrirDrive('sign')}>Desde Google Drive</Boton>
            </div>
            <p className="muted small">¿Necesitas combinar, convertir, editar o reconocer texto antes de firmar? Usa el <a href="#" id="toEditor" onClick={(e) => { e.preventDefault(); irAlEditor(); }}>Editor</a>.</p>
          </div>
        </div>
      </div>
    </Layout>
  );
}

/** cada análisis nuevo monta la revisión de nuevo (así la entrada animada parte desde cero) */
function Revisar() {
  const { analisis } = useEnvio();
  return analisis ? <RevisarPantalla key={String(analisis.ingest.document_id)} /> : null;
}

function RevisarPantalla() {
  const { archivo, analisis, firmantes, requeridos, tipoFirma, protocolizacion, posiciones, paginaExtra, error, envioDatos, envioAgregar, envioCancelar, envioTocarTodos } = useEnvio();
  // el PDF para ubicar las firmas (se lee del archivo analizado) y quiénes firman, con la página que encontró la IA
  const [pdf, setPdf] = useState(''); const [errorPdf, setErrorPdf] = useState('');
  const [resumenAbierto, setResumenAbierto] = useState(true);
  // recién analizado: parte con el PDF solo y al centro (como en el análisis); enseguida se corre a la derecha y se abren los datos
  const [entrada] = useState(() => envioEstado().entrada);
  const [abierto, setAbierto] = useState(!entrada);
  useEffect(() => {
    if (!entrada) return undefined;
    envioDatos({ entrada: false });
    let b = 0; const a = requestAnimationFrame(() => { b = requestAnimationFrame(() => setAbierto(true)); });
    // ya abierto, el PDF baja a la hoja donde está la firma del primero
    const t = setTimeout(() => window.dispatchEvent(new CustomEvent('pcf-ir', { detail: 0 })), 1000);
    return () => { cancelAnimationFrame(a); cancelAnimationFrame(b); clearTimeout(t); };
  }, [entrada, envioDatos]);
  const ruta = analisis ? String(analisis.ingest.document_id) : '';
  useEffect(() => {
    if (!ruta) return undefined;
    let vivo = true; setPdf(''); setErrorPdf('');
    envioOperacion.leerPdf(ruta).then((b) => { if (vivo) setPdf(b); }).catch((e: Error) => { if (vivo) setErrorPdf(e.message); });
    return () => { vivo = false; };
  }, [ruta]);
  const alCambiarPos = useCallback((p: { pagina: number; x: number; y: number }[] | null) => envioDatos({ posiciones: p }), [envioDatos]);
  const paraUbicar = firmantes.map((f, i) => ({ nombre: f.fullName.trim() || `Firmante ${i + 1}`, rol: f.alias.trim() || undefined, pagina: f.pagina || undefined }));
  if (!analisis) return null;
  const x = analisis.extract || {};
  // lo que la IA anotó del documento, un punto por cada observación
  const resumen = String(x.summary || '').split(' · ').map((t) => t.trim()).filter(Boolean); const bloqueada = configBloqueada(analisis);
  const enviar = () => {
    envioTocarTodos();
    const malo = firmantes.findIndex((s) => Object.keys(erroresFirmante(s, requeridos)).length);
    if (malo >= 0) return envioDatos({ error: `Revisa los datos del firmante ${malo + 1}.` });
    envioDatos({ error: '' });
    const p = construirPayload(analisis, firmantes, { tipoFirma, protocolizacion, posiciones, paginaExtra });
    abrirModal(<ConfirmarEnvio analisis={analisis} archivo={archivo!} payload={p} />, { clave: 'modal-102' });
  };
  return (
    <Layout altoCompleto migas={false} titulo={<span id="docType">{x.typeDocument || 'Documento'}</span>} ilustracion={{ imagen: 'img/formas/etapa.svg', tinte: '#6d5bd0' }}
      sobretitulo={<span className="file-chip" id="fileChip">{analisis.file.name}</span>}
      pieIzquierda={<span id="reviewError" className="error">{error}</span>} pieAcciones={<Boton id="sendBtn" onClick={enviar}>Enviar a firmar</Boton>}
      acciones={<Boton variante="secundario" id="cancelReview" onClick={() => { envioCancelar(); mostrarVista('drop'); }}>Cambiar documento</Boton>}>
    {archivo?.converted && (
      <div id="convNote" className="conv-note tw:shrink-0"><Icono nombre="convert" tam={16} />
        <span>«{archivo.original}» se convirtió a PDF antes de subirlo. Revisa que el formato haya quedado bien.</span>
        <Boton variante="secundario" tamano="sm" id="convView" onClick={() => abrirEnEditor(archivo.path)}>Ver PDF</Boton>
      </div>
    )}
    {/* izquierda con scroll (.envio-izq); derecha el PDF a todo el alto (.envio-der) — ver globals.css */}
    <div className="envio-cols" data-solo={abierto ? undefined : ''}>
      <div id="envioIzq" className="envio-izq">
      {resumen.length > 0 && (
        <Card titulo="Resumen del documento" subtitulo={resumenAbierto ? undefined : `${resumen.length} ${resumen.length === 1 ? 'observación' : 'observaciones'}`}
          accion={<Boton variante="fantasma" tamano="sm" id="resumenToggle" icono={resumenAbierto ? 'chevU' : 'chevD'} aria-expanded={resumenAbierto} aria-controls="docSummary"
            title={resumenAbierto ? 'Ocultar el resumen' : 'Mostrar el resumen'} onClick={() => setResumenAbierto((a) => !a)} />}>
          {resumenAbierto && (
            <ul id="docSummary" className="tw:m-0 tw:flex tw:list-disc tw:flex-col tw:gap-1.5 tw:pl-5 tw:text-[13.5px] tw:leading-snug">
              {resumen.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          )}
        </Card>
      )}
      <Card titulo="Formalización">
          {bloqueada ? (
            <div id="configLocked" className="notice">
              <strong>{x.documentConfig?.name || x.typeDocument || 'Tipo de documento'}</strong><br />
              Firma: {TIPOS_FIRMA[x.type_sign || ''] || x.type_sign || 'según tipo'} · Trámite: {TRAMITES_NOTARIALES[x.notarial_procedure || ''] || x.notarial_procedure || 'según tipo'}<br />
              <span className="muted small">Definido por el tipo de documento en Portalfirma.</span>
            </div>
          ) : (
            <div id="configFree" className="tw:flex tw:flex-col tw:gap-ui">
              {x.tipoConocido && <p id="tipoConocido" className="tw:m-0 tw:text-[13px] tw:text-muted">Es un documento de tipo <b>{x.tipoConocido.nombre}</b>: la firma y el trámite ya vienen llenos. Puedes cambiarlos.</p>}
              <Select id="tipoFirmaDoc" etiqueta="Tipo de firma" value={tipoFirma} resaltado={!!x.tipoConocido} onChange={(e) => envioDatos({ tipoFirma: e.target.value })} opciones={Object.entries(TIPOS_FIRMA)} />
              <Select id="protocolization" etiqueta="Trámite notarial" value={protocolizacion} resaltado={!!x.tipoConocido} onChange={(e) => envioDatos({ protocolizacion: e.target.value })} opciones={Object.entries(TRAMITES_NOTARIALES)} />
            </div>
          )}
          <Switch id="paginaExtra" className="tw:mt-ui" activo={paginaExtra} alCambiar={(v) => envioDatos({ paginaExtra: v })}
            etiqueta="Agregar página para las firmas" />
        </Card>

      <Card titulo={<>Firmantes <span className="tw:text-[13px] tw:font-normal tw:text-muted">en orden de firma · arrastra para cambiarlo</span></>}
        accion={<Boton variante="secundario" tamano="sm" id="addSigner" onClick={envioAgregar}>+ Agregar firmante</Boton>}>
        <Firmantes />
      </Card>
      </div>
      <div className="envio-der">
        {pdf
          ? <PdfConFirmas pdf={pdf} firmantes={paraUbicar} alCambiar={alCambiarPos} alto="100%" paginaInicial={entrada ? 1 : undefined} sinFirmas={paginaExtra} />
          : errorPdf ? <p className="tw:m-0 tw:text-[13px] tw:text-muted">No pude mostrar el documento ({errorPdf}). Se enviará con una página de firmas al final.</p> : <HojaLeyendo ruta={archivo?.path} barrido={false} />}
      </div>
    </div>

    </Layout>
  );
}

function Listo() {
  const { ultimaOp, mensaje, detalle, errorDetalle, crudo, envioDetalle } = useEnvio();
  // cada envío deja el detalle vacío: aquí se traen los enlaces de firma (una vez; si falla, se muestra el error)
  useEffect(() => { if (ultimaOp != null && !detalle && !errorDetalle) envioDetalle(ultimaOp); }, [ultimaOp, detalle, errorDetalle, envioDetalle]);
  return (
    <Layout titulo="Enviado a firmar" ilustracion={{ imagen: 'img/formas/etapa.svg', tinte: '#6d5bd0' }} subtitulo={<>Operación <strong id="doneOp">{ultimaOp ?? '(ver en Mis operaciones)'}</strong></>}
      acciones={<>
        <Boton variante="secundario" id="viewOpBtn" onClick={() => { const op = envioEstado().ultimaOp; if (op != null) verOperacion(Number(op)); else abrirOperaciones(); }}>Ver seguimiento</Boton>
        <Boton id="newDocBtn" onClick={() => mostrarVista('drop')}>Enviar otro documento</Boton>
      </>}>
      <Card>
        <div className="tw:flex tw:items-center tw:gap-3 tw:text-green-softink"><Icono nombre="check" tam={22} /><p id="doneMsg" className="tw:m-0 tw:text-sm tw:text-text">{mensaje}</p></div>
      </Card>
      <Card><div id="doneDetail">
        {ultimaOp == null ? <pre className="small">{JSON.stringify(crudo, null, 2)}</pre>
          : detalle && String(detalle.operation) === String(ultimaOp) ? <DetalleOperacion d={detalle} alActualizar={() => envioDetalle(ultimaOp)} />
          : errorDetalle ? <p className="muted">{errorDetalle}</p>
          : <EsqueletoZona etiqueta="Cargando los enlaces de firma"><EsqueletoTexto lineas={3} /></EsqueletoZona>}
      </div></Card>
    </Layout>
  );
}

export default function EnviarAFirmar({ paso }: { paso: TPasoEnvio }) {
  if (paso === 'drop') return <Soltar />;
  if (paso === 'working') return <Analizando />;
  if (paso === 'review') return <Revisar />;
  return <Listo />;
}
