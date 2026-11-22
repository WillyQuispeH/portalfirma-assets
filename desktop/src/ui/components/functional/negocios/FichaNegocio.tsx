// Detalle de un negocio, pensado para actuar y a la altura de la ventana (Layout altoCompleto): la cabecera lleva «volver»,
// una línea de resumen y UN botón principal («Siguiente: …», «Ver propiedad» y «⋯» para perder o eliminar); debajo, las
// etapas en columnas (la actual con su paso destacado), y abajo una barra a todo el ancho con Personas, Condiciones,
// Documentos e Historial: cada botón muestra un resumen de una línea y abre su detalle en un modal.
// Lo monta Negocios.abrirNegocio(id) (src/renderer/negocios.js) en #view-negocios, el mismo contenedor del
// tablero, con el negocio ya leído (negObtener) y sus acciones: las llamadas a la API y las ventanas siguen allá.
// Los pasos los dibuja src/renderer/etapas.js (Etapas.bloque con foco) en #ngEt, que React deja vacío.
// Las pruebas y Aprende usan .ng-ficha, .im-ft, #ngBack, #ngEt, #ngNota (#ngNotaT), #ngProp («Ver propiedad», en la cabecera), #ngCorSel y #ngCond,
// además de #ngSig (botón principal), #ngMas («⋯»: #ngLost y #ngDel van dentro) y los botones de la barra #ngPlPers, #ngPlCond,
// #ngPlDoc y #ngPlHist (#ngCorSel, #ngNota, #ngNotaT y #ngCond solo existen con su modal abierto).
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Layout from '../../ui/Layout';
import Boton from '../../ui/Boton';
import Modal from '../../ui/Modal';
import Badge from '../../ui/Badge';
import Avatar from '../../ui/Avatar';
import Icono from '../../ui/Icono';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import EstadoVacio from '../../ui/EstadoVacio';
import { ListaActividad, copiarCorreo, precio, whatsapp } from '../ficha/comun';
import { abrirFicha, avisarAyuda } from '../../../utils/app';
import { cx } from '../../../utils/cx';
import { fecha } from '../../../utils/formato';
import MenuMas from '../../ui/MenuMas';
import { SUAVE, type TTono } from '../../ui/tonos';
import type { IDocumentoNegocio, IEtapa, IMonto, INegocioDetalle } from '../../../store/interfaces/negocio.interface';

const TIPO = { venta: 'Venta', arriendo: 'Arriendo' } as const;
const CLIENTE = { venta: 'Comprador', arriendo: 'Arrendatario' } as const;

const valorTxt = (v: IMonto | null, tipo: keyof typeof TIPO) => (v ? precio(v) + (tipo === 'arriendo' ? '/mes' : '') : '');
const comisionTxt = (n: INegocioDetalle) => (n.comisionMonto != null ? precio({ valor: n.comisionMonto, moneda: n.valor?.moneda || 'UF' }) : '—');

export interface IFichaNegocioAcciones {
  volver: () => void;
  pasos: (el: HTMLElement) => void; // Etapas.bloque en #ngEt
  mover: (etapa: string) => void;
  tarea: (i: number, hecha: boolean) => void;
  siguiente: () => void;
  ganar: () => void;
  perder: () => void;
  reabrir: () => void;
  eliminar: () => void;
  corredor: (id: string) => void;
  proximaAccion: (texto: string, fecha: string) => void;
  nota: (texto: string) => void;
  condiciones: (c: { valor: string; moneda: string; comision: string; tipoComision: string; cierreEstimado: string; pagada?: string }) => void;
  enviarFirma: () => void;
  vincularFirma: () => void;
  revisarFirmas: () => void;
  verOperacion: () => void;
  quitarFirma: () => void;
}

export interface IFichaNegocioProps {
  n: INegocioDetalle;
  etapas: IEtapa[];
  corredores?: { id: string; nombre: string }[] | null; // solo el administrador puede reasignar
  vez: number; // negocios.js la sube en cada recarga: los formularios vuelven a los datos guardados
  acc: IFichaNegocioAcciones;
}

