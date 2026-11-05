// Pestaña «WhatsApp» de Postventa: la clave de la integración con wechatia, la respuesta automática y las
// conversaciones. Los id pvKey, pvKeyOk, pvLoc, pvAuto, pvRev, pvKeyErr, data-ch y las clases pv-key y pv-ch los usa
// test/postventa-e2e.js. Con el kit: Card, Input y Boton («Respuesta automática» sigue como casilla: la prueba la marca con check).
import { useState } from 'react';
import Icono from '../../ui/Icono';
import Card from '../../ui/Card';
import Input from '../../ui/Input';
import Boton from '../../ui/Boton';
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
      <Card titulo={<span className="tw:inline-flex tw:items-center tw:gap-2"><Icono nombre="whatsapp" tam={16} /> Atención por WhatsApp</span>}>
        <p className="tw:m-0 tw:text-[13px] tw:text-muted tw:leading-relaxed">Los propietarios escriben al WhatsApp de wechatia (el mismo de las visitas). El asistente reconoce su celular (o pide el RUT), pide la falla, el recinto y fotos, y crea el reclamo con su garantía. Las conversaciones que no son de postventa quedan para tu equipo comercial.</p>
        <div className="pv-key">
          <b>Clave de WhatsApp</b> <small className="muted">(integración privada «PortalFirma Asset - Postventa»)</small>
          {c.propia ? <p className="pv-ok"><Icono nombre="check" tam={13} /> Clave propia de postventa guardada (cifrada)</p>
            : c.conectado ? <p className="muted small">Ahora usa la clave del calendario. Es mejor una clave propia para postventa.</p>
              : <p className="muted small">Sin conectar.</p>}
          <span className="tw:flex tw:items-center tw:gap-2">
            <Input id="pvKey" type="password" autoComplete="off" spellCheck={false} value={clave} onChange={(e) => setClave(e.target.value)}
              clasesCampo="tw:flex-1 tw:min-w-0" aria-label="Clave de WhatsApp"
              placeholder={c.propia ? 'Pega una clave nueva para cambiarla' : 'Pega la clave (pit-…)'} />
            <Boton id="pvKeyOk" cargando={ocupado} onClick={guardar}>Guardar</Boton>
            {c.propia && <Boton variante="fantasma" id="pvKeyDel" onClick={async () => aviso(await waQuitarClave())}>Quitar</Boton>}
          </span>
          <Input id="pvLoc" etiqueta="Cuenta de wechatia (location)" value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="Está en la dirección: …/location/XXXX/…" spellCheck={false} />
          <p className="error" id="pvKeyErr">{err}</p>
        </div>
        <label className="pv-sw">
          <input type="checkbox" id="pvAuto" checked={c.auto} disabled={!c.conectado} onChange={async (e) => aviso(await waSetAuto(e.target.checked))} />
          <span><b>Respuesta automática</b><small>Revisa cada pocos segundos (cada 4 s mientras alguien conversa) y responde. Funciona mientras Asset esté abierto.</small></span>
        </label>
        <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-3">
          <Boton variante="secundario" tamano="sm" icono="rotateR" id="pvRev" disabled={!c.conectado || ocupado} onClick={revisar}>Revisar ahora</Boton>
          <span className="tw:text-xs tw:text-muted">{c.ultimaRevision ? 'Última revisión: ' + new Date(c.ultimaRevision).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
        </div>
        <h4 className="pv-sub">Permisos de la integración</h4>
        <p className="tw:m-0 tw:text-[13px] tw:text-muted tw:leading-relaxed"><b>Ver conversaciones</b>, <b>ver mensajes de conversaciones</b>, <b>editar mensajes de conversaciones</b> (permite enviar) y <b>ver contactos</b>. Se crea en wechatia › Configuración › Integraciones Privado.</p>
      </Card>
      <Card titulo="Conversaciones" subtitulo={`${chats.length} de postventa`}>
        {chats.length ? chats.slice(0, 20).map((x) => (
          <button key={x.id} className={`pv-ch ${verChat === x.id ? 'on' : ''}`} data-ch={x.id} onClick={() => setVerChat(x.id)}>
            <b>{x.nombre || x.telefono || 'Contacto'}</b>
            <small>{x.telefono || ''} · {x.pasoTxt}{x.reclamo ? ' · ' + x.reclamo.folio : ''} · {hora(x.actualizado)}</small>
          </button>
        )) : <p className="tw:m-0 tw:text-[13px] tw:text-muted">Todavía no hay conversaciones de postventa.</p>}
        <div id="pvChVer">{ch && <Burbujas mensajes={ch.mensajes} />}</div>
      </Card>
    </div>
  );
}
