// Las conversaciones guardadas del Agente (columna izquierda a pantalla completa): nueva, buscar, abrir,
// fijar, renombrar y borrar. Los id agNewC, agConvQ, agConvs y data-c los usan las pruebas.
import Buscador from '../../ui/Buscador';
import Icono from '../../ui/Icono';
import { useAgente } from '../../../store/hooks/useAgente.hook';
import { borrarConversacion, renombrarConversacion } from '../../../utils/app';
import { Fragment } from 'react';
import { abrirConv, buscarConvs, fijarConv, nueva } from './controlador';
import type { IConversacion } from '../../../store/interfaces/agente.interface';

const grupo = (c: IConversacion) => {
  if (c.fijada) return 'Fijadas';
  const t = Date.now() - new Date(c.actualizado).getTime();
  return t < 864e5 && new Date(c.actualizado).toDateString() === new Date().toDateString() ? 'Hoy' : t < 7 * 864e5 ? 'Esta semana' : 'Anteriores';
};
function cuando(iso: string) {
  const d = new Date(iso); const h = new Date();
  const dd = Math.floor((new Date(h.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 864e5);
  return dd <= 0 ? d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : dd === 1 ? 'Ayer' : dd < 7 ? `Hace ${dd} días` : d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
}

export default function Conversaciones() {
  const { convs, conv, q } = useAgente();
  let g0 = '';
  return (
    <>
      <button className="ag-newc" id="agNewC" onClick={nueva}><Icono nombre="plus" tam={15} /><span>Nueva conversación</span></button>
      <Buscador id="agConvQ" clase="ag-cq" valor={q} alCambiar={buscarConvs} espera={200} placeholder="Buscar conversaciones" />
      <div className="ag-cl" id="agConvs">
        {convs.length ? convs.map((c) => {
          const g = grupo(c); const titulo = g !== g0; g0 = g;
          return (
            <Fragment key={c.id}>
              {titulo && <h5>{g}</h5>}
              <div className={`ag-ci ${conv?.id === c.id ? 'on' : ''}`} data-c={c.id}>
                <button className="ag-cit" data-abrir onClick={() => abrirConv(c.id)}><b>{c.titulo || 'Conversación'}</b><small>{cuando(c.actualizado)}{c.resumen ? ' · ' + c.resumen : ''}</small></button>
                <span className="ag-cia">
                  <button data-fijar title={c.fijada ? 'Quitar de fijadas' : 'Fijar arriba'} className={c.fijada ? 'on' : ''} onClick={() => fijarConv(c.id, !c.fijada)}><Icono nombre="bookmark" tam={13} /></button>
                  <button data-ren title="Cambiar nombre" onClick={() => renombrarConversacion(c)}><Icono nombre="edit" tam={13} /></button>
                  <button data-del title="Eliminar" onClick={() => borrarConversacion(c)}><Icono nombre="trash" tam={13} /></button>
                </span>
              </div>
            </Fragment>
          );
        }) : <p className="ag-cvac">{q ? 'Sin resultados.' : 'Aquí quedan tus conversaciones para retomarlas cuando quieras.'}</p>}
      </div>
    </>
  );
}
