// Ventanas de la ficha del negocio y de «Nuevo negocio», que abre el código antiguo (src/renderer/negocios.js) con
// window.Ventanas.abrir('negocios.…'). Se registran en components/functional/ventanas/negocios.tsx.
// Las partes del kit (VentanaCabecera, VentanaCuerpo, VentanaPie) van sueltas en un fragmento.
// La lógica (api, toasts, qué se refresca) sigue en el JS antiguo: llega como funciones en las props. Si una función
// lanza un error, la ventana muestra su mensaje y queda abierta, como antes.
// Los id (#mOk, #mCancel, #nnProp, #nnCli, #nnPer, #nnVal, #nnMon, #nnEt, #nnAcc, #lmSel, #vfOp, #edFile, #edTpl,
// data-doc…) los usan las pruebas.
import { useState, type ReactNode } from 'react';
import Boton from '../../ui/Boton';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import Segmentos from '../../ui/Segmentos';
import Icono from '../../ui/Icono';
import ItemLista from '../../ui/ItemLista';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../ui/Ventana';
import { P, NOTA, FORM, DOS } from '../gestion/editor-pdf/Modales';
import { cerrarModal } from '../../../utils/modal';
import { cx } from '../../../utils/cx';

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** el error de un formulario (vacío no ocupa lugar); conserva su id (#nnErr, #vfErr…) */
export function ErrorVentana({ id, texto }: { id: string; texto: string }) {
  return <p id={id} role="alert" className="error tw:m-0 tw:text-[13px] tw:text-err tw:empty:hidden">{texto}</p>;
}

/** dos campos lado a lado: el primero ocupa el resto, el segundo tiene ancho fijo */
function EnLinea({ children }: { children: ReactNode }) {
  return <div className="tw:flex tw:items-end tw:gap-2 tw:[&>*:first-child]:flex-1 tw:[&>*:first-child]:min-w-0">{children}</div>;
}

// ---------- confirmaciones (modal-45 y modal-47) ----------
interface IConfirmarProps {
  titulo: string;
  icono: string;
  tono?: 'amarillo' | 'rojo';
  texto: ReactNode;
  cancelar: string;
  boton: string;
  peligro?: boolean;
  alConfirmar: () => void | Promise<void>;
}
function Confirmar({ titulo, icono, tono, texto, cancelar, boton, peligro, alConfirmar }: IConfirmarProps) {
  return <>
    <VentanaCabecera icono={icono} tonoIcono={tono} titulo={titulo} />
    <VentanaCuerpo><p className={P}>{texto}</p></VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>{cancelar}</Boton>
      <Boton id="mOk" variante={peligro ? 'peligro' : 'principal'} onClick={() => alConfirmar()}>{boton}</Boton>
    </VentanaPie>
  </>;
}

/** modal-45: pasar a la etapa siguiente sin que el documento de la etapa esté firmado */
export function PasarSinFirma({ firma, siguiente, alConfirmar }: { firma: string; siguiente: string; alConfirmar: () => void }) {
  return <Confirmar titulo="¿Pasar sin la firma?" icono="sign" tono="amarillo" cancelar="Volver" boton={`Pasar a «${siguiente}»`} alConfirmar={alConfirmar}
    texto={<>«{firma}» todavía no está firmado. Puedes avanzar igual y vincular la firma después.</>} />;
}

/** modal-47: eliminar el negocio */
export function EliminarNegocio({ alConfirmar }: { alConfirmar: () => void | Promise<void> }) {
  return <Confirmar titulo="Eliminar negocio" icono="trash" tono="rojo" cancelar="Cancelar" boton="Eliminar" peligro alConfirmar={alConfirmar}
    texto="Se borra el negocio y su historial. Las firmas y la propiedad no se tocan." />;
}

// ---------- modal-44: nuevo negocio ----------
type TTipo = 'venta' | 'arriendo';
interface IPrecio { valor: number | string; moneda: string }
export interface INuevoNegocioLeido { tipo: TTipo; propId: string; clienteId: string; etapa: string }
export interface INuevoNegocioValores extends INuevoNegocioLeido {
  valor: { valor: string; moneda: string };
  comision: { tipo: string; valor: string };
  proximaAccion: { texto: string; fecha: string };
}
interface INuevoNegocioProps {
  /** cambia en cada llamada a nuevoNegocio(): el formulario parte de nuevo, como cuando se volvía a dibujar */
  vez: number;
  tipo: TTipo;
  propiedades: { id: string; texto: string; precio: IPrecio | null }[];
  personas: { id: string; texto: string }[];
  etapas: { id: string; t: string }[];
  propId: string;
  clienteId: string;
  etapa: string;
  hoy: string;
  alCambiarTipo: (leido: INuevoNegocioLeido) => void;
  alCrearPersona: (leido: INuevoNegocioLeido) => void;
  alGuardar: (valores: INuevoNegocioValores) => Promise<void>;
}

export function NuevoNegocio(props: INuevoNegocioProps) {
  return <FormNuevoNegocio key={props.vez} {...props} />;
}

function FormNuevoNegocio({ tipo, propiedades, personas, etapas, propId: prop0, clienteId: cli0, etapa: et0, hoy, alCambiarTipo, alCrearPersona, alGuardar }: INuevoNegocioProps) {
  const venta = tipo === 'venta';
  const pr = propiedades.find((p) => p.id === prop0)?.precio || null;
  const [propId, setPropId] = useState(prop0);
  const [clienteId, setClienteId] = useState(cli0);
  const [valor, setValor] = useState(String(pr?.valor ?? ''));
  const [moneda, setMoneda] = useState(pr?.moneda || (venta ? 'UF' : 'CLP'));
  const [com, setCom] = useState(venta ? '2' : '50');
  const [comT, setComT] = useState('%');
  const [etapa, setEtapa] = useState(etapas.some((e) => e.id === et0) ? et0 : etapas[0]?.id || '');
  const [accion, setAccion] = useState('');
  const [fechaAcc, setFechaAcc] = useState(hoy);
  const [error, setError] = useState('');
  const leer = (): INuevoNegocioLeido => ({ tipo, propId, clienteId, etapa });

  const elegirProp = (id: string) => {
    setPropId(id);
    const v = propiedades.find((x) => x.id === id)?.precio; // toma el precio de la ficha
    if (v) { setValor(String(v.valor)); setMoneda(v.moneda); }
  };
  const guardar = async () => {
    try { await alGuardar({ ...leer(), valor: { valor, moneda }, comision: { tipo: comT, valor: com }, proximaAccion: { texto: accion, fecha: fechaAcc } }); }
    catch (e) { setError(mensaje(e)); }
  };

  return <>
    <VentanaCabecera icono="briefcase" titulo="Nuevo negocio" descripcion="Elige la propiedad y el cliente: el negocio parte en la etapa que indiques." />
    <VentanaCuerpo className={FORM}>
      <Segmentos id="nnTipo" etiqueta="Tipo de negocio" dato="t" valor={tipo} opciones={[['venta', 'Venta'], ['arriendo', 'Arriendo']]}
        alCambiar={(t) => { if (t !== tipo) alCambiarTipo({ ...leer(), tipo: t }); }} />
      <div className={DOS}>
        <Select etiqueta="Propiedad" id="nnProp" value={propId} onChange={(e) => elegirProp(e.target.value)} vacia="Elegir…"
          opciones={propiedades.map((p) => [p.id, p.texto])} />
        <EnLinea>
          <Select etiqueta={venta ? 'Comprador' : 'Arrendatario'} id="nnCli" value={clienteId} onChange={(e) => setClienteId(e.target.value)} vacia="Elegir…"
            opciones={personas.map((c) => [c.id, c.texto])} />
          <Boton id="nnPer" variante="secundario" icono="plus" title="Crear persona" aria-label="Crear persona" onClick={() => alCrearPersona(leer())} />
        </EnLinea>
        <EnLinea>
          <Input etiqueta={venta ? 'Precio acordado' : 'Arriendo mensual acordado'} id="nnVal" type="number" step="any" value={valor} onChange={(e) => setValor(e.target.value)} />
          <Select id="nnMon" aria-label="Moneda" clasesCampo="tw:w-[90px]" value={moneda} onChange={(e) => setMoneda(e.target.value)}
            opciones={[['UF', 'UF'], ['CLP', 'CLP'], ['USD', 'USD']]} />
        </EnLinea>
        <div className="tw:flex tw:flex-col tw:gap-1.5">
          <EnLinea>
            <Input etiqueta="Comisión" id="nnCom" type="number" step="any" value={com} onChange={(e) => setCom(e.target.value)} />
            <Select id="nnComT" aria-label="Tipo de comisión" clasesCampo="tw:w-[130px]" value={comT} onChange={(e) => setComT(e.target.value)}
              opciones={[['%', '%'], ['monto', 'monto fijo']]} />
          </EnLinea>
          <small className="tw:text-xs tw:text-muted">{venta ? 'Habitual: 2% + IVA' : 'Habitual: 50% del primer mes + IVA'}</small>
        </div>
        <Select etiqueta="Etapa inicial" id="nnEt" value={etapa} onChange={(e) => setEtapa(e.target.value)} opciones={etapas.map((e) => [e.id, e.t])} />
        <EnLinea>
          <Input etiqueta={<>Próxima acción <span className="tw:font-normal tw:text-muted">(opcional)</span></>} id="nnAcc" placeholder="Ej.: llamar para agendar visita"
            value={accion} onChange={(e) => setAccion(e.target.value)} />
          <Input id="nnFec" type="date" aria-label="Fecha de la próxima acción" clasesCampo="tw:w-[150px]" value={fechaAcc} onChange={(e) => setFechaAcc(e.target.value)} />
        </EnLinea>
      </div>
      <ErrorVentana id="nnErr" texto={error} />
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
      <Boton id="mOk" onClick={guardar}>Crear negocio</Boton>
    </VentanaPie>
  </>;
}

// ---------- modal-46: marcar como perdido ----------
const MOTIVOS = ['El cliente desistió', 'No calificó (crédito o antecedentes)', 'Eligió otra propiedad', 'El propietario retiró la propiedad', 'Precio'];

export function MarcarPerdido({ alGuardar }: { alGuardar: (motivo: string) => void | Promise<void> }) {
  const [sel, setSel] = useState(MOTIVOS[0]);
  const [otro, setOtro] = useState('');
  return <>
    <VentanaCabecera icono="x" tonoIcono="rojo" titulo="Marcar como perdido" />
    <VentanaCuerpo className={FORM}>
      <Select etiqueta="¿Por qué se cayó?" id="lmSel" value={sel} onChange={(e) => setSel(e.target.value)}
        opciones={[...MOTIVOS.map((m): [string, string] => [m, m]), ['otro', 'Otro motivo…']]} />
      {sel === 'otro' && <Input id="lmTxt" aria-label="Motivo" placeholder="Escribe el motivo" autoFocus value={otro} onChange={(e) => setOtro(e.target.value)} />}
      <p className={NOTA}>Si la propiedad estaba reservada por este negocio, vuelve a quedar disponible.</p>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
      <Boton id="mOk" variante="peligro" onClick={() => alGuardar(sel === 'otro' ? otro : sel)}>Marcar como perdido</Boton>
    </VentanaPie>
  </>;
}

// ---------- modal-48: vincular la firma ----------
export function VincularFirma({ firma, alGuardar }: { firma: string; alGuardar: (operacion: string) => Promise<void> }) {
  const [op, setOp] = useState('');
  const [error, setError] = useState('');
  const guardar = async () => { try { await alGuardar(op); } catch (e) { setError(mensaje(e)); } };
  return <>
    <VentanaCabecera icono="link" titulo="Vincular la firma" descripcion={`${firma}: escribe el número de la operación de Portalfirma.`} />
    <VentanaCuerpo className={FORM}>
      <Input id="vfOp" aria-label="Número de operación" placeholder="Ej.: 23736" inputMode="numeric" autoFocus value={op} onChange={(e) => setOp(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') guardar(); }} />
      <ErrorVentana id="vfErr" texto={error} />
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
      <Boton id="mOk" onClick={guardar}>Vincular</Boton>
    </VentanaPie>
  </>;
}

// ---------- modal-49: enviar a firmar el documento de la etapa ----------
interface IEnviarDocumentoProps {
  firma: string;
  codigo: string;
  documentos: { id: string; nombre: string; fecha: string }[];
  alElegirDocumento: (id: string) => void;
  alElegirArchivo: () => void;
  alUsarNotaria: () => void;
}
export function EnviarDocumento({ firma, codigo, documentos, alElegirDocumento, alElegirArchivo, alUsarNotaria }: IEnviarDocumentoProps) {
  return <>
    <VentanaCabecera icono="sign" titulo="Enviar a firmar" descripcion={[firma, codigo].filter(Boolean).join(' · ')} />
    <VentanaCuerpo className={FORM}>
      {documentos.length ? <div>
        <h3 className="tw:mt-0 tw:mb-1.5 tw:text-[13px] tw:font-semibold tw:text-text">Documentos de la propiedad</h3>
        <div className="tw:flex tw:flex-col tw:gap-0.5 tw:-mx-3">
          {documentos.map((d) => (
            <ItemLista key={d.id} data-doc={d.id} alTocar={() => alElegirDocumento(d.id)} flecha titulo={d.nombre} detalle={d.fecha}
              media={<span className="tw:grid tw:place-items-center tw:w-9 tw:h-9 tw:rounded-[10px] tw:bg-sunken tw:text-muted"><Icono nombre="file" tam={16} /></span>} />
          ))}
        </div>
      </div> : <p className={NOTA}>La propiedad aún no tiene documentos guardados.</p>}
      <div className={cx('tw:flex tw:flex-wrap tw:gap-2')}>
        <Boton id="edFile" variante="secundario" icono="upload" onClick={alElegirArchivo}>Elegir otro archivo</Boton>
        <Boton id="edTpl" variante="secundario" icono="notary" onClick={alUsarNotaria}>Usar la Notaría virtual</Boton>
      </div>
      <p className={NOTA}>Revisas los firmantes y confirmas en la pantalla de envío. Al terminar, la operación queda ligada a este negocio.</p>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
    </VentanaPie>
  </>;
}
