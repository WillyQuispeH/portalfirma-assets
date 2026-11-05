// Llamadas al proceso principal del editor PDF, las plantillas con campos y el Asistente legal (editor:*, tpl:*, ai:*).
// Sin manejo de errores: devuelven la respuesta tal cual ({ ok, data, error, code }); el que llama decide.
import { apiCruda } from '../../utils/api';
import type { IArchivoAbierto, IPlantillaLista } from '../interfaces/editor.interface';

export const editorService = {
  // archivos
  elegir: (varios: boolean) => apiCruda<string[]>('edPick', varios),
  abrir: (ruta: string) => apiCruda<IArchivoAbierto>('edOpen', ruta),
  guardarEn: (ruta: string, bytes: Uint8Array) => apiCruda<string>('edSaveTo', ruta, bytes),
  guardarComo: (bytes: Uint8Array, nombre: string) => apiCruda<string | null>('edSaveAs', bytes, nombre),
  elegirCarpeta: () => apiCruda<string | null>('edChooseDir'),
  escribirArchivo: (dir: string, nombre: string, bytes: Uint8Array) => apiCruda<string>('edWriteFile', dir, nombre, bytes),
  guardarTexto: (texto: string, nombre: string) => apiCruda<string | null>('edSaveText', texto, nombre),
  exportarWord: (paginas: object[], familias: Record<string, string>, nombre: string) => apiCruda<string | null>('edExportDocx', paginas, familias, nombre),
  temporal: (bytes: Uint8Array, nombre: string) => apiCruda<{ name: string; path: string }>('edTemp', bytes, nombre),
  imprimir: (paginas: object[], nombre: string) => apiCruda<{ pages: number; html: string; sizes?: string }>('print', paginas, nombre),
  // estado del documento para el proceso principal (cerrar con cambios sin guardar, título de la ventana)
  estado: (st: object) => { window.pf.edState?.(st); },
  reciente: (ruta: string) => { window.pf.recentAdd?.(ruta); },
  abrirEnlace: (url: string) => apiCruda<boolean>('openLink', url),
  pantallaCompleta: (on?: boolean) => apiCruda<boolean>('setFullScreen', on),
  // plantillas con campos
  plantillas: () => apiCruda<IPlantillaLista[]>('tplList'),
  plantillaLeer: (archivo: string) => apiCruda<Uint8Array>('tplRead', archivo),
  plantillaGuardar: (nombre: string, bytes: Uint8Array, meta: object) => apiCruda<string>('tplSave', nombre, bytes, meta),
  plantillaExiste: (nombre: string) => apiCruda<boolean>('tplExists', nombre),
  plantillaBorrar: (archivo: string) => apiCruda<boolean>('tplDelete', archivo),
  descargarDeDrive: (id: string) => apiCruda<string>('driveDownload', id),
  // Asistente legal
  iaPreguntar: (req: object) => apiCruda<{ text: string; model?: string; usage?: unknown; tokens?: object }>('aiChat', req),
  iaModelos: () => apiCruda<string[]>('aiModels'),
  iaConfigurar: (c: object) => apiCruda<object>('aiConfig', c),
  iaBorradorPdf: (html: string, nombre: string) => apiCruda<{ bytes: Uint8Array }>('aiDraftPdf', html, nombre),
  modelos: () => apiCruda<object[]>('flujosModels'),
  modelo: (id: string) => apiCruda<object>('flujosModel', id),
};
