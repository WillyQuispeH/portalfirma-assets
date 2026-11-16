// modal-125: la carta oferta de un negocio, lista para revisar y enviar a firmar (misma idea que la orden de visita, modal-3).
//   · izquierda: los datos de la carta, ordenados (oferente, oferta y propiedad). El oferente y la oferta se pueden editar;
//     «Guardar y actualizar PDF» los guarda en su origen (la persona del CRM y el negocio) y vuelve a generar el PDF. Los
//     datos de la propiedad se editan en su ficha.
//   · derecha: el PDF tal como se enviará a firmar.
// Enviar a firmar solo se puede con todo guardado: lo que se ve en el PDF es lo que firma el oferente.
// La lógica (guardar, generar el PDF, enviar) está en src/renderer/etapas.js (cartaOferta) y llega en las props.
// Los id (#coNombre, #coRut, #coTel, #coEmail, #coMonto, #coMoneda, #coGarantia, #coPlazo, #coVigencia, #coCond,
// #coGuardar, #mOk, #mCancel) los usan las pruebas.
import { useState } from 'react';
import Boton from '../../ui/Boton';
import Badge from '../../ui/Badge';
import Card from '../../ui/Card';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import Textarea from '../../ui/Textarea';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../ui/Ventana';
import { NOTA } from '../gestion/editor-pdf/Modales';
import { ErrorVentana } from './VentanasAntiguas';
import { cerrarModal } from '../../../utils/modal';
import { correoValido, formatearRut, rutValido } from '../../../utils/rut';
import VisorPdf from '../agenda/VisorPdf';

