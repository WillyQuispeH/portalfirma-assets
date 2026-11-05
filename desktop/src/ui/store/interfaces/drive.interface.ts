// Google Drive (src/gdrive.js): estado de la conexión y archivos.
export interface IDriveEstado {
  configured: boolean; // la app trae la credencial de Google
  connected?: boolean;
  reconnect?: boolean; // conectado con el permiso antiguo: hay que volver a conectar
  picker?: boolean; // se usa el selector oficial de Google (permiso solo sobre lo elegido)
  email?: string;
}

export interface IDriveArchivo {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  owner?: string;
  isFolder?: boolean; // en lo que devuelve el selector de Google
}

export interface IDriveLista { files: IDriveArchivo[]; next: string }

// para qué se abrió: enviar a firmar, convertir en plantilla, agregar a un expediente o a Plazos, o solo la cuenta
export type TDrivePara = 'sign' | 'template' | 'exp' | 'plazos' | 'connect';
export type TDriveAccion = 'sign' | 'template' | 'exp' | 'plazos' | 'open';
