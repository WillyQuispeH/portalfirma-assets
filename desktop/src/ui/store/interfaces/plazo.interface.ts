// Plazos y vencimientos: los contratos que el usuario agrega, con su informe básico (reglas, gratis) y su
// informe inteligente (IA). Fuente de verdad: src/plazos.js (plazos:*) y el JSON que pide PEDIDO (calculo.ts).
export interface IParte { rol?: string; nombre?: string; rut?: string; domicilio?: string; representante?: string | null }
export interface IContratoPlazo {
  titulo?: string;
  tipo?: string;
  partes?: IParte[];
  objeto?: string;
  monto?: string | null;
  fecha_inicio?: string | null;
  plazo?: string;
  indefinido?: boolean;
  fecha_termino?: string | null;
  renovacion_automatica?: boolean;
  periodo_renovacion_meses?: number | null;
  aviso_dias?: number | null;
  reajuste?: { tipo?: string; periodicidad_meses?: number; proxima_fecha?: string } | null;
  encontrado?: boolean; // la lectura automática encontró algo
}
export interface IAccionSugerida { contrato?: number; tipo: string; titulo: string; motivo?: string; urgente?: boolean }
export interface IAnalisisPlazo extends IContratoPlazo {
  tipo?: string;
  resumen?: string;
  contratos?: IContratoPlazo[];
  acciones?: IAccionSugerida[];
  fuente?: string;
}
export interface IDocPlazo {
  id: string;
  name: string;
  status: 'pending' | 'reading' | 'done' | 'error';
  basic?: IAnalisisPlazo | null; // informe básico (reglas)
  analysis?: IAnalisisPlazo | null; // informe inteligente (IA)
  deadline?: string | null;
  deadlineLabel?: string;
  end?: string | null;
  error?: string;
  done?: string; // «Redactado: …» o «Revisado: se deja así»
  op?: number | string; // traído de una operación de Portalfirma
}
export interface IAgregadosPlazos { items: IDocPlazo[]; added?: number; skipped?: string[] }
