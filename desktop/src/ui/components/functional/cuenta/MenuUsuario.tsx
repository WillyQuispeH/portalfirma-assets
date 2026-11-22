// La cuenta arriba a la derecha (#account): el botón del usuario de Asset (iniciales, nombre y tokens del asistente)
// que abre su menú: corredora, usuarios de la corredora (administrarlos, si es ADMIN), la conexión con Portalfirma (saldo, conectar o desconectar), tokens, accesos rápidos,
// Google Drive, ayuda, Configuración (apariencia, WhatsApp e integraciones) y cierre de sesión. Mientras Portalfirma no esté conectado, al lado va
// «Conectar Portalfirma» (#topLoginBtn): Portalfirma ya no es el login de la app, solo se usa para firmar. El menú (#userMenu) va en <body>, como antes. Los id, clases y data-um los usan
// las pruebas; los estilos son las clases u-*, um-* y user-* de styles.css.
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icono from '../../ui/Icono';
import { useCuenta } from '../../../store/hooks/useCuenta.hook';
import { useAcceso } from '../../../store/hooks/useAcceso.hook';
import {
  abrirAyuda, abrirOperaciones, abrirUrl, mostrarVista,
  pedirInicioSesion, recorridoDePantalla, sesionCerrada, soporteWhatsAppGeneral, toast, verCuentaDrive, versionApp,
} from '../../../utils/app';
import { verTokens } from '../asistente/controlador';
import { refrescarCuenta } from './controlador';
import { abrirUsuarios } from '../usuarios/controlador';
import { abrirConfiguracion } from '../integraciones/controlador';
import AvisoActualizacion, { buscarActualizaciones } from './Actualizacion';
import { useMarca } from '../../../store/zustand/marca.store';

