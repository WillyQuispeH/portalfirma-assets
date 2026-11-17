// Gestión documental › Enviar a firmar. Son cuatro pantallas que comparten el estado (envio.store.ts):
//   drop     soltar o elegir el documento (también desde Google Drive)
//   working  Portalfirma lo sube y detecta los firmantes
//   review   revisar la firma, el trámite notarial, el pago y los firmantes; confirmar y enviar
//   done     enviado: número de operación y los enlaces de firma
// Cada una se monta en su <section id="view-…"> de index.html, porque muchos módulos abren una con show('drop'),
// show('review')… El arrastre de archivos sobre la ventana sigue en app.js (es de toda la app).
// Los id (#sendBtn, #payerEmail, #doneOp…) los usan las pruebas.
import { useEffect } from 'react';
import Icono from '../../../ui/Icono';
import Layout from '../../../ui/Layout';
import Card from '../../../ui/Card';
import { EsqueletoTexto, EsqueletoZona } from '../../../ui/Esqueleto';
import Firmantes from './Firmantes';
import DetalleOperacion from './DetalleOperacion';
import ConfirmarEnvio from './ConfirmarEnvio';
import { envioEstado, envioOperacion, useEnvio } from '../../../../store/hooks/useEnvio.hook';
import { abrirDrive, abrirEnEditor, abrirOperaciones, irAlEditor, toast, verOperacion, mostrarVista } from '../../../../utils/app';
import { abrirModal } from '../../../../utils/modal';
import { correoValido } from '../../../../utils/rut';
import { TIPOS_FIRMA, TRAMITES_NOTARIALES, configBloqueada, construirPayload, erroresFirmante } from '../../../../utils/envio';
import { analizarDocumento } from './controlador';

import Boton from '../../../ui/Boton';
import Input from '../../../ui/Input';
import Select from '../../../ui/Select';
export type TPasoEnvio = 'drop' | 'working' | 'review' | 'done';

function Soltar() {
  const elegir = async () => { try { const f = await envioOperacion.elegirArchivo(); if (f) analizarDocumento(f); } catch (e) { toast((e as Error).message, 4000); } };
  return (
    <Layout titulo="Enviar a firmar" ilustracion={{ imagen: 'img/formas/etapa.svg', tinte: '#6d5bd0' }} subtitulo="Sube un documento, revisa sus firmantes y envíalo a firmar con Portalfirma.">
      <div id="dropzone" className="dropzone tw:min-h-0! tw:gap-ui tw:py-12">
        <div className="drop-icon"><Icono nombre="upload" tam={44} /></div>
        <h2>Arrastra aquí tu documento</h2>
        <p className="muted">PDF o Word (se convierte a PDF antes de subirlo), hasta 20 MB · Excel, imágenes o varios archivos se abren en el Editor</p>
        <div className="tw:flex tw:flex-wrap tw:justify-center tw:gap-ui">
          <Boton variante="secundario" id="pickBtn" onClick={elegir}>Elegir archivo…</Boton>
          <Boton variante="secundario" icono="drive" id="pickDrive" onClick={() => abrirDrive('sign')}>Desde Google Drive</Boton>
        </div>
        <p className="muted small">¿Necesitas combinar, convertir, editar o reconocer texto antes de firmar? Usa el <a href="#" id="toEditor" onClick={(e) => { e.preventDefault(); irAlEditor(); }}>Editor</a>.</p>
      </div>
    </Layout>
  );
}

function Analizando() {
  const { archivo, pasoAnalisis } = useEnvio();
  const clase = (i: number) => (i < pasoAnalisis ? 'done' : i === pasoAnalisis ? 'active' : '');
  return (
    <Layout titulo="Enviar a firmar" ilustracion={{ imagen: 'img/formas/etapa.svg', tinte: '#6d5bd0' }} subtitulo="Analizando el documento…"
      contenidoClassName="tw:items-center tw:pt-2">
      <Card className="tw:w-full tw:max-w-[420px] tw:text-center">
        <div className="spinner" />
        <h2 id="workingTitle">{archivo ? `Analizando ${archivo.name}…` : 'Analizando documento…'}</h2>
        <ol className="steps" id="workingSteps">
          <li data-s="1" className={clase(0)}>Subiendo a Portalfirma</li>
          <li data-s="2" className={clase(1)}>Detectando firmantes y tipo de documento</li>
        </ol>
      </Card>
    </Layout>
  );
}

