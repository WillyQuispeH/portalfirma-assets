// Lo que devuelve la API de tipos de documento (api/src/documentos/tipos-documento.ts): GET /v1/tipos-documento.
import type { IFirmaPlantilla } from '../plantillas/tipos';

export interface ITipoDocumento {
  id: string;
  nombre: string;
  tipoFirma: IFirmaPlantilla['tipoFirma'];
  tramite: IFirmaPlantilla['tramite'];
  /** otras formas de nombrarlo, para reconocerlo en un documento */
  palabras: string[];
  /** la plantilla de Asset de la que viene la firma (null = la firma es de este tipo) */
  plantilla: string | null;
}

export interface IListaTipos { puedeEditar: boolean; items: ITipoDocumento[] }

/** lo que se escribe al crear o editar un tipo */
export interface IDatosTipo { nombre: string; tipoFirma: ITipoDocumento['tipoFirma']; tramite: ITipoDocumento['tramite']; palabras: string[] }
