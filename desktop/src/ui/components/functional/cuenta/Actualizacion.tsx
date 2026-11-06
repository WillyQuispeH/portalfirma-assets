// Aviso de versión nueva, junto al botón del usuario (arriba a la derecha). Lo alimenta src/actualizaciones.js por el
// canal 'act:estado':
//  · lista     → «Reiniciar para actualizar» (instala y vuelve a abrir la app);
//  · manual    → Mac sin firmar: «Descargar versión X» abre la página de la versión para instalarla a mano.
// BuscarActualizaciones (en el menú del usuario) pregunta en el momento y dice el resultado.
import { useEffect, useState } from 'react';
import Boton from '../../ui/Boton';
import { abrirUrl, toast } from '../../../utils/app';

interface IEstadoAct {
  fase: 'nada' | 'buscando' | 'descargando' | 'lista' | 'manual';
  version: string | null;
  avance: number;
  error: string | null;
  url: string | null;
  actual: string;
  activo: boolean;
}

type TPf = {
  actEstado: () => Promise<{ ok: boolean; data?: IEstadoAct }>;
  actBuscar: () => Promise<{ ok: boolean; data?: IEstadoAct }>;
  actInstalar: () => Promise<{ ok: boolean; data?: boolean }>;
  onActualizacion?: (cb: (st: IEstadoAct) => void) => void;
};
const pf = () => window.pf as unknown as TPf;

function useActualizacion() {
  const [st, setSt] = useState<IEstadoAct | null>(null);
  useEffect(() => {
    pf().actEstado?.().then((r) => r.ok && r.data && setSt(r.data)).catch(() => {});
    pf().onActualizacion?.((x) => setSt(x));
  }, []);
  return st;
}

export default function AvisoActualizacion() {
  const st = useActualizacion();
  if (st?.fase === 'lista') return (
    <Boton id="actInstalar" tamano="sm" icono="rotateR" title={`Versión ${st.version} descargada`}
      onClick={() => { toast('Reiniciando para actualizar…', 4000); pf().actInstalar(); }}>
      Reiniciar para actualizar
    </Boton>
  );
  if (st?.fase === 'manual' && st.url) return (
    <Boton id="actDescargar" tamano="sm" variante="secundario" icono="download" title="Instálala con el archivo .dmg"
      onClick={() => abrirUrl(st.url!)}>
      Descargar versión {st.version}
    </Boton>
  );
  return null;
}

/** «Buscar actualizaciones», para el menú del usuario */
export async function buscarActualizaciones() {
  const r = await pf().actBuscar?.().catch(() => null);
  const st = r?.ok ? r.data : null;
  if (!st?.activo) return toast('Las actualizaciones automáticas funcionan en la app instalada.', 4000);
  if (st.fase === 'lista') return toast(`La versión ${st.version} está lista: toca «Reiniciar para actualizar».`, 6000);
  if (st.fase === 'descargando') return toast(`Descargando la versión ${st.version}… (${st.avance}%)`, 5000);
  if (st.fase === 'manual') return toast(`Hay una versión nueva (${st.version}): descárgala con el botón de arriba.`, 6000);
  if (st.error) return toast('No se pudo revisar si hay versiones nuevas: ' + st.error, 6000);
  toast(`Tienes la última versión (${st.actual}).`, 4000);
}