// ---------- acción principal: lo que sigue en este negocio (botón de la cabecera) ----------
interface IAccionPrincipal { texto: string; icono: string; alTocar: () => void }
function accionPrincipal(n: INegocioDetalle, etapas: IEtapa[], acc: IFichaNegocioAcciones): IAccionPrincipal {
  if (n.estado !== 'abierto') return { texto: 'Reabrir', icono: 'undo', alTocar: acc.reabrir };
  const e = n.etapaInfo; const f = n.firmas?.[n.etapa]; const sig = etapas[(n.orden ?? 0) + 1];
  // la etapa pide un documento firmado: eso es lo siguiente (enviarlo, o ver cómo va su firma)
  if (e?.firma && f?.estado !== 'firmado') {
    return f?.operacion
      ? { texto: 'Siguiente: revisar la firma', icono: 'sign', alTocar: acc.revisarFirmas }
      : { texto: `Siguiente: enviar ${e.firma} a firmar`, icono: 'sign', alTocar: acc.enviarFirma };
  }
  if (sig) return { texto: `Siguiente: pasar a «${sig.t}»`, icono: 'arrowR', alTocar: acc.siguiente };
  return { texto: 'Marcar como ganado', icono: 'check', alTocar: acc.ganar };
}

// Los pasos de etapas.js se dibujan en el MISMO contenedor en cada recarga (como la captación de la ficha):
// una columna por etapa, que estira hasta la barra de abajo y se desplaza por dentro.
function Pasos({ vez, pasos }: { vez: number; pasos: (el: HTMLElement) => void }) {
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = caja.current; if (!el) return;
    pasos(el);
  }, [vez]); // eslint-disable-line react-hooks/exhaustive-deps -- «pasos» cambia en cada recarga junto con vez
  return <div id="ngEt" className="ng-et tw:min-h-0 tw:flex-1" ref={caja} />;
}

// ---------- barra de abajo: un botón por sección (con su resumen) que abre el detalle en un modal ----------
interface ISeccion { id: string; titulo: string; icono: string; tono: TTono; resumen: string; clave: string; contenido: ReactNode }

function BarraSecciones({ secciones }: { secciones: ISeccion[] }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const actual = secciones.find((x) => x.id === abierta);
  return (
    <>
      <nav aria-label="Detalle del negocio"
        className="tw:grid tw:flex-none tw:grid-cols-4 tw:overflow-hidden tw:rounded-card tw:border tw:border-solid tw:border-edge tw:border-b-[3px] tw:border-b-edge-b tw:bg-card">
        {secciones.map((x) => (
          <button key={x.id} type="button" id={x.id} aria-haspopup="dialog" onClick={() => setAbierta(x.id)}
            className="tw:flex tw:min-w-0 tw:items-center tw:gap-3 tw:m-0 tw:px-4 tw:py-3 tw:rounded-none tw:border-0 tw:border-l tw:border-solid tw:border-edge tw:first:border-l-0 tw:bg-transparent tw:text-left tw:font-[inherit] tw:text-text tw:cursor-pointer tw:hover:bg-hover tw:focus-visible:outline-2 tw:focus-visible:outline-offset-[-3px] tw:focus-visible:outline-lav-edge">
            <span className={cx('tw:grid tw:size-9 tw:flex-none tw:place-items-center tw:rounded-icono', SUAVE[x.tono])}><Icono nombre={x.icono} tam={16} /></span>
            <span className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col">
              <b className="tw:truncate tw:text-sm tw:font-semibold">{x.titulo}</b>
              <small className="tw:truncate tw:text-xs tw:text-muted">{x.resumen}</small>
            </span>
            <span className="tw:flex-none tw:text-muted"><Icono nombre="chevR" tam={15} /></span>
          </button>
        ))}
      </nav>
      <Modal abierto={!!actual} onCerrar={() => setAbierta(null)} titulo={actual?.titulo} icono={actual?.icono} tonoIcono={actual?.tono} clave={actual?.clave}>
        {actual?.contenido}
      </Modal>
    </>
  );
}

function Historial({ n, vez, nota }: { n: INegocioDetalle; vez: number; nota: (t: string) => void }) {
  const guardar = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault(); const t = String(new FormData(ev.currentTarget).get('nota') || '').trim();
    if (t) nota(t);
  };
  return (
    <>
      <form id="ngNota" key={vez} onSubmit={guardar} className="tw:mb-4 tw:flex tw:items-start tw:gap-2">
        <Input id="ngNotaT" name="nota" placeholder="Agregar una nota (llamada, oferta, acuerdo…)" aria-label="Nota" clasesCampo="tw:flex-1" />
        <Boton type="submit" variante="secundario" icono="plus">Guardar</Boton>
      </form>
      {(n.actividad || []).length ? <ListaActividad items={n.actividad!} /> : <EstadoVacio compacto texto="Todavía no hay movimientos." />}
    </>
  );
}

