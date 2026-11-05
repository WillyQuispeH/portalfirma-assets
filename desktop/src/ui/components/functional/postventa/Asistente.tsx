// Pestaña «Asistente» de Postventa: cómo habla el asistente con los propietarios, con vista previa al instante.
// Los id as* y las clases pv-seg (data-k, data-v) los usa test/postventa-e2e.js.
// Con el kit: Card, Input, Textarea y Boton («Usar emojis» sigue como casilla: la prueba la marca con check).
import { useEffect, useState } from 'react';
import Icono from '../../ui/Icono';
import Card from '../../ui/Card';
import Input from '../../ui/Input';
import Textarea from '../../ui/Textarea';
import Boton from '../../ui/Boton';
import { muestraAsistente, probarEstiloAsistente, usePostventa } from '../../../store/hooks/usePostventa.hook';
import { toast } from '../../../utils/app';
import { Burbujas } from './comun';
import type { IPvMensaje, IPvPersona } from '../../../store/interfaces/postventa.interface';

function Opciones<K extends keyof IPvPersona>({ k, valor, opciones, alCambiar }: { k: K; valor: string; opciones: [string, string][]; alCambiar: (k: K, v: string) => void }) {
  return (
    <div className="pv-seg" data-k={k}>
      {opciones.map(([v, t]) => <button key={v} type="button" data-v={v} className={valor === v ? 'on' : ''} onClick={() => alCambiar(k, v)}>{t}</button>)}
    </div>
  );
}

