// Las tarjetas de los portales: UNA estructura para todos (cabecera con logo, nombre y estado; descripción y datos; acciones al pie),
// la misma en Cartera › Portales y en Publicaciones › Portales. Separaciones y radios de globals.css (--ui-gap, --ui-radio-card):
// la grilla da el espacio entre tarjetas con tw:gap-ui y todas las tarjetas de una fila miden lo mismo (los botones quedan al pie).
// Con el kit: Card (cabecera, cuerpo y pie), Badge, Switch, Input, Boton, ListaDatos, MenuMas, ModalConfirmar y Esqueleto.
// Ids que usan las pruebas: data-po (con data-token, data-url, data-save, data-sol y el interruptor role="switch"),
// poCon, poSync, poExist y poOut (Portal Inmobiliario).
import { useCallback, useEffect, useState } from 'react';
import Boton from '../../ui/Boton';
import Card from '../../ui/Card';
import Badge from '../../ui/Badge';
import Input from '../../ui/Input';
import Switch from '../../ui/Switch';
import MenuMas from '../../ui/MenuMas';
import ListaDatos from '../../ui/ListaDatos';
import Esqueleto, { EsqueletoTexto, EsqueletoZona } from '../../ui/Esqueleto';
import { ModalConfirmar } from '../../ui/Modal';
import { api } from '../../../utils/api';
import { toast, vincularAvisosExistentes } from '../../../utils/app';
import { fechaHora } from '../../../utils/formato';
import { usePublicacion } from '../../../store/hooks/usePublicacion.hook';
import { useCartera } from '../../../store/hooks/useCartera.hook';
import { LogoPortal, VIA } from './comun';
import type { IContactoAvisos, IPortal } from '../../../store/interfaces/publicacion.interface';

const aviso = (r: { mensaje?: string; error?: string }) => { if (r.error) toast(r.error, 5000); else if (r.mensaje) toast(r.mensaje, 5000); };

/** lo que cambia de una tarjeta a otra va en el cuerpo; el marco es siempre el mismo */
const CUERPO = 'tw:flex tw:flex-col tw:gap-ui';
const PIE = 'tw:flex tw:flex-wrap tw:items-center tw:justify-end tw:gap-ui';
// todas las tarjetas de una fila miden lo mismo y el cuerpo crece: el pie (los botones) queda siempre abajo
const MARCO = 'tw:h-full tw:flex tw:flex-col tw:[&>div]:flex-1';

function Titulo({ id, nombre, via }: { id: string; nombre: string; via: string }) {
  return (
    <span className="tw:flex tw:items-center tw:gap-3">
      <LogoPortal id={id} nombre={nombre} />
      <span className="tw:flex tw:min-w-0 tw:flex-col"><span>{nombre}</span><small className="tw:text-xs tw:font-normal tw:text-muted">{via}</small></span>
    </span>
  );
}

// ---------------------------------------------------------------- Portal Inmobiliario (Mercado Libre, por API)

interface IEstadoML {
  configurada: boolean; conectada: boolean; cuenta?: { nickname?: string; email?: string } | null;
  contacto?: IContactoAvisos | null; tipoAviso?: string; ultimaSync?: string | null;
}
type TPaquetes = Record<string, number | null | undefined>;
export const TIPO_AVISO: Record<string, string> = { silver: 'Publicación', gold: 'Destacado', gold_premium: 'Destacado premium' };

