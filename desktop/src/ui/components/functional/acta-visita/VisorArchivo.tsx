// Visor grande de un archivo del acta de visita (foto o audio), en una ventana encima de la del paso. Desde aquí se
// puede descargar. El enlace lo da el servidor (url: para ver; descarga: para guardar) y vence a los 5 minutos.
// Los id (#visorArchivo, #visorDescargar, #visorCerrar) los usan las pruebas.
import { useEffect, useState } from 'react';
import Modal from '../../ui/Modal';
import Boton from '../../ui/Boton';
import { actaVisitaService } from '../../../store/services/acta-visita.service';
import { abrirUrl } from '../../../utils/app';

export interface IArchivoVisor { actaId: string; tipo: 'audio' | 'foto'; n: number; titulo: string; detalle?: string; transcripcion?: string }

export default function VisorArchivo({ archivo, alCerrar }: { archivo: IArchivoVisor | null; alCerrar: () => void }) {
  const [enlace, setEnlace] = useState<{ url: string; descarga: string; nombre: string } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setEnlace(null); setError('');
    if (!archivo) return;
    let vivo = true;
    actaVisitaService.archivo(archivo.actaId, archivo.tipo, archivo.n).then((r) => vivo && setEnlace(r)).catch((e) => vivo && setError(e instanceof Error ? e.message : String(e)));
    return () => { vivo = false; };
  }, [archivo]);
  return (
    <Modal abierto={!!archivo} onCerrar={alCerrar} tamano="xl" icono={archivo?.tipo === 'audio' ? 'mic' : 'image'} titulo={archivo?.titulo} descripcion={archivo?.detalle} clave="modal-125" id="visorArchivo"
      pie={<>
        <Boton id="visorCerrar" variante="secundario" onClick={alCerrar}>Cerrar</Boton>
        <Boton id="visorDescargar" icono="download" disabled={!enlace} onClick={() => enlace && abrirUrl(enlace.descarga)}>Descargar</Boton>
      </>}>
      {error && <p className="error tw:m-0">{error}</p>}
      {!error && !enlace && <p className="tw:m-0 tw:text-sm tw:text-muted">Abriendo…</p>}
      {enlace && archivo?.tipo === 'foto' && (
        <div className="tw:grid tw:place-items-center tw:bg-hover tw:rounded-xl tw:overflow-hidden">
          <img src={enlace.url} alt={archivo.titulo} className="tw:block tw:max-w-full tw:max-h-[68vh] tw:object-contain" />
        </div>
      )}
      {enlace && archivo?.tipo === 'audio' && (
        <div className="tw:flex tw:flex-col tw:gap-3">
          <audio controls preload="metadata" src={enlace.url} className="tw:w-full" />
          {archivo.transcripcion
            ? <section className="tw:rounded-xl tw:border tw:border-solid tw:border-edge tw:p-3"><h4 className="tw:m-0 tw:mb-1 tw:text-[13px] tw:font-bold">Transcripción</h4><p className="tw:m-0 tw:text-sm tw:whitespace-pre-wrap tw:max-h-[44vh] tw:overflow-auto">{archivo.transcripcion}</p></section>
            : <p className="tw:m-0 tw:text-[13px] tw:text-muted">Este audio no tiene transcripción.</p>}
        </div>
      )}
    </Modal>
  );
}
