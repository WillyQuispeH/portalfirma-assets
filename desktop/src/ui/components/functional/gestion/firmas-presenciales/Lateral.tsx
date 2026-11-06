// La columna derecha del trámite: el precio, la notaría elegida, y quiénes firman (comparecientes de la escritura,
// o participantes y contacto del documento privado).
/* eslint-disable @typescript-eslint/no-explicit-any -- resultados del motor notarial */
import Icono from '../../../ui/Icono';
import { Chip } from './Visor';
import { ElegirNotaria } from './Modales';
import { useEscritura } from '../../../../store/hooks/useEscritura.hook';
import { abrirModal } from '../../../../utils/modal';
import { asistentes, clp, iniciales, motor } from '../../../../utils/escrituras';
import type { ICotizacion } from '../../../../store/interfaces/escritura.interface';
import { cx } from '../../../../utils/cx';
import { CAMPO, LINEA, MALO, NOTARIA, NOTARIA_BOTON, PERSONAS, PERSONAS_H, PERSONA_INFO, PRECIO, avatar, persona } from './estilos';

const CAMPO_PERSONA = cx(CAMPO, 'tw:min-w-0');

export function Precio({ q }: { q: ICotizacion }) {
  const { MT } = motor();
  return (
    <div className={PRECIO}><small className="muted">{q.cotizacion ? 'Valor' : 'Total a pagar'}</small><b id="esTotal">{q.total == null ? 'Por cotizar' : clp(q.total)}</b>
      {q.lineas.map((l, i) => <div key={i} className={cx(LINEA, 'tw:text-[12.5px] tw:[&>span:first-child]:flex tw:[&>span:first-child]:flex-col')}><span>{l.concepto}<small className="muted">{l.detalle}</small></span><span>{clp(l.monto)}</span></div>)}
      <small className="muted tw:-mt-1.5 tw:text-[11.5px]">Valores vigentes al {new Date(MT.TARIFAS.vigencia + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}, sujetos a modificación.</small></div>
  );
}

const elegir = () => abrirModal(<ElegirNotaria />, { clave: 'modal-104', ancho: true });

export function TarjetaNotaria() {
  const { notaria: n } = useEscritura();
  if (!n) return (
    <div className={NOTARIA(true)}><div className={PERSONAS_H}><b>Notaría</b><small className="muted">paso obligatorio</small></div>
      <p className="small muted">Elige dónde se hará el trámite. Sus datos quedan en el documento y la notaría recibe el caso al pagar.</p>
      <button className="ghost with-ic" data-notsel onClick={elegir}><Icono nombre="building" tam={15} /><span>Elegir notaría</span></button></div>
  );
  if ('auto' in n) return (
    <div className={NOTARIA()}><div className={PERSONAS_H}><b>Notaría</b><button className={`ghost small ${NOTARIA_BOTON}`} data-notsel onClick={elegir}>Cambiar</button></div>
      <div className={persona(true)}><span className={avatar('brand')}><Icono nombre="flow" tam={16} /></span><div className={PERSONA_INFO}><b>Asignación automática</b><small className="muted">La primera notaría disponible de la red toma el caso. Sus datos los completa al recibirlo.</small></div></div></div>
  );
  return (
    <div className={NOTARIA()}><div className={PERSONAS_H}><b>Notaría</b><button className={`ghost small ${NOTARIA_BOTON}`} data-notsel onClick={elegir}>Cambiar</button></div>
      <div className={persona(true)}><span className={avatar('brand')}><Icono nombre="building" tam={16} /></span><div className={PERSONA_INFO}><b id="esNotNom">{n.nombre}</b>
        <small className="muted">{n.notario}{n.titular ? '' : ' (suplente)'} · {n.dirCorta || n.direccion}, {n.comuna}</small>
        <small className="muted"><Icono nombre="calendar" tam={11} /> {n.horario}</small>{n.prueba && <Chip color="#b26a00">Datos de prueba</Chip>}</div></div></div>
  );
}

// Escritura: los comparecientes y, de los que firman, su correo y teléfono (la notaría los cita)
export function Comparecientes() {
  const S = useEscritura(); const { N } = motor();
  const lista = asistentes(S);
  return (
    <div className={PERSONAS}><div className={PERSONAS_H}><b>Comparecientes</b><small className="muted">{lista.filter((c) => c.asiste).length} firman</small></div>
      {lista.length ? lista.map((c: any, i: number) => {
        const ct = S.contactos[c.nombre] || {};
        return (
          <div key={c.nombre + i} className={persona(i === 0)}><span className={avatar(c.asiste ? 'ok' : 'off')}>{iniciales(c.nombre)}</span><div className={PERSONA_INFO}><b>{c.nombre}</b>
            <small className="muted">{c.rut ? <span className={c.rutOk ? '' : MALO}>{N.fmtRut(c.rut, c.dv)}</span> : <span className={MALO}>sin RUT</span>}{c.calidad ? ' · ' + c.calidad : ''}</small>
            <Chip color={c.asiste ? '#13804b' : '#64748b'} clase="tw:self-start">{c.asiste ? 'Firma en la notaría' : 'Representado'}</Chip>
            {c.asiste ? <>
              {/* no controlados, como antes: se guarda sin espacios al final mientras se escribe */}
              <input className={CAMPO_PERSONA} data-ct={i} data-f="email" defaultValue={ct.email || ''} placeholder="Correo" onChange={(e) => S.escrituraContacto(c.nombre, 'email', e.target.value)} />
              <input className={CAMPO_PERSONA} data-ct={i} data-f="tel" defaultValue={ct.tel || ''} placeholder="Teléfono" onChange={(e) => S.escrituraContacto(c.nombre, 'tel', e.target.value)} />
            </> : <small className="muted">{c.motivo}</small>}
          </div></div>
        );
      }) : <p className="muted small">No encontramos comparecientes con el formato «NOMBRE, nacionalidad, estado civil…».</p>}
    </div>
  );
}

// Documento privado: los participantes, la declaración (reducción) y el contacto del cliente
export function Contacto() {
  const S = useEscritura(); const { N } = motor();
  const d = S.proto.d!; const info = S.proto.info; const red = S.tramite === 'reduccion';
  const firmas: any[] = red ? S.red?.sigs || [] : [];
  const firmaAhi = (nombre: string) => firmas.some((g) => N.fold(g.name).includes(N.fold(nombre)) || N.fold(nombre).includes(N.fold(g.name)));
  return <>
    <div className={PERSONAS}><div className={PERSONAS_H}><b>Participantes</b><small className="muted">{info.participantes.length}</small></div>
      {info.participantes.length ? info.participantes.map((p: any, i: number) => (
        <div key={p.nombre + i} className={persona(i === 0)}><span className={avatar()}>{iniciales(p.nombre)}</span><div className={PERSONA_INFO}><b>{p.nombre}</b>
          <small className="muted">{[p.rut, p.rol].filter(Boolean).join(' · ') || (p.tipo === 'empresa' ? 'Empresa' : '')}</small>
          {red && firmaAhi(p.nombre) && <Chip color="#13804b" clase="tw:self-start">Firma en la notaría</Chip>}</div></div>
      )) : <p className="muted small">No se identifican participantes.</p>}
    </div>
    {red && (
      <div className={cx('tw:rounded-[14px] tw:py-3 tw:px-3.5 tw:mt-2.5', info.firmas.hay ? 'tw:[box-shadow:inset_0_0_0_1px_var(--es-line)]' : 'tw:bg-[color-mix(in_srgb,#fff6e0_60%,var(--card))] tw:[box-shadow:inset_0_0_0_1px_color-mix(in_srgb,#d08a00_25%,transparent)]')}>
        {!info.firmas.hay && <p className="small tw:mt-0 tw:mx-0 tw:mb-2 tw:text-[#7a4d00] tw:flex tw:gap-1.5 tw:items-center"><Icono nombre="alert" tam={13} /> No detectamos firmas: solo se puede reducir un documento ya firmado.</p>}
        <label className="chk tw:flex tw:gap-2.5 tw:items-start tw:text-[13px] tw:text-text tw:m-0 tw:leading-[1.5] tw:[&>span]:flex-1"><input type="checkbox" className="tw:w-auto tw:mt-[3px] tw:mx-0 tw:mb-0 tw:accent-brand" id="esDecl" checked={d.declara} onChange={(e) => S.escrituraDato('declara', e.target.checked)} /><span>Declaro que el documento es real, está firmado y llevaré el <b>original firmado</b> a la notaría.</span></label>
      </div>
    )}
    <div className={PERSONAS}><div className={PERSONAS_H}><b>Tu contacto</b></div>
      <input className={CAMPO} data-k="email" value={d.email} placeholder="Correo" onChange={(e) => S.escrituraDato('email', e.target.value)} />
      <input className={CAMPO} data-k="tel" value={d.tel} placeholder={`Teléfono${red ? '' : ' (opcional)'}`} onChange={(e) => S.escrituraDato('tel', e.target.value)} />
      <textarea className="tw:w-full tw:min-w-0 tw:min-h-14 tw:m-0 tw:py-3 tw:px-3.5 tw:text-[12.5px] tw:resize-y tw:box-border" data-k="nota" placeholder="Nota para la notaría (opcional)" value={d.nota} onChange={(e) => S.escrituraDato('nota', e.target.value)} />
    </div>
  </>;
}
