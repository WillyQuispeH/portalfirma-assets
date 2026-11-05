// Formularios en ventana de la ficha y de la persona (en el modal de la app, utils/modal.tsx).
// Los id (#vRol, #vQ, #vList, #vNew, #mCancel, #mOk) los usan las pruebas y el recorrido de Aprende.
import { useMemo, useState } from 'react';
import Icono from '../../ui/Icono';
import { ROL } from '../cartera/catalogos';
import { useFicha } from '../../../store/hooks/useFicha.hook';
import { usePersona } from '../../../store/hooks/usePersona.hook';
import { abrirPersonas, avisar, crearPersona, toast } from '../../../utils/app';
import { cerrarModal } from '../../../utils/modal';
import type { IPropiedad } from '../../../store/interfaces/propiedad.interface';
import type { TPersonaRol } from '../../../store/interfaces/persona.interface';

// Vincular una persona del CRM a la propiedad (o crearla y vincularla)
export function VincularPersona({ p, rolInicial = 'propietario' }: { p: IPropiedad; rolInicial?: TPersonaRol }) {
  const { personas, fichaVincular } = useFicha();
  const [rol, setRol] = useState<string>(rolInicial);
  const [q, setQ] = useState('');
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase(); const tRut = t.replace(/[^0-9k]/g, '');
    return personas.filter((c) => !t || c.nombre.toLowerCase().includes(t) || (tRut.length > 2 && (c.rut || '').toLowerCase().replace(/[^0-9k]/g, '').includes(tRut))).slice(0, 8);
  }, [personas, q]);

  const vincular = async (personaId: string) => {
    const r = await fichaVincular(personaId, rol);
    if (r.error) return toast(r.error, 4000);
    cerrarModal(); avisar(r);
  };
  // «Nueva persona» sigue en src/renderer/inmo.js (también la usan otras pantallas): al crearla se vincula
  const nueva = () => crearPersona({ rol, despues: async (c) => { const r = await fichaVincular(c.id, rol); if (r.error) toast(r.error, 4000); } });

  return (
    <div className="im-form">
      <h2>Vincular persona</h2>
      <p className="muted small">{p.codigo} · {p.titulo}</p>
      <label>Rol en la propiedad
        <select id="vRol" value={rol} onChange={(e) => setRol(e.target.value)}>
          {Object.entries(ROL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <label>Buscar en tu CRM<input id="vQ" placeholder="Nombre o RUT" autoComplete="off" autoFocus value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <div className="im-vl" id="vList">
        {lista.length ? lista.map((c) => (
          <button key={c.id} className="im-vi" data-c={c.id} onClick={() => vincular(c.id)}>
            <span className="im-av">{c.nombre[0]}</span>
            <span><b>{c.nombre}</b><small>{c.rut} · {c.roles.map((r) => ROL[r]).join(', ') || 'sin rol'}</small></span>
          </button>
        )) : <p className="muted small">No hay coincidencias. Crea la persona nueva.</p>}
      </div>
      <div className="actions">
        <button className="ghost" id="vNew" onClick={nueva}><Icono nombre="plus" tam={14} /> Crear persona nueva</button>
        <span className="spacer" />
        <button className="secondary" id="mCancel" onClick={cerrarModal}>Cancelar</button>
      </div>
    </div>
  );
}

// Finalizar un aviso de Portal Inmobiliario (no se puede reactivar)
export function FinalizarAviso({ op, alConfirmar }: { op: string; alConfirmar: () => void }) {
  return <>
    <h2>Finalizar el aviso</h2>
    <p>El aviso de {op} se cierra en Portal Inmobiliario y Mercado Libre. <b>No se puede reactivar</b>: para volver a publicar se crea un aviso nuevo, que usa otra publicación del paquete.</p>
    <div className="actions">
      <button className="secondary" id="mCancel" onClick={cerrarModal}>Cancelar</button>
      <button className="danger" id="mOk" onClick={() => { cerrarModal(); alConfirmar(); }}>Finalizar aviso</button>
    </div>
  </>;
}

// Eliminar a la persona del CRM
export function EliminarPersona({ nombre }: { nombre: string }) {
  const { personaBorrar } = usePersona();
  const [borrando, setBorrando] = useState(false);
  const borrar = async () => {
    setBorrando(true);
    const r = await personaBorrar(); cerrarModal();
    if (r.error) return toast(r.error, 5000);
    avisar(r); abrirPersonas();
  };
  return <>
    <h2>Eliminar persona</h2>
    <p>¿Eliminar a <b>{nombre}</b> de tu CRM?</p>
    <div className="actions">
      <button className="secondary" id="mCancel" onClick={cerrarModal}>Cancelar</button>
      <button className="danger" id="mOk" disabled={borrando} onClick={borrar}>Eliminar</button>
    </div>
  </>;
}
