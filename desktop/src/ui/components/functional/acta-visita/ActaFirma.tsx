// modal-126: el acta de visita lista para revisar y enviar a firmar al visitante (misma idea que la orden de visita, modal-3, y la
// carta oferta, modal-125).
//   · izquierda: lo que lleva el acta, ordenado (visitante, observaciones e interés, y la propiedad con el número de la orden).
//     El visitante y las observaciones se pueden editar; «Guardar y actualizar PDF» los guarda en su origen (la persona del CRM y
//     el acta) y vuelve a generar el PDF.
//   · derecha: el PDF tal como se enviará a firmar.
// Enviar a firmar solo se puede con todo guardado: lo que se ve en el PDF es lo que firma el visitante. La lógica está en
// ActaVisita.tsx (abrirFirma) y llega en las props. Los id (#afNombre, #afRut, #afTel, #afEmail, #afInteres, #afObs, #afGuardar,
// #mOk, #mCancel) los usan las pruebas.
import { useState } from 'react';
import Boton from '../../ui/Boton';
import Badge from '../../ui/Badge';
import Card from '../../ui/Card';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import Textarea from '../../ui/Textarea';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../ui/Ventana';
import { NOTA } from '../gestion/editor-pdf/Modales';
import { ErrorVentana } from '../negocios/VentanasAntiguas';
import { cerrarModal } from '../../../utils/modal';
import { correoValido, formatearRut, rutValido } from '../../../utils/rut';
import VisorPdf from '../agenda/VisorPdf';

