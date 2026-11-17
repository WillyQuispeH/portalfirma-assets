// Carga masiva: subir muchos documentos, revisar sus firmantes y enviarlos a firmar de una vez; y la firma masiva
// con certificado de las operaciones pendientes como firmante.
//
// La cola la procesa el proceso principal (src/bulk.js) y manda su estado en vivo (pf.onBulk → masiva.js →
// evento «pf:bulk»). Siguen en src/renderer/masiva.js: editar firmantes y la confirmación del envío (saldo y
// correo del pagador). Hecha con Layout y el kit (Card, Tabs, Badge, Boton, Input, Select, Checkbox, EstadoVacio); las
// separaciones y radios salen de globals.css (--ui-gap, --ui-radio-*). Las clases bk-row, cds-op y cds-res, los
// data-a y los id bkDrop, bkDrive, bkOps, bkProc, bkType, cdsRut, cdsList, cdsKey, cdsAsk, cdsCode, cdsSign y cdsBack los usan las pruebas.
import { useEffect, useRef, useState } from 'react';
import Icono from '../../../ui/Icono';
import Layout from '../../../ui/Layout';
import Card from '../../../ui/Card';
import Tabs from '../../../ui/Tabs';
import Badge from '../../../ui/Badge';
import Boton from '../../../ui/Boton';
import Input from '../../../ui/Input';
import Select from '../../../ui/Select';
import Checkbox from '../../../ui/Checkbox';
import EstadoVacio from '../../../ui/EstadoVacio';
import type { TTono } from '../../../ui/tonos';
import { cx } from '../../../../utils/cx';
import { cola, estadoMasiva, useMasiva } from '../../../../store/hooks/useMasiva.hook';
import { abrirDrive, abrirOperaciones, confirmarEnvioMasivo, editarFirmantesMasiva, toast, verOperacion } from '../../../../utils/app';
import { tamano } from '../comun/archivos';
import type { IColaMasiva, IDocMasiva, IOperacionPendiente, TEstadoDoc } from '../../../../store/interfaces/masiva.interface';

type TGrupo = 'muted' | 'run' | 'ok' | 'wait' | 'bad';
const BS: Record<TEstadoDoc, [string, TGrupo]> = {
  queued: ['En cola', 'muted'], converting: ['Convirtiendo a PDF', 'run'], uploading: ['Subiendo', 'run'], analyzing: ['Detectando firmantes', 'run'],
  ready: ['Listo', 'ok'], needs_data: ['Faltan datos', 'wait'], sending: ['Enviando', 'run'], sent: ['Enviado', 'ok'],
  error: ['Error', 'bad'], send_error: ['No se envió', 'bad'], skipped: ['Omitido', 'muted'],
};
const TONO: Record<TGrupo, TTono> = { muted: 'gris', run: 'azul', ok: 'verde', wait: 'amarillo', bad: 'rojo' };
// lectura del estado para src/renderer/masiva.js (window.Masiva._bk / _cds: pruebas y depuración)
(window as unknown as Record<string, unknown>).__estadoMasiva = estadoMasiva;

function Estado({ k }: { k: TEstadoDoc }) {
  const [l, g] = BS[k] || [k, 'muted' as TGrupo];
  return <Badge tono={TONO[g]} punto={g !== 'run'}>{g === 'run' && <span className="spinner sm" aria-hidden="true" />}{l}</Badge>;
}

