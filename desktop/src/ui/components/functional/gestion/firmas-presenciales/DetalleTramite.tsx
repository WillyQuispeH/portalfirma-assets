// Un trámite ya enviado: su seguimiento, lo que recibió la notaría (vista y archivos), el valor y la notaría.
import Icono from '../../../ui/Icono';
import { Chip, Hojas, Seguimiento } from './Visor';
import { escrituraArchivos } from '../../../../store/hooks/useEscritura.hook';
import { abrirEnEditorVarios, toast } from '../../../../utils/app';
import { COLOR_ESTADO, TRAMITES, clp, fechaCorta } from '../../../../utils/escrituras';
import type { IArchivoEnviado, ITramiteEnviado } from '../../../../store/interfaces/escritura.interface';
import { BARRA, DERECHA, ENCABEZADO, ENCABEZADO_H3, IZQUIERDA, NOTARIA, PERSONAS, PERSONAS_H, PERSONA_INFO, PRECIO, TRABAJO, avatar, persona } from './estilos';

// Un archivo enviado (es-file-b la usan las pruebas)
const ARCHIVO = 'es-file-b tw:w-full tw:m-0 tw:justify-start tw:flex tw:gap-1.5 tw:items-center tw:text-left tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap';

async function abrirArchivo(o: ITramiteEnviado, nombre: string) {
  const r = await escrituraArchivos.deTramite(o.operation, nombre);
  if (!r.ok || !r.data) return toast('No se encontró el archivo.');
  if (!/\.pdf$/i.test(nombre)) return toast('El Word lo recibe la notaría.');
  const t = await escrituraArchivos.temporal(r.data, nombre); if (t.ok && t.data) abrirEnEditorVarios([t.data.path]);
}

export default function DetalleTramite({ o }: { o: ITramiteEnviado }) {
  const paso = o.status === 'cotizacion' ? 3 : ['pagado', 'pausado_ajuste_tarifa', 'aceptado', 'citado'].includes(o.status) ? 4 : 6;
  const archivos = (o.archivos || []).filter((f): f is IArchivoEnviado => typeof f === 'object');
  const principal = archivos.find((f) => ['escritura_pdf', 'reduccion_pdf', 'para_notaria'].includes(f.kind)) || archivos.find((f) => f.kind === 'caratula_pdf');
  const cargar = async () => { if (!principal) return []; const r = await escrituraArchivos.deTramite(o.operation, principal.name); return r.ok && r.data ? [r.data] : []; };
  const presencial = TRAMITES[o.tramite]?.presencial;
  return <>
    <div className={ENCABEZADO}><div><h3 className={ENCABEZADO_H3}>{o.titulo || o.materia}</h3><div className="muted small">Trámite Nº {o.operation} · {TRAMITES[o.tramite]?.t || ''} · {o.materia || ''}<br />Creado {fechaCorta(o.creado)}</div></div>
      <Chip grande color={COLOR_ESTADO[o.status] || '#64748b'}>{o.estado}</Chip></div>
    <Seguimiento actual={paso} tramite={o.tramite} fin={o.status === 'cotizacion' ? 'Esperando cotización' : 'La notaría toma el caso'} />
    <div className={TRABAJO}>
      <div className={IZQUIERDA}><div className={BARRA}><b className="small">Lo que recibió la notaría</b></div>
        <div className="tw:rounded-[18px] tw:overflow-hidden"><Hojas id="esVn" cargar={cargar} clave={o.operation + (principal?.name || '')} espera="Cargando…" /></div></div>
      <aside className={DERECHA}>
        <div className={PRECIO}><small className="muted">{o.status === 'cotizacion' ? 'Valor' : 'Pagado'}</small><b>{clp(o.total)}</b></div>
        {o.notaria && (
          <div className={NOTARIA()}><div className={PERSONAS_H}><b>Notaría</b>{o.notaria.prueba && <Chip color="#b26a00">De prueba</Chip>}</div>
            {o.notaria.asignacion ? <p className="small">Asignación automática: la primera notaría disponible de la red toma el caso.</p>
              : <div className={persona(true)}><span className={avatar('brand')}><Icono nombre="building" tam={16} /></span><div className={PERSONA_INFO}><b>{o.notaria.nombre}</b><small className="muted">{o.notaria.notario} · {o.notaria.direccion}, {o.notaria.comuna}</small></div></div>}
          </div>
        )}
        <div className={PERSONAS}><div className={PERSONAS_H}><b>Archivos enviados</b><small className="muted">{archivos.length}</small></div>
          {archivos.length ? archivos.map((f) => <button key={f.name} className={`ghost small ${ARCHIVO}`} data-f={f.name} onClick={() => abrirArchivo(o, f.name)}><Icono nombre="file" tam={13} /> {f.name}</button>) : <p className="muted small">—</p>}</div>
        <p className="muted small">{o.status === 'cotizacion' ? 'La notaría revisará el documento y te enviará el valor. No se cobra nada hasta que lo apruebes.' : presencial ? 'La notaría tomará el caso y te contactará para agendar la firma presencial.' : 'La notaría tomará el caso y te avisaremos cuando quede protocolizado.'}</p>
      </aside>
    </div>
  </>;
}
