// Pestaña «WhatsApp» de Postventa: la clave de la integración con wechatia, la respuesta automática y las
// conversaciones. Los id pvKey, pvKeyOk, pvLoc, pvAuto, pvRev, pvKeyErr y data-ch los usa test/postventa-e2e.js.
import { useState } from 'react';
import Icono from '../../ui/Icono';
import { usePostventa } from '../../../store/hooks/usePostventa.hook';
import { toast } from '../../../utils/app';
import { Burbujas, hora } from './comun';

const aviso = (r: { mensaje?: string; error?: string }) => { if (r.error) toast(r.error, 6000); else if (r.mensaje) toast(r.mensaje, 5000); };

export default function WhatsApp() {
  const { config: c, chats, waGuardarClave, waQuitarClave, waSetAuto, waRevisar } = usePostventa();
  const [clave, setClave] = useState('');
  const [loc, setLoc] = useState(c?.locationId || '');
  const [err, setErr] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [verChat, setVerChat] = useState<string | null>(null);
  if (!c) return null;
  const ch = chats.find((x) => x.id === verChat);

  const guardar = async () => {
    const k = clave.trim(); if (!k) return setErr('Pega la clave.');
    setOcupado(true); const r = await waGuardarClave(k, loc.trim()); setOcupado(false);
    if (r.error) setErr(r.error); else { setClave(''); setErr(''); aviso(r); }
  };
  const revisar = async () => { setOcupado(true); aviso(await waRevisar()); setOcupado(false); };

  return (
    <div className="pv-cols wa">
      <div className="im-box">
        <h3><Icono nombre="whatsapp" tam={16} /> Atención por WhatsApp</h3>
        <p className="muted small">Los propietarios escriben al WhatsApp de wechatia (el mismo de las visitas). El asistente reconoce su celular (o pide el RUT), pide la falla, el recinto y fotos, y crea el reclamo con su garantía. Las conversaciones que no son de postventa quedan para tu equipo comercial.</p>
        <div className="pv-key">
          <b>Clave de WhatsApp</b> <small className="muted">(integración privada «PortalFirma Asset - Postventa»)</small>
          {c.propia ? <p className="pv-ok"><Icono nombre="check" tam={13} /> Clave propia de postventa guardada (cifrada)</p>
            : c.conectado ? <p className="muted small">Ahora usa la clave del calendario. Es mejor una clave propia para postventa.</p>
              : <p className="muted small">Sin conectar.</p>}
          <span className="ga-inl">
            <input id="pvKey" type="password" autoComplete="off" spellCheck={false} value={clave} onChange={(e) => setClave(e.target.value)}
              placeholder={c.propia ? 'Pega una clave nueva para cambiarla' : 'Pega la clave (pit-…)'} />
            <button className="primary small" id="pvKeyOk" disabled={ocupado} onClick={guardar}>Guardar</button>
            {c.propia && <button className="ghost small" id="pvKeyDel" onClick={async () => aviso(await waQuitarClave())}>Quitar</button>}
          </span>
          <label className="pv-loc"><span>Cuenta de wechatia (location)</span>
            <input id="pvLoc" value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="Está en la dirección: …/location/XXXX/…" spellCheck={false} />
          </label>
          <p className="error" id="pvKeyErr">{err}</p>
        </div>
        <label className="pv-sw">
          <input type="checkbox" id="pvAuto" checked={c.auto} disabled={!c.conectado} onChange={async (e) => aviso(await waSetAuto(e.target.checked))} />
          <span><b>Respuesta automática</b><small>Revisa cada pocos segundos (cada 4 s mientras alguien conversa) y responde. Funciona mientras Asset esté abierto.</small></span>
        </label>
        <p className="muted small">{c.ultimaRevision ? 'Última revisión: ' + new Date(c.ultimaRevision).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : ''}</p>
        <button className="secondary small" id="pvRev" disabled={!c.conectado || ocupado} onClick={revisar}><Icono nombre="rotateR" tam={13} /> Revisar ahora</button>
        <h4 className="pv-sub">Permisos de la integración</h4>
        <p className="muted small"><b>Ver conversaciones</b>, <b>ver mensajes de conversaciones</b>, <b>editar mensajes de conversaciones</b> (permite enviar) y <b>ver contactos</b>. Se crea en wechatia › Configuración › Integraciones Privado.</p>
      </div>
      <div className="im-box">
        <h4 className="pv-sub" style={{ marginTop: 0 }}>Conversaciones <i className="muted">({chats.length})</i></h4>
        {chats.length ? chats.slice(0, 20).map((x) => (
          <button key={x.id} className={`pv-ch ${verChat === x.id ? 'on' : ''}`} data-ch={x.id} onClick={() => setVerChat(x.id)}>
            <b>{x.nombre || x.telefono || 'Contacto'}</b>
            <small>{x.telefono || ''} · {x.pasoTxt}{x.reclamo ? ' · ' + x.reclamo.folio : ''} · {hora(x.actualizado)}</small>
          </button>
        )) : <p className="muted small">Todavía no hay conversaciones de postventa.</p>}
        <div id="pvChVer">{ch && <Burbujas mensajes={ch.mensajes} />}</div>
      </div>
    </div>
  );
}
