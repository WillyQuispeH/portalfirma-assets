// Panel interno de Portalfirma: aprendizaje de reglas para detectar materias (dentro de Firmas presenciales,
// solo administradores o modo de prueba).
// Casos corregidos por los clientes → la IA propone reglas → una persona aprueba o descarta →
// las reglas aprobadas se ejecutan sin IA en todas las apps (publicadas desde el servidor).
// Los id y data-* (#rgProponer, #rgGo, [data-pid], [data-aprobar], #rgReglas [data-rid]…) los usan las pruebas;
// los estilos son las clases rg-* de styles.css y Tailwind (tw:, ver estilos.ts). es-sw la usan las pruebas.
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import Icono from '../../../ui/Icono';
import { useRegla } from '../../../../store/hooks/useRegla.hook';
import { abrirModal, cerrarModal } from '../../../../utils/modal';
import { motor } from '../../../../utils/escrituras';
import { toast } from '../../../../utils/app';
import { ENCABEZADO, ENCABEZADO_H3, SW, SW_INPUT, SW_RIEL, seccion } from './estilos';
import type { IReglaBase, IReglaPropuesta, IReglaPrueba, TReglaTipo } from '../../../../store/interfaces/regla.interface';

const TIPO: Record<TReglaTipo, [string, string]> = { acto: ['Acto nuevo', '#3f4fe6'], materia: ['Materia por título', '#0d9488'], excepcion: ['Excepción', '#b26a00'] };
const TRAMITE: Record<string, string> = { escritura: 'Escritura', protocolizacion: 'Protocolización', reduccion: 'Reducción' };
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
const matLbl = (v?: string | null): string => motor().MT.BY[v || '']?.label || v || '—';
const aviso = (r: { mensaje?: string; error?: string }) => { if (r.error) toast(r.error, 5000); else if (r.mensaje) toast(r.mensaje); };

function Chip({ color, children }: { color: string; children: ReactNode }) {
  return <span className="ops-chip" style={{ '--c': color } as CSSProperties}>{children}</span>;
}

// A qué apunta la regla
function Objetivo({ r }: { r: IReglaBase }) {
  if (r.tipo === 'acto') {
    const nota = !r.codigo ? '(informativo, fuera de la planilla)' : matLbl(r.codigo) === r.nombre ? '(de la planilla)' : `(${matLbl(r.codigo)})`;
    return <b>{r.nombre} <small className="muted">{nota}</small></b>;
  }
  if (r.tipo === 'materia') return <b>{r.campo === 'cuerpo' ? 'Texto' : 'Título'} → {matLbl(r.materia)}</b>;
  return <b>No es «{r.acto}» cuando aparece…</b>;
}

// Resultado de probar la regla contra los casos guardados
function Prueba({ ev }: { ev?: IReglaPrueba | { error: string } }) {
  if (!ev) return null;
  if ('error' in ev && ev.error) return <div className="rg-ev bad"><Icono nombre="alert" tam={13} /> {ev.error}</div>;
  const p = ev as IReglaPrueba;
  const ok = p.positivos ? p.aciertos.length / p.positivos : 0;
  const n = p.otros.length;
  return (
    <div className={`rg-ev ${n ? 'warn' : ok >= 1 ? 'ok' : ''}`}><Icono nombre={n ? 'alert' : 'check'} tam={13} />
      {' '}Detecta {p.aciertos.length} de {p.positivos} {p.positivos === 1 ? 'caso que lo requiere' : 'casos que lo requieren'}
      {n ? <> · <b>también coincide en {n} {n === 1 ? 'caso' : 'casos'} distinto{n === 1 ? '' : 's'}</b> (revisa que no sea un falso positivo)</> : ' · sin coincidencias en otros casos'}
      {' '}<span className="muted">· {p.total} casos revisados</span></div>
  );
}

function Propuesta({ p, alCambiar }: { p: IReglaPropuesta; alCambiar: () => Promise<void> }) {
  const { reglaProbar, reglaDecidir } = useRegla();
  const [patron, setPatron] = useState(p.patron);
  const [prueba, setPrueba] = useState(p.prueba);
  const decidir = async (accion: 'aprobar' | 'descartar') => {
    const r = await reglaDecidir(p.id, accion, accion === 'aprobar' ? patron.trim() : undefined);
    if (r.error) return aviso(r);
    await alCambiar(); aviso(r);
  };
  return (
    <div className={`rg-card ${p.estado === 'invalida' ? 'bad' : ''}`} data-pid={p.id}>
      <div className="rg-top"><Chip color={TIPO[p.tipo][1]}>{TIPO[p.tipo][0]}</Chip><Objetivo r={p} />{p.principal && <Chip color="#c0362c">Cambia la materia principal</Chip>}</div>
      <p className="small">{p.explicacion || ''}</p>
      <label className="rg-pat"><span className="muted small">Patrón (texto en minúsculas y sin tildes)</span>
        <input className="tw:w-full tw:min-w-[150px] tw:m-0 tw:py-[7px] tw:px-2.5 tw:font-[ui-monospace,Menlo,Consolas,monospace] tw:text-[12px]" data-pat value={patron} spellCheck={false} onChange={(e) => setPatron(e.target.value)} /></label>
      <div data-ev><Prueba ev={prueba} /></div>
      <div className="row-end">
        <button className="ghost small" data-probar onClick={async () => setPrueba(await reglaProbar(p, patron.trim()))}>Probar</button>
        <button className="ghost small" data-descartar onClick={() => decidir('descartar')}>Descartar</button>
        {p.estado !== 'invalida' && <button className="primary small" data-aprobar onClick={() => decidir('aprobar')}>Aprobar</button>}
      </div>
    </div>
  );
}

