// Ventanas de los formatos propios de la corredora (src/renderer/formatos.js), que se abren con window.Ventanas.abrir:
// activar los formatos (modal-24), el documento del hito con lo que falta y los firmantes (modal-25) y la confirmación
// del envío (modal-23). Lo que se pide al servidor (fmtPreparar, fmtCompletar, fmtEnviar…) sigue en formatos.js:
// la ventana se vuelve a abrir con las props nuevas cada vez que cambia algo.
// Las pruebas usan #fmCuerpo, .fb-tab, .fm-ok, #fmVer, iframe.fm-prev, #fmEnviar y #fmCerrar.
import { useState } from 'react';
import Boton from '../../../ui/Boton';
import Input from '../../../ui/Input';
import Select from '../../../ui/Select';
import ListaDatos from '../../../ui/ListaDatos';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../../ui/Ventana';
import { cx } from '../../../../utils/cx';
import { P, NOTA, FORM } from '../../gestion/editor-pdf/Modales';

const SUB = 'tw:mt-4 tw:mb-2 tw:text-sm tw:font-bold';
const ERROR = 'tw:m-0 tw:text-[13px] tw:text-err';

interface IFirmanteFormato { titulo: string; calidad: string; nombre?: string; rut?: string; email?: string; telefono?: string }
interface IFalta { id: string; t: string; motivo?: string; ayuda?: string; sugerencia?: string }
interface IDato { t: string; txt?: string; porDefecto?: boolean; aplica?: boolean; auto?: boolean; falta?: boolean }
export interface IFormatoPreparado {
  formato: { id: string; titulo: string; descripcion?: string };
  propiedad: { codigo: string };
  faltan: IFalta[];
  datos: IDato[];
  tiposFirma: Record<string, string>;
  tramites: Record<string, string>;
  firma: { tipo: string; tramite: string; tipoTxt?: string; tramiteTxt?: string };
  firmantes: IFirmanteFormato[];
  empresa?: unknown;
  listo: boolean;
}

// modal-24 · sin formatos propios activos: se ofrecen los de la corredora o seguir con las plantillas de Portalfirma
export function ActivarFormatos({ disponibles, alUsarOtro, alActivar }: { disponibles: { id: string; nombre: string }[]; alUsarOtro: () => void; alActivar: (paquete: string) => void }) {
  const [paq, setPaq] = useState(disponibles[0]?.id || '');
  return <>
    <VentanaCabecera icono="template" titulo="Formatos de la corredora" />
    <VentanaCuerpo className={FORM}>
      <p className={P}>Asset puede llenar los documentos propios de la corredora con los datos de la ficha y enviarlos a firmar con Portalfirma.</p>
      <Select etiqueta="Formatos" id="fmPaq" value={paq} onChange={(e) => setPaq(e.target.value)} opciones={disponibles.map((d) => [d.id, d.nombre])} />
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="fmOtro" variante="secundario" onClick={alUsarOtro}>Usar plantillas de Portalfirma</Boton>
      <Boton id="fmAct" onClick={() => alActivar(paq)}>Usar estos formatos</Boton>
    </VentanaPie>
  </>;
}

// un dato que falta: venta o arriendo, sí o no, o una caja de texto (correo, número, RUT, teléfono…)
function Entrada({ x, valor, alCambiar }: { x: IFalta; valor: string; alCambiar: (v: string) => void }) {
  const etiqueta = <>{x.t}{x.motivo && <span className="tw:block tw:font-normal tw:text-xs tw:text-red-ink">{x.motivo}</span>}</>;
  const comun = { etiqueta, 'data-v': x.id, title: x.ayuda, value: valor, clasesCampo: 'tw:justify-end' };
  if (x.id === 'operacion') return <Select {...comun} vacia="—" opciones={[['venta', 'Venta'], ['arriendo', 'Arriendo']]} onChange={(e) => alCambiar(e.target.value)} />;
  if (/^(exclusividad|publicar|mascotas)$/.test(x.id)) return <Select {...comun} vacia="—" opciones={[['si', 'Sí'], ['no', 'No']]} onChange={(e) => alCambiar(e.target.value)} />;
  const numero = /supTotal|supUtil|precio|mesesGarantia/.test(x.id);
  const tipo = /Email/.test(x.id) ? 'email' : numero ? 'number' : 'text';
  const ph = /Rut/.test(x.id) ? 'Ej.: 12.345.678-9' : /Telefono/.test(x.id) ? 'Ej.: +56 9 1234 5678' : /Email/.test(x.id) ? 'Ej.: nombre@correo.cl' : '';
  return <Input {...comun} type={tipo} step={numero ? 'any' : undefined} placeholder={ph} onChange={(e) => alCambiar(e.target.value)} />;
}