// ---------- el detalle de cada sección (en su modal) ----------
const FILA_PERSONA = 'tw:flex tw:items-center tw:gap-3 tw:py-3 tw:border-0 tw:border-t tw:border-solid tw:border-edge tw:first:border-t-0 tw:first:pt-0';

function Personas({ n, corredores, vez, acc }: { n: INegocioDetalle; corredores?: IFichaNegocioProps['corredores']; vez: number; acc: IFichaNegocioAcciones }) {
  const c = n.cliente; const duenos = n.prop?.propietarios || [];
  return (
    <div className="tw:flex tw:flex-col">
      {c && (
        <div className={FILA_PERSONA}>
          <Avatar nombre={c.nombre} />
          <span className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col">
            <b className="tw:truncate tw:text-sm tw:font-semibold">{c.nombre}</b>
            <small className="tw:text-xs tw:text-muted">{CLIENTE[n.tipo]}{c.rut ? ' · ' + c.rut : ''}</small>
          </span>
          {c.telefono && <Boton variante="fantasma" tamano="sm" icono="whatsapp" title="WhatsApp" aria-label="WhatsApp" data-wa={c.telefono} onClick={() => whatsapp(c.telefono!)} />}
          {c.email && <Boton variante="fantasma" tamano="sm" icono="mail" title="Copiar correo" aria-label="Copiar correo" data-mail={c.email} onClick={() => copiarCorreo(c.email!)} />}
        </div>
      )}
      {duenos.map((d) => (
        <div key={d.id} className={FILA_PERSONA}>
          <Avatar nombre={d.nombre} />
          <span className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col">
            <b className="tw:truncate tw:text-sm tw:font-semibold">{d.nombre}</b>
            <small className="tw:text-xs tw:text-muted">Propietario{d.rut ? ' · ' + d.rut : ''}</small>
          </span>
        </div>
      ))}
      {!duenos.length && <p className={cx(FILA_PERSONA, 'tw:m-0 tw:text-[13px] tw:text-muted')}>La propiedad no tiene propietario registrado: agrégalo en su ficha para firmar.</p>}
      <div className={FILA_PERSONA}>
        <span className={cx('tw:grid tw:size-9 tw:flex-none tw:place-items-center tw:rounded-icono', SUAVE.gris)}><Icono nombre="user" tam={16} /></span>
        {corredores?.length
          ? <Select key={vez} id="ngCorSel" etiqueta="Corredor" clasesCampo="tw:flex-1" defaultValue={n.corredorId || ''} vacia="Sin corredor"
            opciones={corredores.map((x) => [x.id, x.nombre])} onChange={(ev) => acc.corredor(ev.target.value)} />
          : <span className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col">
            <b className="tw:truncate tw:text-sm tw:font-semibold">{n.corredor || 'Sin asignar'}</b>
            <small className="tw:text-xs tw:text-muted">Corredor</small>
          </span>}
      </div>
    </div>
  );
}

