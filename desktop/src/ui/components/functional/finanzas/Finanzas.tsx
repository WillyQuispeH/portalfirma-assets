// Finanzas: comisiones de los negocios.
//
// El proceso principal ya filtra por perfil: el administrador ve los negocios
// de todo el equipo y el corredor solo los suyos. La comisión de cada negocio
// (comisionMonto) la calcula src/negocios.js y va en la moneda del negocio.
import { useEffect, useMemo, useState } from 'react';
import { useNegocio } from '../../../store/hooks/useNegocio.hook';
import { usePerfil } from '../../../store/hooks/usePerfil.hook';
import { monto, montos, fecha } from '../../../utils/formato';
import { abrirNegocio } from '../../../utils/app';
import Kpi from '../../ui/Kpi';
import Icono from '../../ui/Icono';
import Segmentos from '../../ui/Segmentos';
import { moneda, nombreCorredor, resumir, sumar, type TFiltroTipo, type TPeriodo } from './resumen';
import type { TNegocioEstado } from '../../../store/interfaces/negocio.interface';

const TIPOS: [TFiltroTipo, string][] = [['todos', 'Todos'], ['venta', 'Ventas'], ['arriendo', 'Arriendos']];
const PERIODOS: [TPeriodo, string][] = [['mes', 'Este mes'], ['anio', 'Este año'], ['todo', 'Todo']];
// Clases de las tablas (Tailwind). La última columna (montos) va a la derecha.
const TH = 'tw:text-left tw:font-semibold tw:text-muted tw:px-2.5 tw:py-2 tw:border-b tw:border-line tw:last:text-right';
const TD = 'tw:p-2.5 tw:align-middle tw:border-b tw:border-line tw:last:text-right tw:last:whitespace-nowrap';
const TABLA = 'tw:w-full tw:border-collapse tw:text-sm';
const CAJA = 'im-box tw:mt-4';

const ESTADO: Record<TNegocioEstado, [string, string]> = { abierto: ['En curso', 'res'], ganado: ['Ganado', 'ok'], perdido: ['Perdido', 'off'] };

export default function Finanzas() {
  const { negocios, cargado, cargando, error, negocioGetAll } = useNegocio();
  const { perfil, esAdmin, perfilGet } = usePerfil();
  const [tipo, setTipo] = useState<TFiltroTipo>('todos');
  const [periodo, setPeriodo] = useState<TPeriodo>('mes');

  useEffect(() => { perfilGet(); negocioGetAll(); }, [perfilGet, negocioGetAll]);
  const actualizar = () => { perfilGet(); negocioGetAll(); };

  const r = useMemo(() => resumir(negocios, tipo, periodo, perfil), [negocios, tipo, periodo, perfil]);
  const textoPeriodo = PERIODOS.find(([k]) => k === periodo)![1].toLowerCase();

  return (
    <div className="im-wrap rx-fin">
      <div className="im-head">
        <div>
          <h1>Finanzas</h1>
          <p className="muted">
            Comisiones {esAdmin ? 'de todo el equipo' : 'de tus negocios'}, según las condiciones de cada negocio. Montos + IVA.
          </p>
        </div>
        <button className="secondary" onClick={actualizar} disabled={cargando}>Actualizar</button>
      </div>

      <div className="im-bar tw:flex-wrap tw:gap-3">
        <Segmentos etiqueta="Tipo de negocio" opciones={TIPOS} valor={tipo} alCambiar={setTipo} />
        <Segmentos etiqueta="Período" opciones={PERIODOS} valor={periodo} alCambiar={setPeriodo} />
      </div>

      {cargando && !cargado && <p className="muted">Cargando los negocios…</p>}
      {error && <p className="error">No se pudieron leer los negocios: {error}</p>}

      {cargado && (
        <>
          <div className="ng-kpis">
            <Kpi icono="check" valor={montos(sumar(r.ganados))} texto={`ganada (${textoPeriodo})`} />
            <Kpi icono="coins" valor={montos(sumar(r.abiertos))} texto="en curso" />
            <Kpi icono="x" valor={montos(sumar(r.perdidos))} texto={`perdida (${textoPeriodo})`} />
            <Kpi icono="clock" valor={r.sinComision} texto="negocios sin comisión definida" alerta={r.sinComision > 0} />
          </div>

          {esAdmin && r.porCorredor.length > 0 && (
            <div className={CAJA}>
              <div className="im-bh"><h3>Por corredor</h3></div>
              <table className={TABLA}>
                <thead><tr>{['Corredor', 'Negocios', 'Ganada', 'En curso'].map((t) => <th key={t} className={TH}>{t}</th>)}</tr></thead>
                <tbody>
                  {r.porCorredor.map((c) => (
                    <tr key={c.nombre} className="tw:last:[&>td]:border-b-0"><td className={TD}>{c.nombre}</td><td className={TD}>{c.negocios}</td><td className={TD}>{montos(c.ganada)}</td><td className={TD}>{montos(c.curso)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className={CAJA}>
            <div className="im-bh"><h3>Detalle</h3></div>
            {r.visibles.length === 0 ? (
              <p className="muted">No hay negocios {periodo === 'todo' ? '' : `cerrados ${textoPeriodo} ni `}en curso.</p>
            ) : (
              <table className={`rx-fin-det ${TABLA}`}>
                <thead><tr>{['Negocio', 'Tipo', 'Estado', ...(esAdmin ? ['Corredor'] : []), 'Comisión'].map((t) => <th key={t} className={TH}>{t}</th>)}</tr></thead>
                <tbody>
                  {r.visibles.map((n) => {
                    const [et, cls] = ESTADO[n.estado] || [n.estado, ''];
                    return (
                      <tr key={n.id} data-id={n.id} title="Abrir el negocio" className="tw:cursor-pointer tw:hover:bg-text/4 tw:last:[&>td]:border-b-0" onClick={() => abrirNegocio(n.id)}>
                        <td className={TD}><b>{n.titulo}</b>{n.prop?.codigo && <small className="muted"> · {n.prop.codigo}</small>}</td>
                        <td className={TD}>{n.tipo === 'venta' ? 'Venta' : 'Arriendo'}</td>
                        <td className={TD}>
                          <span className={`im-st ${cls}`}>{et}</span>
                          <small className="muted"> {n.estado === 'abierto' ? n.etapaInfo?.t : fecha(n.cierre)}</small>
                        </td>
                        {esAdmin && <td className={TD}>{nombreCorredor(n, perfil)}</td>}
                        <td className={TD}>{n.comisionMonto == null ? <span className="muted">Sin definir</span> : monto(n.comisionMonto, moneda(n))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className={`${CAJA} tw:flex tw:items-start tw:gap-3`}>
            <Icono nombre="coins" tam={18} />
            <div>
              <b>Próximamente: facturación y contabilidad</b>
              <p className="muted small tw:mt-1 tw:mb-0">Facturas y boletas por comisión y administración, emitidas desde aquí. Cada cobro, pago y liquidación generará su asiento contable.</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
