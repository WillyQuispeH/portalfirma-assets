// Configuración › Metas (solo el administrador): la meta mensual de facturación (comisión ganada, en pesos, sin IVA) y
// de captación (propiedades nuevas) de cada corredor. La meta de la empresa es la suma. Las usa el Panel de Negocios.
// Se guardan en la configuración de la corredora (IPC metas:get / metas:set).
import { useEffect, useState, type FormEvent } from 'react';
import Card from '../../ui/Card';
import Boton from '../../ui/Boton';
import Input from '../../ui/Input';
import Avatar from '../../ui/Avatar';
import { api } from '../../../utils/api';
import { toast } from '../../../utils/app';
import { pesos } from '../negocios/panel/calculo';
import { usePerfil } from '../../../store/hooks/usePerfil.hook';

type TMetas = Record<string, { facturacion: number; captacion: number }>;

export default function Metas() {
  const { perfil, esAdmin, perfilGet } = usePerfil();
  const [metas, setMetas] = useState<TMetas | null>(null);
  const [vez, setVez] = useState(0);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { perfilGet(); api<TMetas>('metasGet').then(setMetas).catch(() => setMetas({})); }, [perfilGet]);

  if (!esAdmin) return <Card titulo="Metas"><p className="tw:m-0 tw:text-sm tw:text-muted">Las metas las define el administrador de la corredora.</p></Card>;
  const equipo = perfil?.corredores || [];
  const total = (k: 'facturacion' | 'captacion') => equipo.reduce((a, c) => a + (metas?.[c.id]?.[k] || 0), 0);

  const guardar = async (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault(); const d = new FormData(ev.currentTarget);
    const nuevas: TMetas = {};
    for (const c of equipo) nuevas[c.id] = { facturacion: Number(d.get(`f-${c.id}`)) || 0, captacion: Number(d.get(`c-${c.id}`)) || 0 };
    setGuardando(true);
    try { setMetas(await api<TMetas>('metasSet', nuevas)); setVez((v) => v + 1); toast('Metas guardadas.'); }
    catch (e) { toast((e as Error).message, 5000); }
    setGuardando(false);
  };

  return (
    <Card titulo="Metas mensuales" subtitulo="Por corredor. La meta de la empresa es la suma de las metas de cada uno. La facturación va en pesos, sin IVA.">
      {!metas ? <p className="tw:m-0 tw:text-sm tw:text-muted">Cargando…</p>
        : !equipo.length ? <p className="tw:m-0 tw:text-sm tw:text-muted">Todavía no hay corredores en el equipo. Agrégalos en la pestaña Usuarios.</p>
        : (
          <form key={vez} id="cfgMetas" onSubmit={guardar} className="tw:flex tw:flex-col tw:gap-4">
            {equipo.map((c) => (
              <div key={c.id} className="tw:flex tw:flex-wrap tw:items-end tw:gap-ui">
                <span className="tw:flex tw:min-w-[200px] tw:flex-[1_1_200px] tw:items-center tw:gap-2.5"><Avatar nombre={c.nombre} tamano="md" /><b className="tw:text-sm">{c.nombre}</b></span>
                <Input name={`f-${c.id}`} type="number" min={0} step={100000} etiqueta="Facturación al mes" sufijo="$" defaultValue={metas[c.id]?.facturacion || ''} clasesCampo="tw:w-48" />
                <Input name={`c-${c.id}`} type="number" min={0} step={1} etiqueta="Captaciones al mes" sufijo="props." defaultValue={metas[c.id]?.captacion || ''} clasesCampo="tw:w-40" />
              </div>
            ))}
            <div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-0 tw:border-t tw:border-solid tw:border-edge tw:pt-3">
              <span className="tw:text-[13px] tw:text-muted">Meta de la empresa: <b className="tw:text-text">{pesos(total('facturacion'))}</b> al mes · <b className="tw:text-text">{total('captacion')}</b> captaciones</span>
              <Boton id="cfgMetasGuardar" type="submit" cargando={guardando}>Guardar metas</Boton>
            </div>
          </form>
        )}
    </Card>
  );
}