// lo que falta para enviarlo (queda guardado en la ficha)
function Faltan({ faltan, valores, alCambiar, alGuardar }: { faltan: IFalta[]; valores: Record<string, string>; alCambiar: (id: string, v: string) => void; alGuardar: () => void }) {
  return (
    <div className="tw:mb-3 tw:p-3 tw:rounded-[10px] tw:border tw:border-red-edge tw:bg-red/40">
      <h4 className="tw:mt-0 tw:mb-2.5 tw:text-[13.5px] tw:font-bold">Falta para enviarlo <small className="tw:font-normal tw:text-muted">(queda guardado en la ficha: no se vuelve a pedir)</small></h4>
      <div className="tw:grid tw:grid-cols-[repeat(auto-fill,minmax(230px,1fr))] tw:items-end tw:gap-x-3.5 tw:gap-y-2.5">
        {faltan.map((x) => <Entrada key={x.id} x={x} valor={valores[x.id] ?? ''} alCambiar={(v) => alCambiar(x.id, v)} />)}
      </div>
      <div className="tw:flex tw:justify-end tw:mt-3">
        <Boton id="fmGuardar" variante="secundario" tamano="sm" icono="save" onClick={alGuardar}>Guardar datos</Boton>
      </div>
    </div>
  );
}

const firmanteTxt = (s: IFirmanteFormato) => [s.nombre || '—', s.rut, s.email, s.telefono].filter(Boolean).join(' · ');

