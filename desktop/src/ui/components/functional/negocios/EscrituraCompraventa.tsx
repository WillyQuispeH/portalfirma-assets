// modal-148: el borrador de escritura de compraventa de un negocio de venta, listo para revisar, descargar o enviar a firmar.
// Es un BORRADOR (minuta) para llevar a la notaría: la escritura pública la otorga siempre una notaría. Misma idea que la carta
// oferta (modal-125) y el mandato de venta (modal-131): todas las variables del documento se editan aquí mismo.
//   · izquierda: el comprador y el/los vendedor(es) (nombre, RUT, correo, estado civil, profesión, domicilio), la escritura (notaría,
//     fecha, entrega), el precio y la forma de pago (con crédito hipotecario o al contado), la inscripción de dominio y los deslindes,
//     y, si alguien comparece representado, su personería. «Guardar y actualizar PDF» lo guarda en su origen (la ficha de cada persona
//     y el negocio) y vuelve a armar el PDF.
//   · derecha: el PDF tal como se vería.
// Si al abrirla falta algo (p. ej. un RUT), la ventana se abre igual con el aviso y se completa aquí. Firmar en Asset es opcional:
// «Descargar PDF» (menú «⋯») guarda el borrador sin enviarlo; si se envía, firman comprador y vendedores (solo deja constancia de que
// conocen el borrador) y el paso «Escritura firmada» avanza solo cuando todos firman.
// La lógica (guardar, generar el PDF, enviar) está en src/renderer/etapas.js (escrituraCompraventa) y llega en las props.
// Los id (#esCoNombre…, #esVe0Nombre…, #esNotaria, #esCiudad, #esFecha, #esEntrega, #esMonto, #esMoneda, #esModo, #esPie, #esBanco,
// #esPromesaFecha, #esPromesaNotaria, #esFojas, #esNumero, #esAnio, #esConservador, #esDeslindes, #esIncluye, #esRepVendedor,
// #esRepComprador, #esPersoneria, #esGuardar, #esDescargar, #mCancel, #mOk) los usan las pruebas.
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

export interface IEscrituraDatos {
  comprador: IPersonaDoc;
  vendedores: IPersonaDoc[];
  /** el precio de la compraventa (el del negocio) */
  monto: string; moneda: string;
  /** 'credito': pie y crédito hipotecario · 'contado' */
  modoPago: string;
  /** % del precio que se paga de pie (con crédito; vacío: el del modelo, 20 %) */
  piePct: string;
  banco: string;
  notaria: string; ciudad: string;
  /** fechas AAAA-MM-DD */
  fecha: string; entregaFecha: string;
  promesaFecha: string; promesaNotaria: string;
  fojas: string; numeroInscripcion: string; anioInscripcion: string; conservador: string;
  deslindes: string; incluye: string;
  repVendedor: string; repComprador: string; personerias: string;
}
export interface IEscrituraCompraventaProps {
  pdf?: string;
  /** lo que impidió armar el PDF (falta el comprador, un RUT…): se muestra al abrir y se completa aquí mismo */
  errorInicial?: string;
  /** el PDF que se está armando (o trayendo): la ventana se abre ya y la vista previa lo muestra al llegar */
  pdfPromesa?: Promise<IPdfInicial>;
  archivo: string;
  propiedad: { codigo: string; titulo: string; direccion: string; rol: string };
  datos: IEscrituraDatos;
  /** guarda los datos del negocio (las personas las guarda la ventana) y devuelve el PDF nuevo */
  alGuardar: (d: IEscrituraDatos) => Promise<{ pdf: string }>;
  alEnviar: () => Promise<void>;
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));
const num = (t: string) => Number(String(t).replace(/\./g, '').replace(',', '.'));

