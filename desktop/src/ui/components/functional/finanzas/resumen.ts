// Cálculo de Finanzas a partir de los negocios: totales por moneda, por corredor y detalle.
import type { INegocio, TMoneda, TNegocioTipo } from '../../../store/interfaces/negocio.interface';
import type { IPerfil } from '../../../store/interfaces/perfil.interface';
import type { TPorMoneda } from '../../../utils/formato';

export type TFiltroTipo = 'todos' | TNegocioTipo;
export type TPeriodo = 'mes' | 'anio' | 'todo';

export interface IFilaCorredor {
  nombre: string;
  negocios: number;
  ganada: TPorMoneda;
  curso: TPorMoneda;
}

export interface IResumenFinanzas {
  abiertos: INegocio[];
  ganados: INegocio[];
  perdidos: INegocio[];
  visibles: INegocio[];
  sinComision: number;
  porCorredor: IFilaCorredor[];
}

export const moneda = (n: INegocio): TMoneda => n.valor?.moneda || 'UF';

export function sumar(lista: INegocio[]): TPorMoneda {
  const r: TPorMoneda = {};
  for (const n of lista) if (n.comisionMonto) r[moneda(n)] = (r[moneda(n)] || 0) + n.comisionMonto;
  return r;
}

export function enPeriodo(iso: string | undefined, periodo: TPeriodo, hoy = new Date().toISOString()): boolean {
  if (periodo === 'todo') return true;
  const largo = periodo === 'mes' ? 7 : 4;
  return !!iso && iso.slice(0, largo) === hoy.slice(0, largo);
}

export function nombreCorredor(n: INegocio, perfil: IPerfil | null): string {
  return perfil?.corredores.find((c) => c.id === n.corredorId)?.nombre || n.corredor || 'Sin asignar';
}

export function resumir(negocios: INegocio[], tipo: TFiltroTipo, periodo: TPeriodo, perfil: IPerfil | null): IResumenFinanzas {
  const todos = negocios.filter((n) => tipo === 'todos' || n.tipo === tipo);
  const abiertos = todos.filter((n) => n.estado === 'abierto');
  const ganados = todos.filter((n) => n.estado === 'ganado' && enPeriodo(n.cierre, periodo));
  const perdidos = todos.filter((n) => n.estado === 'perdido' && enPeriodo(n.cierre, periodo));

  const filas: Record<string, IFilaCorredor> = {};
  for (const n of [...ganados, ...abiertos]) {
    const nombre = nombreCorredor(n, perfil);
    const f = (filas[nombre] ||= { nombre, negocios: 0, ganada: {}, curso: {} });
    f.negocios++;
    if (n.comisionMonto) {
      const d = n.estado === 'ganado' ? f.ganada : f.curso;
      d[moneda(n)] = (d[moneda(n)] || 0) + n.comisionMonto;
    }
  }

  return {
    abiertos, ganados, perdidos,
    visibles: [...ganados, ...abiertos, ...perdidos],
    sinComision: [...abiertos, ...ganados].filter((n) => n.comisionMonto == null).length,
    porCorredor: Object.values(filas).sort((a, b) => a.nombre.localeCompare(b.nombre)),
  };
}
