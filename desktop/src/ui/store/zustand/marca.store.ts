// La marca de la cuenta en la interfaz: el logo de la corredora (reemplaza al de PortalFirma en la barra de arriba) y la foto de
// cada usuario (su avatar). El logo se edita en Configuración › Corredora (el mismo de los documentos); la foto, cada usuario la
// suya desde su menú. Los dos viven en el servidor (GET /v1/corredora/datos, /v1/perfil/foto y /v1/perfil/fotos).
import { create } from 'zustand';
import { api } from '../../utils/api';

const LOGO_PORTALFIRMA = 'assets/logo.png';

/** pone el logo de la corredora en la barra de arriba (o el de PortalFirma si no tiene) */
export function pintarLogoApp(logo: string | null) {
  const img = document.querySelector<HTMLImageElement>('.brand-logo');
  if (!img) return;
  img.src = logo || LOGO_PORTALFIRMA;
  img.alt = logo ? 'Logo de la corredora' : 'Portalfirma';
  img.classList.toggle('propio', !!logo);
}

interface IMarcaState {
  /** fotos de los usuarios de la corredora, por id de usuario */
  fotos: Record<string, string>;
  logo: string | null;
  marcaCargar: () => Promise<void>;
  marcaFoto: (usuarioId: string, foto: string | null) => Promise<void>;
  marcaLogo: (logo: string | null) => void;
}

export const useMarca = create<IMarcaState>((set) => ({
  fotos: {},
  logo: null,
  marcaCargar: async () => {
    const [fotos, datos] = await Promise.all([
      api<Record<string, string>>('perfilFotos').catch(() => ({} as Record<string, string>)),
      api<{ logo?: string }>('corredoraDatos').catch(() => ({} as { logo?: string })),
    ]);
    const logo = datos.logo || null;
    pintarLogoApp(logo);
    set({ fotos: fotos || {}, logo });
  },
  marcaFoto: async (usuarioId, foto) => {
    if (foto) await api('perfilFotoGuardar', foto); else await api('perfilFotoQuitar');
    set((s) => {
      const fotos = { ...s.fotos };
      if (foto) fotos[usuarioId] = foto; else delete fotos[usuarioId];
      return { fotos };
    });
  },
  marcaLogo: (logo) => { pintarLogoApp(logo); set({ logo }); },
}));
