// Nombres para mostrar (los mismos de src/renderer/inmo.js).
import type { TPropiedadEstado, TPropiedadTipo } from '../../../store/interfaces/propiedad.interface';
import type { TPersonaRol } from '../../../store/interfaces/persona.interface';
import type { TFiltroEspecial } from '../../../store/hooks/useCartera.hook';

export const TIPO: Record<TPropiedadTipo, string> = {
  casa: 'Casa', departamento: 'Departamento', oficina: 'Oficina', sitio: 'Sitio', local_comercial: 'Local comercial',
  industrial: 'Industrial', agricola: 'Agrícola', parcela: 'Parcela', estacionamiento: 'Estacionamiento',
  terreno_construccion: 'Terreno', bodega: 'Bodega',
};

// [texto, clase de color de .im-st en styles.css]
export const ESTADO: Record<TPropiedadEstado, [string, string]> = {
  disponible: ['Disponible', 'ok'], reservada: ['Reservada', 'res'], vendida: ['Vendida', 'end'],
  arrendada: ['Arrendada', 'end'], no_disponible: ['No disponible', 'off'],
};

export const ESPECIAL: Record<Exclude<TFiltroEspecial, ''>, string> = {
  enCaptacion: 'Captación incompleta', sinProp: 'Sin propietario', sinFotos: 'Sin fotos',
  reservadas: 'Reservadas', leads: 'Con interesados nuevos',
};

export const ROL: Record<TPersonaRol, string> = {
  propietario: 'Propietario', arrendatario: 'Arrendatario', comprador: 'Comprador',
  codeudor: 'Codeudor', interesado: 'Interesado', proveedor: 'Proveedor',
};