export default function Asistente() {
  const { config, asistenteGuardar } = usePostventa();
  const [p, setP] = useState<IPvPersona | null>(config ? { ...config.persona } : null);
  const [prev, setPrev] = useState<IPvMensaje[]>([]);
  const [prueba, setPrueba] = useState<{ texto?: string; nota?: string; error?: string; cargando?: boolean } | null>(null);
  const [estado, setEstado] = useState('');
  const [err, setErr] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [cambiado, setCambiado] = useState(false);

  // vista previa: se vuelve a pedir al cambiar algo (con una pausa corta mientras se escribe)
  useEffect(() => {
    if (!p) return;
    const t = setTimeout(async () => {
      const m = await muestraAsistente(p).catch(() => null); if (!m) return;
      setPrev(m.mensajes.map((x) => ({ dir: x.dir, texto: x.fotos ? '📷 [foto]' : x.texto, fecha: null })));
      setEstado(cambiado ? 'Sin guardar' : '');
    }, 150);
    return () => clearTimeout(t);
  }, [p]); // eslint-disable-line react-hooks/exhaustive-deps -- «cambiado» acompaña a p

  if (!p) return null;
  const cambiar = <K extends keyof IPvPersona>(k: K, v: IPvPersona[K]) => { setP({ ...p, [k]: v }); setCambiado(true); setPrueba(null); };
  const campo = (k: 'nombre' | 'empresa' | 'horario' | 'firma' | 'instrucciones') => ({ value: p[k], onChange: (e: { target: { value: string } }) => cambiar(k, e.target.value) });

  const guardar = async () => {
    setGuardando(true); const r = await asistenteGuardar(p); setGuardando(false);
    if (r.error) setErr(r.error); else { setErr(''); setEstado(''); setCambiado(false); toast(r.mensaje!); }
  };
  const probar = async () => {
    setPrueba({ cargando: true });
    try { const r = await probarEstiloAsistente(p); setPrueba({ texto: r.texto, nota: r.ia ? 'Así saldría la solicitud registrada.' : `Se enviaría el mensaje normal${r.descartado ? ` (${r.descartado})` : ''}.` }); }
    catch (e) { setPrueba({ error: (e as Error).message }); }
  };

  return (
    <div className="pv-cols wa">
      <Card className="pv-as" titulo={<span className="tw:inline-flex tw:items-center tw:gap-2"><Icono nombre="user" tam={16} /> Cómo habla el asistente</span>}
        subtitulo="Así se presenta y trata a los propietarios por WhatsApp. Los cambios se ven al lado al instante.">
        <div className="tw:flex tw:flex-col tw:gap-3.5">
          <div className="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-3">
            <Input id="asNom" etiqueta="Nombre del asistente" maxLength={40} placeholder="Ej.: Sofía (vacío = «el asistente»)" {...campo('nombre')} />
            <Input id="asEmp" etiqueta="Empresa" maxLength={60} placeholder="Ej.: Inmobiliaria Los Aromos" {...campo('empresa')} />
          </div>
          <div className="pv-fl"><span>Trato</span><Opciones k="trato" valor={p.trato} opciones={[['tu', 'Tú'], ['usted', 'Usted']]} alCambiar={(k, v) => cambiar(k, v as IPvPersona['trato'])} /></div>
          <div className="pv-fl"><span>Tono</span><Opciones k="tono" valor={p.tono} opciones={[['cercano', 'Cercano'], ['neutro', 'Neutro'], ['formal', 'Formal']]} alCambiar={(k, v) => cambiar(k, v as IPvPersona['tono'])} /></div>
          <div className="pv-fl"><span>Respuestas</span><Opciones k="largo" valor={p.largo} opciones={[['breve', 'Breves'], ['normal', 'Completas']]} alCambiar={(k, v) => cambiar(k, v as IPvPersona['largo'])} /></div>
          <label className="pv-sw tw:m-0">
            <input type="checkbox" id="asEmo" checked={p.emojis} onChange={(e) => cambiar('emojis', e.target.checked)} />
            <span><b>Usar emojis</b><small>Uno por mensaje, en los momentos clave (fotos, solicitud registrada, visita).</small></span>
          </label>
          <Input id="asHor" maxLength={100} placeholder="Ej.: lunes a viernes de 9:00 a 18:00" {...campo('horario')}
            etiqueta={<>Horario de atención <small className="tw:font-normal tw:text-muted">(va al final de la solicitud registrada)</small></>} />
          <Input id="asFir" maxLength={100} placeholder="Ej.: Equipo de Postventa · Inmobiliaria Los Aromos" {...campo('firma')}
            etiqueta={<>Firma <small className="tw:font-normal tw:text-muted">(al final de la solicitud registrada y de los avisos)</small></>} />
          <Textarea id="asIns" rows={4} maxLength={1500} placeholder="Ej.: Sé muy amable y empático, el propietario puede estar molesto. No uses la palabra «reclamo», di «solicitud». Nunca prometas fechas." {...campo('instrucciones')}
            etiqueta={<>Instrucciones propias <small className="tw:font-normal tw:text-muted">(opcional)</small></>}
            ayuda="Con instrucciones, la IA ajusta cada mensaje a tu estilo sin cambiar folios, fechas ni palabras clave (si los cambia, se envía el mensaje normal). Suma 1 a 2 segundos por respuesta." />
          {err && <p className="tw:m-0 tw:text-[13px] tw:text-err" role="alert" id="asErr">{err}</p>}
          <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
            <Boton id="asOk" cargando={guardando} onClick={guardar}>Guardar</Boton>
            <Boton variante="secundario" id="asIA" icono="sparkle" disabled={!p.instrucciones.trim() || prueba?.cargando} onClick={probar}>Probar mis instrucciones</Boton>
            <span className="tw:text-xs tw:text-muted" id="asEst">{estado}</span>
          </div>
        </div>
      </Card>
      <Card titulo="Vista previa" subtitulo="Una conversación de ejemplo con esta configuración.">
        <div id="asPrev">{prev.length > 0 && <Burbujas mensajes={prev} />}</div>
        <div id="asPrevIA">
          {prueba?.cargando && <p className="muted small">Aplicando tus instrucciones…</p>}
          {prueba?.error && <p role="alert" className="tw:text-[13px] tw:text-err">{prueba.error}</p>}
          {prueba?.texto && <><h4 className="pv-sub">Con tus instrucciones</h4><Burbujas mensajes={[{ dir: 'out', texto: prueba.texto }]} /><p className="tw:text-xs tw:text-muted">{prueba.nota}</p></>}
        </div>
      </Card>
    </div>
  );
}
