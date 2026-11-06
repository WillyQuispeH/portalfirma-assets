// Ventanas de la agenda que abre el código antiguo (src/renderer/agenda.js) con window.Ventanas.abrir('negocios.agenda…'):
// «Nuevo evento» y la orden de visita (preparando y confirmar). Se registran en components/functional/ventanas/negocios.tsx.
// La lógica (api, toasts, qué se refresca) sigue en el JS antiguo y llega en las props. Si alGuardar lanza un error, se
// muestra en la ventana y queda abierta, como antes.
// Los id (#mOk, #mCancel, #evT, #evF, #evH, #evP, #evC, #evD, #evTi, #evN) los usan las pruebas.
import { useState } from 'react';
import Boton from '../../ui/Boton';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import ListaDatos from '../../ui/ListaDatos';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../ui/Ventana';
import { NOTA, FORM, DOS } from '../gestion/editor-pdf/Modales';
import { ErrorVentana } from '../negocios/VentanasAntiguas';
import { cerrarModal } from '../../../utils/modal';

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---------- modal-1: nuevo evento ----------
export interface INuevoEventoValores { tipo: string; fecha: string; hora: string; propId: string; personaId: string; duracion: string; titulo: string; notas: string }
interface INuevoEventoProps {
  tipos: [string, string][];
  propiedades: [string, string][];
  personas: [string, string][];
  tipo: string;
  fecha: string;
  hora: string;
  propId: string;
  personaId: string;
  alGuardar: (v: INuevoEventoValores) => Promise<void>;
}

export function NuevoEvento({ tipos, propiedades, personas, alGuardar, ...pre }: INuevoEventoProps) {
  const [v, setV] = useState<INuevoEventoValores>({ tipo: pre.tipo, fecha: pre.fecha, hora: pre.hora, propId: pre.propId, personaId: pre.personaId, duracion: '45', titulo: '', notas: '' });
  const [error, setError] = useState('');
  const campo = (k: keyof INuevoEventoValores) => ({ value: v[k], onChange: (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value })) });
  const guardar = async () => { try { await alGuardar(v); } catch (e) { setError(mensaje(e)); } };
  return <>
    <VentanaCabecera icono="calendar" titulo="Nuevo evento" />
    <VentanaCuerpo className={FORM}>
      <div className={DOS}>
        <Select etiqueta="Tipo" id="evT" opciones={tipos} {...campo('tipo')} />
        <div className="tw:flex tw:items-end tw:gap-2">
          <Input etiqueta="Fecha y hora" id="evF" type="date" clasesCampo="tw:flex-1 tw:min-w-0" {...campo('fecha')} />
          <Input id="evH" type="time" aria-label="Hora" clasesCampo="tw:w-[120px]" {...campo('hora')} />
        </div>
        <Select etiqueta="Propiedad" id="evP" vacia="—" opciones={propiedades} {...campo('propId')} />
        <Select etiqueta="Persona" id="evC" vacia="—" opciones={personas} {...campo('personaId')} />
        <Input etiqueta="Duración (min)" id="evD" type="number" {...campo('duracion')} />
        <Input etiqueta={<>Título <span className="tw:font-normal tw:text-muted">(opcional)</span></>} id="evTi" {...campo('titulo')} />
        <Input etiqueta="Notas" id="evN" clasesCampo="tw:col-span-2" {...campo('notas')} />
      </div>
      <ErrorVentana id="evErr" texto={error} />
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
      <Boton id="mOk" onClick={guardar}>Agendar</Boton>
    </VentanaPie>
  </>;
}

// ---------- modal-2: preparando la orden de visita (no se puede cortar) ----------
export function PreparandoOrden() {
  return <>
    <VentanaCabecera icono="key" titulo="Orden de visita" cerrable={false} />
    <VentanaCuerpo>
      <p className={NOTA}><i className="bk-spin" /> Preparando la orden de visita…</p>
    </VentanaCuerpo>
  </>;
}

// ---------- modal-3: lo que se enviará y confirmar ----------
interface IConfirmarOrdenProps {
  titulo: string;
  detalle: string[]; // «Dato: valor»
  aviso?: string;
  alConfirmar: () => Promise<void>;
}
export function ConfirmarOrden({ titulo, detalle, aviso, alConfirmar }: IConfirmarOrdenProps) {
  const [enviando, setEnviando] = useState(false);
  const datos = detalle.map((x): [string, string] => { const [k, ...v] = x.split(': '); return [k, v.join(': ')]; });
  return <>
    <VentanaCabecera icono="key" titulo={titulo} cerrable={!enviando} />
    <VentanaCuerpo className={FORM}>
      <ListaDatos datos={datos} />
      {aviso && <p className={NOTA}>{aviso}</p>}
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
      <Boton id="mOk" disabled={enviando} onClick={async () => { setEnviando(true); await alConfirmar(); }}>{enviando ? 'Enviando…' : 'Generar y enviar a firmar'}</Boton>
    </VentanaPie>
  </>;
}
