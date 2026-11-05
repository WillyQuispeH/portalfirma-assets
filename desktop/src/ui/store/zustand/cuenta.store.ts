// Estado de la cuenta de Portalfirma en la interfaz: el usuario de la conexión directa, el saldo, los tokens del
// asistente, la cuenta de Google Drive, el menú del usuario y los textos de la pantalla «Conecta tu cuenta».
// La sesión del conector sigue en `state.session` de app.js (la usan muchos módulos); aquí se guarda una copia
// cada vez que app.js llama a setAccount() → Usuario.refresh().
import { create } from 'zustand';
import { cuentaService } from '../services/cuenta.service';
import type { IDiagnostico, ISesionPf, IUsuarioPf } from '../interfaces/cuenta.interface';

export const MOTIVO_INICIAL = 'Para enviar a firmar, visar o legalizar, usar la Notaría virtual y ver tus operaciones.';
export const AVISO_INICIAL = 'Se abrirá tu navegador para ingresar con tu cuenta de Portalfirma.';

interface ICuentaState {
  usuario: IUsuarioPf | null;
  sesion: ISesionPf | null;
  saldo: number | null;
  tokens: number | null;
  drive: string | null; // correo de Google Drive, «Conectado» o «Sin conectar»
  menu: boolean;
  // pantalla «Conecta tu cuenta de Portalfirma» (#view-login)
  motivo: string;
  aviso: string;
  entrando: boolean;
  cuentaRefrescar: (sesion: ISesionPf | null) => Promise<void>;
  cuentaFijarUsuario: (u: IUsuarioPf | null) => void;
  cuentaFijarTokens: (n: number | null) => void;
  cuentaDrive: () => Promise<void>;
  cuentaMenu: (abierto: boolean) => void;
  cuentaMotivo: (motivo?: string) => void;
  cuentaAviso: (aviso?: string) => void;
  cuentaEntrarConNavegador: () => Promise<{ sesion?: ISesionPf; error?: string }>;
  cuentaEntrarConCorreo: (email: string, clave: string) => Promise<string | null>; // null si entró; si no, el error
  cuentaSalirApi: () => Promise<void>;
  cuentaSalir: () => Promise<void>;
  cuentaDiagnostico: () => Promise<{ data?: IDiagnostico; error?: string }>;
}

export const useCuentaStore = create<ICuentaState>((set) => ({
  usuario: null, sesion: null, saldo: null, tokens: null, drive: null, menu: false,
  motivo: MOTIVO_INICIAL, aviso: AVISO_INICIAL, entrando: false,
  cuentaRefrescar: async (sesion) => {
    const r = await cuentaService.usuario().catch(() => null);
    const usuario = r?.ok && r.data ? r.data : null;
    set({ usuario, sesion, ...(usuario ? {} : { saldo: sesion?.balance ?? null }) });
    // el saldo de la conexión directa tarda: no bloquea la barra
    if (usuario) cuentaService.billetera().then((w) => { if (w.ok && w.data) set({ saldo: w.data.amount }); }).catch(() => {});
  },
  cuentaFijarUsuario: (usuario) => set({ usuario }),
  cuentaFijarTokens: (tokens) => set({ tokens }),
  cuentaDrive: async () => {
    const r = await cuentaService.drive().catch(() => null);
    if (r?.ok && r.data) set({ drive: r.data.connected ? r.data.email || 'Conectado' : 'Sin conectar' });
  },
  cuentaMenu: (menu) => set({ menu }),
  cuentaMotivo: (motivo) => set({ motivo: motivo || MOTIVO_INICIAL }),
  cuentaAviso: (aviso) => set({ aviso: aviso || AVISO_INICIAL }),
  cuentaEntrarConNavegador: async () => {
    set({ entrando: true });
    try { return { sesion: await cuentaService.entrarConNavegador() }; }
    catch (e) { return { error: (e as Error).message }; }
    finally { set({ entrando: false }); }
  },
  cuentaEntrarConCorreo: async (email, clave) => {
    const r = await cuentaService.entrarConCorreo(email, clave);
    if (!r.ok) return r.error || 'No se pudo iniciar sesión.';
    if (r.data) set({ usuario: r.data });
    return null;
  },
  cuentaSalirApi: async () => { await cuentaService.salirApi(); set({ usuario: null }); },
  cuentaSalir: async () => { await cuentaService.salirApi(); await cuentaService.salir(); set({ usuario: null, sesion: null, menu: false }); },
  cuentaDiagnostico: async () => {
    const r = await cuentaService.diagnostico();
    return r.ok && r.data ? { data: r.data } : { error: r.error || 'No se pudo ejecutar el diagnóstico.' };
  },
}));
