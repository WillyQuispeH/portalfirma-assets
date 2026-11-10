// Paso 2 · Portales: dónde se publica. Es también la pantalla de «Más portales» (desde un aviso, con lo ya publicado marcado).
// Las pruebas usan .pb-psel, [data-pc] (con su input[type=checkbox]), [data-ta] en Portal Inmobiliario, #pwPrev y #pwNext.
import Card from '../../../ui/Card';
import Boton from '../../../ui/Boton';
import Badge from '../../../ui/Badge';
import Segmentos from '../../../ui/Segmentos';
import Switch from '../../../ui/Switch';
import EstadoVacio from '../../../ui/EstadoVacio';
import { VIA } from '../comun';
import { LogoPortal, PieNav, TIPO_AVISO } from './piezas';
import { avisoVigente, usePublicar } from '../../../../store/hooks/usePublicar.hook';
import { cx } from '../../../../utils/cx';
import type { IPortal, TTipoAviso } from '../../../../store/interfaces/publicacion.interface';

// estado del aviso que ya está en el portal
const YA: Record<string, string> = {
  active: 'activo', publicada: 'publicado', en_feed: 'en el feed', pendiente: 'en espera', paused: 'pausado', under_review: 'en revisión', vencida: 'vencido',
};
const TIPOS: TTipoAviso[] = ['silver', 'gold', 'gold_premium'];

function TarjetaPortal({ x }: { x: IPortal }) {
  const { propiedad, op, sel, paquetes, tipoAviso, destacado, publicarMarcar, publicarSetTipoAviso, publicarSetDestacado } = usePublicar();
  const ya = avisoVigente(propiedad, x.id, op);
  const puede = x.listo || x.via === 'feed';
  const on = !!sel?.includes(x.id);
  const nota = !puede
    ? (x.via === 'acuerdo' ? 'Cuando el acuerdo esté activo, se suma con un clic.' : 'Conecta la cuenta en la pestaña Portales.')
    : x.via === 'feed' && !x.listo ? 'Queda en espera y sale apenas el portal active la integración.' : '';
  return (
    <div data-pc={x.id} className={cx('pb-pc', on && 'on', !puede && 'off',
      'tw:flex tw:flex-col tw:gap-3 tw:rounded-2xl tw:border tw:border-solid tw:border-b-[3px] tw:p-4 tw:transition-colors tw:duration-100',
      on ? 'tw:bg-lav-soft tw:border-lav-edge tw:border-b-lav-edge' : 'tw:bg-card tw:border-edge tw:border-b-edge-b',
      !puede && 'tw:opacity-60')}>
      <label className={cx('tw:m-0 tw:flex tw:items-center tw:gap-3', puede ? 'tw:cursor-pointer' : 'tw:cursor-not-allowed')}>
        <input type="checkbox" checked={on} disabled={!puede} onChange={(e) => publicarMarcar(x.id, e.target.checked)}
          className="tw:m-0 tw:size-[18px] tw:flex-none tw:p-0 tw:accent-[var(--ui-lav-edge)]" />
        <LogoPortal id={x.id} nombre={x.nombre} />
        <span className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-0.5">
          <b className="tw:text-[15px] tw:font-semibold tw:text-text">{x.nombre}</b>
          <small className="tw:text-xs tw:text-muted">{VIA[x.via]} · {x.estado}</small>
        </span>
      </label>
      {ya && <span><Badge tono="verde" icono="check" ajustar>Ya publicado{YA[ya.status || ''] ? ` (${YA[ya.status || '']})` : ''}: se actualiza</Badge></span>}
      {x.id === 'pi' && x.listo && (
        <div className="tw:flex tw:flex-col tw:gap-1.5">
          <small className="tw:text-xs tw:text-muted">Tipo de aviso{paquetes ? ' · disponibles en tu paquete' : ''}</small>
          <Segmentos etiqueta="Tipo de aviso" dato="ta" valor={tipoAviso} alCambiar={publicarSetTipoAviso}
            opciones={TIPOS.map((t) => [t, `${TIPO_AVISO[t]}${paquetes?.[t] != null ? ` · ${paquetes[t]}` : ''}`])} />
        </div>
      )}
      {x.id === 'chilepropiedades' && puede && (
        <Switch etiqueta="Destacado" descripcion="Aparece primero en los resultados del portal" activo={!!destacado[x.id]} alCambiar={(v) => publicarSetDestacado(x.id, v)} />
      )}
      {nota && <small className="tw:text-xs tw:text-muted">{nota}</small>}
    </div>
  );
}

export default function PasoPortales() {
  const { catalogo, sel, resultados, publicarIr } = usePublicar();
  if (!catalogo) return <EstadoVacio compacto texto="Cargando los portales…" />;
  return <>
    <Card titulo="¿Dónde lo publicamos?" subtitulo="Marca los portales. Si la propiedad ya tiene aviso en uno, al publicar se actualiza con lo último de la ficha.">
      <div className="pb-psel tw:grid tw:gap-3 tw:md:grid-cols-2">
        {catalogo.map((x) => <TarjetaPortal key={x.id} x={x} />)}
      </div>
    </Card>
    <PieNav
      izquierda={<Boton id="pwPrev" variante="secundario" icono="chevL" onClick={() => publicarIr(1)}>Volver</Boton>}
      derecha={<Boton id="pwNext" iconoDerecha="arrowR" disabled={!sel?.length || !!resultados} onClick={() => publicarIr(3)}>Revisar y publicar</Boton>} />
  </>;
}
