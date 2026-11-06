// Plazos y vencimientos: los contratos ordenados por su fecha clave, con semáforo. Cada documento trae su informe
// básico gratis (se lee solo); el informe inteligente con IA sugiere qué hacer y redacta el documento.
// Los id pl* y las clases plz-* los usan las pruebas.
import { useEffect } from 'react';
import Icono from '../../../ui/Icono';
import { documentoPlazo, estadoPlazos, usePlazo } from '../../../../store/hooks/usePlazo.hook';
import { ACCION, contratos, fecha, fechaClave, fechaClaveDoc, lectura, orden, resumenBasico, semaforo, pedidoRedaccion } from '../../../../utils/plazos';
import { abrirDrive, abrirEnEditor, avisar, configurarAccesoDocumentos, confirmar, ia, toast } from '../../../../utils/app';
import type { IContratoPlazo, IDocPlazo, IAgregadosPlazos } from '../../../../store/interfaces/plazo.interface';

// lectura del estado para src/renderer/plazos.js (window.Plazos._p, _keyDate, _keyFor: pruebas y depuración)
(window as unknown as Record<string, unknown>).__plazos = { estado: estadoPlazos, fechaClave, fechaClaveDoc };

function Datos({ a, it, uno }: { a: IContratoPlazo; it: IDocPlazo; uno: boolean }) {
  return (
    <>
      <div className="plz-facts">
        <div><span>Objeto</span><b>{a.objeto || '—'}</b></div>
        <div><span>Inicio</span><b>{fecha(a.fecha_inicio)}</b></div><div><span>Plazo</span><b>{a.plazo || '—'}</b></div>
        <div><span>Término</span><b>{a.indefinido ? 'Indefinido' : fecha(uno ? it.end || a.fecha_termino : fechaClave(a).end || a.fecha_termino)}</b></div>
        <div><span>Renovación</span><b>{a.renovacion_automatica ? `Automática${a.periodo_renovacion_meses ? ` cada ${a.periodo_renovacion_meses} meses` : ''}` : 'No'}</b></div>
        <div><span>Aviso</span><b>{a.aviso_dias ? a.aviso_dias + ' días antes' : '—'}</b></div>
        <div><span>Reajuste</span><b>{a.reajuste ? `${a.reajuste.tipo}${a.reajuste.periodicidad_meses ? ` cada ${a.reajuste.periodicidad_meses} meses` : ''}` : '—'}</b></div>
        <div><span>Monto</span><b>{a.monto || '—'}</b></div>
      </div>
      <h4>Partes</h4>
      <div className="opd-sigs">
        {(a.partes || []).length ? a.partes!.map((p, i) => (
          <div key={i} className="opd-sig"><span className="av">{(p.nombre || '?').split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase()}</span>
            <span className="nm"><b>{p.nombre || '—'}</b><small>{p.rol || ''}{p.rut ? ' · ' + p.rut : ''}{p.representante ? ' · rep. por ' + p.representante : ''}{p.domicilio ? ' · ' + p.domicilio : ''}</small></span></div>
        )) : <p className="muted small">No se identificaron las partes.</p>}
      </div>
    </>
  );
}

