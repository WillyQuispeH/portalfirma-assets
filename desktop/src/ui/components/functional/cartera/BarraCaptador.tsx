// Barra del modo «Asignar captador»: cuántas hay elegidas, elegir todas o ninguna, a quién y asignar.
// Hecha con el kit (Boton y Select); la barra fija (.im-bulk) sigue en styles.css.
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
    <div className="im-bulk">
      <b id="imBulkN">{elegidas} seleccionada{elegidas === 1 ? '' : 's'}</b>
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
