// Pestaña «Interesados»: la bandeja única de consultas de los portales, con filtro, búsqueda,
// responder (WhatsApp o correo), cambiar estado y agendar visita.
// Los id pbFl, pbQ, pbAdd y la clase pb-ld los usa test/publicaciones-e2e.js.
import Buscador from '../../ui/Buscador';
import Icono from '../../ui/Icono';
import { agendarVisitaInteresado, agregarInteresado, toast } from '../../../utils/app';
import { usePublicacion } from '../../../store/hooks/usePublicacion.hook';
import { hace } from './comun';
import type { IInteresado, TInteresadoEstado } from '../../../store/interfaces/publicacion.interface';

const LST: Record<TInteresadoEstado, string> = { nuevo: 'Nuevos', contactado: 'Contactados', visita: 'Con visita', descartado: 'Descartados' };
const UNO: Record<TInteresadoEstado, string> = { nuevo: 'Nuevo', contactado: 'Contactado', visita: 'Visita', descartado: 'Descartado' };

const aviso = (r: { mensaje?: string; error?: string }) => { if (r.error) toast(r.error, 5000); else if (r.mensaje) toast(r.mensaje); };

function Fila({ l }: { l: IInteresado }) {
  const { interesadoSetEstado, interesadoResponder } = usePublicacion();
  return (
    <article className={`pb-ld ${l.estado}`} data-prop={l.propId} data-lead={l.id}>
      <span className="ga-av">{(l.nombre || '?').trim()[0] || '?'}</span>
      <div className="pb-ldt">
        <b>{l.nombre || 'Sin nombre'}</b>
        <small>{l.portal || ''} · {l.canalTxt || l.canal || ''} · {hace(l.fecha || l.recibido)}</small>
        <span className="pb-ldp"><Icono nombre="house" tam={12} /> {l.codigo} · {l.titulo}</span>
        {l.mensaje && <p>«{String(l.mensaje).slice(0, 220)}»</p>}
        <small>{[l.telefono, l.email].filter(Boolean).join(' · ')}</small>
      </div>
      <div className="pb-lda">
        <select data-est value={l.estado} onChange={async (e) => aviso(await interesadoSetEstado(l.propId, l.id, e.target.value as TInteresadoEstado))}>
          {(Object.keys(LST) as TInteresadoEstado[]).map((k) => <option key={k} value={k}>{UNO[k]}</option>)}
        </select>
        {l.telefono
          ? <button className="primary small" data-wa onClick={async () => aviso(await interesadoResponder(l.propId, l.id, 'wa', l.codigo))}><Icono nombre="whatsapp" tam={14} /> Responder</button>
          : l.email && <button className="primary small" data-mail onClick={async () => aviso(await interesadoResponder(l.propId, l.id, 'mail', l.codigo))}><Icono nombre="mail" tam={14} /> Responder</button>}
        <button className="secondary small" data-visita
          onClick={() => agendarVisitaInteresado(l, async () => { await interesadoSetEstado(l.propId, l.id, 'visita'); })}>
          <Icono nombre="calendar" tam={14} /> Agendar visita
        </button>
      </div>
    </article>
  );
}

export default function Interesados() {
  const { interesados: r, filtro, q, interesadosSetFiltro } = usePublicacion();
  return (
    <>
      <div className="pb-lbar">
        <div className="im-seg" id="pbFl" role="group" aria-label="Estado">
          {(Object.keys(LST) as TInteresadoEstado[]).map((k) => (
            <button key={k} data-f={k} className={filtro === k ? 'on' : ''} onClick={() => interesadosSetFiltro({ filtro: k })}>{LST[k]} <i>{r?.cuenta[k] || 0}</i></button>
          ))}
          <button data-f="" className={!filtro ? 'on' : ''} onClick={() => interesadosSetFiltro({ filtro: '' })}>Todos</button>
        </div>
        <Buscador id="pbQ" valor={q} alCambiar={(v) => interesadosSetFiltro({ q: v.trim() })} espera={300} placeholder="Buscar por nombre, teléfono o propiedad" />
        <button className="secondary" id="pbAdd" onClick={agregarInteresado}><Icono nombre="plus" tam={14} /> Agregar interesado</button>
      </div>
      {r && (r.interesados.length ? (
        <div className="pb-leads">{r.interesados.map((l) => <Fila key={l.id} l={l} />)}</div>
      ) : (
        <div className="pb-empty">
          <Icono nombre="users" tam={30} />
          <b>{filtro === 'nuevo' ? 'No hay interesados nuevos' : 'Sin interesados en esta vista'}</b>
          <p>Los interesados de Portal Inmobiliario y Chilepropiedades llegan solos al pulsar «Actualizar». Los de TOCTOC o Yapo puedes agregarlos con «Agregar interesado».</p>
        </div>
      ))}
    </>
  );
}
