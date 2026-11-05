// Clases de Tailwind que comparten las piezas de Firmas presenciales.
// Las variables --es-line (borde suave), --es-soft (sombra) y --es-r (radio) las define la raíz .es
// (styles/globals.css, sección «Firmas presenciales»). En los formularios en ventana (#modalCard) no existen.
import { cx } from '../../../../utils/cx';

// Tarjeta blanca con borde suave y sombra (la lista de trámites, el detalle, los archivos)
export const PANEL = 'tw:bg-card tw:border tw:border-[color:var(--es-line)] tw:rounded-[var(--es-r)] tw:[box-shadow:var(--es-soft)]';

// Encabezado del detalle: título y estado (o botón) a la derecha. La clase es-dh la usan las pruebas.
export const ENCABEZADO = 'es-dh tw:flex tw:justify-between tw:items-start tw:gap-3.5 tw:mb-4 tw:[&_.muted]:leading-[1.5] tw:[&>button]:w-auto tw:[&>button]:m-0 tw:[&>button]:shrink-0';
export const ENCABEZADO_H3 = 'tw:mt-0 tw:mx-0 tw:mb-1 tw:text-[19px]!';

// Título de sección con acciones a la derecha. `revision`: dentro de la revisión, con menos aire.
export const seccion = (revision = false) => cx('tw:flex tw:items-center tw:justify-between tw:gap-2.5 tw:flex-wrap tw:[&_h3]:m-0 tw:[&>button]:w-auto tw:[&>button]:m-0',
  revision ? 'tw:mt-3.5 tw:mb-1.5' : 'tw:mt-[22px] tw:mb-3');

// Lo que completa la notaría: [ ]
export const MARCA = 'tw:bg-[#fff3b0] tw:px-[3px] tw:rounded-[4px] tw:font-medium';

// Texto en rojo (RUT inválido, notaría que no hace el trámite)
export const MALO = 'tw:text-err tw:font-semibold';

// Campo de texto de la columna derecha (correo, teléfono)
export const CAMPO = 'tw:w-full tw:min-w-[150px] tw:m-0 tw:py-[7px] tw:px-2.5 tw:text-[12.5px]';

// Textarea de los formularios en ventana. El tamaño mínimo lo pone cada uno.
export const AREA = 'tw:w-full tw:py-3 tw:px-3.5 tw:border tw:border-line tw:rounded-[12px] tw:resize-y tw:box-border';

// Caja de personas (comparecientes, participantes, notaría, archivos)
export const PERSONAS = 'tw:bg-card tw:rounded-[16px] tw:[box-shadow:inset_0_0_0_1px_var(--es-line)] tw:py-3 tw:px-3.5 tw:flex tw:flex-col tw:gap-2.5';
export const PERSONAS_H = 'tw:flex tw:justify-between tw:items-baseline tw:[&>b]:font-semibold tw:[&>b]:text-[14px]';
// Una persona; la primera (justo después del encabezado) va sin línea arriba
export const persona = (primera: boolean) => cx('tw:flex tw:gap-[11px] tw:items-start', !primera && 'tw:pt-2.5 tw:border-t tw:border-[color:var(--es-line)]');
export const PERSONA_INFO = 'tw:flex tw:flex-col tw:gap-1 tw:min-w-0 tw:flex-1 tw:[&>b]:font-semibold tw:[&>b]:text-[13px]';

// Avatar redondo. tono: 'ok' (firma), 'off' (representado), 'brand' (notaría), 'brand-off' (asignación automática)
export type TTonoAvatar = 'ok' | 'off' | 'brand' | 'brand-off';
const TONO_AV: Record<TTonoAvatar, string> = {
  ok: 'tw:bg-ok tw:text-white',
  off: 'tw:bg-[color-mix(in_srgb,var(--muted)_35%,var(--card))] tw:text-white',
  brand: 'tw:bg-[color-mix(in_srgb,var(--brand)_12%,var(--card))] tw:text-brand',
  'brand-off': 'tw:bg-bg tw:text-muted',
};
export const avatar = (tono: TTonoAvatar = 'ok') => cx('tw:size-[38px] tw:rounded-full tw:grid tw:place-items-center tw:shrink-0 tw:font-semibold tw:text-[13px] tw:tracking-[.02em]', TONO_AV[tono]);

