// Configuración (menú del usuario › Configuración): las preferencias y conexiones de Asset, en pestañas.
//  · General: apariencia (tema) y la luz de la oficina (pantalla Hoy).
//  · Plantillas: los textos de los documentos, por cláusula, con su versión y aprobación (plantillas/Plantillas.tsx).
//  · Documentos: los tipos de documento y cómo se firma cada uno (tipo de firma y trámite legal); lo que se sube a firmar los usa (documentos/Documentos.tsx).
//  · WhatsApp: tu celular vinculado (cada usuario el suyo): verlo, cambiarlo con un código nuevo o desvincularlo, y a quién
//    escribirle de tu equipo (Pedro, Juanita, Diego, Fernanda), a todo el ancho. Encender o apagar a los asistentes que
//    atienden clientes se hace en la pestaña Asistentes.
//  · Asistentes: nombre, instrucciones y horario de los asistentes de WhatsApp de la corredora (AsistentesConfig.tsx).
//  · Usuarios (Equipo, para el corredor): el equipo de la corredora; el administrador agrega, edita y asigna claves.
//  · Integraciones: Portalfirma, wechatia y sus canales, portales, Drive… (IntegracionesContenido).
// Se monta en #view-integraciones (src/renderer/app.js: abrirConfiguracion(pestaña)). Marcas para las pruebas:
// #cfgTabs [data-t], #cfgTema [data-tema], #cfgLuz [data-luz], #cfgMiWa, #cfgMiTel, #cfgVincular, #cfgCodigo, #cfgEquipoWa.
import { useEffect, useState, type ReactNode } from 'react';
import Layout from '../../ui/Layout';
import Corredora from './Corredora';
import AsistentesConfig from './AsistentesConfig';
import Plantillas from './plantillas/Plantillas';
import Documentos from './documentos/Documentos';
import DetallePlantilla from './plantillas/Detalle';
import Tabs from '../../ui/Tabs';
import Card from '../../ui/Card';
import ItemLista from '../../ui/ItemLista';
import Badge from '../../ui/Badge';
import Boton from '../../ui/Boton';
import Switch from '../../ui/Switch';
import Icono from '../../ui/Icono';
import { cx } from '../../../utils/cx';
import { api } from '../../../utils/api';
import { cambiarTema, temaActual, toast } from '../../../utils/app';
import { useAcceso } from '../../../store/hooks/useAcceso.hook';
import { useOficina, type TLuzPref } from '../../../store/hooks/useOficina.hook';
import { useWhatsApp } from '../../../store/hooks/useWhatsApp.hook';
import { useCuenta } from '../../../store/hooks/useCuenta.hook';
import { IntegracionesContenido } from '../integraciones/Integraciones';
import Usuarios from '../usuarios/Usuarios';
import Metas from './Metas';

export type TPestanaConfig = 'general' | 'corredora' | 'plantillas' | 'documentos' | 'whatsapp' | 'asistentes' | 'usuarios' | 'metas' | 'integraciones';
const pestanas = (admin: boolean): [TPestanaConfig, string, undefined, string][] => [
  ['general', 'General', undefined, 'sun'], ['corredora', 'Corredora', undefined, 'building'], ['plantillas', 'Plantillas', undefined, 'template'], ['documentos', 'Documentos', undefined, 'sign'], ['whatsapp', 'WhatsApp', undefined, 'whatsapp'], ['asistentes', 'Asistentes', undefined, 'sparkle'], ['usuarios', admin ? 'Usuarios' : 'Equipo', undefined, 'users'],
  ...(admin ? [['metas', 'Metas', undefined, 'chart'] as [TPestanaConfig, string, undefined, string]] : []), ['integraciones', 'Integraciones', undefined, 'link'],
];

// ---------------------------------------------------------------- General

const TEMAS: [string, string][] = [['light', 'Claro'], ['dark', 'Oscuro'], ['system', 'Sistema']];
const LUCES: [TLuzPref, string][] = [['auto', 'Automática'], ['dia', 'Mañana'], ['tarde', 'Tarde'], ['noche', 'Noche']];

