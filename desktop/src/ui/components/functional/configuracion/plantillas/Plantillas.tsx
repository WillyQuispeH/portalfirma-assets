// Configuración › Plantillas: las plantillas de los documentos que arma Asset (orden de visita, carta oferta, contratos,
// mandatos, actas). Todos las ven; el administrador las edita por cláusula y registra la aprobación del abogado.
// La lista dice el estado de cada una; al tocar una, Configuración abre el detalle (Detalle.tsx) como pantalla propia.
// API: GET /v1/plantillas (IPC pl:lista). Ids para pruebas: #cfgPlantillas, [data-plantilla="<nombre>"].
import { useCallback, useEffect, useState } from 'react';
import Card from '../../../ui/Card';
import ItemLista from '../../../ui/ItemLista';
import Icono from '../../../ui/Icono';
import EstadoVacio from '../../../ui/EstadoVacio';
import { api } from '../../../../utils/api';
import EstadoPlantilla from './EstadoPlantilla';
import type { IListaPlantillas } from './tipos';

export default function Plantillas({ alAbrir }: { alAbrir: (nombre: string) => void }) {
  const [lista, setLista] = useState<IListaPlantillas | null>(null);
  const [error, setError] = useState('');
  const cargar = useCallback(() => api<IListaPlantillas>('plLista').then((x) => { setLista(x); setError(''); }).catch((e: Error) => setError(e.message)), []);
  useEffect(() => { cargar(); }, [cargar]);

  return (
    <Card titulo="Plantillas de documentos" relleno={false}
      subtitulo="Los textos con que Asset arma los documentos. Cada corredora puede ajustar sus cláusulas y dejar registrada la revisión de su abogado.">
      <div id="cfgPlantillas" className="tw:flex tw:flex-col tw:p-2">
        {error ? <EstadoVacio compacto texto={`No se pudieron cargar las plantillas: ${error}`} className="tw:px-3" />
          : !lista ? <EstadoVacio compacto texto="Cargando…" className="tw:px-3" />
            : !lista.items.length ? <EstadoVacio icono="template" titulo="No hay plantillas" texto="El servidor no tiene plantillas de documentos." />
              : lista.items.map((p) => (
                <ItemLista key={p.nombre} data-plantilla={p.nombre} data-estado={p.estado} alTocar={() => alAbrir(p.nombre)} flecha
                  media={<span className="tw:grid tw:place-items-center tw:size-10 tw:rounded-icono tw:bg-lav-soft tw:text-lav-softink"><Icono nombre="template" tam={18} /></span>}
                  titulo={p.titulo}
                  detalle={[p.descripcion, p.version ? `versión ${p.version}` : 'la base de Asset',
                    p.cambiadas ? (p.cambiadas === 1 ? '1 cláusula propia' : `${p.cambiadas} cláusulas propias`) : 'sin cláusulas propias'].filter(Boolean).join(' · ')}
                  derecha={<EstadoPlantilla estado={p.estado} aprobacion={p.aprobacion} />} />
              ))}
        {lista && !lista.puedeEditar && <p className="tw:m-0 tw:px-3 tw:py-2 tw:text-[13px] tw:text-muted">Las plantillas las edita y aprueba el administrador de la corredora.</p>}
      </div>
    </Card>
  );
}
