// El espacio de trabajo de un trámite con documento: cómo llegó y cómo va a la notaría (o lado a lado),
// la revisión, el precio, la notaría, quiénes firman y las acciones (pagar, modificar, descargar el Word).
import Icono from '../../../ui/Icono';
import { Chip, Hojas, Seguimiento } from './Visor';
import { Caratula, FichaPrivado, Materia, Observaciones, Ocultos } from './Revision';
import { Comparecientes, Contacto, Precio, TarjetaNotaria } from './Lateral';
import { EditarEscritura, EditarReduccion } from './Modales';
import { escrituraEstado, useEscritura } from '../../../../store/hooks/useEscritura.hook';
import { abrirModal } from '../../../../utils/modal';
import { TRAMITES, clavePrevia, cotizacion, esPrivado, faltantes, motor, observaciones, origenes, sinPrefijo, tituloDoc, totalHojas } from '../../../../utils/escrituras';
import { descargarWord, pagar } from './controlador';
import type { TVistaVisor } from '../../../../store/interfaces/escritura.interface';
import { cx } from '../../../../utils/cx';
import { BARRA, DERECHA, ENCABEZADO, ENCABEZADO_H3, IZQUIERDA, MARCA, TRABAJO } from './estilos';

const SEGMENTO = 'tw:w-auto tw:m-0 tw:border-0 tw:text-[12.5px] tw:font-[550] tw:py-1.5 tw:px-3.5 tw:rounded-full';
const COLUMNA = 'tw:min-w-0 tw:flex tw:flex-col tw:gap-1.5';
const LEYENDA = 'tw:text-[11.5px] tw:font-semibold tw:text-muted tw:uppercase tw:tracking-[.06em] tw:pl-1';

const VISTAS: [TVistaVisor, string][] = [['orig', 'Cómo llegó'], ['notaria', 'Cómo va a la notaría'], ['ambos', 'Lado a lado']];

function Visor() {
  const S = useEscritura(); const priv = esPrivado(S); const vista = S.vista || 'notaria';
  const escala = vista === 'ambos' ? 0.62 : 1;
  const original = () => Promise.resolve(priv ? S.proto.docs.map((x) => x.bytes) : [S.orig?.pdf].filter((b): b is Uint8Array => !!b));
  const claveOriginal = priv ? S.proto.docs.map((x) => x.name).join('|') : S.orig?.name || '';
  const notaria = async () => [await escrituraEstado().escrituraVistaPrevia()];
  const dos = vista === 'ambos';
  const verOriginal = <Hojas id="esVo" cargar={original} clave={claveOriginal} escala={escala} espera="Cargando…" vacio="Sin vista del original." dos={dos} />;
  const verNotaria = <Hojas id="esVn" cargar={notaria} clave={clavePrevia(S)} escala={escala} dos={dos} />;
  return <>
    <div className={BARRA}><div className="es-seg2 tw:inline-flex tw:bg-[color-mix(in_srgb,var(--bg)_80%,var(--card))] tw:rounded-full tw:p-[3px] tw:gap-0.5">{VISTAS.map(([k, t]) => <button key={k} data-v={k} className={cx(SEGMENTO, vista === k ? 'on tw:bg-card tw:text-text tw:[box-shadow:0_1px_3px_rgba(16,24,64,.12)]' : 'tw:bg-transparent tw:text-muted')} onClick={() => S.escrituraVista(k)}>{t}</button>)}</div>
      <span className="muted small">{vista === 'orig' ? (priv ? origenes(S) : S.name) : <><span className={MARCA}>[ ]</span> lo completa la notaría</>}</span></div>
    <div className={cx('tw:rounded-[18px] tw:overflow-hidden', dos && 'tw:grid tw:grid-cols-2 tw:gap-2.5')} id="esViewer">
      {dos ? <>
        <div className={COLUMNA}><div className={LEYENDA}>Cómo llegó</div>{verOriginal}</div>
        <div className={COLUMNA}><div className={LEYENDA}>Cómo va a la notaría</div>{verNotaria}</div>
      </> : vista === 'orig' ? verOriginal : verNotaria}
    </div>
  </>;
}

