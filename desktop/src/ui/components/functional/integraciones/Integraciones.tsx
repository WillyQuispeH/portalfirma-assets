// Integraciones: los servicios conectados a Asset, en un solo lugar, cada uno con su estado y su botón.
//  · Firma: Portalfirma (la sesión de la corredora, en el servidor).
//  · Mensajes y redes: wechatia (la cuenta de mensajes de la corredora) y sus canales: WhatsApp, Instagram, Facebook,
//    correo y chat del sitio. La API de wechatia no conecta canales: «Conectar» abre la página de su panel donde se hace
//    (con el inicio de sesión de Meta). Un canal aparece «En uso» cuando hay conversaciones recientes por él.
//  · Portales (Mercado Libre / Portal Inmobiliario), archivos (Google Drive) y otros (Google Maps, asistente de IA).
// Conectar o cambiar lo que es de toda la corredora (Portalfirma, wechatia, Mercado Libre) es del administrador.
import { useEffect, useState, type ReactNode } from 'react';
import Layout from '../../ui/Layout';
import Card from '../../ui/Card';
import ItemLista from '../../ui/ItemLista';
import Badge from '../../ui/Badge';
import Boton from '../../ui/Boton';
import Input from '../../ui/Input';
import Icono from '../../ui/Icono';
import { useIntegraciones } from '../../../store/hooks/useIntegraciones.hook';
import { useCuenta } from '../../../store/hooks/useCuenta.hook';
import { useAcceso } from '../../../store/hooks/useAcceso.hook';
import { integracionesService as svc } from '../../../store/services/integraciones.service';
import { refrescarCuenta } from '../cuenta/controlador';
import { abrirUrl, pedirInicioSesion, toast } from '../../../utils/app';
import { fechaHora } from '../../../utils/formato';
import type { ICanal } from '../../../store/interfaces/integraciones.interface';

// ---------------------------------------------------------------- piezas

/** el logo de cada servicio: un ícono de la app (o una letra) sobre su color */
function Logo({ icono, letra, color }: { icono?: string; letra?: string; color: string }) {
  return (
    <span className="tw:inline-grid tw:place-items-center tw:size-10 tw:rounded-xl tw:text-white tw:font-bold tw:text-lg" style={{ background: color }}>
      {icono ? <Icono nombre={icono} tam={20} /> : letra}
    </span>
  );
}

type TEstado = 'conectado' | 'en-uso' | 'sin-conectar' | 'atencion' | 'incluido' | 'no-disponible';
const ESTADO: Record<TEstado, [string, Parameters<typeof Badge>[0]['tono']]> = {
  conectado: ['Conectado', 'verde'],
  'en-uso': ['En uso', 'verde'],
  'sin-conectar': ['Sin conectar', 'gris'],
  atencion: ['Revisar', 'amarillo'],
  incluido: ['Incluido', 'azul'],
  'no-disponible': ['No disponible', 'gris'],
};

function Fila({ id, logo, nombre, detalle, estado, children }: { id: string; logo: ReactNode; nombre: string; detalle: ReactNode; estado: TEstado; children?: ReactNode }) {
  const [texto, tono] = ESTADO[estado];
  return (
    <ItemLista data-integracion={id} media={logo} titulo={nombre} detalle={detalle}
      derecha={<span className="tw:flex tw:flex-wrap tw:items-center tw:justify-end tw:gap-2">
        <Badge tono={tono} punto>{texto}</Badge>
        {children}
      </span>} />
  );
}

/** una lista de filas separadas por una línea */
function Lista({ children }: { children: ReactNode }) {
  return <div className="tw:flex tw:flex-col tw:divide-y tw:divide-line tw:[&>*]:py-3 tw:-my-3">{children}</div>;
}

// ---------------------------------------------------------------- pantalla