function Condiciones({ n, vez, guardar }: { n: INegocioDetalle; vez: number; guardar: IFichaNegocioAcciones['condiciones'] }) {
  const enviar = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault(); const d = new FormData(ev.currentTarget); const s = (k: string) => String(d.get(k) || '');
    guardar({ valor: s('valor'), moneda: s('moneda'), comision: s('comision'), tipoComision: s('tipoComision'), cierreEstimado: s('cierreEstimado'),
      ...(n.tipo === 'venta' ? { pagada: s('pagada') } : {}) }); // en arriendo la comisión se registra en su etapa «Comisión»
  };
  return (
    <form key={vez} onSubmit={enviar} className="tw:flex tw:flex-col tw:gap-3">
      <div className="tw:grid tw:grid-cols-[minmax(0,1fr)_96px] tw:items-end tw:gap-2">
        <Input id="ngVal" name="valor" type="number" step="any" etiqueta={n.tipo === 'venta' ? 'Precio acordado' : 'Arriendo mensual'} defaultValue={n.valor?.valor ?? ''} />
        <Select id="ngMon" name="moneda" aria-label="Moneda" defaultValue={n.valor?.moneda || 'UF'} opciones={[['UF', 'UF'], ['CLP', 'CLP'], ['USD', 'USD']]} />
      </div>
      <div className="tw:grid tw:grid-cols-[minmax(0,1fr)_96px] tw:items-end tw:gap-2">
        <Input id="ngCom" name="comision" type="number" step="any" etiqueta="Comisión" defaultValue={n.comision?.valor ?? ''} />
        <Select id="ngComT" name="tipoComision" aria-label="Tipo de comisión" defaultValue={n.comision?.tipo || '%'} opciones={[['%', '%'], ['monto', 'Monto']]} />
      </div>
      <div className={`tw:grid tw:items-end tw:gap-2 ${n.tipo === 'venta' ? 'tw:grid-cols-2' : 'tw:grid-cols-1'}`}>
        <Input id="ngCierreEst" name="cierreEstimado" type="date" etiqueta="Cierre estimado" defaultValue={n.cierreEstimado || ''} />
        {n.tipo === 'venta' && <Input id="ngComPagada" name="pagada" type="date" etiqueta="Comisión pagada el" defaultValue={n.comisionPagada?.fecha || ''} />}
      </div>
      <div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2 tw:border-0 tw:border-t tw:border-solid tw:border-edge tw:pt-3">
        <span className="tw:text-[13px] tw:text-muted">Comisión estimada: <b className="tw:text-text">{comisionTxt(n)}</b> + IVA</span>
        <Boton id="ngCond" type="submit" variante="secundario" tamano="sm">Guardar</Boton>
      </div>
    </form>
  );
}

// Todos los documentos del negocio, en el orden del proceso (los arma negocios.js): orden y acta de visita, carta oferta, reserva,
// texto del contrato, contrato y acta de entrega. Los que aún no se arman salen como «Pendiente».
const ESTADO_DOC: Record<string, [TTono, string]> = {
  firmado: ['verde', 'Firmado'], en_firma: ['amarillo', 'En firma'], pendiente: ['gris', 'Pendiente'], revision: ['amarillo', 'En revisión'], aprobado: ['verde', 'Aprobado'],
};
const esFirmable = (d: IDocumentoNegocio) => d.id !== 'contrato_texto';

function Documentos({ n }: { n: INegocioDetalle }) {
  const docs = n.documentos || [];
  return docs.length ? (
    <div className="tw:flex tw:flex-col">
      {docs.map((d) => {
        const ok = d.estado === 'firmado' || d.estado === 'aprobado'; const [tono, txt] = ESTADO_DOC[d.estado] || ESTADO_DOC.pendiente;
        const etiqueta = d.estado === 'firmado' && d.fuera ? 'Firmado fuera de Asset'
          : d.estado === 'en_firma' ? `En firma${d.total ? ` · ${d.firmados ?? 0}/${d.total}` : ''}${d.operacion ? ` · op. ${d.operacion}` : ''}` : txt;
        const detalle = [d.detalle, d.etapa && `Etapa «${d.etapa}»`, d.estado === 'firmado' && d.fecha && fecha(d.fecha)].filter(Boolean).join(' · ');
        return (
          <div key={d.id} data-doc={d.id} className={cx(FILA_PERSONA, 'tw:py-2.5')}>
            <span className={cx('tw:grid tw:size-8 tw:flex-none tw:place-items-center tw:rounded-icono', ok ? SUAVE.verde : d.estado === 'pendiente' ? 'tw:bg-sunken tw:text-muted' : SUAVE.amarillo)}>
              <Icono nombre={ok ? 'check' : 'file'} tam={15} />
            </span>
            <span className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col">
              <span className={cx('tw:text-sm', d.id === n.etapa && 'tw:font-semibold')}>{d.titulo}</span>
              {detalle && <small className="tw:text-xs tw:text-muted">{detalle}</small>}
            </span>
            <Badge tono={tono} punto>{etiqueta}</Badge>
          </div>
        );
      })}
    </div>
  ) : <EstadoVacio compacto texto="Este negocio todavía no tiene documentos." />;
}

