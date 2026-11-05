// Agente por WhatsApp: conectar el WhatsApp de la empresa (wechatia), vincular el celular del usuario con un
// código y decidir si este computador responde. Lo hecho por WhatsApp queda en la conversación «WhatsApp» del Agente.
// Va en el modal de la app (ancho). Los id (#waAg, #waKey, #waVin, #waAct…) los usan las pruebas; los estilos son
// las clases wa-* de styles.css; los botones son Boton del kit.
import { useEffect, useRef, useState } from 'react';
import Icono from '../../ui/Icono';
import Boton from '../../ui/Boton';
import { useWhatsApp } from '../../../store/hooks/useWhatsApp.hook';
import { useCuenta } from '../../../store/hooks/useCuenta.hook';
import { cerrarModal } from '../../../utils/modal';
import { toast } from '../../../utils/app';

// +56 9 1234 5678
const fmtTel = (t?: string | null) => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 11 ? `+${d.slice(0, 2)} ${d.slice(2, 3)} ${d.slice(3, 7)} ${d.slice(7)}` : t || ''; };

export default function AgenteWhatsApp() {
  const { estado: e, waCargar, waConectar, waVincular, waDesvincular, waConfigurar, waRevisarVinculo } = useWhatsApp();
  const { usuario } = useCuenta();
  const [listo, setListo] = useState(false);
  const [errClave, setErrClave] = useState(''); const [conectando, setConectando] = useState(false);
  const clave = useRef<HTMLInputElement>(null); const cuenta = useRef<HTMLInputElement>(null);
  useEffect(() => { waCargar().then(() => setListo(true)); }, [waCargar]);
  // con el código a la vista, revisa cada 2 segundos si ya llegó el mensaje desde el celular
  const codigo = e?.codigo;
  useEffect(() => {
    if (!codigo) return;
    const t = setInterval(async () => { if (await waRevisarVinculo()) { clearInterval(t); toast('Celular vinculado.'); } }, 2000);
    return () => clearInterval(t);
  }, [codigo, waRevisarVinculo]);

  if (!listo || !e) return <div className="wa-ag" id="waAg"><div className="ga-load"><span className="spinner sm" />Cargando…</div></div>;

  const paso1 = !!e.conectado;
  const conectar = async () => {
    const k = clave.current?.value.trim() || '';
    if (!k) { setErrClave('Pega la clave.'); return; }
    setConectando(true); setErrClave('');
    const err = await waConectar(k, cuenta.current?.value.trim() || '');
    setConectando(false);
    if (err) setErrClave(err); else toast('WhatsApp de la empresa conectado.');
  };
  const vincular = async () => { const err = await waVincular(usuario?.namePerson || '', usuario?.email || ''); if (err) toast(err, 6000); };
  const copiar = async () => { try { await navigator.clipboard.writeText(e.codigo || ''); toast('Código copiado.'); } catch { /* sin portapapeles */ } };
  const desvincular = async () => { await waDesvincular(); toast('Celular desvinculado.'); };
  const activar = async (activo: boolean) => {
    await waConfigurar({ activo });
    toast(activo ? 'El Agente responde tu WhatsApp desde este computador.' : 'Agente por WhatsApp en pausa.');
  };

  return (
    <div className="wa-ag" id="waAg">
      <h2><Icono nombre="whatsapp" tam={20} /> Agente por WhatsApp</h2>
      <p className="muted">Habla con tu equipo desde el celular, por texto o notas de voz. Escribe el nombre de quien necesitas y te atiende: <b>Pedro</b> (Captación), <b>Juanita</b> (Documentos), <b>Diego</b> (Seguimiento) o <b>Fernanda</b> (Leads). Cada uno guarda su propia conversación, así puedes cambiar de uno a otro sin perder el hilo. Todo queda aquí, en la conversación <b>WhatsApp</b> del Agente.</p>

      <div className={`wa-paso ${paso1 ? 'ok' : ''}`}><span className="wa-n">{paso1 ? <Icono nombre="check" tam={14} /> : '1'}</span><div><b>WhatsApp de la empresa</b>
        {paso1 ? <small>Conectado a wechatia{e.propia ? ' con la clave de la integración' : ''}.</small> : <>
          <small>Pega la clave de la integración privada de wechatia (ver conversaciones, ver y editar mensajes, ver y editar contactos).</small>
          <div className="wa-f">
            <input id="waKey" ref={clave} type="password" autoComplete="off" spellCheck={false} placeholder="Clave (pit-…)" />
            <input id="waLoc" ref={cuenta} defaultValue={e.locationId || ''} placeholder="Cuenta de wechatia (location)" spellCheck={false} />
            <Boton tamano="sm" id="waKeyOk" cargando={conectando} onClick={conectar}>Conectar</Boton>
          </div>
          <p className="error" id="waKeyErr">{errClave}</p>
        </>}
      </div></div>

      <div className={`wa-paso ${e.telefono ? 'ok' : ''} ${paso1 ? '' : 'off'}`}><span className="wa-n">{e.telefono ? <Icono nombre="check" tam={14} /> : '2'}</span><div><b>Tu celular</b>
        {e.telefono ? <>
          <small>Vinculado: <b>{fmtTel(e.telefono)}</b>. Solo los mensajes de este celular los atiende tu Asset.</small>
          <div className="wa-f"><Boton variante="fantasma" tamano="sm" id="waDes" onClick={desvincular}>Desvincular</Boton></div>
        </> : e.codigo ? <>
          <small>Desde tu celular, envía este mensaje por WhatsApp al número de la empresa <b>{e.numeroEmpresa}</b>:</small>
          <div className="wa-cod"><b>{e.codigo}</b><Boton variante="secundario" tamano="sm" id="waCopy" onClick={copiar}>Copiar</Boton></div>
          <p className="muted small"><span className="spinner sm" /> Esperando tu mensaje… (se revisa cada pocos segundos)</p>
        </> : <>
          <small>Asset te da un código; lo envías desde tu celular y queda vinculado a tu cuenta.</small>
          <div className="wa-f"><Boton tamano="sm" id="waVin" disabled={!paso1} onClick={vincular}>Vincular mi celular</Boton></div>
        </>}
      </div></div>

      <div className={`wa-paso ${e.activo ? 'ok' : ''} ${e.telefono ? '' : 'off'}`}><span className="wa-n">{e.activo ? <Icono nombre="check" tam={14} /> : '3'}</span><div><b>Responder desde este computador</b>
        <label className="pv-sw"><input type="checkbox" id="waAct" checked={!!e.activo} disabled={!e.telefono} onChange={(ev) => activar(ev.target.checked)} />
          <span><b>{e.activo ? 'Activo' : 'En pausa'}</b><small>Funciona mientras Asset esté abierto aquí. Actívalo en un solo computador.</small></span></label>
      </div></div>

      <details className="lz-det"><summary>Más opciones</summary>
        <label className="wa-num"><span>Número de WhatsApp de la empresa</span>
          <input id="waNum" key={e.numeroEmpresa || ''} defaultValue={e.numeroEmpresa || ''}
            onBlur={(ev) => { if (ev.target.value !== (e.numeroEmpresa || '')) waConfigurar({ numeroEmpresa: ev.target.value }); }}
            onKeyDown={(ev) => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); }} />
        </label>
      </details>
      <div className="actions"><Boton variante="secundario" id="mCancel" onClick={cerrarModal}>Cerrar</Boton></div>
    </div>
  );
}