export default function Trabajo() {
  const S = useEscritura(); const { MT } = motor();
  const priv = esPrivado(S); const red = S.tramite === 'reduccion'; const proto = S.tramite === 'protocolizacion';
  const q = cotizacion(S); const falta = faltantes(S);
  const errores = observaciones(S).filter((x) => x.sev === 'error').length;
  const hojas = priv ? totalHojas(S) : S.hojasEsc;
  return <>
    <div className={ENCABEZADO}><div><h3 className={ENCABEZADO_H3}>{tituloDoc(S)}</h3><div className="muted small">{TRAMITES[S.tramite!].t} · {sinPrefijo(MT.BY[S.materia || '']?.label || '—')}{hojas ? ` · ${hojas} ${hojas === 1 ? 'hoja' : 'hojas'}` : ''}</div></div>
      <Chip grande color={errores ? '#c0362c' : falta.length ? '#b26a00' : '#13804b'}>{errores ? `${errores} ${errores === 1 ? 'error' : 'errores'} por revisar` : falta.length ? 'Faltan datos' : 'Listo para pagar'}</Chip></div>
    <Seguimiento actual={S.notaria ? 3 : 1} tramite={S.tramite} fin={S.notaria ? 'Listo para pagar' : 'Ahora'} />
    <div className={TRABAJO}>
      <div className={IZQUIERDA}>
        <Visor />
        <div className="tw:flex tw:flex-col tw:gap-1.5 tw:mt-1.5">
          {priv ? <FichaPrivado /> : <Materia />}
          <Ocultos />
          <Observaciones />
          {proto && <Caratula />}
        </div>
      </div>
      <aside className={DERECHA}>
        <Precio q={q} />
        <TarjetaNotaria />
        <button className="primary tw:py-[13px]! tw:px-4! tw:text-[14px]" id="esPrim" disabled={S.enviando} onClick={() => pagar(q)}>{S.enviando ? 'Enviando…' : q.cotizacion ? 'Solicitar cotización' : 'Pagar y enviar a la notaría'}</button>
        {falta.length > 0 && <div className="tw:flex tw:items-center tw:gap-2.5 tw:rounded-[14px] tw:py-[11px] tw:px-3.5 tw:text-[13px] tw:mt-2 tw:bg-[color-mix(in_srgb,#fff6e0_70%,var(--card))] tw:[box-shadow:inset_0_0_0_1px_color-mix(in_srgb,#d08a00_20%,transparent)] tw:text-[#7a4d00] tw:[&>span]:flex-1" id="esFalta"><Icono nombre="alert" tam={15} /><span>Falta: {falta.join('; ')}.</span></div>}
        {!proto
          ? <button className="ghost with-ic" id="esEdit" onClick={() => abrirModal(red ? <EditarReduccion /> : <EditarEscritura />)}><Icono nombre="edit" tam={15} /><span>{red ? 'Modificar el escrito' : 'Modificar el texto'}</span></button>
          : <div className="small tw:flex tw:gap-1.5 tw:items-start tw:text-muted tw:leading-[1.5] tw:py-1 tw:px-0.5"><Icono nombre="lock" tam={13} /> El documento se protocoliza tal como lo subiste; la carátula se arma sola. El ejecutivo de la notaría completa el requirente.</div>}
        {!priv && <button className="ghost with-ic" id="esDocx" onClick={descargarWord}><Icono nombre="fileOut" tam={15} /><span>Descargar Word</span></button>}
        <button className="ghost small tw:border-0! tw:text-muted! tw:justify-center tw:inline-flex tw:gap-1.5 tw:items-center" id="esCambiar" onClick={S.escrituraCambiarDocumento}><Icono nombre="folderOpen" tam={14} /> Cambiar documento</button>
        {priv ? <Contacto /> : <Comparecientes />}
      </aside>
    </div>
  </>;
}
