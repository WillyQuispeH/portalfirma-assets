// Los dos primeros pasos de un trámite nuevo: elegir el tipo de trámite y subir el documento.
import Icono from '../../../ui/Icono';
import { Chip, Seguimiento } from './Visor';
import { useEscritura } from '../../../../store/hooks/useEscritura.hook';
import { TRAMITES, esPrivado, origenDoc } from '../../../../utils/escrituras';
import { elegirArchivos } from './controlador';
import type { TTramite } from '../../../../store/interfaces/escritura.interface';
import { cx } from '../../../../utils/cx';
import { ENCABEZADO, ENCABEZADO_H3, PANEL } from './estilos';

// Tarjeta de cada trámite (es-card la usan las pruebas)
const TARJETA = 'es-card tw:w-auto tw:m-0 tw:text-left tw:bg-card tw:border tw:border-[color:var(--es-line)] tw:rounded-[22px]! tw:p-[22px] tw:flex tw:flex-col tw:gap-2.5 tw:items-start tw:text-text tw:[box-shadow:var(--es-soft)] tw:[transition:transform_.18s,box-shadow_.18s,border-color_.18s] tw:hover:[transform:translateY(-2px)] tw:hover:border-[color-mix(in_srgb,var(--brand)_22%,var(--line))] tw:hover:[box-shadow:0_2px_4px_rgba(16,24,64,.04),0_18px_40px_-16px_rgba(47,73,224,.25)]';
const TARJETA_IC = 'tw:size-12 tw:rounded-[15px] tw:grid tw:place-items-center tw:bg-[linear-gradient(135deg,color-mix(in_srgb,#3d9cf0_16%,var(--card)),color-mix(in_srgb,#6a2fe0_14%,var(--card)))] tw:text-brand';
const SOLTAR = 'tw:mt-1 tw:bg-card tw:rounded-[var(--es-r)] tw:[box-shadow:var(--es-soft)] tw:border-[1.5px] tw:border-dashed tw:border-[color-mix(in_srgb,var(--brand)_22%,var(--line))] tw:py-[52px] tw:px-[30px] tw:flex tw:flex-col tw:items-center tw:gap-3.5 tw:text-center tw:text-muted tw:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--brand)_3%,var(--card)),var(--card))] tw:[&>svg]:text-[color-mix(in_srgb,var(--brand)_70%,var(--card))]';

export function ElegirTramite() {
  const { escrituraElegir } = useEscritura();
  return <>
    <div className={ENCABEZADO}><div><h3 className={ENCABEZADO_H3}>¿Qué trámite necesitas?</h3><div className="muted small">Revisamos tu documento, identificamos la materia y su valor, y lo enviamos a la notaría.</div></div></div>
    <div className="tw:grid tw:grid-cols-3 tw:gap-4">
      {(Object.entries(TRAMITES) as [TTramite, typeof TRAMITES[TTramite]][]).map(([k, t]) => (
        <button key={k} className={TARJETA} data-tr={k} onClick={() => escrituraElegir(k)}>
          <span className={TARJETA_IC}><Icono nombre={t.ic} tam={24} /></span><b className="tw:text-[16px] tw:font-semibold tw:tracking-[-.01em]">{t.t}</b><small className="tw:text-muted tw:leading-[1.55] tw:text-[12.5px] tw:flex-1">{t.d()}</small>
          <Chip color={t.presencial ? '#b26a00' : '#13804b'}>{t.presencial ? 'Firma presencial en la notaría' : 'Sin cita presencial'}</Chip>
        </button>
      ))}
    </div>
    <p className="muted small tw:flex tw:gap-2 tw:items-start tw:leading-[1.5] tw:px-1"><Icono nombre="alert" tam={14} /> Las escrituras públicas y las reducciones se firman <b>en persona</b> ante el notario. Los comparecientes deben llevar su cédula de identidad vigente.</p>
  </>;
}

export function SubirDocumento() {
  const S = useEscritura();
  const { tramite, proto, ocupado, escrituraElegir, escrituraQuitarDoc, escrituraIrA } = S;
  if (!tramite) return null;
  const priv = esPrivado(S); const red = tramite === 'reduccion';
  const que = tramite === 'protocolizacion' ? 'el documento a protocolizar, de preferencia en Word' : red ? 'el documento privado firmado, de preferencia en Word' : 'la minuta de la escritura en Word';
  const ayuda = tramite === 'protocolizacion' ? 'Sirve cualquier documento, firmado o no. En Word (.doc, .docx) lo leemos con exactitud; si solo lo tienes en PDF, foto o escaneo, lo leemos con IA (incluido en el valor).'
    : red ? 'Debe ser un documento real y ya firmado. Nosotros lo reescribimos como escritura pública. En Word lo leemos con exactitud; si solo tienes PDF, foto o escaneo, lo leemos con IA (incluido en el valor).'
    : 'Solo Word (.doc, .docx, .rtf, .odt): así el texto se lee con exactitud.';
  return <>
    <div className={ENCABEZADO}><div><h3 className={ENCABEZADO_H3}>{TRAMITES[tramite].t}</h3><div className="muted small">{TRAMITES[tramite].d()}</div></div><button className="ghost small" id="esCambiarT" onClick={() => escrituraElegir(null)}>Cambiar trámite</button></div>
    <Seguimiento actual={0} tramite={tramite} fin="Sube el documento" />
    <div className={SOLTAR} id="esDrop"><Icono nombre="filePlus" tam={40} /><p className="tw:m-0 tw:text-text"><b>Arrastra aquí {que}</b>, o</p>
      <div className="row-c"><button className="primary with-ic" id="esPick" onClick={elegirArchivos}><Icono nombre="folderOpen" tam={16} /><span>{priv ? 'Elegir archivo…' : 'Elegir minuta en Word…'}</span></button></div>
      <small className="muted tw:max-w-[620px] tw:leading-[1.6]">{ayuda}</small>
      <div id="esBusy" className={cx('tw:flex tw:gap-2.5 tw:items-center tw:text-[12.5px] tw:text-text tw:bg-card tw:rounded-full tw:py-2 tw:px-3.5 tw:[box-shadow:var(--es-soft)]', !ocupado && 'hidden')}>{ocupado && <><span className="tw:size-3.5 tw:rounded-full tw:border-2 tw:border-[color-mix(in_srgb,var(--brand)_20%,transparent)] tw:border-t-brand tw:animate-[spin_.8s_linear_infinite]" />{ocupado}</>}</div>
    </div>
    {priv && proto.docs.length > 0 && <>
      <div className={cx(PANEL, 'tw:flex tw:flex-col tw:gap-2 tw:p-3.5')}>{proto.docs.map((x, i) => (
        <div key={i} className="tw:flex tw:items-center tw:gap-2.5 tw:[&_button]:w-auto tw:[&_button]:m-0"><span className="xp-ic"><Icono nombre={x.origen === 'Imagen' ? 'image' : 'file'} tam={18} /></span>
          <div className="xp-tx tw:flex-1"><b>{x.name}</b><small>{x.pages} {x.pages === 1 ? 'hoja' : 'hojas'} · {origenDoc(x)}</small></div>
          <button className="ghost small" data-rm={i} title="Quitar" onClick={() => escrituraQuitarDoc(i)}><Icono nombre="x" tam={14} /></button></div>
      ))}</div>
      <div className="row-end"><button className="primary" id="esNext" onClick={() => escrituraIrA('rev')}>Revisar</button></div>
    </>}
  </>;
}
