// modal-128: el acta de entrega e inventario de un arriendo, lista para llenar y enviar a firmar (misma idea que el contrato, modal-127).
// Sigue los modelos de la corredora («Acta de entrega de propiedad» e «Inventario habitacional»).
//   · izquierda, en pestañas:
//       Entrega      fecha, gastos comunes desde, quién entrega, estacionamientos y bodega, llaves y accesos, medidores con lectura;
//       Inventario   los espacios (entrada, living, cocina…): cada uno con su estado general, sus ítems (cantidad, estado y
//                    observación) y sus fotos (van a R2 con negArchivoSubir y salen en el PDF en «Registro fotográfico»);
//       Observaciones aspectos generales, observaciones, propiedad y firmantes.
//     «Guardar y actualizar PDF» lo guarda en el negocio (ciclo.entrega) y vuelve a generar el PDF.
//   · derecha: el PDF tal como se enviará a firmar. Firman el arrendatario y los propietarios.
// Al firmarse el acta la propiedad queda «Arrendada»; el negocio sigue abierto hasta cobrar la comisión.
// La lógica (guardar, generar el PDF, enviar) está en src/renderer/etapas.js (actaEntrega) y llega en las props.
// El formato antiguo de ciclo.entrega (inventario [{ espacio, estado, nota }], medidores luz/agua/gas) se lee igual (normalizarEntrega).
// Los id (#aeFecha, #aeLlaves, #aeLuzNum, #aeLuzLec, #aeAguaNum…, #aeTabs, [data-espacio], #aeNuevoEspacio, #aeAgregar,
// #aeEspacio, #aeEstado, #aeNota, #aeItemNombre-N, #aeItemCant-N, #aeItemEstado-N, #aeItemNota-N, #aeItemQuitar-N, #aeAgregarItem,
// #aeFotos, #aeVolver, #aeObs, #aeGuardar, #mOk, #mCancel) los usan las pruebas.
/* eslint-disable @typescript-eslint/no-explicit-any -- ciclo.entrega llega del proceso principal sin tipos */
import { useEffect, useRef, useState } from 'react';
import Boton from '../../ui/Boton';
import MenuMas from '../../ui/MenuMas';
import Badge from '../../ui/Badge';
import Card from '../../ui/Card';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import Textarea from '../../ui/Textarea';
import Tabs from '../../ui/Tabs';
import Checkbox from '../../ui/Checkbox';
import InputArchivo from '../../ui/InputArchivo';
import ItemLista, { Miniatura } from '../../ui/ItemLista';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../ui/Ventana';
import { NOTA } from '../gestion/editor-pdf/Modales';
import { ErrorVentana } from './VentanasAntiguas';
import { cerrarModal } from '../../../utils/modal';
import { toast } from '../../../utils/app';
import { api } from '../../../utils/api';
import { descargarPdf } from '../../../utils/pdf';
import VisorPdf, { PdfCargando } from '../agenda/VisorPdf';
import { usePdfInicial, type IPdfInicial } from '../agenda/usePdfInicial';

