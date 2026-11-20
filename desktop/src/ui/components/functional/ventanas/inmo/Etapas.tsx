// Ventanas de un paso de las etapas (etapas.js): «Reprogramar / Volver a intentar» (modal-12) y el menú de estados del
// paso (modal-13). Marcar el paso sigue en etapas.js (alGuardar, alElegir).
// Los id (#rpF, #rpD, #emT, #emOk, #mOk, #mCancel) y .et-mopts [data-e] los usan las pruebas.
// El pie lleva «No logrado» y, a la derecha, UN botón principal: la acción propia del paso (Agendar visita, Enviar a firmar, Vincular…)
// y no «Logrado»: hacer la acción ya es lograr el paso (el estado sigue a lo que se hizo). «Logrado» solo sale en los pasos sin acción.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Boton from '../../../ui/Boton';
import Input from '../../../ui/Input';
import Select from '../../../ui/Select';
import Badge from '../../../ui/Badge';
import MenuMas from '../../../ui/MenuMas';
import AceptacionPropietario from '../../negocios/AceptacionPropietario';
import PagosNegocio, { type TModoPago } from '../../negocios/PagosNegocio';
import RevisionContrato from '../../negocios/RevisionContrato';
import PostarriendoNegocio, { type TModoPost } from '../../negocios/PostarriendoNegocio';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../../ui/Ventana';
import { FORM } from '../../gestion/editor-pdf/Modales';
import { cerrarModal } from '../../../../utils/modal';
import PanelEvaluacion from '../../evaluacion/EvaluacionArriendo';
import PanelActa from '../../acta-visita/ActaVisita';
import PasoVisita, { type IVisitaPaso } from './PasoVisita';
import VisorPdf from '../../agenda/VisorPdf';
import { operacionArchivo } from '../../../../store/hooks/useOperacion.hook';
import { api } from '../../../../utils/api';
import { toast } from '../../../../utils/app';

export function Reprogramar({ titulo, hoy, alGuardar }: { titulo: string; hoy: string; alGuardar: (v: { vence: string; d: string }) => void }) {
  const [vence, setVence] = useState(hoy); const [d, setD] = useState('');
  return <>
    <VentanaCabecera icono="calendar" titulo={titulo} />
    <VentanaCuerpo className={FORM}>
      <Input id="rpF" etiqueta="Nueva fecha" type="date" value={vence} onChange={(e) => setVence(e.target.value)} />
      <Input id="rpD" etiqueta="Nota (opcional)" placeholder="Ej.: se reagendó con el cliente" value={d} onChange={(e) => setD(e.target.value)} />
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
      <Boton id="mOk" onClick={() => alGuardar({ vence, d })}>Guardar</Boton>
    </VentanaPie>
  </>;
}

