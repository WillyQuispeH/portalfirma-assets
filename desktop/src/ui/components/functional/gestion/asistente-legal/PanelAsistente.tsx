// Panel derecho del editor en modo «Asistente»: Revisar, Redactar, Preguntar y Ajustes del proveedor de IA.
// También la sección «Mejorar con IA» del formulario de un documento redactado.
// Los id y clases (#aiReview, .ai-item, [data-apply], #aiQ, .ai-msg, #aiKey, .tk-bar…) los usan las pruebas.
import { useEffect, useRef, useState } from 'react';
import Icono from '../../../ui/Icono';
import { asistenteEstado as asistenteSt, useAsistente } from '../../../../store/hooks/useAsistente.hook';
import { editorArchivos, useEditor } from '../../../../store/hooks/useEditor.hook';
import { TYPES, tk, verifyMarks } from '../../../../utils/asistente-legal';
import { abrirUrl, toast } from '../../../../utils/app';
import { aplicar, askDoc, close, descartar, draft, editDocText, improveDoc, pestana, review, tokensDialog, verCita, wallet } from './controlador';
import type { IAsistenteEstado } from '../../../../store/interfaces/asistente.interface';

import Boton from '../../../ui/Boton';
import Input from '../../../ui/Input';
import Select from '../../../ui/Select';
import Textarea from '../../../ui/Textarea';
const Html = ({ html, className }: { html: string; className?: string }) => <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;

