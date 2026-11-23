// modal-154: «Ordenar fotos». Lista con una fila por foto: el corredor arrastra las filas (la lista se desplaza sola al llegar
// al borde) o usa las flechas, y elige la portada: la primera es la que ven los portales y la que abre la ficha.
// Al guardar se manda el mismo conjunto de fotos en el nuevo orden (no se quita ninguna).
// Se abre con abrirOrdenarFotos(fotos). Los id (#oFotos, #mCancel, #mOk) los usan las pruebas.
import { useRef, useState } from 'react';
import Boton from '../../ui/Boton';
import Icono from '../../ui/Icono';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../ui/Ventana';
import { useFicha } from '../../../store/hooks/useFicha.hook';
import { toast } from '../../../utils/app';
import { abrirModal, cerrarModal } from '../../../utils/modal';

function mover<T>(l: T[], de: number, a: number): T[] {
  if (de === a || a < 0 || a >= l.length) return l;
  const r = [...l]; const [x] = r.splice(de, 1); r.splice(a, 0, x);
  return r;
}

const BORDE = 60; // px del borde de la lista donde empieza a desplazarse al arrastrar
const VELOCIDAD = 18; // px por cada aviso del navegador (~ cada 50 ms)

const btnIcono = 'tw:grid tw:size-8 tw:shrink-0 tw:cursor-pointer tw:place-items-center tw:rounded-full tw:border-0 tw:bg-transparent tw:text-muted tw:hover:bg-black/5 tw:disabled:cursor-default tw:disabled:opacity-30';

export function OrdenarFotos({ fotos }: { fotos: string[] }) {
  const { fichaOrdenarFotos } = useFicha();
  const [orden, setOrden] = useState<string[]>(fotos);
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const [sobre, setSobre] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  const lista = useRef<HTMLDivElement>(null);
  const cambio = orden.some((u, i) => u !== fotos[i]);

  // al arrastrar cerca del borde de arriba o de abajo, la lista se desplaza sola
  const desplazar = (y: number) => {
    const el = lista.current; if (!el) return;
    const { top, bottom } = el.getBoundingClientRect();
    if (y < top + BORDE) el.scrollTop -= VELOCIDAD * Math.min(1, (top + BORDE - y) / BORDE + 0.3);
    else if (y > bottom - BORDE) el.scrollTop += VELOCIDAD * Math.min(1, (y - (bottom - BORDE)) / BORDE + 0.3);
  };
  const fin = () => { setArrastrando(null); setSobre(null); };
  const soltar = (a: number) => { if (arrastrando != null) setOrden((l) => mover(l, arrastrando, a)); fin(); };
  const guardar = async () => {
    setGuardando(true);
    const r = await fichaOrdenarFotos(orden);
    setGuardando(false);
    if (r.error) return toast(r.error, 5000);
    cerrarModal(); toast('Fotos ordenadas.');
  };

  return <>
    <VentanaCabecera icono="image" titulo="Ordenar fotos" descripcion={`${orden.length} fotos · arrástralas o usa las flechas. La primera es la portada.`} />
    <VentanaCuerpo sinRelleno>
      <div id="oFotos" ref={lista} className="tw:max-h-[60vh] tw:overflow-y-auto tw:px-2 tw:py-1"
        onDragOver={(e) => { e.preventDefault(); desplazar(e.clientY); }}>
        {orden.map((u, i) => (
          <div key={u} data-i={i} draggable
            onDragStart={() => setArrastrando(i)} onDragEnd={fin}
            onDragOver={(e) => { e.preventDefault(); if (sobre !== i) setSobre(i); }} onDrop={(e) => { e.preventDefault(); soltar(i); }}
            className={`tw:flex tw:cursor-grab tw:items-center tw:gap-3 tw:rounded-lg tw:px-2 tw:py-1.5 tw:hover:bg-black/[.03] ${arrastrando === i ? 'tw:opacity-40' : ''} ${sobre === i && arrastrando != null && arrastrando !== i ? (arrastrando > i ? 'tw:shadow-[0_-3px_0_0_var(--ui-lav-edge)]' : 'tw:shadow-[0_3px_0_0_var(--ui-lav-edge)]') : ''}`}>
            <span className="tw:w-7 tw:shrink-0 tw:text-right tw:text-sm tw:font-semibold tw:text-muted">{i + 1}</span>
            <img src={u} alt="" draggable={false} loading="lazy" className="tw:h-12 tw:w-16 tw:shrink-0 tw:rounded-md tw:bg-black/5 tw:object-cover"
              onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
            <span className="tw:min-w-0 tw:flex-1 tw:truncate tw:text-[13px] tw:text-muted">{i === 0 ? <b className="tw:text-ink">Portada</b> : decodeURIComponent(u.split('/').pop() || '').replace(/_[0-9a-f-]{36}(?=\.\w+$)/, '')}</span>
            <button type="button" title="Al inicio (portada)" aria-label="Al inicio" disabled={i === 0} onClick={() => setOrden((l) => mover(l, i, 0))} className={btnIcono}><Icono nombre="chevU" tam={14} /><Icono nombre="chevU" tam={14} /></button>
            <button type="button" title="Subir" aria-label="Subir" disabled={i === 0} onClick={() => setOrden((l) => mover(l, i, i - 1))} className={btnIcono}><Icono nombre="chevU" tam={16} /></button>
            <button type="button" title="Bajar" aria-label="Bajar" disabled={i === orden.length - 1} onClick={() => setOrden((l) => mover(l, i, i + 1))} className={btnIcono}><Icono nombre="chevD" tam={16} /></button>
          </div>
        ))}
      </div>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
      <Boton id="mOk" disabled={!cambio} cargando={guardando} onClick={guardar}>Guardar orden</Boton>
    </VentanaPie>
  </>;
}

export const abrirOrdenarFotos = (fotos: string[]) => abrirModal(<OrdenarFotos fotos={fotos} />, { clave: 'modal-154' });
