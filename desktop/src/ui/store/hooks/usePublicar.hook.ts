// Interfaz pública del flujo «Publicar» para los componentes (no importan el store directo).
import { useShallow } from 'zustand/react/shallow';
import { usePublicarStore } from '../zustand/publicar.store';

export { avisoVigente } from '../zustand/publicar.store';

export function usePublicar() {
  return usePublicarStore(useShallow((s) => ({
    propId: s.propId,
    op: s.op,
    ops: s.ops,
    paso: s.paso,
    propiedad: s.propiedad,
    calidad: s.calidad,
    catalogo: s.catalogo,
    paquetes: s.paquetes,
    sel: s.sel,
    tipoAviso: s.tipoAviso,
    destacado: s.destacado,
    resultados: s.resultados,
    publicando: s.publicando,
    error: s.error,
    publicarIniciar: s.publicarIniciar,
    publicarSetOp: s.publicarSetOp,
    publicarIr: s.publicarIr,
    publicarCalidadGet: s.publicarCalidadGet,
    publicarTextosGuardar: s.publicarTextosGuardar,
    publicarRedactar: s.publicarRedactar,
    publicarMarcar: s.publicarMarcar,
    publicarSetTipoAviso: s.publicarSetTipoAviso,
    publicarSetDestacado: s.publicarSetDestacado,
    publicarEnviar: s.publicarEnviar,
  })));
}
