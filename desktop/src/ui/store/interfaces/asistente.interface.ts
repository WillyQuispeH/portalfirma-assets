// Asistente legal con IA (src/ai.js): estado del proveedor (sin la clave) y la billetera de tokens.
export interface IAsistenteEstado {
  hasKey: boolean;
  consent?: boolean; // ya aceptó que el texto se envía al proveedor de IA
  managed?: boolean; // la clave la pone Portalfirma (el usuario no la configura)
  provider?: string;
  providers: Record<string, { label?: string; site?: string }>;
}

export interface IBilletera {
  balance: number;
  askLeft?: number; // preguntas ya pagadas
  askPerToken?: number;
  costs: Partial<Record<'review' | 'ask' | 'detect' | 'draft' | 'edit' | 'plazo', number>>;
  pack: { name?: string; tokens?: number; price?: number };
}
