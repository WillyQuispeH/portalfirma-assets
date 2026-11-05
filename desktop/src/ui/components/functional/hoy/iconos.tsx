// Íconos de estado de los pasos (los mismos de IC en src/renderer/etapas.js).
export type TEstadoPaso = 'ok' | 'pend' | 'otro' | 'fail' | 'todo';

export function IconoEstado({ e }: { e: TEstadoPaso }) {
  const p = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' as const, 'aria-hidden': true };
  if (e === 'ok') return <svg {...p} strokeWidth={3} strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
  if (e === 'pend') return <svg {...p} strokeWidth={2.4}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;
  if (e === 'otro') return <svg {...p} strokeWidth={2.2}><path d="M7 4h10M7 20h10M8 4c0 4 8 4 8 8s-8 4-8 8M16 4c0 4-8 4-8 8" /></svg>;
  if (e === 'fail') return <svg {...p} strokeWidth={2.4} strokeLinejoin="round"><path d="M12 4l9 16H3z" /><path d="M12 10v4" /><path d="M12 17.5v.01" /></svg>;
  return <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="6" /></svg>;
}
