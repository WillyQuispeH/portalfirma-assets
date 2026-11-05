// Panel de las plantillas con campos: el diseño (convertir en campo, detectar con IA, la lista de campos, guardar)
// y el formulario para llenarla. Los id y clases (#tplConv, #tplAi, .tpl-f, #tplSave, .tf, [data-in], .err,
// #tplStatus, #tplGen) los usan las pruebas.
import Ic from './Ic';
import { MejorarDocumento } from '../asistente-legal/PanelAsistente';
import { useEditor } from '../../../../store/hooks/useEditor.hook';
import { FIELD_TYPES } from '../../../../utils/editor-pdf/plantillas';
import { aDiseno, cambiarValor, convertSelection, detectWithAi, estadoLlenado, fieldDialog, fieldUses, generate, removeField, saveTemplate, showErr, terminarDiseno } from './plantillas';
import type { ICampo } from '../../../../store/interfaces/editor.interface';

export function DisenoPlantilla() {
  const { doc: T } = useEditor();
  const t = T.tpl!; const fs = t.def.fields;
  return <div className="sec tpl-design"><h4><Ic n="template" t={13} /> Plantilla</h4>
    <ol className="tpl-steps"><li>Haz clic en un párrafo.</li><li>Selecciona las palabras que cambian (nombre, RUT, fecha…).</li><li>Presiona <strong>Convertir en campo</strong>.</li></ol>
    <button className="primary pbtn" id="tplConv" onMouseDown={(e) => e.preventDefault()} onClick={convertSelection}><Ic n="plus" t={15} /> Convertir en campo</button>
    <button className="secondary pbtn ai-btn" id="tplAi" data-member="" title="La IA lee el documento y propone los campos (nombres, RUT, fechas, montos…)" onClick={detectWithAi}><Ic n="sparkle" t={15} /> Detectar con IA <small className="tk-cost">2 tokens</small><span className="lock-badge"><Ic n="lock" t={11} /></span></button>
    <div className="tpl-fields">{fs.length ? fs.map((f) => <div className="tpl-f" data-f={f.id} key={f.id}><span className="nm">{f.label}{f.required ? ' *' : ''}</span>
      <span className="ty">{FIELD_TYPES[f.type]}{f.signer ? ' · firmante «' + f.signer.role + '»' : ''} · {fieldUses(f.id)}×</span>
      <button className="ibtn" data-edit={f.id} title="Editar campo" onClick={() => fieldDialog({ field: f })}><Ic n="edit" t={14} /></button><button className="ibtn danger" data-del={f.id} title="Quitar campo" onClick={() => removeField(f.id)}><Ic n="trash" t={14} /></button></div>)
      : <p className="hint">Todavía no hay campos.</p>}</div>
    <div className="prow"><button className="secondary pbtn" id="tplSave" onClick={saveTemplate}><Ic n="save" t={15} /> Guardar plantilla</button></div>
    <button className="ghost small" id="tplExit" onClick={terminarDiseno}>Terminar</button></div>;
}

const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function Entrada({ f, valor }: { f: ICampo; valor: string }) {
  const cambio = (strict: boolean) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => cambiarValor(f.id, e.target.value, strict);
  const salir = () => showErr(f.id, true);
  if (f.type === 'fecha') return <div className="prow"><input type="date" data-in={f.id} value={valor} onChange={cambio(true)} onBlur={salir} /><button className="ghost small fixed" data-today={f.id} onClick={() => cambiarValor(f.id, hoy(), true)}>Hoy</button></div>;
  if (f.type === 'opcion') return <select data-in={f.id} value={valor} onChange={cambio(true)} onBlur={salir}><option value="">— Elegir —</option>{(f.options || []).map((x) => <option key={x}>{x}</option>)}</select>;
  if (f.type === 'parrafo') return <textarea data-in={f.id} rows={3} value={valor} onChange={cambio(false)} onBlur={salir} />;
  const ph = ({ rut: '12.345.678-9', monto: '500000', numero: '12', email: 'nombre@correo.cl', telefono: '9 1234 5678' } as Record<string, string>)[f.type] || f.sample || '';
  return <input data-in={f.id} value={valor} placeholder={ph} inputMode={['monto', 'numero', 'telefono'].includes(f.type) ? 'numeric' : undefined} spellCheck={false} onChange={cambio(false)} onBlur={salir} />;
}

export function LlenarPlantilla() {
  const { doc: T } = useEditor();
  const t = T.tpl!; const fs = t.def.fields;
  const grupo = (f: ICampo) => (f.signer ? 'Firmante: ' + f.signer.role : 'Datos del documento');
  const grupos = [...new Set(fs.map(grupo))];
  const st = estadoLlenado(T);
  return <>
    <div className="sec tpl-fill"><h4><Ic n={T.aiDoc ? 'sparkle' : 'template'} t={13} /> {T.aiDoc ? 'Completar documento' : 'Llenar plantilla'}</h4><div className="tpl-title">{t.def.name}</div>
      <p className="hint">Completa los datos: el documento se actualiza mientras escribes. Los campos con * son obligatorios.</p>
      {grupos.map((g) => <div className="tpl-group" key={g}><div className="tpl-gname">{g}</div>{fs.filter((f) => grupo(f) === g).map((f) => {
        const err = t.errs?.[f.id] || '';
        return <label className={'tf' + (err ? ' bad' : '')} data-f={f.id} key={f.id}><span>{f.label}{f.required ? ' *' : ''}</span><Entrada f={f} valor={t.values[f.id] ?? ''} /><em className="err">{err}</em></label>;
      })}</div>)}
      <div className="tpl-status" id="tplStatus">{st.filled} de {st.total} campos completos{st.shr ? ` · ${st.shr} párrafo(s) con la letra ajustada para que quepa` : ''}{st.ovf ? <> · <b className="bad">{st.ovf} párrafo(s) no caben</b></> : null}</div>
      <button className="primary pbtn" id="tplGen" onClick={generate}><Ic n="file" t={15} /> Generar documento</button>
      <button className="ghost small" id="tplToDesign" onClick={aDiseno}>{T.aiDoc ? 'Guardar como plantilla…' : 'Editar plantilla'}</button></div>
    {T.aiDoc ? <MejorarDocumento /> : null}
  </>;
}
