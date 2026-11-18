// Lo que devuelve la API de plantillas de documentos (api/src/documentos/plantillas-doc.ts).
export type TEstadoPlantilla = 'aprobada' | 'borrador' | 'revisar';

export interface IAprobacionPlantilla { revisor: string; nota: string; porNombre: string; en: string; n: number }

export interface IPlantillaItem {
  nombre: string; titulo: string; descripcion: string; estado: TEstadoPlantilla; version: number; propia: boolean;
  cambiadas: number; editables: number; aprobacion: IAprobacionPlantilla | null; actualizada: string | null;
}
export interface IListaPlantillas { puedeEditar: boolean; items: IPlantillaItem[] }

export interface IBloquePlantilla { clave: string; titulo: string; tipo: string; editable: boolean; base: string | null; texto: string | null; cambiado: boolean }
export interface IVersionPlantilla { n: number; nota: string; porNombre: string; en: string; cambiadas: number }

export interface IDetallePlantilla {
  nombre?: string; titulo: string; descripcion: string; puedeEditar: boolean; estado: TEstadoPlantilla; version: number;
  aprobacion: IAprobacionPlantilla | null; variables: string[]; bloques: IBloquePlantilla[]; versiones: IVersionPlantilla[];
}
