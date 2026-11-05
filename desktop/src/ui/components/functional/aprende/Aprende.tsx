// «Aprende a usar PortalFirma Asset»: enseña la app panel por panel. Cada lección explica para qué sirve
// el panel, los pasos para usarlo y consejos; «Verlo en vivo» abre el panel y recorre sus partes con globos.
// Los id (#apStart, #apBack, #apVivo, #apDone, #apFin), data-l, data-go y las clases ap-* los usan las pruebas.
import Icono from '../../ui/Icono';
import { LECCIONES } from './lecciones';
import { iniciarRecorrido } from '../ayuda/acciones';
import { useAprende } from '../../../store/hooks/useAprende.hook';
import { toast } from '../../../utils/app';
import { cx } from '../../../utils/cx';

function Lecciones() {
  const { hechos, aprendeLeccion } = useAprende();
  const n = LECCIONES.filter((l) => hechos[l.id]).length;
  const siguiente = (LECCIONES.find((l) => !hechos[l.id]) || LECCIONES[0]).id;
  return (
    <div className="im-wrap">
      <div className="im-head fx-aprende">
        <div>
          <h1>Aprende a usar PortalFirma Asset</h1>
          <p className="muted">Panel por panel: para qué sirve, cómo se usa y un recorrido guiado en vivo. Te toma unos 10 minutos.</p>
          <div className="ap-prog"><span style={{ width: `${Math.round(n / LECCIONES.length * 100)}%` }} /></div>
          <small className="muted">{n} de {LECCIONES.length} lecciones completadas</small>
        </div>
        <button className="primary" id="apStart" onClick={() => aprendeLeccion(siguiente)}><Icono nombre="compass" tam={15} /> {n ? 'Seguir donde quedé' : 'Empezar'}</button>
      </div>
      <div className="ap-grid">
        {LECCIONES.map((l, i) => (
          <button key={l.id} className={cx('ap-card', hechos[l.id] && 'ok')} data-l={l.id} onClick={() => aprendeLeccion(l.id)}>
            <span className="ap-n">{hechos[l.id] ? <Icono nombre="check" tam={14} /> : i + 1}</span>
            <span className="ap-ic"><Icono nombre={l.ic} tam={22} /></span>
            <b>{l.t}</b><small>{l.sub}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function Leccion({ id }: { id: string }) {
  const { hechos, aprendeLeccion, aprendeMarcar } = useAprende();
  const i = LECCIONES.findIndex((x) => x.id === id); const l = LECCIONES[i];
  const prev = LECCIONES[i - 1], next = LECCIONES[i + 1];
  const ir = (otra: string) => { aprendeMarcar(l.id, true); aprendeLeccion(otra); };
  const terminar = () => { aprendeMarcar(l.id, true); toast('¡Listo! Puedes volver a estas lecciones desde Ayuda → Aprende.', 5000); aprendeLeccion(null); };
  const enVivo = async () => { aprendeMarcar(l.id, true); const ok = await l.ir(); if (ok) setTimeout(() => iniciarRecorrido(l.tour), 350); };
  return (
    <div className="im-wrap ap-lec">
      <div className="im-fh">
        <button className="ghost" id="apBack" onClick={() => aprendeLeccion(null)}><Icono nombre="chevL" tam={16} /> Todas las lecciones</button>
        <span className="spacer" />
        <small className="muted">Lección {i + 1} de {LECCIONES.length}</small>
      </div>
      <div className="ap-hero">
        <span className="ap-ic big"><Icono nombre={l.ic} tam={30} /></span>
        <div><small className="im-code">{l.sub}</small><h1>{l.t}</h1><p>{l.para}</p></div>
      </div>
      <div className="im-fcols">
        <div className="im-box"><h3>Paso a paso</h3><ol className="ap-pasos">{l.pasos.map((p, k) => <li key={k}>{p}</li>)}</ol></div>
        <div>
          <div className="im-box ap-vivo">
            <h3><Icono nombre="compass" tam={16} /> Verlo en vivo</h3>
            <p className="muted">Abrimos el panel y te mostramos cada parte con globos. Avanza con «Siguiente» o con la tecla →.</p>
            <button className="primary" id="apVivo" onClick={enVivo}>Empezar el recorrido</button>
          </div>
          <div className="im-box"><h3>Consejos</h3><ul className="ap-tips">{l.tips.map((t, k) => <li key={k}>{t}</li>)}</ul></div>
          <label className="ap-done"><input type="checkbox" id="apDone" checked={!!hechos[l.id]} onChange={(e) => aprendeMarcar(l.id, e.target.checked)} /> Ya lo aprendí</label>
        </div>
      </div>
      <div className="actions">
        {prev && <button className="secondary" data-go={prev.id} onClick={() => ir(prev.id)}><Icono nombre="chevL" tam={15} /> {prev.t}</button>}
        <span className="spacer" />
        {next
          ? <button className="primary" data-go={next.id} onClick={() => ir(next.id)}>Siguiente: {next.t} <Icono nombre="chevR" tam={15} /></button>
          : <button className="primary" id="apFin" onClick={terminar}>Terminar</button>}
      </div>
    </div>
  );
}

export default function Aprende() {
  const { leccion } = useAprende();
  const existe = !!leccion && LECCIONES.some((l) => l.id === leccion);
  return existe ? <Leccion key={leccion} id={leccion!} /> : <Lecciones />;
}
