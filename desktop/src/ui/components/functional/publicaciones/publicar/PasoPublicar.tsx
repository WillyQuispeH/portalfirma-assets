// Paso 3 · Publicar: el resumen (dónde y cómo sale el aviso) y el resultado de cada portal.
// Las pruebas usan [data-r] (una fila por portal), #pwPrev, #pwGo, .pb-done y #pwFin.
import { useState } from 'react';
import Card from '../../../ui/Card';
import Boton from '../../../ui/Boton';
import Badge from '../../../ui/Badge';
import Icono from '../../../ui/Icono';
import { Anillo } from '../comun';
import { precio } from '../../ficha/comun';
import { Aviso, COLUMNAS, LogoPortal, PieNav, TIPO_AVISO } from './piezas';
import { usePublicar } from '../../../../store/hooks/usePublicar.hook';
import { abrirPublicaciones, abrirUrl, festejar, toast } from '../../../../utils/app';
import { cx } from '../../../../utils/cx';

export default function PasoPublicar() {
  const { propiedad: p, op, calidad: q, catalogo, sel, tipoAviso, resultados, publicando, publicarIr, publicarEnviar } = usePublicar();
  const [fotoRota, setFotoRota] = useState(false);
  if (!p || !q || !catalogo) return null;
  const elegidos = catalogo.filter((x) => sel?.includes(x.id));
  const okN = resultados?.filter((x) => x.ok).length ?? 0;
  const foto = p.fotos?.[0];

  const publicar = async () => {
    const r = await publicarEnviar();
    if (r.error) toast(r.error, 6000); else festejar();
  };

  return <>
    <div className={COLUMNAS}>
      <div className="tw:min-w-0">
        <Card titulo="Dónde se publica" subtitulo={resultados ? 'Resultado en cada portal' : 'Revisa y pulsa «Publicar ahora»'}>
          <div className="pb-res tw:flex tw:flex-col">
            {elegidos.map((x) => {
              const r = resultados?.find((y) => y.portal === x.id);
              const como = x.id === 'pi' ? `Por API · aviso ${TIPO_AVISO[tipoAviso]}` : x.listo ? 'Por feed: sale en la próxima lectura del portal' : 'Queda en espera de la integración';
              return (
                <div key={x.id} data-r={x.id} className={cx(r && (r.ok ? (r.espera ? 'wait' : 'ok') : 'bad'),
                  'tw:flex tw:flex-wrap tw:items-center tw:gap-3 tw:py-3 tw:border-0 tw:border-t tw:border-solid tw:border-edge tw:first:border-t-0 tw:first:pt-0')}>
                  <LogoPortal id={x.id} nombre={x.nombre} />
                  <span className="tw:flex tw:min-w-[180px] tw:flex-1 tw:flex-col tw:gap-0.5">
                    <b className="tw:text-sm tw:font-semibold">{x.nombre}</b>
                    <small className="tw:text-xs tw:text-muted">{como}</small>
                  </span>
                  {r && (r.ok
                    ? <span className="tw:flex tw:flex-wrap tw:items-center tw:gap-1.5">
                      <Badge tono={r.espera ? 'amarillo' : 'verde'} icono={r.espera ? 'clock' : 'check'} ajustar>{r.estado}</Badge>
                      {r.url && <Boton variante="fantasma" tamano="sm" icono="export" data-url={r.url} onClick={() => abrirUrl(r.url!)}>Ver aviso</Boton>}
                    </span>
                    : <span className="tw:w-full"><Aviso tono="rojo" icono="alert">{r.error}</Aviso></span>)}
                </div>
              );
            })}
          </div>
        </Card>
      </div>
      <div className="tw:min-w-0">
        <Card titulo="El aviso">
          <div className="tw:flex tw:flex-col tw:gap-4">
            <span className="tw:grid tw:h-44 tw:w-full tw:place-items-center tw:overflow-hidden tw:rounded-xl tw:bg-lav-soft tw:text-lav-softink">
              {foto && !fotoRota ? <img src={foto} alt="" loading="lazy" className="tw:size-full tw:object-cover" onError={() => setFotoRota(true)} /> : <Icono nombre="house" tam={34} />}
            </span>
            <div className="tw:flex tw:items-center tw:gap-3">
              <Anillo n={q.puntaje} />
              <span className="tw:flex tw:min-w-0 tw:flex-col tw:gap-0.5">
                <b className="tw:text-[15px] tw:font-semibold tw:leading-tight">{p.tituloPortal || p.titulo}</b>
                <small className="tw:text-xs tw:text-muted">{op === 'venta' ? 'Venta' : 'Arriendo'} · {precio(op === 'venta' ? p.precioVenta : p.precioArriendo) || 'Sin precio'} · {q.fotos} fotos</small>
              </span>
            </div>
            {sel?.includes('pi') && <Aviso tono="azul" icono="coins">Portal Inmobiliario usa una publicación del paquete de la cuenta.</Aviso>}
          </div>
        </Card>
      </div>
    </div>
    {resultados
      ? <PieNav
        izquierda={<span className={cx('pb-done tw:inline-flex tw:items-center tw:gap-2 tw:text-sm tw:font-semibold', okN ? 'tw:text-green-softink' : 'tw:text-red-softink')}>
          <Icono nombre={okN ? 'check' : 'alert'} tam={16} />{okN ? `Publicación enviada a ${okN} ${okN === 1 ? 'portal' : 'portales'}.` : 'No se pudo publicar.'}
        </span>}
        derecha={<>
          {!okN && <Boton id="pwPrev" variante="secundario" icono="chevL" onClick={() => publicarIr(2)}>Volver</Boton>}
          <Boton id="pwFin" iconoDerecha="arrowR" onClick={() => abrirPublicaciones('avisos')}>Ver mis avisos</Boton>
        </>} />
      : <PieNav
        izquierda={<Boton id="pwPrev" variante="secundario" icono="chevL" disabled={publicando} onClick={() => publicarIr(2)}>Volver</Boton>}
        derecha={<Boton id="pwGo" icono="export" cargando={publicando} onClick={publicar}>{publicando ? 'Publicando…' : 'Publicar ahora'}</Boton>} />}
  </>;
}
