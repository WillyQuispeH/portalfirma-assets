// modal-128: el acta de entrega e inventario de un arriendo, lista para llenar y enviar a firmar (misma idea que el contrato, modal-127).
//   · izquierda: fecha de entrega, llaves, medidores (luz, agua, gas), inventario por espacio (estado y observación) y observaciones.
//     «Guardar y actualizar PDF» lo guarda en el negocio (ciclo.entrega) y vuelve a generar el PDF.
//   · derecha: el PDF tal como se enviará a firmar. Firman el arrendatario y los propietarios.
// Al firmarse el acta la propiedad queda «Arrendada»; el negocio sigue abierto hasta cobrar la comisión.
// La lógica (guardar, generar el PDF, enviar) está en src/renderer/etapas.js (actaEntrega) y llega en las props.
// Los id (#aeFecha, #aeLlaves, #aeLuzNum, #aeLuzLec, #aeAguaNum, #aeAguaLec, #aeGasNum, #aeGasLec, #aeAgregar, #aeEspacio-N, #aeEstado-N,
// #aeNota-N, #aeQuitar-N, #aeObs, #aeGuardar, #mOk, #mCancel) los usan las pruebas.
import { useState } from 'react';
import Boton from '../../ui/Boton';
import Badge from '../../ui/Badge';
import Card from '../../ui/Card';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import Textarea from '../../ui/Textarea';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../ui/Ventana';
import { NOTA } from '../gestion/editor-pdf/Modales';
import { ErrorVentana } from './VentanasAntiguas';
import { cerrarModal } from '../../../utils/modal';
import VisorPdf from '../agenda/VisorPdf';

export interface IItemInventario { espacio: string; estado: string; nota: string }
export interface IEntregaDatos {
  fecha: string; llaves: string; observaciones: string;
  medidores: Record<'luz' | 'agua' | 'gas', { numero: string; lectura: string }>;
  inventario: IItemInventario[];
}
export interface IActaEntregaProps {
  pdf?: string;
  /** lo que impidió armar el PDF (falta la fecha, el correo de un firmante…): se muestra al abrir y se corrige aquí mismo */
  errorInicial?: string;
  datos: IEntregaDatos;
  propiedad: { codigo: string; titulo: string; direccion: string };
  firmantes: { nombre: string; rol: string }[];
  alGuardar: (d: IEntregaDatos) => Promise<{ pdf: string; firmantes?: { nombre: string; rol: string }[] }>;
  alConfirmar: () => Promise<void>;
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));
const ESTADOS: [string, string][] = [['bueno', 'Bueno'], ['regular', 'Regular'], ['malo', 'Malo'], ['na', 'No aplica']];
const MEDIDORES: ['luz' | 'agua' | 'gas', string][] = [['luz', 'Electricidad'], ['agua', 'Agua'], ['gas', 'Gas']];
/** los espacios con que parte un inventario nuevo (se editan, quitan y agregan libremente) */
export const INVENTARIO_BASE = ['Living-comedor', 'Cocina', 'Dormitorio principal', 'Baño', 'Pisos y muros', 'Ventanas y puertas'];