function Cargar() {
  const { cola: st, opciones, masivaSetOpciones } = useMasiva();
  const c: Partial<Record<TEstadoDoc, number>> = {}; for (const it of st.items) c[it.status] = (c[it.status] || 0) + 1;
  const n = st.items.length; const ocupados = (c.queued || 0) + (c.converting || 0) + (c.uploading || 0) + (c.analyzing || 0);
  const listos = st.items.filter((x) => x.status === 'ready' && x.selected !== false);
  const verPie = st.items.some((x) => ['ready', 'needs_data', 'sending', 'sent', 'send_error'].includes(x.status));
  const fila = (it: IDocMasiva) => {
    const enCurso = ['uploading', 'analyzing', 'converting', 'sending'].includes(it.status);
    return (
      <div key={it.id} className={`bk-row ${it.status}`} data-id={it.id}>
        <span>{it.status === 'ready' && <Checkbox marcado={it.selected !== false} alCambiar={(on) => cola.marcar(it.id, on)} />}</span>
        <span className="bk-doc"><b title={it.path}>{it.name}</b><small>{tamano(it.size) || '1 KB'}{it.typeDocument ? ' · ' + it.typeDocument : ''}{it.operation ? ` · Operación N° ${it.operation}` : ''}</small></span>
        <span className="tw:flex tw:flex-col tw:items-start tw:gap-1">
          <Estado k={it.status} />
          {it.error && <small className="bk-err">{it.error}</small>}
          {!!it.missing?.length && it.status === 'needs_data' && <small className="bk-err">{it.missing.join(' · ')}</small>}
        </span>
        <span className="bk-sig">{(it.signers || []).length ? it.signers!.map((s, i) => <span key={i}>{i > 0 && ', '}{s.fullName || s.rut || '?'}{s.alias && <> <em>({s.alias})</em></>}</span>) : <span className="muted">—</span>}</span>
        <span className="bk-acts">
          {['ready', 'needs_data'].includes(it.status) && <Boton variante="fantasma" tamano="sm" data-a="edit" onClick={() => editarFirmantesMasiva(it)}>Firmantes</Boton>}
          {it.status === 'error' && <Boton variante="fantasma" tamano="sm" data-a="retry1" onClick={() => cola.reintentar(it.id)}>Reintentar</Boton>}
          {it.status === 'send_error' && <Boton variante="fantasma" tamano="sm" data-a="rearm" title="Revisa antes en Mis operaciones que no se haya creado" onClick={() => cola.volverAListo(it.id)}>Volver a listo</Boton>}
          {it.status === 'sent' && <Boton variante="fantasma" tamano="sm" data-a="seeop" onClick={() => verOperacion(Number(it.operation))}>Ver</Boton>}
          {!enCurso && <Boton variante="fantasma" tamano="sm" icono="x" data-a="rm" title="Quitar" aria-label="Quitar" onClick={() => cola.quitar(it.id)} />}
        </span>
      </div>
    );
  };
  return (
    <>
      <div id="bkDrop" role="button" tabIndex={0}
        className="tw:flex tw:flex-col tw:items-center tw:gap-2 tw:rounded-card tw:border-2 tw:border-dashed tw:border-edge-b tw:bg-card tw:px-5 tw:py-8 tw:text-center tw:cursor-pointer tw:transition-colors tw:hover:bg-lav-soft tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-lav-edge"
        onClick={(e) => { if ((e.target as HTMLElement).closest('#bkDrive')) return abrirDrive(); cola.elegir(); }} onKeyDown={(e) => { if (e.key === 'Enter') cola.elegir(); }}>
        <span className="tw:text-lav-softink"><Icono nombre="upload" tam={30} /></span>
        <b className="tw:text-[15px]">Arrastra aquí tus documentos o haz clic para elegirlos</b>
        <span className="tw:text-[13px] tw:text-muted">PDF o Word, hasta 20 MB cada uno. Se procesan de a 2 para no saturar Portalfirma.</span>
        <Boton variante="secundario" tamano="sm" icono="drive" id="bkDrive">Traer desde Google Drive</Boton>
      </div>

      {n > 0 && (
        <div id="bkBar"><Card>
          <div className="tw:flex tw:flex-col tw:gap-ui">
            <div className="tw:h-1.5 tw:overflow-hidden tw:rounded-full tw:bg-sunken"><div className="tw:h-full tw:rounded-full tw:bg-brand tw:transition-[width] tw:duration-200" style={{ width: `${Math.round(((n - ocupados) / n) * 100)}%` }} /></div>
            <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
              {(Object.entries(BS) as [TEstadoDoc, [string, TGrupo]][]).filter(([k]) => c[k]).map(([k, [l, g]]) => <Badge key={k} tono={TONO[g]}>{l}: {c[k]}</Badge>)}
              {(st.coolUntil || 0) > Date.now() && <Badge tono="amarillo">Portalfirma responde lento: pausa breve</Badge>}
            </div>
            <div className="tw:flex tw:flex-wrap tw:items-center tw:justify-end tw:gap-ui">
              {ocupados > 0 && <Boton variante="fantasma" tamano="sm" data-a="pause" onClick={() => cola.pausar(!st.paused)}>{st.paused ? 'Reanudar' : 'Pausar'}</Boton>}
              {!!c.error && <Boton variante="fantasma" tamano="sm" data-a="retry" onClick={() => cola.reintentar(null)}>Reintentar errores</Boton>}
              {!!(c.sent || c.skipped) && <Boton variante="fantasma" tamano="sm" data-a="clearDone" onClick={() => cola.vaciar('done')}>Quitar enviados y omitidos</Boton>}
              {!ocupados && !st.sending && <Boton variante="fantasma" tamano="sm" data-a="clearAll" onClick={() => cola.vaciar('all')}>Vaciar la lista</Boton>}
            </div>
          </div>
        </Card></div>
      )}

      <div id="bkTable"><Card relleno={false}>
        {n ? <div><div className="bk-row bk-th"><span /><span>Documento</span><span>Estado</span><span>Firmantes</span><span /></div>{st.items.map(fila)}</div>
          : <EstadoVacio compacto icono="files" texto="Todavía no hay documentos en la cola." className="tw:py-6" />}
      </Card></div>

      {verPie && (
        <div id="bkFoot"><Card>
          <div className="tw:flex tw:flex-wrap tw:items-end tw:justify-between tw:gap-ui">
            <div className="tw:flex tw:flex-wrap tw:items-end tw:gap-ui">
              <Select id="bkProc" etiqueta="Trámite" value={opciones.protocolization} onChange={(e) => masivaSetOpciones({ protocolization: e.target.value as typeof opciones.protocolization })}
                opciones={[['none', 'Solo firma electrónica'], ['legalization', 'Legalizar ante notario'], ['protocolization', 'Protocolizar']]} />
              <Select id="bkType" etiqueta="Tipo de firma" value={opciones.typeSign} onChange={(e) => masivaSetOpciones({ typeSign: e.target.value as typeof opciones.typeSign })}
                opciones={[['simple', 'Simple'], ['avanzada', 'Avanzada'], ['visada', 'Visada'], ['enrolada', 'Enrolada']]} />
              <span className="tw:max-w-[260px] tw:text-xs tw:text-muted">Si Portalfirma reconoce el tipo de documento, usa su trámite y firma.</span>
            </div>
            {st.sending ? <Boton variante="secundario" data-a="stop" onClick={() => cola.detener()}>Detener el envío</Boton>
              : <Boton icono="sign" data-a="send" disabled={!listos.length} onClick={() => confirmarEnvioMasivo(listos.map((x) => x.id), opciones)}>Enviar {listos.length} documento(s) a firmar</Boton>}
          </div>
        </Card></div>
      )}
    </>
  );
}

