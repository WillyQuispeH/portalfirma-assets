// El chat del Agente: conversaciones guardadas (izquierda), la conversación con su caja de texto, y el lienzo.
// Se dibuja dentro de #agDrawer (lo crea controlador.tsx). Los id ag* y las clases ag-* los usan las demás
// pantallas y las pruebas. Contenedores que llena src/renderer y React deja vacíos: #agCanvas (lienzo.js) y
// #agMic (el micrófono de dictado.js).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Icono from '../../ui/Icono';
import { useAgente } from '../../../store/hooks/useAgente.hook';
import { abrirAgenteWhatsApp, adjuntarAlAgente, claveIA, verActividadAgente, verHerramientasAgente } from '../../../utils/app';
import { RAPIDAS, ajustarCaja, enviar, listarConvs, nueva, ocupado, quitarAdjunto } from './controlador';
import Conversaciones from './Conversaciones';
import Mensaje from './Mensaje';

export default function Agente() {
  const { items, adjuntos, busy, nombre } = useAgente();
  const [menu, setMenu] = useState<'rapidas' | 'mas' | null>(null);
  const cuerpo = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLTextAreaElement>(null);
  const vacio = !items.length;

  // la conversación siempre termina a la vista; y #agDrawer marca si está vacía
  useLayoutEffect(() => {
    const b = cuerpo.current; if (b) b.scrollTop = b.scrollHeight;
    document.getElementById('agDrawer')?.classList.toggle('vacio', vacio);
  }, [items, vacio]);
  // la caja crece con el texto; también cuando otra pantalla escribe en ella y llama a q.oninput()
  useEffect(() => { if (caja.current) caja.current.oninput = ajustarCaja; }, []);
  // los menús se cierran al tocar fuera
  useEffect(() => {
    const cerrar = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('#agQuick, #agMas, #agMm, #agMore')) setMenu(null); };
    document.addEventListener('click', cerrar); return () => document.removeEventListener('click', cerrar);
  }, []);
  useEffect(() => { listarConvs(); }, []);

  const alternar = (m: 'rapidas' | 'mas') => (e: React.MouseEvent) => { e.stopPropagation(); setMenu((x) => (x === m ? null : m)); };

  return (
    <>
      <div className="ag-side" id="agSide"><Conversaciones /></div>
      <div className="ag-main">
        <div className="ag-head">
          <span className="ag-logo"><Icono nombre="sparkle" tam={16} /></span>
          <div className="ag-t"><b>Agente Asset</b><small id="agSub">Propiedades, negocios, agenda y firmas</small></div>
          <button className="ibtn ag-wab" id="agWa" title="Agente por WhatsApp" onClick={abrirAgenteWhatsApp}><Icono nombre="whatsapp" tam={15} /></button>
          <span className="ag-mmw">
            <button className="ibtn" id="agMore" title="Más opciones" aria-haspopup="true" aria-expanded={menu === 'mas'} onClick={alternar('mas')}>···</button>
            <span className={`ag-mm${menu === 'mas' ? '' : ' hidden'}`} id="agMm" onClick={() => setMenu(null)}>
              <button id="agReset" onClick={nueva}><Icono nombre="plus" tam={14} /> Nueva conversación</button>
              <button id="agTools" onClick={verHerramientasAgente}><Icono nombre="grid" tam={14} /> Lo que puede hacer el Agente</button>
              <button id="agLog" onClick={verActividadAgente}><Icono nombre="listCheck" tam={14} /> Actividad</button>
              <button id="agIA" onClick={claveIA}><Icono nombre="lock" tam={14} /> Clave de IA</button>
            </span>
          </span>
          <button className="ibtn ag-only-panel" id="agFull" title="Abrir en pantalla completa" onClick={() => window.Agente.vista?.()}><Icono nombre="maximize" tam={15} /></button>
          <button className="ibtn ag-only-panel" id="agClose" title="Cerrar" onClick={() => window.Agente.close?.()}><Icono nombre="x" tam={15} /></button>
        </div>

        <div className="ag-body" id="agBody" ref={cuerpo}>
          {vacio ? (
            <div className="ag-empty">
              <span className="ag-big"><Icono nombre="sparkle" tam={26} /></span>
              <h1 className="ag-hola">{nombre ? `Hola, ${nombre}` : 'Hola'}</h1>
              <p>Pídemelo en tus palabras o con un audio.</p>
            </div>
          ) : items.map((m, i) => <Mensaje key={m.k === 'card' ? `c${m.id}` : i} m={m} i={i} />)}
        </div>

        <div className="ag-foot">
          <div className={`ag-quick${menu === 'rapidas' ? '' : ' hidden'}`} id="agQuick" role="menu">
            {RAPIDAS.map(([id, ic, t, fn]) => (
              <button key={id} data-rapida={id} role="menuitem" onClick={() => { setMenu(null); if (!ocupado()) fn(); }}><Icono nombre={ic} tam={14} /><span>{t}</span></button>
            ))}
          </div>
          <div className="ag-box">
            <div className="ag-att" id="agAtt">
              {adjuntos.map((a) => (
                <span key={a.name} className="ag-chip"><Icono nombre="file" tam={12} /> {a.name}{a.subido && <> <i>subido</i></>}
                  <button data-rm={a.name} title="Quitar" onClick={() => quitarAdjunto(a.name)}><Icono nombre="x" tam={11} /></button></span>
              ))}
            </div>
            <textarea id="agQ" ref={caja} rows={1} placeholder="Pídele algo al Agente…" disabled={busy}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }} />
            <div className="ag-boxb">
              <button className="ag-ib" id="agClip" title="Adjuntar PDF o Word" onClick={adjuntarAlAgente}><Icono nombre="plus" tam={17} /></button>
              <button className="ag-ib ag-ibt" id="agMas" title="Acciones" aria-haspopup="true" aria-expanded={menu === 'rapidas'} onClick={alternar('rapidas')}><Icono nombre="flow" tam={15} /><span>Acciones</span></button>
              <span className="spacer" />
              <small className="ag-hint">Enter envía · Mayús+Enter salto</small>
              <span id="agMic" />{/* lo llena src/renderer/dictado.js */}
              <button className="ag-send" id="agSend" title="Enviar" disabled={busy} onClick={() => enviar()}><Icono nombre="arrowR" tam={17} /></button>
            </div>
          </div>
          <small className="ag-note"><Icono nombre="lock" tam={11} /> Lo que cobra o envía te pide confirmación. Las claves van directo a Portalfirma.</small>
        </div>
      </div>
      <aside className="ag-canvas" id="agCanvas" />{/* lo llena src/renderer/lienzo.js */}
    </>
  );
}