export default function PanelAsistente() {
  const { doc } = useEditor();
  const { estado, billetera, asistenteEstado, asistenteBilletera } = useAsistente();
  useEffect(() => { asistenteEstado(); asistenteBilletera(true); }, [asistenteEstado, asistenteBilletera]);
  const a = doc.ai!;
  const chat = useRef<HTMLDivElement>(null);
  useEffect(() => { if (chat.current) chat.current.scrollTop = chat.current.scrollHeight; });
  const [q, setQ] = useState('');
  const [draftQ, setDraftQ] = useState(a.draftQ || '');
  if (!estado) return <div className="sec ai"><p className="hint">Cargando…</p></div>;
  const head = <div className="ai-head"><h4><Icono nombre="sparkle" tam={14} /> Asistente legal</h4><Boton variante="fantasma" tamano="sm" icono="x" id="aiClose" title="Volver a Formato" onClick={close} aria-label="Volver a Formato" /></div>;
  if (!estado.hasKey || a.tab === 'settings') return <div className="sec ai">{head}<Ajustes s={estado} /></div>;
  const costo = (k: 'review' | 'draft' | 'ask', def: number) => tk(billetera?.costs?.[k] ?? def);
  const askHint = billetera && (billetera.askLeft ?? 0) > 0 ? `Te quedan ${billetera.askLeft} pregunta(s) ya pagadas.` : `Cada 3 preguntas usan ${costo('ask', 1)}.`;
  const preguntar = () => { const t = q; setQ(''); askDoc(t); };
  return <div className="sec ai">{head}
    <div className="tk-bar"><span className="tk-coin"><Icono nombre="sparkle" tam={13} /></span><span className="tk-n" data-tk>{typeof billetera?.balance === 'number' ? tk(billetera.balance) : '…'}</span><Boton variante="fantasma" tamano="sm" data-tkbuy onClick={() => tokensDialog()}>Comprar / código</Boton></div>
    <div className="ai-tabs">{([['review', 'Revisar'], ['draft', 'Redactar'], ['ask', 'Preguntar']] as const).map(([k, l]) => <button key={k} data-aitab={k} className={a.tab === k ? 'on' : ''} onClick={() => pestana(k)}>{l}</button>)}</div>
    {a.tab === 'review' ? <>
      <p className="hint">Revisa ortografía, redacción, datos que no calzan (RUT, montos), lo que falta y los riesgos del documento.</p>
      <Boton icono="sparkle" id="aiReview" onClick={review}>{a.items ? 'Revisar de nuevo' : 'Revisar documento'} <small className="tk-cost">{costo('review', 1)}</small></Boton>
      {a.summary ? <div className="ai-summary">{a.summary}</div> : null}
      {a.items ? (a.items.length ? <div className="ai-items">{a.items.map((it, n) => <div key={n} className={`ai-item g-${it.gravedad || 'media'} ${it.done ? 'done' : ''}`} data-n={n}>
        <div className="ai-tag">{TYPES[it.tipo] || 'Observación'}{it.local ? ' · verificado' : ''}{it.done ? ` · ${it.done}` : ''}</div>
        {it.cita ? <div className="ai-quote">«{it.cita}»</div> : null}
        {it.sugerencia ? <div className="ai-sug"><Icono nombre="chevR" tam={12} /> «{it.sugerencia}»</div> : null}
        <Html className="ai-exp" html={verifyMarks(it.explicacion || '')} />
        {it.done ? null : <div className="ai-acts">{it.sugerencia && it.cita ? <Boton tamano="sm" data-apply onClick={() => aplicar(it)}>Aplicar</Boton> : null}{it.cita ? <Boton variante="fantasma" tamano="sm" data-go onClick={() => verCita(it)}>Ver</Boton> : null}<Boton variante="fantasma" tamano="sm" data-skip onClick={() => descartar(it)}>Descartar</Boton></div>}
      </div>)}</div> : <p className="hint">No se encontraron observaciones.</p>) : null}
    </> : a.tab === 'draft' ? <>
      <p className="hint">Describe el documento: tipo, partes, plazos, montos y condiciones. Los datos que no indiques quedan como [CAMPOS] para completar.</p>
      <Textarea id="aiDraftQ" rows={7} placeholder="Ej.: Contrato de arriendo de oficina en Providencia por 12 meses, renta de $800.000 reajustable por IPC, garantía de un mes, término anticipado con 60 días de aviso." value={draftQ} onChange={(e) => { setDraftQ(e.target.value); a.draftQ = e.target.value; }} />
      <Boton icono="sparkle" id="aiDraft" onClick={() => draft(draftQ)}>Crear borrador <small className="tk-cost">{costo('draft', 2)}</small></Boton>
      <p className="hint">Se abre en una pestaña nueva, listo para completar los datos en un formulario. Después puedes pedir cambios al texto.</p>
    </> : <>
      <div className="ai-chat" id="aiChat" ref={chat}>{a.chat.filter((m) => !m.ctx).length ? a.chat.filter((m) => !m.ctx).map((m, i) => m.role === 'assistant'
        ? <Html key={i} className={'ai-msg ' + m.role} html={verifyMarks(m.content).replace(/\n/g, '<br>')} />
        : <div key={i} className={'ai-msg ' + m.role}>{m.content}</div>) : <p className="hint">Pregunta sobre el documento abierto: plazos, obligaciones, riesgos, qué falta…</p>}</div>
      <div className="ai-askrow"><Textarea id="aiQ" rows={2} clasesCampo="tw:flex-1" placeholder="Ej.: ¿Qué pasa si el cliente no paga?" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); preguntar(); } }} /><Boton tamano="sm" id="aiAsk" onClick={preguntar}>Preguntar</Boton></div>
      <p className="hint" data-askleft>{askHint}</p>
    </>}
    <p className="ai-foot"><Icono nombre="scanText" tam={12} /> Puede equivocarse: verifica sus sugerencias y las normas marcadas en <mark className="verify">amarillo</mark>. No reemplaza la revisión de un abogado.<br />
      <a href="#" id="aiSettings" onClick={(e) => { e.preventDefault(); pestana('settings'); }}>Ajustes</a>{a.model ? ` · modelo ${a.model}` : ''}</p>
  </div>;
}

