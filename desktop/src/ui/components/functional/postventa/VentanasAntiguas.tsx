// Ventanas de postventa que abre el código antiguo (src/renderer/postventa.js) con window.Ventanas.abrir('negocios.…'):
// «Nuevo contratista» y «Nuevo reclamo». Se registran en components/functional/ventanas/negocios.tsx.
// La lógica (api y qué se refresca) sigue en el JS antiguo y llega en las props. Si alGuardar lanza un error, se muestra
// en la ventana y queda abierta, como antes.
// Los id (#mOk, #mCancel, #ctN, #ctE, #ctT, #nrU, #nrD) los usan las pruebas.
import { useState } from 'react';
import Boton from '../../ui/Boton';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import Textarea from '../../ui/Textarea';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../ui/Ventana';
import { FORM } from '../gestion/editor-pdf/Modales';
import { ErrorVentana } from '../negocios/VentanasAntiguas';
import { cerrarModal } from '../../../utils/modal';

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---------- modal-53: nuevo contratista ----------
export interface IContratistaValores { nombre: string; especialidad: string; telefono: string }
interface INuevoContratistaProps {
  alGuardar: (v: IContratistaValores) => Promise<void>;
  /** Cancelar (y la X): quien abrió la ventana espera la respuesta */
  alCancelar: () => void;
}
export function NuevoContratista({ alGuardar, alCancelar }: INuevoContratistaProps) {
  const [v, setV] = useState<IContratistaValores>({ nombre: '', especialidad: '', telefono: '' });
  const [error, setError] = useState('');
  const campo = (k: keyof IContratistaValores) => ({ value: v[k], onChange: (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value })) });
  const guardar = async () => { try { await alGuardar(v); } catch (e) { setError(mensaje(e)); } };
  return <>
    <VentanaCabecera icono="user" titulo="Nuevo contratista" onCerrar={alCancelar} />
    <VentanaCuerpo className={FORM}>
      <Input etiqueta="Nombre o empresa" id="ctN" autoFocus {...campo('nombre')} />
      <Input etiqueta="Especialidad" id="ctE" placeholder="Gasfitería, pintura, electricidad…" {...campo('especialidad')} />
      <Input etiqueta="Celular (WhatsApp)" id="ctT" placeholder="+56 9 1234 5678" {...campo('telefono')} />
      <ErrorVentana id="ctErr" texto={error} />
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={alCancelar}>Cancelar</Boton>
      <Boton id="mOk" onClick={guardar}>Guardar</Boton>
    </VentanaPie>
  </>;
}

// ---------- modal-54: nuevo reclamo ----------
interface INuevoReclamoProps {
  unidades: [string, string][];
  alGuardar: (v: { unidadId: string; descripcion: string }) => Promise<void>;
}
export function NuevoReclamo({ unidades, alGuardar }: INuevoReclamoProps) {
  const [unidadId, setUnidadId] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [error, setError] = useState('');
  const guardar = async () => { try { await alGuardar({ unidadId, descripcion }); } catch (e) { setError(mensaje(e)); } };
  return <>
    <VentanaCabecera icono="alert" tonoIcono="durazno" titulo="Nuevo reclamo" />
    <VentanaCuerpo className={FORM}>
      <Select etiqueta="Unidad" id="nrU" vacia="— Sin unidad —" opciones={unidades} value={unidadId} onChange={(e) => setUnidadId(e.target.value)} />
      <Textarea etiqueta="¿Qué falla reporta?" id="nrD" rows={3} autoFocus placeholder="Ej.: filtración bajo el lavamanos del baño principal"
        value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      <ErrorVentana id="nrErr" texto={error} />
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
      <Boton id="mOk" onClick={guardar}>Crear</Boton>
    </VentanaPie>
  </>;
}
