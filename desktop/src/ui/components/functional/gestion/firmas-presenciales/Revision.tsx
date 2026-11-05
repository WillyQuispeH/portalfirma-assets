// La revisión del documento: la materia (y su precio según la planilla), las materias ocultas en el texto,
// las observaciones con su corrección de un clic, la ficha de un documento privado y el texto de la carátula.
/* eslint-disable @typescript-eslint/no-explicit-any -- resultados del motor notarial */
import Icono from '../../../ui/Icono';
import { Chip } from './Visor';
import { AgregarActo } from './Modales';
import { useEscritura } from '../../../../store/hooks/useEscritura.hook';
import { abrirModal } from '../../../../utils/modal';
import { toast } from '../../../../utils/app';
import { SEVERIDAD, clp, esPrivado, motor, observaciones, ocultos, origenes, sinPrefijo, tarifaTexto, textoCaratula, totalHojas } from '../../../../utils/escrituras';
import type { ReactNode } from 'react';
import { cx } from '../../../../utils/cx';
import { ALERTA, COLOR_ALERTA, MARCA, SW, SW_INPUT, SW_RIEL, seccion } from './estilos';

// La materia: encabezado con ícono, nombre, coincidencia y precio
const MATERIA = 'tw:rounded-[18px] tw:py-[18px] tw:px-5 tw:mb-4 tw:bg-[radial-gradient(120%_140%_at_0%_0%,color-mix(in_srgb,#3d9cf0_9%,var(--card)),var(--card)_60%)] tw:[box-shadow:inset_0_0_0_1px_color-mix(in_srgb,var(--brand)_14%,transparent)]';
const MATERIA_H = 'tw:flex tw:items-center tw:gap-3.5 tw:flex-wrap';
const MATERIA_IC = 'tw:size-[38px] tw:rounded-[12px] tw:grid tw:place-items-center tw:bg-[image:var(--grad)] tw:text-white tw:[box-shadow:0_6px_14px_-6px_rgba(63,79,230,.6)]';
const MATERIA_T = 'tw:flex tw:flex-col tw:flex-1 tw:min-w-[200px] tw:gap-0.5 tw:[&_small]:text-[11.5px] tw:[&_b]:text-[17px] tw:[&_b]:font-semibold tw:[&_b]:tracking-[-.01em]';
const MATERIA_P = 'tw:text-[19px] tw:font-[650] tw:tracking-[-.01em] tw:[&_small]:font-normal tw:[&_small]:text-[11.5px]';

// Materias ocultas (es-hid la usan las pruebas). Todos los <small> de la caja van en gris, también la nota de un acto desmarcado.
const OCULTOS = 'es-hid tw:rounded-[18px] tw:py-4 tw:px-[18px] tw:mb-2 tw:flex tw:[&_small]:text-muted tw:[&_small]:leading-[1.5] tw:[&_small]:text-[12.5px]';
const OCULTOS_AVISO = 'tw:flex-col tw:gap-2.5 tw:[box-shadow:inset_0_0_0_1px_color-mix(in_srgb,#d08a00_22%,transparent)] tw:bg-[color-mix(in_srgb,#fff6e0_45%,var(--card))]';
// Sin materias ocultas: todos los div de adentro van en columna (también los de los actos agregados)
const OCULTOS_OK = 'tw:flex-row tw:items-start tw:gap-3 tw:[box-shadow:inset_0_0_0_1px_color-mix(in_srgb,var(--ok)_18%,transparent)] tw:bg-[color-mix(in_srgb,var(--ok-soft)_55%,var(--card))] tw:[&_div]:flex tw:[&_div]:flex-col tw:[&_div]:gap-[3px]';
const OCULTOS_IC = 'tw:size-[30px] tw:rounded-[10px] tw:grid tw:place-items-center tw:shrink-0';
const ACTO = 'tw:bg-card tw:rounded-[14px] tw:py-3 tw:px-3.5 tw:flex tw:flex-col tw:gap-1.5 tw:[transition:opacity_.2s]';
const ACTO_T = 'tw:flex tw:items-center tw:gap-2.5 tw:[&_b]:font-semibold tw:[&_b]:text-[13.5px] tw:[&_button]:w-auto tw:[&_button]:m-0';
const ACTO_CL = 'tw:text-[11px] tw:text-muted tw:bg-bg tw:rounded-full tw:py-0.5 tw:px-2';
const ACTO_P = 'tw:ml-auto tw:font-semibold tw:text-[13px]';
const cita = (agregado: boolean) => cx('tw:text-[12px] tw:text-[#4a5160] tw:dark:text-muted tw:leading-[1.5] tw:italic tw:pl-2.5 tw:border-l-2 tw:[quotes:none]',
  agregado ? 'tw:border-l-[color-mix(in_srgb,#3f4fe6_40%,transparent)]' : 'tw:border-l-[color-mix(in_srgb,#d08a00_35%,transparent)]');
