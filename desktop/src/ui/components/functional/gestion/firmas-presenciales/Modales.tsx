// Formularios en ventana de Firmas presenciales (en el modal de la app, utils/modal.tsx, con las partes del kit:
// VentanaCabecera, VentanaCuerpo y VentanaPie). Los id (#aaActo, #nLista, #esAcc, #tOk…) los usan las pruebas.
/* eslint-disable @typescript-eslint/no-explicit-any -- catálogo del motor notarial */
import { useEffect, useState } from 'react';
import Icono from '../../../ui/Icono';
import Boton from '../../../ui/Boton';
import Input from '../../../ui/Input';
import Select from '../../../ui/Select';
import Textarea from '../../../ui/Textarea';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../../ui/Ventana';
import { Chip } from './Visor';
import { escrituraArchivos, escrituraEstado, useEscritura } from '../../../../store/hooks/useEscritura.hook';
import { cerrarModal } from '../../../../utils/modal';
import { toast } from '../../../../utils/app';
import { SERVICIOS, TRAMITES, clp, fraseEnDocumento, motor, tituloDoc } from '../../../../utils/escrituras';
import { iniciarTramite } from './controlador';
import type { ICotizacion } from '../../../../store/interfaces/escritura.interface';
import { cx } from '../../../../utils/cx';
import { CASILLA, LINEA, MALO, MARCA, avatar } from './estilos';

// textos del cuerpo: párrafo y nota en gris
const P = 'tw:mt-0 tw:mb-3 tw:leading-relaxed';
const NOTA = 'tw:m-0 tw:text-[12.5px] tw:text-muted tw:leading-relaxed';
const CAMPOS = 'tw:flex tw:flex-col tw:gap-3.5';
// el texto completo del documento (estas ventanas se abren anchas: abrirModal con ancho)
const TEXTO_LARGO = 'tw:min-h-[460px] tw:text-[13px]';
// Una notaría de la lista (botón con su radio a la derecha)
const opcion = (on: boolean) => cx('tw:box-border tw:min-w-0 tw:w-full tw:m-0 tw:flex tw:gap-3 tw:items-start tw:text-left tw:p-3.5 tw:rounded-[16px]! tw:bg-card tw:text-text tw:[transition:border-color_.15s,box-shadow_.15s] tw:enabled:hover:border-[color-mix(in_srgb,var(--brand)_30%,var(--line))] tw:disabled:opacity-[.55] tw:disabled:cursor-not-allowed',
  on ? 'tw:border-brand tw:[box-shadow:0_0_0_4px_color-mix(in_srgb,var(--brand)_10%,transparent)]' : 'tw:border-[color:var(--es-line,var(--line))]');
const OPCION_T = 'tw:flex-1 tw:flex tw:flex-col tw:gap-[3px] tw:min-w-0 tw:[&_b]:font-semibold tw:[&_small]:text-muted tw:[&_small]:text-[12px] tw:[&_small]:leading-[1.45]';
const radio = (on: boolean) => cx('tw:size-[18px] tw:rounded-full tw:shrink-0 tw:mt-0.5', on ? 'tw:[box-shadow:inset_0_0_0_5px_var(--brand)]' : 'tw:[box-shadow:inset_0_0_0_1.5px_var(--line)]');

