// Agente por WhatsApp (0.13). Se instala al cargar el bundle (index.tsx) como window.WhatsAppAgente:
//  · abrir(): la ventana para conectar, vincular el celular y activar este computador (menú del usuario, pestaña Agente);
//  · refrescar(): el controlador del Agente lo llama cuando llega un evento de WhatsApp, por si la ventana está abierta.
import AgenteWhatsApp from './AgenteWhatsApp';
import { whatsappEstado } from '../../../store/hooks/useWhatsApp.hook';
import { abrirModal } from '../../../utils/modal';

export function abrirAgenteWhatsApp() { abrirModal(<AgenteWhatsApp />, { clave: 'modal-124', ancho: true }); }

function refrescar() { if (document.getElementById('waAg')) whatsappEstado().waCargar(); }

export function instalarWhatsApp() {
  window.WhatsAppAgente = { abrir: abrirAgenteWhatsApp, refrescar };
}
