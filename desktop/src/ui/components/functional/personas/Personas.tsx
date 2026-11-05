// Personas: el CRM, un registro por RUT, con búsqueda por nombre, RUT o correo y filtro por rol.
//
// El detalle de la persona y «Nueva persona» siguen en src/renderer/inmo.js; se llaman por utils/app.ts.
// Los id cQ, cRol, cNew y las clases im-table, im-tr y data-c los usan las pruebas e2e y Aprende.
import { useEffect, useMemo } from 'react';
import { usePersonas } from '../../../store/hooks/usePersonas.hook';
import { abrirPersona, nuevaPersona } from '../../../utils/app';
import Buscador from '../../ui/Buscador';
import Icono from '../../ui/Icono';
import Segmentos from '../../ui/Segmentos';
import { ROL } from '../cartera/catalogos';
import type { TPersonaRol } from '../../../store/interfaces/persona.interface';

const ROLES: [TPersonaRol | '', string][] = [['', 'Todas'], ...(Object.entries(ROL) as [TPersonaRol, string][])];

export default function Personas() {
  const { personas, propiedades, cargado, error, filtros: f, personasGetAll, personasSetFiltros } = usePersonas();

  useEffect(() => { personasGetAll(); }, [personasGetAll]);

  // cuántas propiedades tiene vinculadas cada persona
  const cuenta = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of propiedades) for (const id of new Set((p.vinculos || []).map((v) => v.personaId))) m.set(id, (m.get(id) || 0) + 1);
    return m;
  }, [propiedades]);

  const lista = useMemo(() => {
    const q = f.q.trim().toLowerCase(); const qRut = q.replace(/[^0-9k]/g, '');
    return personas
      .filter((c) => (!f.rol || c.roles.includes(f.rol))
        && (!q || c.nombre.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
          || (qRut.length > 2 && c.rut.toLowerCase().replace(/[^0-9k]/g, '').includes(qRut))))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [personas, f]);

  return (
    <div className="im-wrap">
      <div className="im-head fx-personas">
        <div>
          <h1>Personas</h1>
          <p className="muted">{personas.length} en tu CRM · un registro por RUT, se reutiliza en cada contrato</p>
        </div>
        <button className="primary" id="cNew" onClick={nuevaPersona}><Icono nombre="plus" tam={15} /> Nueva persona</button>
      </div>

      <div className="im-bar">
        <Buscador id="cQ" valor={f.q} alCambiar={(q) => personasSetFiltros({ q })} espera={180} placeholder="Buscar por nombre, RUT o correo" />
        <Segmentos id="cRol" dato="r" etiqueta="Rol" opciones={ROLES} valor={f.rol} alCambiar={(rol) => personasSetFiltros({ rol })} />
      </div>

      {error && <p className="error">No se pudieron leer las personas: {error}</p>}

      {cargado && (lista.length ? (
        <div className="im-table">
          <div className="im-tr th"><span>Nombre</span><span>RUT</span><span>Roles</span><span>Contacto</span><span>Propiedades</span></div>
          {lista.map((c) => (
            <button key={c.id} className="im-tr" data-c={c.id} onClick={() => abrirPersona(c.id)}>
              <span className="im-tn"><span className="im-av">{c.nombre[0]}</span><b>{c.nombre}</b></span>
              <span>{c.rut || '—'}</span>
              <span>{c.roles.map((r) => <i key={r} className="im-rl">{ROL[r]}</i>)}</span>
              <span className="muted small">{c.email || c.telefono || '—'}</span>
              <span>{cuenta.get(c.id) || '—'}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="im-empty sm">
          <span className="im-eic"><Icono nombre="users" tam={30} /></span>
          <p>{personas.length ? 'Nadie coincide con la búsqueda.' : 'Aún no hay personas. Se crean al importar propiedades con propietario, o agrégalas aquí.'}</p>
        </div>
      ))}
    </div>
  );
}
