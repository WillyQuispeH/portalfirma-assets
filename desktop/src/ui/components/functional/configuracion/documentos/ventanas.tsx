// Ventanas de Configuración › Documentos (abrirModal + las partes de Ventana.tsx). Cada una devuelve una promesa:
//   · editarTipo           (modal-156)  «Agregar tipo de documento» / «Editar»: nombre, firma, trámite y otras formas de nombrarlo → IDatosTipo | 'borrar' | null
//   · guardarConfiguracion (modal-157)  «¿Guardas configuración por defecto?»: al terminar de enviar un documento de un tipo que la corredora
//                                       no tenía; deja su firma y trámite para los próximos                                       → true (guardó) | false
// El borrado confirma con modal-158 (confirmar de utils/app.ts). La segunda también se abre desde la carga masiva (masiva.js) por
// su nombre, «gestion.guardarTipoDocumento» (ventanas/gestion.tsx).
import { useState, type FormEvent, type ReactElement } from 'react';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../../ui/Ventana';
import Boton from '../../../ui/Boton';
import Input from '../../../ui/Input';
import Select from '../../../ui/Select';
import { abrirModal, cerrarModal } from '../../../../utils/modal';
import { api } from '../../../../utils/api';
import { toast } from '../../../../utils/app';
import { TIPOS_FIRMA_PLANTILLA, resumenFirma } from '../plantillas/firma';
import type { IDatosTipo, ITipoDocumento } from './tipos';

const SELECTS_FIRMA = TIPOS_FIRMA_PLANTILLA.map((t): [string, string] => [t[0], t[1]]);
const TRAMITES: [string, string][] = [['none', 'Sin trámite'], ['legalization', 'Con legalización notarial']];

function EditarTipo({ tipo, soloLectura, alResponder }: { tipo: ITipoDocumento | null; soloLectura: boolean; alResponder: (r: IDatosTipo | 'borrar' | null) => void }) {
  const [nombre, setNombre] = useState(tipo?.nombre ?? '');
  const [tipoFirma, setTipoFirma] = useState<IDatosTipo['tipoFirma']>(tipo?.tipoFirma ?? 'avanzada');
  const [tramite, setTramite] = useState<IDatosTipo['tramite']>(tipo?.tramite ?? 'none');
  const [palabras, setPalabras] = useState((tipo?.palabras ?? []).join(', '));
  const [error, setError] = useState('');
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (nombre.trim().length < 2) { setError('Escribe el nombre del documento.'); return; }
    alResponder({ nombre: nombre.trim(), tipoFirma, tramite, palabras: palabras.split(',').map((p) => p.trim()).filter((p) => p.length >= 2).slice(0, 12) });
  };
  return <>
    <VentanaCabecera titulo={tipo ? 'Editar tipo de documento' : 'Agregar tipo de documento'} icono="sign" onCerrar={() => alResponder(null)}
      descripcion={soloLectura ? 'Solo el administrador de la corredora puede cambiarlo.' : 'Cuando suban un documento de este tipo, la firma y el trámite se llenan solos.'} />
    <VentanaCuerpo>
      <form id="tdForm" onSubmit={enviar} className="tw:flex tw:flex-col tw:gap-3">
        <Input id="tdNombre" etiqueta="Nombre del documento" value={nombre} maxLength={80} autoFocus disabled={soloLectura} aria-required="true"
          placeholder="p. ej. Carta oferta" error={error || null} onChange={(e) => { setNombre(e.target.value); setError(''); }} />
        <Select id="tdTipoFirma" etiqueta="Tipo de firma" disabled={soloLectura} value={tipoFirma} opciones={SELECTS_FIRMA}
          ayuda={TIPOS_FIRMA_PLANTILLA.find((t) => t[0] === tipoFirma)?.[2]} onChange={(e) => setTipoFirma(e.target.value as IDatosTipo['tipoFirma'])} />
        <Select id="tdTramite" etiqueta="Trámite legal" disabled={soloLectura} value={tramite} opciones={TRAMITES}
          ayuda="Portalfirma coordina la legalización; tiene un costo adicional." onChange={(e) => setTramite(e.target.value as IDatosTipo['tramite'])} />
        <Input id="tdPalabras" etiqueta="Otros nombres (opcional)" value={palabras} maxLength={400} disabled={soloLectura}
          placeholder="p. ej. oferta de compra, oferta formal" ayuda="Separados por coma: ayudan a reconocer el documento cuando lo suben." onChange={(e) => setPalabras(e.target.value)} />
        {tipo?.plantilla && <p className="tw:m-0 tw:text-[13px] tw:text-muted">Este documento también lo arma Asset: su firma y trámite son los mismos de Configuración › Plantillas.</p>}
      </form>
    </VentanaCuerpo>
    <VentanaPie>
      {tipo && !soloLectura && <Boton id="tdBorrar" variante="peligro" onClick={() => alResponder('borrar')}>Borrar</Boton>}
      <Boton id="mCancel" variante="secundario" onClick={() => alResponder(null)}>{soloLectura ? 'Cerrar' : 'Cancelar'}</Boton>
      {!soloLectura && <Boton id="mOk" type="submit" form="tdForm" icono="save">Guardar</Boton>}
    </VentanaPie>
  </>;
}

