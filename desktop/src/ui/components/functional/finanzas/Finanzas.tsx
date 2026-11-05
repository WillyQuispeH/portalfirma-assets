// Finanzas: comisiones de los negocios.
//
// El proceso principal ya filtra por perfil: el administrador ve los negocios
// de todo el equipo y el corredor solo los suyos. La comisión de cada negocio
// (comisionMonto) la calcula src/negocios.js y va en la moneda del negocio.
// Hecha con el kit: Layout (cabecera y barra), Boton, Tabs, Kpi, Card, Tabla, Badge y EstadoVacio.
// Las pruebas usan .rx-fin, .ng-kpis, #finTipo/#finPeriodo (data-tab), [data-fin="corredores"] y
// .rx-fin-det con tr[data-id] en cada negocio.
import { useEffect, useMemo, useState } from 'react';
import { useNegocio } from '../../../store/hooks/useNegocio.hook';
import { usePerfil } from '../../../store/hooks/usePerfil.hook';
import { monto, montos, fecha } from '../../../utils/formato';
import { abrirNegocio } from '../../../utils/app';
import Kpi from '../../ui/Kpi';
import Icono from '../../ui/Icono';
import Layout from '../../ui/Layout';
import Boton from '../../ui/Boton';
import Tabs, { type TTabOpcion } from '../../ui/Tabs';
import Card from '../../ui/Card';
import Tabla, { type IColumna } from '../../ui/Tabla';
import Badge from '../../ui/Badge';
import EstadoVacio from '../../ui/EstadoVacio';
import { moneda, nombreCorredor, resumir, sumar, type IFilaCorredor, type TFiltroTipo, type TPeriodo } from './resumen';
import type { INegocio, TNegocioEstado } from '../../../store/interfaces/negocio.interface';
import type { TTono } from '../../ui/tonos';

const TIPOS: TTabOpcion<TFiltroTipo>[] = [['todos', 'Todos'], ['venta', 'Ventas'], ['arriendo', 'Arriendos']];
const PERIODOS: TTabOpcion<TPeriodo>[] = [['mes', 'Este mes'], ['anio', 'Este año'], ['todo', 'Todo']];

const ESTADO: Record<TNegocioEstado, [string, TTono]> = { abierto: ['En curso', 'amarillo'], ganado: ['Ganado', 'verde'], perdido: ['Perdido', 'gris'] };

