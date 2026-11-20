// Contenido del paso «Visita y orden de visita» dentro de su ventana (modal-13, ventanas/inmo/Etapas.tsx › MenuPaso).
// Todo el ciclo de la visita de un negocio sin salir de la ventana:
//  · agendarla (día, hora, duración y notas; la propiedad y el cliente vienen del negocio);
//  · confirmarla por WhatsApp (el servidor manda la plantilla), reprogramarla, marcarla realizada o cancelarla;
//  · ya en la puerta, generar la orden de visita y enviarla a firmar (al firmarse, el paso queda logrado).
// Las visitas son eventos de la agenda ligados al negocio (agendaCrear con negocioId). La lógica del estado del paso
// (esperando / logrado / no logrado) está en src/etapas.js.
// El día y la hora se eligen en el calendario (SelectorHorario): solo se ofrecen horarios libres, porque las visitas de una propiedad
// (y las de un corredor) no se pueden sobreponer.
// Los id (#pvForm, #shCal, #shHorarios, #shDur, #pvNotas, #pvAgendar, #pvErr) y [data-pv-visita] los usan las pruebas.
/* eslint-disable @typescript-eslint/no-explicit-any -- eventos de la agenda sin tipos */
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Boton from '../../../ui/Boton';
import Badge from '../../../ui/Badge';
import Input from '../../../ui/Input';
import SelectorHorario from '../../agenda/SelectorHorario';
import MenuMas from '../../../ui/MenuMas';
import { api } from '../../../../utils/api';
import { toast } from '../../../../utils/app';

export interface IVisitaPaso {
  negocioId: string; propId: string; lugar: string; clienteId: string; cliente: string;
  /** generar la orden de visita de esa visita y enviarla a firmar (se hace en la puerta, el día de la visita) */
  alOrden?: (e: any) => void;
  /** avisa que algo cambió para que se redibuje la pantalla de atrás */
  alCambio: () => void;
}