/** botones de una sola opción (como Tabs, pero el valor se marca con data-*) */
function Opciones<T extends string>({ id, dato, opciones, valor, alCambiar }: { id: string; dato: string; opciones: [T, string][]; valor: T; alCambiar: (v: T) => void }) {
  return (
    <div id={id} role="radiogroup" className="tw:inline-flex tw:flex-wrap tw:gap-1 tw:p-1 tw:rounded-control tw:bg-sunken tw:border tw:border-solid tw:border-edge">
      {opciones.map(([v, t]) => {
        const on = v === valor;
        return (
          <button key={v} type="button" role="radio" aria-checked={on} {...{ [`data-${dato}`]: v }} onClick={() => alCambiar(v)}
            className={cx(on && 'on', 'tw:h-8 tw:m-0 tw:px-3 tw:rounded-control tw:border tw:border-solid tw:text-sm tw:font-semibold tw:cursor-pointer tw:font-[inherit]',
              on ? 'tw:bg-card tw:text-text tw:border-edge tw:border-b-2 tw:border-b-edge-b' : 'tw:bg-transparent tw:border-transparent tw:text-muted tw:hover:text-text')}>
            {t}
          </button>
        );
      })}
    </div>
  );
}

function Fila({ titulo, texto, children }: { titulo: ReactNode; texto?: ReactNode; children: ReactNode }) {
  return (
    <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-x-6 tw:gap-y-2 tw:py-3 tw:border-0 tw:border-b tw:border-solid tw:border-edge tw:last:border-b-0">
      <div className="tw:min-w-[220px] tw:flex-1"><b className="tw:block tw:text-sm tw:font-semibold">{titulo}</b>{texto && <small className="tw:block tw:mt-0.5 tw:text-[13px] tw:text-muted">{texto}</small>}</div>
      {children}
    </div>
  );
}

function General() {
  const [tema, setTema] = useState(temaActual());
  const { luzPref, oficinaSetLuz } = useOficina();
  return (
    <Card titulo="Apariencia">
      <Fila titulo="Tema" texto="Claro, oscuro o el mismo que tu computador.">
        <Opciones id="cfgTema" dato="tema" opciones={TEMAS} valor={tema} alCambiar={async (v) => { await cambiarTema(v); setTema(v); }} />
      </Fila>
      <Fila titulo="Luz de la oficina" texto="La luz de la oficina en la pantalla Hoy: automática según la hora del día, o fija.">
        <Opciones id="cfgLuz" dato="luz" opciones={LUCES} valor={luzPref} alCambiar={oficinaSetLuz} />
      </Fila>
    </Card>
  );
}

// ---------------------------------------------------------------- WhatsApp

const fmtTel = (t?: string | null) => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 11 ? `+${d.slice(0, 2)} ${d.slice(2, 3)} ${d.slice(3, 7)} ${d.slice(7)}` : t || ''; };