export type TMedidor = 'luz' | 'agua' | 'aguaCaliente' | 'gas' | 'calefaccion';
export interface IFotoEntrega { clave: string; nombre: string }
export interface IItemEntrega { nombre: string; cantidad: string; estado: string; nota: string }
export interface IEspacioEntrega { espacio: string; estado: string; nota: string; items: IItemEntrega[]; fotos: IFotoEntrega[] }
export interface IEntregaDatos {
  fecha: string; gastosComunesDesde: string;
  entregadoPor: { nombre: string; rut: string };
  estacionamientos: string; bodega: string;
  accesos: { nombre: string; cantidad: string }[];
  llaves: string;
  aspectos: string[];
  medidores: Record<TMedidor, { numero: string; lectura: string }>;
  inventario: IEspacioEntrega[];
  observaciones: string;
}
export interface IActaEntregaProps {
  negocioId: string;
  pdf?: string;
  /** lo que impidió armar el PDF (falta la fecha, el correo de un firmante…): se muestra al abrir y se corrige aquí mismo */
  errorInicial?: string;
  /** el PDF que se está armando (o trayendo): la ventana se abre ya y la vista previa lo muestra al llegar */
  pdfPromesa?: Promise<IPdfInicial>;
  /** ciclo.entrega tal como está guardado (formato nuevo, antiguo o vacío) */
  entrega: unknown;
  propiedad: { codigo: string; titulo: string; direccion: string };
  firmantes: { nombre: string; rol: string }[];
  alGuardar: (d: IEntregaDatos) => Promise<{ pdf: string; firmantes?: { nombre: string; rol: string }[] }>;
  alConfirmar: () => Promise<void>;
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));
/** guarda el PDF en el computador: firmar en Asset es opcional */
const bajar = async (pdf: string, nombre: string, avisar: (m: string) => void) => { if (!pdf) return; try { if (await descargarPdf(pdf, nombre)) toast('PDF guardado.'); } catch (e) { avisar(mensaje(e)); } };
const ESTADOS: [string, string][] = [['bueno', 'Bueno'], ['regular', 'Regular'], ['malo', 'Malo'], ['na', 'No aplica']];
const ESTADO_TXT = Object.fromEntries(ESTADOS) as Record<string, string>;
const MEDIDORES: [TMedidor, string, string][] = [['luz', 'Electricidad', 'Luz'], ['agua', 'Agua fría', 'Agua'], ['aguaCaliente', 'Agua caliente', 'AguaCal'], ['gas', 'Gas', 'Gas'], ['calefaccion', 'Calefacción', 'Calef']];
/** del modelo «Inventario habitacional» de la corredora: los recintos y los elementos que se revisan en cada uno */
export const ESPACIOS_MODELO = ['Entrada', 'Living', 'Comedor', 'Cocina', 'Logia y despensa', 'Terraza living', 'Baño visita', 'Dormitorio principal', 'Baño principal', 'Dormitorio secundario 1', 'Baño secundario', 'Dormitorio de servicio', 'Baño de servicio'];
export const ITEMS_MODELO = ['Puerta', 'Enchufes', 'Interruptores', 'Focos empotrados', 'Focos apliques', 'Pisos', 'Manillas', 'Ampolletas', 'Quincallería', 'Equipamiento'];
/** con qué espacios parte un inventario nuevo (los de servicio y visita se agregan si la propiedad los tiene) */
const ESPACIOS_INICIALES = ['Entrada', 'Living', 'Comedor', 'Cocina', 'Logia y despensa', 'Terraza living', 'Dormitorio principal', 'Baño principal', 'Dormitorio secundario 1', 'Baño secundario'];
const ACCESOS_MODELO = ['Llaves puerta principal', 'Control remoto portón', 'Llaves portón', 'Llaves de bodega', 'Chips de acceso (puertas magnéticas)'];
/** aspectos generales del modelo: se marcan los que corresponden */
export const ASPECTOS_MODELO = ['Grifería completa funcionando', 'Luces en toda la propiedad funcionando', 'Se entrega con aseo profundo realizado', 'Muros pintados y pisos en buen estado'];
/** cuántas fotos (igual que en la API, src/negocios/acta-entrega-datos.ts): el PDF debe pesar poco */
const FOTOS_POR_ESPACIO = 6; const FOTOS_TOTAL = 40; const FOTO_MAX_MB = 15; const LADO_MAX = 1600;

const s = (v: unknown) => (v == null ? '' : String(v));
const itemsModelo = (): IItemEntrega[] => ITEMS_MODELO.map((nombre) => ({ nombre, cantidad: '', estado: 'bueno', nota: '' }));
const espacioNuevo = (espacio: string): IEspacioEntrega => ({ espacio, estado: 'bueno', nota: '', items: itemsModelo(), fotos: [] });

