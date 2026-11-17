// Los datos de una persona tal como salen en los documentos legales (comparecencia): nombre, RUT, correo, teléfono, nacionalidad,
// estado civil, profesión y domicilio. Lo usan las ventanas de la carta oferta, el mandato y el contrato: lo que falta se completa
// ahí mismo y se guarda en la ficha de la persona (guardarPersonaDoc), igual en todos los documentos.
//   <DatosPersona idp="coOf" valor={p} alCambiar={setP} />
// Los id salen como #{idp}Nombre, #{idp}Rut, #{idp}Tel, #{idp}Email, #{idp}Nac, #{idp}Civil, #{idp}Prof y #{idp}Dom.
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import { correoValido, rutValido } from '../../../utils/rut';
import { api } from '../../../utils/api';

export interface IPersonaDoc {
  id: string;
  nombre: string;
  rut: string;
  email: string;
  telefono: string;
  nacionalidad: string;
  estadoCivil: string;
  profesion: string;
  direccion: string;
  /** la persona completa de la cartera, para guardar sin perder lo que no se edita aquí (roles, notas…) */
  base?: Record<string, unknown>;
}

const CIVIL: [string, string][] = [['soltero(a)', 'Soltero(a)'], ['casado(a)', 'Casado(a)'], ['divorciado(a)', 'Divorciado(a)'], ['viudo(a)', 'Viudo(a)'], ['conviviente civil', 'Conviviente civil']];
const CAMPOS_GUARDADOS: (keyof IPersonaDoc)[] = ['nombre', 'rut', 'email', 'telefono', 'nacionalidad', 'estadoCivil', 'profesion', 'direccion'];

/** la persona de la cartera como la usan los documentos (lo que no tiene va vacío; la nacionalidad, «chilena» si no se dijo) */
export function aPersonaDoc(p: Partial<Record<keyof IPersonaDoc, string | null | undefined>> & { id: string }): IPersonaDoc {
  const s = (v: string | null | undefined) => v || '';
  return { id: p.id, base: p as Record<string, unknown>, nombre: s(p.nombre), rut: s(p.rut), email: s(p.email), telefono: s(p.telefono), nacionalidad: s(p.nacionalidad) || 'chilena', estadoCivil: s(p.estadoCivil), profesion: s(p.profesion), direccion: s(p.direccion) };
}

/** lo que falta o está mal para que el documento se pueda armar (el correo solo se exige si la persona firma) */
export function faltaDePersona(p: IPersonaDoc, firma = true): string[] {
  return [!p.nombre.trim() ? 'nombre' : '', !rutValido(p.rut) ? 'RUT' : '', firma && !correoValido(p.email) ? 'correo' : ''].filter(Boolean);
}

export const personaCambio = (a: IPersonaDoc, b: IPersonaDoc) => CAMPOS_GUARDADOS.some((k) => (a[k] || '') !== (b[k] || ''));

/** guarda los cambios en la ficha de la persona del CRM (lo que no se tocó se conserva) */
export async function guardarPersonaDoc(nuevo: IPersonaDoc): Promise<void> {
  await api('inmoPerGuardar', { ...(nuevo.base || {}), id: nuevo.id, nombre: nuevo.nombre.trim(), rut: nuevo.rut, email: nuevo.email.trim(), telefono: nuevo.telefono.trim(),
    nacionalidad: nuevo.nacionalidad.trim(), estadoCivil: nuevo.estadoCivil, profesion: nuevo.profesion.trim(), direccion: nuevo.direccion.trim() });
}

interface IDatosPersonaProps {
  idp: string;
  valor: IPersonaDoc;
  alCambiar: (p: IPersonaDoc) => void;
  /** false: no firma, el correo es opcional */
  firma?: boolean;
}

export default function DatosPersona({ idp, valor: v, alCambiar, firma = true }: IDatosPersonaProps) {
  const campo = (k: Exclude<keyof IPersonaDoc, 'base'>) => ({ value: v[k] as string, onChange: (e: { target: { value: string } }) => alCambiar({ ...v, [k]: e.target.value }) });
  return (
    <div className="tw:grid tw:grid-cols-2 tw:gap-3">
      <div className="tw:col-span-2"><Input etiqueta="Nombre completo" id={`${idp}Nombre`} autoComplete="off" pendiente={!v.nombre.trim()} {...campo('nombre')} /></div>
      <Input etiqueta="RUT" id={`${idp}Rut`} autoComplete="off" placeholder="12.345.678-5" pendiente={!v.rut} error={v.rut && !rutValido(v.rut) ? 'El RUT no es válido' : ''} {...campo('rut')} />
      <Input etiqueta="Teléfono" id={`${idp}Tel`} type="tel" autoComplete="off" placeholder="+56 9…" {...campo('telefono')} />
      <div className="tw:col-span-2"><Input etiqueta={firma ? 'Correo (ahí recibe el enlace para firmar)' : 'Correo'} id={`${idp}Email`} type="email" autoComplete="off" pendiente={firma && !v.email}
        error={v.email && !correoValido(v.email) ? 'Escribe un correo válido' : ''} {...campo('email')} /></div>
      <Input etiqueta="Nacionalidad" id={`${idp}Nac`} autoComplete="off" placeholder="chilena" {...campo('nacionalidad')} />
      <Select etiqueta="Estado civil" id={`${idp}Civil`} vacia="Sin indicar" opciones={CIVIL} {...campo('estadoCivil')} />
      <Input etiqueta="Profesión u oficio" id={`${idp}Prof`} autoComplete="off" {...campo('profesion')} />
      <Input etiqueta="Domicilio" id={`${idp}Dom`} autoComplete="off" placeholder="Calle, número, comuna" {...campo('direccion')} />
    </div>
  );
}
