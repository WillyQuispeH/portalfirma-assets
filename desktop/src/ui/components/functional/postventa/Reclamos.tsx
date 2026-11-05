// Pestaña «Reclamos»: la lista (con las conversaciones de WhatsApp en curso arriba) y el detalle del elegido.
// El detalle y su «¿Qué sigue?» siguen en src/renderer/postventa.js, en #pvDet: React deja ese contenedor
// vacío y le avisa qué mostrar (mostrarReclamo / verConversacion). Clases pv-row, data-chat los usan las pruebas.
// Con el kit: Buscador y Tabs; la lista y el detalle conservan .pv-lista y .pv-det (styles.css) con el borde de una Card.
import { useEffect } from 'react';
import Buscador from '../../ui/Buscador';
import Icono from '../../ui/Icono';
import Tabs from '../../ui/Tabs';
import { cx } from '../../../utils/cx';
import { usePostventa } from '../../../store/hooks/usePostventa.hook';
import { mostrarReclamo, verConversacion } from '../../../utils/app';
import { BORDE_CARD, hora } from './comun';
import type { TPvFiltro } from '../../../store/interfaces/postventa.interface';

const FILTROS: [TPvFiltro, string][] = [['abiertos', 'Abiertos'], ['triage', 'Por revisar'], ['todos', 'Todos']];

export default function Reclamos() {
  const { reclamos, chats, sel, filtro, q, reclamosSetFiltro, pvSeleccionar } = usePostventa();
  const enCurso = chats.filter((c) => c.enCurso);

  // cada vez que cambia el elegido o la lista, postventa.js dibuja el detalle (o la conversación)
  useEffect(() => {
    if (!reclamos) return;
    if (sel?.startsWith('chat:')) { const c = enCurso.find((x) => 'chat:' + x.id === sel); if (c) verConversacion(c); }
    else mostrarReclamo(sel);
  }, [reclamos, chats, sel]); // eslint-disable-line react-hooks/exhaustive-deps -- enCurso sale de chats

  return (
    <div className="pv-cols">
      <div className={cx('pv-lista', BORDE_CARD)}>
        <div className="pv-fil">
          <Buscador kit id="pvQ" className="tw:w-full" valor={q} alCambiar={(v) => reclamosSetFiltro({ q: v })} espera={250} placeholder="Folio, unidad, propietario o falla" />
          <Tabs dato="f" etiqueta="Reclamos" opciones={FILTROS} valor={filtro} alCambiar={(k) => reclamosSetFiltro({ filtro: k })} />
        </div>
        {enCurso.length > 0 && (
          <>
            <h5 className="pv-curso"><Icono nombre="whatsapp" tam={12} /> En conversación por WhatsApp ({enCurso.length})</h5>
            {enCurso.map((c) => {
              const m = c.ultimoIn || c.ultimo; const t = m?.texto || (m?.fotos?.length ? 'Envió fotos' : '');
              return (
                <button key={c.id} className={`pv-row conv ${sel === 'chat:' + c.id ? 'on' : ''}`} data-chat={c.id} onClick={() => pvSeleccionar('chat:' + c.id)}>
                  <span className="pv-rt"><b>{c.nombre || c.telefono || 'Contacto'}</b><small>{c.unidad || c.telefono || ''}</small>{t && <small>«{String(t).slice(0, 70)}»</small>}</span>
                  <span className="pv-rr"><i className="pv-e conv">{c.pasoTxt}</i><small>{hora(c.actualizado)}</small></span>
                </button>
              );
            })}
            <h5 className="pv-curso">Reclamos</h5>
          </>
        )}
        {reclamos && (reclamos.length ? reclamos.map((r) => (
          <button key={r.id} className={`pv-row ${r.id === sel ? 'on' : ''}`} data-r={r.id} onClick={() => pvSeleccionar(r.id)}>
            <span className="pv-rt">
              <b>{r.folio}{r.urgente && <> <i className="pv-urg">Urgente</i></>}</b>
              <small>{r.unidad?.nombre || 'Sin unidad'} · {r.unidad?.propietario?.nombre || r.contacto?.nombre || ''}</small>
              <small>{r.items[0]?.tipoTxt || ''}{r.items[0]?.recinto ? ' · ' + r.items[0].recinto : ''}: {String(r.items[0]?.descripcion || '').slice(0, 70)}</small>
            </span>
            <span className="pv-rr"><i className={`pv-e ${r.estado}`}>{r.estadoTxt}</i><small>{r.canal === 'whatsapp' && <Icono nombre="whatsapp" tam={12} />} {r.dias === 0 ? 'hoy' : r.dias + ' d'}</small></span>
          </button>
        )) : (
          <p className="muted pv-vac">{q ? 'No hay reclamos con esta búsqueda.' : filtro === 'triage' ? 'No hay reclamos por revisar.' : `Aún no hay reclamos${filtro === 'abiertos' ? ' abiertos' : ''}. Llegan solos por WhatsApp o créalos con «Nuevo reclamo».`}</p>
        ))}
      </div>
      {/* lo llena src/renderer/postventa.js (detalle y «¿Qué sigue?»): React no dibuja dentro */}
      <div className={cx('pv-det', BORDE_CARD)} id="pvDet" />
    </div>
  );
}