/** el estado de la cuenta de Mercado Libre (la sesión vive en el servidor); la usan la tarjeta y el formulario de contacto */
export function useCuentaML() {
  const [e, setE] = useState<IEstadoML | null>(null);
  const [paq, setPaq] = useState<TPaquetes | null>(null);
  const [error, setError] = useState('');
  const cargar = useCallback(async () => {
    try {
      const est = await api<IEstadoML>('mlEstado');
      const paquetes = est.conectada ? await api<TPaquetes | null>('mlPaquetes').catch(() => null) : null;
      setPaq(paquetes); setE(est); setError(''); // juntos: la tarjeta no se ve a medias
    } catch (er) { setError((er as Error).message); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);
  return { e, paq, error, cargar };
}

export function TarjetaPortalInmobiliario({ cuenta }: { cuenta: ReturnType<typeof useCuentaML> }) {
  const { e, paq, error, cargar } = cuenta;
  const { propiedades, cargado, carteraGetAll } = useCartera();
  const { portalesGetAll } = usePublicacion();
  const [ocupado, setOcupado] = useState<'' | 'conectar' | 'sync'>('');
  useEffect(() => { if (!cargado) void carteraGetAll(); }, [cargado, carteraGetAll]);
  if (!e) return error ? <Card titulo="Portal Inmobiliario"><p role="alert" className="tw:m-0 tw:text-red-softink">No se pudo leer la cuenta: {error}</p></Card> : <EsqueletoTarjeta />;

  const avisos = propiedades.flatMap((p) => (['venta', 'arriendo'] as const).map((op) => p.portales?.pi?.[op]).filter((a) => a?.itemId));
  const n = (k: string) => avisos.filter((a) => a?.status === k).length;
  const actualizar = () => { void cargar(); void portalesGetAll(); };
  const conectar = async () => {
    setOcupado('conectar');
    try { await api('mlConectar'); toast('Cuenta conectada.'); }
    catch (er) { if (!/cerró la ventana/.test((er as Error).message)) toast((er as Error).message, 6000); }
    setOcupado(''); actualizar();
  };
  const sincronizar = async () => {
    setOcupado('sync');
    try {
      const r = await api<{ avisos: number; leads: number }>('mlSincronizar'); actualizar();
      toast(`${r.avisos} ${r.avisos === 1 ? 'aviso revisado' : 'avisos revisados'} · ${r.leads} ${r.leads === 1 ? 'interesado nuevo' : 'interesados nuevos'}.`, 4000);
    } catch (er) { toast((er as Error).message, 6000); actualizar(); }
    setOcupado('');
  };
  const desconectar = async () => { await api('mlDesconectar'); toast('Cuenta desconectada. Los avisos siguen publicados.'); actualizar(); };

  return (
    <div data-po="pi" className={e.conectada ? 'on' : undefined}>
      <Card className={MARCO} titulo={<Titulo id="pi" nombre="Portal Inmobiliario" via="Mercado Libre · API" />}
        accion={<Badge tono={e.conectada ? 'verde' : 'gris'} punto>{e.conectada ? 'Cuenta conectada' : 'Sin conectar'}</Badge>}
        pie={(
          <div className={PIE}>
            {e.conectada ? (
              <>
                <Boton id="poExist" variante="secundario" icono="link" onClick={vincularAvisosExistentes}>Vincular avisos existentes</Boton>
                <Boton id="poSync" icono="rotateR" cargando={ocupado === 'sync'} onClick={sincronizar}>Sincronizar</Boton>
                <MenuMas etiqueta="Más acciones de la cuenta" opciones={[{ id: 'poOut', texto: 'Desconectar cuenta', icono: 'x', alTocar: desconectar }]} />
              </>
            ) : (
              <Boton id="poCon" icono="link" disabled={!e.configurada} cargando={ocupado === 'conectar'} onClick={conectar}>
                {ocupado === 'conectar' ? 'Esperando la autorización en Mercado Libre…' : 'Conectar cuenta de la corredora'}
              </Boton>
            )}
          </div>
        )}>
        <div className={CUERPO}>
          <p className="tw:m-0 tw:text-sm tw:text-muted">
            {e.conectada ? 'Publica, actualiza, pausa y finaliza los avisos por la API; se ven también en Mercado Libre y usan el paquete de publicaciones de la cuenta.'
              : 'Cada corredora conecta su propia cuenta de Mercado Libre. Ahí debe estar activada como inmobiliaria y tener un paquete de publicación contratado.'}
          </p>
          {!e.configurada && <p role="alert" className="tw:m-0 tw:text-sm tw:text-yellow-softink"><b>Falta registrar la app de PortalFirma en Mercado Libre.</b> Lo hace PortalFirma una sola vez (ver PORTAL-INMOBILIARIO.md).</p>}
          {e.conectada && (
            <ListaDatos datos={[
              ['Cuenta', `${e.cuenta?.nickname ?? ''}${e.cuenta?.email ? ' · ' + e.cuenta.email : ''}`],
              ['Avisos', `${n('active')} activos · ${n('paused')} pausados · ${n('closed')} finalizados`],
              ['Paquetes', paq ? Object.entries(TIPO_AVISO).map(([k, v]) => `${v}: ${paq[k] == null ? '—' : paq[k]}`).join(' · ') : null],
              ['Última sincronización', e.ultimaSync ? fechaHora(e.ultimaSync) : 'Nunca'],
            ]} />
          )}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- portales de feed (Chilepropiedades, Broku, TOCTOC, Yapo)

export function TarjetaPortalFeed({ x, feed, url }: { x: IPortal; feed: number; url?: string }) {
  const { portalGuardar, portalExportarFeed, portalRotarClave } = usePublicacion();
  const [activo, setActivo] = useState(x.listo);
  const [token, setToken] = useState('');
  const [cambiarClave, setCambiarClave] = useState(false);
  const copiar = () => { if (url) navigator.clipboard.writeText(url).then(() => toast('Dirección del feed copiada.'), () => toast(url, 8000)); };
  return (
    <div data-po={x.id} className={x.listo ? 'on' : undefined}>
      <Card className={MARCO} titulo={<Titulo id={x.id} nombre={x.nombre} via={VIA[x.via]} />}
        accion={<Badge tono={x.listo ? 'verde' : x.enTramite ? 'amarillo' : 'gris'} punto>{x.estado}</Badge>}
        pie={(
          <div className={PIE}>
            <Boton data-save onClick={async () => { const r = await portalGuardar(x.id, x.nombre, { activo, feedUrl: x.feedUrl || '', ...(token.trim() ? { token: token.trim() } : {}) }); if (!r.error) setToken(''); aviso(r); }}>Guardar</Boton>
            <MenuMas etiqueta={`Más acciones de ${x.nombre}`} opciones={[
              { id: `po-exp-${x.id}`, texto: 'Exportar feed a un archivo', icono: 'download', alTocar: async () => aviso(await portalExportarFeed(x.id)) },
              ...(url ? [
                { id: `po-cop-${x.id}`, texto: 'Copiar la dirección', icono: 'link', alTocar: copiar },
                { id: `po-rot-${x.id}`, texto: 'Cambiar la clave de los feeds', icono: 'rotateR', alTocar: () => setCambiarClave(true) },
              ] : []),
            ]} />
          </div>
        )}>
        <div className={CUERPO}>
          <p className="tw:m-0 tw:text-sm tw:text-muted">{x.detalle}</p>
          <ListaDatos datos={[
            ['En el feed', `${feed} ${feed === 1 ? 'aviso' : 'avisos'}`],
            ['Activa desde', x.desde ? new Date(x.desde).toLocaleDateString('es-CL') : null],
            ['Seguimiento', x.id === 'chilepropiedades' ? (x.token ? 'Conectado con el TOKEN' : 'Falta el TOKEN') : null],
          ]} />
          <Switch id={`po-act-${x.id}`} activo={activo} alCambiar={setActivo}
            etiqueta={x.enTramite ? 'Integración confirmada por el portal' : x.via === 'acuerdo' ? 'Acuerdo comercial activo' : 'Integración activada por el portal'}
            descripcion={activo ? 'Los avisos que publiques salen en el feed.' : 'Apagada: lo que publiques queda «en espera» y entra solo al activarla.'} />
          {x.id === 'chilepropiedades' && (
            <Input data-token type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder={x.token ? '••••••• (guardado)' : 'Pega aquí el TOKEN'}
              etiqueta="TOKEN de seguimiento" ayuda="Lo entrega el portal: trae estado, visitas e interesados." />
          )}
          {url
            ? <Input data-url readOnly value={url} onFocus={(e) => e.currentTarget.select()} icono="link" etiqueta="Dirección del feed" ayuda="Se la entregas al portal; es secreta." />
            : <p className="tw:m-0 tw:text-[13px] tw:text-muted">La dirección del feed la ve y la entrega el administrador de la corredora.</p>}
        </div>
      </Card>
      <ModalConfirmar abierto={cambiarClave} onCerrar={() => setCambiarClave(false)} clave="modal-139" peligro icono="alert"
        titulo="¿Cambiar la clave de los feeds?" textoConfirmar="Cambiar la clave"
        mensaje="Las direcciones actuales de todos los portales dejan de funcionar al instante. Después tendrás que entregar las nuevas a cada portal."
        onConfirmar={async () => { aviso(await portalRotarClave()); setCambiarClave(false); }} />
    </div>
  );
}

// ---------------------------------------------------------------- carga y grilla

/** la silueta de una tarjeta (mismas medidas que la real) mientras llegan los datos */
export function EsqueletoTarjeta() {
  return (
    <Card className={MARCO}>
      <div className={CUERPO}>
        <div className="tw:flex tw:items-center tw:gap-3"><Esqueleto forma="icono" ancho={40} /><Esqueleto ancho="45%" alto={14} /></div>
        <EsqueletoTexto lineas={3} />
        <Esqueleto forma="control" alto={40} />
      </div>
    </Card>
  );
}

export function EsqueletoGrilla() {
  return <EsqueletoZona etiqueta="Cargando los portales" className={GRILLA}>{[0, 1, 2, 3].map((i) => <EsqueletoTarjeta key={i} />)}</EsqueletoZona>;
}

/** las tarjetas en una grilla que reparte el ancho: todas del mismo alto por fila, separadas por --ui-gap */
export const GRILLA = 'tw:grid tw:grid-cols-[repeat(auto-fill,minmax(360px,1fr))] tw:items-stretch tw:gap-ui';

export function GrillaPortales({ cuenta }: { cuenta: ReturnType<typeof useCuentaML> }) {
  const { portales } = usePublicacion();
  if (!portales) return <EsqueletoGrilla />;
  return (
    <div className={GRILLA}>
      <TarjetaPortalInmobiliario cuenta={cuenta} />
      {portales.catalogo.filter((x) => x.id !== 'pi').map((x) => <TarjetaPortalFeed key={x.id} x={x} feed={portales.feeds[x.id] ?? 0} url={portales.urls?.[x.id]} />)}
    </div>
  );
}

/** el aviso de pie de página, el mismo en las dos pantallas */
export const NOTA_PORTALES = 'Chilepropiedades lee el feed una vez al día y su integración es gratis si la aprueban; no permite publicar ni borrar por API, así que publicar y retirar en Asset es entrar y salir del feed. Broku está en trámite. TOCTOC y Yapo publican con acuerdo comercial y reciben el mismo feed. El detalle de cada aviso (publicar, pausar, retirar, eliminar) está en Publicaciones › Avisos.';
