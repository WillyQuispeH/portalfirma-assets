// modal-127: el contrato de arriendo de un negocio, listo para revisar y enviar a firmar (misma idea que la carta oferta, modal-125).
//   · izquierda: las condiciones del contrato (inicio, plazo, renta, reajuste, aviso, uso de la propiedad, garantía en meses, cláusulas). Los codeudores NO se escriben aquí: son los avales que se evaluaron junto con el arrendatario y las
//     las condiciones de firma. «Guardar y actualizar PDF» las guarda en el negocio (ciclo.contrato.datos) y vuelve
//     a generar el PDF. Los firmantes (propietarios, arrendatario, codeudor) salen de sus fichas.
//   · derecha: el PDF tal como se enviará a firmar.
// La lógica (guardar, generar el PDF, enviar) está en src/renderer/etapas.js (contratoArriendo) y llega en las props.
// Los firmantes (propietarios, arrendatario y los avales que son codeudores) se editan AQUÍ MISMO (nombre, RUT, correo, celular): lo que
// falta para firmar (el RUT o el correo de alguien) se corrige sin salir de la ventana; se guarda en la ficha de cada persona.
// Los id (#caInicio, #caPlazo, #caRenta, #caReajuste, #caAviso, #caDia, #caGarantia (meses), #caUso, #caCodeudores,
// #caClausulas, #caFirmaInfo (cómo se firma: viene de la plantilla, no se elige aquí), #caGuardar, #caGuardarFirmantes, #caFirNombre-N, #caFirRut-N, #caFirTel-N, #caFirEmail-N, #mOk, #mCancel) los usan las pruebas.
import { useState } from 'react';
import Boton from '../../ui/Boton';
import MenuMas from '../../ui/MenuMas';
import Badge from '../../ui/Badge';
import Card from '../../ui/Card';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import { fraseFirma } from '../configuracion/plantillas/firma';
import Textarea from '../../ui/Textarea';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../ui/Ventana';
import { NOTA } from '../gestion/editor-pdf/Modales';
import { ErrorVentana } from './VentanasAntiguas';
import { cerrarModal } from '../../../utils/modal';
import { toast } from '../../../utils/app';
import { descargarPdf } from '../../../utils/pdf';
import { correoValido, formatearRut, rutValido } from '../../../utils/rut';
import { PdfCargando } from '../agenda/VisorPdf';
import PdfConFirmas from '../agenda/PdfConFirmas';
import { usePdfInicial, type IPdfInicial } from '../agenda/usePdfInicial';
import { AvisoDominio, type ICambiosFicha, type IDominioFicha } from './AvisoDominio';