// Aviso de color (observaciones, errores del visor). El color va en --c.
export const ALERTA = 'tw:flex tw:items-start tw:gap-3 tw:py-[11px] tw:px-3.5 tw:rounded-[14px] tw:bg-[color-mix(in_srgb,var(--c)_4%,var(--card))] tw:[box-shadow:inset_0_0_0_1px_color-mix(in_srgb,var(--c)_12%,transparent)] tw:text-[13px] tw:leading-[1.5]';
export const COLOR_ALERTA: Record<string, string> = { error: 'tw:[--c:#c0362c] tw:text-err', warn: 'tw:[--c:#c27c00]', ok: 'tw:[--c:#13804b]', info: 'tw:[--c:#3f4fe6]' };

// Interruptor (checkbox escondido + riel con su perilla)
export const SW = 'tw:relative tw:w-[34px] tw:h-5 tw:m-0 tw:shrink-0';
export const SW_INPUT = 'tw:peer tw:opacity-0 tw:w-0 tw:h-0 tw:m-0';
export const SW_RIEL = "tw:absolute tw:inset-0 tw:rounded-full tw:bg-[color-mix(in_srgb,var(--muted)_30%,var(--card))] tw:[transition:background_.2s] tw:cursor-pointer tw:peer-checked:bg-brand tw:after:content-[''] tw:after:absolute tw:after:size-4 tw:after:left-0.5 tw:after:top-0.5 tw:after:rounded-full tw:after:bg-white tw:after:[box-shadow:0_1px_3px_rgba(0,0,0,.2)] tw:after:[transition:transform_.2s] tw:peer-checked:after:[transform:translateX(14px)]";

// Casilla con su texto
export const CASILLA = 'tw:flex tw:items-center tw:gap-2 tw:text-text tw:text-[13px] tw:m-0 tw:leading-[1.45] tw:[&_input]:w-auto tw:[&_input]:m-0 tw:[&_input]:accent-brand';

// Caja del valor (columna derecha). El monto grande es el <b> hijo directo.
export const PRECIO = 'tw:bg-[linear-gradient(160deg,color-mix(in_srgb,#3d9cf0_8%,var(--card)),color-mix(in_srgb,#6a2fe0_6%,var(--card)))] tw:rounded-[18px] tw:py-4 tw:px-[18px] tw:flex tw:flex-col tw:gap-1.5 tw:[box-shadow:inset_0_0_0_1px_color-mix(in_srgb,var(--brand)_12%,transparent)] tw:[&>b]:text-[26px] tw:[&>b]:font-[650] tw:[&>b]:tracking-[-.02em]';
// Una línea de cobro: concepto (con detalle debajo) y monto. es-line la usan las pruebas.
export const LINEA = 'es-line tw:flex tw:justify-between tw:gap-2.5 tw:[&_div]:flex tw:[&_div]:flex-col tw:[&_div]:gap-0.5 tw:[&_b]:font-[550] tw:[&_small]:text-[11.5px]';

// Notaría (caja de personas con acento). `falta`: todavía no se elige.
export const NOTARIA = (falta = false) => cx(PERSONAS, 'tw:[&_p]:m-0 tw:[&>button]:w-full tw:[&>button]:m-0',
  falta && 'tw:[box-shadow:inset_0_0_0_1.5px_color-mix(in_srgb,var(--brand)_35%,transparent)]! tw:bg-[color-mix(in_srgb,var(--brand)_3%,var(--card))]!');
export const NOTARIA_BOTON = 'tw:w-auto tw:m-0 tw:py-[3px]! tw:px-2.5!';

// El espacio de trabajo: visor a la izquierda, valor y acciones a la derecha.
// es-work y es-wr los usan las pruebas
export const TRABAJO = 'es-work tw:grid tw:grid-cols-[minmax(0,1fr)_330px] tw:gap-[18px] tw:items-start tw:max-[1250px]:grid-cols-1';
export const IZQUIERDA = 'tw:min-w-0 tw:flex tw:flex-col tw:gap-3';
export const DERECHA = 'es-wr tw:flex tw:flex-col tw:gap-2.5 tw:sticky tw:top-0 tw:max-[1250px]:static tw:[&>button]:w-full tw:[&>button]:m-0';
export const BARRA = 'tw:flex tw:items-center tw:justify-between tw:gap-2.5 tw:flex-wrap';
