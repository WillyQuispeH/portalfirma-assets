// Postarriendo (etapa 3): los avisos de lo que viene después de entregar la propiedad. Salen de los datos del contrato (n.ciclo.contrato.datos:
// inicio, plazo, reajuste, aviso de término) y se registran con negPostarriendo (el servidor los guarda en n.ciclo.postarriendo y aplica las reglas):
//  · reajustes: cada 6 o 12 meses según el IPC pactado; se registra el IPC aplicado y la renta nueva (n.º y fecha de cada reajuste);
//  · renovación o término: hasta el límite de aviso (término menos los días de aviso) se decide renovar (por cuántos meses, renta) o terminar;
//  · devolución de la garantía: recepción de la propiedad contra el inventario, descuentos y lo que se devuelve (con comprobante).
// Los id (#paPanel, #paIpc, #paRenta, #paGuardar, #paRenovar, #paTermino, #paMeses, #paDecidir, #paMonto, #paDescuento, #paFecha, #paDevolver) los usan las pruebas.
/* eslint-disable @typescript-eslint/no-explicit-any -- el negocio llega del proceso principal sin tipos */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Boton from '../../ui/Boton';
import Badge from '../../ui/Badge';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import Textarea from '../../ui/Textarea';
import MenuMas from '../../ui/MenuMas';
import { api } from '../../../utils/api';
import { toast } from '../../../utils/app';

export type TModoPost = 'reajustes' | 'renovacion' | 'devolucion';

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));
const hoy = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const mas = (f: string, meses: number, dias = 0) => { const d = new Date(f + 'T12:00:00'); d.setMonth(d.getMonth() + meses); d.setDate(d.getDate() + dias); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const fdmy = (f: string) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '—');
const num = (s: string) => Number(String(s).replace(/\./g, '').replace(',', '.'));
const numTxt = (v: number | null | undefined) => (v ? Number(v).toLocaleString('es-CL', { maximumFractionDigits: 2 }) : '');
const fmt = (v: number, mo: string) => (mo === 'UF' ? `UF ${v.toLocaleString('es-CL')}` : mo === 'USD' ? `US$ ${v.toLocaleString('es-CL')}` : `$${v.toLocaleString('es-CL')}`);
const PERIODO: Record<string, number> = { ipc_semestral: 6, ipc_anual: 12 };

function Seccion({ titulo, acciones, children }: { titulo: string; acciones?: ReactNode; children: ReactNode }) {
  return (
    <div className="tw:flex tw:flex-col tw:gap-2.5">
      <div className="tw:flex tw:items-center tw:gap-2 tw:flex-nowrap">
        <h4 className="tw:m-0 tw:flex-1 tw:text-[13px] tw:font-bold">{titulo}</h4>
        {acciones && <div className="tw:flex tw:flex-none tw:items-center tw:gap-2">{acciones}</div>}
      </div>
      {children}
    </div>
  );
}
const Dato = ({ t, v }: { t: string; v: ReactNode }) => <div className="tw:flex tw:flex-col"><dt className="tw:text-xs tw:text-muted">{t}</dt><dd className="tw:m-0 tw:font-semibold">{v}</dd></div>;

