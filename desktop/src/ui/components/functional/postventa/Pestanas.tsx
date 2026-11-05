// Pestañas «Unidades» y «Contratistas» de Postventa: tablas simples, con importar la planilla y agregar.
// Con el kit: Card, Tabla, Boton y EstadoVacio. Los id pvPlant, pvImp, pvCtN y la clase pv-unidades (la tabla de
// cada proyecto) los usa test/postventa-e2e.js.
import { usePostventa } from '../../../store/hooks/usePostventa.hook';
import { nuevoContratista, toast } from '../../../utils/app';
import Card from '../../ui/Card';
import Tabla from '../../ui/Tabla';
import Boton from '../../ui/Boton';
import EstadoVacio from '../../ui/EstadoVacio';
import { fmt } from './comun';
import type { IPvContratista, IPvUnidad } from '../../../store/interfaces/postventa.interface';

const aviso = (r: { mensaje?: string; error?: string }, ms = 6000) => { if (r.error) toast(r.error, 9000); else if (r.mensaje) toast(r.mensaje, ms); };

const COL_UNIDADES = [
  { clave: 'unidad', titulo: 'Unidad', render: (u: IPvUnidad) => <b className="tw:font-semibold">{u.torre ? u.torre + '-' : ''}{u.numero}</b> },
  {
    clave: 'propietario', titulo: 'Propietario',
    render: (u: IPvUnidad) => <>{u.propietario?.nombre || ''}<small className="tw:block tw:text-xs tw:text-muted">{u.propietario?.rut || ''}</small></>,
  },
  { clave: 'celular', titulo: 'Celular', render: (u: IPvUnidad) => u.propietario?.telefono || '—' },
  { clave: 'dom', titulo: 'Recepción DOM', render: (u: IPvUnidad) => <span className="tw:tabular-nums">{fmt(u.recepcionDOM)}</span> },
  { clave: 'cbr', titulo: 'Inscripción CBR', render: (u: IPvUnidad) => <span className="tw:tabular-nums">{fmt(u.inscripcionCBR)}</span> },
];

const COL_CONTRATISTAS = [
  { clave: 'nombre', titulo: 'Nombre', render: (c: IPvContratista) => <b className="tw:font-semibold">{c.nombre}</b> },
  { clave: 'especialidad', titulo: 'Especialidad', render: (c: IPvContratista) => c.especialidad || '' },
  { clave: 'telefono', titulo: 'Celular', render: (c: IPvContratista) => c.telefono || '' },
];

export function Unidades() {
  const { proyectos, unidades, unidadesPlantilla, unidadesImportar } = usePostventa();
  return (
    <>
      <Card
        titulo="Unidades entregadas"
        accion={<span className="tw:flex tw:flex-wrap tw:gap-2">
          <Boton variante="secundario" tamano="sm" icono="download" id="pvPlant" onClick={async () => aviso(await unidadesPlantilla(), 3000)}>Plantilla Excel</Boton>
          <Boton tamano="sm" icono="upload" id="pvImp" onClick={async () => aviso(await unidadesImportar())}>Importar planilla</Boton>
        </span>}
      >
        <p className="tw:m-0 tw:text-[13px] tw:text-muted tw:leading-relaxed">Carga la planilla Excel (un dato por celda) con proyecto, torre, número, propietario, RUT, celular y las fechas de <b>recepción municipal</b> y de <b>inscripción en el CBR</b>: con ellas se calcula la garantía de cada reclamo.</p>
        {proyectos && !proyectos.length && <EstadoVacio icono="building" texto="Aún no hay unidades. Descarga la plantilla, complétala y súbela." className="tw:pb-4" />}
      </Card>
      {proyectos?.map((p) => {
        const l = unidades.filter((u) => u.proyectoId === p.id);
        return (
          <Card key={p.id} titulo={p.nombre} subtitulo={`${l.length} ${l.length === 1 ? 'unidad' : 'unidades'}`} relleno={false}>
            <Tabla className="pv-unidades" compacta columnas={COL_UNIDADES} filas={l} claveFila={(u) => u.id} />
          </Card>
        );
      })}
    </>
  );
}

export function Contratistas() {
  const { contratistas: cs, contratistasGetAll } = usePostventa();
  const nuevo = async () => { if (await nuevoContratista()) contratistasGetAll(); };
  return (
    <Card titulo="Contratistas" relleno={false}
      accion={<Boton tamano="sm" icono="plus" id="pvCtN" onClick={nuevo}>Nuevo</Boton>}>
      {cs && (cs.length
        ? <Tabla compacta columnas={COL_CONTRATISTAS} filas={cs} claveFila={(c) => c.id} />
        : <EstadoVacio icono="users" texto="Agrega a los maestros y empresas que hacen las reparaciones." />)}
    </Card>
  );
}
