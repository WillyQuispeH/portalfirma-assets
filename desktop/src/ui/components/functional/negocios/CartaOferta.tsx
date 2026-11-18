// modal-125: la carta oferta de un negocio, lista para revisar y enviar a firmar (misma idea que la orden de visita, modal-3).
//   · izquierda: los datos de la carta, ordenados (oferente, oferta y propiedad). El oferente y la oferta se pueden editar;
//     «Guardar y actualizar PDF» los guarda en su origen (la persona del CRM y el negocio) y vuelve a generar el PDF. Los
//     datos de la propiedad se editan en su ficha.
//   · derecha: el PDF tal como se enviará a firmar.
// Enviar a firmar solo se puede con todo guardado: lo que se ve en el PDF es lo que firma el oferente.
// La lógica (guardar, generar el PDF, enviar) está en src/renderer/etapas.js (cartaOferta) y llega en las props.
// Los id (#coNombre, #coRut, #coTel, #coEmail, #coMonto, #coMoneda, #coGarantia, #coPlazo, #coVigencia, #coCond,
// #coGuardar, #coConProp (solo arriendo) / #coFirman (venta: firman comprador y vendedor), #mOk, #mCancel) los usan las pruebas.
import { useState } from 'react';
import Boton from '../../ui/Boton';
import Badge from '../../ui/Badge';
import Card from '../../ui/Card';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import Switch from '../../ui/Switch';
import MenuMas from '../../ui/MenuMas';
import Textarea from '../../ui/Textarea';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../ui/Ventana';
import { NOTA } from '../gestion/editor-pdf/Modales';
import { ErrorVentana } from './VentanasAntiguas';
import { cerrarModal } from '../../../utils/modal';
import { toast } from '../../../utils/app';
import { descargarPdf } from '../../../utils/pdf';
import { correoValido, formatearRut, rutValido } from '../../../utils/rut';
import DatosPersona, { faltaDePersona, guardarPersonaDoc, personaCambio, type IPersonaDoc } from './DatosPersona';
import { AvisoDominio, type ICambiosFicha, type IDominioFicha } from './AvisoDominio';
import VisorPdf, { PdfCargando } from '../agenda/VisorPdf';
import { usePdfInicial, type IPdfInicial } from '../agenda/usePdfInicial';