export interface IContratoDatos {
  inicio: string; plazoMeses: string; renta: string; moneda: string; reajuste: string; avisoDias: string; diaPago: string; garantiaMeses: string; uso: string; clausulas: string;
  /** cuenta donde se paga la renta (si falta, el contrato dice que el arrendador la indicará por escrito) */
  cuenta: string;
}
/** quien firma: su ficha del CRM (se edita en esta ventana) */
export interface IFirmantePersona { personaId: string; rol: string; nombre: string; rut: string; email: string; telefono: string; nacionalidad?: string; estadoCivil?: string; profesion?: string; direccion?: string }
export interface IContratoFirma { tipoFirma: 'simple' | 'avanzada'; tramite: 'none' | 'legalization' }
export interface IContratoArriendoProps {
  /** borrador (por defecto): se editan las condiciones y se guarda una VERSIÓN del contrato (con su PDF) para mandarla a revisión;
   *  firma: se ve la versión APROBADA por el propietario y el arrendatario (solo lectura) y se envía a firmar como lo define la plantilla del contrato (Configuración › Plantillas) */
  modo?: 'borrador' | 'firma';
  /** firma: qué versión se firma */
  versionN?: number;
  /** borrador: guarda el contrato como una versión nueva (genera y archiva su PDF) */
  alGuardarVersion?: () => Promise<void>;
  pdf?: string;
  /** lo que impidió armar el PDF (falta la fecha de inicio, el correo de un propietario…): se muestra al abrir y se corrige aquí mismo */
  errorInicial?: string;
  /** el PDF que se está armando (o trayendo): la ventana se abre ya y la vista previa lo muestra al llegar */
  pdfPromesa?: Promise<IPdfInicial>;
  datos: IContratoDatos;
  /** cómo se firma, según la plantilla del contrato (solo se muestra; el servidor usa la de la plantilla). null: no se pudo leer */
  firma?: IContratoFirma | null;
  propiedad: { codigo: string; titulo: string; direccion: string };
  /** quiénes firman: los propietarios, el arrendatario y los avales de la evaluación (codeudores), con los datos de su ficha */
  firmantes: IFirmantePersona[];
  /** guarda los cambios (condiciones en el negocio y datos de los firmantes en sus fichas) y devuelve el PDF nuevo (lanza el error si algo falla) */
  alGuardar: (d: IContratoDatos, f: IContratoFirma | null, firmantes: IFirmantePersona[]) => Promise<{ pdf: string }>;
  alConfirmar: () => Promise<void>;
  /** borrador: la inscripción de dominio que tiene la ficha (si falta, el contrato dice «en el Conservador de Bienes Raíces respectivo» y se avisa aquí) */
  dominio?: IDominioFicha;
  /** guarda la inscripción (o la cuenta de pago) en la ficha de la propiedad y devuelve el PDF nuevo */
  alGuardarDominio?: (c: ICambiosFicha) => Promise<{ pdf: string }>;
  /** abre «Leer desde la copia de dominio» (reemplaza esta ventana y, al terminar, la vuelve a abrir) */
  alLeerDominio?: () => void;
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));
/** guarda el PDF en el computador: firmar en Asset es opcional */
const bajar = async (pdf: string, nombre: string, avisar: (m: string) => void) => { if (!pdf) return; try { if (await descargarPdf(pdf, nombre)) toast('PDF guardado.'); } catch (e) { avisar(mensaje(e)); } };
const USOS: [string, string][] = [['habitacional', 'Vivienda (habitacional)'], ['comercial', 'Local comercial'], ['oficina', 'Oficina'], ['bodega', 'Bodega'], ['estacionamiento', 'Estacionamiento']];
/** lo que le falta a un firmante para poder firmar (el RUT y el correo son obligatorios; el celular, no) */
const faltaDe = (p: IFirmantePersona) => [!rutValido(p.rut) ? 'RUT' : '', !correoValido(p.email) ? 'correo' : ''].filter(Boolean);
const REAJUSTES: [string, string][] = [['ipc_semestral', 'IPC cada 6 meses'], ['ipc_anual', 'IPC cada 12 meses'], ['uf', 'Renta en UF'], ['sin', 'Sin reajuste']];

