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
}
