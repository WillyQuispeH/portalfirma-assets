// modal-155: escribirle al portal para pedir la integración (Chilepropiedades: feed y token; TOCTOC: las 3 llaves de su API).
// El correo viene listo con los datos de la corredora y se puede editar todo (para, asunto y mensaje). «Enviar» lo abre en el
// programa de correo del usuario, que lo manda desde su cuenta: así la respuesta del portal le llega a él.
import { useEffect, useState } from 'react';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../ui/Ventana';
import Boton from '../../ui/Boton';
import Input from '../../ui/Input';
import Textarea from '../../ui/Textarea';
import { abrirModal, cerrarModal } from '../../../utils/modal';
import { toast } from '../../../utils/app';
import { api, apiCruda } from '../../../utils/api';
import type { IUsuarioAsset } from '../../../store/interfaces/acceso.interface';

export type TPortalCorreo = 'chilepropiedades' | 'toctoc';

interface IBorrador {
  para: string;
  asunto: string;
  mensaje: string;
}

function borrador(portal: TPortalCorreo, u: IUsuarioAsset | null, feed: string | null): IBorrador {
  const corredora = u?.corredora?.nombre || 'nuestra corredora';
  const firma = [u?.nombre, corredora, u?.email].filter(Boolean).join('\n');
  if (portal === 'chilepropiedades')
    return {
      para: 'integraciones@chilepropiedades.cl',
      asunto: `Solicitud de integración por feed – ${corredora}`,
      mensaje: [
        'Hola, equipo de integraciones de Chilepropiedades:',
        '',
        `Somos ${corredora} y queremos sincronizar nuestra cartera con Chilepropiedades.cl usando Asset (PortalFirma) como sistema externo.`,
        '',
        `- Corredora: ${corredora}`,
        `- Cuenta en Chilepropiedades: ${u?.email || '[correo de la cuenta]'}`,
        `- Dirección del feed (XML): ${feed || '[dirección del feed]'}`,
        `- Identificador de la corredora en el feed (contact/agencyId): ${u?.corredoraId || ''}`,
        '',
        'Les pedimos:',
        '1. Habilitar la integración del feed para nuestra cuenta, con la gestión automática de corredores (cada corredor va identificado por su correo en contact/email).',
        '2. Dejar nuestra cuenta como propietaria de la integración, para crear el token en Mi Cuenta → Tokens API y recibir los contactos de los avisos.',
        '',
        'Saludos,',
        firma,
      ].join('\n'),
    };
  return {
    para: 'integraciones@toctoc.com',
    asunto: `Solicitud de llaves de la API – ${corredora}`,
    mensaje: [
      'Hola, equipo de integraciones de TOCTOC:',
      '',
      `Somos ${corredora}, tenemos plan activo en TOCTOC y queremos publicar nuestros avisos desde Asset (PortalFirma), a través de KONVER.`,
      '',
      'Les pedimos las tres llaves de la API de nuestra cuenta:',
      '- key_cliente',
      '- key_integrador',
      '- corredor_id',
      '',
      `- Corredora: ${corredora}`,
      `- Correo de la cuenta en TOCTOC: ${u?.email || '[correo de la cuenta]'}`,
      '',
      'Saludos,',
      firma,
    ].join('\n'),
  };
}

const NOMBRE: Record<TPortalCorreo, string> = { chilepropiedades: 'Chilepropiedades', toctoc: 'TOCTOC' };
const correoValido = (s: string) => s.split(/[,;]/).map((x) => x.trim()).filter(Boolean).every((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));

function CorreoPortal({ portal, usuario }: { portal: TPortalCorreo; usuario: IUsuarioAsset | null }) {
  const [b, setB] = useState<IBorrador>(() => borrador(portal, usuario, null));
  const [tocado, setTocado] = useState(false);
  // la dirección del feed la sabe el servidor (solo el administrador): si llega antes de editar, se pone en el mensaje
  useEffect(() => {
    if (portal !== 'chilepropiedades') return;
    api<{ feeds: Record<string, { url: string }> }>('pubFeeds')
      .then((r) => { const url = r?.feeds?.chilepropiedades?.url; if (url && !tocado) setB(borrador(portal, usuario, url)); })
      .catch(() => undefined);
  }, [portal, usuario, tocado]);
  const cambiar = (k: keyof IBorrador, v: string) => { setTocado(true); setB((x) => ({ ...x, [k]: v })); };
  const listo = correoValido(b.para) && !!b.asunto.trim() && !!b.mensaje.trim();

  const enviar = () => {
    const url = `mailto:${b.para.split(/[,;]/).map((x) => x.trim()).filter(Boolean).join(',')}?subject=${encodeURIComponent(b.asunto)}&body=${encodeURIComponent(b.mensaje)}`;
    void apiCruda<boolean>('openLink', url);
    cerrarModal();
    toast('Se abrió tu correo con el mensaje listo: revísalo y envíalo desde ahí.', 6000);
  };

  return (
    <>
      <VentanaCabecera icono="mail" titulo={`Escribir a ${NOMBRE[portal]}`} descripcion="Revisa y edita el correo antes de enviarlo. Sale desde tu cuenta de correo." />
      <VentanaCuerpo>
        <div className="tw:flex tw:flex-col tw:gap-ui">
          <Input id="cpPara" etiqueta="Para" value={b.para} onChange={(e) => cambiar('para', e.target.value)} error={b.para && !correoValido(b.para) ? 'Revisa el correo.' : null} />
          <Input id="cpAsunto" etiqueta="Asunto" value={b.asunto} onChange={(e) => cambiar('asunto', e.target.value)} />
          <Textarea id="cpMensaje" etiqueta="Mensaje" rows={14} value={b.mensaje} onChange={(e) => cambiar('mensaje', e.target.value)} />
        </div>
      </VentanaCuerpo>
      <VentanaPie>
        <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
        <Boton id="mOk" icono="send" disabled={!listo} onClick={enviar}>Enviar</Boton>
      </VentanaPie>
    </>
  );
}

export const abrirCorreoPortal = (portal: TPortalCorreo, usuario: IUsuarioAsset | null) =>
  abrirModal(<CorreoPortal portal={portal} usuario={usuario} />, { ancho: true, clave: 'modal-155' });
