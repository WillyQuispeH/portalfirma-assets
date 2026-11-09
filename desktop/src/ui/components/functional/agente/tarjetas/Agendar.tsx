// Agendar (acción fija: solo agenda, nunca genera documentos ni cobra), en Asset o en el calendario de reservas
// de wechatia, y confirmar una visita por WhatsApp con el mensaje listo.
// Con el kit: Card (Tarjeta), Tabs, Select, Input, Textarea, Badge y Boton.
/* eslint-disable @typescript-eslint/no-explicit-any -- datos del proceso principal sin tipos */
import { useEffect, useState, type ReactNode } from 'react';
import Boton from '../../../ui/Boton';
import Badge from '../../../ui/Badge';
import Card from '../../../ui/Card';
import Input from '../../../ui/Input';
import Select from '../../../ui/Select';
import Textarea from '../../../ui/Textarea';
import Tabs from '../../../ui/Tabs';
import { toast } from '../../../../utils/app';
import { Ag, Campos, Falta, Muted, Tarjeta, W, api, cartera, carteraActual, primer, useTarjeta } from './comun';
import { trasAgendar } from './gestion';

const TIPOS: [string, string][] = [['visita', 'Visita'], ['reunion', 'Reunión'], ['llamada', 'Llamada'], ['firma', 'Firma'], ['tarea', 'Tarea']];
const MODO_K = 'pf.agendarModo';
const modoGuardado = () => { try { return localStorage.getItem(MODO_K); } catch { return null; } };
const manana = () => { const m = new Date(Date.now() + 864e5); return new Date(m.getTime() - m.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };

export interface IPreAgendar { tipo?: string; propId?: string | null; personaId?: string | null; negocioId?: string | null; fecha?: string; hora?: string }

export function Agendar({ pre, res0 }: { pre: IPreAgendar; res0: any }) {
  const { terminar, quitar } = useTarjeta();
  const [personas, setPersonas] = useState<any[]>(() => [...carteraActual().personas]);
  const props = carteraActual().propiedades.filter((p) => !p.archivada);
  const [res, setRes] = useState<any>(res0);
  const [tipo, setTipo] = useState(pre.tipo || 'visita');
  const [modo, setModo0] = useState<'res' | 'asset'>(pre.fecha ? 'asset' : ((modoGuardado() as 'res' | 'asset') || (res0?.conectado ? 'res' : 'asset')));
  const [v, setV] = useState({ prop: pre.propId || '', per: pre.personaId || '', fecha: pre.fecha || manana(), hora: pre.hora || '11:00', notas: '' });
  const [falta, setFalta] = useState<ReactNode>(''); const [enviando, setEnviando] = useState(false);
  const [configurando, setConfigurando] = useState(false);
  const [abierto, setAbierto] = useState(0); // cuándo se abrió el widget: la reserva debe ser posterior
  const modoReal = tipo !== 'visita' && modo === 'res' ? 'asset' : modo;
  const fijar = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  const setModo = (m: 'res' | 'asset') => { setModo0(m); setFalta(''); try { localStorage.setItem(MODO_K, m); } catch { /* sin almacenamiento */ } };

  // el widget del calendario, con los datos del cliente ya puestos (si el calendario los acepta)
  const c = personas.find((x) => x.id === v.per); const p = props.find((x) => x.id === v.prop);
  const [nom, ...ape] = String(c?.nombre || '').split(/\s+/);
  const q = new URLSearchParams(Object.entries({ first_name: c ? nom : '', last_name: ape.join(' '), email: c?.email || '', phone: c?.telefono || '', notes: p ? `Visita ${p.codigo} · ${[p.direccion, p.unidad ? 'depto. ' + p.unidad : '', p.comuna].filter(Boolean).join(', ')}` : '' }).filter(([, x]) => x)).toString();
  useEffect(() => { if (modoReal === 'res') setAbierto(Date.now()); }, [modoReal, q]);

  const nueva = () => W.Inmo.formPersona(null, { rol: 'interesado', despues: async (x: any) => { const d = await cartera(); setPersonas([...d.personas]); setV((s) => ({ ...s, per: x.id })); } });

  // reservado en el calendario: Asset la trae y la liga a la propiedad, el cliente y el negocio
  const listo = async () => {
    if (!v.prop) return setFalta('Elige la propiedad de la visita.');
    if (!res?.conectado) { setModo0('asset'); return setFalta('Sin conexión al calendario: anota aquí el día y la hora que reservaste.'); }
    setEnviando(true); setFalta('');
    try {
      const r = await api('resSincronizar', { propId: v.prop, personaId: v.per || null, negocioId: pre.negocioId || null, desde: abierto });
      if (!r.vinculada) { setEnviando(false); return setFalta('Todavía no veo la reserva en el calendario. Termina de confirmarla en el widget y vuelve a tocar «Listo».'); }
      const e = r.vinculada; const txt = `${e.fecha} ${e.hora || ''}${p ? ' · ' + p.codigo : ''}${e.personas?.length ? ' · ' + e.personas.map((x: any) => x.nombre).join(', ') : ''} · calendario de reservas`;
      terminar(<><b>Visita reservada</b> · {txt}</>, `Visita reservada · ${txt}`);
      await trasAgendar(e, r.hito, v.prop);
    } catch (er) { setEnviando(false); setFalta((er as Error).message); }
  };
  const agendar = async () => {
    if (tipo === 'visita' && !v.prop) return setFalta('Una visita necesita la propiedad.');
    setEnviando(true);
    try {
      const r = await api('assetEjecutar', 'asset_crear_evento', { tipo, fecha: v.fecha, hora: v.hora || undefined, propiedad: v.prop || undefined, personas: v.per ? [v.per] : [], negocio: pre.negocioId || undefined, notas: v.notas || undefined });
      const e = r.evento; const txt = `${e.fecha}${e.hora ? ' ' + e.hora : ''}${e.propiedad ? ' · ' + e.propiedad : ''}${e.personas.length ? ' · ' + e.personas.join(', ') : ''}`;
      terminar(<><b>{e.tipo} agendada</b> · {txt}</>, `${e.tipo} agendada · ${txt}`);
      await trasAgendar(e, r.negocio, v.prop);
    } catch (er) { console.error('agendar', er); setEnviando(false); setFalta((er as Error).message); }
  };

  return (
    <Tarjeta icono="calendar" titulo="Agendar" sub="Solo queda en tu agenda: no genera documentos ni cobra"
      falta={<Falta texto={falta} />}
      pie={<>
        <Boton variante="fantasma" data-cancel onClick={quitar}>Cancelar</Boton>
        {modoReal === 'asset'
          ? <Boton data-ok data-solo="asset" icono="calendar" cargando={enviando} onClick={agendar}>Agendar</Boton>
          : <Boton data-listo data-solo="res" icono="check" cargando={enviando} onClick={listo}>Listo, ya reservé</Boton>}
      </>}>
      <div className="ga-agt tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2">
        <Tabs dato="t" etiqueta="Tipo" opciones={TIPOS} valor={tipo} alCambiar={(t) => { setTipo(t); setFalta(''); }} className="tw:max-w-full tw:overflow-x-auto" />
        {tipo === 'visita' && (
          <span data-modo>
            <Tabs dato="m" etiqueta="Dónde agendar" valor={modoReal} alCambiar={setModo}
              opciones={[['res', 'Calendario de reservas', undefined, 'calendar'], ['asset', 'Rápido en Asset', undefined, 'clock']]} />
          </span>
        )}
      </div>
      <Campos>
        <Select etiqueta="Propiedad" data-f="prop" value={v.prop} onChange={fijar('prop')}>
          <option value="">— Sin propiedad —</option>
          {props.map((x) => <option key={x.id} value={x.id}>{x.codigo} · {String(x.titulo).slice(0, 40)}</option>)}
        </Select>
        <div className="ga-inl tw:flex tw:items-end tw:gap-2">
          <Select etiqueta="Con quién" data-f="per" clasesCampo="tw:flex-1 tw:min-w-0" value={v.per} onChange={fijar('per')}>
            <option value="">— Nadie por ahora —</option>
            {[...personas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((x) => <option key={x.id} value={x.id}>{x.nombre} · {x.rut}</option>)}
          </Select>
          <Boton variante="secundario" className="tw:w-10 tw:px-0" data-nueva title="Persona nueva" aria-label="Persona nueva" icono="plus" onClick={(e) => { e.preventDefault(); nueva(); }} />
        </div>
        {modoReal === 'asset' && <>
          <Input etiqueta="Día" type="date" data-f="fecha" value={v.fecha} onChange={fijar('fecha')} />
          <Input etiqueta="Hora" type="time" data-f="hora" value={v.hora} onChange={fijar('hora')} />
          <Input etiqueta={<>Notas <span className="tw:font-normal tw:text-muted">(opcional)</span></>} clasesCampo="tw:sm:col-span-2" data-f="notas" placeholder="Ej.: llevar llaves, conserje avisado" value={v.notas} onChange={fijar('notas')} />
        </>}
      </Campos>
      {modoReal === 'res' && (
        <div className="ga-res tw:flex tw:flex-col tw:gap-2" data-solo="res">
          {configurando ? <ConfigurarCalendario res={res} alVolver={() => setConfigurando(false)} alGuardar={(r) => { setRes(r); setConfigurando(false); }} /> : <>
            <div className="ga-resh tw:flex tw:flex-wrap tw:items-center tw:gap-2">
              {res?.conectado
                ? <span className="ok"><Badge tono="verde" icono="check" ajustar>Conectado{res.calendario ? ': ' + res.calendario : ''}. La reserva llega sola a tu agenda.</Badge></span>
                : <span className="warn"><Badge tono="amarillo" icono="alert" ajustar>Sin conectar: después de reservar, anota la hora en «Rápido en Asset».</Badge></span>}
              <Boton variante="fantasma" tamano="sm" className="tw:ml-auto" data-conf onClick={() => setConfigurando(true)}>{res?.conectado ? 'Configurar' : 'Conectar'}</Boton>
            </div>
            <div className="ga-resf tw:rounded-xl tw:overflow-hidden tw:border tw:border-solid tw:border-edge">
              <iframe src={`${res?.url || ''}${q ? '?' + q : ''}`} title="Calendario de reservas" allow="payment" referrerPolicy="strict-origin-when-cross-origin" className="tw:block tw:w-full tw:h-[520px] tw:border-0 tw:bg-white" />
            </div>
          </>}
        </div>
      )}
    </Tarjeta>
  );
}

function ConfigurarCalendario({ res, alVolver, alGuardar }: { res: any; alVolver: () => void; alGuardar: (r: any) => void }) {
  const [w, setW] = useState(res?.widget || ''); const [t, setT] = useState(''); const [error, setError] = useState(''); const [guardando, setGuardando] = useState(false);
  const guardar = async () => {
    setGuardando(true);
    try { const r = await api('resConfigurar', { ...(w.trim() ? { widget: w.trim() } : {}), ...(t.trim() ? { token: t.trim() } : {}) }); setT(''); toast(r.conectado ? 'Calendario conectado.' : 'Calendario guardado.'); alGuardar(r); }
    catch (er) { setGuardando(false); setError((er as Error).message); }
  };
  const quitar = async () => { const r = await api('resConfigurar', { token: '' }); toast('Calendario desconectado.'); alGuardar(r); };
  return (
    <div className="ga-resc">
      <Card titulo="Calendario de reservas (wechatia)" subtitulo="La reserva que hagas en el calendario llega sola a tu agenda, ligada a la propiedad y al cliente."
        pie={<div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
          {res?.conectado && <Boton variante="fantasma" tamano="sm" data-quitar onClick={quitar}>Desconectar</Boton>}
          <span className="tw:flex-1" />
          <Boton variante="secundario" tamano="sm" data-volver onClick={alVolver}>Volver</Boton>
          <Boton tamano="sm" data-guardar cargando={guardando} onClick={guardar}>Guardar</Boton>
        </div>}>
        <div className="tw:flex tw:flex-col tw:gap-3">
          <Input etiqueta="Código o dirección del widget" data-c="w" value={w} onChange={(e) => setW(e.target.value)} placeholder="Pega aquí el <iframe…> o la dirección …/widget/booking/…" spellCheck={false} />
          <Input etiqueta="Clave de la API" ayuda={res?.conectado ? 'Ya guardada: escribe una nueva solo para cambiarla.' : undefined}
            data-c="t" type="password" autoComplete="off" spellCheck={false} value={t} onChange={(e) => setT(e.target.value)} placeholder="Integración privada de wechatia (pit-…)" />
          <Muted>En wechatia: Configuración › Integraciones privadas › crear, con permisos de <b>calendarios y eventos</b> y <b>contactos</b> (solo lectura). La clave queda cifrada.</Muted>
          <span data-ce>{error && <Falta texto={error} />}</span>
        </div>
      </Card>
    </div>
  );
}

// ---------- confirmar la visita por WhatsApp: mensaje listo (editable) con día, hora y dirección ----------
export function ConfirmarWhatsApp({ eventoId, r0, ev }: { eventoId: string; r0: any; ev: any }) {
  const { terminar, quitar } = useTarjeta();
  const ps = ev?.personas || [];
  const [r, setR] = useState<any>(r0); const [texto, setTexto] = useState(r0.texto);
  const [cel, setCel] = useState(''); const [falta, setFalta] = useState('');
  const [enviando, setEnviando] = useState<'' | 'auto' | 'abrir'>(''); const [pulso, setPulso] = useState(false);
  const cambiarPersona = async (id: string) => { const x = await api('estConfirmacion', eventoId, id); setR(x); setTexto(x.texto); setFalta(''); };
  const guardarCel = async () => {
    if (String(cel).replace(/\D/g, '').length < 8) return setFalta('Escribe el celular con su código, por ejemplo +56 9 1234 5678.');
    try {
      const d = await cartera(); const c = d.personas.find((x) => x.id === r.persona.id);
      await api('inmoPerGuardar', { ...c, telefono: cel.trim() }); const x = await api('estConfirmacion', eventoId, c.id); setR(x); setTexto(x.texto); setFalta(''); toast('Celular guardado en su ficha.');
    } catch (e) { setFalta((e as Error).message); }
  };
  const enviar = async (m: 'auto' | 'abrir') => {
    if (!r.whatsapp) return setFalta(`${primer(r.persona?.nombre) || 'La persona'} no tiene celular: escríbelo arriba.`);
    setEnviando(m); setFalta('');
    try {
      const x = await api('estConfirmar', eventoId, r.persona?.id || null, texto, m);
      const est = ({ delivered: 'entregado', read: 'leído', sent: 'enviado', enviado: 'enviado', pending: 'en camino' } as Record<string, string>)[x.envio?.estado] || 'enviado';
      const nombre = x.persona?.nombre || '';
      const cola = !x.automatico ? ' · se abrió WhatsApp con el mensaje' : x.envio?.duplicado ? ' · ya se había enviado este mismo mensaje hace un momento (no se repitió)'
        : ` · ${est}${x.envio?.creado ? ' · se creó su contacto en wechatia' : ''}`;
      const inicio = x.automatico ? 'Confirmación enviada por WhatsApp a ' : 'Confirmación por WhatsApp a ';
      terminar(<>{inicio}<b>{nombre}</b>{cola}</>, `${inicio}${nombre}${cola}`);
      if (ev?.propId) Ag().sugerencias([{ label: 'Ver estado de la propiedad', accion: { tipo: 'estadoProp', propId: ev.propId } }]);
      W.AssetRefrescar?.(); W.Lienzo?.refrescar?.();
    } catch (er) { setEnviando(''); setFalta((er as Error).message); setPulso(true); }
  };
  return (
    <Tarjeta icono="whatsapp" titulo="Confirmar por WhatsApp" sub={r.automatico ? 'Se envía desde el WhatsApp de tu cuenta de wechatia, sin salir de Asset' : 'Se abre WhatsApp con el mensaje listo: tú lo envías'}
      falta={<Falta texto={falta} />}
      pie={<>
        <Boton variante="fantasma" data-cancel onClick={quitar}>Cancelar</Boton>
        {r.automatico && <Boton variante="secundario" data-abrir className={pulso ? 'ga-pulso' : ''} title="Abre WhatsApp con el mensaje para enviarlo tú" disabled={!!enviando} onClick={() => enviar('abrir')}>Abrir en mi WhatsApp</Boton>}
        <Boton variante="exito" data-ok icono="whatsapp" cargando={enviando === 'auto'} disabled={!!enviando} onClick={() => enviar(r.automatico ? 'auto' : 'abrir')}>
          {enviando === 'auto' ? 'Enviando…' : r.automatico ? 'Enviar por WhatsApp' : 'Abrir WhatsApp'}
        </Boton>
      </>}>
      {ps.length > 1 && (
        <Select etiqueta="Para" data-per value={r.persona?.id || ''} onChange={(e) => cambiarPersona(e.target.value)}>
          {ps.map((c: any) => <option key={c.id} value={c.id}>{c.nombre}{c.telefono ? ' · ' + c.telefono : ' · sin celular'}</option>)}
        </Select>
      )}
      {!r.whatsapp && (
        <div data-tel className="tw:flex tw:items-end tw:gap-2">
          <Input etiqueta={`Celular de ${primer(r.persona?.nombre) || 'la persona'}`} pendiente data-cel clasesCampo="tw:flex-1" placeholder="+56 9 1234 5678" value={cel} onChange={(e) => setCel(e.target.value)} />
          <Boton variante="secundario" data-gcel onClick={guardarCel}>Guardar</Boton>
        </div>
      )}
      <Textarea etiqueta="Mensaje" data-txt rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} />
      {r.enviada && <Badge tono="verde" icono="check" ajustar>Ya se envió una confirmación el {new Date(r.enviada.fecha).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}. Puedes mandarla de nuevo.</Badge>}
    </Tarjeta>
  );
}
