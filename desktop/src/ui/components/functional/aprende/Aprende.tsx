// «Aprende a usar PortalFirma Asset»: enseña la app panel por panel. Cada lección explica para qué sirve
// el panel, los pasos para usarlo y consejos; «Verlo en vivo» abre el panel y recorre sus partes con globos.
// Hecha con el kit: Layout (fondo, cabecera con ilustración y «volver»), Boton, Card y Badge.
// Los id (#apStart, #apBack, #apVivo, #apDone, #apFin), data-l, data-go y las clases ap-* los usan las pruebas.
import Icono from '../../ui/Icono';
import Layout, { MIGA_INICIO } from '../../ui/Layout';
import Boton from '../../ui/Boton';
import Card from '../../ui/Card';
import Badge from '../../ui/Badge';
import { LECCIONES } from './lecciones';
import { iniciarRecorrido } from '../ayuda/acciones';
import { useAprende } from '../../../store/hooks/useAprende.hook';
import { toast } from '../../../utils/app';
import { cx } from '../../../utils/cx';

const ILUSTRACION = { imagen: 'img/formas/etapa.svg' };

function Lecciones() {
  const { hechos, aprendeLeccion } = useAprende();
  const n = LECCIONES.filter((l) => hechos[l.id]).length;
  const siguiente = (LECCIONES.find((l) => !hechos[l.id]) || LECCIONES[0]).id;
  return (
    <Layout
      titulo="Aprende a usar PortalFirma Asset"
      miga="Aprende"
      ilustracion={ILUSTRACION}
      subtitulo={<>
        Panel por panel: para qué sirve, cómo se usa y un recorrido guiado en vivo. Te toma unos 10 minutos.
        <div className="ap-prog"><span style={{ width: `${Math.round(n / LECCIONES.length * 100)}%` }} /></div>
        <small>{n} de {LECCIONES.length} lecciones completadas</small>
      </>}
      acciones={<Boton id="apStart" icono="compass" onClick={() => aprendeLeccion(siguiente)}>{n ? 'Seguir donde quedé' : 'Empezar'}</Boton>}
    >
      <div className="ap-grid" style={{ marginTop: 0 }}>
        {LECCIONES.map((l, i) => (
          <button key={l.id} className={cx('ap-card', hechos[l.id] && 'ok')} data-l={l.id} onClick={() => aprendeLeccion(l.id)}>
            <span className="ap-n">{hechos[l.id] ? <Icono nombre="check" tam={14} /> : i + 1}</span>
            <span className="ap-ic"><Icono nombre={l.ic} tam={22} /></span>
            <b>{l.t}</b><small>{l.sub}</small>
          </button>
        ))}
      </div>
    </Layout>
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
    <Layout
      className="ap-lec"
      migas={[MIGA_INICIO, { texto: 'Aprende', alTocar: () => aprendeLeccion(null), id: 'apBack' }, { texto: l.t }]}
      ilustracion={ILUSTRACION}
      sobretitulo={l.sub}
      titulo={l.t}
      subtitulo={<span className="tw:block tw:max-w-[620px] tw:leading-relaxed">{l.para}</span>}
      acciones={<Badge tono="lavanda">Lección {i + 1} de {LECCIONES.length}</Badge>}
    >
      <div className="im-fcols">
        <Card titulo="Paso a paso"><ol className="ap-pasos">{l.pasos.map((p, k) => <li key={k}>{p}</li>)}</ol></Card>
        <div className="tw:flex tw:flex-col tw:gap-4">
          <Card tono="lavanda" titulo={<span className="tw:flex tw:items-center tw:gap-1.5"><Icono nombre="compass" tam={16} /> Verlo en vivo</span>}>
            <p className="tw:mt-0 tw:mb-3 tw:text-sm tw:leading-relaxed tw:opacity-80">Abrimos el panel y te mostramos cada parte con globos. Avanza con «Siguiente» o con la tecla →.</p>
            <Boton id="apVivo" onClick={enVivo}>Empezar el recorrido</Boton>
          </Card>
          <Card titulo="Consejos"><ul className="ap-tips">{l.tips.map((t, k) => <li key={k}>{t}</li>)}</ul></Card>
          <label className="ap-done"><input type="checkbox" id="apDone" checked={!!hechos[l.id]} onChange={(e) => aprendeMarcar(l.id, e.target.checked)} /> Ya lo aprendí</label>
        </div>
      </div>
      <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
        {prev && <Boton variante="secundario" icono="chevL" data-go={prev.id} onClick={() => ir(prev.id)}>{prev.t}</Boton>}
        <span className="tw:flex-1" />
        {next
          ? <Boton iconoDerecha="chevR" data-go={next.id} onClick={() => ir(next.id)}>Siguiente: {next.t}</Boton>
          : <Boton id="apFin" onClick={terminar}>Terminar</Boton>}
      </div>
    </Layout>
  );
}

export default function Aprende() {
  const { leccion } = useAprende();
  const existe = !!leccion && LECCIONES.some((l) => l.id === leccion);
  return existe ? <Leccion key={leccion} id={leccion!} /> : <Lecciones />;
}
