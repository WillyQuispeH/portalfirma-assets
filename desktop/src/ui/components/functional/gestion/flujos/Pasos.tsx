// Los pasos 1 a 4 del asistente de Flujos: plantilla, nómina, campos (de dónde sale cada dato) y revisión.
import { useState } from 'react';
import Icono from '../../../ui/Icono';
import { nominaFlujo, pedido, useFlujo } from '../../../../store/hooks/useFlujo.hook';
import { muestraFlujo, toast } from '../../../../utils/app';
import { etiquetaCorta, nominaEjemplo, normalizar, plural } from '../../../../utils/flujos';
import type { ICampoModelo, TRegla } from '../../../../store/interfaces/flujo.interface';

export function PasoPlantilla() {
  const { w, modelos, asistenteModelo } = useFlujo();
  const [q, setQ] = useState('');
  const cats = [...new Set(modelos.map((m) => m.categoria))]; const t = normalizar(q);
  const lista = modelos.filter((m) => !t || normalizar(m.nombre + ' ' + m.categoria + ' ' + m.descripcion).includes(t));
  const grupos = cats.map((c) => [c, lista.filter((m) => m.categoria === c)] as const).filter(([, ms]) => ms.length);
  return (
    <div className="fl-card"><h3>1. Elige la plantilla</h3><p className="muted small">Modelos aprobados de la Notaría Virtual de Portalfirma. El texto no se modifica: solo se llenan sus datos.</p>
      <input id="flQ" className="fl-q" placeholder="Buscar: mandato, pagaré, arriendo, poder…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="fl-models" id="flModels">
        {grupos.length ? grupos.map(([c, ms]) => (
          <div key={c} style={{ display: 'contents' }}>
            <h4>{c}</h4>
            {ms.map((m) => (
              <button key={m.id} className={`fl-model ${w?.modelId === m.id ? 'on' : ''}`} data-m={m.id} onClick={() => asistenteModelo(m.id)}>
                <b>{m.nombre}</b><small>{m.descripcion || ''}</small>
                <span className="fl-tags"><span className="ops-chip muted">{m.fields.length} datos</span>{m.roles.map((r) => <span key={r.alias} className="ops-chip run">Firma: {r.alias}</span>)}</span>
              </button>
            ))}
          </div>
        )) : <p className="muted">No encontré plantillas con esa búsqueda.</p>}
      </div>
    </div>
  );
}

export function PasoNomina() {
  const { w, asistenteNomina, asistenteIr } = useFlujo();
  const [encima, setEncima] = useState(false);
  if (!w?.modelo) return null; const n = w.nomina;
  const elegir = async () => { const r = await nominaFlujo.elegir(); if (!r.ok) return toast(r.error || '', 5000); if (r.data) asistenteNomina(r.data); };
  return (
    <div className="fl-card"><h3>2. Carga la nómina</h3><p className="muted small">Un Excel o CSV con una fila por documento y los títulos de las columnas en la primera fila. La nómina no se guarda en la app: solo se usa para generar los documentos.</p>
      {/* el archivo soltado lo recibe la ventana (Flujos.dropFiles) */}
      <div className={`bk-drop ${encima ? 'over' : ''}`} id="flDrop" role="button" tabIndex={0} onClick={elegir}
        onDragOver={(e) => { e.preventDefault(); setEncima(true); }} onDragLeave={() => setEncima(false)} onDrop={() => setEncima(false)}>
        <Icono nombre="upload" tam={30} /><b>Arrastra aquí la nómina o haz clic para elegirla</b><span>Excel (.xlsx) o CSV · hasta 2.000 filas</span>
      </div>
      <div className="fl-row-acts"><button className="ghost small with-ic" id="flTpl" onClick={() => { nominaEjemplo(w.modelo!); toast('Nómina de ejemplo descargada: ábrela en Excel, llénala y vuelve a cargarla.', 5000); }}><Icono nombre="download" tam={14} /><span>Descargar nómina de ejemplo para esta plantilla</span></button></div>
      <div id="flPrev">
        {n && <>
          <div className="fl-ok"><Icono nombre="check" tam={15} /> <b>{n.name}</b> · {plural(n.rows.length, 'fila', 'filas')} · {plural(n.headers.length, 'columna', 'columnas')}</div>
          <div className="fl-table-wrap"><table className="fl-table"><thead><tr>{n.headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
            <tbody>{n.rows.slice(0, 5).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c.s}</td>)}</tr>)}</tbody></table></div>
          {n.rows.length > 5 && <p className="muted small">… y {n.rows.length - 5} filas más.</p>}
          <div className="fl-nav"><span /><button className="primary" id="flNext" onClick={() => asistenteIr(3)}>Siguiente: unir columnas con los datos <Icono nombre="chevR" tam={15} /></button></div>
        </>}
      </div>
    </div>
  );
}

