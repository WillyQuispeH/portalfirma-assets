// Flujos documentales: una receta une una plantilla, una nómina y sus firmantes. Se prepara una vez y se vuelve a
// usar con cada nómina nueva: genera un documento por fila y lo envía a firmar (por la carga masiva).
//
// Siguen en src/renderer/flujos.js (por utils/app.ts): la «Muestra» de un documento (dibuja el PDF) y la
// confirmación del envío (saldo y pagador). flujos.js pasa a React la cola en vivo (evento «pf:bulk») y el
// archivo soltado en el paso 2 (evento «pf:flujos-nomina»). Los id fl* y las clases fl-* los usan las pruebas.
import { useEffect, useState } from 'react';
import Icono from '../../../ui/Icono';
import { estadoFlujos, nominaFlujo, puedeIr, useFlujo } from '../../../../store/hooks/useFlujo.hook';
import { abrirCarga, avisar, confirmar, confirmarEnvioFlujo, toast } from '../../../../utils/app';
import { conteoEjecucion, estadoFila, fechaHora, plural } from '../../../../utils/flujos';
import { PasoCampos, PasoNomina, PasoPlantilla, PasoRevision } from './Pasos';
import type { IColaMasiva } from '../../../../store/interfaces/masiva.interface';
import type { IEjecucion, INomina } from '../../../../store/interfaces/flujo.interface';

const PASOS = ['Plantilla', 'Nómina', 'Campos', 'Revisión', 'Firma'];
// lectura del estado para src/renderer/flujos.js (window.Flujos._fl: pruebas y depuración)
(window as unknown as Record<string, unknown>).__estadoFlujos = estadoFlujos;

const CHIP = { busy: ['muted', 'Preparando'], ready: ['ok', 'Listos'], sent: ['run', 'En firma'], signed: ['ok', 'Firmados'], error: ['bad', 'Con problemas'] } as const;
type TChip = keyof typeof CHIP;
// en el inicio van de lo más avanzado a lo pendiente; en la ejecución, en el orden del proceso
function Chips({ c, orden }: { c: ReturnType<typeof conteoEjecucion>; orden: TChip[] }) {
  return <>{orden.map((k) => c[k] > 0 && <span key={k} className={`ops-chip ${CHIP[k][0]}`}>{CHIP[k][1]} {c[k]}</span>)}</>;
}