const CHIP_ALERTA = "tw:bg-transparent! tw:p-0 tw:min-w-[62px] tw:shrink-0 tw:before:content-[''] tw:before:size-[7px] tw:before:rounded-full tw:before:bg-[color:var(--c)]";
// Filas etiqueta / valor de la ficha. Todos los span van en gris.
const FILAS = 'tw:flex tw:flex-col tw:rounded-[14px] tw:overflow-hidden tw:mt-2.5 tw:mb-4 tw:[box-shadow:inset_0_0_0_1px_var(--es-line)] tw:[&>div]:grid tw:[&>div]:grid-cols-[170px_1fr] tw:[&>div]:gap-2.5 tw:[&>div]:py-[11px] tw:[&>div]:px-3.5 tw:[&>div]:text-[13px] tw:[&>div+div]:border-t tw:[&>div+div]:border-t-[color:var(--es-line)] tw:[&_span]:text-muted tw:[&_b]:font-[550] tw:[&_small]:font-normal';

const colorConfianza = (c: string) => (c === 'alta' ? '#13804b' : c === 'media' ? '#b26a00' : '#c0362c');

export function Materia() {
  const S = useEscritura(); const { MT } = motor();
  const { materia, sug, tramite, escrituraMateria } = S;
  const m = MT.BY[materia || '']; const top = sug[0]; const auto = top && top.value === materia;
  const opciones = MT.CATALOGO.filter((x: any) => x.tipo === 'escritura' || x.value === 'otro');
  const noCoincide = tramite === 'escritura' && ocultos(S).some((x) => x.principal);
  return (
    <div className={MATERIA}>
      <div className={MATERIA_H}><span className={MATERIA_IC}><Icono nombre="sparkle" tam={18} /></span>
        <div className={MATERIA_T}><small className="muted">Materia {tramite === 'reduccion' ? 'del instrumento' : 'identificada'}</small><b id="esMatLbl">{m?.label || '—'}</b></div>
        {noCoincide ? <Chip color="#c0362c">El contenido no coincide</Chip> : auto ? <Chip color={colorConfianza(top.confianza)}>Coincidencia {top.confianza}</Chip> : <Chip color="#3f4fe6">Elegida por ti</Chip>}
        <span className={MATERIA_P}>{tramite === 'reduccion' ? <>{clp(MT.TARIFAS.reduccion)} <small className="muted">tarifa fija</small></> : m ? tarifaTexto(m) : ''}</span>
      </div>
      {auto && top.motivo && <p className="small tw:text-[var(--hint)] tw:mt-3 tw:mx-0 tw:mb-0 tw:flex tw:gap-1.5 tw:items-start tw:leading-[1.5]"><Icono nombre="alert" tam={13} /> {top.motivo}</p>}
      <div className="tw:mt-3 tw:flex tw:flex-col tw:gap-2">
        <label className="tw:m-0">Cambiar materia
          <select className="tw:w-full tw:mt-[5px]" id="esMat" value={materia || ''} onChange={(e) => escrituraMateria(e.target.value)}>
            {opciones.map((x: any) => <option key={x.value} value={x.value}>{x.label} — {tarifaTexto(x)}</option>)}
          </select>
        </label>
        {sug.length > 1 && (
          <div className="small"><span className="muted">También podría ser:</span>{' '}
            {sug.filter((x) => x.value !== materia).slice(0, 3).map((x, i) => <span key={x.value}>{i > 0 && ' · '}<button className="link tw:w-auto tw:my-0 tw:mx-0.5 tw:p-0 tw:bg-transparent tw:border-0 tw:border-b tw:border-b-[color-mix(in_srgb,var(--brand)_35%,transparent)] tw:text-brand tw:font-medium tw:text-[12px] tw:no-underline tw:rounded-none! tw:cursor-pointer" data-sug={x.value} onClick={() => escrituraMateria(x.value)}>{x.label}</button></span>)}
          </div>
        )}
      </div>
    </div>
  );
}