export default function PostarriendoNegocio({ negocioId, modo, alCambio }: { negocioId: string; modo: TModoPost; alCambio?: () => void }) {
  const [n, setN] = useState<any>(null);
  const [error, setError] = useState('');
  const [f, setF] = useState<Record<string, string> | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const [wsp, setWsp] = useState<null | { destino: string; texto: string; nombre: string; enviando: boolean }>(null);
  const [destino, setDestino] = useState('arrendatario');
  const cargar = useCallback(async () => { try { setN(await api<any>('negObtener', negocioId)); } catch (e) { setError(mensaje(e)); } }, [negocioId]);
  useEffect(() => { cargar(); }, [cargar]);
  if (!n) return <p className="tw:m-0 tw:text-[13px] tw:text-muted">{error || 'Cargando…'}</p>;

  const ciclo = n.ciclo || {}; const k = ciclo.contrato?.datos || {}; const post = ciclo.postarriendo || {};
  const moneda = n.valor?.moneda || 'CLP'; const renta = post.rentaActual || n.valor?.valor || 0;
  if (!k.inicio || !k.plazoMeses) return <p className="tw:m-0 tw:text-xs tw:text-muted">Faltan las condiciones del contrato (inicio y plazo): se llenan en el paso «Contrato firmado».</p>;
  const periodo = PERIODO[k.reajuste] || 0; const reajustes: any[] = post.reajustes || []; const reno = post.renovacion; const dev = post.devolucion;
  const extra = reno?.decision === 'renovar' ? Number(reno.meses) || 0 : 0;
  const termino = mas(k.inicio, Number(k.plazoMeses) + extra); const limite = mas(termino, 0, -(Number(k.avisoDias) || 0));
  const ultimoRef = reajustes.length ? reajustes[reajustes.length - 1].desde : k.inicio; const proximo = periodo ? mas(ultimoRef, periodo) : '';

  const guardar = async (cuerpo: Record<string, unknown>, aviso: string) => {
    await api('negPostarriendo', negocioId, cuerpo); toast(aviso); setF(null); setArchivo(null); setError(''); await cargar(); alCambio?.();
  };
  const campo = (c: string) => ({ value: f?.[c] ?? '', onChange: (e: { target: { value: string } }) => { setF((x) => ({ ...(x || {}), [c]: e.target.value })); setError(''); } });
  const correr = async (fn: () => Promise<void>) => { setTrabajando(true); setError(''); try { await fn(); } catch (e) { setError(mensaje(e)); } setTrabajando(false); };
  const bloque = (cuerpo: ReactNode, atras: () => void, id: string, texto: string, accion: () => Promise<void>) => (
    <>
      {cuerpo}
      {error && <p className="error tw:m-0 tw:text-[13px]" id="paError">{error}</p>}
      <div className="tw:flex tw:items-center tw:justify-end tw:gap-2 tw:flex-nowrap">
        <Boton variante="secundario" onClick={atras} disabled={trabajando}>Cancelar</Boton>
        <Boton id={id} icono="check" cargando={trabajando} onClick={() => correr(accion)}>{texto}</Boton>
      </div>
    </>
  );

  return (
    <div className="tw:flex tw:flex-col tw:gap-5" id="paPanel">
      {modo === 'reajustes' && <>
        <Seccion titulo="Reajuste de la renta" acciones={<Badge tono={periodo ? 'lavanda' : 'gris'}>{periodo ? `IPC cada ${periodo} meses` : 'Sin reajuste por IPC'}</Badge>}>
          {!periodo
            ? <p className="tw:m-0 tw:text-xs tw:text-muted">Este contrato no se reajusta por IPC (renta en UF o sin reajuste): no hay avisos que registrar.</p>
            : <dl className="tw:m-0 tw:grid tw:grid-cols-2 tw:gap-x-6 tw:gap-y-2 tw:text-[13px]">
              <Dato t="Renta actual" v={fmt(renta, moneda)} />
              <Dato t={proximo >= termino ? 'Último reajuste' : 'Próximo reajuste'} v={proximo >= termino ? 'No quedan reajustes en el plazo' : fdmy(proximo)} />
            </dl>}
        </Seccion>
        {reajustes.length > 0 && <Seccion titulo={`Reajustes aplicados (${reajustes.length})`}>
          <ul className="tw:list-none tw:m-0 tw:p-0 tw:flex tw:flex-col tw:gap-1.5">{reajustes.map((r, i) => <li key={i} className="tw:text-[13px]" data-reajuste={i}><b>{fdmy(r.desde)}</b> · IPC {String(r.ipc).replace('.', ',')}% · {fmt(r.rentaAntes, moneda)} → <b>{fmt(r.rentaNueva, moneda)}</b></li>)}</ul>
        </Seccion>}
        {periodo > 0 && proximo < termino && (f ? <Seccion titulo="Registrar el reajuste">{bloque(<>
          <div className="tw:grid tw:grid-cols-2 tw:gap-3"><Input etiqueta="Rige desde" id="paFecha" type="date" {...campo('desde')} /><Input etiqueta="IPC aplicado" id="paIpc" inputMode="decimal" sufijo="%" value={f.ipc ?? ''} onChange={(e) => { const ipc = num(e.target.value); setError(''); setF((x) => ({ ...(x || {}), ipc: e.target.value, ...(!x?.tocado && e.target.value && Number.isFinite(ipc) ? { rentaNueva: numTxt(Math.round(renta * (1 + ipc / 100))) } : {}) })); }} /></div>
          <Input etiqueta="Renta nueva" id="paRenta" inputMode="decimal" autoComplete="off" value={f.rentaNueva ?? ''} onChange={(e) => { setError(''); setF((x) => ({ ...(x || {}), rentaNueva: e.target.value, tocado: '1' })); }} />
          <p className="tw:m-0 tw:text-xs tw:text-muted">La renta nueva se calcula sola con el IPC; puedes corregirla. Avísale al arrendatario por escrito.</p>
        </>, () => setF(null), 'paGuardar', 'Registrar el reajuste', async () => {
          const ipc = num(f.ipc || ''); const nueva = num(f.rentaNueva || '');
          if (!Number.isFinite(ipc) || ipc === 0 && !f.ipc) return setError('Escribe el IPC aplicado.');
          if (!(nueva > 0)) return setError('Escribe la renta nueva.');
          if (!/^\d{4}-\d{2}-\d{2}$/.test(f.desde)) return setError('Indica desde cuándo rige.');
          await guardar({ tipo: 'reajuste', desde: f.desde, ipc, rentaNueva: nueva }, 'Reajuste registrado.');
        })}</Seccion>
          : <div className="tw:flex tw:justify-end"><Boton id="paRegistrar" icono="plus" variante="secundario" onClick={() => setF({ desde: proximo, ipc: '', rentaNueva: '' })}>Registrar el reajuste</Boton></div>)}
      </>}

      {modo === 'renovacion' && <>
        <Seccion titulo="Vencimiento del contrato" acciones={reno ? <Badge tono="verde" icono="check" ajustar>{reno.decision === 'renovar' ? 'Renovado' : 'Término acordado'}</Badge> : undefined}>
          <dl className="tw:m-0 tw:grid tw:grid-cols-2 tw:gap-x-6 tw:gap-y-2 tw:text-[13px]">
            <Dato t="El contrato termina el" v={fdmy(termino)} />
            <Dato t={`Aviso (${Number(k.avisoDias) || 0} días antes)`} v={reno ? 'Decidido' : `hasta el ${fdmy(limite)}`} />
          </dl>
        </Seccion>
        {reno && !f ? (
          <Seccion titulo="Decisión">
            <div className="tw:flex tw:items-center tw:gap-2 tw:flex-nowrap" data-decision={reno.decision}>
              <span className="tw:min-w-0 tw:flex-1 tw:text-[13px]"><b>{reno.decision === 'renovar' ? `Renovado por ${reno.meses} meses` : 'No se renueva: el contrato termina'}</b>{reno.nota ? <span className="tw:block tw:text-muted">{reno.nota}</span> : null}<span className="tw:block tw:text-xs tw:text-muted">Decidido el {fdmy(String(reno.fecha).slice(0, 10))}</span></span>
              <MenuMas tamano="sm" etiqueta="Más acciones" opciones={[{ texto: 'Cambiar la decisión', icono: 'edit', alTocar: () => setF({ decision: reno.decision, meses: String(reno.meses || 12), nota: reno.nota || '' }) }, { texto: 'Quitar la decisión', icono: 'x', alTocar: () => guardar({ tipo: 'quitar_renovacion' }, 'Decisión quitada.').catch((e) => setError(mensaje(e))) }]} />
            </div>
          </Seccion>
        ) : !f ? (
          <Seccion titulo="Decisión"><p className="tw:m-0 tw:text-xs tw:text-muted">Antes del límite de aviso, conversa con el propietario y con el arrendatario y registra si el contrato se renueva o termina.</p>
            <div className="tw:flex tw:items-center tw:justify-end tw:gap-2 tw:flex-nowrap"><Boton id="paTermino" variante="secundario" icono="x" onClick={() => setF({ decision: 'termino', meses: '12', nota: '' })}>Término del contrato</Boton><Boton id="paRenovar" icono="refresh" onClick={() => setF({ decision: 'renovar', meses: '12', nota: '' })}>Renovar</Boton></div></Seccion>
        ) : (
          <Seccion titulo={f.decision === 'renovar' ? 'Renovar el contrato' : 'Término del contrato'}>{bloque(<>
            {f.decision === 'renovar' && <Input etiqueta="Renovar por" id="paMeses" inputMode="numeric" sufijo="meses" {...campo('meses')} />}
            <Textarea etiqueta={<>Nota <span className="tw:font-normal tw:text-muted">(opcional)</span></>} rows={2} {...campo('nota')} />
          </>, () => setF(null), 'paDecidir', 'Guardar la decisión', async () => {
            if (f.decision === 'renovar' && !(Number(f.meses) >= 1)) return setError('Indica por cuántos meses se renueva.');
            await guardar({ tipo: 'renovacion', decision: f.decision, ...(f.decision === 'renovar' ? { meses: Number(f.meses) } : {}), nota: (f.nota || '').trim() }, f.decision === 'renovar' ? 'Renovación registrada.' : 'Término registrado.');
          })}</Seccion>
        )}
      </>}

      {modo === 'devolucion' && (() => {
        const garantia = ciclo.pagos?.garantia; const items = ciclo.entrega?.inventario || [];
        const desc = num(f?.descuento || '') || 0; const devolver = Math.max(0, (garantia?.monto || 0) - desc);
        return <>
          <Seccion titulo="Garantía" acciones={dev ? <Badge tono="verde" icono="check" ajustar>Devuelta</Badge> : undefined}>
            <dl className="tw:m-0 tw:grid tw:grid-cols-2 tw:gap-x-6 tw:gap-y-2 tw:text-[13px]">
              <Dato t="Garantía recibida" v={garantia ? fmt(garantia.monto, garantia.moneda) : 'Sin registrar'} />
              <Dato t="Inventario de la entrega" v={items.length ? `${items.length} espacios` : 'Sin inventario'} />
            </dl>
            <p className="tw:m-0 tw:text-xs tw:text-muted">Al término, compara el estado de la propiedad con el inventario de la entrega. Lo que se descuente debe estar respaldado por esa diferencia.</p>
          </Seccion>
          {dev && !f ? (
            <Seccion titulo="Devolución">
              <div className="tw:flex tw:items-center tw:gap-2 tw:flex-nowrap" data-devolucion>
                <span className="tw:min-w-0 tw:flex-1 tw:text-[13px]"><b>{fmt(dev.devuelto, dev.moneda)} devueltos el {fdmy(dev.fechaDevolucion)}</b><span className="tw:block tw:text-xs tw:text-muted">Recepción el {fdmy(dev.fechaRecepcion)} · {dev.conforme ? 'conforme con el inventario' : 'con observaciones'}{dev.descuento ? ` · descuento ${fmt(dev.descuento, dev.moneda)}${dev.motivo ? ` (${dev.motivo})` : ''}` : ''}</span></span>
                {dev.comprobante && <Boton tamano="sm" variante="secundario" icono="file" onClick={() => api('negArchivoAbrir', { negocioId, clave: dev.comprobante.clave, nombre: dev.comprobante.nombre }).catch((e) => setError(mensaje(e)))}>Ver comprobante</Boton>}
                <MenuMas tamano="sm" etiqueta="Más acciones" opciones={[{ texto: 'Quitar el registro', icono: 'trash', alTocar: () => guardar({ tipo: 'quitar_devolucion' }, 'Registro eliminado.').catch((e) => setError(mensaje(e))) }]} />
              </div>
            </Seccion>
          ) : !f ? (
            <div className="tw:flex tw:justify-end"><Boton id="paRegistrar" icono="plus" variante="secundario" onClick={() => setF({ fechaRecepcion: hoy(), conforme: 'si', descuento: '', motivo: '', fechaDevolucion: hoy() })}>Registrar la devolución</Boton></div>
          ) : (
            <Seccion titulo="Registrar la devolución">{bloque(<>
              <div className="tw:grid tw:grid-cols-2 tw:gap-3"><Input etiqueta="Recepción de la propiedad" id="paFecha" type="date" {...campo('fechaRecepcion')} /><Select etiqueta="Contra el inventario" opciones={[['si', 'Conforme'], ['no', 'Con observaciones']]} {...campo('conforme')} /></div>
              <div className="tw:grid tw:grid-cols-2 tw:gap-3"><Input etiqueta="Descuento" id="paDescuento" inputMode="decimal" placeholder="0" {...campo('descuento')} /><Input etiqueta="Se devuelve" id="paMonto" readOnly value={numTxt(devolver) || '0'} /></div>
              <Input etiqueta="Motivo del descuento" autoComplete="off" {...campo('motivo')} />
              <Input etiqueta="Fecha de la devolución" type="date" {...campo('fechaDevolucion')} />
              <div className="tw:flex tw:items-center tw:gap-2 tw:flex-nowrap">
                <input ref={entrada} type="file" style={{ display: 'none' }} accept="image/*,.pdf" onChange={(e) => { setArchivo(e.target.files?.[0] ?? null); e.target.value = ''; }} />
                <Boton variante="secundario" icono="upload" onClick={() => entrada.current?.click()}>{archivo ? 'Cambiar comprobante' : 'Adjuntar comprobante'}</Boton>
                <span className="tw:min-w-0 tw:flex-1 tw:truncate tw:text-xs tw:text-muted">{archivo ? archivo.name : 'JPG, PNG o PDF'}</span>
              </div>
            </>, () => { setF(null); setArchivo(null); }, 'paDevolver', 'Registrar la devolución', async () => {
              if (!garantia) return setError('Primero registra la garantía recibida (paso «Garantía y primer mes recibidos»).');
              if (desc < 0 || desc > garantia.monto) return setError('El descuento no puede ser mayor que la garantía.');
              if (desc > 0 && !(f.motivo || '').trim()) return setError('Escribe el motivo del descuento.');
              const adjunto = archivo ? { nombre: archivo.name, mime: archivo.type || undefined, bytes: new Uint8Array(await archivo.arrayBuffer()) } : undefined;   // el servidor lo sube
              await guardar({ tipo: 'devolucion', fechaRecepcion: f.fechaRecepcion, conforme: f.conforme === 'si', descuento: desc, motivo: (f.motivo || '').trim(), fechaDevolucion: f.fechaDevolucion, ...(adjunto ? { archivo: adjunto } : {}) }, 'Devolución registrada.');
            })}</Seccion>
          )}
        </>;
      })()}
      {/* el aviso por WhatsApp: sale armado, se edita y SOLO se envía si el corredor lo decide */}
      {!f && (() => {
        const tipo = modo === 'reajustes' ? 'reajuste' : modo === 'renovacion' ? 'renovacion' : 'devolucion';
        const enviados: any[] = (post.avisos || []).filter((a: any) => a.tipo === tipo);
        const preparar = async () => { setError(''); try { const r = await api<any>('negAvisoPreparar', { negocioId, tipo, destino }); setWsp({ destino, texto: r.texto, nombre: r.persona?.nombre || '', enviando: false }); } catch (e) { setError(mensaje(e)); } };
        const enviar = async (via?: 'abrir') => {
          if (!wsp) return; setWsp({ ...wsp, enviando: true }); setError('');
          try { const r = await api<any>('negAvisoEnviar', { negocioId, tipo, destino: wsp.destino, texto: wsp.texto, modo: via }); toast(r.automatico ? `Aviso enviado por WhatsApp a ${wsp.nombre}.` : 'Se abrió WhatsApp con el mensaje listo.'); setWsp(null); await cargar(); alCambio?.(); }
          catch (e) { setError(mensaje(e)); setWsp((w) => (w ? { ...w, enviando: false } : w)); }
        };
        return wsp ? (
          <Seccion titulo={`Aviso para ${wsp.nombre}`}>
            <Textarea etiqueta="Mensaje por WhatsApp" id="paTexto" rows={8} value={wsp.texto} onChange={(e) => setWsp((w) => (w ? { ...w, texto: e.target.value } : w))} />
            {error && <p className="error tw:m-0 tw:text-[13px]" id="paError">{error}</p>}
            <div className="tw:flex tw:items-center tw:justify-end tw:gap-2 tw:flex-nowrap">
              <MenuMas tamano="md" etiqueta="Otras formas de enviarlo" opciones={[{ texto: 'Abrir en WhatsApp (yo lo envío)', icono: 'whatsapp', disabled: wsp.enviando, alTocar: () => enviar('abrir') }]} />
              <Boton variante="secundario" onClick={() => { setWsp(null); setError(''); }} disabled={wsp.enviando}>Cancelar</Boton>
              <Boton id="paEnviar" variante="exito" icono="whatsapp" cargando={wsp.enviando} onClick={() => enviar()}>Enviar por WhatsApp</Boton>
            </div>
          </Seccion>
        ) : (
          <Seccion titulo="Avisar por WhatsApp">
            {enviados.length > 0 && <ul className="tw:list-none tw:m-0 tw:p-0 tw:flex tw:flex-col tw:gap-1">{enviados.map((a, i) => <li key={i} className="tw:text-xs tw:text-muted" data-aviso={i}>Avisado a {a.persona} ({a.destino}) el {fdmy(String(a.fecha).slice(0, 10))}{a.automatico ? '' : ' · abierto en WhatsApp'}</li>)}</ul>}
            <div className="tw:flex tw:items-end tw:justify-end tw:gap-2 tw:flex-nowrap">
              <div className="tw:w-44"><Select etiqueta="A quién" id="paDestino" opciones={[['arrendatario', 'Arrendatario'], ['propietario', 'Propietario']]} value={destino} onChange={(e) => setDestino(e.target.value)} /></div>
              <Boton id="paAvisar" variante="secundario" icono="whatsapp" onClick={preparar}>Preparar el aviso</Boton>
            </div>
          </Seccion>
        );
      })()}
      {error && !f && !wsp && <p className="error tw:m-0 tw:text-[13px]">{error}</p>}
    </div>
  );
}