function Inicio() {
  const { recetas, modelos, ejecuciones, cola, ops, asistenteIniciar, asistenteVerEjecucion, recetaBorrar, ejecucionBorrar } = useFlujo();
  const borrarReceta = async (id: string, nombre: string) => { if (await confirmar({ clave: 'modal-113', titulo: 'Eliminar receta', texto: `¿Eliminar «${nombre}»? Las ejecuciones anteriores y los documentos enviados no se tocan.`, boton: 'Eliminar', peligro: true })) recetaBorrar(id); };
  const borrarEjecucion = async (r: IEjecucion) => { if (await confirmar({ clave: 'modal-114', titulo: 'Borrar documentos generados', texto: `Se borrarán de este computador los ${r.total} PDF generados en esta ejecución (tienen datos personales de la nómina). Las operaciones ya enviadas a Portalfirma no se tocan.`, boton: 'Borrar', peligro: true })) ejecucionBorrar(r.id); };
  return (
    <div className="bulk fl">
      <div className="ops-head">
        <div><h2>Flujos documentales</h2><span className="muted small">Una receta une una plantilla, una nómina y sus firmantes. Prepárala una vez y vuelve a usarla con cada nómina nueva.</span></div>
        <div className="ops-head-r"><button className="secondary small with-ic" id="flBulk" onClick={() => abrirCarga('load')}><Icono nombre="files" tam={15} /><span>Carga masiva</span></button><button className="primary small with-ic" id="flNew" onClick={() => asistenteIniciar()}><Icono nombre="plus" tam={15} /><span>Nuevo flujo</span></button></div>
      </div>
      <h3 className="fl-h">Mis recetas</h3>
      <div className="fl-recipes">
        {recetas.length ? recetas.map((r) => {
          const m = modelos.find((x) => x.id === r.modelId); const ult = ejecuciones.find((x) => x.recipeId === r.id);
          return (
            <div key={r.id} className="fl-recipe" data-r={r.id}>
              <div className="fl-r-ic"><Icono nombre="flow" tam={22} /></div>
              <div className="fl-r-tx"><b>{r.name}</b><small>{m?.nombre || 'Modelo no disponible'}</small><small className="muted">{ult ? `Última ejecución: ${fechaHora(ult.date)} · ${plural(ult.total, 'documento', 'documentos')}` : 'Sin ejecuciones todavía'}</small></div>
              <div className="fl-r-acts">
                <button className="primary small" data-a="run" disabled={!m} onClick={() => asistenteIniciar(r, 2)}><Icono nombre="upload" tam={14} /> Ejecutar con nueva nómina</button>
                <button className="ghost small" data-a="edit" disabled={!m} onClick={() => asistenteIniciar(r, 3)}>Editar</button>
                <button className="ibtn" data-a="del" title="Eliminar receta" onClick={() => borrarReceta(r.id, r.name)}><Icono nombre="trash" tam={14} /></button>
              </div>
            </div>
          );
        }) : (
          <div className="ops-empty fl-empty"><div><Icono nombre="flow" tam={34} /><p><b>Todavía no tienes recetas.</b><br />Ejemplo: «Mandatos de pagaré mensuales»: eliges el modelo, cargas la nómina de deudores y la app genera un documento por persona y lo envía a firmar.</p>
            <button className="primary" id="flNew2" onClick={() => asistenteIniciar()}><Icono nombre="plus" tam={15} /> Crear mi primer flujo</button></div></div>
        )}
      </div>
      <h3 className="fl-h">Ejecuciones</h3>
      <div className="fl-runs" id="flRuns">
        {ejecuciones.length ? ejecuciones.slice(0, 20).map((r) => (
          <div key={r.id} className="fl-run" data-x={r.id}>
            <span className="fl-run-tx"><b>{r.recipeName}</b><small>{fechaHora(r.date)} · {r.nomina || ''} · {plural(r.total, 'documento', 'documentos')}</small></span>
            <span className="fl-run-ch"><Chips c={conteoEjecucion(r, cola, ops)} orden={['signed', 'sent', 'ready', 'busy', 'error']} />{r.status === 'error' && <span className="ops-chip bad">{r.error || 'Error'}</span>}</span>
            <span className="fl-r-acts"><button className="ghost small" data-a="see" onClick={() => asistenteVerEjecucion(r)}>Ver</button><button className="ibtn" data-a="rm" title="Borrar los documentos generados" onClick={() => borrarEjecucion(r)}><Icono nombre="trash" tam={14} /></button></span>
          </div>
        )) : <div className="ops-empty small"><p>Aquí verás cada ejecución con el estado de sus firmas.</p></div>}
      </div>
    </div>
  );
}

