// La cuenta arriba a la derecha (#account): el botón del usuario de Asset (iniciales, nombre y tokens del asistente)
// que abre su menú: corredora, usuarios de la corredora (administrarlos, si es ADMIN), la conexión con Portalfirma (saldo, conectar o desconectar), tokens, accesos rápidos,
// Google Drive, ayuda, apariencia y cierre de sesión. Mientras Portalfirma no esté conectado, al lado va
// «Conectar Portalfirma» (#topLoginBtn): Portalfirma ya no es el login de la app, solo se usa para firmar. El menú (#userMenu) va en <body>, como antes. Los id, clases y data-um los usan
// las pruebas; los estilos son las clases u-*, um-* y user-* de styles.css.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Icono from '../../ui/Icono';
import { useCuenta } from '../../../store/hooks/useCuenta.hook';
import { useAcceso } from '../../../store/hooks/useAcceso.hook';
import {
  abrirAyuda, abrirExpedientes, abrirOperaciones, abrirPlazos, abrirUrl, cambiarTema, mostrarVista,
  pedirInicioSesion, recorridoDePantalla, sesionCerrada, soporteWhatsAppGeneral, temaActual, toast, verCuentaDrive, versionApp,
} from '../../../utils/app';
import { verTokens } from '../asistente/controlador';
import { abrirAgenteWhatsApp } from '../whatsapp/controlador';
import { refrescarCuenta } from './controlador';
import { abrirUsuarios } from '../usuarios/controlador';
import { abrirIntegraciones } from '../integraciones/controlador';
import AvisoActualizacion, { buscarActualizaciones } from './Actualizacion';

const iniciales = (n: string) => String(n || '').trim().split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase() || '?';
const primero = (n: string) => String(n || '').trim().split(/\s+/)[0] || '';
const tokens = (n: number | null) => (n == null ? '…' : `${n} token${n === 1 ? '' : 's'}`);
const pesos = (n: number | null | undefined) => (n == null ? '—' : '$' + Number(n).toLocaleString('es-CL'));
const TEMAS: [string, string][] = [['light', 'Claro'], ['dark', 'Oscuro'], ['system', 'Sistema']];

export default function MenuUsuario() {
  const { conectado, tokens: tk, menu, cuentaMenu, cuentaDrive } = useCuenta();
  const { usuario: yo } = useAcceso();
  const nombre = yo?.nombre || yo?.email || 'Mi cuenta';
  const alternar = () => {
    if (menu) return cuentaMenu(false);
    cuentaMenu(true); refrescarCuenta(); cuentaDrive();
  };
  // se cierra al tocar fuera o con Esc
  useEffect(() => {
    if (!menu) return;
    const fuera = (e: MouseEvent) => { const t = e.target as Element | null; if (!t?.closest?.('#userMenu, #userBtn')) cuentaMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') cuentaMenu(false); };
    document.addEventListener('click', fuera); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('click', fuera); document.removeEventListener('keydown', esc); };
  }, [menu, cuentaMenu]);
  return <>
    <AvisoActualizacion />
    <button className={`secondary small ${conectado ? 'hidden' : ''}`} id="topLoginBtn" title="Para enviar a firmar y usar las plantillas"
      onClick={() => pedirInicioSesion(() => mostrarVista('drop'), 'Conecta tu cuenta para enviar documentos a firmar.')}>Conectar Portalfirma</button>
    <button className={`user-btn ${yo ? '' : 'hidden'} ${menu ? 'on' : ''}`} id="userBtn" title="Tu cuenta" onClick={alternar}>
      {yo && <>
        <span className="u-av">{iniciales(nombre)}</span><span className="u-n">{primero(nombre) || nombre}</span>
        <span className="u-tk" title="Tokens del asistente"><Icono nombre="sparkle" tam={12} />{tk ?? '…'}</span><Icono nombre="chevD" tam={14} />
      </>}
    </button>
    {menu && yo && createPortal(<Menu />, document.body)}
  </>;
}

