// La etiqueta del estado de una plantilla (lista y detalle de Configuración › Plantillas).
import Badge from '../../../ui/Badge';
import { fecha } from '../../../../utils/formato';
import type { IAprobacionPlantilla, TEstadoPlantilla } from './tipos';

/** el estado de una plantilla como etiqueta: aprobada (verde, por quién y cuándo), sin aprobar o la base cambió (amarillo) */
export default function EstadoPlantilla({ estado, aprobacion }: { estado: TEstadoPlantilla; aprobacion: IAprobacionPlantilla | null }) {
  if (estado === 'aprobada') return <Badge tono="verde" icono="check">Aprobada por {aprobacion?.revisor || '—'}{aprobacion?.en ? ` · ${fecha(aprobacion.en)}` : ''}</Badge>;
  if (estado === 'revisar') return <Badge tono="amarillo" punto>La base cambió: revisar</Badge>;
  return <Badge tono="amarillo" punto>Sin aprobar</Badge>;
}
