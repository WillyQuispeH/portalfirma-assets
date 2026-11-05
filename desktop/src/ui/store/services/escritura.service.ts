// Llamadas al proceso principal de Firmas presenciales (src/main.js: escr:*, not:*, reglas:*).
// Devuelven la respuesta tal cual ({ ok, data, error, code }) porque el pago distingue el código del error
// (saldo insuficiente, sesión vencida, servicio aún no disponible). Sin manejo de errores: eso lo hace el store.
import { apiCruda } from '../../utils/api';
import type { IArchivoNotarial, INotariaRed, ITramiteEnviado } from '../interfaces/escritura.interface';

export const escrituraService = {
  tarifas: () => apiCruda<object>('notTarifas'),
  reglas: () => apiCruda<object>('reglasGet'),
  preferencias: () => apiCruda<{ mock?: boolean }>('prefs'),
  red: () => apiCruda<INotariaRed[]>('notRed'),
  listar: () => apiCruda<ITramiteEnviado[]>('notList'),
  saldo: () => apiCruda<number | null>('notSaldo'),
  // elegir archivos con el diálogo del sistema, o leer los que se soltaron
  elegirMinuta: () => apiCruda<IArchivoNotarial[]>('escrOpen', 'esc'),
  elegirPrivados: () => apiCruda<IArchivoNotarial[]>('escrOpenPriv'),
  leerMinutas: (rutas: string[]) => apiCruda<IArchivoNotarial[]>('escrRead', rutas),
  leerPrivados: (rutas: string[]) => apiCruda<IArchivoNotarial[]>('escrReadPriv', rutas),
  leerConIA: (o: { imagenes: { mime: string; data: string }[]; desde: number; total: number }) => apiCruda<Record<string, unknown>>('aiLeerDoc', o),
  word: (tipo: 'escritura' | 'caratula', datos: unknown, notaria: unknown) => apiCruda<Uint8Array>('escrDocxBytes', tipo, datos, notaria),
  guardarWord: (tipo: 'escritura' | 'caratula', datos: unknown, notaria: unknown, nombre: string) => apiCruda<string | null>('escrSaveDocx', tipo, datos, notaria, nombre),
  iniciar: (ficha: object, archivos: { kind: string; name: string; bytes: Uint8Array }[]) => apiCruda<ITramiteEnviado>('notIniciar', ficha, archivos),
  archivo: (op: string, nombre: string) => apiCruda<Uint8Array | null>('notArchivo', op, nombre),
  caso: (c: object) => apiCruda('reglasCaso', c),
  recargar: (monto: number) => apiCruda('topUp', monto, ''),
  temporal: (bytes: Uint8Array, nombre: string) => apiCruda<{ path: string }>('edTemp', bytes, nombre),
};
