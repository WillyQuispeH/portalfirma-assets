// Carga de archivos con la caja del kit: una zona con borde punteado que se pulsa o se arrastra encima. Reemplaza al
// <input type="file"> pelado del navegador (que se ve distinto en cada sistema).
//   <InputArchivo etiqueta="Fotos de la visita" icono="image" accept="image/*" multiple
//     ayuda="JPG, PNG o HEIC" onArchivos={(fs) => subir(fs)} />
// Devuelve los archivos elegidos como File[] (el input se vacía solo: se puede elegir el mismo archivo otra vez).
import { useId, useRef, useState, type DragEvent, type ReactNode } from 'react';
import Icono from './Icono';
import { cx } from '../../utils/cx';

interface IInputArchivoProps {
  etiqueta: ReactNode;
  /** texto de apoyo bajo la etiqueta (formatos, tamaño) */
  ayuda?: ReactNode;
  icono?: string;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  /** muestra «trabajando» y no deja elegir más mientras tanto */
  cargando?: boolean;
  onArchivos: (archivos: File[]) => void;
  id?: string;
  className?: string;
}

export default function InputArchivo({ etiqueta, ayuda, icono = 'upload', accept, multiple, disabled, cargando, onArchivos, id, className }: IInputArchivoProps) {
  const auto = useId(); const idCampo = id || auto;
  const ref = useRef<HTMLInputElement>(null);
  const [encima, setEncima] = useState(false);
  const bloqueado = !!disabled || !!cargando;
  const recibir = (l: FileList | null) => { const a = Array.from(l ?? []); if (a.length && !bloqueado) onArchivos(a); };
  const soltar = (e: DragEvent) => { e.preventDefault(); setEncima(false); recibir(e.dataTransfer.files); };
  return (
    <div
      id={idCampo}
      className={cx(
        'tw:flex tw:items-center tw:gap-3 tw:rounded-xl tw:border-2 tw:border-dashed tw:px-3 tw:py-2.5 tw:transition-colors tw:duration-100',
        encima ? 'tw:border-brand tw:bg-lav-soft' : 'tw:border-edge tw:bg-transparent',
        bloqueado ? 'tw:opacity-55' : 'tw:cursor-pointer tw:hover:bg-hover',
        className,
      )}
      onClick={() => !bloqueado && ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); if (!bloqueado) setEncima(true); }}
      onDragLeave={() => setEncima(false)}
      onDrop={soltar}
    >
      <span className="tw:grid tw:place-items-center tw:size-9 tw:shrink-0 tw:rounded-lg tw:bg-lav-soft tw:text-lav-softink">
        {cargando ? <span className="spinner sm" /> : <Icono nombre={icono} tam={18} />}
      </span>
      <label className="tw:flex tw:flex-col tw:gap-0.5 tw:min-w-0 tw:flex-1 tw:cursor-[inherit]">
        <span className="tw:text-sm tw:font-semibold tw:text-text">{cargando ? 'Subiendo…' : etiqueta}</span>
        {ayuda && <small className="tw:text-xs tw:text-muted">{ayuda}</small>}
      </label>
      <input ref={ref} id={idCampo + "Archivo"} type="file" accept={accept} multiple={multiple} disabled={bloqueado} style={{ display: "none" }}
        onClick={(e) => e.stopPropagation()} onChange={(e) => { recibir(e.target.files); e.target.value = ''; }} />
    </div>
  );
}