const CAJA = 'tw:flex tw:flex-col tw:gap-3';   // secciones sin caja ni borde
const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const SEM = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const dia = (f: string) => { const d = new Date(f + 'T12:00:00'); return `${SEM[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`; };
const hoyLocal = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const mananaLocal = () => { const d = new Date(Date.now() + 864e5); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const ahoraLocal = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

/** estado visible de una visita: programada (a futuro o ya pasada), realizada o cancelada */
function estadoDe(e: any): { txt: string; tono: 'verde' | 'amarillo' | 'rojo' | 'gris' } {
  if (e.estado === 'hecho') return { txt: 'Realizada', tono: 'verde' };
  if (e.estado === 'cancelado') return { txt: 'Cancelada', tono: 'gris' };
  const pasada = e.fecha < hoyLocal() || (e.fecha === hoyLocal() && (e.hora || '23:59') < ahoraLocal());
  return pasada ? { txt: 'Ya pasó, sin marcar', tono: 'rojo' } : { txt: 'Agendada', tono: 'amarillo' };
}

/** `pie`: el lugar del pie de la ventana donde va el botón principal («Agendar visita»), en vez de «Logrado» */
export default function PasoVisita({ v, pie }: { v: IVisitaPaso; pie?: HTMLElement | null }) {
  const [lista, setLista] = useState<any[] | null>(null);
  const [editando, setEditando] = useState<string | null>(null);   // id de la visita que se reprograma
  const [mostrarForm, setMostrarForm] = useState(false);            // «agendar otra» cuando ya hay una visita
  const [f, setF] = useState({ fecha: mananaLocal(), hora: '', duracion: '45', notas: '' });
  const [error, setError] = useState(''); const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const todas: any[] = await api<any[]>('agendaListar', { propId: v.propId, tipo: 'visita' }).catch(() => [] as any[]);
    setLista(todas.filter((e) => e.negocioId === v.negocioId || (!e.negocioId && v.clienteId && (e.personaIds || []).includes(v.clienteId))));
  }, [v.propId, v.negocioId, v.clienteId]);
  useEffect(() => { cargar(); }, [cargar]);

  const fijar = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const correr = async (fn: () => Promise<unknown>, aviso: string) => {
    setOcupado(true); setError('');
    // una marca manual vieja («no logrado») ya no corresponde: el paso vuelve a seguir a la agenda
    try { await fn(); await api('etMarcar', { negocioId: v.negocioId, paso: 'visita', estado: null }).catch(() => null); toast(aviso); setEditando(null); setMostrarForm(false); await cargar(); v.alCambio(); } catch (e) { setError(mensaje(e)); }
    setOcupado(false);
  };
  const agendar = () => { if (!f.hora) return setError('Elige un horario libre del día.'); return correr(() => editando
    ? api('agendaActualizar', editando, { fecha: f.fecha, hora: f.hora, duracion: f.duracion, notas: f.notas })
    : api('agendaCrear', { tipo: 'visita', fecha: f.fecha, hora: f.hora, duracion: f.duracion, notas: f.notas, propId: v.propId, personaIds: v.clienteId ? [v.clienteId] : [], negocioId: v.negocioId }),
  editando ? 'Visita reprogramada.' : 'Visita agendada.'); };
  const confirmar = (e: any) => correr(() => api('visitaConfirmar', e.id), `Confirmación enviada por WhatsApp a ${e.personas?.[0]?.nombre || 'el cliente'}.`);
  const estado = (e: any, st: 'hecho' | 'cancelado') => correr(() => api('agendaActualizar', e.id, { estado: st }), st === 'hecho' ? 'Visita marcada como realizada.' : 'Visita cancelada.');
  const reprogramar = (e: any) => { setEditando(e.id); setMostrarForm(true); setF({ fecha: e.fecha < hoyLocal() ? mananaLocal() : e.fecha, hora: '', duracion: String(e.duracion || 45), notas: e.notas || '' }); setError(''); };

  if (!lista) return <p className="tw:m-0 tw:text-[13px] tw:text-muted">Cargando visitas…</p>;
  const activas = lista.filter((e) => e.estado === 'programado');
  const formVisible = mostrarForm || !activas.length;

  return <>
    {lista.length > 0 && (
      <section className={CAJA} id="pvLista">
        <div className="tw:flex tw:items-center tw:gap-2">
          <h3 className="tw:m-0 tw:flex-1 tw:text-sm tw:font-bold">Visitas de este negocio</h3>
          {!formVisible && <MenuMas tamano="sm" etiqueta="Más acciones" opciones={[{ id: 'pvOtra', texto: 'Agendar otra visita', icono: 'plus', alTocar: () => { setMostrarForm(true); setEditando(null); setF({ fecha: mananaLocal(), hora: '', duracion: '45', notas: '' }); } }]} />}
        </div>
        <ul className="tw:list-none tw:m-0 tw:p-0 tw:flex tw:flex-col tw:gap-4">
          {[...lista].sort((a, b) => (b.fecha + (b.hora || '')).localeCompare(a.fecha + (a.hora || ''))).map((e) => {
            const st = estadoDe(e); const programada = e.estado === 'programado';
            // a la vista, máximo dos botones (+ «⋯»): confirmar por WhatsApp y generar la orden; «Ya se hizo» pasa al menú mientras falte la orden
            const conOrden = !!e.orden?.operacion; const puedeOrden = !!v.alOrden && !conOrden && (e.personas || []).length > 0;
            const puedeConfirmar = (e.personas || []).length > 0 && e.confirmacion?.estado !== 'confirmada';
            return (
              <li key={e.id} data-pv-visita={e.id} className="tw:flex tw:items-start tw:gap-3 tw:flex-nowrap">
                <div className="tw:min-w-0 tw:flex-1 tw:flex tw:flex-col tw:gap-1">
                  <div className="tw:flex tw:items-center tw:gap-2 tw:flex-wrap">
                    <b className="tw:text-sm">{dia(e.fecha)}{e.hora ? ` · ${e.hora}` : ''}<span className="tw:font-normal tw:text-muted"> · {e.duracion || 45} min</span></b>
                    <Badge tono={st.tono} punto>{st.txt}</Badge>
                    {programada && <Confirmacion e={e} />}
                    {conOrden && <Badge tono="verde" icono="sign" ajustar>Orden de visita · operación {e.orden.operacion}</Badge>}
                  </div>
                  <small className="tw:text-xs tw:text-muted">{[e.lugar, (e.personas || []).map((p: any) => p.nombre).join(', ')].filter(Boolean).join(' · ')}</small>
                  {e.notas && <small className="tw:text-xs">{e.notas}</small>}
                </div>
                {programada && (
                  <div className="tw:flex tw:flex-none tw:items-center tw:gap-2">
                    {puedeConfirmar && <Boton variante="secundario" tamano="sm" icono="whatsapp" disabled={ocupado} data-pv-confirmar onClick={() => confirmar(e)}>{e.confirmacion?.estado === 'enviada' ? 'Reenviar confirmación' : 'Confirmar por WhatsApp'}</Boton>}
                    {puedeOrden
                      ? <Boton tamano="sm" icono="sign" disabled={ocupado} data-pv-orden onClick={() => v.alOrden?.(e)}>Generar orden de visita</Boton>
                      : <Boton tamano="sm" icono="check" disabled={ocupado} data-pv-hecha onClick={() => estado(e, 'hecho')}>Ya se hizo</Boton>}
                    <MenuMas tamano="sm" etiqueta="Más acciones de la visita" opciones={[
                      ...(puedeOrden ? [{ id: 'pvHecha', texto: 'Ya se hizo', icono: 'check', disabled: ocupado, alTocar: () => estado(e, 'hecho') }] : []),
                      { id: 'pvReprogramar', texto: 'Reprogramar', icono: 'calendar', disabled: ocupado, alTocar: () => reprogramar(e) },
                      { id: 'pvCancelar', texto: 'Cancelar visita', icono: 'x', disabled: ocupado, alTocar: () => estado(e, 'cancelado') },
                    ]} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    )}

    {formVisible ? (
      <section className={CAJA} id="pvForm">
        <h3 className="tw:m-0 tw:text-sm tw:font-bold">{editando ? 'Reprogramar la visita' : lista.length ? 'Agendar otra visita' : 'Agendar la visita'}</h3>
        <ListaFija propiedad={v.lugar} cliente={v.cliente} />
        {!v.clienteId && <p className="tw:m-0 tw:text-[13px] tw:text-muted">Este negocio todavía no tiene cliente: vincúlalo en el paso «Interesado registrado» para poder confirmar y generar la orden de visita.</p>}
        <SelectorHorario propId={v.propId} valor={{ fecha: f.fecha, hora: f.hora, duracion: f.duracion }} ignorar={editando} alCambiar={(x) => setF((s) => ({ ...s, ...x }))} />
        <Input etiqueta={<>Notas <span className="tw:font-normal tw:text-muted">(opcional)</span></>} id="pvNotas" placeholder="Ej.: llevar llaves, conserje avisado" value={f.notas} onChange={fijar('notas')} />
        {error && <p id="pvErr" role="alert" className="tw:m-0 tw:text-[13px] tw:text-red-softink">{error}</p>}
        {(editando || lista.length > 0) && <div className="tw:flex tw:justify-end"><Boton variante="secundario" onClick={() => { setEditando(null); setMostrarForm(false); setError(''); }}>Cancelar</Boton></div>}
      </section>
    ) : null}
    {/* el botón principal va en el pie de la ventana, a la derecha, en lugar de «Logrado»: agendar la visita es lograr el paso */}
    {pie && createPortal(formVisible
      ? <Boton id="pvAgendar" icono="calendar" cargando={ocupado} disabled={!f.hora} onClick={agendar}>{editando ? 'Guardar cambio' : 'Agendar visita'}</Boton>
      : <Boton id="pvOtraPie" icono="plus" variante="secundario" onClick={() => { setMostrarForm(true); setEditando(null); setF({ fecha: mananaLocal(), hora: '', duracion: '45', notas: '' }); setError(''); }}>Agendar otra visita</Boton>, pie)}
  </>;
}

function ListaFija({ propiedad, cliente }: { propiedad: string; cliente: string }) {
  const fila = (k: string, t: string) => t ? <div className="tw:flex tw:gap-2 tw:text-[13px]"><span className="tw:w-[84px] tw:flex-none tw:text-muted">{k}</span><span className="tw:min-w-0 tw:flex-1">{t}</span></div> : null;
  return <div className="tw:flex tw:flex-col tw:gap-1">{fila('Propiedad', propiedad)}{fila('Con', cliente)}</div>;
}

/** si ya se le mandó la confirmación y qué respondió */
function Confirmacion({ e }: { e: any }) {
  const c = e.confirmacion; const nombre = c?.nombre || e.personas?.[0]?.nombre || 'el cliente';
  if (c?.estado === 'confirmada') return <Badge tono="verde" icono="check" ajustar>Confirmada por {nombre}</Badge>;
  if (c?.estado === 'cambio') return <Badge tono="rojo" icono="alert" ajustar>{nombre} pidió cambiarla</Badge>;
  if (c?.estado === 'enviada') return <Badge tono="amarillo" icono="clock" ajustar>Esperando la respuesta de {nombre}</Badge>;
  return <Badge tono="gris" icono="whatsapp" ajustar>Sin confirmar</Badge>;
}
