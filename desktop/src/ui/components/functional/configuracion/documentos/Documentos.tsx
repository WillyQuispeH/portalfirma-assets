// Configuración › Documentos: los tipos de documento de la corredora («Carta oferta», «Mandato de venta»…) y cómo se firma cada uno
// (tipo de firma y trámite legal). Cuando alguien sube un documento a firmar, Asset lo reconoce y llena solos los formularios de
// firmantes con la firma y el trámite de su tipo (escritorio, carga masiva y WhatsApp). Todos los ven; el administrador los edita.
// API: GET/POST/PUT/DELETE /v1/tipos-documento (IPC tipos:*). Ids para pruebas: #cfgDocumentos, #tdAgregar, [data-tipo="<id>"].
import { useCallback, useEffect, useState } from 'react';
import Card from '../../../ui/Card';
import ItemLista from '../../../ui/ItemLista';
import Icono from '../../../ui/Icono';
import Badge from '../../../ui/Badge';
import Boton from '../../../ui/Boton';
import EstadoVacio from '../../../ui/EstadoVacio';
import { api } from '../../../../utils/api';
import { confirmar, toast } from '../../../../utils/app';
import { tipoFirmaTexto } from '../plantillas/firma';
import { editarTipo } from './ventanas';
import type { IDatosTipo, IListaTipos, ITipoDocumento } from './tipos';

export default function Documentos() {
  const [lista, setLista] = useState<IListaTipos | null>(null);
  const [error, setError] = useState('');
  const cargar = useCallback(() => api<IListaTipos>('tiposLista').then((x) => { setLista(x); setError(''); }).catch((e: Error) => setError(e.message)), []);
  useEffect(() => { cargar(); }, [cargar]);
  const puedeEditar = lista?.puedeEditar === true;

  const abrir = async (tipo: ITipoDocumento | null) => {
    const r = await editarTipo(tipo, !puedeEditar);
    if (!r) return;
    try {
      if (r === 'borrar') {
        if (!tipo || !(await confirmar({ titulo: 'Borrar tipo de documento', texto: `Se borra **${tipo.nombre}** de la lista. Los documentos de ese tipo que suban después se llenarán con los valores de siempre.`, boton: 'Borrar', peligro: true, clave: 'modal-158' }))) return;
        await api('tiposBorrar', tipo.id);
        toast(`Se borró «${tipo.nombre}».`);
      } else {
        const d: IDatosTipo = r;
        if (tipo) await api('tiposEditar', tipo.id, d); else await api('tiposCrear', d);
        toast(tipo ? 'Se guardó el tipo de documento.' : `«${d.nombre}» quedó agregado.`);
      }
      await cargar();
    } catch (e) { toast((e as Error).message, 6000); }
  };

  return (
    <Card titulo="Tipos de documento" relleno={false}
      subtitulo="Cómo se firma cada documento. Al subir uno a firmar, Asset lo reconoce y llena solo el tipo de firma y el trámite legal."
      accion={puedeEditar ? <Boton id="tdAgregar" icono="plus" tamano="sm" onClick={() => abrir(null)}>Agregar tipo</Boton> : undefined}>
      <div id="cfgDocumentos" className="tw:flex tw:flex-col tw:p-2">
        {error ? <EstadoVacio compacto texto={`No se pudieron cargar los documentos: ${error}`} className="tw:px-3" />
          : !lista ? <EstadoVacio compacto texto="Cargando…" className="tw:px-3" />
            : !lista.items.length ? <EstadoVacio icono="sign" titulo="No hay tipos de documento" texto={puedeEditar ? 'Agrega el primero con «Agregar tipo».' : 'El administrador puede agregarlos.'} />
              : lista.items.map((t) => (
                <ItemLista key={t.id} data-tipo={t.id} data-firma={t.tipoFirma} data-tramite={t.tramite} alTocar={() => abrir(t)} flecha
                  media={<span className="tw:grid tw:place-items-center tw:size-10 tw:rounded-icono tw:bg-lav-soft tw:text-lav-softink"><Icono nombre="sign" tam={18} /></span>}
                  titulo={t.nombre}
                  detalle={t.palabras.length ? `También: ${t.palabras.slice(0, 3).join(', ')}` : t.plantilla ? 'Documento que también arma Asset' : undefined}
                  derecha={<div className="tw:flex tw:flex-wrap tw:items-center tw:justify-end tw:gap-1.5">
                    <Badge tono="gris">{tipoFirmaTexto(t)}</Badge>
                    <Badge tono="gris">{t.tramite === 'legalization' ? 'con legalización' : 'sin trámite'}</Badge>
                  </div>} />
              ))}
        {lista && !puedeEditar && <p className="tw:m-0 tw:px-3 tw:py-2 tw:text-[13px] tw:text-muted">Los tipos de documento los define el administrador de la corredora.</p>}
      </div>
    </Card>
  );
}
