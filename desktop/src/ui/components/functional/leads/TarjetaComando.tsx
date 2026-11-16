// Lo que muestra el chat de Leads para los comandos: el menú «/» sobre la caja de respuesta y la tarjeta privada con
// el resultado (solo la ve el corredor; no es un mensaje del lead).
import { useState, type FormEvent } from 'react';
import { cx } from '../../../utils/cx';
import Boton from '../../ui/Boton';
import Icono from '../../ui/Icono';
import type { IAccionTarjeta, ITarjeta } from './comandos';

export function MenuComandos({ items, activo, alElegir }: { items: { nombre: string; ayuda: string }[]; activo: number; alElegir: (nombre: string) => void }) {
  if (!items.length) return null;
  return (
    <ul id="ldCmdMenu" role="listbox" className="tw:m-0 tw:mb-1 tw:p-1 tw:list-none tw:max-h-56 tw:overflow-y-auto tw:rounded-card tw:border tw:border-solid tw:border-edge tw:bg-card tw:shadow-[0_4px_14px_rgba(0,0,0,.12)]">
      {items.map((s, i) => (
        <li key={s.nombre} role="option" aria-selected={i === activo}
          onMouseDown={(e) => { e.preventDefault(); alElegir(s.nombre); }}
          className={cx('tw:flex tw:items-baseline tw:gap-2 tw:px-2.5 tw:py-1.5 tw:rounded-control tw:cursor-pointer tw:text-[13px]', i === activo && 'tw:bg-lav-soft')}>
          <b className="tw:shrink-0">/{s.nombre}</b>
          <span className="tw:truncate tw:text-[12px] tw:text-muted">{s.ayuda}</span>
        </li>
      ))}
    </ul>
  );
}

const CAMPO = 'tw:w-full tw:m-0 tw:px-3 tw:py-2 tw:rounded-card tw:border tw:border-solid tw:border-edge tw:bg-card tw:text-[13px] tw:leading-snug tw:text-text tw:font-[inherit] tw:focus:outline-none tw:focus:border-lav-edge';

/** el formulario de una tarjeta (nota, plantilla nueva): los errores se muestran aquí mismo */
function Formulario({ f, alGuardar, alCancelar }: { f: NonNullable<ITarjeta['form']>; alGuardar: (v: Record<string, string>) => Promise<void>; alCancelar: () => void }) {
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(f.campos.map((c) => [c.id, c.valor || ''])));
  const [error, setError] = useState(''); const [guardando, setGuardando] = useState(false);
  const enviar = async (e?: FormEvent) => {
    e?.preventDefault(); if (guardando) return;
    setGuardando(true); setError('');
    try { await alGuardar(v); } catch (x) { setError((x as Error).message); setGuardando(false); }
  };
  return (
    <form onSubmit={(e) => void enviar(e)} className="ld-cmd-form tw:flex tw:flex-col tw:gap-2">
      {f.campos.map((c, i) => (
        <label key={c.id} className="tw:flex tw:flex-col tw:gap-1 tw:text-[12px] tw:font-semibold tw:text-muted">
          {c.etiqueta}
          {c.area
            ? <textarea id={`ldCmd_${c.id}`} rows={3} autoFocus={i === 0 || undefined} value={v[c.id]} placeholder={c.placeholder} onChange={(e) => setV({ ...v, [c.id]: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void enviar(); } }} className={cx(CAMPO, 'tw:resize-y tw:font-normal')} />
            : <input id={`ldCmd_${c.id}`} type="text" autoFocus={i === 0 || undefined} value={v[c.id]} placeholder={c.placeholder} onChange={(e) => setV({ ...v, [c.id]: e.target.value })} className={cx(CAMPO, 'tw:font-normal')} />}
        </label>
      ))}
      {error && <p role="alert" className="tw:m-0 tw:text-[12px] tw:text-red-softink">{error}</p>}
      <div className="tw:flex tw:items-center tw:gap-2">
        <span className="tw:mr-auto tw:text-[11px] tw:text-muted">Ctrl+Enter guarda</span>
        <Boton variante="secundario" tamano="sm" onClick={alCancelar}>Cancelar</Boton>
        <Boton id="ldCmdGuardar" tamano="sm" cargando={guardando} onClick={() => void enviar()}>{f.boton}</Boton>
      </div>
    </form>
  );
}

interface ITarjetaProps { t: ITarjeta; alAccion: (a: IAccionTarjeta) => void; alGuardar: (v: Record<string, string>) => Promise<void>; alCerrar: () => void }
export function Tarjeta({ t, alAccion, alGuardar, alCerrar }: ITarjetaProps) {
  return (
    <div className={cx('ld-cmd tw:self-stretch tw:flex tw:flex-col tw:gap-2 tw:my-1 tw:px-3 tw:py-2.5 tw:rounded-control tw:border tw:border-dashed tw:text-[13px]',
      t.error ? 'tw:border-red-edge tw:bg-card' : 'tw:border-lav-edge tw:bg-lav-soft')}>
      <div className="tw:flex tw:items-center tw:gap-1.5 tw:text-[11.5px] tw:font-bold tw:text-lav-softink">
        <Icono nombre={t.error ? 'alert' : 'sparkle'} tam={12} /> <span className="tw:flex-1 tw:truncate">{t.titulo}</span>
        <span className="tw:font-normal tw:text-muted">Solo tú lo ves</span>
        <button type="button" aria-label="Cerrar" onClick={alCerrar} className="tw:border-0 tw:bg-transparent tw:cursor-pointer tw:text-muted tw:p-0.5"><Icono nombre="x" tam={12} /></button>
      </div>
      {t.texto && <span className="tw:whitespace-pre-wrap tw:break-words">{t.texto}</span>}
      {t.items?.map((it, i) => (
        <div key={i} className="tw:flex tw:items-center tw:gap-2.5 tw:p-2 tw:rounded-card tw:bg-card">
          {it.foto && <img src={it.foto} alt="" loading="lazy" className="tw:w-14 tw:h-14 tw:shrink-0 tw:rounded-icono tw:object-cover" />}
          <div className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col">
            <b className="tw:truncate">{it.titulo}</b>
            {it.detalle && <span className="tw:text-[12px] tw:text-muted tw:whitespace-pre-wrap tw:break-words">{it.detalle}</span>}
          </div>
          {it.acciones?.map((a) => <Boton key={a.texto} variante="secundario" tamano="sm" onClick={() => alAccion(a)}>{a.texto}</Boton>)}
        </div>
      ))}
      {t.form && <Formulario f={t.form} alGuardar={alGuardar} alCancelar={alCerrar} />}
      {!!t.acciones?.length && <div className="tw:flex tw:flex-wrap tw:justify-end tw:gap-1.5">{t.acciones.map((a) => <Boton key={a.texto} variante="secundario" tamano="sm" onClick={() => alAccion(a)}>{a.texto}</Boton>)}</div>}
    </div>
  );
}