// modal-25 · el documento del hito (o los mandatos): qué va, qué falta, cómo se firma y quién firma
export function FormatosHito({ titulo, paquete, lista, i, r, version, ver, html, err, fallo, bloqueado, alTab, alGuardar, alFirma, alVer, alEnviar, alCerrar }: {
  titulo: string; paquete?: string; lista: { id: string; titulo: string }[]; i: number; r?: IFormatoPreparado | null; version: number;
  ver: boolean; html?: string | null; err?: string; fallo?: string; bloqueado?: boolean;
  alTab: (i: number) => void; alGuardar: (valores: Record<string, string>) => void; alFirma: (tipo: string, tramite: string) => void;
  alVer: () => void; alEnviar: (valores: Record<string, string>) => void; alCerrar: () => void;
}) {
  // lo escrito en «Falta» (se guarda con «Guardar datos» o antes de enviar). Cada versión que dibuja formatos.js
  // parte de nuevo con las sugerencias, como cuando se volvía a escribir el HTML.
  const [escrito, setEscrito] = useState<{ v: number; valores: Record<string, string> }>({ v: -1, valores: {} });
  const valores = escrito.v === version ? escrito.valores : Object.fromEntries((r?.faltan || []).map((x) => [x.id, x.sugerencia || '']));
  const cambiar = (id: string, v: string) => setEscrito({ v: version, valores: { ...valores, [id]: v } });
  const [firma, setFirma] = useState<{ v: number; tipo: string; tramite: string } | null>(null);
  const tipo = firma?.v === version ? firma.tipo : r?.firma.tipo || ''; const tramite = firma?.v === version ? firma.tramite : r?.firma.tramite || '';
  const cambiarFirma = (t: string, tr: string) => { setFirma({ v: version, tipo: t, tramite: tr }); alFirma(t, tr); };
  const datos = r ? r.datos.filter((d) => d.aplica && !d.auto && !d.falta) : [];
  return <>
    <VentanaCabecera icono="sign" titulo={titulo} descripcion={paquete ? `Formatos ${paquete}` : undefined} onCerrar={alCerrar} />
    <VentanaCuerpo>
      <div id="fmCuerpo">
        {fallo ? <p className={ERROR}>{fallo}</p> : !r ? <div className="ga-load"><span className="spinner sm" />Revisando los datos…</div> : <>
          {lista.length > 1 && (
            <div className="fb-tabs">
              {lista.map((x, j) => <button key={x.id} type="button" className={cx('fb-tab', j === i && 'on')} data-i={j} onClick={() => alTab(j)}><span className="fb-n">{j + 1}</span>{x.titulo}</button>)}
            </div>
          )}
          {r.formato.descripcion && <p className={cx(NOTA, 'tw:mb-2.5')}>{r.formato.descripcion}</p>}
          {r.faltan.length
            ? <Faltan faltan={r.faltan} valores={valores} alCambiar={cambiar} alGuardar={() => alGuardar(valores)} />
            : <p className="fm-ok">Está todo: el documento sale con los datos de la ficha.</p>}
          <h4 className={SUB}>Lo que va en el documento</h4>
          <ListaDatos datos={datos.map((d) => [d.t, <>{d.txt || '—'}{d.porDefecto && <small className="tw:text-muted"> (por defecto)</small>}</>])} />
          <h4 className={SUB}>Firman con Portalfirma</h4>
          <div className="tw:grid tw:grid-cols-2 tw:gap-3 tw:mb-3">
            <Select etiqueta="Tipo de firma" id="fmTipo" disabled={bloqueado} value={tipo} onChange={(e) => cambiarFirma(e.target.value, tramite)} opciones={Object.entries(r.tiposFirma)} />
            <Select etiqueta="Trámite" id="fmTram" disabled={bloqueado} value={tramite} onChange={(e) => cambiarFirma(tipo, e.target.value)} opciones={Object.entries(r.tramites)} />
          </div>
          <ul className="fm-fir">
            {r.firmantes.map((s, j) => <li key={j}><b>{s.titulo}</b> <span className="cal">(firma como {s.calidad})</span> · {firmanteTxt(s)}</li>)}
          </ul>
          {!!r.empresa && <p className={NOTA}>El propietario es una empresa: firman las personas que la representan. Portalfirma las identifica en el documento al enviarlo.</p>}
          {ver && html != null && <iframe className="fm-prev" sandbox="" title="Vista previa" srcDoc={html} />}
        </>}
      </div>
      {err && <p id="fmErr" className={cx(ERROR, 'tw:mt-2.5')}>{err}</p>}
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="fmCerrar" variante="secundario" className="tw:mr-auto" onClick={alCerrar}>Cerrar</Boton>
      <Boton id="fmVer" variante="secundario" icono="file" onClick={alVer}>{ver ? 'Ocultar documento' : 'Ver documento'}</Boton>
      <Boton id="fmEnviar" icono="send" disabled={!r?.listo} onClick={() => alEnviar(valores)}>{r ? `Enviar «${r.formato.titulo}» a firmar` : 'Enviar a firmar'}</Boton>
    </VentanaPie>
  </>;
}

// modal-23 · confirmar el envío (cobra del saldo)
export function ConfirmarFormato({ titulo, codigo, tipo, tramite, firmantes, enviando, error, alVolver, alEnviar }: {
  titulo: string; codigo: string; tipo?: string; tramite?: string; firmantes: IFirmanteFormato[]; enviando?: boolean; error?: string;
  alVolver: () => void; alEnviar: () => void;
}) {
  return <>
    <VentanaCabecera icono="send" titulo="¿Enviar a firmar?" descripcion={`«${titulo}» de ${codigo} · ${tipo || ''} · ${tramite || ''}.`} />
    <VentanaCuerpo>
      <ul className="fm-fir">
        {firmantes.map((s, j) => <li key={j}>{s.titulo} ({s.calidad}): <b>{s.nombre}</b> · {s.email}</li>)}
      </ul>
      <p className={NOTA}>Se cobra del saldo de Portalfirma y cada firmante recibe su enlace para firmar.</p>
      {error && <p id="fmErr2" className={cx(ERROR, 'tw:mt-2.5')}>{error}</p>}
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" disabled={enviando} onClick={alVolver}>Volver</Boton>
      <Boton id="mOk" icono="send" cargando={enviando} onClick={alEnviar}>{enviando ? 'Enviando…' : 'Enviar a firmar'}</Boton>
    </VentanaPie>
  </>;
}