function ConfirmarPropuesta({ casos, alProponer }: { casos: number; alProponer: () => Promise<void> }) {
  const [ocupado, setOcupado] = useState(false);
  const n = Math.min(casos, 80);
  return <>
    <h3>Proponer reglas con IA</h3>
    <p className="small">Se enviarán <b>{n} {casos === 1 ? 'caso' : 'casos'}</b> (sin RUT, correos ni teléfonos) al modelo de IA más económico de la cuenta. La IA solo propone: nada se aplica hasta que lo apruebes.</p>
    <p className="muted small">El costo va por cuenta de Portalfirma; no descuenta tokens del asistente.</p>
    <div className="row-end"><button className="ghost" id="rgNo" onClick={cerrarModal}>Cancelar</button>
      <button className="primary" id="rgGo" disabled={ocupado} onClick={async () => { setOcupado(true); await alProponer(); }}>{ocupado ? 'Analizando…' : 'Proponer'}</button></div>
  </>;
}

function ConfirmarEliminar({ alEliminar }: { alEliminar: () => void }) {
  return <>
    <h3>¿Eliminar la regla?</h3>
    <p className="muted small">Deja de aplicarse en este computador. Si ya se publicó, hay que publicar de nuevo.</p>
    <div className="row-end"><button className="ghost" id="rgNo" onClick={cerrarModal}>Cancelar</button>
      <button className="primary" id="rgSi" onClick={() => { cerrarModal(); alEliminar(); }}>Eliminar</button></div>
  </>;
}

