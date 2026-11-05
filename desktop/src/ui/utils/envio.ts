// Reglas de «Enviar a firmar»: nombres de la firma y del trámite, validación de cada firmante y el pedido a Portalfirma.
import { correoValido, formatearRut, normalizarTelefono, rutValido, telefonoValido } from './rut';
import type { IAnalisis, IFirmante, IPayloadEnvio, IRequeridos, TCampoFirmante } from '../store/interfaces/envio.interface';

export const TIPOS_FIRMA: Record<string, string> = { avanzada: 'Firma electrónica avanzada (FEA)', simple: 'Firma electrónica simple (FES)', visada: 'Visada por Portalfirma', enrolada: 'FEA enrolada' };
export const TRAMITES_NOTARIALES: Record<string, string> = { none: 'Ninguno', legalization: 'Legalización', protocolization: 'Protocolización' };

export const REQUERIDOS_BASE: IRequeridos = { rut: true, alias: true, name: true, email: false, phone: false };

export const firmanteVacio = (): IFirmante => ({ fullName: '', rut: '', email: '', phone: '', alias: '', typeSign: '' });

// el tipo de documento de Portalfirma fija la firma y el trámite notarial
export const configBloqueada = (a: IAnalisis | null) => !!a?.extract?.document_config_id;

export const requerido = (req: IRequeridos, k: TCampoFirmante) => !!req[k === 'fullName' ? 'name' : (k as keyof IRequeridos)];

export function erroresFirmante(s: IFirmante, req: IRequeridos) {
  const e: Partial<Record<TCampoFirmante, string>> = {};
  if (!rutValido(s.rut)) e.rut = 'RUT inválido';
  if (!s.alias.trim()) e.alias = 'Indica el rol';
  else if (/^firmante\s*\d*$/i.test(s.alias.trim())) e.alias = 'Usa el rol real (ej. arrendador)';
  if (req.name && !s.fullName.trim()) e.fullName = 'Obligatorio';
  if ((req.email || s.email) && !correoValido(s.email)) e.email = req.email && !s.email ? 'Obligatorio' : 'Correo inválido';
  if ((req.phone || s.phone) && !telefonoValido(s.phone)) e.phone = req.phone && !s.phone ? 'Obligatorio' : 'Teléfono inválido';
  return e;
}

// Los firmantes que detectó Portalfirma, completados con los que vienen de una plantilla llenada en el editor
export function firmantesIniciales(a: IAnalisis, pre: Partial<IFirmante>[] | null): IFirmante[] {
  const lista: IFirmante[] = (a.extract?.firmantes || []).map((s) => ({ ...firmanteVacio(), fullName: s.fullName || '', rut: s.rut || '', email: s.email || '', phone: s.phone || '', alias: s.alias || '' }));
  (pre || []).forEach((p, i) => {
    let s = lista.find((x) => x.alias && p.alias && x.alias.toLowerCase() === p.alias.toLowerCase()) || lista.find((x, k) => k >= i && !x.rut && !x.prellenado);
    if (!s) { s = firmanteVacio(); lista.push(s); }
    for (const k of ['fullName', 'rut', 'email', 'phone', 'alias'] as const) if (p[k] && !s[k]) s[k] = p[k] as string;
    s.prellenado = true;
  });
  if (!lista.length) lista.push(firmanteVacio());
  return lista;
}

// Al salir de un campo: el RUT con puntos y guion, el teléfono con su código
export function ordenarCampo(s: IFirmante, k: TCampoFirmante): IFirmante {
  const n = { ...s, tocado: true };
  if (k === 'rut' && rutValido(n.rut)) n.rut = formatearRut(n.rut);
  if (k === 'phone') n.phone = normalizarTelefono(n.phone) || n.phone;
  return n;
}

export function construirPayload(a: IAnalisis, firmantes: IFirmante[], o: { tipoFirma: string; protocolizacion: string; pagador: string; descuento: string }): IPayloadEnvio {
  const bloqueada = configBloqueada(a);
  const p: IPayloadEnvio = {
    document_id: a.ingest.document_id,
    email: o.pagador.trim(),
    signatories: firmantes.map((s) => {
      const x: IPayloadEnvio['signatories'][number] = { rut: formatearRut(s.rut), alias: s.alias.trim(), fullName: s.fullName.trim(), email: s.email.trim(), phone: normalizarTelefono(s.phone) };
      if (!bloqueada) x.typeSign = s.typeSign || o.tipoFirma;
      return x;
    }),
  };
  if (bloqueada) p.document_config_id = a.extract!.document_config_id;
  else p.protocolization = o.protocolizacion;
  const code = o.descuento.trim(); if (code) p.code = code;
  return p;
}

// Texto de la confirmación: la firma y el trámite que se usarán
export function resumenEnvio(a: IAnalisis, p: IPayloadEnvio) {
  const x = a.extract || {};
  const firma = p.document_config_id ? (TIPOS_FIRMA[x.type_sign || ''] || 'según tipo de documento') : [...new Set(p.signatories.map((s) => TIPOS_FIRMA[s.typeSign || '']))].join(', ');
  const tramite = p.document_config_id ? (TRAMITES_NOTARIALES[x.notarial_procedure || ''] || 'según tipo de documento') : TRAMITES_NOTARIALES[p.protocolization || 'none'];
  return { firma, tramite };
}

export const ESTADOS_OPERACION: Record<string, [string, string]> = { finalized: ['Finalizado', 'ok'], in_progress: ['En firma', 'wait'], pending: ['Pendiente', 'wait'] };