export interface ICartaDatos { nombre: string; rut: string; email: string; telefono: string; monto: string; moneda: string; garantia: string; plazo: string; vigencia: string; condiciones: string }
export interface ICartaOfertaProps {
  pdf?: string;
  /** lo que impidió armar el PDF (falta el monto, el correo…): se muestra al abrir y se corrige aquí mismo */
  errorInicial?: string;
  tipo: 'venta' | 'arriendo';
  datos: ICartaDatos;
  propiedad: { codigo: string; titulo: string; direccion: string };
  /** guarda los cambios en su origen y devuelve el PDF nuevo (lanza el error si algo falla) */
  alGuardar: (d: ICartaDatos) => Promise<{ pdf: string }>;
  alConfirmar: () => Promise<void>;
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function CartaOferta({ pdf: pdf0, errorInicial, tipo, datos, propiedad, alGuardar, alConfirmar }: ICartaOfertaProps) {
  const [v, setV] = useState<ICartaDatos>(datos);
  const [guardado, setGuardado] = useState<ICartaDatos>(datos);
  const [pdf, setPdf] = useState(pdf0 || '');
  const [guardando, setGuardando] = useState(false); const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(errorInicial || '');
  const sucio = JSON.stringify(v) !== JSON.stringify(guardado);
  const venta = tipo === 'venta';
  const campo = (k: keyof ICartaDatos) => ({ value: v[k], onChange: (e: { target: { value: string } }) => { setV((x) => ({ ...x, [k]: e.target.value })); setError(''); } });

  const err = {
    nombre: v.nombre.trim().length < 2 ? 'Escribe el nombre completo' : '',
    rut: !rutValido(v.rut) ? 'El RUT no es válido' : '',
    email: !correoValido(v.email) ? 'Escribe un correo válido: ahí recibe el enlace para firmar' : '',
    monto: !(Number(String(v.monto).replace(/\./g, '').replace(',', '.')) > 0) ? 'Escribe el monto ofrecido' : '',
    vigencia: v.vigencia && !/^\d{1,3}$/.test(v.vigencia) ? 'Solo días, en número' : '',
  };
  const invalido = Object.values(err).some(Boolean);

  const guardar = async () => {
    if (invalido) return setError('Corrige los datos marcados antes de guardar.');
    setGuardando(true); setError('');
    try {
      const nuevo = { ...v, nombre: v.nombre.trim(), rut: formatearRut(v.rut), email: v.email.trim(), telefono: v.telefono.trim(), garantia: v.garantia.trim(), plazo: v.plazo.trim(), condiciones: v.condiciones.trim() };
      const r = await alGuardar(nuevo);
      setV(nuevo); setGuardado(nuevo); setPdf(r.pdf);
    } catch (e) { setError(mensaje(e)); }
    setGuardando(false);
  };
  const enviar = async () => { setEnviando(true); setError(''); try { await alConfirmar(); } catch (e) { setError(mensaje(e)); setEnviando(false); } };

  return <>
    <VentanaCabecera icono="sign" titulo="Carta oferta" descripcion="Revisa los datos y ajústalos si hace falta: el PDF se actualiza al guardar." cerrable={!enviando} />
    <VentanaCuerpo>
      <div className="ov-doble tw:grid tw:grid-cols-1 tw:lg:grid-cols-[minmax(300px,380px)_1fr] tw:gap-4 tw:items-start">
        <div className="tw:flex tw:flex-col tw:gap-3">
          <Card titulo={venta ? 'Comprador' : 'Arrendatario'} subtitulo="Hace la oferta y firma la carta">
            <div className="tw:flex tw:flex-col tw:gap-3">
              <Input etiqueta="Nombre completo" id="coNombre" autoComplete="off" error={v.nombre ? err.nombre : ''} {...campo('nombre')} />
              <div className="tw:grid tw:grid-cols-2 tw:gap-3">
                <Input etiqueta="RUT" id="coRut" autoComplete="off" error={v.rut ? err.rut : ''} {...campo('rut')} onBlur={() => v.rut && rutValido(v.rut) && setV((x) => ({ ...x, rut: formatearRut(x.rut) }))} />
                <Input etiqueta="Teléfono" id="coTel" type="tel" autoComplete="off" placeholder="+56 9…" {...campo('telefono')} />
              </div>
              <Input etiqueta="Correo" id="coEmail" type="email" autoComplete="off" error={v.email ? err.email : ''} {...campo('email')} />
            </div>
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

          <Card titulo="Propiedad" subtitulo="Se edita en su ficha">
            <div className="tw:flex tw:items-start tw:gap-2.5">
              <Badge tono="lavanda">{propiedad.codigo}</Badge>
              <span className="tw:min-w-0 tw:flex-1 tw:text-[13px]"><b className="tw:block tw:font-semibold tw:truncate">{propiedad.titulo}</b><span className="tw:text-muted">{propiedad.direccion}</span></span>
            </div>
          </Card>

          <ErrorVentana id="coErr" texto={error} />
        </div>

        <Card titulo="Vista previa" subtitulo="Así se envía a firmar" relleno={true} className="tw:min-w-0 tw:lg:sticky tw:lg:top-0">
          <div className={guardando ? 'tw:opacity-50 tw:transition-opacity' : 'tw:transition-opacity'}>{pdf ? <VisorPdf base64={pdf} /> : <p className={NOTA}>No se pudo preparar el PDF.</p>}</div>
        </Card>
      </div>
      <p className={`${NOTA} tw:mt-3`}>Se cobra del saldo de Portalfirma y el {venta ? 'comprador' : 'arrendatario'} recibe el enlace para firmar en su correo. Cuando firme, el negocio avanza solo.</p>
    </VentanaCuerpo>
    <VentanaPie>
      {sucio ? <span className="tw:mr-auto tw:text-xs tw:text-muted">Cambios sin guardar</span> : <span className="tw:mr-auto"><Badge tono="verde" icono="check" ajustar>Todo guardado</Badge></span>}
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal} disabled={enviando}>Cancelar</Boton>
      <Boton id="coGuardar" variante="secundario" icono="save" cargando={guardando} disabled={!sucio || enviando} onClick={guardar}>Guardar y actualizar PDF</Boton>
      <Boton id="mOk" icono="sign" disabled={sucio || invalido || guardando || enviando} cargando={enviando} onClick={enviar} title={sucio ? 'Guarda los cambios antes de enviar' : undefined}>{enviando ? 'Enviando…' : 'Generar y enviar a firmar'}</Boton>
    </VentanaPie>
  </>;
}
