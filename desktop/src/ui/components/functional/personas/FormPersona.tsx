// Nueva persona / Editar persona, con el kit (Modal, Input, Select, Textarea, SeleccionTarjetas, Boton).
// Lo abre abrirFormPersona() (controlador.tsx): desde la lista, la ficha y también desde el código antiguo
// (window.Inmo.formPersona: Leads, Negocios, «Gestionar una propiedad»).
// - Persona o empresa se sugiere por el RUT (50 millones o más) o la razón social (SpA, Ltda., S.A.…) mientras no
//   se elija a mano; en una empresa no se piden estado civil ni nacionalidad, y «Profesión» pasa a ser «Giro».
// - El RUT se formatea al salir del campo. Los errores del servidor (RUT inválido o repetido) se muestran en #cfErr.
// Los id (cf_*, #cfErr, #mOk, #mCancel) los usan las pruebas.
import { useState, type FormEvent } from 'react';
import Modal from '../../ui/Modal';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import Textarea from '../../ui/Textarea';
import SeleccionTarjetas, { type IOpcionTarjeta } from '../../ui/SeleccionTarjetas';
import Boton from '../../ui/Boton';
import { ROL, ROL_DETALLE } from '../cartera/catalogos';
import { formatearRut, rutValido } from '../../../utils/rut';
import type { IPersona, TPersonaRol } from '../../../store/interfaces/persona.interface';

const ROLES: IOpcionTarjeta<TPersonaRol>[] = (Object.entries(ROL) as [TPersonaRol, string][])
  .map(([valor, titulo]) => ({ valor, titulo, ...ROL_DETALLE[valor] }));
const RAZON_SOCIAL = /\b(spa|ltda|limitada|s\.\s?a\.?|eirl|sociedad|inversiones|inmobiliaria)\b/i;
const esEmpresa = (nombre: string, rut: string) => Number(String(rut).replace(/[^0-9kK]/g, '').slice(0, -1)) >= 50_000_000 || RAZON_SOCIAL.test(nombre);

type TDatos = Pick<IPersona, 'nombre' | 'rut' | 'email' | 'telefono' | 'direccion' | 'estadoCivil' | 'profesion' | 'nacionalidad' | 'notas'> & {
  tipo: 'natural' | 'juridica';
  roles: TPersonaRol[];
};

interface IFormPersonaProps {
  /** null: nueva persona */
  persona: Partial<IPersona> | null;
  /** rol que trae marcado una persona nueva (p. ej. «interesado» desde Leads) */
  rol?: TPersonaRol;
  /** datos que trae una persona nueva (p. ej. lo leído de un chat) */
  pre?: Partial<IPersona>;
  onGuardar: (datos: TDatos & { id?: string }) => Promise<string | null>; // null si guardó; si no, el error
  onCerrar: () => void;
}