// ---------- la ficha ----------
// una sola línea bajo el título: quién, cuánto, la comisión y el estado
function Subtitulo({ n }: { n: INegocioDetalle }) {
  const v = valorTxt(n.valor, n.tipo);
  const com = n.comisionMonto != null ? `comisión ${comisionTxt(n)} + IVA` : '';
  return (
    <span className="tw:flex tw:flex-wrap tw:items-center tw:gap-x-2 tw:gap-y-1.5">
      <span>{CLIENTE[n.tipo]}: <b>{n.cliente?.nombre || '—'}</b>{[v, com].filter(Boolean).map((x) => ' · ' + x).join('')}</span>
      {n.estado === 'ganado' && <Badge tono="verde" punto>Cerrado con éxito</Badge>}
      {n.estado === 'perdido' && <Badge tono="rojo" punto ajustar>Perdido: {n.motivoPerdida || 'sin motivo'}</Badge>}
      {n.estado === 'abierto' && n.vencida && <Badge tono="rojo" icono="alert">Próxima acción vencida</Badge>}
    </span>
  );
}

export default function FichaNegocio({ n, etapas, corredores, vez, acc }: IFichaNegocioProps) {
  useEffect(() => { avisarAyuda('negocio'); }, [n.id]);
  const principal = accionPrincipal(n, etapas, acc);
  const docs = (n.documentos || []).filter(esFirmable); const firmados = docs.filter((d) => d.estado === 'firmado').length;
  const cond = [valorTxt(n.valor, n.tipo), n.comision ? (n.comision.tipo === '%' ? `${n.comision.valor}% + IVA` : 'monto fijo + IVA') : ''].filter(Boolean).join(' · ');
  const duenos = n.prop?.propietarios?.length || 0; const movs = (n.actividad || []).length;
  const secciones: ISeccion[] = [
    { id: 'ngPlPers', titulo: 'Personas', icono: 'users', tono: 'lavanda', clave: 'modal-135',
      resumen: [n.cliente?.nombre || `Sin ${CLIENTE[n.tipo].toLowerCase()}`, duenos ? `${duenos} ${duenos === 1 ? 'propietario' : 'propietarios'}` : 'sin propietario'].join(' · '),
      contenido: <Personas n={n} corredores={corredores} vez={vez} acc={acc} /> },
    { id: 'ngPlCond', titulo: 'Condiciones', icono: 'tag', tono: 'verde', clave: 'modal-136', resumen: cond || 'Sin valor',
      contenido: <Condiciones n={n} vez={vez} guardar={acc.condiciones} /> },
    { id: 'ngPlDoc', titulo: 'Documentos', icono: 'file', tono: 'azul', clave: 'modal-137', resumen: docs.length ? `${firmados} de ${docs.length} firmados` : 'Sin firmas',
      contenido: <Documentos n={n} /> },
    { id: 'ngPlHist', titulo: 'Historial y notas', icono: 'clock', tono: 'amarillo', clave: 'modal-138', resumen: `${movs} ${movs === 1 ? 'movimiento' : 'movimientos'}`,
      contenido: <Historial n={n} vez={vez} nota={acc.nota} /> },
  ];
  return (
    <Layout
      altoCompleto
      espacio="pantalla"
      className="im-ficha ng-ficha"
      cabeceraClassName="im-ft"
      volver={{ texto: 'Negocios', alTocar: acc.volver, id: 'ngBack' }}
      sobretitulo={<span className="im-code">{[n.codigo, TIPO[n.tipo], n.prop?.codigo].filter(Boolean).join(' · ')}</span>}
      titulo={n.prop?.titulo || 'Negocio'}
      subtitulo={<Subtitulo n={n} />}
      acciones={<>
        {/* secundario y «⋯» primero; el principal al final, pegado a la derecha */}
        {n.prop && <Boton id="ngProp" variante="secundario" icono="house" onClick={() => abrirFicha(n.prop!.id)}>Ver propiedad</Boton>}
        <MenuMas id="ngMas" opciones={[
          ...(n.estado === 'abierto' ? [{ id: 'ngLost', texto: 'Marcar como perdido', icono: 'x', alTocar: acc.perder }] : []),
          { id: 'ngDel', texto: 'Eliminar negocio', icono: 'trash', alTocar: acc.eliminar },
        ]} />
        <Boton id="ngSig" icono={principal.icono} onClick={principal.alTocar}>{principal.texto}</Boton>
      </>}
    >
      <Pasos key={n.id} vez={vez} pasos={acc.pasos} />
      <BarraSecciones secciones={secciones} />
    </Layout>
  );
}
