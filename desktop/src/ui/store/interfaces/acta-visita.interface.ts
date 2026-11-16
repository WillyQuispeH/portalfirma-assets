// El acta de una visita (servidor: api/src/whatsapp/acta-visita.ts).
export interface IActaAudio { n: number; nombre: string; origen: 'app' | 'archivo' | 'whatsapp'; recibido: string; bytes: number; transcripcion: string; error: string }
export interface IActaFoto { n: number; nombre: string; origen: 'app' | 'whatsapp'; recibido: string }
export interface IActaResumen {
  hechoEn: string; resumen: string; interesado: string[]; corredor: string[];
  interes: 'alto' | 'medio' | 'bajo' | 'sin_datos'; objeciones: string[]; acuerdos: string[]; proximosPasos: string[];
}
export interface IActaVisita {
  id: string; negocioId: string; propiedadId: string | null; fecha: string; estado: 'abierta' | 'cerrada';
  creadaEn: string; creadaPor: string; notas: string; audios: IActaAudio[]; fotos: IActaFoto[];
  resumen: IActaResumen | null; cerradaEn: string | null;
  /** el acta enviada a firmar al visitante (con el estado de la firma) */
  firma?: { operacion: number; enviadaEn: string; ordenNumero: number | null; nombre: string; estado?: string; firmadoEn?: string | null };
}
/** la vista previa del acta para firmar: el PDF y lo que lleva (si faltan datos, viene el error y no el PDF) */
export interface IActaFirmaVista {
  ok?: boolean; error?: string; pdf?: string; archivo?: string; orden: string;
  visitante: { id: string; nombre: string; rut: string; email: string; telefono: string };
  interes: 'alto' | 'medio' | 'bajo' | 'sin_datos'; observaciones: string;
  propiedad: { codigo: string; titulo: string; direccion: string };
}
