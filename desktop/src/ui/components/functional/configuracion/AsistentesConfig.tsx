// Configuración › Asistentes: cómo se presentan y cómo trabajan los asistentes de WhatsApp de la corredora. Los edita el
// administrador; los demás los ven. Viven en el servidor (GET/PUT /v1/whatsapp/asistentes/config, IPC asist:config /
// asist:guardarConfig) y valen para esta corredora solamente.
//  · Atención de clientes: interruptor, nombre, cómo se presenta (siempre de la corredora, por su nombre), instrucciones
//    de la casa, horario y qué hacer fuera de horario.
//  · Postventa automática: lo mismo.   · Interesados nuevos: el aviso fijo y el corredor responde desde su celular.
//  · Equipo de los corredores: nombres opcionales de Pedro, Juanita, Diego y Fernanda.
// Un solo «Guardar» (abajo, a la derecha). Ids para pruebas: #cfgAsistentes, #asAtencion, #asNombre, #asVista,
// #asInstrucciones, #asHorario, #asDesde, #asHasta, #asDias [data-chip], #asFuera, #asMensajeFuera, #asPostventa,
// #asPvNombre, #asPvInstrucciones, #asPvHorario, #asLeads, #asEq-pedro…, #asGuardar.
import { useEffect, useState, type ReactNode } from 'react';
import Card from '../../ui/Card';
import Boton from '../../ui/Boton';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import Switch from '../../ui/Switch';
import Textarea from '../../ui/Textarea';
import Chips from '../../ui/Chips';
import Badge from '../../ui/Badge';
import { api } from '../../../utils/api';
import { toast } from '../../../utils/app';

interface IHorario { activo: boolean; desde: string; hasta: string; dias: number[]; zona: string; fuera: 'avisar' | 'callar' }
interface IConfig {
  atencion: { activo: boolean; nombre: string; instrucciones: string; horario: IHorario; mensajeFuera: string };
  postventa: { auto: boolean; nombre: string; instrucciones: string; horario: IHorario; mensajeFuera: string };
  leads: { activo: boolean };
  equipo: { pedro: string; juanita: string; diego: string; fernanda: string };
  corredora: string;
  puedeEditar: boolean;
}

const DIAS: [string, string][] = [['1', 'Lun'], ['2', 'Mar'], ['3', 'Mié'], ['4', 'Jue'], ['5', 'Vie'], ['6', 'Sáb'], ['7', 'Dom']];
const MAX_INSTRUCCIONES = 1500;
const EQUIPO: ['pedro' | 'juanita' | 'diego' | 'fernanda', string, string][] = [
  ['pedro', 'Pedro', 'Captación: la cartera, las propiedades y los propietarios.'],
  ['juanita', 'Juanita', 'Documentos: las firmas y los documentos en curso.'],
  ['diego', 'Diego', 'Seguimiento: los negocios, la agenda y las visitas.'],
  ['fernanda', 'Fernanda', 'Leads: quién escribió, qué busca y en qué quedó.'],
];

/** el horario de un asistente: interruptor, horas, días y qué hacer fuera de horario */
function Horario({ pref, h, mensaje, vista, ro, cambiar, cambiarMensaje }: {
  pref: string; h: IHorario; mensaje: string; vista: string; ro: boolean;
  cambiar: (x: Partial<IHorario>) => void; cambiarMensaje: (t: string) => void;
}) {
  return (
    <div className="tw:flex tw:flex-col tw:gap-3">
      <Switch id={`${pref}Horario`} activo={h.activo} deshabilitado={ro} alCambiar={(v) => cambiar({ activo: v })}
        etiqueta="Atender solo en un horario"
        descripcion="Fuera de ese horario el asistente no usa la IA: deja el recado al corredor y, si quieres, le avisa al cliente." />
      {h.activo && (
        <>
          <div className="tw:grid tw:gap-3 tw:grid-cols-[repeat(auto-fit,minmax(160px,1fr))]">
            <Input id={`${pref}Desde`} type="time" etiqueta="Desde" value={h.desde} disabled={ro} onChange={(e) => cambiar({ desde: e.target.value })} />
            <Input id={`${pref}Hasta`} type="time" etiqueta="Hasta" value={h.hasta} disabled={ro} onChange={(e) => cambiar({ hasta: e.target.value })} />
          </div>
          <Chips id={`${pref}Dias`} etiqueta="Días de atención" opciones={DIAS} valor={h.dias.map(String)} alCambiar={(v) => !ro && cambiar({ dias: v.map(Number).sort() })} />
          <Select id={`${pref}Fuera`} etiqueta="Fuera de horario" value={h.fuera} disabled={ro} onChange={(e) => cambiar({ fuera: e.target.value as IHorario['fuera'] })}
            opciones={[['avisar', 'Avisar al cliente que le responden en horario'], ['callar', 'No responder (solo avisar al corredor)']]} />
          {h.fuera === 'avisar' && (
            <Textarea id={`${pref}MensajeFuera`} etiqueta="Mensaje fuera de horario (opcional)" rows={2} maxLength={500} value={mensaje} disabled={ro}
              onChange={(e) => cambiarMensaje(e.target.value)} placeholder={vista}
              ayuda="Puedes usar {nombre}, {corredora}, {corredor} y {cuando}. Vacío = el mensaje de arriba, ya con tus datos." />
          )}
          <p className="tw:m-0 tw:text-[13px] tw:text-muted">Hora de Chile ({h.zona.replace('America/', '').replace('_', ' ')}). Fuera del horario el corredor igual recibe el recado.</p>
        </>
      )}
    </div>
  );
}

