// Flujo «Publicar» de una propiedad: 1. Calidad del aviso → 2. Portales → 3. Publicar. Ordenado como las fichas:
// cabecera con «volver» a Publicaciones, los pasos y el contenido de cada uno.
// Lo monta Publicaciones.publicar(propId, op, paso) (src/renderer/publicaciones.js) en #view-publicaciones, el mismo
// contenedor de las pestañas; «Más portales» y «Mejorar aviso» (en Avisos) entran directo al paso 2 o al 1.
// Siguen fuera de React: el contacto de los avisos (publicaciones.js) y los datos de la propiedad (inmo.js).
// Las pruebas usan .pb-wiz, #pwBack, #pwOp, .pb-steps y los id de cada paso.
import { useEffect } from 'react';
import Layout from '../../../ui/Layout';
import Card from '../../../ui/Card';
import Badge from '../../../ui/Badge';
import Boton from '../../../ui/Boton';
import Icono from '../../../ui/Icono';
import Segmentos from '../../../ui/Segmentos';
import EstadoVacio from '../../../ui/EstadoVacio';
import PasoCalidad from './PasoCalidad';
import PasoPortales from './PasoPortales';
import PasoPublicar from './PasoPublicar';
import { precio } from '../../ficha/comun';
import { usePublicar } from '../../../../store/hooks/usePublicar.hook';
import { abrirFicha, abrirPublicaciones } from '../../../../utils/app';
import { cx } from '../../../../utils/cx';
import type { TPasoPublicar, TPubOperacion } from '../../../../store/interfaces/publicacion.interface';

const PASOS: [TPasoPublicar, string, string][] = [[1, 'Calidad del aviso', 'Texto y lo que falta'], [2, 'Portales', 'Dónde se publica'], [3, 'Publicar', 'Revisa y envía']];
const OPERACION: Record<TPubOperacion, string> = { venta: 'Venta', arriendo: 'Arriendo' };

// los pasos: se puede volver a uno anterior (antes de publicar); para avanzar, el botón de abajo
function Pasos() {
  const { paso, calidad, resultados, publicarIr } = usePublicar();
  const bloqueado = !!calidad?.bloquea.length;
  return (
    <Card relleno={false}>
      <ol className="pb-steps tw:m-0 tw:grid tw:list-none tw:grid-cols-3 tw:gap-1 tw:p-2">
        {PASOS.map(([n, t, d]) => {
          const hecho = n < paso || (n === 3 && !!resultados?.some((x) => x.ok)); const actual = n === paso && !hecho;
          const puede = n < paso && !resultados && !(n > 1 && bloqueado);
          return (
            <li key={n} className={cx(hecho && 'hecho', actual && 'ahora')}>
              <button type="button" aria-current={actual ? 'step' : undefined} onClick={() => { if (puede) publicarIr(n); }}
                className={cx('tw:flex tw:h-full tw:w-full tw:items-center tw:gap-3 tw:m-0 tw:px-3 tw:py-2.5 tw:rounded-xl tw:border-0 tw:text-left tw:font-[inherit]',
                  actual ? 'tw:bg-lav-soft tw:text-text' : 'tw:bg-transparent tw:text-muted', puede ? 'tw:cursor-pointer tw:hover:bg-hover' : 'tw:cursor-default')}>
                <span className={cx('tw:grid tw:size-8 tw:flex-none tw:place-items-center tw:rounded-full tw:text-[13px] tw:font-bold',
                  hecho ? 'tw:bg-green-edge tw:text-white' : actual ? 'tw:bg-lav-edge tw:text-white' : 'tw:bg-sunken tw:text-muted')}>
                  {hecho ? <Icono nombre="check" tam={15} /> : n}
                </span>
                <span className="tw:flex tw:min-w-0 tw:flex-col">
                  <b className={cx('tw:truncate tw:text-sm tw:font-semibold', (actual || hecho) && 'tw:text-text')}>{t}</b>
                  <small className="tw:truncate tw:text-xs tw:text-muted">{d}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

interface IPublicarAvisoProps {
  propId: string;
  op: TPubOperacion;
  ops: TPubOperacion[]; // operaciones de la propiedad (venta, arriendo o ambas)
  paso?: TPasoPublicar;
}

export default function PublicarAviso({ propId, op, ops, paso = 1 }: IPublicarAvisoProps) {
  const { propiedad: p, op: opActual, ops: opsActuales, paso: pasoActual, resultados, error, publicarIniciar, publicarSetOp } = usePublicar();
  useEffect(() => { publicarIniciar({ propId, op, ops, paso }); }, [propId, op, paso]); // eslint-disable-line react-hooks/exhaustive-deps -- ops viene con propId

  const volver = { texto: 'Publicaciones', alTocar: () => abrirPublicaciones('avisos'), id: 'pwBack' };
  if (!p || p.id !== propId) {
    return <Layout className="pb-wrap pb-wiz" volver={volver} titulo="Publicar">
      {error ? <p role="alert" className="tw:m-0 tw:text-red-softink">No se pudo preparar la publicación: {error}</p> : <EstadoVacio compacto texto="Cargando…" />}
    </Layout>;
  }
  const pr = precio(opActual === 'venta' ? p.precioVenta : p.precioArriendo);
  return (
    <Layout
      className="pb-wrap pb-wiz"
      cabeceraClassName="pb-wh"
      volver={volver}
      miga="Publicar"
      sobretitulo={<span className="im-code">{p.codigo}{p.comuna ? ' · ' + p.comuna : ''}</span>}
      titulo={`Publicar ${p.titulo}`}
      subtitulo={
        <span className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
          {opsActuales.length > 1 && !resultados
            ? <Segmentos id="pwOp" etiqueta="Operación" dato="o" valor={opActual} alCambiar={publicarSetOp} opciones={opsActuales.map((o) => [o, OPERACION[o]] as [TPubOperacion, string])} />
            : <Badge tono={opActual === 'venta' ? 'azul' : 'durazno'}>{OPERACION[opActual]}</Badge>}
          {pr && <span>{pr}{opActual === 'arriendo' ? ' al mes' : ''}</span>}
        </span>
      }
      acciones={<Boton variante="secundario" icono="house" onClick={() => abrirFicha(p.id)}>Ver ficha</Boton>}
    >
      <Pasos />
      {error && <p role="alert" className="tw:m-0 tw:text-red-softink">{error}</p>}
      {pasoActual === 1 ? <PasoCalidad /> : pasoActual === 2 ? <PasoPortales /> : <PasoPublicar />}
    </Layout>
  );
}
