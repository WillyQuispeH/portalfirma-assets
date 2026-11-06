// Expedientes: una carpeta por caso con sus documentos (contratos, cédulas, fotos…) y su historial,
// en este computador o en Google Drive. A la izquierda la lista; a la derecha el expediente elegido.
//
// Siguen en src/renderer/expedientes.js (por utils/app.ts): «Nuevo expediente», «Más opciones», traer desde
// Drive y las acciones sobre los archivos marcados (abrir, combinar, Plazos, enviar a firmar), que usan el
// editor y las demás partes. Cuando cambian algo, expedientes.js avisa con el evento «pf:expedientes».
// Los id xp* y las clases xp-item, xp-file los usan las pruebas.
import { useEffect } from 'react';
import Buscador from '../../../ui/Buscador';
import Icono from '../../../ui/Icono';
import { mostrarCarpetaExpediente, useExpediente } from '../../../../store/hooks/useExpediente.hook';
import { accionExpediente, confirmar, desdeDriveExpediente, elegirExpedienteLegado, masOpcionesExpediente, nuevoExpediente, toast, verOperacion } from '../../../../utils/app';
import { tamano } from '../comun/archivos';
import type { IArchivoExpediente, IMovimientoExpediente, IOperacionResumen, TExpedienteTipo } from '../../../../store/interfaces/expediente.interface';

