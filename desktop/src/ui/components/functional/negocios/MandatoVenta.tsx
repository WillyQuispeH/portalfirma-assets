// modal-131: el mandato de gestión de venta de una propiedad, listo para revisar y enviar a firmar. Es el gemelo del mandato de
// arriendo (modal-129, MandatoArriendo.tsx): todas las variables del documento se editan aquí mismo.
//   · izquierda: el/los propietario(s) (nombre, RUT, correo, nacionalidad, estado civil, profesión, domicilio), el inmueble (rol,
//     superficies y precio de venta) y las condiciones (comisión, publicar en portales, exclusividad y otras). «Guardar y
//     actualizar PDF» lo guarda en su origen (la ficha de la propiedad y de cada persona) y vuelve a armar el PDF.
//   · derecha: el PDF tal como se firmaría.
// Si al abrirla falta algo (p. ej. el propietario no tiene RUT), la ventana se abre igual con el aviso y se completa aquí.
// Firmar en Asset es opcional: «Descargar PDF» (menú «⋯») guarda el documento sin enviarlo.
// La lógica (guardar, generar el PDF, enviar) está en src/renderer/etapas.js (mandatoVenta) y llega en las props.
// Los id (#mvPr0Nombre…, #mvRol, #mvSupTotal, #mvSupUtil, #mvPrecio, #mvMoneda, #mvComision, #mvPublicar, #mvExclusivo, #mvOtras,
// #mvGuardar, #mvDescargar, #mCancel, #mOk) los usan las pruebas.
import { useState } from 'react';
import Boton from '../../ui/Boton';
import Badge from '../../ui/Badge';
import Card from '../../ui/Card';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import Switch from '../../ui/Switch';
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
import VisorPdf, { PdfCargando } from '../agenda/VisorPdf';
import { usePdfInicial, type IPdfInicial } from '../agenda/usePdfInicial';

export interface IMandatoVentaDatos {
  propietarios: IPersonaDoc[];
  rol: string; supTotal: string; supUtil: string; precio: string; moneda: string;
  /** % de comisión + IVA sobre el monto final (vacío: el del modelo, 2 %) */
  comision: string;
  publicar: boolean; exclusividad: boolean; otras: string;
}
export interface IMandatoVentaProps {
  pdf?: string;
  /** lo que impidió armar el PDF (falta el propietario, su RUT…): se muestra al abrir y se completa aquí mismo */
  errorInicial?: string;
  /** el PDF que se está armando (o trayendo): la ventana se abre ya y la vista previa lo muestra al llegar */
  pdfPromesa?: Promise<IPdfInicial>;
  archivo: string;
  propiedad: { codigo: string; titulo: string; direccion: string };
  datos: IMandatoVentaDatos;
  /** guarda los datos de la propiedad (los de las personas los guarda la ventana) y devuelve el PDF nuevo */
  alGuardar: (d: IMandatoVentaDatos) => Promise<{ pdf: string }>;
  alEnviar: () => Promise<void>;
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));
const num = (t: string) => Number(String(t).replace(/\./g, '').replace(',', '.'));
const pctOk = (t: string) => { const n = Number(String(t).replace(',', '.')); return n > 0 && n <= 20; };

