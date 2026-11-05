// Modelos de negocios. Fuente de verdad: src/negocios.js (vista() y listar()).
// Si cambian allá, se actualizan aquí.

export type TMoneda = 'UF' | 'CLP' | 'USD';
export type TNegocioTipo = 'venta' | 'arriendo';
export type TNegocioEstado = 'abierto' | 'ganado' | 'perdido';

export interface IMonto {
  valor: number;
  moneda: TMoneda;
}

export interface IComision {
  tipo: '%' | 'monto';
  valor: number;
}

export interface IEtapa {
  id: string;
  t: string;
  d: string;
  tareas: string[];
  firma?: string;
  estado?: string;
  final?: boolean;
}

export interface INegocio {
  id: string;
  tipo: TNegocioTipo;
  estado: TNegocioEstado;
  etapa: string;
  titulo: string;
  valor: IMonto | null;
  comision: IComision | null;
  comisionMonto: number | null; // en la moneda de `valor`
  corredor?: string;
  corredorId?: string | null;
  cierre?: string; // ISO, solo ganados y perdidos
  motivoPerdida?: string | null;
  etapaInfo?: IEtapa;
  prop: { id: string; codigo: string; titulo: string; comuna?: string; foto?: string | null } | null;
  cliente: { id: string; nombre: string; rut?: string } | null;
  firmas?: Record<string, IFirmaEtapa>; // por id de etapa
  proximaAccion?: { texto: string; fecha: string | null } | null;
  siguiente?: string | null; // «¿qué sigue?» en la etapa actual (solo abiertos)
  vencida?: boolean; // la próxima acción ya pasó
  diasEnEtapa?: number;
  propId?: string | null;
  orden?: number; // posición de la etapa actual (desde 0)
  total?: number; // cuántas etapas tiene el tipo de negocio
  creado?: string;
  actualizado?: string;
}

// documento de una etapa enviado a firmar con Portalfirma
export interface IFirmaEtapa {
  estado?: 'firmado' | string;
  operacion?: string | number;
  firmados?: number;
  total?: number;
}

// respuesta de negMover y negFirmasRevisar
export interface INegocioMovido {
  negocio: INegocio;
  mensajes: string[];
}
export interface IFirmasRevisadas {
  negocios: INegocio[];
  mensajes: string[];
}

// respuesta de negListar
export interface INegocioLista {
  negocios: INegocio[];
  etapas: Record<TNegocioTipo, IEtapa[]>;
}