const QUIEN: Record<string, string> = { fullName: 'nombre del firmante', rut: 'RUT del firmante', email: 'correo del firmante', phone: 'teléfono del firmante' };
export function PasoCampos() {
  const { w, asistenteRegla, asistenteIr } = useFlujo();
  if (!w?.modelo || !w.nomina) return null; const m = w.modelo; const n = w.nomina; const reglas = w.reglas; // ya unidas al entrar al paso (store)
  const grupos = [...new Set(m.fields.map((f) => f.group))];
  const valor = (r?: TRegla) => (!r ? 'empty' : r.type === 'col' ? 'col:' + r.header : r.type);
  const ejemplo = (f: ICampoModelo) => { const r = reglas[f.id]; if (!r) return ''; if (r.type === 'today') return new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }); if (r.type === 'col') { const i = n.headers.indexOf(r.header); return n.rows[0]?.[i]?.s || ''; } return ''; };
  const cambiar = (f: ICampoModelo, v: string) => {
    asistenteRegla(f.id, v === 'empty' ? null : v === 'today' ? { type: 'today' } : v === 'fixed' ? { type: 'fixed', value: reglas[f.id]?.type === 'fixed' ? (reglas[f.id] as { value: string }).value : '' } : { type: 'col', header: v.slice(4) });
    if (v === 'fixed') setTimeout(() => (document.querySelector(`[data-fx="${CSS.escape(f.id)}"]`) as HTMLInputElement | null)?.focus(), 0);
  };
  const faltan = m.fields.filter((f) => f.required && !reglas[f.id]).length;
  return (
    <div className="fl-card"><h3>3. ¿De dónde sale cada dato?</h3>
      <p className="muted small">Ya uní las columnas que reconocí. Los datos que son iguales para todos (por ejemplo, tu empresa como acreedora o el representante que firma siempre) van como <b>valor fijo</b> y quedan guardados en la receta.</p>
      {faltan > 0 && <div className="fl-warn"><Icono nombre="alert" tam={15} /> {plural(faltan, 'dato obligatorio sin asignar', 'datos obligatorios sin asignar')}.</div>}
      <div className="fl-map">
        {grupos.map((g) => {
          const fs = m.fields.filter((f) => f.group === g); const firma = fs.some((f) => f.signer);
          return (
            <div key={g} className="fl-group"><h4>{fs[0].groupLabel}{firma && <> <span className="ops-chip run">Firma el documento</span></>}</h4>
              {fs.map((f) => {
                const r = reglas[f.id];
                return (
                  <div key={f.id} className={`fl-mrow ${f.required && !r ? 'miss' : ''}`}>
                    <span className="fl-lab">{etiquetaCorta(f)}{!f.required && <> <small className="muted">(opcional)</small></>}{f.signerKey && <> <small className="muted">· {QUIEN[f.signerKey]}</small></>}</span>
                    <span>
                      <select data-f={f.id} value={valor(r)} onChange={(e) => cambiar(f, e.target.value)}>
                        <option value="empty">— Dejar vacío —</option>
                        <optgroup label="Columna de la nómina">{n.headers.map((h) => <option key={h} value={'col:' + h}>{h}</option>)}</optgroup>
                        <optgroup label="Otro"><option value="fixed">Valor fijo (igual para todos)</option>{/fecha/i.test(f.label) && <option value="today">Fecha del día en que se genera</option>}</optgroup>
                      </select>
                    </span>
                    <span>{r?.type === 'fixed'
                      ? <input data-fx={f.id} value={r.value || ''} placeholder="Escribe el valor" onChange={(e) => asistenteRegla(f.id, { type: 'fixed', value: e.target.value })} />
                      : <small className="muted fl-sample">{ejemplo(f) || ' '}</small>}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="fl-nav"><button className="ghost" id="flPrevS" onClick={() => asistenteIr(2)}><Icono nombre="chevL" tam={15} /> Nómina</button><button className="primary" id="flNext" onClick={() => asistenteIr(4)}>Revisar las {n.rows.length} filas <Icono nombre="chevR" tam={15} /></button></div>
    </div>
  );
}

export function PasoRevision() {
  const { w, asistenteIr } = useFlujo();
  const c = w?.revision;
  if (!w || !c) return <div className="fl-card"><h3>4. Revisión</h3><p className="muted"><i className="bk-spin" /> Revisando RUT, correos y datos obligatorios…</p></div>;
  const malas = c.rows.filter((x) => !x.ok); const buenas = c.rows.filter((x) => x.ok);
  return (
    <div className="fl-card"><h3>4. Revisión</h3>
      <div className="fl-sum"><div className="ok"><b>{c.ok}</b><span>listas para generar</span></div><div className={c.bad ? 'bad' : 'muted'}><b>{c.bad}</b><span>con problemas{c.bad ? ' (se omiten)' : ''}</span></div></div>
      {malas.length > 0 && <>
        <h4>Filas con problemas</h4>
        <div className="fl-errs">{malas.slice(0, 100).map((x) => <div key={x.n}><b>Fila {x.n + 2}</b> <span className="muted">{x.label}</span><small>{x.errors.join(' · ')}</small></div>)}{malas.length > 100 && <p className="muted small">… y {malas.length - 100} más.</p>}</div>
        <p className="muted small">Corrige esas filas en tu planilla y vuelve a cargarla, o sigue solo con las {c.ok} filas correctas. (La fila 1 de la planilla son los títulos.)</p>
      </>}
      {buenas.length > 0 && <>
        <h4>Muestra</h4><p className="muted small">Revisa cómo queda el documento antes de generar {c.ok === 1 ? 'el documento' : `los ${c.ok}`}.</p>
        <div className="fl-samples">{buenas.slice(0, 3).map((x) => <button key={x.n} className="secondary small" data-sm={x.n} onClick={() => muestraFlujo(pedido(w), x.n)}><Icono nombre="file" tam={14} /> Ver {x.label}</button>)}</div>
      </>}
      <div className="fl-nav"><button className="ghost" id="flPrevS" onClick={() => asistenteIr(3)}><Icono nombre="chevL" tam={15} /> Campos</button><button className="primary" id="flNext" disabled={!c.ok} onClick={() => asistenteIr(5)}>Siguiente: firma <Icono nombre="chevR" tam={15} /></button></div>
    </div>
  );
}