function Paso({ n, titulo, activo = true, children }: { n: number; titulo: string; activo?: boolean; children: React.ReactNode }) {
  return (
    <div className={cx(!activo && 'tw:opacity-55 tw:pointer-events-none')}>
      <Card titulo={<span className="tw:flex tw:items-center tw:gap-2.5"><Badge tono="lavanda">{n}</Badge>{titulo}</span>}>{children}</Card>
    </div>
  );
}

function ConCertificado() {
  const { cds, masivaSetCds } = useMasiva();
  const clave = useRef(''); // vive solo mientras dura el proceso; va directo a Portalfirma
  const [rut, setRut] = useState(cds.rut);
  const [ocupado, setOcupado] = useState(false);
  const caja = useRef<HTMLInputElement>(null); const codigo = useRef<HTMLInputElement>(null);

  const listar = async () => {
    const r0 = rut.trim(); if (!r0) return;
    const r = await cola.pendientes(r0); if (!r.ok) return toast(r.error || '', 5000);
    const d = r.data as any; // eslint-disable-line @typescript-eslint/no-explicit-any -- la API responde en varias formas
    const lista: IOperacionPendiente[] = d?.operations || d?.pending || (Array.isArray(d) ? d : []);
    masivaSetCds({ rut: r0, lista, sel: lista.map((o) => String(o.operation)), resultado: null, paso: 'rut' });
    if (!lista.length) toast('No tienes operaciones pendientes de firma con ese RUT.', 4000);
  };
  const pedir = async () => {
    const k = caja.current?.value || ''; if (!k) return;
    setOcupado(true); const r = await cola.pedirCodigo(cds.rut, cds.sel, k); setOcupado(false);
    if (!r.ok) return toast(r.error || '', 5000);
    clave.current = k; masivaSetCds({ paso: 'code' }); toast(r.data?.message || 'Código enviado.', 4000);
  };
  const firmar = async () => {
    const c = codigo.current?.value.trim() || ''; if (!c) return;
    setOcupado(true); const r = await cola.firmar(cds.rut, cds.sel, clave.current, c); setOcupado(false);
    if (!r.ok) return toast(r.error || '', 6000);
    clave.current = '';
    const res = r.data?.signed || r.data?.results || [];
    masivaSetCds({ paso: 'rut', resultado: res.length ? `${res.filter((x) => x.ok !== false).length} de ${res.length} documento(s) firmados.` : r.data?.message || 'Documentos firmados.', lista: cds.lista.filter((o) => !cds.sel.includes(String(o.operation))), sel: [] });
  };
  const alternar = (op: string) => masivaSetCds({ sel: cds.sel.includes(op) ? cds.sel.filter((x) => x !== op) : [...cds.sel, op] });

  return (
    <div className="cds tw:max-w-[760px]! tw:flex tw:flex-col tw:gap-ui">
      <p className="tw:m-0 tw:text-sm tw:text-muted">Firma de una vez todas las operaciones que tienes pendientes como firmante, con tu certificado de firma electrónica avanzada. Recibirás un código por SMS o WhatsApp.</p>
      <Paso n={1} titulo="RUT del firmante">
        <div className="tw:flex tw:items-end tw:gap-ui">
          <Input id="cdsRut" etiqueta="RUT" value={rut} onChange={(e) => setRut(e.target.value)} placeholder="12.345.678-9" clasesCampo="tw:flex-1" />
          <Boton variante="secundario" id="cdsList" onClick={listar}>Ver pendientes</Boton>
        </div>
      </Paso>
      <Paso n={2} titulo="Operaciones a firmar" activo={!!cds.lista.length}>
        {cds.lista.length ? (
          <div className="cds-list tw:flex tw:flex-col tw:gap-2.5">
            {cds.lista.map((o) => (
              <Checkbox key={String(o.operation)} className="cds-op" marcado={cds.sel.includes(String(o.operation))} alCambiar={() => alternar(String(o.operation))}
                etiqueta={o.document_name || o.name || 'Documento'} descripcion={`Operación N° ${o.operation}`} />
            ))}
          </div>
        ) : <p className="tw:m-0 tw:text-sm tw:text-muted">Primero busca las operaciones pendientes.</p>}
      </Paso>
      <Paso n={3} titulo={cds.paso === 'code' ? 'Código de confirmación' : 'Clave del certificado'} activo={!!cds.sel.length}>
        {cds.paso === 'code' ? (
          <div className="tw:flex tw:flex-col tw:gap-ui">
            <div className="tw:flex tw:items-end tw:gap-ui">
              <Input id="cdsCode" ref={codigo} etiqueta="Código recibido por SMS o WhatsApp" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" clasesCampo="tw:flex-1" />
              <Boton id="cdsSign" disabled={ocupado} cargando={ocupado} onClick={firmar}>Firmar {cds.sel.length} documento(s)</Boton>
            </div>
            <div className="tw:flex tw:justify-end"><Boton variante="fantasma" tamano="sm" id="cdsBack" onClick={() => { clave.current = ''; masivaSetCds({ paso: 'rut' }); }}>Cancelar</Boton></div>
          </div>
        ) : (
          <div className="tw:flex tw:flex-col tw:gap-ui">
            <div className="tw:flex tw:items-end tw:gap-ui">
              <Input id="cdsKey" ref={caja} type="password" autoComplete="off" etiqueta="Clave de tu certificado" placeholder="Clave del certificado" clasesCampo="tw:flex-1" />
              <Boton id="cdsAsk" disabled={!cds.sel.length || ocupado} cargando={ocupado} onClick={pedir}>Pedir código</Boton>
            </div>
            <p className="tw:m-0 tw:text-xs tw:text-muted">La clave se envía directo a Portalfirma para validar tu certificado; la app no la guarda.</p>
          </div>
        )}
      </Paso>
      {cds.resultado && <div className="cds-res tw:flex tw:items-center tw:gap-2 tw:rounded-card tw:bg-green-soft tw:px-4 tw:py-3 tw:text-green-softink"><Icono nombre="listCheck" tam={15} /><span><b>Listo.</b> {cds.resultado}</span></div>}
    </div>
  );
}

