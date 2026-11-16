// Pagos de un arriendo (etapa 2 · Cierre del arriendo): reserva, garantía y primer mes, y la comisión. Asset NO cobra: solo
// registra cada pago con su monto, fecha y comprobante. El contenido de los pasos «Reserva pagada», «Garantía y primer mes
// recibidos» y «Comisión facturada y cobrada» dentro de su ventana (modal-13, ventanas/inmo/Etapas.tsx › MenuPaso).
//  · reserva: al registrarla, el negocio pasa a la etapa «Reserva» y la propiedad queda «Reservada»;
//  · garantía y primer mes: son dos pagos; el paso se logra cuando están los dos;
//  · comisión: la fecha de facturación sale sola a 30 días de la entrega; se registra la factura (n.º, fecha, monto) y, al
//    registrar el pago, el negocio se cierra como ganado y parte el postarriendo. La comisión queda asignada al corredor.
// Todo queda en el negocio (ciclo.pagos / ciclo.comision) con negGuardar; los comprobantes van a R2 (negArchivoSubir).
// Los id (#pgPanel, #pgMonto, #pgFecha, #pgGuardar, #pgFactura, #pgFacturaN, #pgFacturaGuardar) los usan las pruebas.
/* eslint-disable @typescript-eslint/no-explicit-any -- el negocio llega del proceso principal sin tipos */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Boton from '../../ui/Boton';
import Badge from '../../ui/Badge';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import Textarea from '../../ui/Textarea';
import MenuMas from '../../ui/MenuMas';
import { ModalConfirmar } from '../../ui/Modal';
import { api } from '../../../utils/api';
import { toast } from '../../../utils/app';

export type TModoPago = 'reserva' | 'garantia' | 'comision';
interface IPago { monto: number; moneda: string; fecha: string; medio: string; nota: string; comprobante: { clave: string; nombre: string; tipo: string; bytes: number; fecha: string } | null }

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));
const hoy = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const sumarDias = (f: string, n: number) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const fdmy = (f: string) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '—');
const fmt = (v: number | null | undefined, mo: string) => (!v ? '—' : mo === 'UF' ? `UF ${Number(v).toLocaleString('es-CL')}` : mo === 'USD' ? `US$ ${Number(v).toLocaleString('es-CL')}` : `$${Number(v).toLocaleString('es-CL')}`);
const num = (s: string) => Number(String(s).replace(/\./g, '').replace(',', '.'));
const numTxt = (v: number | null | undefined) => (v ? Number(v).toLocaleString('es-CL', { maximumFractionDigits: 2 }) : '');
const MEDIOS: [string, string][] = [['transferencia', 'Transferencia'], ['efectivo', 'Efectivo'], ['cheque', 'Cheque'], ['tarjeta', 'Tarjeta'], ['otro', 'Otro']];
const MEDIO_TXT = Object.fromEntries(MEDIOS);

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

