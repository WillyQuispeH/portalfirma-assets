// Lo que el panel del editor (src/renderer/asistente.js) y otros módulos usan del Asistente legal.
// Se instala al cargar el bundle (index.tsx) como window.__asistente; asistente.js arma con esto su
// window.Asistente de siempre (ensureConsent, tokensDialog, draftDialog, status, wallet…).
import { Consentimiento, Redactar, Tokens } from './Ventanas';
import { asistenteEstado } from '../../../store/hooks/useAsistente.hook';
import { abrirModal } from '../../../utils/modal';
import { esMiembro, pedirSesion, pintarTokensEditor, redactarBorrador, toast } from '../../../utils/app';
import type { IAsistenteEstado, IBilletera } from '../../../store/interfaces/asistente.interface';

// Antes de usar IA se avisa: el texto del documento se envía al proveedor
export async function consentimiento(): Promise<boolean> {
  const s = await asistenteEstado().asistenteEstado();
  if (s.consent) return true;
  const proveedor = s.providers?.[s.provider || '']?.label || s.provider || 'el proveedor de IA';
  return new Promise((resolver) => abrirModal(<Consentimiento proveedor={proveedor} alResponder={resolver} />));
}

export async function verTokens(motivo?: string) {
  await asistenteEstado().asistenteBilletera(true);
  abrirModal(<Tokens motivo={motivo} alActivar={pintarTokensEditor} />);
}

export function redactar(inicial = '') {
  if (!esMiembro()) return pedirSesion(() => redactar(inicial), 'Redactar con IA es exclusivo para clientes de Portalfirma. Inicia sesión con tu cuenta.');
  abrirModal(<Redactar inicial={inicial} alRedactar={async (pedido) => {
    const s = await asistenteEstado().asistenteEstado(true);
    if (!s.hasKey) { toast('El asistente no está configurado. Abre «Asistente» → Ajustes.', 6000); return; }
    redactarBorrador(pedido);
  }} />);
}

export function instalarAsistente() {
  const S = asistenteEstado;
  window.__asistente = {
    consentimiento, tokens: verTokens, redactar,
    estado: (refrescar?: boolean) => S().asistenteEstado(!!refrescar),
    billetera: (refrescar?: boolean) => S().asistenteBilletera(!!refrescar),
    estadoActual: () => S().estado,
    billeteraActual: () => S().billetera,
    fijarEstado: (e: object) => S().asistenteFijarEstado(e as IAsistenteEstado),
    fijarBilletera: (b: object) => S().asistenteFijarBilletera(b as IBilletera),
  };
}
