// «Hoy»: lo que toca, lo que necesita atención y lo que espera a otros, de negocios y captaciones.
// Fuente de verdad: resumenHoy() en src/etapas.js. Si cambia allá, se actualiza aquí.

// avance de cada etapa (Captación · Comercialización · Postventa) para las barras
export interface IHoySegmento {
  ok: number;
  total: number;
  pct: number;
  completa: boolean;
  fail: boolean;
  actual: boolean;
}

interface IHoyBase {
  negocioId: string | null;
  propId: string | null;
  codigo: string;
  titulo: string;
  cliente: string;
  op: string; // 'Venta', 'Arriendo' o 'Captación · …'
  captacion?: boolean;
  etapa: string;
  segs: IHoySegmento[];
}

// un paso pendiente: se le pasa tal cual a Etapas.accion() de src/renderer/etapas.js
export interface IHoyItem extends IHoyBase {
  paso: string;
  pasoId: string;
  d?: string;
  vence?: string | null; // AAAA-MM-DD
  quien?: string; // a quién se espera
  accion: string; // texto del botón
  tipo: string;
  clase: 'atencion' | 'tetoca' | 'esperando';
  hoy: boolean; // vence hoy
}

export interface IHoyNegocio extends IHoyBase {
  estado: 'atencion' | 'tetoca' | 'esperando' | 'cerrado';
}

// respuesta de etHoy
export interface IHoy {
  atencion: IHoyItem[];
  tetoca: IHoyItem[];
  esperando: IHoyItem[];
  negocios: IHoyNegocio[];
  kpis: { logrados: number; pendientes: number; noLogrados: number };
  hoy: string;
}
