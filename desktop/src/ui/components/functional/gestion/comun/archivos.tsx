// Piezas comunes de Gestión documental: tipo de archivo, tamaño, fecha y el ícono del archivo.
import Icono from '../../../ui/Icono';

const ext = (n: string) => (String(n).match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
// [etiqueta, clase] del tipo de archivo
export function tipoArchivo(n: string): [string, 'pdf' | 'doc' | 'xls' | 'img' | 'oth'] {
  const e = ext(n);
  if (e === 'pdf') return ['PDF', 'pdf'];
  if (/^(docx?|odt|rtf)$/.test(e)) return ['DOC', 'doc'];
  if (/^(xlsx?|csv|ods)$/.test(e)) return ['XLS', 'xls'];
  if (/^(png|jpe?g|webp)$/.test(e)) return ['IMG', 'img'];
  return [e.toUpperCase().slice(0, 4), 'oth'];
}
export const tamano = (n?: number) => (n ? (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB') : '');
export const fechaCorta = (iso?: string) => { try { return iso ? new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) : ''; } catch { return ''; } };
export const carpetaDe = (ruta: string) => ruta.replace(/[\/][^\/]+$/, '');

export function IconoArchivo({ nombre }: { nombre: string }) {
  const [k, c] = tipoArchivo(nombre);
  return <span className={`fi k-${c}`}><Icono nombre={c === 'img' ? 'image' : 'file'} tam={18} /><i>{k}</i></span>;
}