const TIPOS: Record<TExpedienteTipo, [string, string]> = { propiedad: ['Propiedad', 'home'], persona: ['Persona', 'user'], empresa: ['Empresa', 'building'], tramite: ['Trámite', 'listCheck'], otro: ['Otro', 'folder'] };
const HK: Record<string, string> = { created: 'folder', added: 'upload', removed: 'trash', sent: 'sign', plazos: 'calendar', saved: 'file', note: 'textEdit' };
const ext = (n: string) => String(n).split('.').pop()!.toLowerCase();
const KIND = (n: string): [string, string] => (ext(n) === 'pdf' ? ['PDF', 'file'] : /^(docx?|odt|rtf)$/.test(ext(n)) ? ['Word', 'textEdit'] : /^(xlsx?|csv|ods)$/.test(ext(n)) ? ['Excel', 'grid'] : /^(jpe?g|png|webp|heic)$/.test(ext(n)) ? ['Imagen', 'image'] : [ext(n).toUpperCase(), 'file']);
const usable = (n: string) => /^(pdf|docx?|xlsx?|csv|ods|jpe?g|png|webp)$/.test(ext(n)); // lo que la app sabe abrir
const fecha = (iso?: string) => { try { return iso ? new Date(iso).toLocaleString('es-CL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''; } catch { return ''; } };
const aviso = (r: { mensaje?: string; error?: string }) => { if (r.error) toast(r.error, 7000); else if (r.mensaje) toast(r.mensaje); };

function Movimiento({ h, ops }: { h: IMovimientoExpediente; ops: IOperacionResumen[] | null }) {
  let estado = null;
  if (h.kind === 'sent' && h.op != null) {
    const o = ops?.find((x) => String(x.operation) === String(h.op));
    const lab = !o ? 'Enviado' : (o.stage === 'finalized' || o.status === 'finalized') ? (o.signers && (o.signed ?? 0) < o.signers ? 'Cerrada sin todas las firmas' : 'Firmado') : `Firmando ${o.signed ?? 0}/${o.signers ?? '?'}`;
    estado = <><span className={`ops-chip ${/Firmado/.test(lab) ? 'ok' : /Cerrada/.test(lab) ? 'wait' : 'run'}`}>{lab} · N° {h.op}</span><button className="ghost small" data-op={h.op} onClick={() => verOperacion(Number(h.op))}>Ver</button></>;
  }
  return <div className="xp-h"><span className="xp-h-ic"><Icono nombre={HK[h.kind] || 'file'} tam={15} /></span><span className="xp-h-tx"><b>{h.text || ''}</b><small>{fecha(h.at)}</small></span><span className="xp-h-st">{estado}</span></div>;
}

export default function Expedientes({ sel: selInicial }: { sel?: string | null }) {
  const {
    lista, cargado, sel, archivos, historial, errorArchivos, cargandoArchivos, marcados, tab, q, operaciones,
    expedientesGetAll, expedienteElegir, expedienteSetTab, expedienteSetQ, archivoMarcar, archivosDesmarcar, archivosAgregar, archivoQuitar,
  } = useExpediente();

  useEffect(() => {
    expedientesGetAll(selInicial ?? undefined);
    const recargar = (e: Event) => { const d = (e as CustomEvent<{ sel?: string | null }>).detail || {}; expedientesGetAll(d.sel); };
    window.addEventListener('pf:expedientes', recargar);
    return () => window.removeEventListener('pf:expedientes', recargar);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- solo al montar
  useEffect(() => { elegirExpedienteLegado(sel); }, [sel]); // expedientes.js necesita saber cuál está elegido (Drive, soltar archivos)

  const t = q.trim().toLowerCase(); const visibles = lista.filter((x) => !t || x.name.toLowerCase().includes(t));
  const e = lista.find((x) => x.id === sel);
  const elegidos = archivos.filter((f) => marcados.includes(f.id)); const n = elegidos.length;
  const papelera = async (f: IArchivoExpediente) => {
    if (!e) return;
    const si = await confirmar({ clave: 'modal-103', titulo: 'Enviar a la papelera', texto: `¿Enviar «${f.name}» a la papelera ${e.storage === 'drive' ? 'de Google Drive' : 'del computador'}? Puedes recuperarlo desde ahí.`, boton: 'Enviar a la papelera', peligro: true });
    if (si) aviso(await archivoQuitar(f.id));
  };

  return (
    <div className="bulk xp">
      <div className="ops-head">
        <div><h2>Expedientes</h2><span className="muted small">Una carpeta por caso con todos sus documentos (contratos, cédulas, fotos…) y su historial. En tu computador o en Google Drive.</span></div>
        <div className="ops-head-r"><button className="primary small with-ic" id="xpNew" onClick={nuevoExpediente}><Icono nombre="plus" tam={15} /><span>Nuevo expediente</span></button></div>
      </div>
      <div className="xp-grid">
        <div className="xp-side">
          <Buscador id="xpQ" clase="ops-search" valor={q} alCambiar={expedienteSetQ} espera={80} placeholder="Buscar expediente…" />
          <div className="xp-list" id="xpList">
            {visibles.length ? visibles.map((x) => (
              <button key={x.id} className={`xp-item ${sel === x.id ? 'on' : ''}`} data-x={x.id} onClick={() => expedienteElegir(x.id)}>
                <span className={`xp-ic t-${x.type}`}><Icono nombre={TIPOS[x.type]?.[1] || 'folder'} tam={18} /></span>
                <span className="xp-tx"><b>{x.name}</b><small>{TIPOS[x.type]?.[0] || 'Otro'} · {x.storage === 'drive' ? 'Google Drive' : 'Este computador'}{x.count != null ? ` · ${x.count} archivo${x.count === 1 ? '' : 's'}` : ''}</small></span>
              </button>
            )) : cargado && <div className="ops-empty small"><p>{lista.length ? 'Sin resultados.' : 'Todavía no tienes expedientes.'}</p></div>}
          </div>
        </div>
        <div className="xp-detail" id="xpDetail">
          {!e ? cargado && (
            <div className="ops-empty"><div>
              <Icono nombre="folderOpen" tam={38} />
              <p><b>Ordena tus documentos por caso.</b><br />Ej.: «Depto Calle Nueva 120»: el contrato, las cédulas de las partes, fotos del inventario y lo que se envió a firmar.</p>
              <button className="primary" id="xpNew2" onClick={nuevoExpediente}><Icono nombre="plus" tam={15} /> Crear mi primer expediente</button>
            </div></div>
          ) : (
            <>
              <div className="xp-head">
                <span className={`xp-ic big t-${e.type}`}><Icono nombre={TIPOS[e.type]?.[1] || 'folder'} tam={18} /></span>
                <div className="xp-h-tx">
                  <h3>{e.name}</h3>
                  <div className="xp-chips">
                    <span className="ops-chip muted">{TIPOS[e.type]?.[0] || 'Otro'}</span>
                    <span className={`ops-chip ${e.storage === 'drive' ? 'run' : 'ok'}`}><Icono nombre={e.storage === 'drive' ? 'drive' : 'folder'} tam={12} /> {e.storage === 'drive' ? 'Google Drive' : 'Este computador'}</span>
                    {e.notes && <span className="muted small">{e.notes}</span>}
                  </div>
                </div>
                <div className="xp-h-acts">
                  <button className="ghost small with-ic" id="xpReveal" onClick={async () => { const r = await mostrarCarpetaExpediente(e.id); if (!r.ok) toast(r.error || '', 5000); }}><Icono nombre="folderOpen" tam={14} /><span>Abrir carpeta</span></button>
                  <button className="ibtn" id="xpMore" title="Más opciones" onClick={() => masOpcionesExpediente(e)}><Icono nombre="settings" tam={15} /></button>
                </div>
              </div>
              <div className="ai-tabs xp-tabs">
                <button data-t="docs" className={tab === 'docs' ? 'on' : ''} onClick={() => expedienteSetTab('docs')}>Documentos{archivos.length ? ` (${archivos.length})` : ''}</button>
                <button data-t="hist" className={tab === 'hist' ? 'on' : ''} onClick={() => expedienteSetTab('hist')}>Historial{historial.length ? ` (${historial.length})` : ''}</button>
              </div>
              {tab === 'docs' ? (
                <>
                  <div className="xp-add">
                    <button className="secondary small with-ic" id="xpAdd" onClick={async () => aviso(await archivosAgregar())}><Icono nombre="upload" tam={14} /><span>Agregar desde el computador</span></button>
                    <button className="secondary small with-ic" id="xpDrive" onClick={() => desdeDriveExpediente(e)}><Icono nombre="drive" tam={14} /><span>Desde Google Drive</span></button>
                    <span className="muted small">o arrastra los archivos aquí (PDF, Word, Excel, fotos de cédulas…)</span>
                  </div>
                  {n > 0 && (
                    <div className="xp-selbar"><b>{n} seleccionado{n === 1 ? '' : 's'}</b>
                      <button className="secondary small" data-do="open" onClick={() => accionExpediente('open', elegidos, e)}>Abrir en el editor</button>
                      {n > 1 && <button className="secondary small" data-do="combine" onClick={() => accionExpediente('combine', elegidos, e)}>Combinar en un PDF</button>}
                      <button className="secondary small" data-do="plazos" onClick={() => accionExpediente('plazos', elegidos, e)}><Icono nombre="calendar" tam={13} /> Agregar a Plazos</button>
                      <button className="primary small" data-do="sign" data-member="" onClick={() => accionExpediente('sign', elegidos, e)}><Icono nombre="sign" tam={13} /> Enviar a firmar{n > 1 ? ` (${n})` : ''}</button>
                      <button className="ghost small" data-do="none" onClick={archivosDesmarcar}>Quitar selección</button>
                    </div>
                  )}
                  <div className="xp-files" id="xpFiles">
                    {cargandoArchivos ? <p className="hint"><i className="bk-spin" /> Cargando…</p>
                      : errorArchivos ? <p className="hint bad">{errorArchivos}</p>
                        : archivos.length ? archivos.map((f) => {
                          const [k, i] = KIND(f.name); const on = marcados.includes(f.id); const u = usable(f.name);
                          return (
                            <div key={f.id} className={`xp-file ${on ? 'sel' : ''}`} data-f={f.id} onClick={(ev) => { if ((ev.target as HTMLElement).closest('button, input')) return; if (u) archivoMarcar(f.id); }}>
                              <input type="checkbox" checked={on} disabled={!u} title={u ? undefined : 'La app no abre este tipo de archivo'} onChange={() => archivoMarcar(f.id)} />
                              <span className="fi"><Icono nombre={i} tam={18} /></span>
                              <span className="xp-f-tx"><b>{f.name}</b><small>{k} · {tamano(f.size) || '1 KB'} · {fecha(f.modified)}</small></span>
                              <span className="xp-f-acts">
                                {u && <button className="ghost small" data-fa="view" onClick={() => accionExpediente('open', [f], e)}>Ver</button>}
                                <button className="ibtn" data-fa="rm" title="Enviar a la papelera" onClick={() => papelera(f)}><Icono nombre="trash" tam={14} /></button>
                              </span>
                            </div>
                          );
                        }) : <div className="ops-empty small"><p>Este expediente todavía no tiene archivos.</p></div>}
                  </div>
                </>
              ) : (
                <div className="xp-hist">{historial.length ? historial.map((h, i) => <Movimiento key={i} h={h} ops={operaciones} />) : <p className="hint">Sin movimientos todavía.</p>}</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
