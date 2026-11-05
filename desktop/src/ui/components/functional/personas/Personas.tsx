// Personas: el CRM, un registro por RUT, con búsqueda por nombre, RUT o correo y filtro por rol (con cuántas hay
// de cada uno). Hecha con el kit: Layout (cabecera y barra), Boton, Buscador, Tabs, Card, Tabla, Avatar, Badge y EstadoVacio.
// «Nueva persona» abre FormPersona (controlador.tsx); el detalle, FichaPersona (Inmo.abrirPersona en inmo.js).
// Los id cQ, cRol (con data-r en cada rol), cNew, cTabla y data-c en cada fila los usan las pruebas e2e y Aprende.
import { useEffect, useMemo } from 'react';
import { usePersonas } from '../../../store/hooks/usePersonas.hook';
import { abrirPersona } from '../../../utils/app';
import Buscador from '../../ui/Buscador';
import Layout from '../../ui/Layout';
import Boton from '../../ui/Boton';
import Tabs, { type TTabOpcion } from '../../ui/Tabs';
import Card from '../../ui/Card';
import Tabla from '../../ui/Tabla';
import Avatar from '../../ui/Avatar';
import Badge from '../../ui/Badge';
import EstadoVacio from '../../ui/EstadoVacio';
import { ROL } from '../cartera/catalogos';
import { abrirFormPersona } from './controlador';
import type { IPersona, TPersonaRol } from '../../../store/interfaces/persona.interface';
import type { TTono } from '../../ui/tonos';

// color de cada rol (el mismo en la lista, la ficha y los filtros)
export const TONO_ROL: Record<TPersonaRol, TTono> = {
  propietario: 'lavanda', arrendatario: 'azul', comprador: 'verde', codeudor: 'amarillo', interesado: 'durazno', proveedor: 'gris',
};

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function Personas() {
  const { personas, propiedades, cargado, error, filtros: f, personasGetAll, personasSetFiltros } = usePersonas();

  useEffect(() => { personasGetAll(); }, [personasGetAll]);

  // cuántas propiedades tiene vinculadas cada persona
  const cuenta = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of propiedades) for (const id of new Set((p.vinculos || []).map((v) => v.personaId))) m.set(id, (m.get(id) || 0) + 1);
    return m;
  }, [propiedades]);

  // cuántas hay de cada rol (para los filtros)
  const porRol = useMemo(() => {
    const m: Partial<Record<TPersonaRol, number>> = {};
    for (const c of personas) for (const r of c.roles) m[r] = (m[r] || 0) + 1;
    return m;
  }, [personas]);
  const roles: TTabOpcion<TPersonaRol | ''>[] = [
    ['', 'Todas', personas.length],
    ...(Object.entries(ROL) as [TPersonaRol, string][]).map(([k, t]): TTabOpcion<TPersonaRol> => [k, t, porRol[k] || 0]),
  ];

  const lista = useMemo(() => {
    const q = sinTildes(f.q.trim()); const qRut = q.replace(/[^0-9k]/g, '');
    return personas
      .filter((c) => (!f.rol || c.roles.includes(f.rol))
        && (!q || sinTildes(c.nombre).includes(q) || sinTildes(c.email || '').includes(q)
          || (qRut.length > 2 && c.rut.toLowerCase().replace(/[^0-9k]/g, '').includes(qRut))))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [personas, f]);

  const columnas = [
    {
      clave: 'nombre', titulo: 'Nombre',
      render: (c: IPersona) => (
        <span className="tw:flex tw:items-center tw:gap-3 tw:min-w-0">
          <Avatar nombre={c.nombre} />
          <span className="tw:min-w-0">
            <b className="tw:block tw:truncate tw:font-semibold">{c.nombre}</b>
            {c.tipo === 'juridica' && <small className="tw:text-xs tw:text-muted">Empresa</small>}
          </span>
        </span>
      ),
    },
    { clave: 'rut', titulo: 'RUT', ancho: '140px', render: (c: IPersona) => <span className="tw:tabular-nums">{c.rut || <span className="tw:text-muted">—</span>}</span> },
    {
      clave: 'roles', titulo: 'Roles',
      render: (c: IPersona) => c.roles.length
        ? <span className="tw:flex tw:flex-wrap tw:gap-1">{c.roles.map((r) => <Badge key={r} tono={TONO_ROL[r]}>{ROL[r]}</Badge>)}</span>
        : <span className="tw:text-muted">—</span>,
    },
    { clave: 'contacto', titulo: 'Contacto', render: (c: IPersona) => <span className="tw:text-[13px] tw:text-muted">{c.email || c.telefono || '—'}</span> },
    { clave: 'props', titulo: 'Propiedades', alinear: 'derecha' as const, ancho: '110px', render: (c: IPersona) => <span className="tw:tabular-nums">{cuenta.get(c.id) || '—'}</span> },
  ];

  return (
    <Layout
      titulo="Personas"
      ilustracion={{ imagen: 'img/formas/personas.svg', tinte: '#6a2fe0' }}
      subtitulo={`${personas.length} en tu CRM · un registro por RUT, se reutiliza en cada contrato`}
      acciones={<Boton id="cNew" icono="plus" onClick={() => abrirFormPersona()}>Nueva persona</Boton>}
      barra={<>
        <Buscador kit id="cQ" valor={f.q} alCambiar={(q) => personasSetFiltros({ q })} espera={180} placeholder="Buscar por nombre, RUT o correo" />
        <Tabs id="cRol" dato="r" etiqueta="Rol" opciones={roles} valor={f.rol} alCambiar={(rol) => personasSetFiltros({ rol })} className="tw:max-w-full tw:overflow-x-auto" />
      </>}
    >
      {error && <p role="alert" className="tw:text-red-softink">No se pudieron leer las personas: {error}</p>}

      {cargado && (personas.length ? (
        <div id="cTabla"><Card relleno={false}>
          <Tabla columnas={columnas} filas={lista} claveFila={(c) => c.id} alTocarFila={(c) => abrirPersona(c.id)}
            atributosFila={(c) => ({ 'data-c': c.id })}
            vacio={<EstadoVacio compacto texto="Nadie coincide con la búsqueda." className="tw:text-center" />} />
        </Card></div>
      ) : (
        <Card>
          <EstadoVacio icono="users" titulo="Aún no hay personas"
            texto="Se crean solas al importar propiedades con propietario o al llegar un interesado. También puedes agregarlas aquí."
            accion={<Boton icono="plus" onClick={() => abrirFormPersona()}>Nueva persona</Boton>} />
        </Card>
      ))}
    </Layout>
  );
}
