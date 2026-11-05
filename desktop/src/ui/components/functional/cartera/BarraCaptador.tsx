// Barra del modo «Asignar captador»: cuántas hay elegidas, elegir todas o ninguna, a quién y asignar.
// Los id imBulk* los usa test/acceso-e2e.js.
import { useState } from 'react';
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
      <button className="ghost small" id="imBulkAll" onClick={alElegirTodas}>Seleccionar las {enLista} de la lista</button>
      <button className="ghost small" id="imBulkNone" onClick={alElegirNinguna}>Ninguna</button>
      <span className="spacer" />
      <label>Captada por
        <select id="imBulkCor" value={corredor} onChange={(e) => setCorredor(e.target.value)}>
          {corredores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          <option value="">— quitar captador —</option>
        </select>
      </label>
      <button className="primary small" id="imBulkOk" disabled={!elegidas} onClick={() => alAsignar(corredor, nombre)}>Asignar</button>
      <button className="secondary small" id="imBulkX" onClick={alCancelar}>Cancelar</button>
    </div>
  );
}
