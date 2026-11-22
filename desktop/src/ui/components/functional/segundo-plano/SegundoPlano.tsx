// Barra de «segundo plano»: mientras la carga masiva analiza o envía documentos, una barra fija arriba, en cualquier pantalla,
// dice qué se está haciendo y el porcentaje que lleva. Al terminar muestra el resultado unos segundos; al tocarla abre la Carga masiva.
// Se monta una vez al cargar la app (#segundoPlanoRaiz, src/renderer/app.js) y sigue el estado en vivo (evento «pf:bulk»).
// Los id #segundoPlano y #spBarra los usan las pruebas.
import { useEffect, useRef, useState } from 'react';
import { cola } from '../../../store/hooks/useMasiva.hook';
import type { IColaMasiva } from '../../../store/interfaces/masiva.interface';

interface IAvance { tipo: 'analisis' | 'envio'; total: number; hechos: number; errores?: number; fin?: boolean }

const pct = (a: IAvance) => (a.total ? Math.min(100, Math.round((a.hechos / a.total) * 100)) : 0);

export default function SegundoPlano() {
  const [av, setAv] = useState<IAvance | null>(null);
  const ultimo = useRef<IAvance | null>(null);
  const oculta = useRef<number | undefined>(undefined);

  useEffect(() => {
    const ver = (c: IColaMasiva) => {
      const p = c.progreso; let nuevo: IAvance | null = null;
      if (p?.envio) nuevo = { tipo: 'envio', ...p.envio };
      else if (p?.analisis?.activo) nuevo = { tipo: 'analisis', total: p.analisis.total, hechos: p.analisis.hechos };
      if (nuevo) { clearTimeout(oculta.current); ultimo.current = nuevo; setAv(nuevo); return; }
      // terminó lo que se veía: muestra el resultado un momento
      const u = ultimo.current;
      if (u && !u.fin) { const fin = { ...u, hechos: u.total, fin: true }; ultimo.current = fin; setAv(fin); clearTimeout(oculta.current); oculta.current = window.setTimeout(() => { ultimo.current = null; setAv(null); }, 5000); }
    };
    cola.estado().then((r) => { if (r.ok && r.data) ver(r.data); });
    const alCambiar = (e: Event) => ver((e as CustomEvent<IColaMasiva>).detail);
    window.addEventListener('pf:bulk', alCambiar);
    return () => { window.removeEventListener('pf:bulk', alCambiar); clearTimeout(oculta.current); };
  }, []);

  if (!av) return null;
  const p = pct(av);
  const texto = av.fin
    ? (av.tipo === 'envio' ? (av.errores ? `${av.total - av.errores} enviados · ${av.errores} con error` : `${av.total} ${av.total === 1 ? 'documento enviado' : 'documentos enviados'} a firmar`) : `${av.total} ${av.total === 1 ? 'documento analizado' : 'documentos analizados'}`)
    : `${av.tipo === 'envio' ? 'Enviando a firmar' : 'Analizando documentos'} · ${av.hechos} de ${av.total}`;
  return (
    <div id="segundoPlano" role="status" aria-live="polite" data-tipo={av.tipo} data-fin={av.fin ? '' : undefined} title="Ver en Firma masiva" onClick={() => window.Masiva?.open()}
      className="tw:fixed tw:left-1/2 tw:top-[66px] tw:z-[150] tw:flex tw:w-[min(420px,calc(100vw-32px))] tw:-translate-x-1/2 tw:cursor-pointer tw:flex-col tw:gap-2 tw:rounded-control tw:border tw:border-solid tw:border-edge tw:border-b-[3px] tw:border-b-edge-b tw:bg-card tw:px-4 tw:py-2.5 tw:shadow-[0_8px_24px_rgb(16_24_64/.22)]">
      <div className="tw:flex tw:items-center tw:gap-2.5 tw:text-[13px] tw:font-semibold">
        {av.fin ? <span aria-hidden="true" className={av.errores ? 'tw:text-red-softink' : 'tw:text-green-softink'}>{av.errores ? '!' : '✓'}</span> : <span className="spinner sm" aria-hidden="true" />}
        <span className="tw:min-w-0 tw:flex-1 tw:truncate">{texto}</span>
        <span id="spPct" className="tw:tabular-nums tw:text-muted">{p} %</span>
      </div>
      <div className="tw:h-1.5 tw:overflow-hidden tw:rounded-full tw:bg-sunken" aria-hidden="true">
        <div id="spBarra" className="tw:h-full tw:rounded-full tw:transition-[width] tw:duration-300" style={{ width: `${p}%`, background: av.errores ? 'var(--ui-red-edge, #d63b3b)' : 'var(--grad)' }} />
      </div>
    </div>
  );
}
