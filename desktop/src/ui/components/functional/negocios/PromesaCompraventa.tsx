// modal-147: la promesa de compraventa de un negocio de venta, lista para revisar y enviar a firmar (misma idea que la carta oferta,
// modal-125, y el mandato de venta, modal-131).
//   · izquierda: los datos de la promesa, ordenados (comprador, vendedor(es), inmueble, precio y forma de pago, plazos y condiciones).
//     Todo se puede editar aquí; «Guardar y actualizar PDF» lo guarda en su origen (la ficha de cada persona, la propiedad y el
//     negocio: precio y condiciones de la carta oferta, y lo propio de la promesa en n.ciclo.promesa) y vuelve a armar el PDF.
//   · derecha: el PDF tal como se firmaría. Firman el comprador y el/los vendedor(es).
// Si al abrirla falta algo (p. ej. el vendedor no tiene RUT), la ventana se abre igual con el aviso y se completa aquí mismo.
// Firmar en Asset es opcional: «Descargar PDF» (menú «⋯») guarda el documento sin enviarlo.
// La lógica (guardar, generar el PDF, enviar) está en src/renderer/etapas.js (promesaCompraventa) y llega en las props.
// Los id (#pcCoNombre…, #pcVe0Nombre…, #pcRol, #pcFojas, #pcNumero, #pcAnio, #pcConservador, #pcMonto, #pcMoneda, #pcPie, #pcSeriedad,
// #pcComision, #pcSaldo, #pcPagoNota, #pcEscritura, #pcEntrega, #pcNotaria, #pcCond, #pcGuardar, #pcDescargar, #mCancel, #mOk)
// los usan las pruebas.
import { useState } from 'react';
import Boton from '../../ui/Boton';
import Badge from '../../ui/Badge';
import Card from '../../ui/Card';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import Textarea from '../../ui/Textarea';
import MenuMas from '../../ui/MenuMas';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../ui/Ventana';
import { NOTA } from '../gestion/editor-pdf/Modales';
import { ErrorVentana } from './VentanasAntiguas';
import DatosPersona, { faltaDePersona, guardarPersonaDoc, personaCambio, type IPersonaDoc } from './DatosPersona';
import { cerrarModal } from '../../../utils/modal';
import { toast } from '../../../utils/app';
import { descargarPdf } from '../../../utils/pdf';
import { formatearRut } from '../../../utils/rut';
import { PdfCargando } from '../agenda/VisorPdf';
import PdfConFirmas from '../agenda/PdfConFirmas';
import { usePdfInicial, type IPdfInicial } from '../agenda/usePdfInicial';

export interface IPromesaDatos {
  comprador: IPersonaDoc;
  /** los propietarios: prometen vender y firman la promesa */
  vendedores: IPersonaDoc[];
  /** el inmueble: rol de avalúo e inscripción de dominio (se guardan en la propiedad) */
  rol: string; fojas: string; numero: string; anio: string; conservador: string;
  /** precio y forma de pago (los de la carta oferta aceptada; si se cambian aquí, se cambian en el negocio) */
  monto: string; moneda: string; piePct: string; seriedadUF: string; comisionPct: string;
  /** cómo se paga el saldo: 'hipotecario' o 'contado' */
  saldoForma: string; pagoNota: string;
  /** lo propio de la promesa: días para la escritura (vacío: los de la carta, o 90), fecha de entrega (AAAA-MM-DD), notaría y otras condiciones */
  escrituraDias: string; fechaEntrega: string; notaria: string; condiciones: string;
}
export interface IPromesaCompraventaProps {
  pdf?: string;
  /** lo que impidió armar el PDF (falta el RUT, el precio…): se muestra al abrir y se completa aquí mismo */
  errorInicial?: string;
  /** el PDF que se está armando (o trayendo): la ventana se abre ya y la vista previa lo muestra al llegar */
  pdfPromesa?: Promise<IPdfInicial>;
  archivo: string;
  propiedad: { codigo: string; titulo: string; direccion: string };
  datos: IPromesaDatos;
  /** guarda los datos de la propiedad y del negocio (los de las personas los guarda la ventana) y devuelve el PDF nuevo */
  alGuardar: (d: IPromesaDatos) => Promise<{ pdf: string }>;
  alEnviar: () => Promise<void>;
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));
const num = (t: string) => Number(String(t).replace(/\./g, '').replace(',', '.'));
const dec = (t: string) => Number(String(t).replace(',', '.'));