// `alCambiar`: vuelve a cargar las reglas en el motor de Firmas presenciales (escrituraRecargarReglas)
export default function Reglas({ alCambiar }: { alCambiar: () => Promise<void> }) {
  const { casos: C, reglas: R, reglaCargar, reglaActivar, reglaEliminar, reglaBorrarCaso, reglaProponer, reglaExportar } = useRegla();
  const [listo, setListo] = useState(false);
  useEffect(() => { reglaCargar().then(() => setListo(true)); }, [reglaCargar]);
  if (!listo || !R) return <div className="muted small tw:p-10">Cargando…</div>;

  const MT = motor().MT;
  const n = {
    mat: C.filter((c) => c.materiaAuto && c.materiaFinal && c.materiaAuto !== c.materiaFinal).length,
    desc: C.reduce((s, c) => s + c.descartados.length, 0), agr: C.reduce((s, c) => s + c.agregados.length, 0),
  };
  const aprobadas = [
    ...R.actos.map((x) => ({ ...x, tipo: 'acto' as const })), ...R.materias.map((x) => ({ ...x, tipo: 'materia' as const })),
    ...(R.excepciones || []).map((x) => ({ ...x, tipo: 'excepcion' as const })),
  ];
  const activas = aprobadas.filter((x) => x.activo !== false).length;
  // señales: actos que los clientes descartan seguido (posible regla demasiado amplia)
  const cuenta: Record<string, number> = {}; C.forEach((c) => c.descartados.forEach((x) => { cuenta[x.nombre] = (cuenta[x.nombre] || 0) + 1; }));
  const senales = Object.entries(cuenta).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const props = R.propuestas || [];

  const proponer = () => abrirModal(<ConfirmarPropuesta casos={C.length} alProponer={async () => {
    const r = await reglaProponer({ actos: MT.actosNombres(), materias: MT.CATALOGO.filter((x: { value: string }) => x.value !== 'otro').map((x: { value: string; label: string }) => ({ value: x.value, label: x.label })) });
    cerrarModal(); aviso(r);
  }} />);
  const activar = async (id: string, activo: boolean) => { const r = await reglaActivar(id, activo); if (r.error) return aviso(r); await alCambiar(); aviso(r); };
  const eliminar = (id: string) => abrirModal(<ConfirmarEliminar alEliminar={async () => { const r = await reglaEliminar(id); if (r.error) return aviso(r); await alCambiar(); }} />);

  return <>
    <div className={ENCABEZADO}><div><h3 className={ENCABEZADO_H3}>Reglas de detección</h3><div className="muted small">Interno Portalfirma. La IA propone reglas a partir de los casos que los clientes corrigieron; una persona las aprueba y desde ahí funcionan <b>sin IA</b>.{R.version ? ` Versión ${R.version}.` : ''}</div></div>
      <div className="ops-head-r">
        <button className="ghost small with-ic" id="rgExport" onClick={async () => aviso(await reglaExportar())}><Icono nombre="fileOut" tam={14} /><span>Exportar</span></button>
        <button className="primary small with-ic" id="rgProponer" disabled={!C.length} onClick={proponer}><Icono nombre="sparkle" tam={14} /><span>Proponer reglas con IA</span></button>
      </div></div>
    <div className="rg-stats">
      <div><b id="rgNCasos">{C.length}</b><small>casos corregidos</small></div>
      <div><b>{n.mat}</b><small>materias cambiadas</small></div>
      <div><b>{n.desc}</b><small>actos descartados</small></div>
      <div><b>{n.agr}</b><small>actos agregados</small></div>
      <div><b id="rgNActivas">{activas}</b><small>reglas activas · {MT.actosRevisados()} actos revisados</small></div>
    </div>
    {senales.length > 0 && <div className="rg-sig small"><Icono nombre="alert" tam={13} /> Más descartados por los clientes: {senales.map(([k, v], i) => <span key={k}>{i ? ' · ' : ''}<b>{k}</b> ({v})</span>)}. Si se repite, conviene una excepción.</div>}

    <div className={seccion()}><h3>Propuestas por revisar</h3><small className="muted">{props.length}</small></div>
    <div className="rg-list" id="rgProps">
      {props.length ? props.map((p) => <Propuesta key={p.id} p={p} alCambiar={alCambiar} />)
        : <p className="muted small">{C.length ? 'No hay propuestas pendientes. Pide nuevas a la IA cuando se junten más casos.' : 'Aún no hay casos. Se juntan solos cada vez que un cliente cambia la materia, descarta un acto oculto o agrega uno que faltaba.'}</p>}
    </div>

    <div className={seccion()}><h3>Reglas aprobadas</h3><small className="muted">{aprobadas.length}</small></div>
    <div className="rg-list" id="rgReglas">
      {aprobadas.length ? aprobadas.map((r) => (
        <div className={`rg-card sm ${r.activo === false ? 'off' : ''}`} data-rid={r.id} key={r.id}>
          <div className="rg-top"><Chip color={TIPO[r.tipo][1]}>{TIPO[r.tipo][0]}</Chip><Objetivo r={r} /><small className="muted">Aprobada {fecha(r.aprobada)}</small>
            <label className={`es-sw ${SW} tw:ml-1`} title="Activa"><input type="checkbox" className={SW_INPUT} data-activa checked={r.activo !== false} onChange={(e) => activar(r.id, e.target.checked)} /><span className={SW_RIEL} /></label>
            <button className="ghost small" data-eliminar title="Eliminar" onClick={() => eliminar(r.id)}><Icono nombre="x" tam={13} /></button></div>
          <code className="rg-code">{r.patron}</code>
        </div>
      )) : <p className="muted small">Todavía no hay reglas aprobadas.</p>}
    </div>

    <div className={seccion()}><h3>Casos recogidos</h3><small className="muted">sin RUT, correos ni teléfonos</small></div>
    <div className="rg-list" id="rgCasos">
      {C.length ? C.slice(0, 40).map((c) => (
        <div className="rg-caso" data-cid={c.id} key={c.id}>
          <div><b>{c.titulo || 'Sin título'}</b><small className="muted">{TRAMITE[c.tramite] || ''} · {fecha(c.creado)}</small><span className="small"><ResumenCaso c={c} /></span></div>
          <button className="ghost small" data-borrar title="Borrar caso" onClick={() => reglaBorrarCaso(c.id)}><Icono nombre="x" tam={13} /></button>
        </div>
      )) : <p className="muted small">—</p>}
    </div>
  </>;
}

// Qué corrigió el cliente en el caso
function ResumenCaso({ c }: { c: { materiaAuto: string | null; materiaFinal: string | null; descartados: { nombre: string }[]; agregados: { nombre: string; frase: string }[] } }) {
  const p: ReactNode[] = [];
  if (c.materiaAuto && c.materiaFinal && c.materiaAuto !== c.materiaFinal) p.push(<>Materia: {matLbl(c.materiaAuto)} → <b>{matLbl(c.materiaFinal)}</b></>);
  c.descartados.forEach((x) => p.push(<>Descartó <b>{x.nombre}</b></>));
  c.agregados.forEach((x) => p.push(<>Agregó <b>{x.nombre}</b> «{x.frase}»</>));
  return <>{p.map((x, i) => <span key={i}>{i ? ' · ' : ''}{x}</span>)}</>;
}