export default function CargaMasiva({ tab: tabInicial }: { tab?: 'load' | 'cds' }) {
  const { tab, masivaSetTab, masivaSetCola } = useMasiva();
  useEffect(() => {
    if (tabInicial) masivaSetTab(tabInicial);
    cola.estado().then((r) => { if (r.ok && r.data) masivaSetCola(r.data); });
    const alCambiar = (e: Event) => masivaSetCola((e as CustomEvent<IColaMasiva>).detail);
    window.addEventListener('pf:bulk', alCambiar);
    return () => window.removeEventListener('pf:bulk', alCambiar);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- solo al montar

  return (
    <Layout
      titulo="Carga masiva"
      ilustracion={{ imagen: 'img/formas/etapa.svg', tinte: '#6d5bd0' }}
      subtitulo="Sube muchos documentos, revisa sus firmantes y envíalos a firmar de una vez."
      acciones={<Boton variante="secundario" icono="listCheck" id="bkOps" onClick={abrirOperaciones}>Mis operaciones</Boton>}
      barra={<Tabs id="bkTabs" dato="bt" etiqueta="Secciones de Carga masiva" valor={tab}
        opciones={[['load', 'Cargar y enviar a firmar'], ['cds', 'Firma masiva con certificado']]} alCambiar={masivaSetTab} />}
    >
      <div id="bkBody" className="tw:flex tw:flex-col tw:gap-ui">{tab === 'cds' ? <ConCertificado /> : <Cargar />}</div>
    </Layout>
  );
}