// Un acto que el sistema no detectó: se cobra (escrituras) y queda como caso para aprender
export function AgregarActo() {
  const { MT } = motor();
  const S = useEscritura();
  const [acto, setActo] = useState(''); const [otro, setOtro] = useState(''); const [frase, setFrase] = useState(''); const [msg, setMsg] = useState('');
  const opciones = MT.CATALOGO.filter((x: any) => x.tipo === 'escritura' && x.value !== 'otro').sort((a: any, b: any) => a.label.localeCompare(b.label, 'es'));
  const agregar = () => {
    const f = frase.replace(/\s+/g, ' ').trim(); const o = otro.trim();
    if (!acto || (acto === '__otro' && !o)) return setMsg('Elige el acto.');
    if (f.length < 8) return setMsg('Copia la frase del documento donde aparece el acto.');
    if (!fraseEnDocumento(escrituraEstado(), f)) return setMsg('No encontramos esa frase en el documento. Cópiala tal como aparece.');
    const value = acto === '__otro' ? null : acto; const nombre = value ? MT.BY[value].label : o;
    if (S.agregados.some((x) => (x.value || x.nombre) === (value || nombre))) return setMsg('Ese acto ya está agregado.');
    S.escrituraAgregarActo({ value, nombre, frase: f }); cerrarModal(); toast('Acto agregado');
  };
  return <>
    <VentanaCabecera icono="plus" titulo="Agregar un acto que no detectamos" />
    <VentanaCuerpo>
      <p className="tw:mt-0 tw:mb-4 tw:text-[12.5px] tw:text-muted tw:leading-relaxed">Si el escrito contiene otro acto (por ejemplo, además de la compraventa, un usufructo), indícalo con la frase donde aparece. {S.tramite === 'escritura' ? 'Se suma al cobro según la planilla.' : 'Queda informado a la notaría; la tarifa es fija.'} Nos ayuda a detectarlo solos la próxima vez.</p>
      <div className={CAMPOS}>
        <Select id="aaActo" etiqueta="Acto" vacia="Elige el acto…" value={acto} onChange={(e) => setActo(e.target.value)}>
          {opciones.map((x: any) => <option key={x.value} value={x.value}>{x.label}</option>)}<option value="__otro">Otro (no está en la lista)</option>
        </Select>
        <Input id="aaOtro" etiqueta="Nombre del acto" clasesCampo={acto === '__otro' ? '' : 'hidden'} placeholder="Ej.: Comodato" value={otro} onChange={(e) => setOtro(e.target.value)} />
        <Textarea id="aaFrase" etiqueta="Frase del documento donde aparece" className="tw:min-h-16" placeholder="Copia la frase tal como está en el escrito, p. ej.: «da en comodato a don…»" value={frase} onChange={(e) => setFrase(e.target.value)} />
      </div>
    </VentanaCuerpo>
    <VentanaPie>
      <small className={cx('tw:mr-auto tw:text-[12.5px]', MALO)} id="aaMsg">{msg}</small>
      <Boton id="aaNo" variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
      <Boton id="aaOk" icono="plus" onClick={agregar}>Agregar</Boton>
    </VentanaPie>
  </>;
}

// Antes de usar IA se avisa: el documento sale del computador para leerse
export function ConfirmarIA({ nombres, alResponder }: { nombres: string[]; alResponder: (si: boolean) => void }) {
  const fin = (si: boolean) => { cerrarModal(); alResponder(si); };
  return <>
    <VentanaCabecera icono="sparkle" titulo="Este archivo no es Word" onCerrar={() => fin(false)} />
    <VentanaCuerpo>
      <p className={P}>{nombres.map((n) => `«${n}»`).join(', ')} {nombres.length === 1 ? 'está' : 'están'} en PDF o imagen. Para no cometer errores lo leeremos con <b>IA</b>: está incluido en el valor del trámite.</p>
      <p className={NOTA}>Las hojas se envían de forma segura al servicio de IA solo para leerlas. Si tienes el documento en Word, súbelo en su lugar: la lectura es exacta e inmediata.</p>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="iaNo" variante="secundario" onClick={() => fin(false)}>Subir el Word</Boton>
      <Boton id="iaSi" icono="sparkle" onClick={() => fin(true)}>Leer con IA</Boton>
    </VentanaPie>
  </>;
}

export function Descartar() {
  const S = escrituraEstado();
  return <>
    <VentanaCabecera icono="alert" tonoIcono="amarillo" titulo="¿Descartar el trámite en preparación?" />
    <VentanaCuerpo><p className={NOTA}>«{tituloDoc(S)}» todavía no se ha enviado a la notaría.</p></VentanaCuerpo>
    <VentanaPie>
      <Boton id="nNo" variante="secundario" onClick={cerrarModal}>Seguir con él</Boton>
      <Boton id="nSi" variante="peligro" onClick={() => { cerrarModal(); escrituraEstado().escrituraElegir(null); }}>Descartar y empezar otro</Boton>
    </VentanaPie>
  </>;
}