/** tu celular vinculado (cada usuario el suyo): verlo, cambiarlo (con un código nuevo) o desvincularlo */
function MiWhatsApp() {
  const { estado: e, waCargar, waVincular, waDesvincular, waRevisarVinculo, waConfigurar } = useWhatsApp();
  const { usuario: cuentaPf } = useCuenta();
  const { usuario: yo } = useAcceso();
  const [listo, setListo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { waCargar().finally(() => setListo(true)); }, [waCargar]);
  // con el código a la vista, revisa cada 2 segundos si ya llegó el mensaje desde el celular
  const codigo = e?.codigo;
  useEffect(() => {
    if (!codigo) return;
    const t = setInterval(async () => { if (await waRevisarVinculo()) { clearInterval(t); toast('Celular vinculado.'); } }, 2000);
    return () => clearInterval(t);
  }, [codigo, waRevisarVinculo]);
  const numero = e?.numeroEmpresa || 'el WhatsApp de la empresa';
  const vincular = async () => {
    setOcupado(true);
    const err = await waVincular(yo?.nombre || cuentaPf?.namePerson || '', yo?.email || cuentaPf?.email || '');
    setOcupado(false);
    if (err) toast(err, 6000);
  };
  const alternarRecordatorios = async (v: boolean) => {
    const err = await waConfigurar({ recordatoriosVisita: v });
    toast(err || (v ? 'Recordatorios de visitas activados.' : 'Recordatorios de visitas desactivados.'), err ? 6000 : 3000);
  };
  const desvincular = async () => { setOcupado(true); await waDesvincular(); setOcupado(false); toast('Celular desvinculado.'); };
  const copiar = async () => { try { await navigator.clipboard.writeText(e?.codigo || ''); toast('Código copiado.'); } catch { /* sin portapapeles */ } };

  return (
    <Card titulo="Mi WhatsApp" subtitulo="Vincula tu celular para hablar con tu equipo de asistentes por WhatsApp."
      accion={listo ? <Badge tono={e?.conectado ? 'verde' : 'amarillo'} punto>{e?.conectado ? `Empresa conectada · ${numero}` : 'Empresa sin conectar'}</Badge> : undefined}>
      <div id="cfgMiWa" className="tw:flex tw:flex-col tw:gap-4">
        {!listo ? <p className="tw:m-0 tw:text-sm tw:text-muted">Cargando…</p>
          : !e?.conectado ? (
            <p className="tw:m-0 tw:text-sm tw:text-muted">El WhatsApp de la empresa aún no está conectado. {yo?.rol === 'ADMIN' ? 'Conéctalo en la pestaña Integraciones (wechatia).' : 'Pídele al administrador que lo conecte.'}</p>
          ) : e.codigo ? (
            <div className="tw:flex tw:flex-col tw:gap-3">
              <p className="tw:m-0 tw:text-sm">Desde <b>tu celular</b>, envía este mensaje por WhatsApp al <b>{numero}</b>:</p>
              <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-3">
                <b id="cfgCodigo" className="tw:px-4 tw:py-2 tw:rounded-control tw:bg-sunken tw:border tw:border-solid tw:border-edge tw:font-mono tw:text-2xl tw:tracking-wider">{e.codigo}</b>
                <Boton variante="secundario" tamano="sm" icono="link" onClick={copiar}>Copiar</Boton>
              </div>
              <p className="tw:m-0 tw:flex tw:items-center tw:gap-2 tw:text-[13px] tw:text-muted"><span className="spinner sm" /> Esperando tu mensaje… (se revisa cada pocos segundos)</p>
            </div>
          ) : (
            <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-4">
              <span className={cx('tw:grid tw:flex-none tw:place-items-center tw:w-12 tw:h-12 tw:rounded-icono', e.telefono ? 'tw:bg-green-soft tw:text-green-softink' : 'tw:bg-gray-soft tw:text-gray-softink')}><Icono nombre="whatsapp" tam={24} /></span>
              <div className="tw:min-w-0 tw:flex-1">
                <small className="tw:block tw:text-[13px] tw:text-muted">Tu celular</small>
                <b id="cfgMiTel" className="tw:block tw:text-xl tw:font-bold tw:tabular-nums">{e.telefono ? fmtTel(e.telefono) : 'Sin vincular'}</b>
              </div>
              <div className="tw:flex tw:flex-wrap tw:gap-2">
                <Boton id="cfgVincular" icono={e.telefono ? 'edit' : 'link'} cargando={ocupado} onClick={vincular}>{e.telefono ? 'Cambiar número' : 'Vincular mi celular'}</Boton>
                {e.telefono && <Boton id="cfgDesvincular" variante="fantasma" disabled={ocupado} onClick={desvincular}>Desvincular</Boton>}
              </div>
            </div>
          )}
        {listo && e?.conectado && e.telefono && !e.codigo && (
          <Switch id="cfgRecordatorios" activo={e.recordatoriosVisita === true} alCambiar={alternarRecordatorios}
            etiqueta="Recordatorios de visitas" descripcion="Te escribimos por WhatsApp la tarde anterior (18:00) y 1 hora antes de cada visita, con la fecha, la hora, la propiedad, el interesado y el negocio." />
        )}
        <p className="tw:m-0 tw:pt-3 tw:border-0 tw:border-t tw:border-solid tw:border-edge tw:text-[13px] tw:text-muted">
          {e?.telefono ? <>Escríbele al <b>{numero}</b> el nombre de quien necesitas: <b>Pedro</b> (captación), <b>Juanita</b> (documentos), <b>Diego</b> (seguimiento) o <b>Fernanda</b> (leads). También puedes mandar audios.</>
            : <>Para cambiar o vincular el número, Asset te da un código y lo envías desde ese celular al <b>{numero}</b>.</>}
        </p>
      </div>
    </Card>
  );
}

