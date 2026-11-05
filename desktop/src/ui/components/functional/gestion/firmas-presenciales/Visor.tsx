// Piezas de la pantalla de un trámite: el seguimiento (recibido → revisión → notaría → pago → en notaría → firma)
// y las hojas de un PDF dibujadas como <canvas class="es-page"> (pdf.js).
import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import Icono from '../../../ui/Icono';
import { cx } from '../../../../utils/cx';
import { ALERTA, COLOR_ALERTA } from './estilos';
import { dibujarHojas } from '../../../../utils/escrituras-pdf';
import type { TTramite } from '../../../../store/interfaces/escritura.interface';

// Etiqueta de color (clase ops-chip de styles.css; el color va en la variable --c). `clase`: clases tw: extra.
export function Chip({ color, grande = false, clase, children }: { color: string; grande?: boolean; clase?: string; children: ReactNode }) {
  return <span className={cx('ops-chip', grande && 'big', clase)} style={{ '--c': color } as Record<string, string>}>{children}</span>;
}

// El círculo de cada paso del seguimiento
const PUNTO = 'tw:size-7 tw:rounded-full tw:grid tw:place-items-center tw:text-[12px] tw:font-semibold';
const PUNTO_ESTADO = {
  ok: 'tw:bg-ok tw:text-white',
  on: 'tw:bg-brand tw:text-white tw:[box-shadow:0_0_0_5px_color-mix(in_srgb,var(--brand)_14%,transparent)]',
  no: 'tw:bg-card tw:text-muted tw:[box-shadow:inset_0_0_0_1.5px_var(--es-line)]',
};

export function Seguimiento({ actual, tramite, fin }: { actual: number; tramite: TTramite | null; fin?: string }) {
  const pasos = ['Recibido', 'Revisión', 'Notaría', 'Pago', 'En notaría', tramite === 'protocolizacion' ? 'Protocolizado' : 'Firma en notaría'];
  return (
    // es-track y es-tk.on los usan las pruebas
    <div className="es-track tw:flex tw:items-start tw:bg-[color-mix(in_srgb,var(--bg)_70%,var(--card))] tw:rounded-[16px] tw:py-4 tw:px-5 tw:mb-[18px]">
      {pasos.map((t, i) => {
        const estado = i < actual ? 'ok' : i === actual ? 'on' : 'no';
        return (
          <Fragment key={t}>
            {i > 0 && <span className={cx('tw:flex-1 tw:h-0.5 tw:mt-[13px] tw:rounded-[2px]', i - 1 < actual ? 'tw:bg-ok' : 'tw:bg-[var(--es-line)]')} />}
            <div className={cx('es-tk tw:flex tw:flex-col tw:items-center tw:gap-1 tw:min-w-[76px] tw:text-center', estado === 'on' && 'on')}>
              <span className={cx(PUNTO, PUNTO_ESTADO[estado])}>{i < actual ? <Icono nombre="check" tam={13} /> : i + 1}</span>
              <b className={cx('tw:text-[12.5px]', estado === 'no' ? 'tw:text-muted tw:font-medium' : 'tw:font-semibold')}>{t}</b>
              <small className="tw:text-[11px] tw:text-muted tw:min-h-[14px]">{i < actual ? 'Listo' : i === actual ? (fin || 'Ahora') : ''}</small>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

// Dibuja las hojas de los PDF que entrega `cargar`. Se vuelve a dibujar cuando cambia `clave`.
// React no pone hijos en este div: los canvas (es-page) los agrega dibujarHojas. `dos`: en el visor lado a lado.
export function Hojas({ id, cargar, clave, escala = 1, espera = 'Preparando…', vacio = 'Sin vista disponible.', dos = false }: { id: string; cargar: () => Promise<Uint8Array[]>; clave: string; escala?: number; espera?: string; vacio?: string; dos?: boolean }) {
  const caja = useRef<HTMLDivElement>(null);
  const cargarRef = useRef(cargar); cargarRef.current = cargar;
  useEffect(() => {
    const host = caja.current; if (!host) return; let vivo = true;
    const aviso = (texto: string, clase = 'muted small tw:p-10') => { const d = document.createElement('div'); d.className = clase; d.textContent = texto; host.replaceChildren(d); };
    aviso(espera);
    (async () => {
      try {
        const lista = await cargarRef.current(); if (!vivo) return;
        if (!lista.length) return aviso(vacio);
        host.replaceChildren();
        for (const b of lista) { if (!vivo) return; await dibujarHojas(host, b, { escala, vivo: () => vivo }); }
      } catch (e) { if (vivo) aviso('No se pudo preparar: ' + ((e as Error).message || e), cx(ALERTA, COLOR_ALERTA.error)); }
    })();
    return () => { vivo = false; };
  }, [clave, escala, espera, vacio]);
  return <div className={cx('tw:flex tw:flex-col tw:items-center tw:bg-[linear-gradient(180deg,#eef1f7,#e7eaf2)] tw:rounded-[18px] tw:max-h-[640px] tw:overflow-auto', dos ? 'tw:p-3.5 tw:gap-3' : 'tw:p-[22px] tw:gap-[18px]')} id={id} ref={caja} />;
}