type TModo = 'fail';   // «No logrado» (con su motivo); el estado «esperando a alguien» ya no se marca a mano
interface IDocPaso { nombre: string; estado: string; fecha?: string; operacion?: string | null; firmantes?: string[] }
export function MenuPaso({ post, revision, pagos, aceptacion, alCambioDocs, titulo, descripcion, manual, evaluacionNegocioId, actaNegocioId, alActaCerrada, visita, documentos, alEnviar, etiquetaEnviar, accionTxt, alAccion, personas, rolCliente, clienteActual, alVincular, alElegir, alGuardar }: {
  titulo: string; descripcion?: string; manual?: boolean;
  /** los avisos del postarriendo (reajustes, renovación o término, devolución de la garantía) */
  post?: { negocioId: string; modo: TModoPost; alCambio: () => void };
  /** el paso «Revisión del contrato»: versiones, comentarios y la aprobación del propietario y del arrendatario */
  revision?: { negocioId: string; alCambio: () => void; reabrir?: () => void };
  /** los pasos de pago del arriendo (reserva, garantía y primer mes, comisión): se registran con monto, fecha y comprobante */
  pagos?: { negocioId: string; modo: TModoPago; alCambio: () => void };
  /** el paso «Aceptación del propietario»: la ventana trae la negociación (oferta vigente, historial, WhatsApp y respuesta) */
  aceptacion?: { negocioId: string; alCambio: () => void };
  /** avisa que cambió el estado de una firma (se revisó y quedó firmada): la pantalla de atrás se redibuja */
  alCambioDocs?: () => void;
  /** pasos con firma (orden de visita, contrato…): los documentos ya generados y cómo enviarlos a firmar */
  documentos?: IDocPaso[]; alEnviar?: () => void; etiquetaEnviar?: string;
  /** la acción propia del paso (agendar, completar…), dentro de la misma ventana */
  accionTxt?: string; alAccion?: () => void;
  /** el paso «Interesado registrado» de un negocio sin cliente: las personas para elegir y cómo vincularla */
  personas?: { id: string; texto: string }[]; rolCliente?: 'arrendatario' | 'comprador'; clienteActual?: string; alVincular?: (clienteId: string) => void;
  /** el paso «Evaluación del arrendatario» de un arriendo: la ventana trae también la solicitud de documentos y el análisis */
  evaluacionNegocioId?: string;
  /** el paso «Visita y orden de visita»: agendar, confirmar, reprogramar y marcar la visita, y generar su orden de visita */
  visita?: IVisitaPaso;
  /** el paso «Acta de visita»: la ventana trae el acta (audio de la visita, fotos y resumen) */
  actaNegocioId?: string; alActaCerrada?: () => void;
  /** «Logrado» o «Volver a lo automático»: se marca de inmediato */
  alElegir: (e: 'ok' | 'auto') => void;
  /** «No logrado»: el motivo */
  alGuardar: (modo: TModo, texto: string) => void;
}) {
  const [pie, setPie] = useState<HTMLElement | null>(null);   // dónde va la acción principal del paso (en el pie, a la derecha)
  const enPie = (boton: React.ReactNode) => (pie ? createPortal(boton, pie) : null);
  const sinDocs = !!documentos && documentos.length === 0;
  // pasos con acción propia: esa acción reemplaza a «Logrado»
  const conAccion = !!visita || !!alAccion || (!!alEnviar && sinDocs) || (!!personas && !!alVincular);
  const [verOp, setVerOp] = useState<number | null>(null);   // documento cuyo PDF se está viendo
  const [archivo, setArchivo] = useState<{ bytes?: Uint8Array; error?: string; cargando?: boolean }>({});
  const [revisando, setRevisando] = useState<number | null>(null);
  const [firmados, setFirmados] = useState<Record<number, boolean>>({});   // documentos que Portalfirma ya dio por firmados (se ve al tiro, sin reabrir)
  const [revisandoAuto, setRevisandoAuto] = useState(false);
  const est = (d: IDocPaso) => (firmados[Number(d.operacion)] ? 'Firmado' : d.estado);
  const [cli, setCli] = useState(clienteActual || ''); const etRol = rolCliente === 'comprador' ? 'Comprador' : 'Arrendatario';
  const [modo, setModo] = useState<TModo | null>(null); const [t, setT] = useState('');
  // el PDF tal como lo tiene Portalfirma (con las firmas, si ya firmaron)
  const verPdf = async (op: number) => {
    if (verOp === op) return setVerOp(null);
    setVerOp(op); setArchivo({ cargando: true });
    const r = await operacionArchivo.ver(op).catch((e: Error) => ({ ok: false, error: e.message } as any));
    setArchivo(r?.ok ? { bytes: r.data.bytes } : { error: r?.code === 'NO_FILE_KEY' ? 'Falta el acceso a los documentos de Portalfirma (Mis operaciones › Configurar acceso).' : r?.error || 'No se pudo traer el documento.' });
  };
  // pregunta a Portalfirma si ya firmaron
  const revisar = async (op: number) => {
    setRevisando(op);
    try {
      const r: any = await api('firRevisar', op);
      const firmo = r?.estado === 'firmado';
      toast(firmo ? `Operación ${op}: firmada por todos.` : r?.pendientes?.length ? `Operación ${op}: falta la firma de ${r.pendientes.map((x: any) => x.nombre).filter(Boolean).join(', ') || 'otra persona'}.` : `Operación ${op}: sin cambios.`, 5000);
      if (firmo) setFirmados((x) => ({ ...x, [op]: true })); alCambioDocs?.();
    } catch (e) { toast((e as Error).message, 6000); }
    setRevisando(null);
  };
  // cada vez que se abre el paso, se pregunta a Portalfirma si ya firmaron lo que está en firma
  useEffect(() => {
    const pendientes = (documentos || []).filter((d) => d.operacion && d.estado !== 'Firmado').map((d) => Number(d.operacion));
    if (!pendientes.length) return undefined;
    let vivo = true; setRevisandoAuto(true);
    (async () => {
      let cambio = false;
      for (const op of pendientes) {
        try { const r: any = await api('firRevisar', op); if (!vivo) return; if (r?.estado === 'firmado') { setFirmados((x) => ({ ...x, [op]: true })); cambio = true; } } catch { /* sin sesión o sin red: queda el botón «Revisar si ya firmó» */ }
      }
      if (vivo) { setRevisandoAuto(false); if (cambio) alCambioDocs?.(); }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir
  }, []);
  // si el paso ya tiene un documento creado (enviado a firmar o firmado), se muestra apenas se abre la ventana: el último, a la vista
  useEffect(() => {
    const ult = [...(documentos || [])].reverse().find((d) => d.operacion);
    if (ult) verPdf(Number(ult.operacion));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir
  }, []);
  const elegir = (m: TModo) => { setModo(m); setTimeout(() => document.getElementById('emT')?.focus(), 0); };
  return <>
    <VentanaCabecera icono="listCheck" titulo={titulo} descripcion={descripcion || (evaluacionNegocioId ? 'Solicitar documentación por WhatsApp: reciben el mensaje y mandan por el mismo chat contrato de trabajo, cédula por ambos lados, últimas 3 liquidaciones, AFP de 6 meses y Dicom.' : 'Elige cómo está este paso.')} />
    <VentanaCuerpo className={FORM}>
      {evaluacionNegocioId && <PanelEvaluacion negocioId={evaluacionNegocioId} />}
      {actaNegocioId && <PanelActa negocioId={actaNegocioId} alCerrada={alActaCerrada} />}
      {visita && <PasoVisita v={visita} pie={pie} />}
      {aceptacion && <AceptacionPropietario negocioId={aceptacion.negocioId} alCambio={aceptacion.alCambio} />}
      {post && <PostarriendoNegocio negocioId={post.negocioId} modo={post.modo} alCambio={post.alCambio} />}
      {revision && <RevisionContrato negocioId={revision.negocioId} alCambio={revision.alCambio} reabrir={revision.reabrir} />}
      {pagos && <PagosNegocio negocioId={pagos.negocioId} modo={pagos.modo} alCambio={pagos.alCambio} />}
      {documentos && (
        <section className="tw:flex tw:flex-col tw:gap-3" id="pasoDocs">
          <div className="tw:flex tw:items-center tw:gap-2">
            <h3 className="tw:m-0 tw:flex-1 tw:text-sm tw:font-bold">Documentos generados{revisandoAuto && <small className="tw:ml-2 tw:font-normal tw:text-muted">Revisando la firma…</small>}</h3>
            {alEnviar && documentos.length > 0 && <MenuMas tamano="sm" etiqueta="Más acciones del documento" opciones={[{ id: 'pasoEnviar', texto: etiquetaEnviar || 'Enviar otro a firmar', icono: 'sign', alTocar: alEnviar }]} />}
          </div>
          {documentos.length === 0
            ? <p className="tw:m-0 tw:text-[13px] tw:text-muted">Todavía no hay documentos generados para este paso.</p>
            : <ul className="tw:list-none tw:m-0 tw:p-0 tw:flex tw:flex-col tw:gap-4">
              {documentos.map((d, i) => (
                <li key={i} className="tw:flex tw:flex-col tw:gap-2" data-doc-paso>
                  <div className="tw:flex tw:items-center tw:gap-3 tw:flex-nowrap">
                    <div className="tw:min-w-0 tw:flex-1 tw:flex tw:flex-col tw:gap-1">
                      <div className="tw:flex tw:items-center tw:gap-2 tw:text-sm">
                        <span className="tw:min-w-0 tw:truncate tw:font-semibold">{d.nombre}</span>
                        <Badge tono={est(d) === 'Firmado' ? 'verde' : est(d) === 'En firma' ? 'amarillo' : 'gris'} punto>{est(d)}</Badge>
                      </div>
                      <small className="tw:text-xs tw:text-muted">
                    {[d.fecha && (est(d) === 'Firmado' ? `Firmado el ${d.fecha}` : `Del ${d.fecha}`), d.operacion && `Operación ${d.operacion}`, d.firmantes?.length ? `Firmantes: ${d.firmantes.join(', ')}` : ''].filter(Boolean).join(' · ')}
                      </small>
                    </div>
                    {d.operacion && (
                      <div className="tw:flex tw:flex-none tw:items-center tw:gap-2">
                        {est(d) !== 'Firmado' && <Boton variante="secundario" tamano="sm" icono="rotateR" cargando={revisando === Number(d.operacion)} data-doc-revisar onClick={() => revisar(Number(d.operacion))}>Revisar si ya firmó</Boton>}
                        <Boton variante={verOp === Number(d.operacion) ? 'principal' : 'secundario'} tamano="sm" icono="file" data-doc-ver onClick={() => verPdf(Number(d.operacion))}>{verOp === Number(d.operacion) ? 'Ocultar PDF' : est(d) === 'Firmado' ? 'Ver PDF firmado' : 'Ver PDF enviado'}</Boton>
                      </div>
                    )}
                  </div>
                    <div className="tw:mt-0" data-doc-pdf>{archivo.cargando ? <div className="tw:grid tw:place-items-center tw:min-h-[120px]"><div className="spinner" /></div> : archivo.bytes ? <VisorPdf bytes={archivo.bytes} /> : <p className="tw:m-0 tw:text-[13px] tw:text-muted">{archivo.error}</p>}</div>
                </li>
              ))}
            </ul>}
          {alEnviar && documentos.length === 0 && enPie(<Boton id="pasoEnviar" icono="sign" onClick={alEnviar}>{etiquetaEnviar || 'Preparar y enviar a firmar'}</Boton>)}
        </section>
      )}
      {personas && alVincular && (
        <div className="tw:flex tw:items-end tw:gap-2">
          <Select etiqueta={etRol} id="pasoCliente" clasesCampo="tw:flex-1" value={cli} onChange={(e) => setCli(e.target.value)} vacia={personas.length ? 'Elegir…' : `No hay ${etRol.toLowerCase()}s en la cartera`} opciones={personas.map((c) => [c.id, c.texto])} />
          {enPie(<Boton id="pasoVincular" disabled={!cli || cli === clienteActual} onClick={() => alVincular(cli)}>{clienteActual ? 'Cambiar' : 'Vincular'}</Boton>)}
        </div>
      )}
      {alAccion && enPie(<Boton id="pasoAccion" onClick={alAccion}>{accionTxt}</Boton>)}
      {modo && (
        <div id="emX" className="tw:flex tw:flex-wrap tw:items-end tw:gap-2">
          <Input id="emT" etiqueta="Motivo" clasesCampo="tw:flex-[1_1_200px]" value={t} onChange={(e) => setT(e.target.value)} />
          <Boton id="emOk" className="tw:ml-auto" onClick={() => alGuardar(modo, t)}>Guardar</Boton>
        </div>
      )}
    </VentanaCuerpo>
    {/* el estado del paso va siempre en el pie, pegado a la derecha (son casi los mismos botones en todos los pasos) */}
    <VentanaPie>
      <span className="et-mopts tw:contents">
        {manual && <Boton variante="fantasma" data-e="auto" onClick={() => alElegir('auto')}>Volver a lo automático</Boton>}
        <Boton variante="secundario" icono="alert" data-e="fail" className={modo === 'fail' ? 'tw:ring-2 tw:ring-lav-edge' : ''} onClick={() => elegir('fail')}>No logrado</Boton>
        <span ref={setPie} className="tw:contents" />
        {!conAccion && <Boton icono="check" data-e="ok" onClick={() => alElegir('ok')}>Logrado</Boton>}
      </span>
    </VentanaPie>
  </>;
}
