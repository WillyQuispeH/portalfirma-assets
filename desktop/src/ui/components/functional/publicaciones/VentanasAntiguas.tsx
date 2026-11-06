// Ventanas de Publicaciones que abre el código antiguo (src/renderer/publicaciones.js) con
// window.Ventanas.abrir('leads.pub…'). Hechas con el kit; la lógica (llamadas a la API, toasts, qué se vuelve a abrir)
// sigue en publicaciones.js y llega en las funciones de las props.
// Los id (#mOk, #mCancel, #apV, #aiP, #aiPo, #aiN, #aiT, #aiE, #aiM, #ctN, #ctE, #ctT, #ctW, #epQ, #epL) y los data-b y
// data-p los usan las pruebas (publicaciones-e2e) y el JS antiguo.
import { useState } from 'react';
import Boton from '../../ui/Boton';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import ItemLista, { Miniatura } from '../../ui/ItemLista';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../ui/Ventana';
import { FORM, DOS, NOTA } from '../gestion/editor-pdf/Modales';
import { cerrarModal } from '../../../utils/modal';
import { cx } from '../../../utils/cx';

const ERROR = 'tw:m-0 tw:text-[13px] tw:text-red-ink tw:empty:hidden';
const Cancelar = () => <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cancelar</Boton>;
const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

// guarda con el botón #mOk ocupado mientras tanto; si falla, muestra el error en la ventana
function useGuardar() {
  const [ocupado, setOcupado] = useState(false); const [error, setError] = useState('');
  const guardar = async (fn: () => Promise<void>) => {
    setOcupado(true); setError('');
    try { await fn(); } catch (e) { setError(mensajeDe(e)); } finally { setOcupado(false); }
  };
  return { ocupado, error, setError, guardar };
}

// ---------- modal-55 · ajustar el precio de un aviso ----------
interface IAjustarPrecioProps {
  op: string; codigo: string; titulo: string;
  precioTxt: string; // el actual, ya con formato («UF 4.500»)
  valor: number; moneda: string;
  alGuardar: (valor: number) => Promise<void>;
}
export function AjustarPrecio({ op, codigo, titulo, precioTxt, valor, moneda, alGuardar }: IAjustarPrecioProps) {
  const [v, setV] = useState(String(valor ?? '')); const g = useGuardar();
  const bajar = (x: number) => { const n = valor * (1 - x / 100); setV(String(moneda === 'CLP' ? Math.round(n / 1000) * 1000 : Math.round(n * 100) / 100)); };
  const guardar = () => { const n = Number(v); if (!(n > 0)) { g.setError('Indica un precio válido.'); return; } g.guardar(() => alGuardar(n)); };
  return <>
    <VentanaCabecera icono="tag" titulo={`Ajustar precio de ${op}`} descripcion={<>{codigo} · {titulo}. Precio actual: <b>{precioTxt}</b>.</>} />
    <VentanaCuerpo className={FORM}>
      <div className="tw:flex tw:flex-wrap tw:gap-2">{[3, 5, 8].map((x) => (
        <Boton key={x} tamano="sm" variante="secundario" data-b={x} onClick={() => bajar(x)}>−{x}%</Boton>))}
      </div>
      <Input id="apV" type="number" step="any" etiqueta={`Nuevo precio (${moneda})`} value={v} onChange={(e) => setV(e.target.value)} />
      <p className={NOTA}>Los avisos publicados por API se actualizan solos; los de feed, en la próxima lectura del portal.</p>
      <p className={ERROR} id="apE">{g.error}</p>
    </VentanaCuerpo>
    <VentanaPie><Cancelar /><Boton id="mOk" cargando={g.ocupado} onClick={guardar}>Guardar precio</Boton></VentanaPie>
  </>;
}