// 5) Firma: guardar la receta, generar y, después, enviar y seguir las firmas
function PasoFirma() {
  const { w, cola, ops, asistenteFijar, asistenteIr, asistenteGuardar, asistenteEjecutar, flujosVerInicio, flujosSincronizarFirmas } = useFlujo();
  const [generando, setGenerando] = useState(false); const [sinNombre, setSinNombre] = useState(false);
  if (!w) return null;
  const run = w.ejecucion;
  if (run) {
    const filas = run.rows || []; const st = filas.map((f) => estadoFila(f, cola, ops));
    const listos = filas.filter((_, i) => /Listo/.test(st[i][0])); const ocupados = st.filter(([l, c]) => (c === 'run' && !/Firmando/.test(l)) || /cola/.test(l)).length;
    const enviar = () => { const ids = filas.filter((f) => cola.items.find((x) => x.id === f.bulkId)?.status === 'ready').map((f) => f.bulkId!); confirmarEnvioFlujo(ids, { ...(w.receta?.opts || {}), ...(w.opciones || {}) }); };
    return (
      <div className="fl-card"><h3>{w.soloLectura ? run.recipeName : '5. Firma'}</h3><p className="muted small">{fechaHora(run.date)} · {run.nomina || ''} · {run.modelName || ''}</p>
        <div id="flRunBar">
          <div className="bk-prog"><div className="bk-prog-in" style={{ width: `${filas.length ? Math.round(((filas.length - ocupados) / filas.length) * 100) : 0}%` }} /></div>
          <div className="bk-stats"><Chips c={conteoEjecucion(run, cola, ops)} orden={['busy', 'ready', 'sent', 'signed', 'error']} /></div>
        </div>
        <div className="bk-table fl-rt" id="flRunTable">
          <div className="bk-row bk-th"><span /><span>Documento</span><span>Estado</span><span /><span /></div>
          {filas.map((f, i) => {
            const [l, c] = st[i]; const it = cola.items.find((x) => x.id === f.bulkId);
            return (
              <div key={i} className="bk-row"><span>{f.n + 2}</span>
                <span className="bk-doc"><b>{f.label}</b><small>{String(f.file || '').split(/[\\/]/).pop()}</small></span>
                <span><span className={`ops-chip ${c}`}>{c === 'run' && !/Firmando/.test(l) && <i className="bk-spin" />}{l}</span>{it?.error && <small className="bk-err">{it.error}</small>}{!!it?.missing?.length && it.status === 'needs_data' && <small className="bk-err">{it.missing.join(' · ')}</small>}</span>
                <span /><span />
              </div>
            );
          })}
        </div>
        <div className="bk-foot" id="flRunFoot">
          {cola.sending ? <button className="secondary" data-a="stop" onClick={() => nominaFlujo.detener()}>Detener el envío</button> : <>
            <button className="ghost" data-a="sync" onClick={flujosSincronizarFirmas}><Icono nombre="rotateR" tam={14} /> Actualizar firmas</button>
            <button className="ghost" data-a="bulk" onClick={() => abrirCarga('load')}>Ver en Carga masiva</button>
            {listos.length > 0 && <button className="primary" data-a="send" onClick={enviar}><Icono nombre="sign" tam={16} /> Enviar {listos.length} a firmar</button>}
          </>}
        </div>
      </div>
    );
  }
  const guardar = async () => { if (!w.nombre.trim()) { setSinNombre(true); return; } const r = await asistenteGuardar(); if (r && !('error' in r)) { toast('Receta guardada.'); flujosVerInicio(); } else if (r) avisar(r as { error?: string }); };
  const generar = async () => { if (!w.nombre.trim()) { setSinNombre(true); return; } setGenerando(true); const r = await asistenteEjecutar(); setGenerando(false); if (r.error) toast(r.error, 6000); };
  return (
    <div className="fl-card"><h3>5. Firma</h3>
      <div className="fl-sumline"><Icono nombre="file" tam={16} /> Se generarán <b>{plural(w.revision!.ok, 'documento', 'documentos')}</b> con «{w.modelo!.nombre}». Firma{w.modelo!.roles.length === 1 ? '' : 'n'}: {w.modelo!.roles.map((r, i) => <span key={r.alias}>{i > 0 && ', '}<b>{r.alias}</b></span>)}.</div>
      <label className="fl-lbl">Nombre de la receta<input id="flName" className={sinNombre ? 'invalid' : ''} value={w.nombre} placeholder="Ej.: Mandatos de pagaré mensuales" onChange={(e) => { setSinNombre(false); asistenteFijar({ nombre: e.target.value }); }} /></label>
      <div className="bk-opts">
        <label>Trámite<select id="flProc" value={w.opciones.protocolization} onChange={(e) => asistenteFijar({ opciones: { ...w.opciones, protocolization: e.target.value as typeof w.opciones.protocolization } })}><option value="none">Solo firma electrónica</option><option value="legalization">Legalizar ante notario</option><option value="protocolization">Protocolizar</option></select></label>
        <label>Tipo de firma<select id="flType" value={w.opciones.typeSign} onChange={(e) => asistenteFijar({ opciones: { ...w.opciones, typeSign: e.target.value as typeof w.opciones.typeSign } })}><option value="simple">Simple</option><option value="avanzada">Avanzada</option><option value="visada">Visada</option><option value="enrolada">Enrolada</option></select></label>
      </div>
      <p className="muted small">Primero se generan los PDF y se suben a Portalfirma (no se cobra nada). Después confirmas el envío a firmar, que sí descuenta saldo.</p>
      <div className="fl-nav"><button className="ghost" id="flPrevS" onClick={() => asistenteIr(4)}><Icono nombre="chevL" tam={15} /> Revisión</button>
        <span><button className="secondary" id="flSave" onClick={guardar}>Solo guardar la receta</button> <button className="primary" id="flGo" disabled={generando} onClick={generar}>{generando ? <><i className="bk-spin" /> Generando…</> : <><Icono nombre="flow" tam={15} /> Guardar y generar {w.revision!.ok}</>}</button></span></div>
    </div>
  );
}

