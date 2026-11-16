// modal-3: la orden de visita, lista para revisar y enviar a firmar.
//   · izquierda: los datos de la orden, ordenados (visitante, visita y propiedades). El visitante y la visita se pueden
//     editar; «Guardar y actualizar PDF» los guarda en su origen (la persona del CRM y la visita de la agenda) y vuelve
//     a generar el PDF. Los datos de la propiedad se editan en su ficha.
//   · derecha: el PDF tal como se enviará a firmar.
// Enviar a firmar solo se puede con todo guardado: lo que se ve en el PDF es lo que firma el visitante.
// La lógica (guardar en la persona y en la agenda, generar el PDF, enviar) está en src/renderer/agenda.js y llega en las props.
// Los id (#ovNombre, #ovRut, #ovTel, #ovEmail, #ovDia, #ovHora, #ovGuardar, #mOk, #mCancel) los usan las pruebas.
import { useState } from 'react';
import Boton from '../../ui/Boton';
import Badge from '../../ui/Badge';
import Card from '../../ui/Card';
import Input from '../../ui/Input';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../ui/Ventana';
import { NOTA } from '../gestion/editor-pdf/Modales';
import { ErrorVentana } from '../negocios/VentanasAntiguas';
import { cerrarModal } from '../../../utils/modal';
import { correoValido, formatearRut, rutValido } from '../../../utils/rut';
import VisorPdf from './VisorPdf';

export interface IOrdenDatos { nombre: string; rut: string; email: string; telefono: string; fecha: string; hora: string }
export interface IOrdenVisitaProps {
  titulo?: string;
  aviso?: string;
  pdf?: string;
  visitante: Pick<IOrdenDatos, 'nombre' | 'rut' | 'email' | 'telefono'>;
  visita: Pick<IOrdenDatos, 'fecha' | 'hora'>;
  propiedades: { codigo: string; titulo: string; direccion: string; precio?: string }[];
  /** guarda los cambios en su origen y devuelve el PDF nuevo (lanza el error si algo falla) */
  alGuardar: (d: IOrdenDatos) => Promise<{ pdf: string }>;
  alConfirmar: () => Promise<void>;
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const SEM = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const diaTxt = (f: string) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return 'sin fecha'; const d = new Date(f + 'T12:00:00'); return `${SEM[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`; };