/** «¿Guardas configuración por defecto?»: el documento recién enviado era de un tipo que la corredora no tenía configurado */
export function GuardarConfiguracion({ nombre, tipoFirma, tramite, alResponder }: { nombre: string; tipoFirma: IDatosTipo['tipoFirma']; tramite: IDatosTipo['tramite']; alResponder: (guardo: boolean) => void }) {
  const [ocupado, setOcupado] = useState(false);
  const guardar = async () => {
    setOcupado(true);
    try { await api('tiposCrear', { nombre, tipoFirma, tramite }); toast(`«${nombre}» quedó con esa configuración.`); alResponder(true); }
    catch (e) { setOcupado(false); toast((e as Error).message, 6000); }
  };
  return <>
    <VentanaCabecera titulo="¿Guardas configuración por defecto?" icono="sign" onCerrar={() => alResponder(false)}
      descripcion={`Para los próximos documentos «${nombre}».`} />
    <VentanaCuerpo>
      <p id="tdPregunta" className="tw:m-0 tw:text-sm tw:leading-relaxed">
        Este documento se envió con <b>{resumenFirma({ tipoFirma, tramite }).toLowerCase()}</b>. Si lo guardas, la próxima vez que suban un «{nombre}» la firma y el trámite se llenarán solos.
        Después lo cambias en Configuración › Documentos.
      </p>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" disabled={ocupado} onClick={() => alResponder(false)}>No, gracias</Boton>
      <Boton id="mOk" icono="save" cargando={ocupado} onClick={guardar}>Guardar</Boton>
    </VentanaPie>
  </>;
}

function preguntar<T>(dibujar: (fin: (r: T) => void) => ReactElement, clave: string, ancho = false): Promise<T> {
  return new Promise((resolver) => {
    const fin = (r: T) => { cerrarModal(); resolver(r); };
    abrirModal(dibujar(fin), { clave, ancho });
  });
}

export const editarTipo = (tipo: ITipoDocumento | null, soloLectura: boolean) =>
  preguntar<IDatosTipo | 'borrar' | null>((fin) => <EditarTipo tipo={tipo} soloLectura={soloLectura} alResponder={fin} />, 'modal-156');
const preguntados = new Set<string>(); // un tipo se pregunta una sola vez por sesión (si dijo que no, no se insiste)
export const preguntarGuardarConfiguracion = (nombre: string, tipoFirma: IDatosTipo['tipoFirma'], tramite: IDatosTipo['tramite']) => {
  const clave = nombre.trim().toLowerCase();
  if (preguntados.has(clave)) return Promise.resolve(false);
  preguntados.add(clave);
  return preguntar<boolean>((fin) => <GuardarConfiguracion nombre={nombre} tipoFirma={tipoFirma} tramite={tramite} alResponder={fin} />, 'modal-157');
};
