// Panel de ayuda (a la derecha): buscador de dudas, «Aprende panel por panel», el recorrido de la pantalla,
// las guías de la pantalla y por nivel, y el contacto con soporte.
// Los id (#helpPanel, #hpQ, #hpRes, #hpAprende, #hpTour, #hpAll, #hpWa, #hpX) los usan las pruebas.
import { Fragment, useEffect, useRef, useState } from 'react';
import Icono from '../../ui/Icono';
import { GUIAS, NIVELES_AYUDA, RECORRIDOS } from './guias';
import { abrirPanel, cerrarPanel, iniciarRecorrido } from './acciones';
import { abrirAprende } from '../aprende/controlador';
import { useAyuda } from '../../../store/hooks/useAyuda.hook';
import { buscarGuias } from '../../../utils/ayuda';
import { soporteWhatsApp } from '../../../utils/app';
import { cx } from '../../../utils/cx';
import type { IGuia, TNivelAyuda } from '../../../store/interfaces/ayuda.interface';

function Guia({ g, abierta = false }: { g: IGuia; abierta?: boolean }) {
  return (
    <details className="hg" open={abierta} data-g={g.id}>
      <summary>{g.title}</summary>
      <ol>{g.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
    </details>
  );
}

function Buscador() {
  const [q, setQ] = useState('');
  const [buscado, setBuscado] = useState('');
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => { const t = setTimeout(() => campo.current?.focus(), 50); return () => clearTimeout(t); }, []);
  useEffect(() => { const t = setTimeout(() => setBuscado(q), 180); return () => clearTimeout(t); }, [q]);
  const resultado = buscado.trim() ? buscarGuias(buscado, GUIAS) : [];
  return (
    <div className="hp-ask">
      <input id="hpQ" ref={campo} value={q} onChange={(e) => setQ(e.target.value)} placeholder="¿Qué quieres hacer? Ej.: mover un logo, enviar a firmar…" spellCheck={false} />
      <div id="hpRes">
        {!buscado.trim() ? null : resultado.length
          ? resultado.map((g, i) => <Guia key={buscado + '|' + g.id} g={g} abierta={i === 0} />)
          : <p className="muted small">No encontré una guía para eso. Prueba con otras palabras o escribe a soporte.</p>}
      </div>
      <p className="muted small">Busca en las guías. No usa IA ni gasta tokens.</p>
    </div>
  );
}

// El contenido se arma de nuevo cada vez que se abre el panel (key = apertura): el buscador parte vacío.
function Contenido({ vista, nivel }: { vista: string; nivel: TNivelAyuda | null }) {
  const aqui = GUIAS.filter((g) => g.screens.includes(vista));
  const niveles = (Object.entries(NIVELES_AYUDA) as [TNivelAyuda, string][]).filter(([k]) => !nivel || k === nivel);
  return (
    <div className="hp-body">
      <Buscador />
      <button className="primary small with-ic hp-tour" id="hpAprende" onClick={() => { cerrarPanel(); abrirAprende(); }}>
        <Icono nombre="compass" tam={15} /><span>Aprende panel por panel</span>
      </button>
      {RECORRIDOS[vista] && (
        <button className="secondary small with-ic hp-tour" id="hpTour" onClick={() => { cerrarPanel(); iniciarRecorrido(vista); }}>
          <Icono nombre="compass" tam={15} /><span>Ver el recorrido de esta pantalla</span>
        </button>
      )}
      {!nivel && aqui.length > 0 && <><h4>En esta pantalla</h4>{aqui.map((g) => <Guia key={g.id} g={g} />)}</>}
      {niveles.map(([k, nombre]) => (
        <Fragment key={k}>
          <h4>{nombre}</h4>
          {GUIAS.filter((g) => g.level === k && (nivel || !aqui.includes(g))).map((g) => <Guia key={g.id} g={g} />)}
        </Fragment>
      ))}
      {nivel && <button className="ghost small" id="hpAll" onClick={() => abrirPanel()}>Ver todas las guías</button>}
      <div className="hp-support">
        <b>¿No encuentras la respuesta?</b>
        <p className="muted small">Escríbenos y te ayudamos.</p>
        <button className="secondary small with-ic wa-btn" id="hpWa" onClick={() => soporteWhatsApp('Hola, necesito ayuda con PortalFirma Asset.')}>
          <Icono nombre="whatsapp" tam={15} /><span>Hablar con soporte</span>
        </button>
      </div>
    </div>
  );
}

export default function PanelAyuda() {
  const { panelAbierto, nivel, apertura, vista } = useAyuda();
  useEffect(() => { document.body.classList.toggle('help-open', panelAbierto); }, [panelAbierto]);
  if (!apertura) return null; // no se dibuja hasta que se abre por primera vez
  return (
    <aside id="helpPanel" className={cx('help-panel', panelAbierto && 'open')}>
      <div className="hp-head">
        <h3><Icono nombre="help" tam={18} /> Ayuda</h3>
        <button className="ibtn" id="hpX" title="Cerrar (Esc)" onClick={cerrarPanel}><Icono nombre="x" tam={16} /></button>
      </div>
      <Contenido key={apertura} vista={vista} nivel={nivel} />
    </aside>
  );
}