/** a quién se le escribe (los asistentes del equipo de cada corredor) y qué hace cada uno */
const EQUIPO: { id: 'pedro' | 'juanita' | 'diego' | 'fernanda'; nombre: string; area: string; ejemplo: string; icono: string }[] = [
  { id: 'pedro', nombre: 'Pedro', area: 'Captación', ejemplo: '«Pedro, ¿cómo va la cartera?» · «Pedro, crea una propiedad en Providencia»', icono: 'house' },
  { id: 'juanita', nombre: 'Juanita', area: 'Documentos', ejemplo: '«Juanita, prepárame la orden de visita para la PF-1001»', icono: 'sign' },
  { id: 'diego', nombre: 'Diego', area: 'Seguimiento', ejemplo: '«Diego, ¿qué tengo para hoy?» · «Diego, ¿cómo va la firma 4424?»', icono: 'listCheck' },
  { id: 'fernanda', nombre: 'Fernanda', area: 'Leads', ejemplo: '«Fernanda, ¿qué leads nuevos tengo?» · «Fernanda, responde a Ana»', icono: 'users' },
];

/** tu equipo de asistentes por WhatsApp: a quién escribirle y qué decirle (los nombres los define el administrador en Asistentes) */
function EquipoWhatsApp({ vinculado }: { vinculado: boolean }) {
  const [nombres, setNombres] = useState<Partial<Record<'pedro' | 'juanita' | 'diego' | 'fernanda', string>>>({});
  useEffect(() => { api<{ equipo?: typeof nombres }>('asistConfig').then((c) => setNombres(c?.equipo ?? {})).catch(() => setNombres({})); }, []);
  return (
    <Card titulo="Tu equipo por WhatsApp"
      subtitulo={vinculado ? 'Escríbele a quien necesites desde tu celular vinculado, por texto o con una nota de voz.' : 'Cuando vincules tu celular, podrás escribirles. También sirven las notas de voz.'}>
      <div id="cfgEquipoWa" className="tw:flex tw:flex-col tw:divide-y tw:divide-line tw:[&>*]:py-3 tw:-my-3">
        {EQUIPO.map((m) => {
          const nombre = (nombres[m.id] || '').trim() || m.nombre;
          return (
            <ItemLista key={m.id} data-equipo={m.id} media={<span className="tw:inline-grid tw:place-items-center tw:size-10 tw:rounded-icono tw:bg-brand-soft tw:text-brand"><Icono nombre={m.icono} tam={20} /></span>}
              titulo={<>{nombre} <span className="tw:font-normal tw:text-muted">· {m.area}</span></>} detalle={m.ejemplo} />
          );
        })}
      </div>
    </Card>
  );
}

function WhatsApp() {
  const { estado: e } = useWhatsApp();
  return (
    <div className="tw:grid tw:items-start tw:gap-5 tw:xl:grid-cols-2">
      <MiWhatsApp />
      <EquipoWhatsApp vinculado={!!e?.telefono} />
    </div>
  );
}

// ---------------------------------------------------------------- pantalla

export default function Configuracion({ pestana: inicial = 'general' }: { pestana?: TPestanaConfig }) {
  const [pestana, setPestana] = useState<TPestanaConfig>(inicial);
  const [plantilla, setPlantilla] = useState<string | null>(null);
  const { usuario } = useAcceso();
  // el detalle de una plantilla es pantalla propia (su Layout/cabecera); al volver se refresca la pestaña
  if (plantilla) {
    return <DetallePlantilla nombre={plantilla} alVolver={() => { setPlantilla(null); setPestana('plantillas'); }} />;
  }
  return (
    <Layout
      id="configuracion"
      titulo="Configuración"
      subtitulo="Tus preferencias, tu WhatsApp, el equipo y las integraciones de la corredora."
      barra={<Tabs id="cfgTabs" dato="t" etiqueta="Secciones" opciones={pestanas(usuario?.rol === 'ADMIN')} valor={pestana} alCambiar={setPestana} />}
    >
      {pestana === 'general' ? <General /> : pestana === 'corredora' ? <Corredora /> : pestana === 'plantillas' ? <Plantillas alAbrir={setPlantilla} /> : pestana === 'documentos' ? <Documentos /> : pestana === 'whatsapp' ? <WhatsApp /> : pestana === 'asistentes' ? <AsistentesConfig /> : pestana === 'usuarios' ? <Usuarios /> : pestana === 'metas' ? <Metas /> : <IntegracionesContenido />}
    </Layout>
  );
}
