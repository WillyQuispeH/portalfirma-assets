// Aviso suave en las ventanas de documento (carta oferta de venta, contrato de arriendo): «Falta la inscripción de dominio de la
// propiedad» (sin ella el documento dice «en el Conservador de Bienes Raíces respectivo») y, en el arriendo, «Falta la cuenta de
// pago». Con dos acciones: «Completar» (los datos se escriben aquí mismo y se guardan en la ficha de la propiedad; la ventana
// actualiza su vista previa) y «Leer desde la copia de dominio» (ficha/DominioDesdeCopia.tsx, modal-150; esa ventana reemplaza a
// la del documento y, al terminar, la vuelve a abrir con los datos nuevos). No bloquea nada: solo avisa.
// Misma idea que los campos «Fojas / Número / Año / Conservador» de la promesa y la escritura (que además los exigen para enviar).
// Los id (#avDominio, #avLeer, #avCompletar, #avFojas, #avNumero, #avAnio, #avConservador, #avCancelar, #avGuardar, #avErr,
// #avCuenta, #avCuentaCompletar, #avCuentaInput, #avCuentaCancelar, #avCuentaGuardar) los usan las pruebas.
import { useState, type ReactNode } from 'react';
import Boton from '../../ui/Boton';
import Icono from '../../ui/Icono';
import Input from '../../ui/Input';
import { toast } from '../../../utils/app';

/** lo que la ficha de la propiedad tiene hoy de la inscripción de dominio */
export interface IDominioFicha { fojas: string; numero: string; anio: string; conservador: string }
/** lo que se guarda en la ficha (con los nombres de sus campos) */
export interface ICambiosFicha { fojas?: string; numeroInscripcion?: string; anioInscripcion?: string; conservador?: string; cuentaPago?: string }

/** sin fojas ni número, el documento no puede citar la inscripción (api/src/documentos/comparecientes.ts › dominioDe) */
export const faltaDominio = (d: IDominioFicha) => !d.fojas.trim() && !d.numero.trim();

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

function Franja({ id, children, acciones }: { id: string; children: ReactNode; acciones?: ReactNode }) {
  return (
    <div id={id} className="tw:flex tw:flex-col tw:gap-2.5 tw:rounded-control tw:bg-yellow-soft tw:px-3 tw:py-2.5 tw:text-yellow-softink">
      <div className="tw:flex tw:items-start tw:gap-2 tw:text-[13px] tw:leading-snug"><span className="tw:mt-0.5 tw:flex-none"><Icono nombre="alert" tam={15} /></span><div className="tw:min-w-0 tw:flex-1">{children}</div></div>
      {acciones && <div className="tw:flex tw:flex-wrap tw:items-center tw:justify-end tw:gap-2">{acciones}</div>}
    </div>
  );
}