export function EditarEscritura() {
  const S = escrituraEstado();
  const [titulo, setTitulo] = useState(S.o!.titulo); const [convertir, setConvertir] = useState(!!S.o!.convertir); const [cierre, setCierre] = useState(!!S.o!.cierre); const [raw, setRaw] = useState(S.raw);
  return <>
    <VentanaCabecera icono="edit" titulo="Modificar el texto" descripcion="Corrige lo que necesites; la revisión y la vista para la notaría se actualizan al aplicar." />
    <VentanaCuerpo>
      <div className={CAMPOS}>
        <Input id="eTit" etiqueta="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        <div className="tw:flex tw:gap-[18px] tw:items-center tw:flex-wrap">
          <label className={CASILLA}><input type="checkbox" id="eConv" checked={convertir} onChange={(e) => setConvertir(e.target.checked)} /> Escribir las cifras en palabras</label>
          <label className={CASILLA}><input type="checkbox" id="eCie" checked={cierre} onChange={(e) => setCierre(e.target.checked)} /> Agregar la frase de cierre si falta</label>
        </div>
        <Textarea id="esRaw" aria-label="Texto de la escritura" className={TEXTO_LARGO} value={raw} onChange={(e) => setRaw(e.target.value)} />
      </div>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="tCan" variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
      <Boton id="tOk" onClick={() => { escrituraEstado().escrituraEditarTexto({ titulo: titulo.trim(), convertir, cierre, raw }); cerrarModal(); }}>Aplicar</Boton>
    </VentanaPie>
  </>;
}

export function EditarReduccion() {
  const S = escrituraEstado(); const base: string = S.red?.cuerpo || '';
  const [texto, setTexto] = useState(S.redCuerpo != null ? S.redCuerpo : base);
  return <>
    <VentanaCabecera icono="edit" titulo="Modificar el escrito"
      descripcion={<>Este es el texto de la escritura de reducción (la comparecencia y la transcripción). Lo que está entre <span className={MARCA}>[ ]</span> lo completa la notaría.</>} />
    <VentanaCuerpo>
      <Textarea id="esRed" aria-label="Texto del escrito" className={TEXTO_LARGO} value={texto} onChange={(e) => setTexto(e.target.value)} />
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="rRes" variante="fantasma" tamano="sm" icono="undo" className="tw:mr-auto" onClick={() => setTexto(base)}>Volver al texto generado</Boton>
      <Boton id="rCan" variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
      <Boton id="rOk" onClick={() => { escrituraEstado().escrituraEditarReduccion(texto); cerrarModal(); }}>Aplicar</Boton>
    </VentanaPie>
  </>;
}

// Pagar con el saldo de la cuenta, o recargar lo que falta por la pasarela
export function Pago({ q }: { q: ICotizacion }) {
  const S = escrituraEstado(); const presencial = TRAMITES[S.tramite!].presencial;
  const [saldo, setSaldo] = useState<number | null>(null); const [acepta, setAcepta] = useState(false);
  useEffect(() => { escrituraEstado().escrituraSaldo().then(setSaldo); }, []);
  const total = q.total || 0; const falta = saldo == null ? 0 : Math.max(0, total - saldo);
  const recargar = async () => { const x = await escrituraArchivos.recargar(falta); toast(x.ok ? 'Se abrió la página de pago en tu navegador' : 'No se pudo abrir la recarga: ' + x.error); };
  return <>
    <VentanaCabecera icono="coins" titulo="Pagar y enviar a la notaría" />
    <VentanaCuerpo>
      <div className={cx(LINEA, 'tw:pb-3 tw:text-[17px] tw:[&_b]:font-[650]!')}><b>Total</b><b>{clp(q.total)}</b></div>
      <div className={cx(LINEA, 'tw:[border-top:1px_solid_var(--es-line)] tw:pt-3 tw:text-[13px]')}><span className="muted">Saldo de tu cuenta</span><span id="esSaldo">{saldo == null ? '…' : clp(saldo)}</span></div>
      <div id="esPayBox" className="tw:mt-4 tw:flex tw:flex-col tw:gap-2.5">
        {saldo == null ? null : falta > 0
          ? <p className="tw:m-0 tw:text-[13px] tw:leading-relaxed">Te faltan <b>{clp(falta)}</b>. Recarga tu saldo con tarjeta o transferencia y vuelve a intentarlo.</p>
          : <label className="small tw:flex tw:gap-2 tw:items-start tw:text-[13px] tw:text-text tw:m-0"><input type="checkbox" className="tw:w-auto tw:mt-[3px] tw:mx-0 tw:mb-0" id="esAcc" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} /> Acepto los términos y condiciones{presencial ? ' y entiendo que la firma es presencial en la notaría' : ''}.</label>}
      </div>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="pCan" variante="secundario" onClick={cerrarModal}>{saldo != null && falta > 0 ? 'Cerrar' : 'Cancelar'}</Boton>
      {saldo == null ? null : falta > 0
        ? <Boton id="esTop" icono="coins" onClick={recargar}>Recargar {clp(falta)}</Boton>
        : <Boton id="esPay" onClick={() => { if (!acepta) return toast('Acepta los términos para continuar.'); cerrarModal(); iniciarTramite(q); }}>Pagar {clp(q.total)}</Boton>}
    </VentanaPie>
  </>;
}

