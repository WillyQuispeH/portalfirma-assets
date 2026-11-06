// «Nueva propiedad» / «Editar ficha» (modal-26), que abre Inmo.formProp en inmo.js. La ventana junta los valores tal como
// los escribió el usuario y se los pasa a alGuardar; armar la propiedad y guardarla sigue en inmo.js.
// Los id (#pf_titulo, #pf_tipo, #pf_venta, #pf_precioVentaM…, #pfErr, #mOk, #mCancel) los usan las pruebas.
// La dirección usa el campo inteligente de src/renderer/direcciones.js (window.Direcciones.conectar), que envuelve el input.
import { useEffect, useRef, useState } from 'react';
import Boton from '../../../ui/Boton';
import Input from '../../../ui/Input';
import Select from '../../../ui/Select';
import Textarea from '../../../ui/Textarea';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../../ui/Ventana';
import { Opcion } from '../../gestion/editor-pdf/Modales';
import { cerrarModal } from '../../../../utils/modal';

const MONEDAS: [string, string][] = [['UF', 'UF'], ['CLP', 'CLP'], ['USD', 'USD']];
// campos de texto que se guardan tal cual (con trim, en inmo.js)
const TEXTOS = ['codigo', 'unidad', 'comuna', 'region', 'rol', 'supTotal', 'supUtil', 'dormitorios', 'banos', 'estacionamientos', 'bodegas', 'gastosComunes', 'descripcion', 'notasInternas'] as const;

