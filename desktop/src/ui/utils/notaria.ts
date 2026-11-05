// Reglas de la Notaría virtual (sin pantalla): categorías, etiquetas legibles, validación de cada dato y los
// valores tal como los espera Portalfirma (fecha dd-mm-aaaa, RUT con puntos, teléfono con +56).
import { correoValido, formatearRut, normalizarTelefono, rutValido, telefonoValido } from './rut';
import type { IFormulario, IVariable } from '../store/interfaces/notaria.interface';

// Las mismas categorías de empresa.portalfirma.cl
export const CATEGORIAS = [
  'Poderes Notariales', 'Trámites Municipales', 'Empresas y Sociedades', 'Declaraciones juradas', 'Salvoconducto',
  'Vehículos', 'Autorización Notarial', 'Contratos y Acuerdos', 'Contratos de Arriendo', 'Documentos de cobro',
  'Certificados', 'Autorización de Menor', 'Cartas de Invitación', 'Finiquitos',
  'Contratos de Servicio Doméstico y Personal', 'Documentos TAG', 'Minería', 'Postulaciones',
];
export const ESTADO_CIVIL = ['Soltero(a)', 'Casado(a)', 'Divorciado(a)', 'Viudo(a)', 'Conviviente civil', 'Separado(a) judicialmente'];
const TILDES: Record<string, string> = { vehiculo: 'vehículo', direccion: 'dirección', telefono: 'teléfono', dias: 'días', numero: 'número', garantia: 'garantía', duracion: 'duración', razon: 'razón', informacion: 'información', descripcion: 'descripción', credito: 'crédito' };

// «estado-civil_MANDANTE» → «Estado civil mandante»
export function bonito(txt?: string) {
  let t = String(txt || '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (t === t.toUpperCase()) t = t.toLowerCase();
  t = t.replace(/\b([a-záéíóúñ]+)\b/gi, (w) => TILDES[w.toLowerCase()] || w);
  return t.charAt(0).toUpperCase() + t.slice(1);
}
export const hoyISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' });
const isoACL = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('-') : iso);

export const variables = (f: IFormulario | null) => (f?.groups || []).flatMap((g) => g.variables || []);
export const esTextoLargo = (v: IVariable) => /texto|detalle|descrip|objeto|inventario|clausula|cláusula|facultad|acuerdo|libre/i.test(v.id);

export function errorCampo(v: IVariable, valor?: string) {
  const val = (valor ?? '').trim();
  if (!val) return v.required ? 'Obligatorio' : '';
  if (v.input_type === 'rut' && !rutValido(val)) return 'RUT inválido';
  if (v.input_type === 'email' && !correoValido(val)) return 'Correo inválido';
  if (v.input_type === 'phone' && !telefonoValido(val)) return 'Teléfono inválido';
  return '';
}
// Al salir de un campo: el RUT con puntos y guión, el teléfono con su código
export function ordenarValor(v: IVariable | undefined, valor: string) {
  if (v?.input_type === 'rut' && rutValido(valor)) return formatearRut(valor);
  if (v?.input_type === 'phone') return normalizarTelefono(valor) || valor;
  return valor;
}
// Fechas del formulario: hoy por defecto
export function valoresIniciales(f: IFormulario) {
  const out: Record<string, string> = {};
  for (const v of variables(f)) if (v.input_type === 'date') out[v.id] = hoyISO();
  return out;
}
export function valoresParaEnviar(f: IFormulario, valores: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const v of variables(f)) {
    let val = (valores[v.id] ?? '').trim(); if (!val) continue;
    if (v.input_type === 'date') val = isoACL(val);
    if (v.input_type === 'rut') val = formatearRut(val);
    if (v.input_type === 'phone') val = normalizarTelefono(val);
    out[v.id] = val;
  }
  return out;
}
// «Mandante: Juan Pérez — 11.111.111-1 — juan@correo.cl», una línea por firmante (para la confirmación)
export function lineasFirmantes(f: IFormulario, valores: Record<string, string>) {
  return (f.groups || []).filter((g) => g.type === 'signer').map((g) => {
    const dato = (k: string) => valores[(g.variables || []).find((v) => v.name === k || v.input_type === k || v.id.startsWith(k + '_'))?.id || ''] || '';
    return `${bonito(g.group)}: ${dato('nombre')} — ${dato('rut')} — ${dato('email')}`;
  });
}