function Revisar() {
  const { archivo, analisis, firmantes, requeridos, tipoFirma, protocolizacion, pagador, descuento, error, envioDatos, envioAgregar, envioCancelar, envioTocarTodos } = useEnvio();
  if (!analisis) return null;
  const x = analisis.extract || {}; const bloqueada = configBloqueada(analisis);
  const enviar = () => {
    envioTocarTodos();
    const malo = firmantes.findIndex((s) => Object.keys(erroresFirmante(s, requeridos)).length);
    if (malo >= 0) return envioDatos({ error: `Revisa los datos del firmante ${malo + 1}.` });
    if (!correoValido(pagador)) return envioDatos({ error: 'Ingresa el correo del pagador.' });
    envioDatos({ error: '' });
    const p = construirPayload(analisis, firmantes, { tipoFirma, protocolizacion, pagador, descuento });
    abrirModal(<ConfirmarEnvio analisis={analisis} archivo={archivo!} payload={p} />, { clave: 'modal-102' });
  };
  return (
    <Layout titulo={<span id="docType">{x.typeDocument || 'Documento'}</span>} ilustracion={{ imagen: 'img/formas/etapa.svg', tinte: '#6d5bd0' }}
      sobretitulo={<span className="file-chip" id="fileChip">{analisis.file.name}</span>}
      subtitulo={<span id="docSummary">{x.summary || ''}</span>}
      acciones={<Boton variante="secundario" id="cancelReview" onClick={() => { envioCancelar(); mostrarVista('drop'); }}>Cambiar documento</Boton>}>
    {archivo?.converted && (
      <div id="convNote" className="conv-note"><Icono nombre="convert" tam={16} />
        <span>«{archivo.original}» se convirtió a PDF antes de subirlo. Revisa que el formato haya quedado bien.</span>
        <Boton variante="secundario" tamano="sm" id="convView" onClick={() => abrirEnEditor(archivo.path)}>Ver PDF</Boton>
      </div>
    )}
    <div className="tw:grid tw:grid-cols-1 tw:gap-ui tw:md:grid-cols-2">
      <Card titulo="Formalización">
        {bloqueada ? (
          <div id="configLocked" className="notice">
            <strong>{x.documentConfig?.name || x.typeDocument || 'Tipo de documento'}</strong><br />
            Firma: {TIPOS_FIRMA[x.type_sign || ''] || x.type_sign || 'según tipo'} · Trámite: {TRAMITES_NOTARIALES[x.notarial_procedure || ''] || x.notarial_procedure || 'según tipo'}<br />
            <span className="muted small">Definido por el tipo de documento en Portalfirma.</span>
          </div>
        ) : (
          <div id="configFree" className="tw:flex tw:flex-col tw:gap-ui">
            <Select id="typeSignAll" etiqueta="Tipo de firma" value={tipoFirma} onChange={(e) => envioDatos({ tipoFirma: e.target.value })} opciones={Object.entries(TIPOS_FIRMA)} />
            <Select id="protocolization" etiqueta="Trámite notarial" value={protocolizacion} onChange={(e) => envioDatos({ protocolizacion: e.target.value })} opciones={Object.entries(TRAMITES_NOTARIALES)} />
          </div>
        )}
      </Card>
      <Card titulo="Pago">
        <div className="tw:flex tw:flex-col tw:gap-ui">
          <Input type="email" id="payerEmail" etiqueta="Correo del pagador" placeholder="nombre@empresa.cl" value={pagador} onChange={(e) => envioDatos({ pagador: e.target.value })} />
          <Input type="text" id="discount" etiqueta="Código de descuento (opcional)" value={descuento} onChange={(e) => envioDatos({ descuento: e.target.value })} />
        </div>
      </Card>
    </div>

    <Card titulo={<>Firmantes <span className="tw:text-[13px] tw:font-normal tw:text-muted">en orden de firma</span></>}
      accion={<Boton variante="secundario" tamano="sm" id="addSigner" onClick={envioAgregar}>+ Agregar firmante</Boton>}>
      <Firmantes />
    </Card>

    <div className="actions">
      <span id="reviewError" className="error">{error}</span>
      <Boton id="sendBtn" onClick={enviar}>Enviar a firmar</Boton>
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