function Bloque({ titulo, subtitulo, estado, children }: { titulo: string; subtitulo: ReactNode; estado?: ReactNode; children: ReactNode }) {
  return <Card titulo={titulo} subtitulo={subtitulo} accion={estado}>{<div className="tw:flex tw:flex-col tw:gap-4">{children}</div>}</Card>;
}

export default function AsistentesConfig() {
  const [c, setC] = useState<IConfig | null>(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [vez, setVez] = useState(0);

  useEffect(() => { api<IConfig>('asistConfig').then(setC).catch((e: Error) => setError(e.message)); }, []);

  if (error) return <Card titulo="Asistentes"><p className="tw:m-0 tw:text-sm tw:text-muted">No se pudo leer la configuración ({error}). Vuelve a intentarlo en un momento.</p></Card>;
  if (!c) return <Card titulo="Asistentes"><p className="tw:m-0 tw:text-sm tw:text-muted">Cargando…</p></Card>;
  const ro = !c.puedeEditar;
  const corredora = c.corredora || 'tu corredora';
  const poner = (f: (x: IConfig) => void) => setC((x) => { if (!x) return x; const n = structuredClone(x); f(n); return n; });

  const nombre = c.atencion.nombre.trim() || 'Tomás';
  const nombrePv = c.postventa.nombre.trim();
  const fueraBase = (n: string, de: string) =>
    `Hola, soy ${n}, asistente de ${corredora}. Ahora estamos fuera de horario; le dejé tu mensaje a ${de} y te responde mañana a las ${c.atencion.horario.desde}.`;

  const guardar = async () => {
    setGuardando(true);
    try {
      const { atencion: a, postventa: p, leads, equipo } = c;
      const x = await api<IConfig>('asistGuardarConfig', {
        atencion: { activo: a.activo, nombre: a.nombre.trim(), instrucciones: a.instrucciones, horario: a.horario, mensajeFuera: a.mensajeFuera },
        postventa: { auto: p.auto, nombre: p.nombre.trim(), instrucciones: p.instrucciones, horario: p.horario, mensajeFuera: p.mensajeFuera },
        leads, equipo,
      });
      setC(x); setVez((v) => v + 1); toast('Asistentes guardados.');
    } catch (e) { toast((e as Error).message, 6000); }
    setGuardando(false);
  };

  return (
    <div id="cfgAsistentes" key={vez} className="tw:flex tw:flex-col tw:gap-5">
      {ro && <p className="tw:m-0 tw:text-sm tw:text-muted">Estos asistentes los configura el administrador de la corredora. Aquí puedes ver cómo trabajan.</p>}

      <div className="tw:grid tw:items-start tw:gap-5 tw:xl:grid-cols-2">
      <div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-5">
      <Bloque titulo="Atención de clientes" estado={<Badge tono={c.atencion.activo ? 'verde' : 'gris'} punto>{c.atencion.activo ? 'Encendida' : 'Apagada'}</Badge>}
        subtitulo="Responde por WhatsApp a los propietarios y clientes que ya están en tu CRM.">
        <Switch id="asAtencion" activo={c.atencion.activo} deshabilitado={ro} alCambiar={(v) => poner((x) => { x.atencion.activo = v; })}
          etiqueta="Atender a mis clientes por WhatsApp"
          descripcion={<>Responde dudas con los datos de la base. <b>No</b> negocia, <b>no</b> agenda y <b>no</b> promete nada: deja un recado al corredor.</>} />
        <Input id="asNombre" etiqueta="Nombre del asistente" value={c.atencion.nombre} maxLength={40} disabled={ro} placeholder="Tomás"
          onChange={(e) => poner((x) => { x.atencion.nombre = e.target.value; })}
          ayuda="Así se presenta con tus clientes y así firma sus avisos al corredor." />
        <p id="asVista" className="tw:m-0 tw:text-sm tw:text-muted">
          Así se presenta: <b className="tw:text-text">«Hola Ana, soy {nombre}, asistente virtual de {corredora} y te atiendo junto a Constanza.»</b>
          <br /><small>Siempre se presenta como asistente de tu corredora, por su nombre (Ana y Constanza son de ejemplo).</small>
        </p>
        <Textarea id="asInstrucciones" etiqueta="Instrucciones de la casa (opcional)" rows={4} maxLength={MAX_INSTRUCCIONES} value={c.atencion.instrucciones} disabled={ro}
          onChange={(e) => poner((x) => { x.atencion.instrucciones = e.target.value; })}
          placeholder="Háblales de usted. Si preguntan por comisiones, di que las ve el corredor."
          ayuda={<>Sirven para el tono y las frases de la casa ({c.atencion.instrucciones.length} de {MAX_INSTRUCCIONES}). Sí: «háblales de usted», «saluda con Buenos días», «no uses emojis». No: datos de propiedades, precios o promesas; el asistente nunca inventa datos, negocia ni promete, aunque aquí se le pida.</>} />
        <Horario pref="as" h={c.atencion.horario} mensaje={c.atencion.mensajeFuera} vista={fueraBase(nombre, 'tu corredor')} ro={ro}
          cambiar={(h) => poner((x) => { Object.assign(x.atencion.horario, h); })} cambiarMensaje={(t) => poner((x) => { x.atencion.mensajeFuera = t; })} />
      </Bloque>

      <Bloque titulo="Interesados nuevos" estado={<Badge tono={c.leads.activo ? 'verde' : 'gris'} punto>{c.leads.activo ? 'Encendido' : 'Apagado'}</Badge>}
        subtitulo="Personas que escriben por primera vez al WhatsApp de la empresa.">
        <Switch id="asLeads" activo={c.leads.activo} deshabilitado={ro} alCambiar={(v) => poner((x) => { x.leads.activo = v; })}
          etiqueta="Registrar y avisar a los interesados nuevos"
          descripcion="El primer aviso es fijo y el corredor responde desde su celular. Apagado: solo se anota el mensaje en el lead." />
      </Bloque>
      </div>

      <div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-5">
      <Bloque titulo="Postventa automática" estado={<Badge tono={c.postventa.auto ? 'verde' : 'gris'} punto>{c.postventa.auto ? 'Encendida' : 'Apagada'}</Badge>}
        subtitulo="Recibe y sigue los reclamos de garantía de los propietarios de viviendas nuevas.">
        <Switch id="asPostventa" activo={c.postventa.auto} deshabilitado={ro} alCambiar={(v) => poner((x) => { x.postventa.auto = v; })}
          etiqueta="Responder reclamos de postventa por WhatsApp"
          descripcion="Identifica al propietario, pide la descripción y las fotos, y registra el reclamo con su folio. No promete plazos ni reparaciones." />
        <Input id="asPvNombre" etiqueta="Nombre del asistente de postventa" value={c.postventa.nombre} maxLength={40} disabled={ro} placeholder="Sin nombre"
          onChange={(e) => poner((x) => { x.postventa.nombre = e.target.value; })}
          ayuda={<>Se presenta así: «Hola, soy {nombrePv ? `${nombrePv}, ` : 'el '}asistente de postventa de {corredora}».</>} />
        <Textarea id="asPvInstrucciones" etiqueta="Instrucciones de la casa (opcional)" rows={3} maxLength={MAX_INSTRUCCIONES} value={c.postventa.instrucciones} disabled={ro}
          onChange={(e) => poner((x) => { x.postventa.instrucciones = e.target.value; })}
          placeholder="Trato cercano y breve, sin emojis."
          ayuda="Retocan el tono de los mensajes; los folios, fechas y palabras clave se mantienen siempre." />
        <Horario pref="asPv" h={c.postventa.horario} mensaje={c.postventa.mensajeFuera} vista={fueraBase(nombrePv || 'el asistente de postventa', 'nuestro equipo de postventa')} ro={ro}
          cambiar={(h) => poner((x) => { Object.assign(x.postventa.horario, h); })} cambiarMensaje={(t) => poner((x) => { x.postventa.mensajeFuera = t; })} />
      </Bloque>

      <Bloque titulo="Equipo de los corredores" subtitulo="Los asistentes con los que cada corredor habla por WhatsApp desde su celular. Si no escribes un nombre, se usa el de siempre.">
        <div className="tw:grid tw:gap-3 tw:grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
          {EQUIPO.map(([k, base, ayuda]) => (
            <Input key={k} id={`asEq-${k}`} etiqueta={base} value={c.equipo[k]} maxLength={40} disabled={ro} placeholder={base} ayuda={ayuda}
              onChange={(e) => poner((x) => { x.equipo[k] = e.target.value; })} />
          ))}
        </div>
      </Bloque>

      </div>
      </div>

      {!ro && (
        <div className="tw:flex tw:flex-nowrap tw:items-center tw:justify-end tw:gap-2">
          <Boton id="asGuardar" cargando={guardando} onClick={guardar}>Guardar</Boton>
        </div>
      )}
    </div>
  );
}