export default function Plazos() {
  const { items, sel, leyendo, inteligentes, trayendo, plazosGetAll, plazosAplicar, plazoElegir, plazoLeer, plazoInteligente, plazoActualizar, plazoQuitar, plazosTraer } = usePlazo();

  useEffect(() => {
    plazosGetAll();
    // se agregaron documentos desde otra parte (un expediente, Drive): lo avisa plazos.js
    const alAgregar = (e: Event) => avisar(plazosAplicar((e as CustomEvent<{ ok: boolean; data?: IAgregadosPlazos; error?: string }>).detail), 6000);
    window.addEventListener('pf:plazos', alAgregar);
    return () => window.removeEventListener('pf:plazos', alAgregar);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- solo al montar

  const lista = [...items].sort(orden); const it = items.find((x) => x.id === sel);
  const verDoc = async (d: IDocPlazo) => { const r = await documentoPlazo.bytes(d.id); if (!r.ok) return; const t = await documentoPlazo.aTemporal(r.data!, d.name); if (t.ok) abrirEnEditor(typeof t.data === 'string' ? t.data : t.data!.path!); };
  const quitar = async (d: IDocPlazo) => { if (await confirmar({ clave: 'modal-117', titulo: 'Quitar de Plazos', texto: `¿Quitar «${d.name}» de la lista? El archivo original no se toca.`, boton: 'Quitar', peligro: true })) plazoQuitar(d.id); };
  const traer = async () => {
    const r = await plazosTraer();
    if (r.sinAcceso) return configurarAccesoDocumentos(traer);
    if (r.fallas) return confirmar({ clave: 'modal-118', titulo: 'Traer de Portalfirma', texto: `${r.agregados ? `Se agregaron ${r.agregados} contrato(s).` : 'No se pudo traer ningún contrato.'} ${r.fallas.slice(0, 5).join(' · ')}`, boton: 'Entendido' });
    if (r.error) toast(r.error, 5000); else if (r.mensaje) toast(r.mensaje, 4000);
  };
  const redactar = async (d: IDocPlazo, s: { contrato?: number; titulo: string; motivo?: string }) => {
    if (await ia.redactar(pedidoRedaccion(d, s))) plazoActualizar(d.id, { done: `Redactado: ${s.titulo}` });
  };

  const Detalle = () => {
    if (!it) return <div className="ops-empty"><p>Elige un documento para ver su informe.</p></div>;
    if (it.status !== 'done') return (
      <div className="opd"><h3>{it.name}</h3>
        <p className="muted">{it.status === 'reading' || it.status === 'pending' ? <><i className="bk-spin" /> Leyendo el documento…</> : it.error}</p>
        <div className="opd-acts">
          {it.status === 'error' && <><button className="secondary" id="plBasic" onClick={() => plazoLeer(it.id)}><Icono nombre="rotateR" tam={15} /> Volver a leer</button><button className="ghost" id="plOpen" onClick={() => verDoc(it)}><Icono nombre="file" tam={14} /> Ver documento</button></>}
          <button className="ghost" id="plDel" onClick={() => quitar(it)}>Quitar de la lista</button>
        </div>
      </div>
    );
    const a = lectura(it)!; const [l, c] = semaforo(it); const inteligente = !!it.analysis; const ctos = contratos(a); const ocupado = inteligentes.includes(it.id);
    const generar = async () => { const r = await plazoInteligente(it.id); if (r.error) toast(r.error, 5000); };
    return (
      <div className="opd">
        <div className="opd-head"><div><h3>{a.tipo || it.name}</h3><div className="muted small">{it.name} · <span className={`plz-mode ${inteligente ? 'smart' : ''}`}>{inteligente ? 'Informe inteligente' : 'Informe básico · sin IA'}</span></div></div><span className={`ops-chip ${c} big`}>{l}</span></div>
        <div className={`plz-key ${c}`}><b>{it.deadlineLabel}{it.deadline ? ': ' + fecha(it.deadline) : ''}</b><span>{inteligente ? a.resumen || '' : resumenBasico(ctos)}</span></div>
        {inteligente ? <>
          <h4>Sugerencias</h4>
          <div className="plz-acts">
            {(a.acciones || []).map((s, i) => (
              <div key={i} className={`plz-act ${s.urgente ? 'urg' : ''}`}>
                <div><b>{s.titulo}</b><small>{ACCION[s.tipo] || ''}{ctos.length > 1 && Number.isInteger(s.contrato) ? ` · contrato ${s.contrato! + 1}` : ''}{s.urgente ? ' · urgente' : ''}</small><p>{s.motivo || ''}</p></div>
                {s.tipo === 'ninguna'
                  ? <button className="secondary small" data-ok={i} onClick={() => plazoActualizar(it.id, { done: 'Revisado: se deja así' })}>Entendido</button>
                  : <button className="primary small" data-draft={i} onClick={() => redactar(it, s)}><Icono nombre="sparkle" tam={13} /> Redactar <small className="tk-cost">2 tokens</small></button>}
              </div>
            ))}
          </div>
        </> : (
          <div className="plz-smart">
            <div><b><Icono nombre="sparkle" tam={15} /> Informe inteligente</b><p>La IA revisa el contrato completo, confirma estos datos, te explica la situación y te sugiere qué documento preparar (aviso de no renovación, término anticipado, reajuste o renovación) para redactarlo con un clic.</p></div>
            <button className="primary" id="plSmart" disabled={ocupado} onClick={generar}>{ocupado ? <><i className="bk-spin" /> Preparando…</> : <><Icono nombre="sparkle" tam={14} /> Generar informe <small className="tk-cost">1 token</small></>}</button>
          </div>
        )}
        {ctos.map((x, i) => (
          <div key={i} style={{ display: 'contents' }}>
            {ctos.length > 1 && <h4 className="plz-ct">Contrato {i + 1} de {ctos.length}{x.titulo || x.objeto ? ' · ' + (x.titulo || x.objeto) : ''}</h4>}
            <Datos a={x} it={it} uno={ctos.length === 1} />
          </div>
        ))}
        <div className="plz-foot">
          <button className="ghost small" id="plIcs" disabled={!it.deadline} onClick={async () => { const r = await documentoPlazo.calendario(it.id); if (!r.ok) toast(r.error || '', 4000); else if (r.data) toast('Recordatorio creado: ábrelo para agregarlo a tu calendario.', 4000); }}><Icono nombre="calendar" tam={14} /> Agregar al calendario</button>
          <button className="ghost small" id="plOpen" onClick={() => verDoc(it)}><Icono nombre="file" tam={14} /> Ver documento</button>
          {inteligente
            ? <button className="ghost small" id="plRe" disabled={ocupado} onClick={generar}><Icono nombre="sparkle" tam={14} /> Actualizar informe <small className="tk-cost">1 token</small></button>
            : <button className="ghost small" id="plBasic" onClick={() => plazoLeer(it.id)}><Icono nombre="rotateR" tam={14} /> Volver a leer</button>}
          <button className="ghost small" id="plDel" onClick={() => quitar(it)}>Quitar de la lista</button>
        </div>
      </div>
    );
  };

  return (
    <div className="bulk plz">
      <div className="ops-head">
        <div><h2>Plazos y vencimientos</h2><span className="muted small">Tus contratos ordenados por su fecha clave. Cada documento trae su informe básico gratis; el informe inteligente con IA te sugiere qué hacer y redacta el documento.</span></div>
        <div className="ops-head-r">
          <button className="secondary small with-ic" id="plPf" title="Traer los contratos firmados de Mis operaciones" disabled={!!trayendo} onClick={traer}><Icono nombre="rotateR" tam={15} /><span>{trayendo || 'Traer de Portalfirma'}</span></button>
          <button className="secondary small with-ic" id="plDrive" onClick={() => abrirDrive('plazos')}><Icono nombre="drive" tam={15} /><span>Desde Google Drive</span></button>
          <button className="primary small with-ic" id="plAdd" onClick={async () => avisar(plazosAplicar(await documentoPlazo.elegir()), 6000)}><Icono nombre="plus" tam={15} /><span>Agregar documentos</span></button>
        </div>
      </div>
      <div className="plz-legend">
        <span className="ops-chip bad">Rojo · 30 días o menos</span><span className="ops-chip wait">Amarillo · hasta 90 días</span><span className="ops-chip ok">Verde · más de 90 días o indefinido</span>
        <span className="plz-run" id="plRun">{leyendo && <><i className="bk-spin" /> Leyendo… quedan {items.filter((x) => x.status === 'pending').length}</>}</span>
      </div>
      <div className="plz-grid">
        <div className="bk-table plz-table" id="plTable">
          {lista.length ? <>
            <div className="bk-row plz-row bk-th"><span /><span>Documento</span><span>Fecha clave</span><span>Sugerencia</span><span /></div>
            {lista.map((d) => {
              const [l, c] = semaforo(d); const a = lectura(d); const s = d.analysis?.acciones?.[0];
              const partes = contratos(a).flatMap((x) => x.partes || []).map((p) => p.nombre).filter(Boolean); const n = contratos(a).length;
              return (
                <div key={d.id} className={`bk-row plz-row ${sel === d.id ? 'sel' : ''}`} data-id={d.id} onClick={() => plazoElegir(d.id)}>
                  <span className={`plz-dot ${c}`} />
                  <span className="bk-doc"><b>{a?.tipo || d.name.replace(/\.pdf$/i, '')}{n > 1 && <> <small className="plz-n">{n} contratos</small></>}</b><small>{d.name}{partes.length ? ' · ' + partes.slice(0, 2).join(' / ') : ''}</small></span>
                  <span>{d.status === 'done' ? <><b className={`plz-when ${c}`}>{l}</b><small className="muted">{d.deadlineLabel || ''}{d.deadline ? ' · ' + fecha(d.deadline) : ''}</small></>
                    : d.status === 'reading' ? <span className="ops-chip run"><i className="bk-spin" />Leyendo</span>
                      : d.status === 'error' ? <><span className="ops-chip bad">Error</span><small className="bk-err">{d.error || ''}</small></> : <span className="ops-chip muted">Por leer</span>}</span>
                  <span className="plz-sug">
                    {s ? <><b>{ACCION[s.tipo] || s.titulo}</b><small>{s.titulo}</small></> : d.status === 'done' && <small className="muted plz-basic">Informe básico</small>}
                    {inteligentes.includes(d.id) && <small className="muted"><i className="bk-spin" /> Preparando informe inteligente…</small>}
                    {d.done && <small className="ok-t"><Icono nombre="check" tam={12} /> {d.done}</small>}
                  </span>
                  <span><Icono nombre="chevR" tam={15} /></span>
                </div>
              );
            })}
          </> : <div className="ops-empty"><div><Icono nombre="calendar" tam={34} /><p>Agrega tus contratos (PDF o Word) para ver sus vencimientos.<br /><small>También puedes traerlos desde Google Drive.</small></p></div></div>}
        </div>
        <div className="ops-detail plz-detail" id="plDetail"><Detalle /></div>
      </div>
    </div>
  );
}