/** ciclo.entrega (nuevo, antiguo o vacío) → los datos completos de la ventana */
export function normalizarEntrega(e0: unknown): IEntregaDatos {
  const e = (e0 && typeof e0 === 'object' ? e0 : {}) as any;
  const arr = (x: unknown): any[] => (Array.isArray(x) ? x : []);
  const inv = arr(e.inventario);
  const acc = arr(e.accesos);
  return {
    fecha: s(e.fecha), gastosComunesDesde: s(e.gastosComunesDesde),
    entregadoPor: { nombre: s(e.entregadoPor?.nombre), rut: s(e.entregadoPor?.rut) },
    estacionamientos: s(e.estacionamientos), bodega: s(e.bodega),
    accesos: acc.length ? acc.map((a) => ({ nombre: s(a?.nombre), cantidad: s(a?.cantidad) })) : ACCESOS_MODELO.map((nombre) => ({ nombre, cantidad: '' })),
    llaves: s(e.llaves),
    aspectos: arr(e.aspectos).map(s).filter(Boolean),
    medidores: Object.fromEntries(MEDIDORES.map(([k]) => [k, { numero: s(e.medidores?.[k]?.numero), lectura: s(e.medidores?.[k]?.lectura) }])) as IEntregaDatos['medidores'],
    inventario: inv.length
      ? inv.map((i) => ({
        espacio: s(i?.espacio), estado: s(i?.estado) || 'bueno', nota: s(i?.nota),
        items: arr(i?.items).map((it) => ({ nombre: s(it?.nombre), cantidad: s(it?.cantidad), estado: s(it?.estado) || 'bueno', nota: s(it?.nota) })),
        fotos: arr(i?.fotos).filter((f) => f?.clave).map((f) => ({ clave: s(f.clave), nombre: s(f.nombre) || 'foto.jpg' })),
      }))
      : ESPACIOS_INICIALES.map(espacioNuevo),
    observaciones: s(e.observaciones),
  };
}

/** lo que se guarda: sin espacios ni ítems vacíos y con el texto recortado */
function limpiar(v: IEntregaDatos): IEntregaDatos {
  return {
    ...v,
    entregadoPor: { nombre: v.entregadoPor.nombre.trim(), rut: v.entregadoPor.rut.trim() },
    estacionamientos: v.estacionamientos.trim(), bodega: v.bodega.trim(), llaves: v.llaves.trim(), observaciones: v.observaciones.trim(),
    accesos: v.accesos.map((a) => ({ nombre: a.nombre.trim(), cantidad: a.cantidad.trim() })).filter((a) => a.nombre),
    inventario: v.inventario.filter((i) => i.espacio.trim()).map((i) => ({
      ...i, espacio: i.espacio.trim(), nota: i.nota.trim(),
      items: i.items.filter((it) => it.nombre.trim()).map((it) => ({ ...it, nombre: it.nombre.trim(), cantidad: it.cantidad.trim(), nota: it.nota.trim() })),
    })),
  };
}

/** achica la foto antes de subirla (lado mayor 1600 px, JPEG): sube rápido y el PDF pesa poco */
async function achicar(f: File): Promise<{ blob: Blob; nombre: string }> {
  try {
    const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' });
    const esc = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * esc); c.height = Math.round(bmp.height * esc);
    c.getContext('2d')?.drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.82));
    if (blob) return { blob, nombre: `${f.name.replace(/\.[^.]+$/, '') || 'foto'}.jpg` };
  } catch { /* si no se puede leer aquí, se sube tal cual */ }
  return { blob: f, nombre: f.name || 'foto.jpg' };
}

type TPestana = 'entrega' | 'inventario' | 'cierre';