/** el avatar: la foto de la persona o, si no tiene, sus iniciales */
function AvatarU({ nombre, foto, grande }: { nombre: string; foto?: string; grande?: boolean }) {
  return <span className={`u-av${grande ? ' big' : ''}`} style={foto ? { backgroundImage: `url(${foto})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' } : undefined}>{iniciales(nombre)}</span>;
}

/** la foto elegida, recortada al cuadrado y reducida a 256 px (pesa ~20 KB) */
function reducirFoto(f: File): Promise<string> {
  return new Promise((ok, mal) => {
    if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) return mal(new Error('La foto tiene que ser PNG, JPG o WEBP.'));
    if (f.size > 12 * 1024 * 1024) return mal(new Error('Esa imagen pesa demasiado (más de 12 MB): usa otra.'));
    const url = URL.createObjectURL(f); const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const lado = Math.min(img.naturalWidth, img.naturalHeight); const c = document.createElement('canvas'); c.width = 256; c.height = 256;
      const g = c.getContext('2d'); if (!g) return mal(new Error('No pude leer esa imagen.'));
      g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256);
      g.drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, 256, 256);
      ok(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); mal(new Error('No pude leer esa imagen.')); };
    img.src = url;
  });
}

const iniciales = (n: string) => String(n || '').trim().split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase() || '?';
const primero = (n: string) => String(n || '').trim().split(/\s+/)[0] || '';
const tokens = (n: number | null) => (n == null ? '…' : `${n} token${n === 1 ? '' : 's'}`);
const pesos = (n: number | null | undefined) => (n == null ? '—' : '$' + Number(n).toLocaleString('es-CL'));

export default function MenuUsuario() {
  const { conectado, tokens: tk, menu, cuentaMenu, cuentaDrive } = useCuenta();
  const { usuario: yo } = useAcceso();
  const nombre = yo?.nombre || yo?.email || 'Mi cuenta';
  const fotos = useMarca((s) => s.fotos); const marcaCargar = useMarca((s) => s.marcaCargar);
  // el logo de la corredora (arriba a la izquierda) y las fotos del equipo, al entrar
  useEffect(() => { if (yo?.id) marcaCargar().catch(() => null); }, [yo?.id, marcaCargar]);
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
        <AvatarU nombre={nombre} foto={yo.id ? fotos[yo.id] : undefined} /><span className="u-n">{primero(nombre) || nombre}</span>
        <span className="u-tk" title="Tokens del asistente"><Icono nombre="sparkle" tam={12} />{tk ?? '…'}</span><Icono nombre="chevD" tam={14} />
      </>}
    </button>
    {menu && yo && createPortal(<Menu />, document.body)}
  </>;
}

function Menu() {
  const { usuario, sesion, saldo, tokens: tk, drive, conectado, cuentaMenu, cuentaSalir } = useCuenta();
  const { usuario: yo, accesoSalir, accesoPedirClave } = useAcceso();
  const pfu = usuario || {};
  const fotos = useMarca((s) => s.fotos); const marcaFoto = useMarca((s) => s.marcaFoto);
  const entrada = useRef<HTMLInputElement>(null);
  const monto = usuario ? saldo : sesion?.balance;
  // cada acción cierra el menú primero
  const ir = (fn: () => unknown) => () => { cuentaMenu(false); fn(); };
  const desconectarPf = async () => { await cuentaSalir(); sesionCerrada(); toast('Portalfirma desconectado'); };
  // cierra la sesión de Asset (y desconecta Portalfirma) y recarga: la siguiente persona parte de cero
  const salir = async () => { await accesoSalir(); location.reload(); };
  if (!yo) return null;
  return (
    <div id="userMenu" className="user-menu">
      <input ref={entrada} type="file" accept="image/png,image/jpeg,image/webp" id="umFoto" hidden
        onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; cuentaMenu(false); try { await marcaFoto(yo.id, await reducirFoto(f)); toast('Foto guardada.'); } catch (err) { toast((err as Error).message, 6000); } }} />
      <div className="um-head"><AvatarU nombre={yo.nombre} foto={fotos[yo.id]} grande /><div><b>{yo.nombre}</b><small>{yo.email}</small>
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
        <button data-um="config" onClick={ir(() => abrirConfiguracion('general'))}><Icono nombre="sun" tam={15} /><span>Configuración</span></button>
        <button data-um="integraciones" onClick={ir(() => abrirConfiguracion('integraciones'))}><Icono nombre="link" tam={15} /><span>Integraciones</span></button>
        <button data-um="foto" onClick={() => entrada.current?.click()}><Icono nombre="image" tam={15} /><span>{fotos[yo.id] ? 'Cambiar mi foto' : 'Poner mi foto'}</span></button>
        {fotos[yo.id] && <button data-um="fotoQuitar" onClick={ir(async () => { try { await marcaFoto(yo.id, null); toast('Foto quitada.'); } catch (e) { toast((e as Error).message, 5000); } })}><Icono nombre="trash" tam={15} /><span>Quitar mi foto</span></button>}
        <button data-um="clave" onClick={ir(() => accesoPedirClave(true))}><Icono nombre="lock" tam={15} /><span>Cambiar mi clave</span></button>
        <button data-um="ops" onClick={ir(abrirOperaciones)}><Icono nombre="listCheck" tam={15} /><span>Mis operaciones</span></button>
        <button data-um="drive" onClick={ir(verCuentaDrive)}><Icono nombre="drive" tam={15} /><span>Google Drive</span><small id="umDrive">{drive || ''}</small></button>
      </div>
      <div className="um-sec">
        <button data-um="waag" onClick={ir(() => abrirConfiguracion('whatsapp'))}><Icono nombre="whatsapp" tam={15} /><span>Agente por WhatsApp</span></button>
        <button data-um="help" onClick={ir(abrirAyuda)}><Icono nombre="help" tam={15} /><span>Ayuda y guías</span></button>
        <button data-um="tour" onClick={ir(recorridoDePantalla)}><Icono nombre="compass" tam={15} /><span>Ver el recorrido de esta pantalla</span></button>
        <button data-um="wa" onClick={ir(soporteWhatsAppGeneral)}><Icono nombre="whatsapp" tam={15} /><span>Soporte por WhatsApp</span></button>
        <button data-um="web" onClick={ir(() => abrirUrl('https://empresa.portalfirma.cl/dashboard'))}><Icono nombre="building" tam={15} /><span>Abrir mi cuenta en la web</span></button>
      </div>
      <div className="um-sec"><button data-um="out" className="danger" onClick={ir(salir)}><Icono nombre="logout" tam={15} /><span>Cerrar sesión</span></button></div>
      <div className="um-foot">PortalFirma Asset {versionApp()} · <a href="#" id="umAct" onClick={(e) => { e.preventDefault(); buscarActualizaciones(); }}>Buscar actualizaciones</a></div>
    </div>
  );
}