// ---------- modal-56 · agregar a mano un interesado ----------
const PORTALES: [string, string][] = [['toctoc', 'TOCTOC'], ['yapo', 'Yapo'], ['chilepropiedades', 'Chilepropiedades'], ['pi', 'Portal Inmobiliario'], ['Otro', 'Otro']];
interface IAgregarInteresadoProps {
  propiedades: { id: string; codigo: string; titulo: string }[];
  alGuardar: (propId: string, datos: { portal: string; nombre: string; telefono: string; email: string; mensaje: string }) => Promise<void>;
}
export function AgregarInteresado({ propiedades, alGuardar }: IAgregarInteresadoProps) {
  const [f, setF] = useState({ propId: propiedades[0]?.id || '', portal: 'toctoc', nombre: '', telefono: '', email: '', mensaje: '' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const g = useGuardar();
  return <>
    <VentanaCabecera icono="user" titulo="Agregar interesado" descripcion="Para consultas que llegan por correo desde TOCTOC, Yapo u otro canal." />
    <VentanaCuerpo className={FORM}>
      <div className={DOS}>
        <Select id="aiP" etiqueta="Propiedad" value={f.propId} onChange={set('propId')} opciones={propiedades.map((p) => [p.id, `${p.codigo} · ${p.titulo.slice(0, 40)}`])} />
        <Select id="aiPo" etiqueta="Portal" value={f.portal} onChange={set('portal')} opciones={PORTALES} />
        <Input id="aiN" etiqueta="Nombre" value={f.nombre} onChange={set('nombre')} />
        <Input id="aiT" etiqueta="Teléfono" placeholder="+56 9…" value={f.telefono} onChange={set('telefono')} />
        <Input id="aiE" etiqueta="Correo" value={f.email} onChange={set('email')} />
      </div>
      <Input id="aiM" etiqueta={<>Mensaje <span className="tw:text-muted tw:font-normal">(opcional)</span></>} value={f.mensaje} onChange={set('mensaje')} />
      <p className={ERROR} id="aiErr">{g.error}</p>
    </VentanaCuerpo>
    <VentanaPie><Cancelar /><Boton id="mOk" cargando={g.ocupado}
      onClick={() => g.guardar(() => alGuardar(f.propId, { portal: f.portal, nombre: f.nombre, telefono: f.telefono, email: f.email, mensaje: f.mensaje }))}>Agregar</Boton></VentanaPie>
  </>;
}

// ---------- modal-57 · contacto que aparece en los avisos ----------
interface IContactoProps {
  contacto: { nombre?: string; email?: string; telefono?: string; whatsapp?: string };
  alGuardar: (c: { nombre: string; email: string; telefono: string; whatsapp: string }) => Promise<void>;
}
export function ContactoAvisos({ contacto: c, alGuardar }: IContactoProps) {
  const [f, setF] = useState({ nombre: c.nombre || '', email: c.email || '', telefono: c.telefono || '', whatsapp: c.whatsapp || '' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const g = useGuardar();
  return <>
    <VentanaCabecera icono="user" titulo="Contacto de los avisos" descripcion="Aparece en todos los portales. Portal Inmobiliario exige WhatsApp." />
    <VentanaCuerpo className={FORM}>
      <div className={DOS}>
        <Input id="ctN" etiqueta="Corredora o nombre" value={f.nombre} onChange={set('nombre')} />
        <Input id="ctE" etiqueta="Correo" value={f.email} onChange={set('email')} />
        <Input id="ctT" etiqueta="Teléfono" value={f.telefono} onChange={set('telefono')} />
        <Input id="ctW" etiqueta="WhatsApp" placeholder="+56 9 1234 5678" value={f.whatsapp} onChange={set('whatsapp')} />
      </div>
      <p className={ERROR} id="ctErr">{g.error}</p>
    </VentanaCuerpo>
    <VentanaPie><Cancelar /><Boton id="mOk" cargando={g.ocupado} onClick={() => g.guardar(() => alGuardar(f))}>Guardar</Boton></VentanaPie>
  </>;
}

// ---------- modal-58 · elegir qué propiedad publicar ----------
interface IElegirPropiedadProps {
  propiedades: { id: string; codigo: string; titulo: string; direccion?: string; comuna?: string; foto?: string | null }[];
  alElegir: (id: string) => void;
}
export function ElegirPropiedad({ propiedades, alElegir }: IElegirPropiedadProps) {
  const [q, setQ] = useState('');
  const t = q.toLowerCase();
  const lista = propiedades.filter((p) => !t || [p.codigo, p.titulo, p.direccion, p.comuna].join(' ').toLowerCase().includes(t)).slice(0, 12);
  return <>
    <VentanaCabecera icono="export" titulo="¿Qué propiedad publicamos?" />
    <VentanaCuerpo className={FORM}>
      <Input id="epQ" icono="search" placeholder="Código, dirección o comuna" value={q} autoFocus onChange={(e) => setQ(e.target.value)} />
      <div id="epL" className={cx('tw:grid tw:grid-cols-2 tw:gap-2')}>
        {lista.map((p) => (
          <ItemLista key={p.id} data-p={p.id} className="tw:border tw:border-solid tw:border-line" alTocar={() => alElegir(p.id)}
            media={<Miniatura src={p.foto} icono="house" tam={44} />} titulo={p.titulo} detalle={[p.codigo, p.comuna].filter(Boolean).join(' · ')} />))}
        {!lista.length && <p className={cx(NOTA, 'tw:col-span-2')}>No hay propiedades que coincidan.</p>}
      </div>
    </VentanaCuerpo>
    <VentanaPie><Cancelar /></VentanaPie>
  </>;
}