export interface IActaFirmaDatos { nombre: string; rut: string; email: string; telefono: string; interes: string; observaciones: string }
export interface IActaFirmaProps {
  pdf?: string;
  /** lo que impidió armar el PDF (falta el RUT o el correo): se muestra al abrir y se corrige aquí mismo */
  errorInicial?: string;
  /** «Orden de visita nº 12» o «Sin orden de visita registrada» */
  orden: string;
  datos: IActaFirmaDatos;
  propiedad: { codigo: string; titulo: string; direccion: string };
  /** guarda los cambios en su origen y devuelve el PDF nuevo (lanza el error si algo falla) */
  alGuardar: (d: IActaFirmaDatos) => Promise<{ pdf: string }>;
  alConfirmar: () => Promise<void>;
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function ActaFirma({ pdf: pdf0, errorInicial, orden, datos, propiedad, alGuardar, alConfirmar }: IActaFirmaProps) {
  const [v, setV] = useState<IActaFirmaDatos>(datos);
  const [guardado, setGuardado] = useState<IActaFirmaDatos>(datos);
  const [pdf, setPdf] = useState(pdf0 || '');
  const [guardando, setGuardando] = useState(false); const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(errorInicial || '');
  // si el PDF no se pudo armar todavía (faltan datos), hay que guardar para generarlo
  const sucio = JSON.stringify(v) !== JSON.stringify(guardado) || !pdf;
  const campo = (k: keyof IActaFirmaDatos) => ({ value: v[k], onChange: (e: { target: { value: string } }) => { setV((x) => ({ ...x, [k]: e.target.value })); setError(''); } });

  const err = {
    nombre: v.nombre.trim().length < 2 ? 'Escribe el nombre completo' : '',
    rut: !rutValido(v.rut) ? 'El RUT no es válido' : '',
    email: !correoValido(v.email) ? 'Escribe un correo válido: ahí recibe el enlace para firmar' : '',
  };
  const invalido = Object.values(err).some(Boolean);

  const guardar = async () => {
    if (invalido) return setError('Corrige los datos marcados antes de guardar.');
    setGuardando(true); setError('');
    try {
      const nuevo = { ...v, nombre: v.nombre.trim(), rut: formatearRut(v.rut), email: v.email.trim(), telefono: v.telefono.trim(), observaciones: v.observaciones.trim() };
      const r = await alGuardar(nuevo);
      setV(nuevo); setGuardado(nuevo); setPdf(r.pdf);
    } catch (e) { setError(mensaje(e)); }
    setGuardando(false);
  };
  const enviar = async () => { setEnviando(true); setError(''); try { await alConfirmar(); } catch (e) { setError(mensaje(e)); setEnviando(false); } };

  return <>
    <VentanaCabecera icono="sign" titulo="Acta de visita" descripcion="Revisa lo que lleva el acta y ajústalo si hace falta: el PDF se actualiza al guardar." cerrable={!enviando} />
    <VentanaCuerpo>
      <div className="ov-doble tw:grid tw:grid-cols-1 tw:lg:grid-cols-[minmax(300px,380px)_1fr] tw:gap-4 tw:items-start">
        <div className="tw:flex tw:flex-col tw:gap-3">
          <Card titulo="Visitante" subtitulo="Firma el acta">
            <div className="tw:flex tw:flex-col tw:gap-3">
              <Input etiqueta="Nombre completo" id="afNombre" autoComplete="off" error={v.nombre ? err.nombre : ''} {...campo('nombre')} />
              <div className="tw:grid tw:grid-cols-2 tw:gap-3">
                <Input etiqueta="RUT" id="afRut" autoComplete="off" pendiente={!v.rut} error={v.rut ? err.rut : ''} {...campo('rut')} onBlur={() => v.rut && rutValido(v.rut) && setV((x) => ({ ...x, rut: formatearRut(x.rut) }))} />
                <Input etiqueta="Teléfono" id="afTel" type="tel" autoComplete="off" placeholder="+56 9…" {...campo('telefono')} />
              </div>
              <Input etiqueta="Correo" id="afEmail" type="email" autoComplete="off" pendiente={!v.email} error={v.email ? err.email : ''} {...campo('email')} />
            </div>
          </Card>

          <Card titulo="Acta" subtitulo={orden}>
            <div className="tw:flex tw:flex-col tw:gap-3">
              <Select etiqueta="Interés del visitante" id="afInteres" opciones={[['alto', 'Alto'], ['medio', 'Medio'], ['bajo', 'Bajo'], ['sin_datos', 'Sin datos']]} {...campo('interes')} />
              <Textarea etiqueta="Observaciones de la visita" id="afObs" rows={7} placeholder="Cómo fue la visita, qué comentó el visitante, en qué quedaron" {...campo('observaciones')} />
            </div>
          </Card>

          <Card titulo="Propiedad" subtitulo="Se edita en su ficha">
            <div className="tw:flex tw:items-start tw:gap-2.5">
              <Badge tono="lavanda">{propiedad.codigo}</Badge>
              <span className="tw:min-w-0 tw:flex-1 tw:text-[13px]"><b className="tw:block tw:font-semibold tw:truncate">{propiedad.titulo}</b><span className="tw:text-muted">{propiedad.direccion}</span></span>
            </div>
          </Card>

          <ErrorVentana id="afErr" texto={error} />
        </div>

        <Card titulo="Vista previa" subtitulo="Así se envía a firmar" relleno={true} className="tw:min-w-0 tw:lg:sticky tw:lg:top-0">
          <div className={guardando ? 'tw:opacity-50 tw:transition-opacity' : 'tw:transition-opacity'}>{pdf ? <VisorPdf base64={pdf} /> : <p className={NOTA}>Completa los datos del visitante y guarda para armar el PDF.</p>}</div>
        </Card>
      </div>
      <p className={`${NOTA} tw:mt-3`}>Se cobra del saldo de Portalfirma y el visitante recibe el enlace para firmar en su correo. Cuando firme, el paso «Acta de visita» queda logrado.</p>
    </VentanaCuerpo>
    <VentanaPie>
      {sucio ? <span className="tw:mr-auto tw:text-xs tw:text-muted">{pdf ? 'Cambios sin guardar' : 'Falta armar el PDF'}</span> : <span className="tw:mr-auto"><Badge tono="verde" icono="check" ajustar>Todo guardado</Badge></span>}
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal} disabled={enviando}>Cancelar</Boton>
      <Boton id="afGuardar" variante="secundario" icono="save" cargando={guardando} disabled={!sucio || enviando} onClick={guardar}>Guardar y actualizar PDF</Boton>
      <Boton id="mOk" icono="sign" disabled={sucio || invalido || guardando || enviando} cargando={enviando} onClick={enviar} title={sucio ? 'Guarda los cambios antes de enviar' : undefined}>{enviando ? 'Enviando…' : 'Generar y enviar a firmar'}</Boton>
    </VentanaPie>
  </>;
}
