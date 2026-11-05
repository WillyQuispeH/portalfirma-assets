// Cartera: las propiedades en tarjetas, con búsqueda, filtros y el modo «Asignar captador».
//
// La ficha de la propiedad, «Nueva propiedad», «Importar», «Portales» y «Dictar» siguen en
// src/renderer/inmo.js; se llaman por utils/app.ts. Los id im* los usan las pruebas e2e y Aprende.
import { useEffect, useMemo } from 'react';
import { useCartera, type IFiltrosCartera } from '../../../store/hooks/useCartera.hook';
import { usePerfil } from '../../../store/hooks/usePerfil.hook';
import { abrirFicha, abrirPortales, confirmar, dictarPropiedad, importarCartera, nuevaPropiedad, toast } from '../../../utils/app';
import { fecha } from '../../../utils/formato';
import Buscador from '../../ui/Buscador';
import Icono from '../../ui/Icono';
import Segmentos from '../../ui/Segmentos';
import BarraCaptador from './BarraCaptador';
import PropiedadCard from './PropiedadCard';
import { ESPECIAL, ESTADO, TIPO } from './catalogos';
import { filtrarPropiedades } from './filtrar';
import type { TPropiedadEstado, TPropiedadTipo } from '../../../store/interfaces/propiedad.interface';

const OPERACIONES: [IFiltrosCartera['op'], string][] = [['todas', 'Todas'], ['venta', 'Venta'], ['arriendo', 'Arriendo']];
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
    <div className="im-wrap">
      <div className="im-head fx-cartera">
        <div>
          <h1>Cartera</h1>
          <p className="muted">{activas.length} propiedades{ultimaImportacion ? ` · actualizada desde Portalfirma el ${fecha(ultimaImportacion.fecha)}` : ''}</p>
        </div>
        <div className="row">
          <button className="secondary" id="imPort" onClick={abrirPortales}><Icono nombre="link" tam={15} /> Portales</button>
          <button className="secondary" id="imImp" onClick={importarCartera}><Icono nombre="download" tam={15} /> Importar desde Portalfirma</button>
          <button className="secondary" id="imDict" title="Graba un audio o pega la descripción y Asset llena la ficha" onClick={dictarPropiedad}><Icono nombre="mic" tam={15} /> Dictar</button>
          <button className="primary" id="imNew" onClick={nuevaPropiedad}><Icono nombre="plus" tam={15} /> Nueva propiedad</button>
        </div>
      </div>

      <div className="im-bar">
        <Buscador id="imQ" valor={f.q} alCambiar={(q) => carteraSetFiltros({ q })} espera={180} placeholder="Buscar por código, dirección, comuna, rol o propietario" />
        <Segmentos id="imOp" dato="op" etiqueta="Operación" opciones={OPERACIONES} valor={f.op} alCambiar={(op) => carteraSetFiltros({ op })} />
        <select id="imTipo" value={f.tipo} onChange={(e) => carteraSetFiltros({ tipo: e.target.value as TPropiedadTipo | '' })}>
          <option value="">Todo tipo</option>
          {Object.entries(TIPO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select id="imEst" value={f.estado} onChange={(e) => carteraSetFiltros({ estado: e.target.value as TPropiedadEstado | '' })}>
          <option value="">Todo estado</option>
          {Object.entries(ESTADO).map(([k, [v]]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {enCaptacion > 0 && (
          <button className={`im-cf ${f.especial === 'enCaptacion' ? 'on' : ''}`} id="imCapt" title="Propiedades a las que les falta algo de la captación"
            onClick={() => carteraSetFiltros({ especial: f.especial === 'enCaptacion' ? '' : 'enCaptacion' })}>
            <Icono nombre="clock" tam={13} /> En captación · {enCaptacion}
          </button>
        )}
        <select id="imCom" value={f.comuna} onChange={(e) => carteraSetFiltros({ comuna: e.target.value })}>
          <option value="">Toda comuna</option>
          {comunas.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {hayCorredores && (
          <select id="imCaptF" value={f.captador} onChange={(e) => carteraSetFiltros({ captador: e.target.value })}>
            <option value="">Todo captador</option>
            <option value="_sin">Sin captador · {activas.filter((p) => !p.captadorId).length}</option>
            {corredores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        )}
        {hayCorredores && esAdmin && !seleccion && (
          <button className="secondary small" id="imCaptBulk" title="Elige varias propiedades y asígnales quién las captó" onClick={seleccionIniciar}>
            <Icono nombre="users" tam={14} /> Asignar captador
          </button>
        )}
      </div>

      {seleccion && (
        <BarraCaptador elegidas={seleccion.length} enLista={lista.length} corredores={corredores}
          alElegirTodas={() => seleccionFijar([...new Set([...seleccion, ...lista.map((p) => p.id)])])}
          alElegirNinguna={() => seleccionFijar([])} alCancelar={seleccionCancelar} alAsignar={asignar} />
      )}

      {(f.especial || f.archivadas) && (
        <div className="im-chips">
          {f.especial && <span className="im-chip">{ESPECIAL[f.especial]}<button data-clr="especial" title="Quitar filtro" onClick={() => carteraSetFiltros({ especial: '' })}><Icono nombre="x" tam={12} /></button></span>}
          {f.archivadas && <span className="im-chip">Archivadas<button data-clr="archivadas" onClick={() => carteraSetFiltros({ archivadas: false })}><Icono nombre="x" tam={12} /></button></span>}
        </div>
      )}

      {error && <p className="error">No se pudo leer la cartera: {error}</p>}

      {cargado && (lista.length ? (
        <div className="im-grid">
          {lista.map((p) => (
            <PropiedadCard key={p.id} p={p} captacion={captaciones[p.id]} verCaptador={hayCorredores}
              modoSeleccion={!!seleccion} seleccionada={!!seleccion?.includes(p.id)}
              alTocar={() => (seleccion ? seleccionAlternar(p.id) : abrirFicha(p.id))} />
          ))}
        </div>
      ) : (
        <div className="im-empty sm">
          <span className="im-eic"><Icono nombre="search" tam={30} /></span>
          <p>{propiedades.length ? 'Ninguna propiedad coincide con los filtros.' : 'Aún no tienes propiedades. Impórtalas desde Portalfirma o crea la primera.'}</p>
        </div>
      ))}

      <p className="im-foot">
        <button className="ghost small" id="imArch" onClick={() => carteraSetFiltros({ archivadas: !f.archivadas })}>{f.archivadas ? 'Ver activas' : 'Ver archivadas'}</button>
      </p>
    </div>
  );
}