export function PromesaCompraventa({ pdf: pdf0, pdfPromesa, errorInicial, archivo, propiedad, datos, alGuardar, alEnviar }: IPromesaCompraventaProps) {
  const [v, setV] = useState<IPromesaDatos>(datos);
  const [guardado, setGuardado] = useState<IPromesaDatos>(datos);
  const { pdf, setPdf, cargando: cargandoPdf, errorCarga, firmantes: firmantesPdf } = usePdfInicial(pdf0, pdfPromesa);
  const [guardando, setGuardando] = useState(false); const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(errorInicial || '');
  const sucio = JSON.stringify(v) !== JSON.stringify(guardado);
  const cambiar = (k: Exclude<keyof IPromesaDatos, 'comprador' | 'vendedores'>) => (e: { target: { value: string } }) => { setV((x) => ({ ...x, [k]: e.target.value })); setError(''); };
  const campo = (k: Exclude<keyof IPromesaDatos, 'comprador' | 'vendedores'>) => ({ value: v[k], onChange: cambiar(k) });
  const comprador = (p: IPersonaDoc) => { setV((x) => ({ ...x, comprador: p })); setError(''); };
  const vendedor = (i: number) => (p: IPersonaDoc) => { setV((x) => ({ ...x, vendedores: x.vendedores.map((q, j) => (j === i ? p : q)) })); setError(''); };

  const todas = [{ p: v.comprador, quien: 'comprador' }, ...v.vendedores.map((p, i) => ({ p, quien: v.vendedores.length > 1 ? `vendedor ${i + 1}` : 'vendedor' }))];
  // lo que falta para armar el documento (el correo y la inscripción de dominio solo hacen falta para enviarlo a firmar)
  const faltaPersonas = todas.flatMap(({ p, quien }) => faltaDePersona(p, false).map((f) => `${f} del ${quien}${p.nombre ? ` (${p.nombre})` : ''}`));
  const faltaCorreo = todas.filter(({ p }) => faltaDePersona(p, true).includes('correo')).map(({ p }) => p.nombre || 'una persona');
  const faltaDominio = !v.fojas.trim() || !v.numero.trim();
  const err = {
    monto: !(num(v.monto) > 0) ? 'Escribe el precio de la compraventa' : '',
    pie: v.piePct !== '' && !(dec(v.piePct) > 0 && dec(v.piePct) < 100) ? 'Entre 0 y 100' : '',
    seriedad: v.seriedadUF !== '' && !(dec(v.seriedadUF) > 0) ? 'Número' : '',
    comision: v.comisionPct !== '' && !(dec(v.comisionPct) > 0 && dec(v.comisionPct) <= 20) ? 'Entre 0 y 20' : '',
    escritura: v.escrituraDias !== '' && !/^\d{1,3}$/.test(v.escrituraDias) ? 'Solo días, en número' : '',
  };
  const invalido = faltaPersonas.length > 0 || Object.values(err).some(Boolean);

  const guardar = async () => {
    if (invalido) return setError(faltaPersonas.length ? `Falta: ${faltaPersonas.join(', ')}.` : 'Corrige los datos marcados antes de guardar.');
    setGuardando(true); setError('');
    try {
      const nuevos = [v.comprador, ...v.vendedores].map((p, i) => ({ ...p, rut: formatearRut(p.rut) || p.rut, base: (i === 0 ? guardado.comprador : guardado.vendedores[i - 1])?.base ?? p.base }));
      const antes = [guardado.comprador, ...guardado.vendedores];
      for (let i = 0; i < nuevos.length; i++) if (personaCambio(nuevos[i], antes[i])) await guardarPersonaDoc(nuevos[i]);   // primero las personas: el servidor arma el PDF con lo guardado en sus fichas
      const nuevo: IPromesaDatos = { ...v, comprador: nuevos[0], vendedores: nuevos.slice(1), rol: v.rol.trim(), fojas: v.fojas.trim(), numero: v.numero.trim(), anio: v.anio.trim(), conservador: v.conservador.trim(), notaria: v.notaria.trim(), pagoNota: v.pagoNota.trim(), condiciones: v.condiciones.trim() };
      const r = await alGuardar(nuevo);
      setV(nuevo); setGuardado(nuevo); setPdf(r.pdf);
    } catch (e) { setError(mensaje(e)); }
    setGuardando(false);
  };
  const enviar = async () => { setEnviando(true); setError(''); try { await alEnviar(); } catch (e) { setError(mensaje(e)); setEnviando(false); } };
  const descargar = async () => { if (!pdf) return; try { if (await descargarPdf(pdf, archivo)) toast('PDF guardado.'); } catch (e) { setError(mensaje(e)); } };
  const bloqueo = sucio ? 'Guarda los cambios antes de enviar' : faltaCorreo.length ? `Falta el correo de ${faltaCorreo.join(', ')}` : faltaDominio ? 'Falta la inscripción de dominio (fojas y número)' : undefined;

  return <>
    <VentanaCabecera icono="sign" titulo="Promesa de compraventa" descripcion="Revisa los datos y ajústalos si hace falta: el PDF se actualiza al guardar." cerrable={!enviando} />
    <VentanaCuerpo>
      <div className="ov-doble tw:grid tw:grid-cols-1 tw:lg:grid-cols-[minmax(320px,400px)_1fr] tw:gap-4 tw:items-start">
        <div className="tw:flex tw:flex-col tw:gap-3">
          <Card titulo="Promitente comprador" subtitulo="Compra el inmueble y firma la promesa">
            <DatosPersona idp="pcCo" valor={v.comprador} alCambiar={comprador} />
          </Card>

          {v.vendedores.length ? v.vendedores.map((p, i) => (
            <Card key={p.id} titulo={v.vendedores.length > 1 ? `Promitente vendedor ${i + 1}` : 'Promitente vendedor'} subtitulo="Es el propietario: vende y firma la promesa">
              <DatosPersona idp={`pcVe${i}`} valor={p} alCambiar={vendedor(i)} />
            </Card>
          )) : (
            <Card titulo="Promitente vendedor" subtitulo="Falta vincularlo"><p className={NOTA}>La propiedad no tiene propietario en su ficha: vincúlalo desde la ficha de la propiedad para armar la promesa.</p></Card>
          )}

          <Card titulo="Inmueble" subtitulo={`${propiedad.codigo} · ${propiedad.direccion}`}>
            <div className="tw:grid tw:grid-cols-2 tw:gap-3">
              <div className="tw:col-span-2"><Input etiqueta="Rol de avalúo" id="pcRol" autoComplete="off" placeholder="1234-56" {...campo('rol')} /></div>
              <Input etiqueta="Fojas de la inscripción" id="pcFojas" autoComplete="off" pendiente={!v.fojas.trim()} {...campo('fojas')} />
              <Input etiqueta="Número" id="pcNumero" autoComplete="off" pendiente={!v.numero.trim()} {...campo('numero')} />
              <Input etiqueta="Año del registro" id="pcAnio" inputMode="numeric" autoComplete="off" placeholder="2015" {...campo('anio')} />
              <Input etiqueta="Conservador de" id="pcConservador" autoComplete="off" placeholder="Santiago" {...campo('conservador')} />
            </div>
          </Card>

          <Card titulo="Precio y forma de pago" subtitulo="Los de la carta oferta aceptada; si los cambias, se cambian también en el negocio">
            <div className="tw:flex tw:flex-col tw:gap-3">
              <div className="tw:grid tw:grid-cols-[1fr_110px] tw:gap-3">
                <Input etiqueta="Precio de la compraventa" id="pcMonto" pendiente={!v.monto} inputMode="decimal" autoComplete="off" error={v.monto ? err.monto : ''} {...campo('monto')} />
                <Select etiqueta="Moneda" id="pcMoneda" opciones={[['UF', 'UF'], ['CLP', 'Pesos'], ['USD', 'Dólares']]} {...campo('moneda')} />
              </div>
              <div className="tw:grid tw:grid-cols-2 tw:gap-3">
                <Input etiqueta="Pie (vale vista)" id="pcPie" inputMode="decimal" sufijo="%" placeholder="20" error={err.pie} {...campo('piePct')} />
                <Input etiqueta="Garantía de seriedad" id="pcSeriedad" inputMode="decimal" sufijo="UF" placeholder="50" error={err.seriedad} {...campo('seriedadUF')} />
                <Input etiqueta="Comisión de cada parte" id="pcComision" inputMode="decimal" sufijo="% + IVA" placeholder="2" error={err.comision} {...campo('comisionPct')} />
                <Select etiqueta="El saldo se paga" id="pcSaldo" opciones={[['hipotecario', 'Con crédito hipotecario'], ['contado', 'Al contado']]} {...campo('saldoForma')} />
              </div>
              <Textarea etiqueta={<>Otras modalidades de pago <span className="tw:font-normal tw:text-muted">(opcional)</span></>} id="pcPagoNota" rows={2} {...campo('pagoNota')} />
            </div>
          </Card>

          <Card titulo="Plazos y condiciones" subtitulo="Lo que dice el documento">
            <div className="tw:flex tw:flex-col tw:gap-3">
              <div className="tw:grid tw:grid-cols-2 tw:gap-3">
                <Input etiqueta="Escritura en" id="pcEscritura" inputMode="numeric" sufijo="días" placeholder="90" error={err.escritura} {...campo('escrituraDias')} />
                <Input etiqueta="Entrega del inmueble" id="pcEntrega" type="date" ayuda="Vacío: al inscribirse" {...campo('fechaEntrega')} />
              </div>
              <Input etiqueta={<>Notaría de la escritura <span className="tw:font-normal tw:text-muted">(opcional)</span></>} id="pcNotaria" autoComplete="off" placeholder="Vacío: la que designen las partes" {...campo('notaria')} />
              <Textarea etiqueta={<>Condiciones adicionales <span className="tw:font-normal tw:text-muted">(opcional)</span></>} id="pcCond" rows={3} placeholder="Estacionamiento, bodega, lo que se incluye…" {...campo('condiciones')} />
            </div>
          </Card>

          <ErrorVentana id="pcErr" texto={error || errorCarga} />
        </div>

        <Card titulo="Vista previa" subtitulo="Así queda el documento" relleno={true} className="tw:min-w-0 tw:lg:sticky tw:lg:top-0">
          <div className={guardando ? 'tw:opacity-50 tw:transition-opacity' : 'tw:transition-opacity'}>{pdf ? <PdfConFirmas pdf={pdf} firmantes={firmantesPdf} plantilla="promesa-compraventa" /> : cargandoPdf ? <PdfCargando /> : <p className={NOTA}>Todavía no hay PDF: completa los datos marcados y guarda.</p>}</div>
        </Card>
      </div>
      <p className={`${NOTA} tw:mt-3`}>Firmar en Asset es opcional: puedes descargar el PDF. Si lo envías, se cobra del saldo de Portalfirma y el comprador y el vendedor reciben el enlace en su correo{faltaCorreo.length ? ` (falta el correo de ${faltaCorreo.join(', ')})` : ''}. Cuando firmen ambos, el negocio avanza solo.</p>
    </VentanaCuerpo>
    <VentanaPie>
      {sucio ? <span className="tw:mr-auto tw:text-xs tw:text-muted">Cambios sin guardar</span> : <span className="tw:mr-auto"><Badge tono="verde" icono="check" ajustar>Todo guardado</Badge></span>}
      <Boton id="pcGuardar" variante="secundario" icono="save" cargando={guardando} disabled={(!sucio && !!pdf) || enviando} onClick={guardar}>Guardar y actualizar PDF</Boton>
      <Boton id="mOk" icono="sign" disabled={cargandoPdf || !pdf || !!bloqueo || invalido || guardando || enviando} cargando={enviando} onClick={enviar} title={bloqueo}>{enviando ? 'Enviando…' : 'Generar y enviar a firmar'}</Boton>
      <MenuMas id="pcMas" opciones={[
        { id: 'pcDescargar', texto: 'Descargar PDF', icono: 'download', disabled: !pdf || guardando, alTocar: descargar },
        { id: 'mCancel', texto: 'Cancelar', icono: 'x', disabled: enviando, alTocar: cerrarModal },
      ]} />
    </VentanaPie>
  </>;
}
