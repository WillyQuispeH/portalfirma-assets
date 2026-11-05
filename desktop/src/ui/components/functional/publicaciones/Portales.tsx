// Pestaña «Portales»: el contacto de los avisos y la conexión con cada portal (API, feed o acuerdo comercial).
// Los id pbCt y data-po los usa test/publicaciones-e2e.js.
import { useState } from 'react';
import Icono from '../../ui/Icono';
import { abrirUrl, conectarPortalInmobiliario, editarContactoAvisos, toast } from '../../../utils/app';
import { usePublicacion } from '../../../store/hooks/usePublicacion.hook';
import { VIA } from './comun';
import type { IContactoAvisos, IPortal } from '../../../store/interfaces/publicacion.interface';

const aviso = (r: { mensaje?: string; error?: string }) => { if (r.error) toast(r.error, 5000); else if (r.mensaje) toast(r.mensaje, 5000); };

// pide la integración al portal: por correo si lo tiene; si no, copia el mensaje y abre su sitio
function solicitar(x: IPortal, c: IContactoAvisos) {
  const url = x.feedUrl || '(dirección del feed que publica Portalfirma)';
  const cuerpo = `Hola, equipo de ${x.nombre}:\n\nSomos ${c.nombre || '[corredora]'} y administramos nuestra cartera con PortalFirma Asset. Queremos sincronizar nuestras propiedades con ${x.nombre}.\n\nFeed (XML, formato de Chilepropiedades, por HTTPS): ${url}\nContacto: ${[c.email, c.telefono || c.whatsapp].filter(Boolean).join(' · ')}\n\n${x.id === 'chilepropiedades' ? 'Además, les pedimos el TOKEN de la API de feedback de integraciones (mensajes, estadísticas y estado de publicaciones).\n\n' : ''}Quedamos atentos. Saludos.`;
  if (x.correo) return abrirUrl(`mailto:${x.correo}?subject=${encodeURIComponent('Integración de cartera con PortalFirma Asset')}&body=${encodeURIComponent(cuerpo)}`);
  navigator.clipboard.writeText(cuerpo).catch(() => {});
  abrirUrl(x.id === 'toctoc' ? 'https://www.toctoc.com/empresas' : 'https://www.yapo.cl');
  toast(`Copié el mensaje para ${x.nombre}; pégalo en su formulario de contacto comercial.`, 6000);
}

function Portal({ x, feed, contacto }: { x: IPortal; feed: number; contacto: IContactoAvisos }) {
  const { portalGuardar, portalExportarFeed } = usePublicacion();
  const [activo, setActivo] = useState(x.listo);
  const [token, setToken] = useState('');
  const [feedUrl, setFeedUrl] = useState(x.feedUrl || '');

  return (
    <article className={`pb-po ${x.listo ? 'on' : ''}`} data-po={x.id}>
      <header><b>{x.nombre}</b><i className="pb-via">{VIA[x.via]}</i></header>
      <p className={`pb-poe ${x.listo ? 'ok' : ''}`}><Icono nombre={x.listo ? 'check' : 'alert'} tam={13} /> {x.estado}</p>
      <p className="muted small">{x.detalle}</p>
      {x.id === 'pi' ? (
        <div className="pb-poa"><button className={`${x.listo ? 'secondary' : 'primary'} small`} data-pi onClick={conectarPortalInmobiliario}>{x.listo ? 'Configurar' : 'Conectar la cuenta'}</button></div>
      ) : (
        <>
          <p className="small">{feed} {feed === 1 ? 'aviso' : 'avisos'} en el feed.</p>
          <label className="pb-tg"><input type="checkbox" data-act checked={activo} onChange={(e) => setActivo(e.target.checked)} /> {x.via === 'feed' ? 'Integración activada por el portal' : 'Acuerdo comercial activo'}</label>
          {x.id === 'chilepropiedades' && (
            <label className="small">TOKEN de seguimiento <span className="muted">(lo entrega el portal; trae estado, visitas e interesados)</span>
              <input data-token type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder={x.token ? '••••••• (guardado)' : 'Pega aquí el TOKEN'} />
            </label>
          )}
          <label className="small">Dirección pública del feed <span className="muted">(la publica Portalfirma)</span>
            <input data-url value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)} placeholder="https://…/feed.xml" />
          </label>
          <div className="pb-poa">
            <button className="secondary small" data-exp onClick={async () => aviso(await portalExportarFeed(x.id))}><Icono nombre="download" tam={13} /> Exportar feed</button>
            <button className="secondary small" data-sol onClick={() => solicitar(x, contacto)}><Icono nombre="mail" tam={13} /> Solicitar integración</button>
            <button className="primary small" data-save onClick={async () => { const r = await portalGuardar(x.id, x.nombre, { activo, feedUrl, ...(token.trim() ? { token: token.trim() } : {}) }); if (!r.error) setToken(''); aviso(r); }}>Guardar</button>
          </div>
        </>
      )}
    </article>
  );
}

export default function Portales() {
  const { portales } = usePublicacion();
  if (!portales) return <div className="ga-load"><span className="spinner sm" />Cargando…</div>;
  const c = portales.contacto;
  return (
    <>
      <div className="pb-ct">
        <Icono nombre="phone" tam={16} />
        <span><b>Contacto de los avisos:</b> {[c.nombre, c.email, c.whatsapp ? 'WhatsApp ' + c.whatsapp : 'sin WhatsApp'].filter(Boolean).join(' · ') || 'sin configurar'}</span>
        <button className="secondary small" id="pbCt" onClick={() => editarContactoAvisos(c)}>Editar</button>
      </div>
      <div className="pb-portales">
        {portales.catalogo.map((x) => <Portal key={x.id} x={x} feed={portales.feeds[x.id] ?? 0} contacto={c} />)}
      </div>
      <p className="muted small">Chilepropiedades lee el feed una vez al día y su integración es gratis si la aprueban. TOCTOC y Yapo publican con acuerdo comercial; Asset les entrega el mismo feed.</p>
    </>
  );
}