function Menu() {
  const { usuario, sesion, saldo, tokens: tk, drive, conectado, cuentaMenu, cuentaSalir } = useCuenta();
  const { usuario: yo, accesoSalir } = useAcceso();
  const [tema, setTema] = useState(temaActual());
  const pfu = usuario || {};
  const monto = usuario ? saldo : sesion?.balance;
  // cada acción cierra el menú primero
  const ir = (fn: () => unknown) => () => { cuentaMenu(false); fn(); };
  const desconectarPf = async () => { await cuentaSalir(); sesionCerrada(); toast('Portalfirma desconectado'); };
  // cierra la sesión de Asset (y desconecta Portalfirma) y recarga: la siguiente persona parte de cero
  const salir = async () => { await accesoSalir(); location.reload(); };
  if (!yo) return null;
  return (
    <div id="userMenu" className="user-menu">
      <div className="um-head"><span className="u-av big">{iniciales(yo.nombre)}</span><div><b>{yo.nombre}</b><small>{yo.email}</small>
        <small id="umCorredora">{yo.corredora.nombre} · {yo.rol === 'ADMIN' ? 'Administrador' : 'Corredor'}</small></div></div>
      <div className="um-cards">
        {conectado
          ? <div className="um-card" id="umPf"><small>Portalfirma{pfu.nameEntity ? ' · ' + pfu.nameEntity : ''}</small><b>{pesos(monto)}</b>
            <button className="ghost small" data-um="topup" onClick={ir(() => abrirUrl('https://empresa.portalfirma.cl/dashboard/wallet'))}>Recargar</button>
            <button className="ghost small" data-um="pfOut" onClick={ir(desconectarPf)}>Desconectar</button></div>
          : <div className="um-card" id="umPf"><small>Portalfirma</small><b>Sin conectar</b>
            <button className="ghost small" data-um="pfIn" onClick={ir(() => pedirInicioSesion(() => mostrarVista('drop'), 'Conecta tu cuenta de Portalfirma para firmar y usar las plantillas.'))}>Conectar</button></div>}
        <div className="um-card"><small>Tokens del asistente</small><b>{tokens(tk)}</b><button className="ghost small" data-um="tokens" onClick={ir(() => verTokens())}>Comprar / código</button></div>
      </div>
      <div className="um-sec">
        <button data-um="usuarios" onClick={ir(abrirUsuarios)}><Icono nombre="users" tam={15} /><span>{yo.rol === 'ADMIN' ? 'Usuarios de la corredora' : 'Equipo de la corredora'}</span></button>
        <button data-um="integraciones" onClick={ir(abrirIntegraciones)}><Icono nombre="link" tam={15} /><span>Integraciones</span></button>
        <button data-um="ops" onClick={ir(abrirOperaciones)}><Icono nombre="listCheck" tam={15} /><span>Mis operaciones</span></button>
        <button data-um="plazos" onClick={ir(abrirPlazos)}><Icono nombre="calendar" tam={15} /><span>Plazos y vencimientos</span></button>
        <button data-um="exp" onClick={ir(abrirExpedientes)}><Icono nombre="folderOpen" tam={15} /><span>Expedientes</span></button>
        <button data-um="drive" onClick={ir(verCuentaDrive)}><Icono nombre="drive" tam={15} /><span>Google Drive</span><small id="umDrive">{drive || ''}</small></button>
      </div>
      <div className="um-sec">
        <button data-um="waag" onClick={ir(abrirAgenteWhatsApp)}><Icono nombre="whatsapp" tam={15} /><span>Agente por WhatsApp</span></button>
        <button data-um="help" onClick={ir(abrirAyuda)}><Icono nombre="help" tam={15} /><span>Ayuda y guías</span></button>
        <button data-um="tour" onClick={ir(recorridoDePantalla)}><Icono nombre="compass" tam={15} /><span>Ver el recorrido de esta pantalla</span></button>
        <button data-um="wa" onClick={ir(soporteWhatsAppGeneral)}><Icono nombre="whatsapp" tam={15} /><span>Soporte por WhatsApp</span></button>
        <button data-um="web" onClick={ir(() => abrirUrl('https://empresa.portalfirma.cl/dashboard'))}><Icono nombre="building" tam={15} /><span>Abrir mi cuenta en la web</span></button>
      </div>
      <div className="um-tema"><span><Icono nombre="sun" tam={15} /> Apariencia</span>
        <div className="pv-seg" id="umTema">
          {TEMAS.map(([v, t]) => <button type="button" key={v} data-tema={v} className={tema === v ? 'on' : ''} onClick={async () => { await cambiarTema(v); setTema(v); }}>{t}</button>)}
        </div>
      </div>
      <div className="um-sec"><button data-um="out" className="danger" onClick={ir(salir)}><Icono nombre="logout" tam={15} /><span>Cerrar sesión</span></button></div>
      <div className="um-foot">PortalFirma Asset {versionApp()} · <a href="#" id="umAct" onClick={(e) => { e.preventDefault(); buscarActualizaciones(); }}>Buscar actualizaciones</a></div>
    </div>
  );
}