// Documento privado (protocolización y reducción): lo que se detectó, de solo lectura
export function FichaPrivado() {
  const S = useEscritura(); const { MT } = motor();
  const info = S.proto.info; const red = S.tramite === 'reduccion'; const m = MT.BY[S.materia || ''];
  const fila = (k: string, v: ReactNode) => <div key={k}><span>{k}</span><b>{v}</b></div>;
  const firmas = [
    ...info.firmas.electronicas.map((f: any) => <span key={'e' + f.nombre}>{f.nombre} <small className="muted">firma electrónica{f.fecha ? ' · ' + f.fecha.toLocaleDateString('es-CL') : ''}</small></span>),
    ...info.firmas.lineas.map((n: string) => <span key={'l' + n}>{n}</span>),
  ];
  return <>
    <div className={MATERIA}><div className={MATERIA_H}><span className={MATERIA_IC}><Icono nombre="sparkle" tam={18} /></span>
      <div className={MATERIA_T}><small className="muted">Tipo de documento detectado</small><b id="esMatLbl">{sinPrefijo(m?.label || '—')}</b></div>
      <Chip color="#3f4fe6"><Icono nombre="lock" tam={11} /> Automático</Chip>
      <span className={MATERIA_P}>{clp(red ? MT.TARIFAS.reduccion : MT.TARIFAS.protocolizacion)} <small className="muted">tarifa fija</small></span></div></div>
    <div className="es-ficha tw:mt-1 tw:mx-0 tw:mb-4"><div className={FILAS}>
      {fila('Documento', info.titulo)}
      {fila('Hojas', String(totalHojas(S)))}
      {fila('Lectura', origenes(S))}
      {fila('Firmas', firmas.length ? firmas.map((f, i) => <span key={i}>{i > 0 && <br />}{f}</span>) : <span className="muted">No se detectan firmas</span>)}
      {info.fechaDocumento && fila('Fecha', info.fechaDocumento.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }))}
      {info.patente && fila('Placa patente', info.patente)}
      {red ? fila('Escrito', S.red?.modo === 'partes' ? 'Comparecen las mismas partes del documento' : <>Comparece quien lo presenta <span className={MARCA}>lo completa la notaría</span></>)
        : fila('Requirente', <span className={MARCA}>Lo completa la notaría</span>)}
    </div></div>
  </>;
}

function Agregados() {
  const S = useEscritura(); const { MT } = motor();
  const escritura = S.tramite === 'escritura';
  return <>
    {S.agregados.map((x, i) => (
      <div key={i} className={cx(ACTO, 'tw:[box-shadow:inset_0_0_0_1px_color-mix(in_srgb,#3f4fe6_22%,transparent)]')}><div className={ACTO_T}><b>{x.nombre}</b><span className={ACTO_CL}>Agregado por ti</span>
        <span className={ACTO_P}>{escritura && x.value && MT.BY[x.value] ? clp(MT.precio(x.value).monto) : 'informado'}</span>
        <button className="ghost small" data-quitar={i} title="Quitar" onClick={() => S.escrituraQuitarAgregado(i)}><Icono nombre="x" tam={13} /></button></div>
        <q className={cita(true)}>{x.frase}</q></div>
    ))}
    <button className="link tw:self-start tw:inline-flex tw:items-center tw:gap-[5px] tw:text-[12.5px] tw:mt-1 tw:w-auto" id="esAddActo" onClick={() => abrirModal(<AgregarActo />)}><Icono nombre="plus" tam={13} /> Agregar un acto que no detectamos</button>
  </>;
}

