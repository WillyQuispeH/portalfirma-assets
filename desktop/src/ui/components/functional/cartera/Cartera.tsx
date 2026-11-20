// Cartera: las propiedades en tarjetas o en tabla (se recuerda cuál), con búsqueda, filtros y el modo «Asignar captador».
// Hecha con el kit: Layout (cabecera y barra de filtros), Boton, Buscador, Tabs, Select, Badge, Card y EstadoVacio.
//
// La ficha de la propiedad, «Nueva propiedad», «Importar», «Portales» y «Dictar» siguen en
// src/renderer/inmo.js; se llaman por utils/app.ts. Los id im*, data-op, data-clr y las clases im-grid,
// im-chips/im-chip los usan las pruebas e2e y Aprende.
import { useEffect, useMemo } from 'react';
import { useCartera, type IFiltrosCartera, type TVistaCartera } from '../../../store/hooks/useCartera.hook';
import { usePerfil } from '../../../store/hooks/usePerfil.hook';
import { abrirFicha, abrirPortales, confirmar, dictarPropiedad, importarCartera, nuevaPropiedad, toast } from '../../../utils/app';
import { fecha } from '../../../utils/formato';
import Buscador from '../../ui/Buscador';
import Layout from '../../ui/Layout';
import Boton from '../../ui/Boton';
import Tabs, { type TTabOpcion } from '../../ui/Tabs';
import Select from '../../ui/Select';
import Badge from '../../ui/Badge';
import Card from '../../ui/Card';
import EstadoVacio from '../../ui/EstadoVacio';
import Icono from '../../ui/Icono';
import BarraCaptador from './BarraCaptador';
import PropiedadCard from './PropiedadCard';
import TablaPropiedades from './TablaPropiedades';
import { ESPECIAL, ESTADO, TIPO } from './catalogos';
import { filtrarPropiedades } from './filtrar';
import type { TPropiedadEstado, TPropiedadTipo } from '../../../store/interfaces/propiedad.interface';

const OPERACIONES: TTabOpcion<IFiltrosCartera['op']>[] = [['todas', 'Todas'], ['venta', 'Venta'], ['arriendo', 'Arriendo']];
const VISTAS: TTabOpcion<TVistaCartera>[] = [['grilla', 'Grilla', undefined, 'grid'], ['tabla', 'Tabla', undefined, 'table']];
// la «x» que quita un filtro activo (dentro de su etiqueta)
const QUITAR = 'tw:grid tw:place-items-center tw:w-5 tw:h-5 tw:p-0 tw:m-0 tw:rounded-full tw:border-0 tw:bg-transparent tw:text-inherit tw:cursor-pointer tw:hover:bg-lav';
const plural = (n: number, s: string, p = s + 's') => (n === 1 ? s : p);

interface ICarteraProps {
  filtros?: Partial<IFiltrosCartera>; // al abrirla desde otra pantalla (p. ej. Inicio → «Sin fotos»)
}