export interface ICartaDatos {
  nombre: string; rut: string; email: string; telefono: string; nacionalidad: string; estadoCivil: string; profesion: string; direccion: string;
  monto: string; moneda: string; garantia: string; plazo: string; vigencia: string; condiciones: string;
  /** compraventa: forma de pago y plazos (si no se escriben, rigen los del modelo de la corredora) */
  piePct: string; promesaDias: string; escrituraDias: string; seriedadUF: string; comisionPct: string;
}
export interface ICartaOfertaProps {
  pdf?: string;
  /** lo que impidió armar el PDF (falta el monto, el correo…): se muestra al abrir y se corrige aquí mismo */
  errorInicial?: string;
  /** el PDF que se está armando (o trayendo): la ventana se abre ya y la vista previa lo muestra al llegar */
  pdfPromesa?: Promise<IPdfInicial>;
  tipo: 'venta' | 'arriendo';
  datos: ICartaDatos;
  propiedad: { codigo: string; titulo: string; direccion: string };
  /** los propietarios: aceptan la carta (si firman) y salen en su comparecencia; sus datos se completan aquí mismo */
  propietarios?: IPersonaDoc[];
  /** guarda los cambios en su origen y devuelve el PDF nuevo (lanza el error si algo falla) */
  alGuardar: (d: ICartaDatos) => Promise<{ pdf: string }>;
  /** op.conPropietario: el propietario también firma (acepta la carta). En venta el vendedor siempre firma (true); en arriendo es opcional */
  alConfirmar: (op: { conPropietario: boolean }) => Promise<void>;
  /** venta: la inscripción de dominio que tiene la ficha (si falta, el documento dice «en el Conservador de Bienes Raíces respectivo» y se avisa aquí) */
  dominio?: IDominioFicha;
  /** guarda la inscripción en la ficha de la propiedad y devuelve el PDF nuevo */
  alGuardarDominio?: (c: ICambiosFicha) => Promise<{ pdf: string }>;
  /** abre «Leer desde la copia de dominio» (reemplaza esta ventana y, al terminar, la vuelve a abrir) */
  alLeerDominio?: () => void;
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function CartaOferta({ pdf: pdf0, pdfPromesa, errorInicial, tipo, datos, propiedad, propietarios: propietarios0 = [], alGuardar, alConfirmar, dominio, alGuardarDominio, alLeerDominio }: ICartaOfertaProps) {
  const [v, setV] = useState<ICartaDatos>(datos);
  const [props, setProps] = useState<IPersonaDoc[]>(propietarios0); const [propsGuardado, setPropsGuardado] = useState<IPersonaDoc[]>(propietarios0);
  const [guardado, setGuardado] = useState<ICartaDatos>(datos);
  const { pdf, setPdf, cargando: cargandoPdf, errorCarga } = usePdfInicial(pdf0, pdfPromesa);
  const [guardando, setGuardando] = useState(false); const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(errorInicial || '');
  const [conProp, setConProp] = useState(tipo === 'venta'); // el propietario acepta con su firma: en venta siempre; en arriendo, opcional
  const sucio = JSON.stringify(v) !== JSON.stringify(guardado) || props.some((p, i) => personaCambio(p, propsGuardado[i]));
  const venta = tipo === 'venta';
  const campo = (k: keyof ICartaDatos) => ({ value: v[k], onChange: (e: { target: { value: string } }) => { setV((x) => ({ ...x, [k]: e.target.value })); setError(''); } });

  const oferente: IPersonaDoc = { id: 'of', nombre: v.nombre, rut: v.rut, email: v.email, telefono: v.telefono, nacionalidad: v.nacionalidad, estadoCivil: v.estadoCivil, profesion: v.profesion, direccion: v.direccion };
  const cambiarOferente = (p: IPersonaDoc) => { setV((x) => ({ ...x, nombre: p.nombre, rut: p.rut, email: p.email, telefono: p.telefono, nacionalidad: p.nacionalidad, estadoCivil: p.estadoCivil, profesion: p.profesion, direccion: p.direccion })); setError(''); };
  const cambiarProp = (i: number) => (p: IPersonaDoc) => { setProps((x) => x.map((q, j) => (j === i ? p : q))); setError(''); };
  const faltaPropietario = conProp ? props.flatMap((p) => faltaDePersona(p, true).map((f) => `${f} de ${p.nombre || 'un propietario'}`)) : [];
  const err = {
    nombre: v.nombre.trim().length < 2 ? 'Escribe el nombre completo' : '',
    rut: !rutValido(v.rut) ? 'El RUT no es válido' : '',
    email: !correoValido(v.email) ? 'Escribe un correo válido: ahí recibe el enlace para firmar' : '',
    monto: !(Number(String(v.monto).replace(/\./g, '').replace(',', '.')) > 0) ? 'Escribe el monto ofrecido' : '',
    vigencia: v.vigencia && !/^\d{1,3}$/.test(v.vigencia) ? 'Solo días, en número' : '',
    venta: venta && [v.piePct, v.promesaDias, v.escrituraDias, v.seriedadUF, v.comisionPct].some((x) => x !== '' && !(Number(String(x).replace(',', '.')) > 0)) ? 'Las condiciones de la compraventa van en números' : '',
  };
  const invalido = Object.values(err).some(Boolean);

  const guardar = async () => {
    if (invalido) return setError('Corrige los datos marcados antes de guardar.');
    setGuardando(true); setError('');
    try {
      const nuevo = { ...v, nombre: v.nombre.trim(), rut: formatearRut(v.rut), email: v.email.trim(), telefono: v.telefono.trim(), garantia: v.garantia.trim(), plazo: v.plazo.trim(), condiciones: v.condiciones.trim() };
      for (let i = 0; i < props.length; i++) if (personaCambio(props[i], propsGuardado[i])) await guardarPersonaDoc({ ...props[i], rut: formatearRut(props[i].rut) || props[i].rut });   // primero las personas: el servidor arma el PDF con lo guardado en sus fichas
      const r = await alGuardar(nuevo);
      setPropsGuardado(props);
      setV(nuevo); setGuardado(nuevo); setPdf(r.pdf);
    } catch (e) { setError(mensaje(e)); }
    setGuardando(false);
  };
  const descargar = async () => { if (!pdf) return; try { const ruta = await descargarPdf(pdf, `Carta oferta ${propiedad.codigo}.pdf`); if (ruta) toast('PDF guardado.'); } catch (e) { setError(mensaje(e)); } };
  const enviar = async () => { setEnviando(true); setError(''); try { await alConfirmar({ conPropietario: conProp }); } catch (e) { setError(mensaje(e)); setEnviando(false); } };

  return <>
    <VentanaCabecera icono="sign" titulo="Carta oferta" descripcion="Revisa los datos y ajústalos si hace falta: el PDF se actualiza al guardar." cerrable={!enviando} />
    <VentanaCuerpo>
      <div className="ov-doble tw:grid tw:grid-cols-1 tw:lg:grid-cols-[minmax(300px,380px)_1fr] tw:gap-4 tw:items-start">
        <div className="tw:flex tw:flex-col tw:gap-3">
          <Card titulo={venta ? 'Comprador' : 'Arrendatario'} subtitulo="Hace la oferta y firma la carta">
            <DatosPersona idp="co" valor={oferente} alCambiar={cambiarOferente} />
          </Card>

          <Card titulo="Oferta" subtitulo={venta ? 'Lo que se ofrece por la propiedad' : 'Lo que se ofrece por el arriendo'}>
            <div className="tw:flex tw:flex-col tw:gap-3">
              <div className="tw:grid tw:grid-cols-[1fr_110px] tw:gap-3">
                <Input etiqueta="Monto ofrecido" id="coMonto" pendiente={!v.monto} inputMode="decimal" autoComplete="off" error={v.monto ? err.monto : ''} {...campo('monto')} />
                <Select etiqueta="Moneda" id="coMoneda" opciones={[['UF', 'UF'], ['CLP', 'Pesos'], ['USD', 'Dólares']]} {...campo('moneda')} />
              </div>
              <div className="tw:grid tw:grid-cols-2 tw:gap-3">
                <Input etiqueta={venta ? 'Reserva' : 'Garantía'} id="coGarantia" placeholder={venta ? 'Ej.: UF 100' : 'Ej.: 1 mes de renta'} autoComplete="off" {...campo('garantia')} />
                <Input etiqueta="Plazo" id="coPlazo" placeholder={venta ? 'Ej.: escriturar en 60 días' : 'Ej.: 12 meses'} autoComplete="off" {...campo('plazo')} />
              </div>
              <Input etiqueta="Vigencia de la oferta" id="coVigencia" inputMode="numeric" sufijo="días" placeholder="5" error={err.vigencia} {...campo('vigencia')} />
              <Textarea etiqueta={<>Condiciones <span className="tw:font-normal tw:text-muted">(opcional)</span></>} id="coCond" rows={3} placeholder="Algo que el oferente pide o acepta" {...campo('condiciones')} />
            </div>
          </Card>

          {venta && (
            <Card titulo="Condiciones de la compraventa" subtitulo="Forma de pago y plazos (si no los cambias, rigen los del modelo)">
              <div className="tw:grid tw:grid-cols-2 tw:gap-3">
                <Input etiqueta="Pie (vale vista)" id="coPie" inputMode="decimal" sufijo="%" placeholder="20" {...campo('piePct')} />
                <Input etiqueta="Comisión de cada parte" id="coComision" inputMode="decimal" sufijo="% + IVA" placeholder="2" {...campo('comisionPct')} />
                <Input etiqueta="Promesa en" id="coPromesa" inputMode="numeric" sufijo="días háb." placeholder="7" {...campo('promesaDias')} />
                <Input etiqueta="Escritura en" id="coEscritura" inputMode="numeric" sufijo="días" placeholder="90" {...campo('escrituraDias')} />
                <Input etiqueta="Garantía de seriedad" id="coSeriedad" inputMode="decimal" sufijo="UF" placeholder="50" {...campo('seriedadUF')} />
              </div>
              {err.venta && <p className="tw:m-0 tw:mt-2 tw:text-[13px] tw:text-red-softink">{err.venta}</p>}
            </Card>
          )}

          {props.length > 0 && props.map((pr, i) => (
            <Card key={pr.id} titulo={props.length > 1 ? `${venta ? 'Vendedor' : 'Arrendador'} ${i + 1}` : venta ? 'Vendedor (propietario)' : 'Arrendador (propietario)'} subtitulo={conProp ? 'Acepta la carta y la firma' : 'Sale en el documento; no firma'}>
              <DatosPersona idp={`coPr${i}`} valor={pr} alCambiar={cambiarProp(i)} firma={conProp} />
            </Card>
          ))}

          <Card titulo="Propiedad" subtitulo="Se edita en su ficha">
            <div className="tw:flex tw:items-start tw:gap-2.5">
              <Badge tono="lavanda">{propiedad.codigo}</Badge>
              <span className="tw:min-w-0 tw:flex-1 tw:text-[13px]"><b className="tw:block tw:font-semibold tw:truncate">{propiedad.titulo}</b><span className="tw:text-muted">{propiedad.direccion}</span></span>
            </div>
          </Card>

          {venta && dominio && alGuardarDominio && (
            <AvisoDominio dominio={dominio}
              alGuardar={async (c) => { const r = await alGuardarDominio(c); setPdf(r.pdf); }}
              alLeer={alLeerDominio} motivoLeer={sucio ? 'Guarda los cambios antes: esta ventana se vuelve a abrir' : guardando || enviando ? 'Espera un momento' : undefined} />
          )}

          {venta
            ? <p id="coFirman" className={NOTA}>Firman el comprador y el vendedor.</p>
            : <Switch id="coConProp" activo={conProp} alCambiar={setConProp} etiqueta="También firma el propietario" descripcion="Acepta con su firma, en el mismo documento" />}

          <ErrorVentana id="coErr" texto={error || errorCarga} />
        </div>

        <Card titulo="Vista previa" subtitulo="Así se envía a firmar" relleno={true} className="tw:min-w-0 tw:lg:sticky tw:lg:top-0">
          <div className={guardando ? 'tw:opacity-50 tw:transition-opacity' : 'tw:transition-opacity'}>{pdf ? <VisorPdf base64={pdf} /> : cargandoPdf ? <PdfCargando /> : <p className={NOTA}>No se pudo preparar el PDF.</p>}</div>
        </Card>
      </div>
      <p className={`${NOTA} tw:mt-3`}>Firmar en Asset es opcional: puedes descargar el PDF. Si lo envías, se cobra del saldo de Portalfirma y {venta ? 'el comprador y el vendedor reciben' : conProp ? 'cada firmante recibe' : 'el arrendatario recibe'} el enlace en su correo; el tipo de firma lo define la plantilla (Configuración › Plantillas). Cuando se firme, el negocio avanza solo.</p>
    </VentanaCuerpo>
    <VentanaPie>
      {sucio ? <span className="tw:mr-auto tw:text-xs tw:text-muted">Cambios sin guardar</span> : <span className="tw:mr-auto"><Badge tono="verde" icono="check" ajustar>Todo guardado</Badge></span>}
      <Boton id="coGuardar" variante="secundario" icono="save" cargando={guardando} disabled={!sucio || enviando} onClick={guardar}>Guardar y actualizar PDF</Boton>
      <Boton id="mOk" icono="sign" disabled={cargandoPdf || sucio || invalido || faltaPropietario.length > 0 || guardando || enviando} cargando={enviando} onClick={enviar} title={sucio ? 'Guarda los cambios antes de enviar' : faltaPropietario.length ? `Falta: ${faltaPropietario.join(', ')}` : undefined}>{enviando ? 'Enviando…' : 'Generar y enviar a firmar'}</Boton>
      <MenuMas id="coMas" opciones={[
        { id: 'coDescargar', texto: 'Descargar PDF', icono: 'download', disabled: !pdf || guardando, alTocar: descargar },
        { id: 'mCancel', texto: 'Cancelar', icono: 'x', disabled: enviando, alTocar: cerrarModal },
      ]} />
    </VentanaPie>
  </>;
}
