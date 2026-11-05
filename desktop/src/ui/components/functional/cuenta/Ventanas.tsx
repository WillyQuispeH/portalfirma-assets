// Ventanas de la cuenta de Portalfirma (en el modal de la app, utils/modal.tsx):
//  · el inicio de sesión con correo y contraseña (conexión directa con la API de Portalfirma),
//  · la conexión directa ya iniciada, con el diagnóstico de la API.
// El diagnóstico guarda en Descargas SOLO la estructura de las respuestas (campos y tipos), sin datos.
// Los id (#adEmail, #adPass, #adErr, #adOut, #adStep, #mOk, #mCancel) los usan las pruebas.
import { useState } from 'react';
import { useCuenta } from '../../../store/hooks/useCuenta.hook';
import { abrirModal, cerrarModal } from '../../../utils/modal';
import { toast } from '../../../utils/app';
import type { IDiagnostico, IUsuarioPf } from '../../../store/interfaces/cuenta.interface';


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
    <h2>Iniciar sesión en Portalfirma</h2>
    {motivo && <p>{motivo}</p>}
    <p className="muted small">Con el correo y la contraseña de tu cuenta de empresa. La app guarda solo la sesión (cifrada); la contraseña no se guarda.</p>
    <label>Correo<input id="adEmail" type="email" autoComplete="username" spellCheck={false} autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></label>
    <label>Contraseña<input id="adPass" type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !ocupado) entrar(); }} /></label>
    <p className="error small" id="adErr">{error}</p>
    <div className="actions">
      <button className="secondary" id="mCancel" onClick={cerrarModal}>Cancelar</button>
      <button className="primary" id="mOk" disabled={ocupado} onClick={entrar}>Iniciar sesión</button>
    </div>
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
    abrirModal(<DiagnosticoListo d={r.data} />);
  };
  return <>
    <h2>Conexión directa con Portalfirma</h2>
    <p>Sesión iniciada como <b>{usuario.namePerson || usuario.email}</b>{usuario.nameEntity ? ` · ${usuario.nameEntity}` : ''}.</p>
    <p className="muted small">El diagnóstico consulta (solo lectura) tus operaciones, saldo y un documento, y guarda en Descargas un archivo con la <b>estructura</b> de las respuestas, sin nombres, RUT, correos ni montos. No envía ni cobra nada.</p>
    <p className="small" id="adStep">{paso.error ? <span className="error">{paso.error}</span> : paso.texto}</p>
    <div className="actions">
      <button className="ghost" id="adOut" onClick={alSalir}>Cerrar sesión</button>
      <button className="secondary" id="mCancel" onClick={cerrarModal}>Cerrar</button>
      <button className="primary" id="mOk" disabled={ocupado} onClick={diagnosticar}>Ejecutar diagnóstico</button>
    </div>
  </>;
}

function DiagnosticoListo({ d }: { d: IDiagnostico }) {
  return <>
    <h2>Diagnóstico listo</h2>
    <p>Se guardó <b>{d.file}</b> en tu carpeta Descargas.</p>
    <div className="ad-list">
      {d.tests.map((x, i) => <div className="ad-row" key={i}><span className={`pill ${x.ok && x.success !== false ? 'ok' : 'wait'}`}>{x.status || '—'}</span> {x.name}</div>)}
    </div>
    <p className="muted small">Avísale a Claude que el diagnóstico está listo.</p>
    <div className="actions"><button className="primary" id="mCancel" onClick={cerrarModal}>Entendido</button></div>
  </>;
}
