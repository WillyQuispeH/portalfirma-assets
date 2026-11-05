// Negocios: el tablero por etapas (Ventas / Arriendos), con resumen, búsqueda y «Cerrados».
// Arrastrar una tarjeta a otra columna mueve el negocio de etapa.
// Hecha con el kit: Layout (cabecera y barra), Boton, Tabs, Buscador, Kpi, Card y EstadoVacio; las columnas y tarjetas del
// tablero siguen con sus clases ng-* de styles.css.
//
// La ficha del negocio y «Nuevo negocio» siguen en src/renderer/negocios.js; se llaman por utils/app.ts.
// Los id ngNew, ngTipo (data-t), ngVer (data-v), ngQ y las clases ng-kpis, ng-board, ng-col[data-e], ng-card y
// ng-cerrados los usan las pruebas y Aprende.
import { useEffect, useMemo, useState } from 'react';
import { useNegocio } from '../../../store/hooks/useNegocio.hook';
import { abrirNegocio, esMiembro, nuevoNegocio, toast } from '../../../utils/app';
import { montos } from '../../../utils/formato';
import Buscador from '../../ui/Buscador';
import Layout from '../../ui/Layout';
import Boton from '../../ui/Boton';
import Tabs from '../../ui/Tabs';
import Card from '../../ui/Card';
import EstadoVacio from '../../ui/EstadoVacio';
import Icono from '../../ui/Icono';
import Kpi from '../../ui/Kpi';
import NegocioCard from './NegocioCard';
import { sumar } from '../finanzas/resumen';
import type { TNegocioTipo } from '../../../store/interfaces/negocio.interface';

const hoy = () => new Date().toISOString().slice(0, 10);

interface INegociosProps {
  tipo?: TNegocioTipo; // al abrirlo desde otra pantalla en Ventas o Arriendos
}

export default function Negocios({ tipo: tipoInicial }: INegociosProps) {
  const { negocios, etapas, cargado, error, filtros: f, negocioAbrir, negocioSetFiltros, negocioMover, negocioRevisarFirmas } = useNegocio();
  const [sobre, setSobre] = useState<string | null>(null); // columna bajo la tarjeta que se arrastra

  useEffect(() => {
    negocioAbrir(tipoInicial).then(async () => {
      if (!esMiembro()) return; // la revisión de firmas usa la cuenta de Portalfirma
      const mensajes = await negocioRevisarFirmas();
      if (mensajes.length) toast(mensajes.join(' '), 6000);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- solo al montar

  const delTipo = useMemo(() => negocios.filter((n) => n.tipo === f.tipo), [negocios, f.tipo]);
  const abiertos = delTipo.filter((n) => n.estado === 'abierto');
  const lista = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    return delTipo.filter((n) => (f.ver === 'abiertos' ? n.estado === 'abierto' : n.estado !== 'abierto')
      && (!q || [n.titulo, n.prop?.codigo, n.cliente?.nombre, n.cliente?.rut].join(' ').toLowerCase().includes(q)));
  }, [delTipo, f.ver, f.q]);
  const cuenta = (t: TNegocioTipo) => negocios.filter((n) => n.tipo === t && n.estado === 'abierto').length;

  const esperandoFirmas = abiertos.filter((n) => n.firmas?.[n.etapa]?.operacion && n.firmas[n.etapa].estado !== 'firmado').length;
  const vencidas = abiertos.filter((n) => n.vencida).length;
  const ganadosMes = delTipo.filter((n) => n.estado === 'ganado' && (n.cierre || '').slice(0, 7) === hoy().slice(0, 7)).length;

  const soltar = async (e: React.DragEvent, etapa: string) => {
    e.preventDefault(); e.stopPropagation(); setSobre(null);
    const id = e.dataTransfer.getData('text/negocio');
    if (!id) return;
    const r = await negocioMover(id, etapa);
    toast(r.error || r.mensaje || '', r.error ? 5000 : 4500);
  };

  return (
    <Layout
      className="ng-wrap"
      titulo="Negocios"
      ilustracion={{ imagen: 'img/formas/negocios.svg', tinte: '#3d9cf0' }}
      subtitulo="Cada etapa dice qué falta. Arrastra una tarjeta para moverla; cuando un documento queda firmado, el negocio avanza solo."
      acciones={<Boton id="ngNew" icono="plus" onClick={() => nuevoNegocio({ tipo: f.tipo })}>Nuevo negocio</Boton>}
      barra={<>
        <Tabs id="ngTipo" dato="t" etiqueta="Tipo de negocio" valor={f.tipo} alCambiar={(tipo) => negocioSetFiltros({ tipo })}
          opciones={[['venta', 'Ventas', cuenta('venta')], ['arriendo', 'Arriendos', cuenta('arriendo')]]} />
        <Buscador kit id="ngQ" valor={f.q} alCambiar={(q) => negocioSetFiltros({ q })} espera={180} placeholder="Buscar por propiedad, cliente o RUT" />
        <Tabs id="ngVer" dato="v" etiqueta="Abiertos o cerrados" valor={f.ver} alCambiar={(ver) => negocioSetFiltros({ ver })}
          opciones={[['abiertos', 'Abiertos'], ['cerrados', 'Cerrados']]} />
      </>}
    >
      {error && <p role="alert" className="tw:text-red-softink">No se pudieron leer los negocios: {error}</p>}

      {cargado && (
        <>
          <div className="ng-kpis">
            <Kpi icono="briefcase" valor={abiertos.length} texto="negocios abiertos" />
            <Kpi icono="sign" valor={esperandoFirmas} texto="esperando firmas" />
            <Kpi icono="clock" valor={vencidas} texto="acciones vencidas" alerta={vencidas > 0} />
            <Kpi icono="check" valor={ganadosMes} texto="cerrados este mes" />
            <Kpi icono="coins" valor={montos(sumar(abiertos))} texto="comisión en curso" />
          </div>

          {f.ver === 'abiertos' ? (
            <div className="ng-board">
              {(etapas[f.tipo] || []).map((e, i) => {
                const enEtapa = lista.filter((n) => n.etapa === e.id);
                return (
                  <section key={e.id} className={`ng-col${sobre === e.id ? ' sobre' : ''}`} data-e={e.id}
                    onDragOver={(ev) => { if ([...ev.dataTransfer.types].includes('text/negocio')) { ev.preventDefault(); setSobre(e.id); } }}
                    onDragLeave={() => setSobre((s) => (s === e.id ? null : s))}
                    onDrop={(ev) => soltar(ev, e.id)}>
                    <header>
                      <span className="ng-num">{i + 1}</span><b>{e.t}</b><i>{enEtapa.length}</i>
                      {e.firma && <span className="ng-req" title={`Requiere firma: ${e.firma}`}><Icono nombre="sign" tam={12} /></span>}
                    </header>
                    <div className="ng-drop">
                      {enEtapa.length
                        ? enEtapa.map((n) => <NegocioCard key={n.id} n={n} alAbrir={() => abrirNegocio(n.id)} />)
                        : <EstadoVacio compacto className="tw:my-6 tw:mx-1.5 tw:text-center"
                            texto={i === 0 ? 'Crea un negocio o arrastra uno aquí' : 'Sin negocios'} />}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="ng-cerrados">
              {lista.length
                ? lista.map((n) => <NegocioCard key={n.id} n={n} alAbrir={() => abrirNegocio(n.id)} />)
                : <Card className="tw:col-span-full"><EstadoVacio icono="briefcase" texto="No hay negocios cerrados todavía." /></Card>}
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
