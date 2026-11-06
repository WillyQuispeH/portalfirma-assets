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
import Firmantes from './Firmantes';
import DetalleOperacion from './DetalleOperacion';
import ConfirmarEnvio from './ConfirmarEnvio';
import { envioEstado, envioOperacion, useEnvio } from '../../../../store/hooks/useEnvio.hook';
import { abrirDrive, abrirEnEditor, abrirOperaciones, irAlEditor, toast, verOperacion, mostrarVista } from '../../../../utils/app';
import { abrirModal } from '../../../../utils/modal';
import { correoValido } from '../../../../utils/rut';
import { TIPOS_FIRMA, TRAMITES_NOTARIALES, configBloqueada, construirPayload, erroresFirmante } from '../../../../utils/envio';
import { analizarDocumento } from './controlador';

export type TPasoEnvio = 'drop' | 'working' | 'review' | 'done';

function Soltar() {
  const elegir = async () => { try { const f = await envioOperacion.elegirArchivo(); if (f) analizarDocumento(f); } catch (e) { toast((e as Error).message, 4000); } };
  return (
    <div id="dropzone" className="dropzone">
      <div className="drop-icon"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg></div>
      <h2>Arrastra aquí tu documento</h2>
      <p className="muted">PDF o Word (se convierte a PDF antes de subirlo), hasta 20 MB · Excel, imágenes o varios archivos se abren en el Editor</p>
      <div className="row" style={{ justifyContent: 'center' }}>
        <button className="secondary" id="pickBtn" onClick={elegir}>Elegir archivo…</button>
        <button className="secondary with-ic" id="pickDrive" onClick={() => abrirDrive('sign')}><Icono nombre="drive" tam={16} /><span>Desde Google Drive</span></button>
      </div>
      <p className="muted small" style={{ marginTop: 14 }}>¿Necesitas combinar, convertir, editar o reconocer texto antes de firmar? Usa el <a href="#" id="toEditor" onClick={(e) => { e.preventDefault(); irAlEditor(); }}>Editor</a>.</p>
    </div>
  );
}

function Analizando() {
  const { archivo, pasoAnalisis } = useEnvio();
  const clase = (i: number) => (i < pasoAnalisis ? 'done' : i === pasoAnalisis ? 'active' : '');
  return (
    <div className="card narrow">
      <div className="spinner" />
      <h2 id="workingTitle">{archivo ? `Analizando ${archivo.name}…` : 'Analizando documento…'}</h2>
      <ol className="steps" id="workingSteps">
        <li data-s="1" className={clase(0)}>Subiendo a Portalfirma</li>
        <li data-s="2" className={clase(1)}>Detectando firmantes y tipo de documento</li>
      </ol>
    </div>
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
  return <>
    {archivo?.converted && (
      <div id="convNote" className="conv-note"><Icono nombre="convert" tam={16} />
        <span>«{archivo.original}» se convirtió a PDF antes de subirlo. Revisa que el formato haya quedado bien.</span>
        <button className="secondary small" id="convView" onClick={() => abrirEnEditor(archivo.path)}>Ver PDF</button>
      </div>
    )}
    <div className="review-head">
      <div>
        <div className="file-chip" id="fileChip">{analisis.file.name}</div>
        <h2 id="docType">{x.typeDocument || 'Documento'}</h2>
        <p className="muted" id="docSummary">{x.summary || ''}</p>
      </div>
      <button className="ghost" id="cancelReview" onClick={() => { envioCancelar(); mostrarVista('drop'); }}>Cambiar documento</button>
    </div>

    <div className="grid2">
      <div className="card">
        <h3>Formalización</h3>
        {bloqueada ? (
          <div id="configLocked" className="notice">
            <strong>{x.documentConfig?.name || x.typeDocument || 'Tipo de documento'}</strong><br />
            Firma: {TIPOS_FIRMA[x.type_sign || ''] || x.type_sign || 'según tipo'} · Trámite: {TRAMITES_NOTARIALES[x.notarial_procedure || ''] || x.notarial_procedure || 'según tipo'}<br />
            <span className="muted small">Definido por el tipo de documento en Portalfirma.</span>
          </div>
        ) : (
          <div id="configFree">
            <label>Tipo de firma
              <select id="typeSignAll" value={tipoFirma} onChange={(e) => envioDatos({ tipoFirma: e.target.value })}>
                {Object.entries(TIPOS_FIRMA).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label>Trámite notarial
              <select id="protocolization" value={protocolizacion} onChange={(e) => envioDatos({ protocolizacion: e.target.value })}>
                {Object.entries(TRAMITES_NOTARIALES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          </div>
        )}
      </div>
      <div className="card">
        <h3>Pago</h3>
        <label>Correo del pagador
          <input type="email" id="payerEmail" placeholder="nombre@empresa.cl" value={pagador} onChange={(e) => envioDatos({ pagador: e.target.value })} />
        </label>
        <label>Código de descuento <span className="muted small">(opcional)</span>
          <input type="text" id="discount" value={descuento} onChange={(e) => envioDatos({ descuento: e.target.value })} />
        </label>
      </div>
    </div>

    <div className="card">
      <div className="row-between">
        <h3>Firmantes <span className="muted small">en orden de firma</span></h3>
        <button className="secondary small" id="addSigner" onClick={envioAgregar}>+ Agregar firmante</button>
      </div>
      <Firmantes />
    </div>

    <div className="actions">
      <span id="reviewError" className="error">{error}</span>
      <button className="primary" id="sendBtn" onClick={enviar}>Enviar a firmar</button>
    </div>
  </>;
}

function Listo() {
  const { ultimaOp, mensaje, detalle, errorDetalle, crudo, envioDetalle } = useEnvio();
  // cada envío deja el detalle vacío: aquí se traen los enlaces de firma (una vez; si falla, se muestra el error)
  useEffect(() => { if (ultimaOp != null && !detalle && !errorDetalle) envioDetalle(ultimaOp); }, [ultimaOp, detalle, errorDetalle, envioDetalle]);
  return <>
    <div className="card success">
      <div className="check"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></div>
      <h2>Enviado a firmar</h2>
      <p>Operación <strong id="doneOp">{ultimaOp ?? '(ver en Mis operaciones)'}</strong></p>
      <p className="muted" id="doneMsg">{mensaje}</p>
    </div>
    <div className="card" id="doneDetail">
      {ultimaOp == null ? <pre className="small">{JSON.stringify(crudo, null, 2)}</pre>
        : detalle && String(detalle.operation) === String(ultimaOp) ? <DetalleOperacion d={detalle} alActualizar={() => envioDetalle(ultimaOp)} />
        : errorDetalle ? <p className="muted">{errorDetalle}</p>
        : <p className="muted">Cargando enlaces de firma…</p>}
    </div>
    <div className="actions">
      <button className="secondary" id="viewOpBtn" onClick={() => { const op = envioEstado().ultimaOp; if (op != null) verOperacion(Number(op)); else abrirOperaciones(); }}>Ver seguimiento</button>
      <button className="primary" id="newDocBtn" onClick={() => mostrarVista('drop')}>Enviar otro documento</button>
    </div>
  </>;
}

export default function EnviarAFirmar({ paso }: { paso: TPasoEnvio }) {
  if (paso === 'drop') return <Soltar />;
  if (paso === 'working') return <Analizando />;
  if (paso === 'review') return <Revisar />;
  return <Listo />;
}