export function EscrituraCompraventa({ pdf: pdf0, pdfPromesa, errorInicial, archivo, propiedad, datos, alGuardar, alEnviar }: IEscrituraCompraventaProps) {
  const [v, setV] = useState<IEscrituraDatos>(datos);
  const [guardado, setGuardado] = useState<IEscrituraDatos>(datos);
  const { pdf, setPdf, cargando: cargandoPdf, errorCarga, firmantes: firmantesPdf } = usePdfInicial(pdf0, pdfPromesa);
  const [guardando, setGuardando] = useState(false); const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(errorInicial || '');
  const sucio = JSON.stringify(v) !== JSON.stringify(guardado);
  const credito = v.modoPago !== 'contado';
  const campo = (k: Exclude<keyof IEscrituraDatos, 'comprador' | 'vendedores'>) => ({ value: v[k], onChange: (e: { target: { value: string } }) => { setV((x) => ({ ...x, [k]: e.target.value })); setError(''); } });
  const comprador = (p: IPersonaDoc) => { setV((x) => ({ ...x, comprador: p })); setError(''); };
  const vendedor = (i: number) => (p: IPersonaDoc) => { setV((x) => ({ ...x, vendedores: x.vendedores.map((q, j) => (j === i ? p : q)) })); setError(''); };

  // lo que falta para armar el documento (el correo solo hace falta para enviarlo a firmar)
  const personas = [...v.vendedores.map((p, i) => ({ p, rol: v.vendedores.length > 1 ? `vendedor ${i + 1}` : 'vendedor' })), { p: v.comprador, rol: 'comprador' }];
  const faltaPers = personas.flatMap(({ p, rol }) => faltaDePersona(p, false).map((f) => `${f} de ${p.nombre || rol}`));
  const faltaFirma = personas.filter(({ p }) => faltaDePersona(p, true).includes('correo')).map(({ p }) => p.nombre || 'una persona');
  const faltaDominio = !(v.fojas.trim() && v.numeroInscripcion.trim() && v.anioInscripcion.trim());
  const faltaBanco = credito && !v.banco.trim();
  const porCompletar = [!v.notaria.trim() && 'la notaría', !v.fecha && 'la fecha de la escritura', faltaDominio && 'la inscripción de dominio', !v.conservador.trim() && 'el Conservador', faltaBanco && 'el banco del crédito', !propiedad.rol && 'el rol de avalúo (en la ficha de la propiedad)'].filter(Boolean) as string[];
  const err = {
    monto: !(num(v.monto) > 0) ? 'Escribe el precio de la compraventa' : '',
    pie: credito && v.piePct !== '' && !(num(v.piePct) > 0 && num(v.piePct) < 100) ? 'Entre 0 y 100' : '',
  };
  const invalido = faltaPers.length > 0 || Object.values(err).some(Boolean);
  const sinEnviar = faltaFirma.length ? `Falta el correo de ${faltaFirma.join(', ')}` : faltaDominio ? 'Completa la inscripción de dominio (fojas, número y año)' : faltaBanco ? 'Escribe el banco del crédito hipotecario' : '';

  const guardar = async () => {
    if (invalido) return setError(faltaPers.length ? `Falta: ${faltaPers.join(', ')}.` : 'Corrige los datos marcados antes de guardar.');
    setGuardando(true); setError('');
    try {
      const fijar = (p: IPersonaDoc, antes?: IPersonaDoc) => ({ ...p, rut: formatearRut(p.rut) || p.rut, id: p.id, base: antes?.base ?? p.base });
      const comp = fijar(v.comprador, guardado.comprador); const vends = v.vendedores.map((p, i) => fijar(p, guardado.vendedores[i]));
      // primero las personas: el servidor arma el PDF con lo guardado en sus fichas
      if (personaCambio(comp, guardado.comprador)) await guardarPersonaDoc(comp);
      for (let i = 0; i < vends.length; i++) if (personaCambio(vends[i], guardado.vendedores[i])) await guardarPersonaDoc(vends[i]);
      const t = (x: string) => x.trim();
      const nuevo: IEscrituraDatos = { ...v, comprador: comp, vendedores: vends, notaria: t(v.notaria), ciudad: t(v.ciudad), banco: t(v.banco), promesaNotaria: t(v.promesaNotaria), fojas: t(v.fojas), numeroInscripcion: t(v.numeroInscripcion), anioInscripcion: t(v.anioInscripcion), conservador: t(v.conservador),
        deslindes: t(v.deslindes), incluye: t(v.incluye), repVendedor: t(v.repVendedor), repComprador: t(v.repComprador), personerias: t(v.personerias) };
      const r = await alGuardar(nuevo);
      setV(nuevo); setGuardado(nuevo); setPdf(r.pdf);
    } catch (e) { setError(mensaje(e)); }
    setGuardando(false);
  };
  const enviar = async () => { setEnviando(true); setError(''); try { await alEnviar(); } catch (e) { setError(mensaje(e)); setEnviando(false); } };
  const descargar = async () => { if (!pdf) return; try { if (await descargarPdf(pdf, archivo)) toast('PDF guardado.'); } catch (e) { setError(mensaje(e)); } };

  return <>
    <VentanaCabecera icono="sign" titulo="Borrador de escritura de compraventa" descripcion="Minuta para llevar a la notaría: la escritura pública la otorga la notaría. Revisa los datos: el PDF se actualiza al guardar." cerrable={!enviando} />
    <VentanaCuerpo>
      <div className="ov-doble tw:grid tw:grid-cols-1 tw:lg:grid-cols-[minmax(320px,400px)_1fr] tw:gap-4 tw:items-start">
        <div className="tw:flex tw:flex-col tw:gap-3">
          <Card titulo="Comprador" subtitulo="Compra y firma el borrador (si se envía a firmar)">
            <DatosPersona idp="esCo" valor={v.comprador} alCambiar={comprador} firma={false} />
          </Card>

          {v.vendedores.length ? v.vendedores.map((p, i) => (
            <Card key={p.id} titulo={v.vendedores.length > 1 ? `Vendedor ${i + 1}` : 'Vendedor (propietario)'} subtitulo="Vende y firma el borrador (si se envía a firmar)">
              <DatosPersona idp={`esVe${i}`} valor={p} alCambiar={vendedor(i)} firma={false} />
            </Card>
          )) : (
            <Card titulo="Vendedor" subtitulo="Falta vincularlo"><p className={NOTA}>La propiedad no tiene propietario en su ficha: vincúlalo desde la ficha de la propiedad para armar el borrador.</p></Card>
          )}

          <Card titulo="Escritura" subtitulo="Dónde y cuándo se firma en la notaría">
            <div className="tw:flex tw:flex-col tw:gap-3">
              <Input etiqueta="Notaría" id="esNotaria" autoComplete="off" placeholder="Ej.: 45ª Notaría de Santiago, de don Pedro Pérez" pendiente={!v.notaria.trim()} {...campo('notaria')} />
              <div className="tw:grid tw:grid-cols-2 tw:gap-3">
                <Input etiqueta="Fecha de la escritura" id="esFecha" type="date" pendiente={!v.fecha} {...campo('fecha')} />
                <Input etiqueta="Entrega material" id="esEntrega" type="date" ayuda="Vacío: en el acto" {...campo('entregaFecha')} />
              </div>
              <Input etiqueta="Ciudad de la notaría" id="esCiudad" autoComplete="off" placeholder="Por defecto, la comuna del inmueble" {...campo('ciudad')} />
            </div>
          </Card>

          <Card titulo="Precio y forma de pago" subtitulo="Lo acordado en la oferta y la promesa">
            <div className="tw:flex tw:flex-col tw:gap-3">
              <div className="tw:grid tw:grid-cols-[1fr_110px] tw:gap-3">
                <Input etiqueta="Precio" id="esMonto" inputMode="decimal" autoComplete="off" pendiente={!v.monto} error={v.monto ? err.monto : ''} {...campo('monto')} />
                <Select etiqueta="Moneda" id="esMoneda" opciones={[['UF', 'UF'], ['CLP', 'Pesos'], ['USD', 'Dólares']]} {...campo('moneda')} />
              </div>
              <Select etiqueta="Forma de pago" id="esModo" opciones={[['credito', 'Pie y crédito hipotecario'], ['contado', 'Al contado']]} {...campo('modoPago')} />
              {credito && (
                <div className="tw:grid tw:grid-cols-[110px_1fr] tw:gap-3">
                  <Input etiqueta="Pie" id="esPie" inputMode="decimal" sufijo="%" placeholder="20" error={err.pie} {...campo('piePct')} />
                  <Input etiqueta="Banco del crédito" id="esBanco" autoComplete="off" placeholder="Ej.: Banco de Chile" pendiente={!v.banco.trim()} {...campo('banco')} />
                </div>
              )}
              <div className="tw:grid tw:grid-cols-2 tw:gap-3">
                <Input etiqueta="Promesa del" id="esPromesaFecha" type="date" ayuda="Si hubo promesa" {...campo('promesaFecha')} />
                <Input etiqueta="Notaría de la promesa" id="esPromesaNotaria" autoComplete="off" {...campo('promesaNotaria')} />
              </div>
            </div>
          </Card>

          <Card titulo="Inmueble" subtitulo={`${propiedad.codigo} · ${propiedad.direccion}`}>
            <div className="tw:flex tw:flex-col tw:gap-3">
              <div className="tw:grid tw:grid-cols-3 tw:gap-3">
                <Input etiqueta="Fojas" id="esFojas" autoComplete="off" pendiente={!v.fojas.trim()} {...campo('fojas')} />
                <Input etiqueta="Número" id="esNumero" autoComplete="off" pendiente={!v.numeroInscripcion.trim()} {...campo('numeroInscripcion')} />
                <Input etiqueta="Año" id="esAnio" inputMode="numeric" autoComplete="off" pendiente={!v.anioInscripcion.trim()} {...campo('anioInscripcion')} />
              </div>
              <Input etiqueta="Conservador de Bienes Raíces de" id="esConservador" autoComplete="off" placeholder="Santiago" pendiente={!v.conservador.trim()} {...campo('conservador')} />
              <Input etiqueta={<>Incluye <span className="tw:font-normal tw:text-muted">(opcional)</span></>} id="esIncluye" autoComplete="off" placeholder="Por defecto, los estacionamientos y bodegas de la ficha" {...campo('incluye')} />
              <Textarea etiqueta={<>Deslindes <span className="tw:font-normal tw:text-muted">(opcional)</span></>} id="esDeslindes" rows={2} placeholder="Norte, con…; Sur, con…" {...campo('deslindes')} />
              <p className={NOTA}>El rol de avalúo{propiedad.rol ? ` (${propiedad.rol})` : ''} y las superficies se editan en la ficha de la propiedad.</p>
            </div>
          </Card>

          <Card titulo="Representación y personería" subtitulo="Solo si alguien comparece representado">
            <div className="tw:flex tw:flex-col tw:gap-3">
              <Input etiqueta="Vendedor representado por" id="esRepVendedor" autoComplete="off" placeholder="representado por don…, cédula de identidad número…" {...campo('repVendedor')} />
              <Input etiqueta="Comprador representado por" id="esRepComprador" autoComplete="off" placeholder="representado por don…, cédula de identidad número…" {...campo('repComprador')} />
              <Textarea etiqueta="Personería o poderes" id="esPersoneria" rows={3} placeholder="Escritura de mandato, fecha y notaría. Si está vacío, no sale la cláusula." {...campo('personerias')} />
            </div>
          </Card>

          <ErrorVentana id="esErr" texto={error || errorCarga} />
        </div>

        <Card titulo="Vista previa" subtitulo="Así queda el borrador" relleno={true} className="tw:min-w-0 tw:lg:sticky tw:lg:top-0">
          <div className={guardando ? 'tw:opacity-50 tw:transition-opacity' : 'tw:transition-opacity'}>{pdf ? <PdfConFirmas pdf={pdf} firmantes={firmantesPdf} plantilla="escritura-compraventa" /> : cargandoPdf ? <PdfCargando /> : <p className={NOTA}>Todavía no hay PDF: completa los datos marcados y guarda.</p>}</div>
        </Card>
      </div>
      <p className={`${NOTA} tw:mt-3`}>{porCompletar.length ? `Por completar: ${porCompletar.join(', ')}. ` : ''}Es un borrador para revisión legal y de la notaría. Firmar en Asset es opcional: puedes descargar el PDF. Si lo envías, se cobra del saldo de Portalfirma, cada firmante recibe el enlace en su correo{faltaFirma.length ? ` (falta el de ${faltaFirma.join(', ')})` : ''} y, cuando todos firmen, el paso «Escritura firmada» avanza solo.</p>
    </VentanaCuerpo>
    <VentanaPie>
      {sucio ? <span className="tw:mr-auto tw:text-xs tw:text-muted">Cambios sin guardar</span> : <span className="tw:mr-auto"><Badge tono="verde" icono="check" ajustar>Todo guardado</Badge></span>}
      <Boton id="esGuardar" variante="secundario" icono="save" cargando={guardando} disabled={(!sucio && !!pdf) || enviando} onClick={guardar}>Guardar y actualizar PDF</Boton>
      <Boton id="mOk" icono="sign" disabled={cargandoPdf || sucio || !pdf || invalido || !!sinEnviar || guardando || enviando || !v.vendedores.length} cargando={enviando} onClick={enviar}
        title={sucio ? 'Guarda los cambios antes de enviar' : sinEnviar || undefined}>{enviando ? 'Enviando…' : 'Generar y enviar a firmar'}</Boton>
      <MenuMas id="esMas" opciones={[
        { id: 'esDescargar', texto: 'Descargar PDF', icono: 'download', disabled: !pdf || guardando, alTocar: descargar },
        { id: 'mCancel', texto: 'Cancelar', icono: 'x', disabled: enviando, alTocar: cerrarModal },
      ]} />
    </VentanaPie>
  </>;
}