// Ajustes del proveedor de IA (o el aviso de que viene incluido)
function Ajustes({ s }: { s: IAsistenteEstado & { keyEnd?: string; model?: string } }) {
  const { asistenteEstado: recargar } = useAsistente();
  const prov = s.providers || {};
  const [p, setP] = useState(s.provider || Object.keys(prov)[0] || '');
  const [clave, setClave] = useState('');
  const [modelo, setModelo] = useState(s.model || '');
  const [modelos, setModelos] = useState<string[] | null>(null);
  const fijar = (e: object) => asistenteSt().asistenteFijarEstado(e as IAsistenteEstado);
  if (s.managed) return <>
    <p className="hint">El asistente viene incluido con PortalFirma Asset ({prov[s.provider || '']?.label || s.provider}{s.model ? ', modelo ' + s.model : ''}). No necesitas configurar nada.</p>
    <p className="hint">El texto de los documentos que revises se envía a ese proveedor para procesarlo.</p>
    <Boton variante="fantasma" tamano="sm" id="aiBack" onClick={() => pestana('review')}>Volver al asistente</Boton>
  </>;
  const guardar = async () => {
    const c: Record<string, string> = { provider: p, model: modelo }; const k = clave.trim(); if (k) c.key = k;
    const r = await editorArchivos.iaConfigurar(c); setClave('');
    if (!r.ok) return toast(r.error || '', 5000);
    fijar(r.data!); toast(k ? 'Clave guardada de forma cifrada en este computador.' : 'Ajustes guardados.');
    if ((r.data as IAsistenteEstado).hasKey) pestana('review'); else recargar(true);
  };
  return <>
    <p className="hint">El asistente usa tu propia cuenta de un proveedor de IA. Crea una clave de API solo para esta app, con un límite de gasto, e ingrésala aquí. Queda cifrada en este computador.</p>
    <Select id="aiProv" etiqueta="Proveedor" value={p} onChange={(e) => setP(e.target.value)} opciones={Object.entries(prov).map(([k, v]) => [k, v.label] as [string, string])} />
    <Input type="password" id="aiKey" autoComplete="off" spellCheck={false} etiqueta={<span>Clave de API {s.keyEnd ? <em className="muted">(guardada, termina en …{s.keyEnd})</em> : null}</span>}
      placeholder={s.keyEnd ? 'Pega otra clave para reemplazarla' : 'Pega aquí tu clave'} value={clave} onChange={(e) => setClave(e.target.value)} />
    <p className="hint"><a href="#" id="aiKeySite" onClick={(e) => { e.preventDefault(); const u = prov[p]?.site; if (u) abrirUrl(u); }}>¿Dónde se crea la clave?</a></p>
    <div className="tw:flex tw:items-end tw:gap-ui">
      <Select id="aiModel" etiqueta="Modelo" clasesCampo="tw:flex-1" value={modelo} onChange={(e) => setModelo(e.target.value)}>
        {modelos ? <><option value="">Automático (el más capaz disponible)</option>{modelos.map((m) => <option key={m} value={m}>{m}</option>)}</> : <option value={s.model || ''}>{s.model || 'Automático (el más capaz disponible)'}</option>}
      </Select>
      <Boton variante="fantasma" id="aiLoadModels" onClick={async () => { const r = await editorArchivos.iaModelos(); if (!r.ok) return toast(r.error || '', 5000); setModelos(r.data || []); }}>Ver modelos</Boton>
    </div>
    <div className="prow"><Boton className="pbtn" id="aiSave" onClick={guardar}>Guardar</Boton></div>
    {s.keyEnd ? <Boton variante="fantasma" tamano="sm" id="aiDelKey" onClick={async () => { const r = await editorArchivos.iaConfigurar({ key: '' }); if (r.ok) { fijar(r.data!); toast('Clave borrada.'); recargar(true); } }}>Borrar la clave de este computador</Boton> : null}
    {s.hasKey ? <Boton variante="fantasma" tamano="sm" id="aiBack" onClick={() => pestana('review')}>Volver al asistente</Boton> : null}
  </>;
}

// «Mejorar con IA» en el formulario de un documento redactado por el asistente
export function MejorarDocumento() {
  const { doc } = useEditor();
  const { billetera } = useAsistente();
  useEffect(() => { wallet(true); }, []);
  const [instr, setInstr] = useState('');
  const spec = doc.aiDoc; if (!spec) return null;
  return <div className="sec ai ai-doc"><h4><Icono nombre="sparkle" tam={13} /> Mejorar con IA</h4>
    <p className="hint">Pide cambios al texto: «agrega una cláusula de codeudor solidario», «el plazo es indefinido con aviso de 60 días»…</p>
    <Textarea id="aiImp" rows={3} placeholder="¿Qué quieres cambiar?" value={instr} onChange={(e) => setInstr(e.target.value)} />
    <Boton icono="sparkle" id="aiImpGo" onClick={() => improveDoc(instr.trim())}>Aplicar cambio <small className="tk-cost">{tk(billetera?.costs?.edit ?? 1)}</small></Boton>
    {(spec.history || []).length ? <div className="ai-hist">{spec.history!.map((h, i) => <div key={i}><Icono nombre="chevR" tam={11} /> {h.note}</div>)}</div> : null}
    <Boton variante="fantasma" tamano="sm" icono="textEdit" id="aiEditTxt" onClick={editDocText}>Editar el texto a mano</Boton></div>;
}
