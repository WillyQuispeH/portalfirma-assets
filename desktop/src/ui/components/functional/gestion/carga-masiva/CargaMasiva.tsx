// Carga masiva: subir muchos documentos, revisar sus firmantes y enviarlos a firmar de una vez; y la firma masiva
// con certificado de las operaciones pendientes como firmante.
//
// La cola la procesa el proceso principal (src/bulk.js) y manda su estado en vivo (pf.onBulk → masiva.js →
// evento «pf:bulk»). Siguen en src/renderer/masiva.js: editar firmantes y la confirmación del envío (saldo y
// correo del pagador). Las clases bk-* y los data-a los usan las pruebas.
import { useEffect, useRef, useState } from 'react';
import Icono from '../../../ui/Icono';
import { cola, estadoMasiva, useMasiva } from '../../../../store/hooks/useMasiva.hook';
import { abrirDrive, abrirOperaciones, confirmarEnvioMasivo, editarFirmantesMasiva, toast, verOperacion } from '../../../../utils/app';
import { tamano } from '../comun/archivos';
import type { IColaMasiva, IDocMasiva, IOperacionPendiente, TEstadoDoc } from '../../../../store/interfaces/masiva.interface';

const BS: Record<TEstadoDoc, [string, string]> = {
  queued: ['En cola', 'muted'], converting: ['Convirtiendo a PDF', 'run'], uploading: ['Subiendo', 'run'], analyzing: ['Detectando firmantes', 'run'],
  ready: ['Listo', 'ok'], needs_data: ['Faltan datos', 'wait'], sending: ['Enviando', 'run'], sent: ['Enviado', 'ok'],
  error: ['Error', 'bad'], send_error: ['No se envió', 'bad'], skipped: ['Omitido', 'muted'],
};
// lectura del estado para src/renderer/masiva.js (window.Masiva._bk / _cds: pruebas y depuración)
(window as unknown as Record<string, unknown>).__estadoMasiva = estadoMasiva;