export function ActaEntrega({ pdf: pdf0, errorInicial, datos, propiedad, firmantes: firmantes0, alGuardar, alConfirmar }: IActaEntregaProps) {
  const [v, setV] = useState<IEntregaDatos>(datos);
  const [guardado, setGuardado] = useState<IEntregaDatos>(datos);
  const [pdf, setPdf] = useState(pdf0 || ''); const [firmantes, setFirmantes] = useState(firmantes0);
  const [guardando, setGuardando] = useState(false); const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(errorInicial || '');
  const sucio = JSON.stringify(v) !== JSON.stringify(guardado);
  const limpio = (e: string) => { setError(e); };
  const err = {
    fecha: !/^\d{4}-\d{2}-\d{2}$/.test(v.fecha) ? 'Elige la fecha de entrega' : '',
    inventario: !v.inventario.some((i) => i.espacio.trim()) ? 'Agrega al menos un espacio al inventario' : '',
  };
  const invalido = Object.values(err).some(Boolean);
  const cambiarItem = (i: number, k: keyof IItemInventario, val: string) => { setV((x) => ({ ...x, inventario: x.inventario.map((it, j) => (j === i ? { ...it, [k]: val } : it)) })); limpio(''); };
  const medidor = (k: 'luz' | 'agua' | 'gas', c: 'numero' | 'lectura', val: string) => { setV((x) => ({ ...x, medidores: { ...x.medidores, [k]: { ...x.medidores[k], [c]: val } } })); limpio(''); };

  const guardar = async () => {
    if (invalido) return setError('Corrige los datos marcados antes de guardar.');
    setGuardando(true); setError('');
    try {
      const nuevo = { ...v, inventario: v.inventario.filter((i) => i.espacio.trim()) };
      const r = await alGuardar(nuevo);
      setV(nuevo); setGuardado(nuevo); setPdf(r.pdf); if (r.firmantes) setFirmantes(r.firmantes);
    } catch (e) { setError(mensaje(e)); }
    setGuardando(false);
  };
  const enviar = async () => { setEnviando(true); setError(''); try { await alConfirmar(); } catch (e) { setError(mensaje(e)); setEnviando(false); } };

  return <>
    <VentanaCabecera icono="sign" titulo="Acta de entrega e inventario" descripcion="Anota cómo se entrega la propiedad: el PDF se actualiza al guardar." cerrable={!enviando} />
    <VentanaCuerpo>
      <div className="ov-doble tw:grid tw:grid-cols-1 tw:lg:grid-cols-[minmax(320px,420px)_1fr] tw:gap-4 tw:items-start">
        <div className="tw:flex tw:flex-col tw:gap-3">
          <Card titulo="Entrega" subtitulo="Fecha y llaves">
            <div className="tw:flex tw:flex-col tw:gap-3">
              <Input etiqueta="Fecha de entrega" id="aeFecha" type="date" pendiente={!v.fecha} error={v.fecha ? err.fecha : ''} value={v.fecha} onChange={(e) => { setV((x) => ({ ...x, fecha: e.target.value })); limpio(''); }} />
              <Input etiqueta="Llaves entregadas" id="aeLlaves" placeholder="Ej.: 2 llaves de la puerta y 1 del buzón" value={v.llaves} onChange={(e) => { setV((x) => ({ ...x, llaves: e.target.value })); limpio(''); }} />
            </div>
          </Card>

          <Card titulo="Medidores" subtitulo="Número y lectura del día de la entrega">
            <div className="tw:flex tw:flex-col tw:gap-3">
              {MEDIDORES.map(([k, nombre]) => (
                <div key={k} className="tw:grid tw:grid-cols-2 tw:gap-3">
                  <Input etiqueta={`${nombre} · n.º`} id={`ae${k === 'luz' ? 'Luz' : k === 'agua' ? 'Agua' : 'Gas'}Num`} autoComplete="off" value={v.medidores[k].numero} onChange={(e) => medidor(k, 'numero', e.target.value)} />
                  <Input etiqueta="Lectura" id={`ae${k === 'luz' ? 'Luz' : k === 'agua' ? 'Agua' : 'Gas'}Lec`} autoComplete="off" value={v.medidores[k].lectura} onChange={(e) => medidor(k, 'lectura', e.target.value)} />
                </div>
              ))}
            </div>
          </Card>

          <Card titulo="Inventario" subtitulo="Estado de cada espacio o ítem">
            <div className="tw:flex tw:flex-col tw:gap-3">
              {v.inventario.map((it, i) => (
                <div key={i} className="tw:flex tw:flex-col tw:gap-2" data-item={i}>
                  <div className="tw:grid tw:grid-cols-[1fr_120px] tw:gap-3">
                    <Input etiqueta="Espacio o ítem" id={`aeEspacio-${i}`} autoComplete="off" value={it.espacio} onChange={(e) => cambiarItem(i, 'espacio', e.target.value)} />
                    <Select etiqueta="Estado" id={`aeEstado-${i}`} opciones={ESTADOS} value={it.estado} onChange={(e) => cambiarItem(i, 'estado', e.target.value)} />
                  </div>
                  <div className="tw:flex tw:items-end tw:gap-2 tw:flex-nowrap">
                    <div className="tw:min-w-0 tw:flex-1"><Input etiqueta="Observación" id={`aeNota-${i}`} autoComplete="off" value={it.nota} onChange={(e) => cambiarItem(i, 'nota', e.target.value)} /></div>
                    <Boton id={`aeQuitar-${i}`} tamano="sm" variante="secundario" icono="trash" onClick={() => { setV((x) => ({ ...x, inventario: x.inventario.filter((_, j) => j !== i) })); limpio(''); }}>Quitar</Boton>
                  </div>
                </div>
              ))}
              {err.inventario && <p className="error tw:m-0 tw:text-[13px]">{err.inventario}</p>}
              <div className="tw:flex tw:justify-end"><Boton id="aeAgregar" tamano="sm" variante="secundario" icono="plus" onClick={() => setV((x) => ({ ...x, inventario: [...x.inventario, { espacio: '', estado: 'bueno', nota: '' }] }))}>Agregar espacio</Boton></div>
            </div>
          </Card>

          <Card titulo="Observaciones" subtitulo="Opcional">
            <Textarea etiqueta="Observaciones generales" id="aeObs" rows={3} value={v.observaciones} onChange={(e) => { setV((x) => ({ ...x, observaciones: e.target.value })); limpio(''); }} />
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

          <ErrorVentana id="aeErr" texto={error} />
        </div>

        <Card titulo="Vista previa" subtitulo="Así se envía a firmar" relleno={true} className="tw:min-w-0 tw:lg:sticky tw:lg:top-0">
          <div className={guardando ? 'tw:opacity-50 tw:transition-opacity' : 'tw:transition-opacity'}>{pdf ? <VisorPdf base64={pdf} /> : <p className={NOTA}>No se pudo preparar el PDF: completa la fecha y el inventario y guarda.</p>}</div>
        </Card>
      </div>
      <p className={`${NOTA} tw:mt-3`}>Se cobra del saldo de Portalfirma. Cuando firmen ambas partes, la propiedad queda «Arrendada». El texto es un borrador para que lo revise el notario.</p>
    </VentanaCuerpo>
    <VentanaPie>
      {sucio ? <span className="tw:mr-auto tw:text-xs tw:text-muted">Cambios sin guardar</span> : <span className="tw:mr-auto"><Badge tono="verde" icono="check" ajustar>Todo guardado</Badge></span>}
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal} disabled={enviando}>Cancelar</Boton>
      <Boton id="aeGuardar" variante="secundario" icono="save" cargando={guardando} disabled={!sucio || enviando} onClick={guardar}>Guardar y actualizar PDF</Boton>
      <Boton id="mOk" icono="sign" disabled={sucio || invalido || guardando || enviando || !pdf} cargando={enviando} onClick={enviar} title={sucio ? 'Guarda los cambios antes de enviar' : undefined}>{enviando ? 'Enviando…' : 'Generar y enviar a firmar'}</Boton>
    </VentanaPie>
  </>;
}