interface IDireccion { valor: () => { lat: number | null; lng: number | null; placeId: string | null } }
declare global {
  interface Window {
    Direcciones: { conectar: (input: HTMLInputElement, o: { inicial?: object; alElegir?: (d: { comuna?: string; region?: string }) => void }) => IDireccion };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- la propiedad tal como viene de la base
type TProp = Record<string, any>;
export interface IValoresPropiedad extends Record<string, unknown> {
  titulo: string; tipo: string; codigo: string; venta: boolean; arriendo: boolean; amoblado: boolean; direccion: string;
  precioVenta: string; precioVentaM: string; precioArriendo: string; precioArriendoM: string;
  geo: { lat: number | null; lng: number | null; placeId: string | null };
}

export function Propiedad({ p, nuevo, tipos, alGuardar }: { p: TProp; nuevo: boolean; tipos: Record<string, string>; alGuardar: (v: IValoresPropiedad) => Promise<void> }) {
  const [t, setT] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = { titulo: String(p.titulo ?? ''), tipo: String(p.tipo ?? ''),
      precioVenta: String(p.precioVenta?.valor ?? ''), precioVentaM: p.precioVenta?.moneda || 'UF',
      precioArriendo: String(p.precioArriendo?.valor ?? ''), precioArriendoM: p.precioArriendo?.moneda || 'CLP' };
    for (const k of TEXTOS) o[k] = String(p[k] ?? '');
    return o;
  });
  const [ck, setCk] = useState({ venta: !!p.venta, arriendo: !!p.arriendo, amoblado: !!p.amoblado });
  const [err, setErr] = useState('');
  const poner = (k: string, v: string) => setT((x) => ({ ...x, [k]: v }));
  const campo = (k: string) => ({ id: 'pf_' + k, value: t[k], onChange: (e: { target: { value: string } }) => poner(k, e.target.value) });

  // la dirección no la controla React: el campo inteligente escribe en ella al elegir una sugerencia
  const dirInput = () => document.getElementById('pf_direccion') as HTMLInputElement | null;
  const dir = useRef<IDireccion | null>(null);
  useEffect(() => {
    const input = dirInput(); if (!input || dir.current || input.closest('.dr')) return;
    dir.current = window.Direcciones.conectar(input, { inicial: p, alElegir: (d) => {
      if (d.comuna) poner('comuna', d.comuna); if (d.region) poner('region', d.region);
      const u = document.getElementById('pf_unidad') as HTMLInputElement | null; if (u && !u.value) u.focus();
    } });
  }, [p]);

  const guardar = async () => {
    const v = { ...t, ...ck, direccion: dirInput()?.value ?? '', geo: dir.current?.valor() ?? { lat: null, lng: null, placeId: null } } as IValoresPropiedad;
    try { await alGuardar(v); } catch (e) { setErr((e as Error).message); }
  };

  return <>
    <VentanaCabecera icono="house" titulo={nuevo ? 'Nueva propiedad' : 'Editar ficha'} />
    <VentanaCuerpo>
      <div className="tw:grid tw:grid-cols-2 tw:sm:grid-cols-4 tw:gap-x-3 tw:gap-y-3.5">
        <Input etiqueta="Título" clasesCampo="tw:col-span-2" placeholder="Departamento en Providencia" autoFocus {...campo('titulo')} />
        <Select etiqueta="Tipo" opciones={Object.entries(tipos)} {...campo('tipo')} />
        <Input etiqueta="Código" placeholder={nuevo ? 'Automático' : ''} {...campo('codigo')} />
        <div className="tw:col-span-2 tw:sm:col-span-4 tw:flex tw:flex-wrap tw:gap-5">
          <Opcion type="checkbox" id="pf_venta" checked={ck.venta} onChange={(e) => setCk({ ...ck, venta: e.target.checked })}>En venta</Opcion>
          <Opcion type="checkbox" id="pf_arriendo" checked={ck.arriendo} onChange={(e) => setCk({ ...ck, arriendo: e.target.checked })}>En arriendo</Opcion>
        </div>
        <Input etiqueta="Precio de venta" type="number" step="any" {...campo('precioVenta')} />
        <Select etiqueta="Moneda" opciones={MONEDAS} {...campo('precioVentaM')} />
        <Input etiqueta="Arriendo mensual" type="number" step="any" {...campo('precioArriendo')} />
        <Select etiqueta="Moneda" opciones={MONEDAS} {...campo('precioArriendoM')} />
        <Input etiqueta="Dirección" clasesCampo="tw:col-span-2" id="pf_direccion" defaultValue={String(p.direccion ?? '')} placeholder="Calle y número" />
        <Input etiqueta="Depto. / unidad" {...campo('unidad')} />
        <Input etiqueta="Comuna" {...campo('comuna')} />
        <Input etiqueta="Región" {...campo('region')} />
        <Input etiqueta="Rol SII" placeholder="00000-00000" {...campo('rol')} />
        <Input etiqueta="Sup. total (m²)" type="number" {...campo('supTotal')} />
        <Input etiqueta="Sup. útil (m²)" type="number" {...campo('supUtil')} />
        <Input etiqueta="Dormitorios" type="number" {...campo('dormitorios')} />
        <Input etiqueta="Baños" type="number" {...campo('banos')} />
        <Input etiqueta="Estacionamientos" type="number" {...campo('estacionamientos')} />
        <Input etiqueta="Bodegas" type="number" {...campo('bodegas')} />
        <Input etiqueta="Gastos comunes ($)" type="number" {...campo('gastosComunes')} />
        <div className="tw:flex tw:items-end tw:pb-2.5">
          <Opcion type="checkbox" id="pf_amoblado" checked={ck.amoblado} onChange={(e) => setCk({ ...ck, amoblado: e.target.checked })}>Amoblado</Opcion>
        </div>
        <Textarea etiqueta="Descripción (pública)" rows={4} clasesCampo="tw:col-span-2 tw:sm:col-span-4" {...campo('descripcion')} />
        <Textarea etiqueta="Notas internas (solo tu equipo)" rows={2} clasesCampo="tw:col-span-2 tw:sm:col-span-4" {...campo('notasInternas')} />
      </div>
      <p className="error tw:mt-3 tw:mb-0 tw:text-[13px] tw:empty:hidden" id="pfErr" role="alert">{err}</p>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
      <Boton id="mOk" onClick={guardar}>{nuevo ? 'Crear propiedad' : 'Guardar cambios'}</Boton>
    </VentanaPie>
  </>;
}
