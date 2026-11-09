// Configuración (menú del usuario › Configuración): las preferencias y conexiones de Asset, en pestañas.
//  · General: apariencia (tema) y la luz de la oficina (pantalla Hoy).
//  · WhatsApp: tu celular vinculado (cada usuario el suyo): verlo, cambiarlo con un código nuevo o desvincularlo, para
//    hablar con tu equipo (Pedro, Juanita, Diego, Fernanda). El administrador además enciende o apaga a Sofía, Tomás y
//    la postventa (si el servidor no responde, la tarjeta lo dice sin bloquear la pantalla).
//  · Integraciones: Portalfirma, wechatia y sus canales, portales, Drive… (IntegracionesContenido).
// Se monta en #view-integraciones (src/renderer/app.js: abrirConfiguracion(pestaña)). Marcas para las pruebas:
// #cfgTabs [data-t], #cfgTema [data-tema], #cfgLuz [data-luz], #cfgMiWa, #cfgMiTel, #cfgVincular, #cfgCodigo, #cfgSofia, #cfgTomas.
import { useEffect, useState, type ReactNode } from 'react';
import Layout from '../../ui/Layout';
import Tabs from '../../ui/Tabs';
import Card from '../../ui/Card';
import Switch from '../../ui/Switch';
import Boton from '../../ui/Boton';
import Icono from '../../ui/Icono';
import { cx } from '../../../utils/cx';
import { api } from '../../../utils/api';
import { cambiarTema, temaActual, toast } from '../../../utils/app';
import { useAcceso } from '../../../store/hooks/useAcceso.hook';
import { useOficina, type TLuzPref } from '../../../store/hooks/useOficina.hook';
import { useWhatsApp } from '../../../store/hooks/useWhatsApp.hook';
import { useCuenta } from '../../../store/hooks/useCuenta.hook';
import { IntegracionesContenido } from '../integraciones/Integraciones';

export type TPestanaConfig = 'general' | 'whatsapp' | 'integraciones';
const PESTANAS: [TPestanaConfig, string, undefined, string][] = [
  ['general', 'General', undefined, 'sun'], ['whatsapp', 'WhatsApp', undefined, 'whatsapp'], ['integraciones', 'Integraciones', undefined, 'link'],
];

// ---------------------------------------------------------------- General

const TEMAS: [string, string][] = [['light', 'Claro'], ['dark', 'Oscuro'], ['system', 'Sistema']];
const LUCES: [TLuzPref, string][] = [['auto', 'Automática'], ['dia', 'Mañana'], ['tarde', 'Tarde'], ['noche', 'Noche']];