/** las tarjetas de las integraciones (pantalla Configuración › Integraciones) */
export function IntegracionesContenido() {
  const { wechatia, canales, ml, drive, maps, ia, cargando, ocupado, integCargar, integAccion } = useIntegraciones();
  const { conectado: pfConectado, usuario: pfUsuario, sesion, saldo } = useCuenta();
  const { usuario: yo } = useAcceso();
  const admin = yo?.rol === 'ADMIN';
  useEffect(() => { integCargar(); refrescarCuenta(); }, [integCargar]);

  const accion = async (id: string, fn: () => Promise<{ ok: boolean; error?: string }>, listo?: string) => {
    const error = await integAccion(id, fn);
    if (error) toast(error, 5000); else if (listo) toast(listo);
  };

  const pfCuenta = (pfUsuario as { email?: string } | null)?.email || (sesion as { email?: string } | null)?.email || '';
  const saldoTxt = saldo != null ? ` · saldo $${Number(saldo).toLocaleString('es-CL')}` : '';

  return (
    <div id="integraciones" className="tw:flex tw:flex-col tw:gap-4">
      <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-3">
        <p className="tw:m-0 tw:flex-1 tw:text-sm tw:text-muted">Los servicios con los que trabaja tu corredora: firma, mensajes y redes, portales y archivos.</p>
        <Boton variante="secundario" tamano="sm" icono="rotateR" cargando={cargando} onClick={() => { integCargar(); refrescarCuenta(); }}>Actualizar</Boton>
      </div>
      <Card titulo="Firma electrónica">
        <Lista>
          <Fila id="portalfirma" logo={<Logo icono="sign" color="#3346c7" />} nombre="Portalfirma"
            detalle={pfConectado ? `Firma, plantillas y notaría virtual${pfCuenta ? ' · ' + pfCuenta : ''}${saldoTxt}` : 'Para enviar documentos a firmar y usar las plantillas. La conecta una vez el administrador.'}
            estado={pfConectado ? 'conectado' : 'sin-conectar'}>
            {!pfConectado && (
              <Boton tamano="sm" icono="link" disabled={!admin} title={admin ? undefined : 'La conecta el administrador de la corredora'}
                onClick={() => pedirInicioSesion(() => { refrescarCuenta(); toast('Portalfirma conectado.'); }, 'Conecta la cuenta de Portalfirma de tu corredora.')}>
                Conectar
              </Boton>
            )}
          </Fila>
        </Lista>
      </Card>

      <Card titulo="Mensajes y redes sociales"
        subtitulo="Llegan a través de wechatia: el servidor de Asset los lee y responden Sofía (leads), Tomás (clientes) y la postventa.">
        <Lista>
          <Wechatia conectado={!!wechatia?.conectado} locationId={wechatia?.locationId} panel={canales?.panel ?? null} admin={admin}
            ocupado={ocupado === 'wechatia'}
            conectar={(token, loc) => accion('wechatia', () => svc.conectarWechatia(token, loc), 'wechatia conectado.')} />
          {(canales?.canales ?? []).map((c) => (
            <Canal key={c.id} c={c} cuentaLista={!!wechatia?.conectado} local={!!canales?.local} />
          ))}
        </Lista>
        {canales?.error && <p className="tw:mt-3 tw:mb-0 tw:text-xs tw:text-muted">No se pudo leer la actividad de los canales: {canales.error}</p>}
      </Card>

      <Card titulo="Portales inmobiliarios">
        <Lista>
          <Fila id="mercadolibre" logo={<Logo icono="house" color="#e9b200" />} nombre="Mercado Libre y Portal Inmobiliario"
            detalle={ml?.conectada ? `Publica y sincroniza avisos${ml.cuenta?.nickname ? ' · ' + ml.cuenta.nickname : ''}` : 'Publica tus propiedades y recibe los interesados en Leads.'}
            estado={!ml?.configurada ? 'no-disponible' : ml.conectada ? 'conectado' : 'sin-conectar'}>
            {/* la cuenta es de toda la corredora (la sesión vive en el servidor): la conecta y desconecta el administrador */}
            {ml?.configurada && (ml.conectada
              ? <Boton tamano="sm" variante="fantasma" cargando={ocupado === 'ml'} disabled={!admin} title={admin ? undefined : 'La desconecta el administrador de la corredora'}
                  onClick={() => accion('ml', svc.mlDesconectar, 'Mercado Libre desconectado.')}>Desconectar</Boton>
              : <Boton tamano="sm" icono="link" cargando={ocupado === 'ml'} disabled={!admin} title={admin ? undefined : 'La conecta el administrador de la corredora'}
                  onClick={() => accion('ml', svc.mlConectar, 'Mercado Libre conectado.')}>Conectar</Boton>)}
          </Fila>
        </Lista>
      </Card>

      <Card titulo="Archivos">
        <Lista>
          <Fila id="drive" logo={<Logo icono="drive" color="#1a73e8" />} nombre="Google Drive"
            detalle={drive?.connected ? `Expedientes y fotos${drive.email ? ' · ' + drive.email : ''}` : drive?.reconnect ? 'Vuelve a conectar: cambió el permiso que pide Asset.' : 'Para traer documentos y fotos desde tu Drive. Se conecta en cada equipo.'}
            estado={!drive?.configured ? 'no-disponible' : drive.connected ? 'conectado' : drive.reconnect ? 'atencion' : 'sin-conectar'}>
            {drive?.configured && (drive.connected
              ? <Boton tamano="sm" variante="fantasma" cargando={ocupado === 'drive'} onClick={() => accion('drive', svc.driveDesconectar, 'Google Drive desconectado.')}>Desconectar</Boton>
              : <Boton tamano="sm" icono="link" cargando={ocupado === 'drive'} onClick={() => accion('drive', svc.driveConectar, 'Google Drive conectado.')}>Conectar</Boton>)}
          </Fila>
        </Lista>
      </Card>

      <Card titulo="Otros servicios">
        <Lista>
          <Fila id="maps" logo={<Logo icono="pin" color="#34a853" />} nombre="Google Maps"
            detalle="Sugiere y completa direcciones al crear propiedades." estado={maps?.google ? 'conectado' : 'no-disponible'} />
          <Fila id="ia" logo={<Logo icono="sparkle" color="#7c3aed" />} nombre="Asistente de IA"
            detalle={ia?.managed ? (ia.propia ? 'Con una clave propia que reemplaza a la incluida.' : 'Incluido con tu cuenta de Portalfirma: no hay que configurar nada.') : 'El asistente que redacta, revisa documentos y atiende por WhatsApp.'}
            estado={ia?.managed ? 'incluido' : ia?.hasKey ? 'conectado' : 'sin-conectar'} />
        </Lista>
      </Card>
    </div>
  );
}

