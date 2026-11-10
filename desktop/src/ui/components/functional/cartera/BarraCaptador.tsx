// Barra del modo «Asignar captador»: cuántas hay elegidas, elegir todas o ninguna, a quién y asignar.
// Hecha con el kit (Boton y Select), fija arriba mientras se eligen las propiedades.
// Los id imBulk* y la clase im-bulk los usa test/acceso-e2e.js.
import { useState } from 'react';
import Boton from '../../ui/Boton';
import Select from '../../ui/Select';
import type { ICorredorResumen } from '../../../store/interfaces/perfil.interface';

interface IBarraCaptadorProps {
  elegidas: number;
  enLista: number;
  corredores: ICorredorResumen[];
  alElegirTodas: () => void;
  alElegirNinguna: () => void;
  alCancelar: () => void;
  alAsignar: (corredorId: string, nombre: string) => void;
}

export default function BarraCaptador({ elegidas, enLista, corredores, alElegirTodas, alElegirNinguna, alCancelar, alAsignar }: IBarraCaptadorProps) {
  const [corredor, setCorredor] = useState(corredores[0]?.id || '');
  const nombre = corredores.find((c) => c.id === corredor)?.nombre || '— quitar captador —';

  return (
    <div className={'im-bulk tw:sticky tw:top-[calc(56px+var(--cab-visible,0px)+8px)] tw:z-[3] tw:flex tw:flex-wrap tw:items-center tw:gap-2.5 tw:px-4 tw:py-2.5 '
      + 'tw:rounded-2xl tw:border tw:border-solid tw:border-lav-edge/50 tw:border-b-[3px] tw:border-b-lav-edge tw:bg-lav-soft tw:text-text tw:shadow-[0_10px_24px_-14px_rgb(20_35_90/0.35)]'}>
      <b id="imBulkN" className="tw:text-lav-softink">{elegidas} seleccionada{elegidas === 1 ? '' : 's'}</b>
      <Boton id="imBulkAll" variante="fantasma" tamano="sm" onClick={alElegirTodas}>Seleccionar las {enLista} de la lista</Boton>
      <Boton id="imBulkNone" variante="fantasma" tamano="sm" onClick={alElegirNinguna}>Ninguna</Boton>
      <span className="tw:flex-1" />
      <span className="tw:text-[13px] tw:text-muted">Captada por</span>
      <Select id="imBulkCor" aria-label="Captada por" value={corredor} onChange={(e) => setCorredor(e.target.value)} className="tw:h-8">
        {corredores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        <option value="">— quitar captador —</option>
      </Select>
      <Boton id="imBulkOk" tamano="sm" disabled={!elegidas} onClick={() => alAsignar(corredor, nombre)}>Asignar</Boton>
      <Boton id="imBulkX" variante="secundario" tamano="sm" onClick={alCancelar}>Cancelar</Boton>
    </div>
  );
}