export default function Finanzas() {
  const { negocios, cargado, cargando, error, negocioGetAll } = useNegocio();
  const { perfil, esAdmin, perfilGet } = usePerfil();
  const [tipo, setTipo] = useState<TFiltroTipo>('todos');
  const [periodo, setPeriodo] = useState<TPeriodo>('mes');

  useEffect(() => { perfilGet(); negocioGetAll(); }, [perfilGet, negocioGetAll]);
  const actualizar = () => { perfilGet(); negocioGetAll(); };

  const r = useMemo(() => resumir(negocios, tipo, periodo, perfil), [negocios, tipo, periodo, perfil]);
  const textoPeriodo = PERIODOS.find(([k]) => k === periodo)![1].toLowerCase();

  const colCorredor: IColumna<IFilaCorredor>[] = [
    { clave: 'nombre', titulo: 'Corredor' },
    { clave: 'negocios', titulo: 'Negocios', alinear: 'derecha', ancho: '110px', render: (c) => <span className="tw:tabular-nums">{c.negocios}</span> },
    { clave: 'ganada', titulo: 'Ganada', alinear: 'derecha', render: (c) => <span className="tw:whitespace-nowrap">{montos(c.ganada)}</span> },
    { clave: 'curso', titulo: 'En curso', alinear: 'derecha', render: (c) => <span className="tw:whitespace-nowrap">{montos(c.curso)}</span> },
  ];
  const colDetalle: IColumna<INegocio>[] = [
    { clave: 'negocio', titulo: 'Negocio', render: (n) => <><b className="tw:font-semibold">{n.titulo}</b>{n.prop?.codigo && <small className="tw:text-muted"> · {n.prop.codigo}</small>}</> },
    { clave: 'tipo', titulo: 'Tipo', render: (n) => (n.tipo === 'venta' ? 'Venta' : 'Arriendo') },
    {
      clave: 'estado', titulo: 'Estado',
      render: (n) => {
        const [et, tono] = ESTADO[n.estado] || [n.estado, 'gris'];
        return <span className="tw:inline-flex tw:flex-wrap tw:items-center tw:gap-1.5">
          <Badge tono={tono}>{et}</Badge>
          <small className="tw:text-muted">{n.estado === 'abierto' ? n.etapaInfo?.t : fecha(n.cierre)}</small>
        </span>;
      },
    },
    ...(esAdmin ? [{ clave: 'corredor', titulo: 'Corredor', render: (n: INegocio) => nombreCorredor(n, perfil) }] : []),
    {
      clave: 'comision', titulo: 'Comisión', alinear: 'derecha',
      render: (n) => <span className="tw:whitespace-nowrap">{n.comisionMonto == null ? <span className="tw:text-muted">Sin definir</span> : monto(n.comisionMonto, moneda(n))}</span>,
    },
  ];

  return (
    <Layout
      className="rx-fin"
      titulo="Finanzas"
      subtitulo={`Comisiones ${esAdmin ? 'de todo el equipo' : 'de tus negocios'}, según las condiciones de cada negocio. Montos + IVA.`}
      acciones={<Boton variante="secundario" onClick={actualizar} cargando={cargando}>Actualizar</Boton>}
      barra={<>
        <Tabs id="finTipo" etiqueta="Tipo de negocio" opciones={TIPOS} valor={tipo} alCambiar={setTipo} />
        <Tabs id="finPeriodo" etiqueta="Período" opciones={PERIODOS} valor={periodo} alCambiar={setPeriodo} />
      </>}
    >
      {cargando && !cargado && <EstadoVacio compacto texto="Cargando los negocios…" />}
      {error && <p role="alert" className="tw:text-red-softink">No se pudieron leer los negocios: {error}</p>}

      {cargado && (
        <>
          <div className="ng-kpis">
            <Kpi icono="check" valor={montos(sumar(r.ganados))} texto={`ganada (${textoPeriodo})`} />
            <Kpi icono="coins" valor={montos(sumar(r.abiertos))} texto="en curso" />
            <Kpi icono="x" valor={montos(sumar(r.perdidos))} texto={`perdida (${textoPeriodo})`} />
            <Kpi icono="clock" valor={r.sinComision} texto="negocios sin comisión definida" alerta={r.sinComision > 0} />
          </div>

          {esAdmin && r.porCorredor.length > 0 && (
            <div data-fin="corredores">
              <Card titulo="Por corredor" relleno={false}>
                <Tabla columnas={colCorredor} filas={r.porCorredor} claveFila={(c) => c.nombre} />
              </Card>
            </div>
          )}

          <Card titulo="Detalle" relleno={false}>
            {r.visibles.length === 0 ? (
              <EstadoVacio icono="coins" texto={`No hay negocios ${periodo === 'todo' ? '' : `cerrados ${textoPeriodo} ni `}en curso.`} />
            ) : (
              <Tabla className="rx-fin-det" columnas={colDetalle} filas={r.visibles} claveFila={(n) => n.id}
                alTocarFila={(n) => abrirNegocio(n.id)} atributosFila={(n) => ({ 'data-id': n.id, title: 'Abrir el negocio' })} />
            )}
          </Card>

          <Card>
            <div className="tw:flex tw:items-start tw:gap-3">
              <span className="tw:text-muted"><Icono nombre="coins" tam={18} /></span>
              <div>
                <b>Próximamente: facturación y contabilidad</b>
                <p className="tw:mt-1 tw:mb-0 tw:text-[13px] tw:text-muted">Facturas y boletas por comisión y administración, emitidas desde aquí. Cada cobro, pago y liquidación generará su asiento contable.</p>
              </div>
            </div>
          </Card>
        </>
      )}
    </Layout>
  );
}