/** un pago: si ya está registrado se ve resumido; si no, el formulario para registrarlo */
function PagoSeccion({ titulo, ayuda, negocioId, pago, monto0, moneda0, alGuardar, alBorrar, id }: {
  titulo: string; ayuda?: string; negocioId: string; pago: IPago | null | undefined; monto0?: number | null; moneda0?: string;
  alGuardar: (p: IPago) => Promise<void>; alBorrar: () => Promise<void>; id: string;
}) {
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState({ monto: '', moneda: 'CLP', fecha: hoy(), medio: 'transferencia', nota: '' });
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState(''); const [trabajando, setTrabajando] = useState(false); const [borrar, setBorrar] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const abrirForm = (p?: IPago | null) => { setF(p ? { monto: numTxt(p.monto), moneda: p.moneda, fecha: p.fecha, medio: p.medio, nota: p.nota } : { monto: numTxt(monto0), moneda: moneda0 || 'CLP', fecha: hoy(), medio: 'transferencia', nota: '' }); setArchivo(null); setError(''); setEditando(true); };
  const campo = (k: keyof typeof f) => ({ value: f[k], onChange: (e: { target: { value: string } }) => { setF((x) => ({ ...x, [k]: e.target.value })); setError(''); } });

  const registrar = async () => {
    if (!(num(f.monto) > 0)) return setError('Escribe el monto.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.fecha)) return setError('Indica la fecha del pago.');
    setTrabajando(true); setError('');
    try {
      let comprobante = pago?.comprobante ?? null;
      if (archivo) { comprobante = await api<any>('negArchivoSubir', { negocioId, nombre: archivo.name, mime: archivo.type || undefined, bytes: new Uint8Array(await archivo.arrayBuffer()) }); }
      await alGuardar({ monto: num(f.monto), moneda: f.moneda, fecha: f.fecha, medio: f.medio, nota: f.nota.trim(), comprobante });
      setEditando(false);
    } catch (e) { setError(mensaje(e)); }
    setTrabajando(false);
  };
  const verComprobante = async () => { try { await api('negArchivoAbrir', { negocioId, clave: pago!.comprobante!.clave, nombre: pago!.comprobante!.nombre }); } catch (e) { setError(mensaje(e)); } };

  if (pago && !editando) return (
    <Seccion titulo={titulo} acciones={<Badge tono="verde" icono="check" ajustar>Registrado</Badge>}>
      <div className="tw:flex tw:items-center tw:gap-2 tw:flex-nowrap" data-pago={id}>
        <div className="tw:min-w-0 tw:flex-1 tw:flex tw:flex-col tw:gap-0.5">
          <b className="tw:text-[13px]">{fmt(pago.monto, pago.moneda)}</b>
          <small className="tw:text-xs tw:text-muted">{[fdmy(pago.fecha), MEDIO_TXT[pago.medio] || pago.medio, pago.nota].filter(Boolean).join(' · ')}</small>
        </div>
        {pago.comprobante && <Boton tamano="sm" variante="secundario" icono="file" onClick={verComprobante}>Ver comprobante</Boton>}
        <MenuMas tamano="sm" etiqueta="Más acciones del pago" opciones={[{ texto: 'Editar el pago', icono: 'edit', alTocar: () => abrirForm(pago) }, { texto: 'Eliminar el pago', icono: 'trash', alTocar: () => setBorrar(true) }]} />
      </div>
      {error && <p className="error tw:m-0 tw:text-[13px]">{error}</p>}
      <ModalConfirmar abierto={borrar} onCerrar={() => setBorrar(false)} titulo="¿Eliminar este pago?" peligro textoConfirmar="Eliminar" mensaje="Solo se borra el registro en Asset (el comprobante queda guardado en los archivos del negocio)." onConfirmar={async () => { setBorrar(false); try { await alBorrar(); } catch (e) { setError(mensaje(e)); } }} />
    </Seccion>
  );
  if (!editando) return (
    <Seccion titulo={titulo} acciones={<Badge tono="gris" punto>Sin registrar</Badge>}>
      {ayuda && <p className="tw:m-0 tw:text-xs tw:text-muted">{ayuda}</p>}
      <div className="tw:flex tw:justify-end"><Boton id={`pgRegistrar-${id}`} icono="plus" variante="secundario" onClick={() => abrirForm()}>Registrar el pago</Boton></div>
    </Seccion>
  );
  return (
    <Seccion titulo={titulo}>
      <div className="tw:grid tw:grid-cols-[1fr_110px] tw:gap-3">
        <Input etiqueta="Monto" id="pgMonto" inputMode="decimal" autoComplete="off" pendiente={!f.monto} {...campo('monto')} />
        <Select etiqueta="Moneda" opciones={[['CLP', 'Pesos'], ['UF', 'UF'], ['USD', 'Dólares']]} {...campo('moneda')} />
      </div>
      <div className="tw:grid tw:grid-cols-2 tw:gap-3">
        <Input etiqueta="Fecha del pago" id="pgFecha" type="date" {...campo('fecha')} />
        <Select etiqueta="Medio" opciones={MEDIOS} {...campo('medio')} />
      </div>
      <Textarea etiqueta={<>Nota <span className="tw:font-normal tw:text-muted">(opcional)</span></>} rows={2} {...campo('nota')} />
      <div className="tw:flex tw:items-center tw:gap-2 tw:flex-nowrap">
        <input ref={entrada} type="file" style={{ display: 'none' }} accept="image/*,.pdf" onChange={(e) => { setArchivo(e.target.files?.[0] ?? null); e.target.value = ''; }} />
        <Boton variante="secundario" icono="upload" onClick={() => entrada.current?.click()}>{archivo ? 'Cambiar comprobante' : pago?.comprobante ? 'Reemplazar el comprobante' : 'Adjuntar comprobante'}</Boton>
        <span className="tw:min-w-0 tw:flex-1 tw:truncate tw:text-xs tw:text-muted">{archivo ? archivo.name : pago?.comprobante ? pago.comprobante.nombre : 'JPG, PNG o PDF'}</span>
      </div>
      {error && <p className="error tw:m-0 tw:text-[13px]" id="pgError">{error}</p>}
      <div className="tw:flex tw:items-center tw:justify-end tw:gap-2 tw:flex-nowrap">
        <Boton variante="secundario" onClick={() => setEditando(false)} disabled={trabajando}>Cancelar</Boton>
        <Boton id="pgGuardar" icono="check" cargando={trabajando} onClick={registrar}>Registrar el pago</Boton>
      </div>
    </Seccion>
  );
}

export default function PagosNegocio({ negocioId, modo, alCambio }: { negocioId: string; modo: TModoPago; alCambio?: () => void }) {
  const [n, setN] = useState<any>(null);
  const [error, setError] = useState('');
  const [fac, setFac] = useState<{ numero: string; fecha: string; monto: string; moneda: string } | null>(null);
  const [borrarFac, setBorrarFac] = useState(false);

  const cargar = useCallback(async () => { try { setN(await api<any>('negObtener', negocioId)); } catch (e) { setError(mensaje(e)); } }, [negocioId]);
  useEffect(() => { cargar(); }, [cargar]);
  // la fecha de facturación sale sola a 30 días de la entrega; se guarda para que «Hoy» avise
  const cierre = n?.ciclo || {}; const co = cierre.comision || {};
  const entregaFecha = (() => {
    if (!n) return hoy();
    const p = ((window as any).Inmo?._IM?.data?.propiedades || []).find((x: any) => x.id === n.prop?.id);
    const f = (p?.firmas || []).filter((x: any) => /acta de entrega|entrega/i.test(x.plantilla || '') && x.negocioId === n.id && x.estado === 'firmado').map((x: any) => String(x.firmado || x.fecha || '').slice(0, 10)).sort().pop();
    return f || cierre.entrega?.fecha || hoy();
  })();
  const facturaFecha = co.facturaFecha || sumarDias(entregaFecha, 30);

  const guardarCierre = async (mut: (c: any) => void, aviso?: string) => {
    const base = JSON.parse(JSON.stringify((await api<any>('negObtener', negocioId)).ciclo || {})); mut(base);
    await api('negGuardar', { id: negocioId, ciclo: base }); if (aviso) toast(aviso); await cargar(); alCambio?.();
  };
  useEffect(() => { if (n && modo === 'comision' && !co.facturaFecha && n.estado === 'abierto') guardarCierre((c) => { c.comision = { ...(c.comision || {}), facturaFecha }; }).catch(() => null); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [n?.id]);
  if (!n) return <p className="tw:m-0 tw:text-[13px] tw:text-muted">{error || 'Cargando…'}</p>;

  const renta = n.valor?.valor || null; const monedaRenta = n.valor?.moneda || 'CLP';
  const pagos = cierre.pagos || {};
  const poner = (clave: string, p: IPago) => guardarCierre((c) => { c.pagos = { ...(c.pagos || {}), [clave]: p }; }, 'Pago registrado.');
  const quitar = (clave: string) => guardarCierre((c) => { const x = { ...(c.pagos || {}) }; delete x[clave]; c.pagos = x; }, 'Pago eliminado.');
  // al registrar la reserva, el negocio pasa a «Reserva» y la propiedad queda «Reservada»
  const ponerReserva = async (p: IPago) => {
    await poner('reserva', p);
    if (n.estado === 'abierto' && n.orden < 2) { try { await api('negMover', negocioId, 'reserva', 'Reserva pagada'); toast('El negocio pasó a «Reserva» y la propiedad quedó reservada.'); await cargar(); alCambio?.(); } catch { /* ya estaba más adelante */ } }
  };
  const ponerComisionPago = async (p: IPago) => {
    await guardarCierre((c) => { c.comision = { ...(c.comision || {}), pago: p }; }, 'Pago de la comisión registrado.');
    if (n.estado === 'abierto') { try { await api('negCerrar', negocioId, 'ganado'); toast('¡Negocio cerrado como ganado! Parte el postarriendo.', 5000); await cargar(); alCambio?.(); } catch (e) { setError(mensaje(e)); } }
  };

  return (
    <div className="tw:flex tw:flex-col tw:gap-5" id="pgPanel">
      {modo === 'reserva' && <PagoSeccion id="reserva" titulo="Reserva" ayuda="El interesado paga la reserva para que la propiedad quede apartada mientras se le evalúa. Al registrarla, la propiedad pasa a «Reservada»." negocioId={negocioId} pago={pagos.reserva} moneda0={monedaRenta} alGuardar={ponerReserva} alBorrar={() => quitar('reserva')} />}
      {modo === 'garantia' && <>
        <PagoSeccion id="garantia" titulo="Garantía" ayuda={n.oferta?.garantia ? `Lo pactado: ${n.oferta.garantia}.` : undefined} negocioId={negocioId} pago={pagos.garantia} monto0={/mes/i.test(n.oferta?.garantia || '') && renta ? renta * (Number(/\d+/.exec(n.oferta.garantia)?.[0]) || 1) : null} moneda0={monedaRenta} alGuardar={(p) => poner('garantia', p)} alBorrar={() => quitar('garantia')} />
        <PagoSeccion id="primerMes" titulo="Primer mes de arriendo" negocioId={negocioId} pago={pagos.primerMes} monto0={renta} moneda0={monedaRenta} alGuardar={(p) => poner('primerMes', p)} alBorrar={() => quitar('primerMes')} />
      </>}
      {modo === 'comision' && <>
        <Seccion titulo="Comisión" acciones={<Badge tono="gris">Asignada a {n.corredor || 'el corredor del negocio'}</Badge>}>
          <dl className="tw:m-0 tw:grid tw:grid-cols-2 tw:gap-x-6 tw:gap-y-2 tw:text-[13px]">
            <div className="tw:flex tw:flex-col"><dt className="tw:text-xs tw:text-muted">Monto de la comisión</dt><dd className="tw:m-0 tw:font-semibold">{n.comisionMonto ? fmt(n.comisionMonto, monedaRenta) : 'Sin definir (se escribe al facturar)'}</dd></div>
            <div className="tw:flex tw:flex-col"><dt className="tw:text-xs tw:text-muted">Se factura el</dt><dd className="tw:m-0 tw:font-semibold">{fdmy(facturaFecha)} <span className="tw:font-normal tw:text-muted">(30 días desde la entrega)</span></dd></div>
          </dl>
        </Seccion>
        {co.factura && !fac ? (
          <Seccion titulo="Factura" acciones={<Badge tono="verde" icono="check" ajustar>Emitida</Badge>}>
            <div className="tw:flex tw:items-center tw:gap-2 tw:flex-nowrap" data-pago="factura">
              <div className="tw:min-w-0 tw:flex-1 tw:flex tw:flex-col tw:gap-0.5"><b className="tw:text-[13px]">{co.factura.numero ? `Factura nº ${co.factura.numero}` : 'Factura'} · {fmt(co.factura.monto, co.factura.moneda)}</b><small className="tw:text-xs tw:text-muted">Emitida el {fdmy(co.factura.fecha)}</small></div>
              <MenuMas tamano="sm" etiqueta="Más acciones de la factura" opciones={[{ texto: 'Editar la factura', icono: 'edit', alTocar: () => setFac({ numero: co.factura.numero || '', fecha: co.factura.fecha, monto: numTxt(co.factura.monto), moneda: co.factura.moneda }) }, { texto: 'Eliminar la factura', icono: 'trash', alTocar: () => setBorrarFac(true) }]} />
            </div>
            <ModalConfirmar abierto={borrarFac} onCerrar={() => setBorrarFac(false)} titulo="¿Eliminar la factura?" peligro textoConfirmar="Eliminar" mensaje="Solo se borra el registro en Asset." onConfirmar={async () => { setBorrarFac(false); await guardarCierre((c) => { const x = { ...(c.comision || {}) }; delete x.factura; c.comision = x; }, 'Factura eliminada.'); }} />
          </Seccion>
        ) : !fac ? (
          <Seccion titulo="Factura"><p className="tw:m-0 tw:text-xs tw:text-muted">Emite la factura de la comisión y regístrala aquí.</p><div className="tw:flex tw:justify-end"><Boton id="pgFactura" icono="plus" variante="secundario" onClick={() => setFac({ numero: '', fecha: hoy(), monto: numTxt(n.comisionMonto), moneda: monedaRenta })}>Registrar la factura</Boton></div></Seccion>
        ) : (
          <Seccion titulo="Factura">
            <div className="tw:grid tw:grid-cols-2 tw:gap-3">
              <Input etiqueta="Nº de factura" id="pgFacturaN" autoComplete="off" value={fac.numero} onChange={(e) => setFac({ ...fac, numero: e.target.value })} />
              <Input etiqueta="Fecha de emisión" type="date" value={fac.fecha} onChange={(e) => setFac({ ...fac, fecha: e.target.value })} />
            </div>
            <div className="tw:grid tw:grid-cols-[1fr_110px] tw:gap-3">
              <Input etiqueta="Monto de la comisión" id="pgFacturaMonto" inputMode="decimal" autoComplete="off" value={fac.monto} onChange={(e) => setFac({ ...fac, monto: e.target.value })} />
              <Select etiqueta="Moneda" opciones={[['CLP', 'Pesos'], ['UF', 'UF'], ['USD', 'Dólares']]} value={fac.moneda} onChange={(e) => setFac({ ...fac, moneda: e.target.value })} />
            </div>
            {error && <p className="error tw:m-0 tw:text-[13px]" id="pgError">{error}</p>}
            <div className="tw:flex tw:items-center tw:justify-end tw:gap-2 tw:flex-nowrap">
              <Boton variante="secundario" onClick={() => { setFac(null); setError(''); }}>Cancelar</Boton>
              <Boton id="pgFacturaGuardar" icono="check" onClick={async () => { if (!(num(fac.monto) > 0)) return setError('Escribe el monto de la comisión.'); setError(''); try { await guardarCierre((c) => { c.comision = { ...(c.comision || {}), facturaFecha, corredor: n.corredor || '', factura: { numero: fac.numero.trim(), fecha: fac.fecha, monto: num(fac.monto), moneda: fac.moneda } }; }, 'Factura registrada.'); setFac(null); } catch (e) { setError(mensaje(e)); } }}>Guardar la factura</Boton>
            </div>
          </Seccion>
        )}
        <PagoSeccion id="comisionPago" titulo="Pago de la comisión" ayuda="Al registrar el pago, el negocio se cierra como ganado y parte el postarriendo." negocioId={negocioId} pago={co.pago} monto0={co.factura?.monto || n.comisionMonto || null} moneda0={co.factura?.moneda || monedaRenta} alGuardar={ponerComisionPago} alBorrar={() => guardarCierre((c) => { const x = { ...(c.comision || {}) }; delete x.pago; c.comision = x; }, 'Pago eliminado.')} />
      </>}
      {error && !fac && <p className="error tw:m-0 tw:text-[13px]">{error}</p>}
    </div>
  );
}