function Cargar() {
  const { cola: st, opciones, masivaSetOpciones } = useMasiva();
  const c: Partial<Record<TEstadoDoc, number>> = {}; for (const it of st.items) c[it.status] = (c[it.status] || 0) + 1;
  const n = st.items.length; const ocupados = (c.queued || 0) + (c.converting || 0) + (c.uploading || 0) + (c.analyzing || 0);
  const listos = st.items.filter((x) => x.status === 'ready' && x.selected !== false);
  const verPie = st.items.some((x) => ['ready', 'needs_data', 'sending', 'sent', 'send_error'].includes(x.status));
  const fila = (it: IDocMasiva) => {
    const [l, cl] = BS[it.status] || [it.status, 'muted']; const enCurso = ['uploading', 'analyzing', 'converting', 'sending'].includes(it.status);
    return (
      <div key={it.id} className={`bk-row ${it.status}`} data-id={it.id}>
        <span>{it.status === 'ready' && <input type="checkbox" data-sel checked={it.selected !== false} onChange={(e) => cola.marcar(it.id, e.target.checked)} />}</span>
        <span className="bk-doc"><b title={it.path}>{it.name}</b><small>{tamano(it.size) || '1 KB'}{it.typeDocument ? ' · ' + it.typeDocument : ''}{it.operation ? ` · Operación N° ${it.operation}` : ''}</small></span>
        <span>
          <span className={`ops-chip ${cl}`}>{cl === 'run' && <i className="bk-spin" />}{l}</span>
          {it.error && <small className="bk-err">{it.error}</small>}
          {!!it.missing?.length && it.status === 'needs_data' && <small className="bk-err">{it.missing.join(' · ')}</small>}
        </span>
        <span className="bk-sig">{(it.signers || []).length ? it.signers!.map((s, i) => <span key={i}>{i > 0 && ', '}{s.fullName || s.rut || '?'}{s.alias && <> <em>({s.alias})</em></>}</span>) : <span className="muted">—</span>}</span>
        <span className="bk-acts">
          {['ready', 'needs_data'].includes(it.status) && <button className="ghost small" data-a="edit" onClick={() => editarFirmantesMasiva(it)}>Firmantes</button>}
          {it.status === 'error' && <button className="ghost small" data-a="retry1" onClick={() => cola.reintentar(it.id)}>Reintentar</button>}
          {it.status === 'send_error' && <button className="ghost small" data-a="rearm" title="Revisa antes en Mis operaciones que no se haya creado" onClick={() => cola.volverAListo(it.id)}>Volver a listo</button>}
          {it.status === 'sent' && <button className="ghost small" data-a="seeop" onClick={() => verOperacion(Number(it.operation))}>Ver</button>}
          {!enCurso && <button className="ibtn" data-a="rm" title="Quitar" onClick={() => cola.quitar(it.id)}><Icono nombre="x" tam={14} /></button>}
        </span>
      </div>
    );
  };
  return (
    <>
      <div className="bk-drop" id="bkDrop" role="button" tabIndex={0}
        onClick={(e) => { if ((e.target as HTMLElement).closest('#bkDrive')) return abrirDrive(); cola.elegir(); }} onKeyDown={(e) => { if (e.key === 'Enter') cola.elegir(); }}>
        <Icono nombre="upload" tam={30} /><b>Arrastra aquí tus documentos o haz clic para elegirlos</b><span>PDF o Word, hasta 20 MB cada uno. Se procesan de a 2 para no saturar Portalfirma.</span>
        <button className="secondary small with-ic" id="bkDrive"><Icono nombre="drive" tam={15} /><span>Traer desde Google Drive</span></button>
      </div>
      <div className="bk-bar" id="bkBar">
        {n > 0 && <>
          <div className="bk-prog"><div className="bk-prog-in" style={{ width: `${Math.round(((n - ocupados) / n) * 100)}%` }} /></div>
          <div className="bk-stats">
            {(Object.entries(BS) as [TEstadoDoc, [string, string]][]).filter(([k]) => c[k]).map(([k, [l, cl]]) => <span key={k} className={`ops-chip ${cl}`}>{l}: {c[k]}</span>)}
            {(st.coolUntil || 0) > Date.now() && <span className="ops-chip wait">Portalfirma responde lento: pausa breve</span>}
          </div>
          <div className="bk-bar-acts">
            {ocupados > 0 && <button className="ghost small" data-a="pause" onClick={() => cola.pausar(!st.paused)}>{st.paused ? 'Reanudar' : 'Pausar'}</button>}
            {!!c.error && <button className="ghost small" data-a="retry" onClick={() => cola.reintentar(null)}>Reintentar errores</button>}
            {!!(c.sent || c.skipped) && <button className="ghost small" data-a="clearDone" onClick={() => cola.vaciar('done')}>Quitar enviados y omitidos</button>}
            {!ocupados && !st.sending && <button className="ghost small" data-a="clearAll" onClick={() => cola.vaciar('all')}>Vaciar la lista</button>}
          </div>
        </>}
      </div>
      <div className="bk-table" id="bkTable">
        {n ? <><div className="bk-row bk-th"><span /><span>Documento</span><span>Estado</span><span>Firmantes</span><span /></div>{st.items.map(fila)}</>
          : <div className="ops-empty small"><p>Todavía no hay documentos en la cola.</p></div>}
      </div>
      <div className="bk-foot" id="bkFoot">
        {verPie && <>
          <div className="bk-opts">
            <label>Trámite<select id="bkProc" value={opciones.protocolization} onChange={(e) => masivaSetOpciones({ protocolization: e.target.value as typeof opciones.protocolization })}>
              <option value="none">Solo firma electrónica</option><option value="legalization">Legalizar ante notario</option><option value="protocolization">Protocolizar</option></select></label>
            <label>Tipo de firma<select id="bkType" value={opciones.typeSign} onChange={(e) => masivaSetOpciones({ typeSign: e.target.value as typeof opciones.typeSign })}>
              <option value="simple">Simple</option><option value="avanzada">Avanzada</option><option value="visada">Visada</option><option value="enrolada">Enrolada</option></select></label>
            <span className="muted small">Si Portalfirma reconoce el tipo de documento, usa su trámite y firma.</span>
          </div>
          {st.sending ? <button className="secondary" data-a="stop" onClick={() => cola.detener()}>Detener el envío</button>
            : <button className="primary" data-a="send" disabled={!listos.length} onClick={() => confirmarEnvioMasivo(listos.map((x) => x.id), opciones)}><Icono nombre="sign" tam={16} /> Enviar {listos.length} documento(s) a firmar</button>}
        </>}
      </div>
    </>
  );
}

