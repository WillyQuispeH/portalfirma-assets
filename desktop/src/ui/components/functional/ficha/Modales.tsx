// Formularios en ventana de la ficha de la propiedad (en el modal de la app, utils/modal.tsx).
// Con el kit: Select, Input, Boton, ItemLista y Avatar.
// Los id (#vRol, #vQ, #vList con [data-c], #vNew, #mCancel, #mOk) los usan las pruebas y el recorrido de Aprende.
import { useMemo, useState } from 'react';
import Boton from '../../ui/Boton';
import Select from '../../ui/Select';
import Input from '../../ui/Input';
import ItemLista from '../../ui/ItemLista';
import Avatar from '../../ui/Avatar';
import EstadoVacio from '../../ui/EstadoVacio';
import { ROL } from '../cartera/catalogos';
import { useFicha } from '../../../store/hooks/useFicha.hook';
import { avisar, crearPersona, toast } from '../../../utils/app';
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
    <div className="tw:flex tw:flex-col tw:gap-4">
      <div>
        <h2 className="tw:m-0 tw:text-xl tw:font-bold">Vincular persona</h2>
        <p className="tw:mt-1 tw:mb-0 tw:text-[13px] tw:text-muted">{p.codigo} · {p.titulo}</p>
      </div>
      <Select id="vRol" etiqueta="Rol en la propiedad" value={rol} onChange={(e) => setRol(e.target.value)} opciones={Object.entries(ROL)} />
      <Input id="vQ" etiqueta="Buscar en tu CRM" icono="search" placeholder="Nombre o RUT" autoComplete="off" autoFocus value={q} onChange={(e) => setQ(e.target.value)} />
      <div id="vList" className="tw:-mx-3 tw:max-h-[300px] tw:overflow-auto tw:flex tw:flex-col">
        {lista.length ? lista.map((c) => (
          <ItemLista key={c.id} data-c={c.id} alTocar={() => vincular(c.id)} media={<Avatar nombre={c.nombre} />}
            titulo={c.nombre} detalle={`${c.rut} · ${c.roles.map((r) => ROL[r]).join(', ') || 'sin rol'}`} />
        )) : <EstadoVacio compacto texto="No hay coincidencias. Crea la persona nueva." className="tw:px-3" />}
      </div>
      <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
        <Boton id="vNew" variante="fantasma" icono="plus" onClick={nueva}>Crear persona nueva</Boton>
        <span className="tw:flex-1" />
        <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
      </div>
    </div>
  );
}

// Finalizar un aviso de Portal Inmobiliario (no se puede reactivar)
export function FinalizarAviso({ op, alConfirmar }: { op: string; alConfirmar: () => void }) {
  return (
    <div className="tw:flex tw:flex-col tw:gap-4">
      <h2 className="tw:m-0 tw:text-xl tw:font-bold">Finalizar el aviso</h2>
      <p className="tw:m-0 tw:text-sm tw:leading-relaxed">El aviso de {op} se cierra en Portal Inmobiliario y Mercado Libre. <b>No se puede reactivar</b>: para volver a publicar se crea un aviso nuevo, que usa otra publicación del paquete.</p>
      <div className="tw:flex tw:justify-end tw:gap-2">
        <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
        <Boton id="mOk" variante="peligro" onClick={() => { cerrarModal(); alConfirmar(); }}>Finalizar aviso</Boton>
      </div>
    </div>
  );
}