/** botones de una sola opción (como Tabs, pero el valor se marca con data-*) */
function Opciones<T extends string>({ id, dato, opciones, valor, alCambiar }: { id: string; dato: string; opciones: [T, string][]; valor: T; alCambiar: (v: T) => void }) {
  return (
    <div id={id} role="radiogroup" className="tw:inline-flex tw:flex-wrap tw:gap-1 tw:p-1 tw:rounded-xl tw:bg-sunken tw:border tw:border-solid tw:border-edge">
      {opciones.map(([v, t]) => {
        const on = v === valor;
        return (
          <button key={v} type="button" role="radio" aria-checked={on} {...{ [`data-${dato}`]: v }} onClick={() => alCambiar(v)}
            className={cx(on && 'on', 'tw:h-8 tw:m-0 tw:px-3 tw:rounded-lg tw:border tw:border-solid tw:text-sm tw:font-semibold tw:cursor-pointer tw:font-[inherit]',
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

interface IAsistentes {
  enServidor?: boolean; lectorEncendido?: boolean; conectado?: boolean; numeroEmpresa?: string;
  leadsActivo?: boolean; clientesActivo?: boolean; postventa?: boolean; ultimaLectura?: string | null; error?: string | null;
}
const fmtTel = (t?: string | null) => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 11 ? `+${d.slice(0, 2)} ${d.slice(2, 3)} ${d.slice(3, 7)} ${d.slice(7)}` : t || ''; };

/** tu celular vinculado (cada usuario el suyo): verlo, cambiarlo (con un código nuevo) o desvincularlo */
function MiWhatsApp() {
  const { estado: e, waCargar, waVincular, waDesvincular, waRevisarVinculo } = useWhatsApp();
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
  const numero = e?.numeroEmpresa || '+56 9 4497 5958';
  const vincular = async () => {
    setOcupado(true);
    const err = await waVincular(yo?.nombre || cuentaPf?.namePerson || '', yo?.email || cuentaPf?.email || '');
    setOcupado(false);
    if (err) toast(err, 6000);
  };
  const desvincular = async () => { setOcupado(true); await waDesvincular(); setOcupado(false); toast('Celular desvinculado.'); };
  const copiar = async () => { try { await navigator.clipboard.writeText(e?.codigo || ''); toast('Código copiado.'); } catch { /* sin portapapeles */ } };

  return (
    <Card titulo="Mi WhatsApp" subtitulo="Vincula tu celular para hablar con tu equipo de Asset (Pedro, Juanita, Diego y Fernanda) por WhatsApp.">
      <div id="cfgMiWa" className="tw:flex tw:flex-col tw:gap-4">
        {!listo ? <p className="tw:m-0 tw:text-sm tw:text-muted">Cargando…</p>
          : !e?.conectado ? (
            <p className="tw:m-0 tw:text-sm tw:text-muted">El WhatsApp de la empresa aún no está conectado. {yo?.rol === 'ADMIN' ? 'Conéctalo en la pestaña Integraciones (wechatia).' : 'Pídele al administrador que lo conecte.'}</p>
          ) : e.codigo ? (
            <div className="tw:flex tw:flex-col tw:gap-3">
              <p className="tw:m-0 tw:text-sm">Desde <b>tu celular</b>, envía este mensaje por WhatsApp al <b>{numero}</b>:</p>
              <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-3">
                <b id="cfgCodigo" className="tw:px-4 tw:py-2 tw:rounded-xl tw:bg-sunken tw:border tw:border-solid tw:border-edge tw:font-mono tw:text-2xl tw:tracking-wider">{e.codigo}</b>
                <Boton variante="secundario" tamano="sm" icono="link" onClick={copiar}>Copiar</Boton>
              </div>
              <p className="tw:m-0 tw:flex tw:items-center tw:gap-2 tw:text-[13px] tw:text-muted"><span className="spinner sm" /> Esperando tu mensaje… (se revisa cada pocos segundos)</p>
            </div>
          ) : (
            <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-4">
              <span className={cx('tw:grid tw:flex-none tw:place-items-center tw:w-12 tw:h-12 tw:rounded-2xl', e.telefono ? 'tw:bg-green-soft tw:text-green-softink' : 'tw:bg-gray-soft tw:text-gray-softink')}><Icono nombre="whatsapp" tam={24} /></span>
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
        <p className="tw:m-0 tw:pt-3 tw:border-0 tw:border-t tw:border-solid tw:border-edge tw:text-[13px] tw:text-muted">
          {e?.telefono ? <>Escríbele al <b>{numero}</b> el nombre de quien necesitas: <b>Pedro</b> (captación), <b>Juanita</b> (documentos), <b>Diego</b> (seguimiento) o <b>Fernanda</b> (leads). También puedes mandar audios.</>
            : <>Para cambiar o vincular el número, Asset te da un código y lo envías desde ese celular al <b>{numero}</b>.</>}
        </p>
      </div>
    </Card>
  );
}

/** los asistentes que atienden a los clientes (solo el administrador los cambia); si el servidor no responde, lo dice sin bloquear */
function Asistentes() {
  const [a, setA] = useState<IAsistentes | null>(null);
  const [error, setError] = useState('');
  const cargar = () => api<IAsistentes>('waAsistentes').then((r) => { setA(r); setError(''); }).catch((e: Error) => setError(e.message));
  useEffect(() => { cargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- solo al abrir
  const ajustar = async (o: Partial<Record<'leadsActivo' | 'clientesActivo' | 'postventa', boolean>>, listo: string) => {
    setA((x) => ({ ...x, ...o }));
    try { await api('waAsistentesAjustar', o); toast(listo); } catch (e) { toast((e as Error).message, 5000); }
    cargar();
  };
  return (
    <Card titulo="Asistentes con clientes" subtitulo="Responden solos a quienes escriben al WhatsApp de la empresa. Solo el administrador los cambia.">
      {error ? <p className="tw:m-0 tw:text-[13px] tw:text-muted">No se pudo leer cómo están ahora ({error}). Vuelve a intentarlo en un momento.</p> : (
        <div className="tw:flex tw:flex-col tw:gap-3">
          <Switch id="cfgSofia" activo={a?.leadsActivo ?? true} deshabilitado={!a} etiqueta="Sofía · leads"
            descripcion="Atiende a los leads y a los números nuevos: toma sus datos, busca propiedades y agenda visitas."
            alCambiar={(v) => ajustar({ leadsActivo: v }, v ? 'Sofía atiende a los leads.' : 'Sofía apagada: los leads los respondes tú.')} />
          <Switch id="cfgTomas" activo={a?.clientesActivo ?? true} deshabilitado={!a} etiqueta="Tomás · clientes del CRM"
            descripcion="Atiende a propietarios y clientes de tu CRM: dudas de sus propiedades y firmas."
            alCambiar={(v) => ajustar({ clientesActivo: v }, v ? 'Tomás atiende a los clientes del CRM.' : 'Tomás apagado.')} />
          <Switch id="cfgPostventa" activo={!!a?.postventa} deshabilitado={!a} etiqueta="Postventa · reclamos"
            descripcion="Recibe y sigue los reclamos de garantía de los propietarios."
            alCambiar={(v) => ajustar({ postventa: v }, v ? 'Respuesta automática de reclamos encendida.' : 'Respuesta automática de reclamos apagada.')} />
        </div>
      )}
    </Card>
  );
}

function WhatsApp() {
  const { usuario: yo } = useAcceso();
  return (
    <div className="tw:flex tw:max-w-[760px] tw:flex-col tw:gap-5">
      <MiWhatsApp />
      {yo?.rol === 'ADMIN' && <Asistentes />}
    </div>
  );
}

// ---------------------------------------------------------------- pantalla

export default function Configuracion({ pestana: inicial = 'general' }: { pestana?: TPestanaConfig }) {
  const [pestana, setPestana] = useState<TPestanaConfig>(inicial);
  return (
    <Layout
      id="configuracion"
      titulo="Configuración"
      subtitulo="Tus preferencias, tu WhatsApp y las integraciones de la corredora."
      barra={<Tabs id="cfgTabs" dato="t" etiqueta="Secciones" variante="linea" opciones={PESTANAS} valor={pestana} alCambiar={setPestana} className="tw:w-full" />}
    >
      {pestana === 'general' ? <General /> : pestana === 'whatsapp' ? <WhatsApp /> : <IntegracionesContenido />}
    </Layout>
  );
}