export function ConfirmarOrden({ aviso, pdf: pdf0, visitante, visita, propiedades, alGuardar, alConfirmar }: IOrdenVisitaProps) {
  const inicial: IOrdenDatos = { nombre: visitante.nombre || '', rut: visitante.rut || '', email: visitante.email || '', telefono: visitante.telefono || '', fecha: visita.fecha || '', hora: visita.hora || '' };
  const [v, setV] = useState<IOrdenDatos>(inicial);
  const [guardado, setGuardado] = useState<IOrdenDatos>(inicial);
  const [pdf, setPdf] = useState(pdf0 || '');
  const [guardando, setGuardando] = useState(false); const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const sucio = JSON.stringify(v) !== JSON.stringify(guardado);
  const campo = (k: keyof IOrdenDatos) => ({ value: v[k], onChange: (e: { target: { value: string } }) => { setV((x) => ({ ...x, [k]: e.target.value })); setError(''); } });

  // lo que falta o está mal (se muestra bajo cada campo)
  const err = {
    nombre: v.nombre.trim().length < 2 ? 'Escribe el nombre completo' : '',
    rut: !rutValido(v.rut) ? 'El RUT no es válido' : '',
    email: !correoValido(v.email) ? 'Escribe un correo válido: ahí recibe el enlace para firmar' : '',
    hora: v.hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v.hora) ? 'Hora no válida' : '',
  };
  const invalido = Object.values(err).some(Boolean);

  const guardar = async () => {
    if (invalido) return setError('Corrige los datos marcados antes de guardar.');
    setGuardando(true); setError('');
    try {
      const nuevo = { ...v, nombre: v.nombre.trim(), rut: formatearRut(v.rut), email: v.email.trim(), telefono: v.telefono.trim() };
      const r = await alGuardar(nuevo);
      setV(nuevo); setGuardado(nuevo); setPdf(r.pdf);
    } catch (e) { setError(mensaje(e)); }
    setGuardando(false);
  };
  const enviar = async () => { setEnviando(true); setError(''); try { await alConfirmar(); } catch (e) { setError(mensaje(e)); setEnviando(false); } };

  return <>
    <VentanaCabecera icono="key" titulo="Orden de visita" descripcion="Revisa los datos y ajústalos si hace falta: el PDF se actualiza al guardar." cerrable={!enviando} />
    <VentanaCuerpo>
      <div className="ov-doble tw:grid tw:grid-cols-1 tw:lg:grid-cols-[minmax(300px,380px)_1fr] tw:gap-4 tw:items-start">
        <div className="tw:flex tw:flex-col tw:gap-3">
          <Card titulo="Visitante" subtitulo="Firma la orden">
            <div className="tw:flex tw:flex-col tw:gap-3">
              <Input etiqueta="Nombre completo" id="ovNombre" autoComplete="off" error={sucio || v.nombre ? err.nombre : ''} {...campo('nombre')} />
              <div className="tw:grid tw:grid-cols-2 tw:gap-3">
                <Input etiqueta="RUT" id="ovRut" autoComplete="off" error={v.rut ? err.rut : ''} {...campo('rut')} onBlur={() => v.rut && rutValido(v.rut) && setV((x) => ({ ...x, rut: formatearRut(x.rut) }))} />
                <Input etiqueta="Teléfono" id="ovTel" type="tel" autoComplete="off" placeholder="+56 9…" {...campo('telefono')} />
              </div>
              <Input etiqueta="Correo" id="ovEmail" type="email" autoComplete="off" error={v.email ? err.email : ''} {...campo('email')} />
            </div>
          </Card>

          <Card titulo="Visita" subtitulo={`${diaTxt(v.fecha)}${v.hora ? ' · ' + v.hora : ''}`}>
            <div className="tw:grid tw:grid-cols-2 tw:gap-3">
              <Input etiqueta="Día" id="ovDia" type="date" {...campo('fecha')} />
              <Input etiqueta="Hora" id="ovHora" type="time" error={err.hora} {...campo('hora')} />
            </div>
          </Card>

          <Card titulo={propiedades.length > 1 ? 'Propiedades' : 'Propiedad'} subtitulo="Se editan en su ficha">
            <ul className="tw:list-none tw:m-0 tw:p-0 tw:flex tw:flex-col tw:gap-2.5">
              {propiedades.map((p) => (
                <li key={p.codigo} className="tw:flex tw:items-start tw:gap-2.5">
                  <Badge tono="lavanda">{p.codigo}</Badge>
                  <span className="tw:min-w-0 tw:flex-1 tw:text-[13px]"><b className="tw:block tw:font-semibold tw:truncate">{p.titulo}</b><span className="tw:text-muted">{[p.direccion, p.precio].filter(Boolean).join(' · ')}</span></span>
                </li>
              ))}
            </ul>
          </Card>

          <ErrorVentana id="ovErr" texto={error} />
        </div>

        <Card titulo="Vista previa" subtitulo="Así se envía a firmar" relleno={true} className="tw:min-w-0 tw:lg:sticky tw:lg:top-0">
          <div className={guardando ? 'tw:opacity-50 tw:transition-opacity' : 'tw:transition-opacity'}>{pdf ? <VisorPdf base64={pdf} /> : <p className={NOTA}>No se pudo preparar el PDF.</p>}</div>
        </Card>
      </div>
      {aviso && <p className={`${NOTA} tw:mt-3`}>{aviso}</p>}
    </VentanaCuerpo>
    <VentanaPie>
      {sucio ? <span className="tw:mr-auto tw:text-xs tw:text-muted">Cambios sin guardar</span> : <span className="tw:mr-auto"><Badge tono="verde" icono="check" ajustar>Todo guardado</Badge></span>}
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal} disabled={enviando}>Cancelar</Boton>
      <Boton id="ovGuardar" variante="secundario" icono="save" cargando={guardando} disabled={!sucio || enviando} onClick={guardar}>Guardar y actualizar PDF</Boton>
      <Boton id="mOk" icono="sign" disabled={sucio || invalido || guardando || enviando} cargando={enviando} onClick={enviar} title={sucio ? 'Guarda los cambios antes de enviar' : undefined}>{enviando ? 'Enviando…' : 'Generar y enviar a firmar'}</Boton>
    </VentanaPie>
  </>;
}