function Asistente() {
  const { w, asistenteIr, asistenteRevisar, flujosVerInicio } = useFlujo();
  // al llegar a la revisión, se revisa la nómina con las reglas actuales
  useEffect(() => { if (w?.paso === 4 && !w.revision) asistenteRevisar().then(avisar); }, [w?.paso, w?.revision]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!w) return null;
  return (
    <div className="bulk fl">
      <div className="ops-head">
        <div><h2>{w.receta?.name || w.nombre || 'Nuevo flujo'}</h2><span className="muted small">{w.modelo ? w.modelo.nombre : 'Flujo documental'}</span></div>
        <div className="ops-head-r"><button className="ghost small with-ic" id="flBack" onClick={flujosVerInicio}><Icono nombre="chevL" tam={15} /><span>Volver a mis flujos</span></button></div>
      </div>
      <div className="fl-steps">
        {PASOS.map((s, i) => (
          <span key={s} style={{ display: 'contents' }}>
            {i > 0 && <i />}
            <button className={`fl-step ${w.paso === i + 1 ? 'on' : ''} ${w.paso > i + 1 ? 'done' : ''}`} data-s={i + 1} disabled={!puedeIr(w, i + 1) || !!w.soloLectura} onClick={() => asistenteIr(i + 1)}>
              <b>{w.paso > i + 1 ? <Icono nombre="check" tam={13} /> : i + 1}</b><span>{s}</span>
            </button>
          </span>
        ))}
      </div>
      <div className="fl-body" id="flBody">{[null, <PasoPlantilla key="1" />, <PasoNomina key="2" />, <PasoCampos key="3" />, <PasoRevision key="4" />, <PasoFirma key="5" />][w.paso]}</div>
    </div>
  );
}

export default function Flujos() {
  const { vista, w, flujosVerInicio, flujosSetCola, asistenteNomina } = useFlujo();
  useEffect(() => {
    flujosVerInicio();
    const alCola = (e: Event) => flujosSetCola((e as CustomEvent<IColaMasiva>).detail);
    // archivo soltado en la ventana: solo sirve como nómina en el paso 2
    const alSoltar = async (e: Event) => {
      const w0 = estadoFlujos().w; const ruta = (e as CustomEvent<string>).detail;
      if (estadoFlujos().vista !== 'wizard' || w0?.paso !== 2) return toast('Para cargar una nómina, ve al paso 2 de un flujo.', 4000);
      const r = await nominaFlujo.leer(ruta); if (!r.ok) return toast(r.error || '', 5000); asistenteNomina(r.data as INomina);
    };
    window.addEventListener('pf:bulk', alCola); window.addEventListener('pf:flujos-nomina', alSoltar);
    return () => { window.removeEventListener('pf:bulk', alCola); window.removeEventListener('pf:flujos-nomina', alSoltar); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- solo al montar
  return vista === 'wizard' && w ? <Asistente /> : <Inicio />;
}