export default function FormPersona({ persona, rol, pre, onGuardar, onCerrar }: IFormPersonaProps) {
  const nueva = !persona?.id;
  const base = { ...(pre ?? {}), ...(persona ?? {}) };
  const [d, setD] = useState<TDatos>({
    nombre: base.nombre ?? '',
    rut: base.rut ?? '',
    tipo: base.tipo ?? 'natural',
    email: base.email ?? '',
    telefono: base.telefono ?? '',
    direccion: base.direccion ?? '',
    estadoCivil: base.estadoCivil ?? '',
    profesion: base.profesion ?? '',
    nacionalidad: base.nacionalidad || 'chilena',
    notas: base.notas ?? '',
    roles: base.roles?.length ? base.roles : rol ? [rol] : [],
  });
  const [tipoTocado, setTipoTocado] = useState(!nueva);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const poner = (k: keyof TDatos, v: string) => setD((x) => {
    const n = { ...x, [k]: v };
    // persona o empresa: se sugiere mientras no se elija a mano
    if (!tipoTocado && (k === 'nombre' || k === 'rut')) n.tipo = esEmpresa(n.nombre, n.rut) ? 'juridica' : 'natural';
    return n;
  });
  const empresa = d.tipo === 'juridica';

  const guardar = async (e?: FormEvent) => {
    e?.preventDefault();
    setGuardando(true); setError('');
    try {
      const err = await onGuardar({ ...d, ...(persona?.id ? { id: persona.id } : {}) });
      if (err) setError(err);
    } finally { setGuardando(false); }
  };

  return (
    <Modal abierto onCerrar={onCerrar} tamano="lg" fondoNoCierra cerrable={!guardando}
      titulo={nueva ? 'Nueva persona' : 'Editar persona'}
      descripcion="Un registro por RUT: se reutiliza en cada contrato y documento."
      icono={empresa ? 'building' : 'users'}
      pie={<>
        <Boton id="mCancel" variante="secundario" onClick={onCerrar} disabled={guardando}>Cancelar</Boton>
        <Boton id="mOk" type="submit" form="frmPersona" cargando={guardando}>{nueva ? 'Crear persona' : 'Guardar'}</Boton>
      </>}>
      <form id="frmPersona" onSubmit={guardar} className="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-x-4 tw:gap-y-3.5">
        <Input id="cf_nombre" etiqueta={empresa ? 'Razón social' : 'Nombre completo'} clasesCampo="tw:sm:col-span-2" autoFocus
          value={d.nombre} onChange={(e) => poner('nombre', e.target.value)} />
        <Input id="cf_rut" etiqueta="RUT" placeholder="Ej.: 12.345.678-9" value={d.rut}
          onChange={(e) => poner('rut', e.target.value)}
          onBlur={() => { if (rutValido(d.rut)) setD((x) => ({ ...x, rut: formatearRut(x.rut) })); }} />
        <Select id="cf_tipo" etiqueta="Tipo" value={d.tipo}
          opciones={[['natural', 'Persona natural'], ['juridica', 'Persona jurídica (empresa)']]}
          onChange={(e) => { setTipoTocado(true); setD((x) => ({ ...x, tipo: e.target.value as TDatos['tipo'] })); }} />
        <Input id="cf_email" etiqueta="Correo" type="email" icono="mail" value={d.email} onChange={(e) => poner('email', e.target.value)} />
        <Input id="cf_telefono" etiqueta="Teléfono" type="tel" placeholder="+56 9 …" value={d.telefono ?? ''} onChange={(e) => poner('telefono', e.target.value)} />
        <Input id="cf_direccion" etiqueta="Dirección" clasesCampo="tw:sm:col-span-2" value={d.direccion ?? ''} onChange={(e) => poner('direccion', e.target.value)} />
        {!empresa && <Input id="cf_estadoCivil" etiqueta="Estado civil" value={d.estadoCivil ?? ''} onChange={(e) => poner('estadoCivil', e.target.value)} />}
        <Input id="cf_profesion" etiqueta={empresa ? 'Giro' : 'Profesión u oficio'} value={d.profesion ?? ''} onChange={(e) => poner('profesion', e.target.value)} />
        {!empresa && <Input id="cf_nacionalidad" etiqueta="Nacionalidad" value={d.nacionalidad ?? ''} onChange={(e) => poner('nacionalidad', e.target.value)} />}
        <SeleccionTarjetas id="cf_roles" etiqueta="Roles" ayuda="Puedes marcar varios" opciones={ROLES} valor={d.roles}
          alCambiar={(roles) => setD((x) => ({ ...x, roles }))} className="tw:sm:col-span-2" />
        <Textarea id="cf_notas" etiqueta="Notas" rows={2} clasesCampo="tw:sm:col-span-2" value={d.notas ?? ''} onChange={(e) => poner('notas', e.target.value)} />
        {error && <p id="cfErr" role="alert" className="tw:sm:col-span-2 tw:m-0 tw:text-[13px] tw:font-semibold tw:text-red-softink">{error}</p>}
        {/* Enter en un campo guarda */}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
