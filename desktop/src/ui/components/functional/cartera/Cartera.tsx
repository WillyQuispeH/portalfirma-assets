// Cartera: las propiedades en tarjetas, con búsqueda, filtros y el modo «Asignar captador».
// Hecha con el kit: Layout (cabecera y barra de filtros), Boton, Buscador, Tabs, Select, Badge, Card y EstadoVacio;
// las tarjetas (PropiedadCard) siguen con sus clases im-* de styles.css.
//
// La ficha de la propiedad, «Nueva propiedad», «Importar», «Portales» y «Dictar» siguen en
// src/renderer/inmo.js; se llaman por utils/app.ts. Los id im*, data-op, data-clr y las clases im-grid,
// im-chips/im-chip los usan las pruebas e2e y Aprende.
import { useEffect, useMemo } from 'react';
import { useCartera, type IFiltrosCartera } from '../../../store/hooks/useCartera.hook';
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
import { ESPECIAL, ESTADO, TIPO } from './catalogos';
import { filtrarPropiedades } from './filtrar';
import type { TPropiedadEstado, TPropiedadTipo } from '../../../store/interfaces/propiedad.interface';

const OPERACIONES: TTabOpcion<IFiltrosCartera['op']>[] = [['todas', 'Todas'], ['venta', 'Venta'], ['arriendo', 'Arriendo']];
// la «x» que quita un filtro activo (dentro de su etiqueta)
const QUITAR = 'tw:grid tw:place-items-center tw:w-5 tw:h-5 tw:p-0 tw:m-0 tw:rounded-full tw:border-0 tw:bg-transparent tw:text-inherit tw:cursor-pointer tw:hover:bg-lav';
const plural = (n: number, s: string, p = s + 's') => (n === 1 ? s : p);

interface ICarteraProps {
  filtros?: Partial<IFiltrosCartera>; // al abrirla desde otra pantalla (p. ej. Inicio → «Sin fotos»)
}

export default function Cartera({ filtros: filtrosIniciales }: ICarteraProps) {
  const {
    propiedades, personas, ultimaImportacion, captaciones, cargado, error, filtros: f, seleccion,
    carteraGetAll, carteraSetFiltros, seleccionIniciar, seleccionAlternar, seleccionFijar, seleccionCancelar, carteraSetCaptador,
  } = useCartera();
  const { perfil, esAdmin, perfilGet } = usePerfil();

  useEffect(() => {
    if (filtrosIniciales) carteraSetFiltros(filtrosIniciales);
    perfilGet(); carteraGetAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- solo al montar

  const lista = useMemo(() => filtrarPropiedades(propiedades, personas, captaciones, f), [propiedades, personas, captaciones, f]);
  const activas = propiedades.filter((p) => !p.archivada);
  const comunas = useMemo(() => [...new Set(propiedades.map((p) => p.comuna).filter(Boolean) as string[])].sort(), [propiedades]);
  const enCaptacion = activas.filter((p) => captaciones[p.id]?.completa === false).length;
  const corredores = perfil?.corredores || [];
  const hayCorredores = corredores.length > 0;

  const asignar = async (corredorId: string, nombre: string) => {
    const n = seleccion?.length || 0; const s = plural(n, 'propiedad', 'propiedades');
    const si = await confirmar({
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
      subtitulo={`${activas.length} propiedades${ultimaImportacion ? ` · actualizada desde Portalfirma el ${fecha(ultimaImportacion.fecha)}` : ''}`}
      acciones={<>
        <Boton id="imPort" variante="secundario" icono="link" onClick={abrirPortales}>Portales</Boton>
        <Boton id="imImp" variante="secundario" icono="download" onClick={importarCartera}>Importar desde Portalfirma</Boton>
        <Boton id="imDict" variante="secundario" icono="mic" title="Graba un audio o pega la descripción y Asset llena la ficha" onClick={dictarPropiedad}>Dictar</Boton>
        <Boton id="imNew" icono="plus" onClick={nuevaPropiedad}>Nueva propiedad</Boton>
      </>}
      barra={<>
        <Buscador kit id="imQ" valor={f.q} alCambiar={(q) => carteraSetFiltros({ q })} espera={180} placeholder="Buscar por código, dirección, comuna, rol o propietario"
          className="tw:w-full tw:sm:w-auto tw:sm:flex-1 tw:sm:min-w-[280px]" />
        <Tabs id="imOp" dato="op" etiqueta="Operación" opciones={OPERACIONES} valor={f.op} alCambiar={(op) => carteraSetFiltros({ op })} />
        <Select id="imTipo" aria-label="Tipo" vacia="Todo tipo" opciones={Object.entries(TIPO)} value={f.tipo}
          onChange={(e) => carteraSetFiltros({ tipo: e.target.value as TPropiedadTipo | '' })} />
        <Select id="imEst" aria-label="Estado" vacia="Todo estado" opciones={Object.entries(ESTADO).map(([k, [v]]): [string, string] => [k, v])} value={f.estado}
          onChange={(e) => carteraSetFiltros({ estado: e.target.value as TPropiedadEstado | '' })} />
        {enCaptacion > 0 && (
          <Boton id="imCapt" variante={f.especial === 'enCaptacion' ? 'principal' : 'secundario'} icono="clock" aria-pressed={f.especial === 'enCaptacion'}
            title="Propiedades a las que les falta algo de la captación"
            onClick={() => carteraSetFiltros({ especial: f.especial === 'enCaptacion' ? '' : 'enCaptacion' })}>
            En captación · {enCaptacion}
          </Boton>
        )}
        <Select id="imCom" aria-label="Comuna" vacia="Toda comuna" opciones={comunas.map((c): [string, string] => [c, c])} value={f.comuna}
          onChange={(e) => carteraSetFiltros({ comuna: e.target.value })} />
        {hayCorredores && (
          <Select id="imCaptF" aria-label="Captador" value={f.captador} onChange={(e) => carteraSetFiltros({ captador: e.target.value })}>
            <option value="">Todo captador</option>
            <option value="_sin">Sin captador · {activas.filter((p) => !p.captadorId).length}</option>
            {corredores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </Select>
        )}
        {hayCorredores && esAdmin && !seleccion && (
          <Boton id="imCaptBulk" variante="secundario" icono="users" title="Elige varias propiedades y asígnales quién las captó" onClick={seleccionIniciar}>
            Asignar captador
          </Boton>
        )}
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

      {cargado && (lista.length ? (
        <div className="im-grid">
          {lista.map((p) => (
            <PropiedadCard key={p.id} p={p} captacion={captaciones[p.id]} verCaptador={hayCorredores}
              modoSeleccion={!!seleccion} seleccionada={!!seleccion?.includes(p.id)}
              alTocar={() => (seleccion ? seleccionAlternar(p.id) : abrirFicha(p.id))} />
          ))}
        </div>
      ) : (
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
