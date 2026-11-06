// Ventanas de «Mis operaciones» que abre el código antiguo (src/renderer/operaciones.js) con window.Ventanas.abrir:
// el teléfono de la cuenta, el error al traer un documento y el código de acceso a los documentos.
// Partes del kit: VentanaCabecera, VentanaCuerpo y VentanaPie. Las pruebas usan #opPhone, #fkVal, #fkErr, #mOk y #mCancel.
import { useState } from 'react';
import Boton from '../../../ui/Boton';
import Input from '../../../ui/Input';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../../ui/Ventana';
import { cerrarModal } from '../../../../utils/modal';
import { P, FORM } from '../editor-pdf/Modales';

// modal-50 · teléfono con el que se registró en Portalfirma
export function TelefonoCuenta({ inicial = '', alCancelar, alEnviar }: { inicial?: string; alCancelar: () => void; alEnviar: (tel: string) => void }) {
  const [tel, setTel] = useState(inicial);
  return <>
    <VentanaCabecera icono="listCheck" titulo="Tus operaciones de Portalfirma" />
    <VentanaCuerpo className={FORM}>
      <p className={P}>Para traer las operaciones de tu cuenta, escribe el <strong>teléfono con el que te registraste en Portalfirma</strong>. Se guarda en este computador.</p>
      <Input etiqueta="Teléfono" id="opPhone" value={tel} placeholder="9 1234 5678" inputMode="tel" autoFocus icono="phone"
        onChange={(e) => setTel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') alEnviar(tel); }} />
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={alCancelar}>Cancelar</Boton>
      <Boton id="mOk" onClick={() => alEnviar(tel)}>Traer mis operaciones</Boton>
    </VentanaPie>
  </>;
}

// modal-51 · no se pudo traer el PDF
export function ErrorArchivo({ error, alIr }: { error: string; alIr: () => void }) {
  return <>
    <VentanaCabecera icono="alert" tonoIcono="rojo" titulo="No se pudo obtener el documento" />
    <VentanaCuerpo><p className={P}>{error}</p></VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cerrar</Boton>
      <Boton id="mOk" iconoDerecha="arrowR" onClick={alIr}>Ir a mis contratos en Portalfirma</Boton>
    </VentanaPie>
  </>;
}

// modal-52 · código de acceso al servicio de archivos de Portalfirma. alGuardar devuelve el error, si lo hubo.
export function AccesoDocumentos({ alGuardar }: { alGuardar: (codigo: string) => Promise<string | null | void> }) {
  const [codigo, setCodigo] = useState(''); const [error, setError] = useState(''); const [guardando, setGuardando] = useState(false);
  const guardar = async () => {
    setGuardando(true);
    try { setError((await alGuardar(codigo)) || ''); } finally { setGuardando(false); }
  };
  return <>
    <VentanaCabecera icono="key" titulo="Acceso a los documentos" />
    <VentanaCuerpo className={FORM}>
      <p className={P}>Para mostrar los PDF, la app usa el servicio oficial de archivos de Portalfirma. Ingresa el código de acceso que te entregó Portalfirma.</p>
      <Input etiqueta="Código de acceso" id="fkVal" type="password" autoComplete="off" spellCheck={false} autoFocus value={codigo}
        onChange={(e) => setCodigo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') guardar(); }} />
      <p id="fkErr" className="tw:m-0 tw:text-xs tw:text-err" role="alert">{error}</p>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
      <Boton id="mOk" cargando={guardando} onClick={guardar}>Guardar</Boton>
    </VentanaPie>
  </>;
}
