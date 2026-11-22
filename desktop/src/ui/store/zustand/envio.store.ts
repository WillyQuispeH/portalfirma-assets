// Estado de «Enviar a firmar»: el archivo, lo que detectó la IA de Asset, los firmantes, dónde van sus firmas y el resultado.
// Las cuatro pantallas (soltar, analizando, revisar y enviado) leen este mismo estado.
import { create } from 'zustand';
import { envioService } from '../services/envio.service';
import { REQUERIDOS_BASE, firmanteVacio, firmantesIniciales, ordenarCampo } from '../../utils/envio';
import type { IAnalisis, IArchivoEnvio, IDetalleOperacion, IFirmante, IPosicionFirma, IRequeridos, IResultadoEnvio, TCampoFirmante } from '../interfaces/envio.interface';

interface IEnvioState {
  archivo: IArchivoEnvio | null;
  analisis: IAnalisis | null;
  ocupado: boolean;
  pasoAnalisis: number; // 0 leyendo el documento, 1 detectando firmantes, 2 listo
  firmantes: IFirmante[];
  requeridos: IRequeridos;
  tipoFirma: string;
  protocolizacion: string;
  posiciones: IPosicionFirma[] | null; // las firmas ubicadas en el PDF; null = página de firmas al final
  entrada: boolean; // acaba de terminar el análisis: la revisión entra con animación (el PDF pasa a la derecha y aparece la izquierda)
  paginaExtra: boolean; // agregar además una página de firmas extra (la agrega Portalfirma)
  error: string; // bajo el botón «Enviar a firmar»
  // pantalla «Enviado»
  ultimaOp: number | string | null;
  mensaje: string;
  detalle: IDetalleOperacion | null;
  errorDetalle: string;
  crudo: unknown; // la respuesta tal cual, cuando Portalfirma no devolvió número de operación
  envioAnalizar: (archivo: IArchivoEnvio, prellenar?: Partial<IFirmante>[] | null) => Promise<'ok' | string>;
  envioCampo: (i: number, k: TCampoFirmante, v: string) => void;
  envioSalirCampo: (i: number, k: TCampoFirmante) => void;
  envioAgregar: () => void;
  envioQuitar: (i: number) => void;
  envioReordenar: (de: number, a: number) => void;
  envioTocarTodos: () => void;
  envioDatos: (d: Partial<Pick<IEnvioState, 'tipoFirma' | 'protocolizacion' | 'posiciones' | 'paginaExtra' | 'entrada' | 'error'>>) => void;
  envioCancelar: () => void;
  envioListo: (r: IResultadoEnvio) => 'listo' | 'rechazado';
  envioDetalle: (op: number | string) => Promise<void>;
}

let reloj: ReturnType<typeof setTimeout> | undefined;

export const useEnvioStore = create<IEnvioState>((set, get) => ({
  archivo: null, analisis: null, ocupado: false, pasoAnalisis: 0,
  firmantes: [], requeridos: REQUERIDOS_BASE, tipoFirma: 'avanzada', protocolizacion: 'none', posiciones: null, paginaExtra: false, entrada: false, error: '',
  ultimaOp: null, mensaje: '', detalle: null, errorDetalle: '', crudo: null,

  envioAnalizar: async (archivo, prellenar = null) => {
    if (get().ocupado) return 'ocupado';
    set({ ocupado: true, archivo, analisis: null, pasoAnalisis: 0 });
    clearTimeout(reloj); reloj = setTimeout(() => set({ pasoAnalisis: 1 }), 1200);
    try {
      const r = await envioService.analizar(archivo.path);
      clearTimeout(reloj);
      const x = r.extract || {};
      set({
        analisis: r, archivo: r.file?.converted ? r.file : archivo, // se sube y se envía el PDF convertido
        pasoAnalisis: 2, requeridos: x.required_fields || REQUERIDOS_BASE,
        tipoFirma: x.type_sign || 'avanzada', protocolizacion: x.notarial_procedure || 'none',
        firmantes: firmantesIniciales(r, prellenar), posiciones: null, paginaExtra: false, entrada: true, error: '',
      });
      return 'ok';
    } catch (e) {
      clearTimeout(reloj);
      return (e as Error).message;
    } finally { set({ ocupado: false }); }
  },
  envioCampo: (i, k, v) => set((s) => ({ firmantes: s.firmantes.map((f, j) => (j === i ? { ...f, [k]: v } : f)) })),
  envioSalirCampo: (i, k) => set((s) => ({ firmantes: s.firmantes.map((f, j) => (j === i ? ordenarCampo(f, k) : f)) })),
  envioAgregar: () => set((s) => ({ firmantes: [...s.firmantes, firmanteVacio()] })),
  envioQuitar: (i) => set((s) => ({ firmantes: s.firmantes.length > 1 ? s.firmantes.filter((_, j) => j !== i) : s.firmantes })),
  // quien firma primero se ordena arrastrando: el firmante `de` pasa a la posición `a`
  envioReordenar: (de, a) => set((s) => {
    if (de === a || de < 0 || a < 0 || de >= s.firmantes.length || a >= s.firmantes.length) return {};
    const l = [...s.firmantes]; const [f] = l.splice(de, 1); l.splice(a, 0, f); return { firmantes: l };
  }),
  envioTocarTodos: () => set((s) => ({ firmantes: s.firmantes.map((f) => ({ ...f, tocado: true })) })),
  envioDatos: (d) => set(d),
  envioCancelar: () => set({ analisis: null }),
  envioListo: (r) => {
    if (r.operation == null && /error|fall[oó]|failed|status code/i.test(r.raw?.message || '')) { // no mostrar éxito si falló
      set({ error: 'Portalfirma rechazó el envío: ' + r.raw!.message });
      return 'rechazado';
    }
    set({ ultimaOp: r.operation ?? null, mensaje: r.raw?.message || '', analisis: null, detalle: null, errorDetalle: '', crudo: r.operation == null ? r.raw ?? null : null });
    return 'listo';
  },
  envioDetalle: async (op) => {
    try { set({ detalle: await envioService.detalle(op), errorDetalle: '' }); } catch (e) { set({ errorDetalle: (e as Error).message }); }
  },
}));