export function MandatoVenta({ pdf: pdf0, pdfPromesa, errorInicial, archivo, propiedad, datos, alGuardar, alEnviar }: IMandatoVentaProps) {
  const [v, setV] = useState<IMandatoVentaDatos>(datos);
  const [guardado, setGuardado] = useState<IMandatoVentaDatos>(datos);
  const { pdf, setPdf, cargando: cargandoPdf, errorCarga } = usePdfInicial(pdf0, pdfPromesa);
  const [guardando, setGuardando] = useState(false); const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(errorInicial || '');
  const sucio = JSON.stringify(v) !== JSON.stringify(guardado);
  const cambiar = (k: keyof IMandatoVentaDatos) => (e: { target: { value: string } }) => { setV((x) => ({ ...x, [k]: e.target.value })); setError(''); };
  const persona = (i: number) => (p: IPersonaDoc) => { setV((x) => ({ ...x, propietarios: x.propietarios.map((q, j) => (j === i ? p : q)) })); setError(''); };

  // lo que falta para armar el documento (el correo solo hace falta para enviarlo a firmar)
  const faltaProp = v.propietarios.flatMap((p, i) => faltaDePersona(p, false).map((f) => `${f} de ${p.nombre || `propietario ${i + 1}`}`));
  const faltaFirma = v.propietarios.filter((p) => faltaDePersona(p, true).includes('correo')).map((p) => p.nombre);
  const invalido = faltaProp.length > 0 || (v.precio !== '' && !(num(v.precio) > 0)) || (v.comision !== '' && !pctOk(v.comision));

  const guardar = async () => {
    if (invalido) return setError(faltaProp.length ? `Falta: ${faltaProp.join(', ')}.` : 'Corrige los datos marcados antes de guardar.');
    setGuardando(true); setError('');
    try {
      const nuevos = v.propietarios.map((p, i) => ({ ...p, rut: formatearRut(p.rut) || p.rut, id: p.id, base: guardado.propietarios[i]?.base ?? p.base }));
      for (let i = 0; i < nuevos.length; i++) if (personaCambio(nuevos[i], guardado.propietarios[i])) await guardarPersonaDoc(nuevos[i]);   // primero las personas: el servidor arma el PDF con lo guardado en sus fichas
      const nuevo = { ...v, propietarios: nuevos };
      const r = await alGuardar(nuevo);
      setV(nuevo); setGuardado(nuevo); setPdf(r.pdf);
    } catch (e) { setError(mensaje(e)); }
    setGuardando(false);
  };
  const enviar = async () => { setEnviando(true); setError(''); try { await alEnviar(); } catch (e) { setError(mensaje(e)); setEnviando(false); } };
  const descargar = async () => { if (!pdf) return; try { if (await descargarPdf(pdf, archivo)) toast('PDF guardado.'); } catch (e) { setError(mensaje(e)); } };

  return <>
    <VentanaCabecera icono="sign" titulo="Mandato de venta" descripcion="Revisa los datos y ajústalos si hace falta: el PDF se actualiza al guardar." cerrable={!enviando} />
    <VentanaCuerpo>
      <div className="ov-doble tw:grid tw:grid-cols-1 tw:lg:grid-cols-[minmax(320px,400px)_1fr] tw:gap-4 tw:items-start">
        <div className="tw:flex tw:flex-col tw:gap-3">
          {v.propietarios.length ? v.propietarios.map((p, i) => (
            <Card key={p.id} titulo={v.propietarios.length > 1 ? `Propietario ${i + 1}` : 'Propietario'} subtitulo="Es el mandante y firma el mandato">
              <DatosPersona idp={`mvPr${i}`} valor={p} alCambiar={persona(i)} firma={false} />
            </Card>
          )) : (
            <Card titulo="Propietario" subtitulo="Falta vincularlo"><p className={NOTA}>La propiedad no tiene propietario en su ficha: vincúlalo desde la ficha de la propiedad para armar el mandato.</p></Card>
          )}

          <Card titulo="Inmueble" subtitulo={`${propiedad.codigo} · ${propiedad.direccion}`}>
            <div className="tw:grid tw:grid-cols-2 tw:gap-3">
              <Input etiqueta="Rol" id="mvRol" autoComplete="off" placeholder="1234-56" {...{ value: v.rol, onChange: cambiar('rol') }} />
              <Input etiqueta="Superficie total" id="mvSupTotal" inputMode="decimal" sufijo="m²" value={v.supTotal} onChange={cambiar('supTotal')} />
              <Input etiqueta="Superficie útil" id="mvSupUtil" inputMode="decimal" sufijo="m²" value={v.supUtil} onChange={cambiar('supUtil')} />
              <div className="tw:grid tw:grid-cols-[1fr_92px] tw:gap-2 tw:items-end">
                <Input etiqueta="Precio referencial" id="mvPrecio" inputMode="decimal" autoComplete="off" pendiente={!v.precio} error={v.precio && !(num(v.precio) > 0) ? 'Número' : ''} value={v.precio} onChange={cambiar('precio')} />
                <Select aria-label="Moneda" id="mvMoneda" opciones={[['UF', 'UF'], ['CLP', 'CLP'], ['USD', 'USD']]} value={v.moneda} onChange={cambiar('moneda')} />
              </div>
            </div>
          </Card>

          <Card titulo="Condiciones del mandato" subtitulo="Lo que dice el documento">
            <div className="tw:flex tw:flex-col tw:gap-3">
              <Input etiqueta="Comisión" id="mvComision" inputMode="decimal" sufijo="% + IVA" placeholder="2" error={v.comision && !pctOk(v.comision) ? 'Entre 0 y 20' : ''} value={v.comision} onChange={cambiar('comision')} />
              <Switch id="mvPublicar" activo={v.publicar} alCambiar={(a) => setV((x) => ({ ...x, publicar: a }))} etiqueta="Publicar en portales y redes sociales" />
              <Switch id="mvExclusivo" activo={v.exclusividad} alCambiar={(a) => setV((x) => ({ ...x, exclusividad: a }))} etiqueta="Con exclusividad" descripcion="6 meses, sin otra corredora" />
              <Textarea etiqueta={<>Otras condiciones <span className="tw:font-normal tw:text-muted">(opcional)</span></>} id="mvOtras" rows={2} value={v.otras} onChange={cambiar('otras')} />
            </div>
          </Card>

          <ErrorVentana id="mvErr" texto={error || errorCarga} />
        </div>

        <Card titulo="Vista previa" subtitulo="Así queda el documento" relleno={true} className="tw:min-w-0 tw:lg:sticky tw:lg:top-0">
          <div className={guardando ? 'tw:opacity-50 tw:transition-opacity' : 'tw:transition-opacity'}>{pdf ? <VisorPdf base64={pdf} /> : cargandoPdf ? <PdfCargando /> : <p className={NOTA}>Todavía no hay PDF: completa los datos marcados y guarda.</p>}</div>
        </Card>
      </div>
      <p className={`${NOTA} tw:mt-3`}>Firmar en Asset es opcional: puedes descargar el PDF. Si lo envías, se cobra del saldo de Portalfirma y el propietario recibe el enlace en su correo{faltaFirma.length ? ` (falta el correo de ${faltaFirma.join(', ')})` : ''}.</p>
    </VentanaCuerpo>
    <VentanaPie>
      {sucio ? <span className="tw:mr-auto tw:text-xs tw:text-muted">Cambios sin guardar</span> : <span className="tw:mr-auto"><Badge tono="verde" icono="check" ajustar>Todo guardado</Badge></span>}
      <Boton id="mvGuardar" variante="secundario" icono="save" cargando={guardando} disabled={(!sucio && !!pdf) || enviando} onClick={guardar}>Guardar y actualizar PDF</Boton>
      <Boton id="mOk" icono="sign" disabled={cargandoPdf || sucio || !pdf || invalido || faltaFirma.length > 0 || guardando || enviando} cargando={enviando} onClick={enviar}
        title={sucio ? 'Guarda los cambios antes de enviar' : faltaFirma.length ? `Falta el correo de ${faltaFirma.join(', ')}` : undefined}>{enviando ? 'Enviando…' : 'Enviar a firmar'}</Boton>
      <MenuMas id="mvMas" opciones={[
        { id: 'mvDescargar', texto: 'Descargar PDF', icono: 'download', disabled: !pdf || guardando, alTocar: descargar },
        { id: 'mCancel', texto: 'Cancelar', icono: 'x', disabled: enviando, alTocar: cerrarModal },
      ]} />
    </VentanaPie>
  </>;
}