// La notaría: etapa obligatoria para todos los trámites (se elige antes de pagar)
export function ElegirNotaria() {
  const S = escrituraEstado(); const lista = S.redNot;
  const [sel, setSel] = useState(S.notaria ? ('auto' in S.notaria ? 'auto' : S.notaria.id) : '');
  const [comuna, setComuna] = useState('');
  const comunas = [...new Set(lista.map((n) => n.comuna))].sort();
  const confirmar = () => {
    const n = sel === 'auto' ? { auto: true as const } : lista.find((x) => x.id === sel);
    if (!n) return;
    escrituraEstado().escrituraNotaria(n); cerrarModal();
    toast('auto' in n ? 'Asignación automática' : `Notaría: ${n.nombre}`);
  };
  return <>
    <VentanaCabecera icono="building" titulo="Elige la notaría"
      descripcion="Todas las notarías de la red trabajan con el mismo formato y reciben el caso por Portalfirma. Sus datos (notario, número y dirección) quedan en el documento." />
    <VentanaCuerpo>
      <Select id="nComuna" etiqueta="Comuna" clasesCampo="tw:mb-3" vacia="Todas" opciones={comunas.map((c) => [c, c])} value={comuna} onChange={(e) => setComuna(e.target.value)} />
      <div className="tw:flex tw:flex-col tw:gap-2" id="nLista">
        {lista.filter((n) => !comuna || n.comuna === comuna).map((n) => {
          const hace = !!S.tramite && n.servicios.includes(S.tramite);
          return (
            <button key={n.id} className={opcion(sel === n.id)} data-nid={n.id} disabled={!hace} onClick={() => setSel(n.id)}>
              <span className={avatar('brand')}><Icono nombre="building" tam={16} /></span>
              <span className={OPCION_T}><b>{n.nombre}</b><small>{n.notario}{n.titular ? '' : ' (suplente)'} · {n.dirCorta || n.direccion}, {n.comuna}</small>
                <small><Icono nombre="calendar" tam={11} /> {n.horario} · toma el caso en {n.tomaHoras} h</small>
                <span className="tw:flex tw:gap-[5px] tw:flex-wrap tw:mt-[3px]">{n.servicios.map((x) => <Chip key={x} color={x === S.tramite ? '#13804b' : '#64748b'}>{SERVICIOS[x]}</Chip>)}{n.prueba && <Chip color="#b26a00">Prueba</Chip>}</span>
                {!hace && S.tramite && <small className={MALO}>No realiza {SERVICIOS[S.tramite].toLowerCase()}</small>}</span>
              <span className={radio(sel === n.id)} />
            </button>
          );
        })}
        <button className={opcion(sel === 'auto')} data-nid="auto" onClick={() => setSel('auto')}>
          <span className={avatar('brand-off')}><Icono nombre="flow" tam={16} /></span>
          <span className={OPCION_T}><b>Asignación automática</b><small>La primera notaría disponible de la red toma el caso. Los datos del notario quedan para que los complete la notaría.</small></span><span className={radio(sel === 'auto')} />
        </button>
      </div>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="nCan" variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
      <Boton id="nOk" disabled={!sel} onClick={confirmar}>Confirmar notaría</Boton>
    </VentanaPie>
  </>;
}

// El servicio de la notaría aún no está conectado: no se cobró nada
export function NoDisponibleAun({ mensaje, privado }: { mensaje: string; privado: boolean }) {
  return <>
    <VentanaCabecera icono="clock" tonoIcono="amarillo" titulo="Aún no disponible" />
    <VentanaCuerpo>
      <p className={P}>{mensaje}</p>
      <p className={NOTA}>No se cobró nada.{privado ? '' : ' Puedes descargar el Word o el PDF desde la vista previa.'}</p>
    </VentanaCuerpo>
    <VentanaPie><Boton id="mOkP" onClick={cerrarModal}>Entendido</Boton></VentanaPie>
  </>;
}