/** la pantalla sola (se mantiene por compatibilidad; desde el menú se abre Configuración › Integraciones) */
export default function Integraciones() {
  return <Layout titulo="Integraciones" ilustracion={{ imagen: 'img/formas/portales.svg', tinte: '#3346c7' }}><IntegracionesContenido /></Layout>;
}

// ---------------------------------------------------------------- wechatia y sus canales

function Wechatia({ conectado, locationId, panel, admin, ocupado, conectar }: {
  conectado: boolean; locationId?: string; panel: string | null; admin: boolean; ocupado: boolean;
  conectar: (token: string, locationId: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [token, setToken] = useState('');
  const [loc, setLoc] = useState(locationId || '');
  return <>
    <Fila id="wechatia" logo={<Logo letra="w" color="#16a34a" />} nombre="wechatia"
      detalle={conectado ? `La cuenta de mensajes de la corredora${locationId ? ' · ' + locationId : ''}` : 'La cuenta de mensajes de la corredora: sin ella no hay WhatsApp, Instagram ni Facebook.'}
      estado={conectado ? 'conectado' : 'sin-conectar'}>
      {conectado && panel && <Boton tamano="sm" variante="fantasma" iconoDerecha="arrowR" onClick={() => abrirUrl(panel)}>Abrir panel</Boton>}
      {admin && <Boton tamano="sm" variante={conectado ? 'fantasma' : 'principal'} icono={conectado ? 'edit' : 'link'} onClick={() => setAbierto((x) => !x)}>
        {conectado ? 'Cambiar clave' : 'Conectar'}
      </Boton>}
    </Fila>
    {abierto && admin && (
      <form className="tw:flex tw:flex-wrap tw:items-end tw:gap-3 tw:pl-[52px]"
        onSubmit={(e) => { e.preventDefault(); conectar(token.trim(), loc.trim()); setToken(''); setAbierto(false); }}>
        <Input clasesCampo="tw:flex-1 tw:min-w-[220px]" etiqueta="Clave de la integración privada" type="password" autoComplete="off"
          value={token} onChange={(e) => setToken(e.target.value)} placeholder="pit-…" />
        <Input clasesCampo="tw:w-[220px]" etiqueta="Id de la cuenta (location)" value={loc} onChange={(e) => setLoc(e.target.value)}
          ayuda="Está en la dirección del panel: …/location/XXXX/…" />
        <Boton type="submit" cargando={ocupado} disabled={token.trim().length < 20 || loc.trim().length < 4}>Guardar</Boton>
      </form>
    )}
  </>;
}

const LOGO_CANAL: Record<string, { icono?: string; letra?: string; color: string }> = {
  whatsapp: { icono: 'whatsapp', color: '#25d366' },
  instagram: { icono: 'instagram', color: '#d62976' },
  facebook: { letra: 'f', color: '#1877f2' },
  correo: { icono: 'mail', color: '#64748b' },
  chat: { icono: 'phone', color: '#0ea5e9' },
};
const PARA_QUE: Record<string, string> = {
  whatsapp: 'Conversaciones con clientes y leads, recordatorios y avisos.',
  instagram: 'Mensajes directos: los interesados entran como leads.',
  facebook: 'Mensajes de tu página: los interesados entran como leads.',
  correo: 'Correos de portales y clientes, en la misma bandeja.',
  chat: 'El chat de tu sitio web.',
};

function Canal({ c, cuentaLista, local }: { c: ICanal; cuentaLista: boolean; local: boolean }) {
  const detalle = c.enUso && c.ultimo ? `${PARA_QUE[c.id] ?? ''} Último mensaje: ${fechaHora(c.ultimo)}.` : PARA_QUE[c.id] ?? '';
  return (
    <Fila id={`canal-${c.id}`} logo={<Logo {...(LOGO_CANAL[c.id] ?? { icono: 'link', color: '#64748b' })} />} nombre={c.nombre}
      detalle={local ? `${PARA_QUE[c.id] ?? ''} Entra con tu cuenta de Asset para ver su estado.` : detalle}
      estado={c.enUso ? 'en-uso' : 'sin-conectar'}>
      {c.conectar && (
        <Boton tamano="sm" variante={c.enUso ? 'fantasma' : 'secundario'} iconoDerecha="arrowR" disabled={!cuentaLista}
          title="Se abre el panel de wechatia, donde se conecta con el inicio de sesión de Meta o del correo"
          onClick={() => abrirUrl(c.conectar!)}>
          {c.enUso ? 'Administrar' : 'Conectar'}
        </Boton>
      )}
    </Fila>
  );
}
