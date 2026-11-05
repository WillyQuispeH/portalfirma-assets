// Pestaña «Interesados»: la bandeja única de consultas de los portales, con filtro, búsqueda,
// responder (WhatsApp o correo), cambiar estado y agendar visita.
// Los id pbFl (con data-f en cada estado), pbQ, pbAdd y la clase pb-ld los usa test/publicaciones-e2e.js.
// Con el kit: Tabs, Buscador, Boton, Select, Card y EstadoVacio; la fila conserva .pb-ld de styles.css con el borde de una Card.
import Buscador from '../../ui/Buscador';
import Icono from '../../ui/Icono';
import Boton from '../../ui/Boton';
import Select from '../../ui/Select';
import Card from '../../ui/Card';
import Tabs, { type TTabOpcion } from '../../ui/Tabs';
import EstadoVacio from '../../ui/EstadoVacio';
import { agendarVisitaInteresado, agregarInteresado, toast } from '../../../utils/app';
import { usePublicacion } from '../../../store/hooks/usePublicacion.hook';
import { BORDE_CARD, hace } from './comun';
import type { IInteresado, TInteresadoEstado } from '../../../store/interfaces/publicacion.interface';

const LST: Record<TInteresadoEstado, string> = { nuevo: 'Nuevos', contactado: 'Contactados', visita: 'Con visita', descartado: 'Descartados' };
const UNO: Record<TInteresadoEstado, string> = { nuevo: 'Nuevo', contactado: 'Contactado', visita: 'Visita', descartado: 'Descartado' };

const aviso = (r: { mensaje?: string; error?: string }) => { if (r.error) toast(r.error, 5000); else if (r.mensaje) toast(r.mensaje); };

function Fila({ l }: { l: IInteresado }) {
  const { interesadoSetEstado, interesadoResponder } = usePublicacion();
  return (
    <article className={`pb-ld ${l.estado} ${BORDE_CARD}`} data-prop={l.propId} data-lead={l.id}>
      <span className="ga-av">{(l.nombre || '?').trim()[0] || '?'}</span>
      <div className="pb-ldt">
        <b>{l.nombre || 'Sin nombre'}</b>
        <small>{l.portal || ''} · {l.canalTxt || l.canal || ''} · {hace(l.fecha || l.recibido)}</small>
        <span className="pb-ldp"><Icono nombre="house" tam={12} /> {l.codigo} · {l.titulo}</span>
        {l.mensaje && <p>«{String(l.mensaje).slice(0, 220)}»</p>}
        <small>{[l.telefono, l.email].filter(Boolean).join(' · ')}</small>
      </div>
      <div className="pb-lda">
        <Select data-est aria-label="Estado" className="tw:h-8 tw:text-[12.5px]" value={l.estado}
          onChange={async (e) => aviso(await interesadoSetEstado(l.propId, l.id, e.target.value as TInteresadoEstado))}
          opciones={(Object.keys(LST) as TInteresadoEstado[]).map((k): [string, string] => [k, UNO[k]])} />
        {l.telefono
          ? <Boton tamano="sm" icono="whatsapp" data-wa onClick={async () => aviso(await interesadoResponder(l.propId, l.id, 'wa', l.codigo))}>Responder</Boton>
          : l.email && <Boton tamano="sm" icono="mail" data-mail onClick={async () => aviso(await interesadoResponder(l.propId, l.id, 'mail', l.codigo))}>Responder</Boton>}
        <Boton variante="secundario" tamano="sm" icono="calendar" data-visita
          onClick={() => agendarVisitaInteresado(l, async () => { await interesadoSetEstado(l.propId, l.id, 'visita'); })}>
          Agendar visita
        </Boton>
      </div>
    </article>
  );
}

export default function Interesados() {
  const { interesados: r, filtro, q, interesadosSetFiltro } = usePublicacion();
  const estados: TTabOpcion<TInteresadoEstado | ''>[] = [
    ...(Object.keys(LST) as TInteresadoEstado[]).map((k): TTabOpcion<TInteresadoEstado> => [k, LST[k], r?.cuenta[k] || 0]),
    ['', 'Todos'],
  ];
  return (
    <>
      <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-3">
        <Tabs id="pbFl" dato="f" etiqueta="Estado" opciones={estados} valor={filtro} alCambiar={(f) => interesadosSetFiltro({ filtro: f })}
          className="tw:max-w-full tw:overflow-x-auto" />
        <Buscador kit id="pbQ" className="tw:flex-1 tw:min-w-[220px]" valor={q} alCambiar={(v) => interesadosSetFiltro({ q: v.trim() })} espera={300} placeholder="Buscar por nombre, teléfono o propiedad" />
        <Boton variante="secundario" id="pbAdd" icono="plus" onClick={agregarInteresado}>Agregar interesado</Boton>
      </div>
      {r && (r.interesados.length ? (
        <div className="pb-leads">{r.interesados.map((l) => <Fila key={l.id} l={l} />)}</div>
      ) : (
        <Card relleno={false}>
          <EstadoVacio className="pb-empty tw:bg-transparent tw:border-0 tw:rounded-none" icono="users"
            titulo={filtro === 'nuevo' ? 'No hay interesados nuevos' : 'Sin interesados en esta vista'}
            texto="Los interesados de Portal Inmobiliario y Chilepropiedades llegan solos al pulsar «Actualizar». Los de TOCTOC o Yapo puedes agregarlos con «Agregar interesado»." />
        </Card>
      ))}
    </>
  );
}