export function Ocultos() {
  const S = useEscritura(); const { MT } = motor();
  const lista = ocultos(S); const red = S.tramite === 'reduccion'; const proto = S.tramite === 'protocolizacion';
  const principales = lista.filter((x) => x.principal);
  const declarada = MT.BY[S.materia || '']?.label || 'la materia declarada';
  if (!lista.length) return (
    <div className={cx(OCULTOS, OCULTOS_OK)}><span className={cx(OCULTOS_IC, 'tw:bg-[color-mix(in_srgb,var(--ok)_14%,var(--card))] tw:text-ok')}><Icono nombre="check" tam={15} /></span><div><b>Sin materias ocultas</b>
      <small>Revisamos el texto completo buscando {MT.actosRevisados()} tipos de actos (compraventas, hipotecas, prendas, poderes, cesiones, donaciones, alzamientos…). Solo encontramos «{declarada}».</small><Agregados /></div></div>
  );
  return (
    <div className={cx(OCULTOS, OCULTOS_AVISO)}>
      <div className="tw:flex tw:gap-3 tw:items-start tw:[&_div]:flex tw:[&_div]:flex-col tw:[&_div]:gap-[3px]"><span className={cx(OCULTOS_IC, 'tw:bg-[color-mix(in_srgb,#d08a00_15%,var(--card))] tw:text-[#a56a00]')}><Icono nombre="search" tam={15} /></span><div><b>Materias ocultas en el texto</b>
        <small>Revisamos el escrito completo: además de «{declarada}», contiene {lista.length === 1 ? 'este acto' : 'estos actos'}. {proto ? 'La protocolización tiene tarifa fija; quedan informados a la notaría.' : red ? 'Están incluidos en la tarifa fija de la reducción; quedan informados a la notaría.' : 'Cada acto se cobra aparte según la planilla.'}</small></div></div>
      {principales.length > 0 && !proto && (
        <div className="tw:flex tw:gap-2 tw:items-center tw:flex-wrap tw:text-[13px] tw:text-[#9b2c22] tw:bg-[color-mix(in_srgb,var(--err)_7%,var(--card))] tw:rounded-[12px] tw:py-2.5 tw:px-3 tw:[&_span]:flex-1 tw:[&_span]:min-w-[220px] tw:[&_button]:w-auto tw:[&_button]:m-0"><Icono nombre="alert" tam={14} />
          <span>El escrito se presenta como <b>{declarada}</b>, pero su contenido corresponde a <b>{principales.map((x) => x.nombre).join(' y ')}</b>.</span>
          {principales[0].value && <button className="ghost small" data-main={principales[0].value} onClick={() => { S.escrituraMateria(principales[0].value); toast('Materia principal actualizada'); }}>Usar {principales[0].nombre} como materia</button>}
        </div>
      )}
      {lista.map((x, i) => {
        const on = !S.descartados.has(x.value); const p = x.cobra ? MT.precio(x.value).monto : null;
        return (
          <div key={(x.value || x.nombre) + i} className={cx(ACTO, 'tw:[box-shadow:0_1px_2px_rgba(16,24,64,.05)]', !on && 'tw:opacity-[.62]')}>
            <div className={ACTO_T}><b>{x.nombre}</b>{x.clausula && <span className={ACTO_CL}>{x.clausula === 'comparecencia' ? 'Comparecencia' : 'Cláusula ' + x.clausula.toLowerCase()}</span>}
              <span className={ACTO_P}>{x.cobra ? (on ? clp(p) : 'no se cobrará') : x.value ? 'incluido' : 'informativo'}</span>
              {x.cobra && <label className={`es-sw ${SW}`}><input type="checkbox" className={SW_INPUT} data-acto={x.value} checked={on} onChange={(e) => S.escrituraActo(x.value, e.target.checked)} /><span className={SW_RIEL} /></label>}</div>
            <q className={cita(false)}>{x.cita}</q>
            {!on && <small>Lo desmarcaste: la notaría verá el aviso y podrá pedir un ajuste de tarifa si corresponde.</small>}
          </div>
        );
      })}
      <Agregados />
    </div>
  );
}

export function Observaciones() {
  const S = useEscritura(); const priv = esPrivado(S); const al = observaciones(S);
  const corregibles = !priv && al.some((x) => x.fix && x.fix.type !== 'cierre');
  return <>
    <div className={seccion(true)}><h3>Observaciones</h3>
      {corregibles && <button className="primary small with-ic" id="esFixAll" onClick={() => { S.escrituraCorregirTodo(); toast('Correcciones aplicadas'); }}><Icono nombre="check" tam={14} /><span>Corregir todo lo sugerido</span></button>}</div>
    <div className="es-alerts tw:flex tw:flex-col tw:gap-1.5">
      {al.length ? al.map((x, i) => (
        <div key={(x.id || '') + i} className={cx(ALERTA, COLOR_ALERTA[x.sev] || COLOR_ALERTA.info, 'tw:[&_button]:w-auto tw:[&_button]:m-0 tw:[&_button]:shrink-0')}><Chip color={SEVERIDAD[x.sev][1]} clase={CHIP_ALERTA}>{SEVERIDAD[x.sev][0]}</Chip><span className="tw:flex-1">{x.text}</span>
          {!priv && x.fix && x.fix.type !== 'cierre' && <button className="ghost small" data-fix={x.id} onClick={() => { S.escrituraCorregir(x.fix); toast('Corregido'); }}>Corregir</button>}</div>
      )) : <div className={cx(ALERTA, COLOR_ALERTA.ok)}><Chip color="#13804b" clase={CHIP_ALERTA}>Bien</Chip><span>No encontramos problemas en el documento.</span></div>}
    </div>
  </>;
}

// El texto de la carátula: **negrita** y [lo que completa la notaría]
export function Caratula() {
  const S = useEscritura();
  const partes = textoCaratula(S).split(/(\*\*[^*]+\*\*|\[[^\]]+\])/).filter(Boolean);
  return <>
    <h4>Texto de la carátula</h4>
    <div className="tw:mt-4 tw:bg-[color-mix(in_srgb,var(--bg)_50%,var(--card))] tw:rounded-[16px] tw:py-[18px] tw:px-5 tw:font-[Verdana,Tahoma,sans-serif] tw:text-[13px] tw:leading-[1.75] tw:text-justify tw:[box-shadow:inset_0_0_0_1px_var(--es-line)]" id="prTxt">{partes.map((p, i) => (p.startsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : p.startsWith('[') ? <span key={i} className={MARCA}>{p}</span> : p))}</div>
  </>;
}
