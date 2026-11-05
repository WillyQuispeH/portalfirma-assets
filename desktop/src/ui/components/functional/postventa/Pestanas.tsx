// Pestañas «Unidades» y «Contratistas» de Postventa: tablas simples, con importar la planilla y agregar.
import Icono from '../../ui/Icono';
import { usePostventa } from '../../../store/hooks/usePostventa.hook';
import { nuevoContratista, toast } from '../../../utils/app';
import { fmt } from './comun';

const aviso = (r: { mensaje?: string; error?: string }, ms = 6000) => { if (r.error) toast(r.error, 9000); else if (r.mensaje) toast(r.mensaje, ms); };

export function Unidades() {
  const { proyectos, unidades, unidadesPlantilla, unidadesImportar } = usePostventa();
  return (
    <div className="im-box">
      <div className="pv-uh">
        <div>
          <h3>Unidades entregadas</h3>
          <p className="muted small">Carga la planilla Excel (un dato por celda) con proyecto, torre, número, propietario, RUT, celular y las fechas de <b>recepción municipal</b> y de <b>inscripción en el CBR</b>: con ellas se calcula la garantía de cada reclamo.</p>
        </div>
        <span className="ga-inl">
          <button className="ghost small" id="pvPlant" onClick={async () => aviso(await unidadesPlantilla(), 3000)}><Icono nombre="download" tam={14} /> Plantilla Excel</button>
          <button className="primary small" id="pvImp" onClick={async () => aviso(await unidadesImportar())}><Icono nombre="upload" tam={14} /> Importar planilla</button>
        </span>
      </div>
      {proyectos && (proyectos.length ? proyectos.map((p) => {
        const l = unidades.filter((u) => u.proyectoId === p.id);
        return (
          <div key={p.id}>
            <h4 className="pv-sub">{p.nombre} <i className="muted">({l.length})</i></h4>
            <div className="pv-tbl">
              <table>
                <thead><tr><th>Unidad</th><th>Propietario</th><th>Celular</th><th>Recepción DOM</th><th>Inscripción CBR</th></tr></thead>
                <tbody>{l.map((u) => (
                  <tr key={u.id}>
                    <td>{u.torre ? u.torre + '-' : ''}{u.numero}</td>
                    <td>{u.propietario?.nombre || ''}<small>{u.propietario?.rut || ''}</small></td>
                    <td>{u.propietario?.telefono || '—'}</td>
                    <td>{fmt(u.recepcionDOM)}</td>
                    <td>{fmt(u.inscripcionCBR)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        );
      }) : <p className="muted pv-vac">Aún no hay unidades. Descarga la plantilla, complétala y súbela.</p>)}
    </div>
  );
}

export function Contratistas() {
  const { contratistas: cs, contratistasGetAll } = usePostventa();
  return (
    <div className="im-box">
      <div className="pv-uh">
        <h3>Contratistas</h3>
        <button className="primary small" id="pvCtN" onClick={async () => { if (await nuevoContratista()) contratistasGetAll(); }}><Icono nombre="plus" tam={14} /> Nuevo</button>
      </div>
      {cs && (cs.length ? (
        <div className="pv-tbl">
          <table>
            <thead><tr><th>Nombre</th><th>Especialidad</th><th>Celular</th></tr></thead>
            <tbody>{cs.map((c) => <tr key={c.id}><td>{c.nombre}</td><td>{c.especialidad || ''}</td><td>{c.telefono || ''}</td></tr>)}</tbody>
          </table>
        </div>
      ) : <p className="muted pv-vac">Agrega a los maestros y empresas que hacen las reparaciones.</p>)}
    </div>
  );
}