function ConCertificado() {
  const { cds, masivaSetCds } = useMasiva();
  const clave = useRef(''); // vive solo mientras dura el proceso; va directo a Portalfirma
  const [rut, setRut] = useState(cds.rut);
  const [ocupado, setOcupado] = useState(false);
  const caja = useRef<HTMLInputElement>(null); const codigo = useRef<HTMLInputElement>(null);

  const listar = async () => {
    const r0 = rut.trim(); if (!r0) return;
    const r = await cola.pendientes(r0); if (!r.ok) return toast(r.error || '', 5000);
    const d = r.data as any; // eslint-disable-line @typescript-eslint/no-explicit-any -- la API responde en varias formas
    const lista: IOperacionPendiente[] = d?.operations || d?.pending || (Array.isArray(d) ? d : []);
    masivaSetCds({ rut: r0, lista, sel: lista.map((o) => String(o.operation)), resultado: null, paso: 'rut' });
    if (!lista.length) toast('No tienes operaciones pendientes de firma con ese RUT.', 4000);
  };
  const pedir = async () => {
    const k = caja.current?.value || ''; if (!k) return;
    setOcupado(true); const r = await cola.pedirCodigo(cds.rut, cds.sel, k); setOcupado(false);
    if (!r.ok) return toast(r.error || '', 5000);
    clave.current = k; masivaSetCds({ paso: 'code' }); toast(r.data?.message || 'Código enviado.', 4000);
  };
  const firmar = async () => {
    const c = codigo.current?.value.trim() || ''; if (!c) return;
    setOcupado(true); const r = await cola.firmar(cds.rut, cds.sel, clave.current, c); setOcupado(false);
    if (!r.ok) return toast(r.error || '', 6000);
    clave.current = '';
    const res = r.data?.signed || r.data?.results || [];
    masivaSetCds({ paso: 'rut', resultado: res.length ? `${res.filter((x) => x.ok !== false).length} de ${res.length} documento(s) firmados.` : r.data?.message || 'Documentos firmados.', lista: cds.lista.filter((o) => !cds.sel.includes(String(o.operation))), sel: [] });
  };
  const alternar = (op: string) => masivaSetCds({ sel: cds.sel.includes(op) ? cds.sel.filter((x) => x !== op) : [...cds.sel, op] });

  return (
    <div className="cds">
      <p className="muted">Firma de una vez todas las operaciones que tienes pendientes como firmante, con tu certificado de firma electrónica avanzada. Recibirás un código por SMS o WhatsApp.</p>
      <div className="cds-step"><b>1</b><div><label>RUT del firmante<div className="tk-row"><input id="cdsRut" value={rut} onChange={(e) => setRut(e.target.value)} placeholder="12.345.678-9" /><button className="secondary" id="cdsList" onClick={listar}>Ver pendientes</button></div></label></div></div>
      <div className={`cds-step ${cds.lista.length ? '' : 'off'}`}><b>2</b><div><div className="cds-list">
        {cds.lista.length ? cds.lista.map((o) => (
          <label key={String(o.operation)} className="cds-op"><input type="checkbox" data-op={o.operation} checked={cds.sel.includes(String(o.operation))} onChange={() => alternar(String(o.operation))} /> <span><b>{o.document_name || o.name || 'Documento'}</b><small>Operación N° {o.operation}</small></span></label>
        )) : <p className="muted small">Primero busca las operaciones pendientes.</p>}
      </div></div></div>
      <div className={`cds-step ${cds.sel.length ? '' : 'off'}`}><b>3</b><div>
        {cds.paso === 'code' ? <>
          <label>Código recibido por SMS o WhatsApp<div className="tk-row"><input id="cdsCode" ref={codigo} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" /><button className="primary" id="cdsSign" disabled={ocupado} onClick={firmar}>Firmar {cds.sel.length} documento(s)</button></div></label>
          <button className="ghost small" id="cdsBack" onClick={() => { clave.current = ''; masivaSetCds({ paso: 'rut' }); }}>Cancelar</button>
        </> : <>
          <label>Clave de tu certificado<div className="tk-row"><input id="cdsKey" ref={caja} type="password" autoComplete="off" placeholder="Clave del certificado" /><button className="primary" id="cdsAsk" disabled={!cds.sel.length || ocupado} onClick={pedir}>Pedir código</button></div></label>
          <p className="muted small">La clave se envía directo a Portalfirma para validar tu certificado; la app no la guarda.</p>
        </>}
      </div></div>
      {cds.resultado && <div className="cds-res"><b><Icono nombre="listCheck" tam={15} /> Listo.</b> {cds.resultado}</div>}
    </div>
  );
}

export default function CargaMasiva({ tab: tabInicial }: { tab?: 'load' | 'cds' }) {
  const { tab, masivaSetTab, masivaSetCola } = useMasiva();
  useEffect(() => {
    if (tabInicial) masivaSetTab(tabInicial);
    cola.estado().then((r) => { if (r.ok && r.data) masivaSetCola(r.data); });
    const alCambiar = (e: Event) => masivaSetCola((e as CustomEvent<IColaMasiva>).detail);
    window.addEventListener('pf:bulk', alCambiar);
    return () => window.removeEventListener('pf:bulk', alCambiar);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- solo al montar

  return (
    <div className="bulk">
      <div className="ops-head">
        <div><h2>Carga masiva</h2><span className="muted small">Sube muchos documentos, revisa sus firmantes y envíalos a firmar de una vez.</span></div>
        <div className="ops-head-r"><button className="secondary small with-ic" id="bkOps" onClick={abrirOperaciones}><Icono nombre="listCheck" tam={15} /><span>Mis operaciones</span></button></div>
      </div>
      <div className="ai-tabs bk-tabs">
        <button data-bt="load" className={tab === 'load' ? 'on' : ''} onClick={() => masivaSetTab('load')}>Cargar y enviar a firmar</button>
        <button data-bt="cds" className={tab === 'cds' ? 'on' : ''} onClick={() => masivaSetTab('cds')}>Firma masiva con certificado</button>
      </div>
      <div id="bkBody">{tab === 'cds' ? <ConCertificado /> : <Cargar />}</div>
    </div>
  );
}