export function ActaEntrega({ negocioId, pdf: pdf0, pdfPromesa, errorInicial, entrega, propiedad, firmantes: firmantes0, alGuardar, alConfirmar }: IActaEntregaProps) {
  const [inicial] = useState(() => normalizarEntrega(entrega));
  const [v, setV] = useState<IEntregaDatos>(inicial);
  const [guardado, setGuardado] = useState<IEntregaDatos>(inicial);
  const { pdf, setPdf, cargando: cargandoPdf, errorCarga } = usePdfInicial(pdf0, pdfPromesa); const [firmantes, setFirmantes] = useState(firmantes0);
  const [guardando, setGuardando] = useState(false); const [enviando, setEnviando] = useState(false); const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState(errorInicial || '');
  const [tab, setTab] = useState<TPestana>('entrega');
  const [sel, setSel] = useState<number | null>(null);
  const [nuevoEspacio, setNuevoEspacio] = useState('');
  // vista previa de las fotos subidas en esta sesión (las ya guardadas se abren con «Ver»)
  const [vistas, setVistas] = useState<Record<string, string>>({});
  const vistasRef = useRef(vistas); vistasRef.current = vistas;
  useEffect(() => () => { Object.values(vistasRef.current).forEach((u) => URL.revokeObjectURL(u)); }, []);

  const sucio = JSON.stringify(v) !== JSON.stringify(guardado);
  const err = {
    fecha: !/^\d{4}-\d{2}-\d{2}$/.test(v.fecha) ? 'Elige la fecha de entrega' : '',
    inventario: !v.inventario.some((i) => i.espacio.trim()) ? 'Agrega al menos un espacio al inventario' : '',
  };
  const invalido = Object.values(err).some(Boolean);
  const totalFotos = v.inventario.reduce((n, i) => n + i.fotos.length, 0);
  const cambiar = (f: (x: IEntregaDatos) => IEntregaDatos) => { setV(f); setError(''); };
  const campo = <K extends keyof IEntregaDatos>(k: K, val: IEntregaDatos[K]) => cambiar((x) => ({ ...x, [k]: val }));
  const espacio = (i: number, f: (e: IEspacioEntrega) => IEspacioEntrega) => cambiar((x) => ({ ...x, inventario: x.inventario.map((e, j) => (j === i ? f(e) : e)) }));
  const item = (i: number, j: number, k: keyof IItemEntrega, val: string) => espacio(i, (e) => ({ ...e, items: e.items.map((it, n) => (n === j ? { ...it, [k]: val } : it)) }));
  const medidor = (k: TMedidor, c: 'numero' | 'lectura', val: string) => cambiar((x) => ({ ...x, medidores: { ...x.medidores, [k]: { ...x.medidores[k], [c]: val } } }));
  const acceso = (i: number, k: 'nombre' | 'cantidad', val: string) => cambiar((x) => ({ ...x, accesos: x.accesos.map((a, j) => (j === i ? { ...a, [k]: val } : a)) }));

  const agregarEspacio = () => {
    const nombre = nuevoEspacio.trim() || `Espacio ${v.inventario.length + 1}`;
    cambiar((x) => ({ ...x, inventario: [...x.inventario, espacioNuevo(nombre)] }));
    setNuevoEspacio(''); setSel(v.inventario.length);
  };
  const quitarEspacio = (i: number) => { cambiar((x) => ({ ...x, inventario: x.inventario.filter((_, j) => j !== i) })); setSel(null); };

  const subirFotos = async (i: number, archivos: File[]) => {
    const e = v.inventario[i]; if (!e) return;
    const libres = Math.min(FOTOS_POR_ESPACIO - e.fotos.length, FOTOS_TOTAL - totalFotos);
    if (libres <= 0) return setError(e.fotos.length >= FOTOS_POR_ESPACIO ? `Cada espacio lleva hasta ${FOTOS_POR_ESPACIO} fotos.` : `El acta lleva hasta ${FOTOS_TOTAL} fotos en total.`);
    const validas = archivos.filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type) && f.size <= FOTO_MAX_MB * 1024 * 1024);
    const avisos: string[] = [];
    if (validas.length < archivos.length) avisos.push(`Se omitieron fotos que no son JPG, PNG o WebP o que pesan más de ${FOTO_MAX_MB} MB.`);
    if (validas.length > libres) avisos.push(`Solo se agregaron ${libres}: cada espacio lleva hasta ${FOTOS_POR_ESPACIO} fotos y el acta hasta ${FOTOS_TOTAL}.`);
    setSubiendo(true); setError('');
    const nuevas: IFotoEntrega[] = []; const urls: Record<string, string> = {};
    try {
      for (const f of validas.slice(0, libres)) {
        const { blob, nombre } = await achicar(f);
        const r = await api<{ clave: string; nombre: string }>('negArchivoSubir', { negocioId, nombre, mime: blob.type || 'image/jpeg', bytes: new Uint8Array(await blob.arrayBuffer()) });
        nuevas.push({ clave: r.clave, nombre: r.nombre || nombre }); urls[r.clave] = URL.createObjectURL(blob);
      }
    } catch (er) { avisos.unshift(mensaje(er)); }
    if (nuevas.length) { espacio(i, (x) => ({ ...x, fotos: [...x.fotos, ...nuevas] })); setVistas((m) => ({ ...m, ...urls })); }
    setError(avisos.join(' ')); setSubiendo(false);
  };
  const verFoto = async (f: IFotoEntrega) => { try { await api('negArchivoAbrir', { negocioId, clave: f.clave, nombre: f.nombre }); } catch (e) { setError(mensaje(e)); } };

  const guardar = async () => {
    if (invalido) return setError('Corrige los datos marcados antes de guardar.');
    setGuardando(true); setError('');
    try {
      const nuevo = limpiar(v);
      const r = await alGuardar(nuevo);
      setV(nuevo); setGuardado(nuevo); setPdf(r.pdf); if (r.firmantes) setFirmantes(r.firmantes);
      if (sel != null && sel >= nuevo.inventario.length) setSel(null);
    } catch (e) { setError(mensaje(e)); }
    setGuardando(false);
  };
  const enviar = async () => { setEnviando(true); setError(''); try { await alConfirmar(); } catch (e) { setError(mensaje(e)); setEnviando(false); } };

  const e = sel != null ? v.inventario[sel] : undefined;
  const sugeridos = ESPACIOS_MODELO.filter((n) => !v.inventario.some((i) => i.espacio.trim().toLowerCase() === n.toLowerCase()));

  const pestanaEntrega = <>
    <Card titulo="Entrega" subtitulo="Fecha, quién entrega y unidades">
      <div className="tw:flex tw:flex-col tw:gap-3">
        <div className="tw:grid tw:grid-cols-2 tw:gap-3">
          <Input etiqueta="Fecha de entrega" id="aeFecha" type="date" pendiente={!v.fecha} error={v.fecha ? err.fecha : ''} value={v.fecha} onChange={(x) => campo('fecha', x.target.value)} />
          <Input etiqueta="Gastos comunes desde" id="aeGastos" type="date" ayuda="Si lo dejas vacío, desde la entrega" value={v.gastosComunesDesde} onChange={(x) => campo('gastosComunesDesde', x.target.value)} />
        </div>
        <div className="tw:grid tw:grid-cols-[1fr_130px] tw:gap-3">
          <Input etiqueta="Entrega (en representación de la corredora)" id="aeEntregaNombre" placeholder="Tu nombre" autoComplete="off" value={v.entregadoPor.nombre} onChange={(x) => campo('entregadoPor', { ...v.entregadoPor, nombre: x.target.value })} />
          <Input etiqueta="RUT" id="aeEntregaRut" autoComplete="off" value={v.entregadoPor.rut} onChange={(x) => campo('entregadoPor', { ...v.entregadoPor, rut: x.target.value })} />
        </div>
        <div className="tw:grid tw:grid-cols-2 tw:gap-3">
          <Input etiqueta="Estacionamientos n.º" id="aeEstac" autoComplete="off" placeholder="Ej.: E-12" value={v.estacionamientos} onChange={(x) => campo('estacionamientos', x.target.value)} />
          <Input etiqueta="Bodega n.º" id="aeBodega" autoComplete="off" value={v.bodega} onChange={(x) => campo('bodega', x.target.value)} />
        </div>
      </div>
    </Card>

    <Card titulo="Llaves y accesos" subtitulo="Cantidad entregada de cada una">
      <div className="tw:flex tw:flex-col tw:gap-3">
        {v.accesos.map((a, i) => (
          <div key={i} className="tw:flex tw:items-end tw:gap-2 tw:flex-nowrap">
            <div className="tw:min-w-0 tw:flex-1"><Input etiqueta="Llave, control o acceso" id={`aeAcceso-${i}`} autoComplete="off" value={a.nombre} onChange={(x) => acceso(i, 'nombre', x.target.value)} /></div>
            <div className="tw:w-[84px] tw:flex-none"><Input etiqueta="Cantidad" id={`aeAccesoCant-${i}`} inputMode="numeric" autoComplete="off" value={a.cantidad} onChange={(x) => acceso(i, 'cantidad', x.target.value)} /></div>
            <Boton id={`aeAccesoQuitar-${i}`} tamano="sm" variante="secundario" icono="trash" aria-label="Quitar" title="Quitar" onClick={() => cambiar((x) => ({ ...x, accesos: x.accesos.filter((_, j) => j !== i) }))} />
          </div>
        ))}
        <div className="tw:flex tw:justify-end"><Boton id="aeAccesoAgregar" tamano="sm" variante="secundario" icono="plus" onClick={() => cambiar((x) => ({ ...x, accesos: [...x.accesos, { nombre: '', cantidad: '' }] }))}>Agregar llave o control</Boton></div>
        <Input etiqueta="Detalle de llaves (opcional)" id="aeLlaves" placeholder="Ej.: 1 llave del buzón" value={v.llaves} onChange={(x) => campo('llaves', x.target.value)} />
      </div>
    </Card>

    <Card titulo="Consumos" subtitulo="Número y lectura de cada medidor el día de la entrega">
      <div className="tw:flex tw:flex-col tw:gap-3">
        {MEDIDORES.map(([k, nombre, idk]) => (
          <div key={k} className="tw:grid tw:grid-cols-2 tw:gap-3">
            <Input etiqueta={`${nombre} · n.º`} id={`ae${idk}Num`} autoComplete="off" value={v.medidores[k].numero} onChange={(x) => medidor(k, 'numero', x.target.value)} />
            <Input etiqueta="Lectura" id={`ae${idk}Lec`} autoComplete="off" value={v.medidores[k].lectura} onChange={(x) => medidor(k, 'lectura', x.target.value)} />
          </div>
        ))}
      </div>
    </Card>
  </>;

  const listaEspacios = (
    <Card titulo="Espacios" subtitulo="Toca un espacio para anotar sus ítems y subir fotos">
      <div className="tw:flex tw:flex-col tw:gap-1">
        {v.inventario.map((i, n) => (
          <ItemLista key={n} data-espacio={n} alTocar={() => setSel(n)} flecha
            media={<Miniatura src={i.fotos.map((f) => vistas[f.clave]).find(Boolean)} icono="house" tam={40} />}
            titulo={i.espacio.trim() || 'Sin nombre'}
            detalle={`${i.items.length} ítems · ${i.fotos.length} fotos${i.nota.trim() ? ` · ${i.nota.trim()}` : ''}`}
            derecha={<Badge tono={i.estado === 'malo' ? 'rojo' : i.estado === 'regular' ? 'amarillo' : 'gris'}>{ESTADO_TXT[i.estado] || 'Bueno'}</Badge>} />
        ))}
        {err.inventario && <p className="error tw:m-0 tw:text-[13px]">{err.inventario}</p>}
        <div className="tw:flex tw:items-end tw:gap-2 tw:flex-nowrap tw:mt-2">
          <div className="tw:min-w-0 tw:flex-1"><Input etiqueta="Nuevo espacio" id="aeNuevoEspacio" list="aeSugeridos" autoComplete="off" placeholder={sugeridos[0] ? `Ej.: ${sugeridos[0]}` : 'Ej.: Bodega'} value={nuevoEspacio} onChange={(x) => setNuevoEspacio(x.target.value)} onKeyDown={(x) => { if (x.key === 'Enter') agregarEspacio(); }} /></div>
          <Boton id="aeAgregar" tamano="sm" variante="secundario" icono="plus" onClick={agregarEspacio}>Agregar espacio</Boton>
        </div>
        <datalist id="aeSugeridos">{sugeridos.map((n) => <option key={n} value={n} />)}</datalist>
        <p className={`${NOTA} tw:mt-1`}>{totalFotos} de {FOTOS_TOTAL} fotos · cada espacio nuevo trae los ítems del inventario de la corredora.</p>
      </div>
    </Card>
  );

  const detalleEspacio = e && sel != null && (
    <Card titulo={e.espacio.trim() || 'Espacio sin nombre'} subtitulo={`${e.items.length} ítems · ${e.fotos.length} de ${FOTOS_POR_ESPACIO} fotos`}
      accion={<Boton id="aeVolver" tamano="sm" variante="secundario" icono="chevL" onClick={() => setSel(null)}>Espacios</Boton>}>
      <div className="tw:flex tw:flex-col tw:gap-3">
        <div className="tw:grid tw:grid-cols-[1fr_120px] tw:gap-3">
          <Input etiqueta="Espacio" id="aeEspacio" autoComplete="off" list="aeSugeridos" value={e.espacio} error={!e.espacio.trim() ? 'Ponle nombre' : ''} onChange={(x) => espacio(sel, (z) => ({ ...z, espacio: x.target.value }))} />
          <Select etiqueta="Estado general" id="aeEstado" opciones={ESTADOS.filter(([k]) => k !== 'na')} value={e.estado} onChange={(x) => espacio(sel, (z) => ({ ...z, estado: x.target.value }))} />
        </div>
        <Input etiqueta="Observación del espacio" id="aeNota" autoComplete="off" value={e.nota} onChange={(x) => espacio(sel, (z) => ({ ...z, nota: x.target.value }))} />

        <h4 className="tw:m-0 tw:mt-1 tw:text-[13px] tw:font-bold">Ítems</h4>
        {e.items.map((it, j) => (
          <div key={j} className="tw:flex tw:flex-col tw:gap-2" data-item={j}>
            <div className="tw:grid tw:grid-cols-[1fr_72px_116px] tw:gap-2">
              <Input etiqueta="Ítem" id={`aeItemNombre-${j}`} autoComplete="off" value={it.nombre} onChange={(x) => item(sel, j, 'nombre', x.target.value)} />
              <Input etiqueta="Cant." id={`aeItemCant-${j}`} inputMode="numeric" autoComplete="off" value={it.cantidad} onChange={(x) => item(sel, j, 'cantidad', x.target.value)} />
              <Select etiqueta="Estado" id={`aeItemEstado-${j}`} opciones={ESTADOS} value={it.estado} onChange={(x) => item(sel, j, 'estado', x.target.value)} />
            </div>
            <div className="tw:flex tw:items-end tw:gap-2 tw:flex-nowrap">
              <div className="tw:min-w-0 tw:flex-1"><Input etiqueta="Observación" id={`aeItemNota-${j}`} autoComplete="off" value={it.nota} onChange={(x) => item(sel, j, 'nota', x.target.value)} /></div>
              <Boton id={`aeItemQuitar-${j}`} tamano="sm" variante="secundario" icono="trash" aria-label="Quitar ítem" title="Quitar ítem" onClick={() => espacio(sel, (z) => ({ ...z, items: z.items.filter((_, n) => n !== j) }))} />
            </div>
          </div>
        ))}
        {!e.items.length && <p className={`${NOTA} tw:m-0`}>Sin ítems: el PDF muestra solo el estado general del espacio.</p>}
        <div className="tw:flex tw:justify-end tw:gap-2 tw:flex-nowrap">
          <Boton id="aeAgregarItem" tamano="sm" variante="secundario" icono="plus" onClick={() => espacio(sel, (z) => ({ ...z, items: [...z.items, { nombre: '', cantidad: '', estado: 'bueno', nota: '' }] }))}>Agregar ítem</Boton>
          <MenuMas id="aeEspacioMas" tamano="sm" opciones={[
            { id: 'aeItemsModelo', texto: 'Agregar ítems habituales', icono: 'listCheck', alTocar: () => espacio(sel, (z) => ({ ...z, items: [...z.items, ...itemsModelo().filter((m) => !z.items.some((it) => it.nombre.trim().toLowerCase() === m.nombre.toLowerCase()))] })) },
            { id: 'aeQuitarEspacio', texto: 'Quitar este espacio', icono: 'trash', alTocar: () => quitarEspacio(sel) },
          ]} />
        </div>

        <h4 className="tw:m-0 tw:mt-1 tw:text-[13px] tw:font-bold">Fotos</h4>
        {e.fotos.map((f, j) => (
          <ItemLista key={f.clave} data-foto={j} media={<Miniatura src={vistas[f.clave]} icono="image" tam={44} />} titulo={f.nombre} detalle={vistas[f.clave] ? 'Subida recién' : 'Guardada'}
            derecha={<>
              <Boton tamano="sm" variante="secundario" icono="search" onClick={() => verFoto(f)}>Ver</Boton>
              <Boton id={`aeFotoQuitar-${j}`} tamano="sm" variante="secundario" icono="trash" aria-label="Quitar foto" title="Quitar foto" onClick={() => espacio(sel, (z) => ({ ...z, fotos: z.fotos.filter((_, n) => n !== j) }))} />
            </>} />
        ))}
        {e.fotos.length < FOTOS_POR_ESPACIO && (
          <InputArchivo id="aeFotos" etiqueta="Subir fotos de este espacio" icono="image" accept="image/jpeg,image/png,image/webp" multiple cargando={subiendo} disabled={enviando}
            ayuda={`JPG, PNG o WebP · hasta ${FOTOS_POR_ESPACIO} por espacio · salen en el PDF en «Registro fotográfico»`} onArchivos={(fs) => subirFotos(sel, fs)} />
        )}
      </div>
    </Card>
  );

  const pestanaCierre = <>
    <Card titulo="Aspectos generales" subtitulo="Marca los que se cumplen al entregar">
      <div className="tw:flex tw:flex-col tw:gap-2">
        {ASPECTOS_MODELO.map((a, i) => (
          <Checkbox key={a} id={`aeAspecto-${i}`} etiqueta={a} marcado={v.aspectos.includes(a)}
            alCambiar={(m) => campo('aspectos', m ? [...v.aspectos, a] : v.aspectos.filter((x) => x !== a))} />
        ))}
      </div>
    </Card>
    <Card titulo="Observaciones" subtitulo="Opcional">
      <Textarea etiqueta="Observaciones generales" id="aeObs" rows={4} value={v.observaciones} onChange={(x) => campo('observaciones', x.target.value)} />
    </Card>
    <Card titulo="Propiedad y firmantes" subtitulo="Firman ambas partes">
      <div className="tw:flex tw:flex-col tw:gap-2">
        <div className="tw:flex tw:items-start tw:gap-2.5">
          <Badge tono="lavanda">{propiedad.codigo}</Badge>
          <span className="tw:min-w-0 tw:flex-1 tw:text-[13px]"><b className="tw:block tw:font-semibold tw:truncate">{propiedad.titulo}</b><span className="tw:text-muted">{propiedad.direccion}</span></span>
        </div>
        <div className="tw:flex tw:flex-wrap tw:gap-1.5">{firmantes.map((x, i) => <Badge key={i} tono="gris">{x.rol}: {x.nombre}</Badge>)}</div>
      </div>
    </Card>
  </>;

  return <>
    <VentanaCabecera icono="sign" titulo="Acta de entrega e inventario" descripcion="Anota cómo se entrega la propiedad: el PDF se actualiza al guardar." cerrable={!enviando} />
    <VentanaCuerpo>
      <div className="ov-doble tw:grid tw:grid-cols-1 tw:lg:grid-cols-[minmax(340px,440px)_1fr] tw:gap-4 tw:items-start">
        <div className="tw:flex tw:flex-col tw:gap-3 tw:min-w-0">
          <Tabs id="aeTabs" etiqueta="Partes del acta" valor={tab} alCambiar={setTab} className="tw:self-start"
            opciones={[['entrega', 'Entrega'], ['inventario', 'Inventario', v.inventario.length], ['cierre', 'Observaciones']]} />
          {tab === 'entrega' && pestanaEntrega}
          {tab === 'inventario' && (detalleEspacio || listaEspacios)}
          {tab === 'cierre' && pestanaCierre}
          <ErrorVentana id="aeErr" texto={error || errorCarga} />
        </div>

        <Card titulo="Vista previa" subtitulo="Así se envía a firmar" relleno={true} className="tw:min-w-0 tw:lg:sticky tw:lg:top-0">
          <div className={guardando ? 'tw:opacity-50 tw:transition-opacity' : 'tw:transition-opacity'}>{pdf ? <VisorPdf base64={pdf} /> : cargandoPdf ? <PdfCargando /> : <p className={NOTA}>No se pudo preparar el PDF: completa la fecha y el inventario y guarda.</p>}</div>
        </Card>
      </div>
      <p className={`${NOTA} tw:mt-3`}>Se cobra del saldo de Portalfirma. Cuando firmen ambas partes, la propiedad queda «Arrendada». El texto es un borrador para que lo revise el notario.</p>
    </VentanaCuerpo>
    <VentanaPie>
      {sucio ? <span className="tw:mr-auto tw:text-xs tw:text-muted">Cambios sin guardar</span> : <span className="tw:mr-auto"><Badge tono="verde" icono="check" ajustar>Todo guardado</Badge></span>}
      <Boton id="aeGuardar" variante="secundario" icono="save" cargando={guardando} disabled={!sucio || enviando || subiendo} onClick={guardar}>Guardar y actualizar PDF</Boton>
      <Boton id="mOk" icono="sign" disabled={cargandoPdf || sucio || invalido || guardando || enviando || subiendo || !pdf} cargando={enviando} onClick={enviar} title={sucio ? 'Guarda los cambios antes de enviar' : undefined}>{enviando ? 'Enviando…' : 'Generar y enviar a firmar'}</Boton>
      <MenuMas id="aeMas" opciones={[
        { id: 'aeDescargar', texto: 'Descargar PDF', icono: 'download', disabled: !pdf || guardando, alTocar: () => bajar(pdf, 'Acta de entrega.pdf', setError) },
        { id: 'mCancel', texto: 'Cancelar', icono: 'x', disabled: enviando, alTocar: cerrarModal },
      ]} />
    </VentanaPie>
  </>;
}
