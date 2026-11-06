// Pestaña «Resumen» de la ficha: la captación, la galería, las características, la comercialización,
// las personas vinculadas y lo último del historial. Con el kit: Card, Boton, Select, ListaDatos, ItemLista y Avatar.
// Las pruebas usan #fCapt, .im-gmain, #fDrive, [data-caracteristicas], .im-desc, .im-com con [data-est],
// #fVinc, [data-pv] (data-per, data-wa, data-mail, data-unl) y [data-go="historial"].
import { useEffect, useRef, useState } from 'react';
import Icono from '../../ui/Icono';
import Boton from '../../ui/Boton';
import Card from '../../ui/Card';
import Select from '../../ui/Select';
import ListaDatos from '../../ui/ListaDatos';
import ItemLista from '../../ui/ItemLista';
import Avatar from '../../ui/Avatar';
import EstadoVacio from '../../ui/EstadoVacio';
import { ESTADO, ROL } from '../cartera/catalogos';
import { ListaActividad, copiarCorreo, num, precio, whatsapp } from './comun';
import { VincularPersona } from './Modales';
import { useFicha, type TFichaTab } from '../../../store/hooks/useFicha.hook';
import { abrirPersona, avisar, bloqueCaptacion, fichaCompleta, fotosDesdeDrive, toast } from '../../../utils/app';
import { abrirModal } from '../../../utils/modal';
import type { IPropiedad, TPropiedadEstado } from '../../../store/interfaces/propiedad.interface';
import type { TPersonaRol } from '../../../store/interfaces/persona.interface';

// La captación la dibuja src/renderer/etapas.js (Etapas.bloque) en su propio contenedor, que React deja vacío.
// En cada recarga de la ficha (version) Etapas lo vuelve a dibujar en el MISMO contenedor: si se creara uno
// nuevo, un dibujo que aún espera su respuesta quedaría en un nodo fuera de la página (y sus botones, sin dueño).
function Captacion({ propId, version }: { propId: string; version: number }) {
  const caja = useRef<HTMLDivElement>(null);
  const { fichaRecargar } = useFicha();
  useEffect(() => {
    const el = caja.current; if (!el) return;
    if (!el.childNodes.length) el.innerHTML = '<p class="muted small">Cargando la captación…</p>';
    bloqueCaptacion(el, propId, () => { fichaRecargar(); });
  }, [propId, version, fichaRecargar]);
  return <div className="im-captres" id="fCapt" ref={caja} />;
}

function Galeria({ p }: { p: IPropiedad }) {
  const fotos = p.fotos || [];
  const [sel, setSel] = useState(0);
  const [rotas, setRotas] = useState<number[]>([]); // fotos que no cargan (sin conexión o URL vencida)
  const rota = (i: number) => setRotas((r) => (r.includes(i) ? r : [...r, i]));
  const actual = fotos[sel] ? sel : 0;
  const sinFoto = <span className="im-noph"><Icono nombre="house" tam={34} /></span>;
  return (
    <div className="im-gal">
      {fotos.length ? <>
        <div className="im-gmain">{rotas.includes(actual) ? sinFoto : <img key={actual} src={fotos[actual]} alt="" loading="lazy" onError={() => rota(actual)} />}</div>
        {fotos.length > 1 && (
          <div className="im-thumbs">
            {fotos.slice(0, 12).map((u, i) => rotas.includes(i) && i !== actual ? null : (
              <img key={i} src={u} data-i={i} className={i === actual ? 'on' : ''} loading="lazy" alt="" onClick={() => setSel(i)} onError={() => rota(i)} />
            ))}
          </div>
        )}
      </> : <div className="im-gmain vacia">{sinFoto}<span className="im-gnote">Sin fotos todavía</span></div>}
      <span className="tw:absolute tw:right-2.5 tw:top-2.5">
        <Boton id="fDrive" variante="secundario" tamano="sm" icono="drive" onClick={() => fotosDesdeDrive(p.id)}>Fotos desde Drive</Boton>
      </span>
    </div>
  );
}

function Caracteristicas({ p }: { p: IPropiedad }) {
  const vacia = [p.supTotal, p.supUtil, p.dormitorios, p.banos, p.estacionamientos, p.bodegas, p.gastosComunes].every((x) => x == null || (x as unknown) === '') && !p.amoblado && !p.corredor;
  const { fichaRecargar } = useFicha();
  return (
    <Card titulo="Características">
      {vacia && (
        <p className="tw:m-0 tw:text-[13px] tw:text-muted">Sin características todavía · <a href="#" id="fCarVacio" onClick={(e) => { e.preventDefault(); fichaCompleta(p.id, () => { fichaRecargar(); }); }}>Completar ficha</a></p>
      )}
      <div data-caracteristicas>
        <ListaDatos datos={[
          ['Superficie total', p.supTotal != null ? num(p.supTotal) + ' m²' : ''],
          ['Superficie útil', p.supUtil != null ? num(p.supUtil) + ' m²' : ''],
          ['Dormitorios', p.dormitorios],
          ['Baños', p.banos],
          ['Estacionamientos', p.estacionamientos],
          ['Bodegas', p.bodegas],
          ['Gastos comunes', p.gastosComunes != null ? '$' + num(p.gastosComunes) : ''],
          ['Amoblado', p.amoblado ? 'Sí' : ''],
          ['Corredor', p.corredor ? <>{p.corredor.nombre}{p.corredor.email && <small className="tw:block tw:text-xs tw:text-muted">{p.corredor.email}</small>}</> : ''],
        ]} />
      </div>
      {p.descripcion && <><h4 className="tw:mt-4 tw:mb-1.5 tw:text-sm tw:font-bold">Descripción</h4><p className="im-desc">{p.descripcion}</p></>}
      {p.notasInternas && <><h4 className="tw:mt-4 tw:mb-1.5 tw:text-sm tw:font-bold">Notas internas</h4><p className="im-desc">{p.notasInternas}</p></>}
    </Card>
  );
}