export function ContratoArriendo({ modo = 'borrador', versionN, alGuardarVersion, pdf: pdf0, pdfPromesa, errorInicial, datos, firma, propiedad, firmantes: firmantes0, alGuardar, alConfirmar, dominio, alGuardarDominio, alLeerDominio }: IContratoArriendoProps) {
  const [v, setV] = useState<IContratoDatos>(datos); const f = firma ?? null;
  const [guardado, setGuardado] = useState<{ v: IContratoDatos; f: IContratoFirma | null }>({ v: datos, f: firma ?? null });
  const { pdf, setPdf, cargando: cargandoPdf, errorCarga, firmantes: firmantesPdf } = usePdfInicial(pdf0, pdfPromesa);
  const [fp, setFp] = useState<IFirmantePersona[]>(firmantes0); const [fpGuardado, setFpGuardado] = useState<IFirmantePersona[]>(firmantes0);
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set(firmantes0.filter((p) => faltaDe(p).length).map((p) => p.personaId)));   // los incompletos se abren solos
  const [guardando, setGuardando] = useState(false); const [enviando, setEnviando] = useState(false);
  const firmando = modo === 'firma';
  const [error, setError] = useState(errorInicial || '');
  const sucioFirm = JSON.stringify(fp) !== JSON.stringify(fpGuardado);
  const incompletos = fp.filter((p) => faltaDe(p).length > 0);
  const sucio = (!firmando && JSON.stringify({ v, f }) !== JSON.stringify(guardado)) || sucioFirm;   // en firma las condiciones no se editan: solo las opciones de firma y los datos de los firmantes
  const campo = (k: keyof IContratoDatos) => ({ value: v[k], onChange: (e: { target: { value: string } }) => { setV((x) => ({ ...x, [k]: e.target.value })); setError(''); } });
  const err = {
    inicio: !/^\d{4}-\d{2}-\d{2}$/.test(v.inicio) ? 'Elige la fecha de inicio' : '',
    plazoMeses: !(Number(v.plazoMeses) >= 1) ? 'Escribe el plazo en meses' : '',
    renta: !(Number(String(v.renta).replace(/\./g, '').replace(',', '.')) > 0) ? 'Escribe la renta' : '',
    garantiaMeses: !(Number(String(v.garantiaMeses).replace(',', '.')) > 0) ? 'Escribe cuántos meses de renta' : '',
  };
  const invalido = Object.values(err).some(Boolean);
  const cambiarFirm = (id: string, k: keyof IFirmantePersona, val: string) => { setFp((l) => l.map((p) => (p.personaId === id ? { ...p, [k]: val } : p))); setError(''); };
  const alternar = (id: string) => setAbiertos((a) => { const n = new Set(a); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  /** solo se bloquea un dato escrito pero mal (RUT o correo con formato inválido); lo que falta lo dice el servidor al armar */
  const firmMalos = fp.filter((p) => (p.rut.trim() && !rutValido(p.rut)) || (p.email.trim() && !correoValido(p.email)));

  const guardar = async () => {
    if (!firmando && invalido) return setError('Corrige los datos marcados antes de guardar.');
    if (firmMalos.length) return setError(`Revisa el RUT o el correo de ${firmMalos.map((p) => p.nombre).join(', ')}.`);
    setGuardando(true); setError('');
    try {
      const nuevo = { ...v }; const nuevosFirm = fp.map((p) => ({ ...p, rut: p.rut.trim() ? formatearRut(p.rut) : '', email: p.email.trim(), telefono: p.telefono.trim(), nombre: p.nombre.trim() }));
      const r = await alGuardar(nuevo, f, nuevosFirm);
      setV(nuevo); setGuardado({ v: nuevo, f }); setFp(nuevosFirm); setFpGuardado(nuevosFirm); setPdf(r.pdf || pdf);
    } catch (e) { setError(mensaje(e)); }
    setGuardando(false);
  };
  const guardarVersion = async () => { if (!alGuardarVersion) return; setEnviando(true); setError(''); try { await alGuardarVersion(); } catch (e) { setError(mensaje(e)); setEnviando(false); } };
  const enviar = async () => { setEnviando(true); setError(''); try { await alConfirmar(); } catch (e) { setError(mensaje(e)); setEnviando(false); } };

  return <>
    <VentanaCabecera icono="sign" titulo={firmando ? 'Enviar el contrato a firmar' : 'Armar el contrato'} descripcion={firmando ? `Se firma la versión ${versionN ?? ''} aprobada por el propietario y el arrendatario.` : 'Revisa las condiciones: el PDF se actualiza al guardar. Después se guarda como versión y se envía a revisión.'} cerrable={!enviando} />
    <VentanaCuerpo>
      <div className="ov-doble tw:grid tw:grid-cols-1 tw:lg:grid-cols-[minmax(300px,380px)_1fr] tw:gap-4 tw:items-start">
        <div className="tw:flex tw:flex-col tw:gap-3">
          <fieldset disabled={firmando} className="tw:contents"><Card titulo="Condiciones" subtitulo={firmando ? 'De la versión aprobada (no se editan aquí)' : 'Lo que dice el contrato'}>
            <div className="tw:flex tw:flex-col tw:gap-3">
              <div className="tw:grid tw:grid-cols-2 tw:gap-3">
                <Input etiqueta="Inicio" id="caInicio" type="date" pendiente={!v.inicio} error={v.inicio ? err.inicio : ''} {...campo('inicio')} />
                <Input etiqueta="Plazo" id="caPlazo" inputMode="numeric" sufijo="meses" pendiente={!v.plazoMeses} error={v.plazoMeses ? err.plazoMeses : ''} {...campo('plazoMeses')} />
              </div>
              <div className="tw:grid tw:grid-cols-[1fr_110px] tw:gap-3">
                <Input etiqueta="Renta mensual" id="caRenta" inputMode="decimal" autoComplete="off" error={v.renta ? err.renta : ''} {...campo('renta')} />
                <Select etiqueta="Moneda" id="caMoneda" opciones={[['CLP', 'Pesos'], ['UF', 'UF'], ['USD', 'Dólares']]} {...campo('moneda')} />
              </div>
              <div className="tw:grid tw:grid-cols-2 tw:gap-3">
                <Select etiqueta="Reajuste" id="caReajuste" opciones={REAJUSTES} {...campo('reajuste')} />
                <Input etiqueta="Pago hasta el día" id="caDia" inputMode="numeric" placeholder="5" {...campo('diaPago')} />
              </div>
              <div className="tw:grid tw:grid-cols-2 tw:gap-3">
                <Input etiqueta="Aviso de término" id="caAviso" inputMode="numeric" sufijo="días" placeholder="60" {...campo('avisoDias')} />
                <Input etiqueta="Garantía" id="caGarantia" inputMode="decimal" sufijo="meses" placeholder="1" error={v.garantiaMeses ? err.garantiaMeses : ''} {...campo('garantiaMeses')} />
              </div>
              <Input etiqueta={<>Cuenta donde se paga la renta <span className="tw:font-normal tw:text-muted">(opcional)</span></>} id="caCuenta" autoComplete="off" placeholder="Cuenta corriente 00-123-45678-90, Banco de Chile" {...campo('cuenta')} />
              <Select etiqueta="Uso de la propiedad" id="caUso" ayuda="Para qué se arrienda: el contrato solo permite ese uso." opciones={USOS} {...campo('uso')} />
              <Textarea etiqueta={<>Cláusulas adicionales <span className="tw:font-normal tw:text-muted">(opcional)</span></>} id="caClausulas" rows={3} {...campo('clausulas')} />
            </div>
          </Card>

          </fieldset>
          {!firmando && dominio && alGuardarDominio && (
            <AvisoDominio dominio={dominio} cuenta={v.cuenta}
              alGuardar={async (c) => {
                const r = await alGuardarDominio(c); setPdf(r.pdf || pdf);
                if (c.cuentaPago) { const cuenta = c.cuentaPago; setV((x) => ({ ...x, cuenta })); setGuardado((g) => ({ ...g, v: { ...g.v, cuenta } })); }   // la cuenta queda en la ficha: el campo «Cuenta» de las condiciones ya no está sin guardar
              }}
              alLeer={alLeerDominio} motivoLeer={sucio ? 'Guarda los cambios antes: esta ventana se vuelve a abrir' : guardando || enviando ? 'Espera un momento' : undefined} />
          )}
          {firmando && <Card titulo="Firma" subtitulo="Lo define la plantilla del contrato">
            <p id="caFirmaInfo" data-firma={firma?.tipoFirma} data-tramite={firma?.tramite} className="tw:m-0 tw:text-sm tw:leading-relaxed">{firma ? <>Se firma con <b>{fraseFirma(firma)}</b> (se cambia en Configuración › Plantillas).</> : <>Se firma como lo define la plantilla del contrato (se cambia en Configuración › Plantillas).</>}</p>
          </Card>}

          <Card titulo="Firmantes" subtitulo="Propietarios, arrendatario y codeudores (los avales de la evaluación): se editan aquí">
            <div className="tw:flex tw:flex-col tw:gap-3">
              <div className="tw:flex tw:items-start tw:gap-2.5">
                <Badge tono="lavanda">{propiedad.codigo}</Badge>
                <span className="tw:min-w-0 tw:flex-1 tw:text-[13px]"><b className="tw:block tw:font-semibold tw:truncate">{propiedad.titulo}</b><span className="tw:text-muted">{propiedad.direccion}</span></span>
              </div>
              <ul className="tw:list-none tw:m-0 tw:p-0 tw:flex tw:flex-col tw:gap-2.5" id="caFirmantes">
                {fp.map((p, i) => {
                  const falta = faltaDe(p); const abierto = abiertos.has(p.personaId);
                  return (
                    <li key={p.personaId + i} data-firmante={p.personaId} className="tw:flex tw:flex-col tw:gap-2">
                      <div className="tw:flex tw:items-center tw:gap-2 tw:flex-nowrap">
                        <Badge tono={p.rol === 'Codeudor' ? 'lavanda' : p.rol === 'Arrendatario' ? 'azul' : 'gris'}>{p.rol}</Badge>
                        <span className="tw:min-w-0 tw:flex-1 tw:text-[13px]"><b className="tw:block tw:truncate">{p.nombre || 'Sin nombre'}</b>
                          {falta.length ? <span className="tw:text-xs tw:font-semibold tw:text-red-softink" data-falta>Falta: {falta.join(' y ')}</span> : <span className="tw:text-xs tw:text-muted">{p.rut} · {p.email}</span>}</span>
                        <Boton tamano="sm" variante="secundario" icono={abierto ? 'check' : 'edit'} onClick={() => alternar(p.personaId)}>{abierto ? 'Listo' : 'Editar'}</Boton>
                      </div>
                      {abierto && (
                        <div className="tw:grid tw:grid-cols-2 tw:gap-3">
                          <div className="tw:col-span-2"><Input etiqueta="Nombre completo" id={`caFirNombre-${i}`} autoComplete="off" value={p.nombre} onChange={(e) => cambiarFirm(p.personaId, 'nombre', e.target.value)} /></div>
                          <Input etiqueta="RUT" id={`caFirRut-${i}`} autoComplete="off" placeholder="12.345.678-5" pendiente={!p.rut} error={p.rut && !rutValido(p.rut) ? 'El RUT no es válido' : ''} value={p.rut} onChange={(e) => cambiarFirm(p.personaId, 'rut', e.target.value)} />
                          <Input etiqueta="Celular" id={`caFirTel-${i}`} type="tel" autoComplete="off" placeholder="+56 9 1234 5678" value={p.telefono} onChange={(e) => cambiarFirm(p.personaId, 'telefono', e.target.value)} />
                          <div className="tw:col-span-2"><Input etiqueta="Correo (ahí recibe el enlace para firmar)" id={`caFirEmail-${i}`} type="email" autoComplete="off" pendiente={!p.email} error={p.email && !correoValido(p.email) ? 'Escribe un correo válido' : ''} value={p.email} onChange={(e) => cambiarFirm(p.personaId, 'email', e.target.value)} /></div>
                          <Input etiqueta="Nacionalidad" id={`caFirNac-${i}`} autoComplete="off" placeholder="chilena" value={p.nacionalidad || ''} onChange={(e) => cambiarFirm(p.personaId, 'nacionalidad', e.target.value)} />
                          <Input etiqueta="Estado civil" id={`caFirCivil-${i}`} autoComplete="off" placeholder="soltero(a), casado(a)…" value={p.estadoCivil || ''} onChange={(e) => cambiarFirm(p.personaId, 'estadoCivil', e.target.value)} />
                          <Input etiqueta="Profesión u oficio" id={`caFirProf-${i}`} autoComplete="off" value={p.profesion || ''} onChange={(e) => cambiarFirm(p.personaId, 'profesion', e.target.value)} />
                          <Input etiqueta="Domicilio" id={`caFirDom-${i}`} autoComplete="off" placeholder="Calle, número, comuna" value={p.direccion || ''} onChange={(e) => cambiarFirm(p.personaId, 'direccion', e.target.value)} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {!fp.some((p) => p.rol === 'Codeudor') && <p id="caCodeudores" className="tw:m-0 tw:text-xs tw:text-muted">Sin codeudores. Si hay avales, se piden en la evaluación del arrendatario y quedan aquí solos.</p>}
            </div>
          </Card>

          <ErrorVentana id="caErr" texto={error || errorCarga} />
        </div>

        <Card titulo="Vista previa" subtitulo={firmando ? 'Así se envía a firmar' : 'Borrador del contrato'} relleno={true} className="tw:min-w-0 tw:lg:sticky tw:lg:top-0">
          <div className={guardando ? 'tw:opacity-50 tw:transition-opacity' : 'tw:transition-opacity'}>{pdf ? <PdfConFirmas pdf={pdf} firmantes={firmantesPdf} plantilla="contrato-arriendo" /> : cargandoPdf ? <PdfCargando /> : <p className={NOTA}>No se pudo preparar el PDF: completa las condiciones y guarda.</p>}</div>
        </Card>
      </div>
      <p className={`${NOTA} tw:mt-3`}>{firmando ? 'Se cobra del saldo de Portalfirma y cada firmante recibe el enlace en su correo. Se firma exactamente el PDF aprobado.' : 'Al guardar la versión se archiva su PDF y se anulan las aprobaciones anteriores. Después la envías al propietario y al arrendatario por WhatsApp. El texto es un borrador para que lo revise el notario.'}</p>
    </VentanaCuerpo>
    <VentanaPie>
      {firmando ? (sucioFirm ? <span className="tw:mr-auto tw:text-xs tw:text-muted">Cambios sin guardar</span> : <span className="tw:mr-auto"><Badge tono="verde" icono="check" ajustar>Versión {versionN} aprobada</Badge></span>)
        : sucio ? <span className="tw:mr-auto tw:text-xs tw:text-muted">Cambios sin guardar</span> : <span className="tw:mr-auto"><Badge tono="verde" icono="check" ajustar>Todo guardado</Badge></span>}
      {firmando
        ? <>
          {sucioFirm && <Boton id="caGuardarFirmantes" variante="secundario" icono="save" cargando={guardando} disabled={enviando} onClick={guardar}>Guardar firmantes</Boton>}
          <Boton id="mOk" icono="sign" disabled={cargandoPdf || enviando || !pdf || sucioFirm || incompletos.length > 0} cargando={enviando} onClick={enviar} title={incompletos.length ? `Falta el RUT o el correo de ${incompletos.map((p) => p.nombre).join(', ')}` : sucioFirm ? 'Guarda los datos de los firmantes antes de enviar' : undefined}>{enviando ? 'Enviando…' : 'Enviar a firmar'}</Boton>
        </>
        : <>
          <Boton id="caGuardar" variante="secundario" icono="save" cargando={guardando} disabled={!sucio || enviando} onClick={guardar}>Guardar y actualizar PDF</Boton>
          <Boton id="mOk" icono="check" disabled={cargandoPdf || sucio || invalido || incompletos.length > 0 || guardando || enviando || !pdf} cargando={enviando} onClick={guardarVersion} title={sucio ? 'Guarda los cambios antes de guardar la versión' : incompletos.length ? `Falta el RUT o el correo de ${incompletos.map((p) => p.nombre).join(', ')}` : undefined}>{enviando ? 'Guardando…' : 'Guardar como versión'}</Boton>
        </>}
      <MenuMas id="caMas" opciones={[
        { id: 'caDescargar', texto: 'Descargar PDF', icono: 'download', disabled: !pdf || guardando, alTocar: () => bajar(pdf, 'Contrato de arriendo.pdf', setError) },
        { id: 'mCancel', texto: 'Cancelar', icono: 'x', disabled: enviando, alTocar: cerrarModal },
      ]} />
    </VentanaPie>
  </>;
}