export default function Cartera({ filtros: filtrosIniciales }: ICarteraProps) {
  const {
    propiedades, personas, ultimaImportacion, captaciones, cargado, error, filtros: f, seleccion, vista, ordenTabla,
    carteraSetVista, carteraSetOrden, carteraGetAll, carteraSetFiltros, seleccionIniciar, seleccionAlternar, seleccionFijar, seleccionCancelar, carteraSetCaptador,
  } = useCartera();
  const { perfil, esAdmin, perfilGet } = usePerfil();

  useEffect(() => {
    if (filtrosIniciales) carteraSetFiltros(filtrosIniciales);
    perfilGet(); carteraGetAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- solo al montar

  const lista = useMemo(() => filtrarPropiedades(propiedades, personas, captaciones, f), [propiedades, personas, captaciones, f]);
  // cuántas quedarían con cada opción de un filtro, manteniendo los demás filtros (así se sabe cuántas hay antes de elegir)
  const cuenta = useMemo(() => {
    const base = filtrarPropiedades(propiedades, personas, captaciones, { ...f, op: 'todas', tipo: '', estado: '', comuna: '', captador: '' });
    const pasa = (p: (typeof base)[number], sin: keyof IFiltrosCartera) => {
      if (sin !== 'op' && ((f.op === 'venta' && !p.venta) || (f.op === 'arriendo' && !p.arriendo))) return false;
      if (sin !== 'tipo' && f.tipo && p.tipo !== f.tipo) return false;
      if (sin !== 'estado' && f.estado && !((p.venta && p.estadoVenta === f.estado) || (p.arriendo && p.estadoArriendo === f.estado))) return false;
      if (sin !== 'comuna' && f.comuna && p.comuna !== f.comuna) return false;
      if (sin !== 'captador' && f.captador && (f.captador === '_sin' ? !!p.captadorId : p.captadorId !== f.captador)) return false;
      return true;
    };
    const por = <K extends string>(sin: keyof IFiltrosCartera, claves: (p: (typeof base)[number]) => (K | null | undefined)[]) => {
      const m: Record<string, number> = {}; let total = 0;
      for (const p of base) { if (!pasa(p, sin)) continue; total++; for (const k of new Set(claves(p))) if (k) m[k] = (m[k] || 0) + 1; }
      return { m, total };
    };
    return {
      op: por('op', (p) => [p.venta ? 'venta' : null, p.arriendo ? 'arriendo' : null]),
      tipo: por('tipo', (p) => [p.tipo]),
      estado: por('estado', (p) => [p.venta ? p.estadoVenta : null, p.arriendo ? p.estadoArriendo : null]),
      comuna: por('comuna', (p) => [p.comuna]),
      captador: por('captador', (p) => [p.captadorId || '_sin']),
    };
  }, [propiedades, personas, captaciones, f]);
  const n = (x: number | undefined) => (x || 0).toLocaleString('es-CL');
  const filtrando = !!(f.q.trim() || f.op !== 'todas' || f.tipo || f.estado || f.comuna || f.captador || f.especial);
  const activas = propiedades.filter((p) => !p.archivada);
  const comunas = useMemo(() => [...new Set(propiedades.map((p) => p.comuna).filter(Boolean) as string[])].sort(), [propiedades]);
  const enCaptacion = activas.filter((p) => captaciones[p.id]?.completa === false).length;
  const corredores = perfil?.corredores || [];
  const hayCorredores = corredores.length > 0;

  const asignar = async (corredorId: string, nombre: string) => {
    const n = seleccion?.length || 0; const s = plural(n, 'propiedad', 'propiedades');
    const si = await confirmar({ clave: 'modal-62',
      titulo: 'Asignar captador',
      texto: corredorId ? `¿Dejar **${n}** ${s} como ${plural(n, 'captada', 'captadas')} por **${nombre}**?` : `¿Quitar el captador de **${n}** ${s}?`,
      nota: `Queda anotado en el historial de cada una.${corredorId ? ` ${nombre.split(' ')[0]} verá los datos de sus propietarios.` : ''}`,
      boton: 'Asignar',
    });
    if (!si) return;
    const r = await carteraSetCaptador(corredorId || null);
    if (r.error) return toast(r.error, 5000);
    const c = r.cambiadas || 0;
    toast(`${c} ${plural(c, 'propiedad', 'propiedades')} ${corredorId ? `${plural(c, 'asignada', 'asignadas')} a ${nombre}` : 'sin captador'}.`, 5000);
  };

  return (
    <Layout
      titulo="Cartera"
      ilustracion={{ imagen: 'img/formas/cartera.svg' }}
      subtitulo={`${filtrando ? `${n(lista.length)} de ${n(activas.length)}` : n(activas.length)} propiedades${ultimaImportacion ? ` · actualizada desde Convecta el ${fecha(ultimaImportacion.fecha)}` : ''}`}
      acciones={<>
        <Boton id="imPort" variante="secundario" icono="link" onClick={abrirPortales}>Portales</Boton>
        <Boton id="imImp" variante="secundario" icono="download" onClick={importarCartera}>Importar desde Convecta</Boton>
        <Boton id="imDict" variante="secundario" icono="mic" title="Graba un audio o pega la descripción y Asset llena la ficha" onClick={dictarPropiedad}>Dictar</Boton>
        <Boton id="imNew" icono="plus" onClick={nuevaPropiedad}>Nueva propiedad</Boton>
      </>}
      barra={<>
        <Buscador kit id="imQ" valor={f.q} alCambiar={(q) => carteraSetFiltros({ q })} espera={180} placeholder="Buscar por código, dirección, comuna, rol o propietario"
          className="tw:w-full tw:sm:w-auto tw:sm:flex-1 tw:sm:min-w-[280px]" />
        <Tabs id="imOp" dato="op" etiqueta="Operación" opciones={OPERACIONES.map(([k, t]) => [k, t, k === 'todas' ? cuenta.op.total : cuenta.op.m[k] || 0] as TTabOpcion<IFiltrosCartera['op']>)} valor={f.op} alCambiar={(op) => carteraSetFiltros({ op })} />
        <Select id="imTipo" aria-label="Tipo" vacia={`Todo tipo · ${n(cuenta.tipo.total)}`} opciones={Object.entries(TIPO).filter(([k]) => cuenta.tipo.m[k] || f.tipo === k).map(([k, v]): [string, string] => [k, `${v} · ${n(cuenta.tipo.m[k])}`])} value={f.tipo}
          onChange={(e) => carteraSetFiltros({ tipo: e.target.value as TPropiedadTipo | '' })} />
        <Select id="imEst" aria-label="Estado" vacia={`Todo estado · ${n(cuenta.estado.total)}`} opciones={Object.entries(ESTADO).map(([k, [v]]): [string, string] => [k, `${v} · ${n(cuenta.estado.m[k])}`])} value={f.estado}
          onChange={(e) => carteraSetFiltros({ estado: e.target.value as TPropiedadEstado | '' })} />
        {enCaptacion > 0 && (
          <Boton id="imCapt" variante={f.especial === 'enCaptacion' ? 'principal' : 'secundario'} icono="clock" aria-pressed={f.especial === 'enCaptacion'}
            title="Propiedades a las que les falta algo de la captación"
            onClick={() => carteraSetFiltros({ especial: f.especial === 'enCaptacion' ? '' : 'enCaptacion' })}>
            En captación · {enCaptacion}
          </Boton>
        )}
        <Select id="imCom" aria-label="Comuna" vacia={`Toda comuna · ${n(cuenta.comuna.total)}`} opciones={comunas.filter((c) => cuenta.comuna.m[c] || f.comuna === c).map((c): [string, string] => [c, `${c} · ${n(cuenta.comuna.m[c])}`])} value={f.comuna}
          onChange={(e) => carteraSetFiltros({ comuna: e.target.value })} />
        {hayCorredores && (
          <Select id="imCaptF" aria-label="Captador" value={f.captador} onChange={(e) => carteraSetFiltros({ captador: e.target.value })}>
            <option value="">Todo captador · {n(cuenta.captador.total)}</option>
            <option value="_sin">Sin captador · {n(cuenta.captador.m._sin)}</option>
            {corredores.map((c) => <option key={c.id} value={c.id}>{c.nombre} · {n(cuenta.captador.m[c.id])}</option>)}
          </Select>
        )}
        {hayCorredores && esAdmin && !seleccion && (
          <Boton id="imCaptBulk" variante="secundario" icono="users" title="Elige varias propiedades y asígnales quién las captó" onClick={seleccionIniciar}>
            Asignar captador
          </Boton>
        )}
        <Tabs id="imVista" dato="vista" etiqueta="Ver como" opciones={VISTAS} valor={vista} alCambiar={carteraSetVista} className="tw:ml-auto" />
      </>}
    >
      {seleccion && (
        <BarraCaptador elegidas={seleccion.length} enLista={lista.length} corredores={corredores}
          alElegirTodas={() => seleccionFijar([...new Set([...seleccion, ...lista.map((p) => p.id)])])}
          alElegirNinguna={() => seleccionFijar([])} alCancelar={seleccionCancelar} alAsignar={asignar} />
      )}

      {(f.especial || f.archivadas) && (
        <div className="im-chips tw:flex tw:flex-wrap tw:gap-2">
          {f.especial && (
            <Badge tono="lavanda" className="im-chip tw:pr-1">
              {ESPECIAL[f.especial]}
              <button type="button" data-clr="especial" title="Quitar filtro" aria-label="Quitar filtro" onClick={() => carteraSetFiltros({ especial: '' })} className={QUITAR}><Icono nombre="x" tam={12} /></button>
            </Badge>
          )}
          {f.archivadas && (
            <Badge tono="lavanda" className="im-chip tw:pr-1">
              Archivadas
              <button type="button" data-clr="archivadas" title="Quitar filtro" aria-label="Quitar filtro" onClick={() => carteraSetFiltros({ archivadas: false })} className={QUITAR}><Icono nombre="x" tam={12} /></button>
            </Badge>
          )}
        </div>
      )}

      {error && <p role="alert" className="tw:m-0 tw:text-red-softink">No se pudo leer la cartera: {error}</p>}

      {cargado && (lista.length ? (vista === 'tabla' ? (
        <Card relleno={false}>
          <TablaPropiedades lista={lista} captaciones={captaciones} verCaptador={hayCorredores} seleccion={seleccion}
            orden={ordenTabla} alOrdenar={carteraSetOrden}
            alTocar={(p) => (seleccion ? seleccionAlternar(p.id) : abrirFicha(p.id))} />
        </Card>
      ) : (
        <div className="im-grid tw:grid tw:grid-cols-[repeat(auto-fill,minmax(268px,1fr))] tw:gap-ui">
          {lista.map((p) => (
            <PropiedadCard key={p.id} p={p} captacion={captaciones[p.id]} verCaptador={hayCorredores}
              modoSeleccion={!!seleccion} seleccionada={!!seleccion?.includes(p.id)}
              alTocar={() => (seleccion ? seleccionAlternar(p.id) : abrirFicha(p.id))} />
          ))}
        </div>
      )) : (
        <Card>
          <EstadoVacio icono="search" texto={propiedades.length ? 'Ninguna propiedad coincide con los filtros.' : 'Aún no tienes propiedades. Impórtalas desde Portalfirma o crea la primera.'} />
        </Card>
      ))}

      <div className="tw:flex tw:justify-center">
        <Boton id="imArch" variante="fantasma" tamano="sm" onClick={() => carteraSetFiltros({ archivadas: !f.archivadas })}>{f.archivadas ? 'Ver activas' : 'Ver archivadas'}</Boton>
      </div>
    </Layout>
  );
}
