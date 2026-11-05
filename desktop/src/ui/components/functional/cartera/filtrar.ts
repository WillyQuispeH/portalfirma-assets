// Filtros de la Cartera (las mismas reglas que filtrar() de src/renderer/inmo.js).
import type { IPropiedad, TCaptaciones } from '../../../store/interfaces/propiedad.interface';
import type { IPersona } from '../../../store/interfaces/persona.interface';
import type { IFiltrosCartera } from '../../../store/hooks/useCartera.hook';

export function filtrarPropiedades(propiedades: IPropiedad[], personas: IPersona[], captaciones: TCaptaciones, f: IFiltrosCartera): IPropiedad[] {
  const q = f.q.trim().toLowerCase();
  const porId = new Map(personas.map((c) => [c.id, c]));
  return propiedades.filter((p) => {
    if (!!p.archivada !== f.archivadas) return false;
    if (f.op === 'venta' && !p.venta) return false;
    if (f.op === 'arriendo' && !p.arriendo) return false;
    if (f.tipo && p.tipo !== f.tipo) return false;
    if (f.comuna && p.comuna !== f.comuna) return false;
    if (f.estado && !((p.venta && p.estadoVenta === f.estado) || (p.arriendo && p.estadoArriendo === f.estado))) return false;
    if (f.captador && (f.captador === '_sin' ? !!p.captadorId : p.captadorId !== f.captador)) return false;
    if (f.especial === 'sinProp' && (p.vinculos || []).some((v) => v.rol === 'propietario')) return false;
    if (f.especial === 'sinFotos' && p.fotos?.length) return false;
    if (f.especial === 'leads' && !(p.leads || []).some((l) => !l.visto)) return false;
    if (f.especial === 'reservadas' && p.estadoVenta !== 'reservada' && p.estadoArriendo !== 'reservada') return false;
    if (f.especial === 'enCaptacion' && captaciones[p.id]?.completa !== false) return false;
    if (q) {
      const duenos = (p.vinculos || []).map((v) => porId.get(v.personaId)).filter(Boolean).map((c) => `${c!.nombre} ${c!.rut}`).join(' ');
      if (![p.codigo, p.titulo, p.direccion, p.comuna, p.rol, duenos].join(' ').toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

// 'Av. Siempre Viva 123, depto. 45 · Ñuñoa'
export function direccion(p: IPropiedad): string {
  const calle = (p.direccion || '') + (p.direccion && p.unidad ? ', depto. ' + p.unidad : '');
  return [calle, p.comuna].filter((x) => x && x.trim()).join(' · ');
}