const ESTADOS_VENTA: TPropiedadEstado[] = ['disponible', 'reservada', 'vendida', 'no_disponible'];
const ESTADOS_ARRIENDO: TPropiedadEstado[] = ['disponible', 'reservada', 'arrendada', 'no_disponible'];

function Comercializacion({ p }: { p: IPropiedad }) {
  const { fichaSetEstado } = useFicha();
  const cambiar = async (campo: 'estadoVenta' | 'estadoArriendo', valor: string) => avisar(await fichaSetEstado(campo, valor));
  const fila = (op: 'venta' | 'arriendo') => {
    const campo = op === 'venta' ? 'estadoVenta' : 'estadoArriendo'; const estados = op === 'venta' ? ESTADOS_VENTA : ESTADOS_ARRIENDO;
    return (
      <div className="im-com">
        <span><small>{op === 'venta' ? 'Venta' : 'Arriendo mensual'}</small><b>{precio(op === 'venta' ? p.precioVenta : p.precioArriendo) || 'Sin precio'}</b></span>
        <Select data-est={campo} aria-label={op === 'venta' ? 'Estado de la venta' : 'Estado del arriendo'} value={p[campo] || estados[0]}
          onChange={(e) => cambiar(campo, e.target.value)} opciones={estados.map((o): [string, string] => [o, ESTADO[o][0]])} />
      </div>
    );
  };
  return <Card titulo="Comercialización">{p.venta && fila('venta')}{p.arriendo && fila('arriendo')}</Card>;
}

function PersonasVinculadas({ p }: { p: IPropiedad }) {
  const { personas, fichaDesvincular } = useFicha();
  const vincs = (p.vinculos || []).map((v) => ({ ...v, c: personas.find((x) => x.id === v.personaId) })).filter((v) => v.c);
  const quitar = async (personaId: string, rol: string) => { const r = await fichaDesvincular(personaId, rol); if (r.error) toast(r.error, 4000); };
  return (
    <Card titulo="Personas" accion={<Boton id="fVinc" variante="secundario" tamano="sm" icono="plus" onClick={() => abrirModal(<VincularPersona p={p} />, { clave: 'modal-77' })}>Vincular</Boton>}>
      {vincs.length ? (
        <div className="tw:-mx-3 tw:flex tw:flex-col">
          {vincs.map(({ c, rol }) => c && (
            <ItemLista key={`${c.id}-${rol}`} data-pv=""
              media={<Avatar nombre={c.nombre} />}
              titulo={c.reservado
                ? <span className="tw:inline-flex tw:items-center tw:gap-1"><Icono nombre="lock" tam={12} /> {c.nombre}</span>
                : <span data-per={c.id} onClick={() => abrirPersona(c.id)} className="tw:cursor-pointer tw:hover:text-brand">{c.nombre}</span>}
              detalle={`${ROL[rol as TPersonaRol] || rol}${c.rut ? ' · ' + c.rut : c.reservado ? ' · lo ve quien captó la propiedad' : ''}`}
              derecha={<>
                {c.telefono && <Boton variante="fantasma" tamano="sm" icono="whatsapp" title="WhatsApp" aria-label="WhatsApp" data-wa={c.telefono} onClick={() => whatsapp(c.telefono!)} />}
                {c.email && <Boton variante="fantasma" tamano="sm" icono="mail" title="Copiar correo" aria-label="Copiar correo" data-mail={c.email} onClick={() => copiarCorreo(c.email)} />}
                {!c.reservado && <Boton variante="fantasma" tamano="sm" icono="x" title="Quitar vínculo" aria-label="Quitar vínculo" data-unl={c.id} data-rol={rol} onClick={() => quitar(c.id, rol)} />}
              </>} />
          ))}
        </div>
      ) : <EstadoVacio compacto texto="Sin personas vinculadas. Agrega al propietario para poder firmar el mandato." />}
    </Card>
  );
}

export default function Resumen({ p, irA, version }: { p: IPropiedad; irA: (t: TFichaTab) => void; version: number }) {
  const { actividad } = useFicha();
  return (
    <div className="tw:flex tw:flex-col tw:gap-4">
      <Captacion key={p.id} propId={p.id} version={version} />
      <div className="tw:grid tw:gap-4 tw:lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] tw:items-start">
        <div className="tw:grid tw:gap-4 tw:min-w-0">
          <Galeria p={p} />
          <Caracteristicas p={p} />
        </div>
        <div className="tw:grid tw:gap-4 tw:min-w-0">
          <Comercializacion p={p} />
          <PersonasVinculadas p={p} />
          <Card titulo="Lo último" accion={<Boton variante="fantasma" tamano="sm" data-go="historial" onClick={() => irA('historial')}>Ver todo</Boton>}>
            <div className="tw:max-h-[360px] tw:overflow-auto"><ListaActividad items={actividad.slice(0, 5)} /></div>
          </Card>
        </div>
      </div>
    </div>
  );
}