export function AvisoDominio({ dominio, cuenta, alGuardar, alLeer, motivoLeer }: {
  dominio: IDominioFicha;
  /** arriendo: la cuenta donde se paga la renta que tiene hoy el documento (vacía: se avisa que falta). Sin esto no se pide la cuenta */
  cuenta?: string;
  /** guarda en la ficha de la propiedad y actualiza la vista previa de quien llama (lanza el error si algo falla) */
  alGuardar: (c: ICambiosFicha) => Promise<void>;
  /** abre «Leer desde la copia de dominio»; sin esto el botón no se muestra */
  alLeer?: () => void;
  /** si la ventana no puede cerrarse ahora (cambios sin guardar), por qué: el botón queda apagado con este mensaje */
  motivoLeer?: string;
}) {
  const [dom, setDom] = useState(dominio); const [form, setForm] = useState(dominio);
  const [editando, setEditando] = useState(false);
  const [cuentaNueva, setCuentaNueva] = useState(''); const [editandoCuenta, setEditandoCuenta] = useState(false);
  const [cuentaGuardada, setCuentaGuardada] = useState('');
  const [ocupado, setOcupado] = useState(false); const [error, setError] = useState('');

  const guardarDominio = async () => {
    const t = (x: string) => x.trim();
    if (!t(form.fojas) && !t(form.numero)) { setError('Escribe al menos las fojas o el número de la inscripción.'); return; }
    setOcupado(true); setError('');
    try {
      const c: ICambiosFicha = {};
      if (t(form.fojas)) c.fojas = t(form.fojas); if (t(form.numero)) c.numeroInscripcion = t(form.numero);
      if (t(form.anio)) c.anioInscripcion = t(form.anio); if (t(form.conservador)) c.conservador = t(form.conservador);
      await alGuardar(c);
      setDom({ fojas: t(form.fojas), numero: t(form.numero), anio: t(form.anio), conservador: t(form.conservador) }); setEditando(false);
      toast('Inscripción de dominio guardada en la ficha.');
    } catch (e) { setError(mensaje(e)); }
    setOcupado(false);
  };
  const guardarCuenta = async () => {
    const c = cuentaNueva.trim();
    if (!c) { setError('Escribe la cuenta donde se paga la renta.'); return; }
    setOcupado(true); setError('');
    try { await alGuardar({ cuentaPago: c }); setCuentaGuardada(c); setEditandoCuenta(false); toast('Cuenta de pago guardada en la ficha.'); } catch (e) { setError(mensaje(e)); }
    setOcupado(false);
  };
  const campo = (k: keyof IDominioFicha) => ({ value: form[k], onChange: (e: { target: { value: string } }) => { setForm((x) => ({ ...x, [k]: e.target.value })); setError(''); } });

  const sinDominio = faltaDominio(dom);
  const sinCuenta = cuenta !== undefined && !cuenta.trim() && !cuentaGuardada;
  if (!sinDominio && !sinCuenta) return null;
  const err = error && <p id="avErr" role="alert" className="error tw:m-0 tw:text-[13px] tw:text-err">{error}</p>;

  return <>
    {sinDominio && (editando ? (
      <Franja id="avDominio">
        <b className="tw:block tw:font-semibold">Inscripción de dominio de la propiedad</b>
        <span className="tw:block tw:mb-2 tw:text-xs">Está en la copia de dominio. Se guarda en la ficha y vale para todos los documentos de esta propiedad.</span>
        <div className="tw:grid tw:grid-cols-2 tw:gap-3 tw:text-text">
          <Input etiqueta="Fojas" id="avFojas" autoComplete="off" pendiente={!form.fojas.trim()} {...campo('fojas')} />
          <Input etiqueta="Número" id="avNumero" autoComplete="off" pendiente={!form.numero.trim()} {...campo('numero')} />
          <Input etiqueta="Año del registro" id="avAnio" inputMode="numeric" autoComplete="off" placeholder="2015" {...campo('anio')} />
          <Input etiqueta="Conservador de" id="avConservador" autoComplete="off" placeholder="Santiago" {...campo('conservador')} />
        </div>
        <div className="tw:mt-2 tw:empty:hidden">{err}</div>
        <div className="tw:mt-2 tw:flex tw:justify-end tw:gap-2">
          <Boton id="avCancelar" variante="secundario" tamano="sm" disabled={ocupado} onClick={() => { setEditando(false); setForm(dom); setError(''); }}>Cancelar</Boton>
          <Boton id="avGuardar" tamano="sm" icono="save" cargando={ocupado} onClick={guardarDominio}>Guardar en la ficha</Boton>
        </div>
      </Franja>
    ) : (
      <Franja id="avDominio" acciones={<>
        {alLeer && <Boton id="avLeer" variante="secundario" tamano="sm" icono="sparkle" disabled={!!motivoLeer || ocupado} title={motivoLeer} onClick={alLeer}>Leer desde la copia de dominio</Boton>}
        <Boton id="avCompletar" tamano="sm" icono="edit" disabled={ocupado} onClick={() => { setEditando(true); setEditandoCuenta(false); }}>Completar</Boton>
      </>}>
        Falta la inscripción de dominio de la propiedad: sin ella el documento dice “en el Conservador de Bienes Raíces respectivo”.
      </Franja>
    ))}
    {sinCuenta && (editandoCuenta ? (
      <Franja id="avCuenta">
        <b className="tw:block tw:font-semibold tw:mb-2">Cuenta donde se paga la renta</b>
        <div className="tw:text-text"><Input etiqueta="Cuenta" id="avCuentaInput" autoComplete="off" placeholder="Cuenta corriente 00-123-45678-90, Banco de Chile" value={cuentaNueva} onChange={(e) => { setCuentaNueva(e.target.value); setError(''); }} /></div>
        <div className="tw:mt-2 tw:empty:hidden">{err}</div>
        <div className="tw:mt-2 tw:flex tw:justify-end tw:gap-2">
          <Boton id="avCuentaCancelar" variante="secundario" tamano="sm" disabled={ocupado} onClick={() => { setEditandoCuenta(false); setError(''); }}>Cancelar</Boton>
          <Boton id="avCuentaGuardar" tamano="sm" icono="save" cargando={ocupado} onClick={guardarCuenta}>Guardar en la ficha</Boton>
        </div>
      </Franja>
    ) : (
      <Franja id="avCuenta" acciones={<Boton id="avCuentaCompletar" tamano="sm" icono="edit" disabled={ocupado} onClick={() => { setEditandoCuenta(true); setEditando(false); }}>Completar</Boton>}>
        Falta la cuenta de pago: el contrato dirá que el Arrendador la indicará.
      </Franja>
    ))}
  </>;
}
