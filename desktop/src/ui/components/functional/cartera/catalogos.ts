// Nombres para mostrar (los mismos de src/renderer/inmo.js).
import type { TPropiedadEstado, TPropiedadTipo } from '../../../store/interfaces/propiedad.interface';
import type { TPersonaRol } from '../../../store/interfaces/persona.interface';
import type { TFiltroEspecial } from '../../../store/hooks/useCartera.hook';
import type { TTono } from '../../ui/tonos';

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
// la clase de ESTADO → tono del kit (Badge)
export const TONO_ESTADO: Record<string, TTono> = { ok: 'verde', res: 'amarillo', end: 'lavanda', off: 'gris' };

export const ESPECIAL: Record<Exclude<TFiltroEspecial, ''>, string> = {
  enCaptacion: 'Captación incompleta', sinProp: 'Sin propietario', sinFotos: 'Sin fotos',
  reservadas: 'Reservadas', leads: 'Con interesados nuevos',
};

export const ROL: Record<TPersonaRol, string> = {
  propietario: 'Propietario', arrendatario: 'Arrendatario', comprador: 'Comprador',
  codeudor: 'Codeudor', interesado: 'Interesado', proveedor: 'Proveedor',
};

// qué significa cada rol y su ícono (para elegirlos con SeleccionTarjetas)
export const ROL_DETALLE: Record<TPersonaRol, { descripcion: string; icono: string }> = {
  propietario: { descripcion: 'Dueño de una propiedad de la cartera', icono: 'key' },
  arrendatario: { descripcion: 'Arrienda una propiedad', icono: 'house' },
  comprador: { descripcion: 'Compra o está comprando', icono: 'coins' },
  codeudor: { descripcion: 'Respalda un arriendo o una compra', icono: 'sign' },
  interesado: { descripcion: 'Consulta o busca propiedad', icono: 'search' },
  proveedor: { descripcion: 'Presta servicios a la corredora', icono: 'briefcase' },
};
