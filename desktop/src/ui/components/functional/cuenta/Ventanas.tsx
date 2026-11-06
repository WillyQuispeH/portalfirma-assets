// Ventanas de la cuenta de Portalfirma (en el modal de la app, utils/modal.tsx, con las partes del kit:
// VentanaCabecera, VentanaCuerpo y VentanaPie):
//  · el inicio de sesión con correo y contraseña (conexión directa con la API de Portalfirma),
//  · la conexión directa ya iniciada, con el diagnóstico de la API.
// El diagnóstico guarda en Descargas SOLO la estructura de las respuestas (campos y tipos), sin datos.
// Los id (#adEmail, #adPass, #adErr, #adOut, #adStep, #mOk, #mCancel) los usan las pruebas.
import { useState } from 'react';
import Boton from '../../ui/Boton';
import Input from '../../ui/Input';
import Badge from '../../ui/Badge';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../ui/Ventana';
import { useCuenta } from '../../../store/hooks/useCuenta.hook';
import { abrirModal, cerrarModal } from '../../../utils/modal';
import { toast } from '../../../utils/app';
import type { IDiagnostico, IUsuarioPf } from '../../../store/interfaces/cuenta.interface';

// textos del cuerpo: párrafo, nota en gris y error
const P = 'tw:mt-0 tw:mb-3 tw:leading-relaxed';
const NOTA = 'tw:m-0 tw:text-[12.5px] tw:text-muted tw:leading-relaxed';
const ERROR = 'tw:text-[13px] tw:font-semibold tw:text-red-softink';

// Con el correo y la contraseña de la cuenta de empresa. La contraseña no se guarda.
export function IniciarConCorreo({ motivo, alEntrar }: { motivo?: string; alEntrar: () => void }) {
  const { cuentaEntrarConCorreo } = useCuenta();
  const [email, setEmail] = useState(''); const [clave, setClave] = useState('');
  const [error, setError] = useState(''); const [ocupado, setOcupado] = useState(false);
  const entrar = async () => {
    setOcupado(true); setError('');
    const err = await cuentaEntrarConCorreo(email, clave);
    setClave('');
    if (err) { setOcupado(false); setError(err); return; }
    toast('Sesión iniciada'); alEntrar();
  };
  return <>
    <VentanaCabecera icono="user" titulo="Iniciar sesión en Portalfirma" descripcion={motivo || undefined} />
    <VentanaCuerpo>
      <p className={NOTA + ' tw:mb-3'}>Con el correo y la contraseña de tu cuenta de empresa. La app guarda solo la sesión (cifrada); la contraseña no se guarda.</p>
      <div className="tw:flex tw:flex-col tw:gap-3">
        <Input id="adEmail" etiqueta="Correo" type="email" autoComplete="username" spellCheck={false} autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input id="adPass" etiqueta="Contraseña" type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !ocupado) entrar(); }} />
      </div>
      <p className={ERROR + ' tw:mt-2 tw:mb-0'} id="adErr" role={error ? 'alert' : undefined}>{error}</p>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
      <Boton id="mOk" disabled={ocupado} onClick={entrar}>Iniciar sesión</Boton>
    </VentanaPie>
  </>;
}

// Sesión iniciada: quién es y el diagnóstico (solo lectura) de la API
export function ConexionDirecta({ usuario, alSalir }: { usuario: IUsuarioPf; alSalir: () => void }) {
  const { cuentaDiagnostico } = useCuenta();
  const [paso, setPaso] = useState<{ texto?: string; error?: string }>({}); const [ocupado, setOcupado] = useState(false);
  const diagnosticar = async () => {
    setOcupado(true); setPaso({ texto: 'Consultando…' });
    const r = await cuentaDiagnostico();
    if (!r.data) { setOcupado(false); setPaso({ error: r.error }); return; }
    abrirModal(<DiagnosticoListo d={r.data} />, { clave: 'modal-63' });
  };
  return <>
    <VentanaCabecera icono="link" titulo="Conexión directa con Portalfirma"
      descripcion={<>Sesión iniciada como <b>{usuario.namePerson || usuario.email}</b>{usuario.nameEntity ? ` · ${usuario.nameEntity}` : ''}.</>} />
    <VentanaCuerpo>
      <p className={P}>El diagnóstico consulta (solo lectura) tus operaciones, saldo y un documento, y guarda en Descargas un archivo con la <b>estructura</b> de las respuestas, sin nombres, RUT, correos ni montos. No envía ni cobra nada.</p>
      <p className="tw:m-0 tw:text-[13px] tw:text-muted" id="adStep">{paso.error ? <span className={ERROR}>{paso.error}</span> : paso.texto}</p>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="adOut" variante="fantasma" className="tw:mr-auto" onClick={alSalir}>Cerrar sesión</Boton>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cerrar</Boton>
      <Boton id="mOk" cargando={ocupado} onClick={diagnosticar}>Ejecutar diagnóstico</Boton>
    </VentanaPie>
  </>;
}

function DiagnosticoListo({ d }: { d: IDiagnostico }) {
  return <>
    <VentanaCabecera icono="check" tonoIcono="verde" titulo="Diagnóstico listo" descripcion={<>Se guardó <b>{d.file}</b> en tu carpeta Descargas.</>} />
    <VentanaCuerpo>
      <div className="ad-list tw:flex tw:flex-col tw:gap-1.5 tw:mb-3">
        {d.tests.map((x, i) => (
          <div className="ad-row tw:flex tw:items-center tw:gap-2 tw:text-[13px]" key={i}>
            <Badge tono={x.ok && x.success !== false ? 'verde' : 'amarillo'}>{x.status || '—'}</Badge> {x.name}
          </div>
        ))}
      </div>
      <p className={NOTA}>Avísale a Claude que el diagnóstico está listo.</p>
    </VentanaCuerpo>
    <VentanaPie><Boton id="mCancel" onClick={cerrarModal}>Entendido</Boton></VentanaPie>
  </>;
}
