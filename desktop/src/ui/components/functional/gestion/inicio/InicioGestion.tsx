// Inicio de Gestión documental: lo esencial, herramientas de PDF, abrir arrastrando, la Notaría, los recientes
// y las plantillas, más lo que ahorra tiempo y lo avanzado. Se dibuja en #homeBody.
//
// Cada botón llama a homeAction() de src/renderer/home.js (accionGestion). La biblioteca de plantillas
// (#tplLibHost) es BibliotecaPlantillas, del editor PDF.
// Las pruebas usan .hub-card, [data-act], #hubAgQ, #hubDrop, #recAll y .recent-item[data-path].
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Icono from '../../../ui/Icono';
import { useReciente } from '../../../../store/hooks/useReciente.hook';
import BibliotecaPlantillas from '../editor-pdf/BibliotecaPlantillas';
import { abrirAyudaNivel, abrirDrive, abrirReciente, accionGestion, abrirRecientes, enviarAlAgenteDesdeGestion } from '../../../../utils/app';
import { IconoArchivo, carpetaDe, fechaCorta, tamano } from '../comun/archivos';
import { ACCION, DE_MIEMBROS, HERRAMIENTAS_PDF, NIVELES, NUEVAS, marcarVisto, visto } from './acciones';

const RECIENTES = 3;
// la ilustración del documento (fija, propia de la app)
const DOC = `<svg class="hub-doc" viewBox="0 0 120 140" aria-hidden="true"><defs><linearGradient id="hdg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dfe6f3"/></linearGradient><linearGradient id="hdf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eef2fa"/><stop offset="1" stop-color="#c9d3e6"/></linearGradient><filter id="hds" x="-30%" y="-20%" width="160%" height="150%"><feDropShadow dx="0" dy="8" stdDeviation="7" flood-color="#3a4a78" flood-opacity=".22"/></filter></defs>
  <g filter="url(#hds)"><path d="M18 10h58l26 26v88a8 8 0 0 1-8 8H18a8 8 0 0 1-8-8V18a8 8 0 0 1 8-8z" fill="url(#hdg)" stroke="#c4cee2"/><path d="M76 10v20a6 6 0 0 0 6 6h20z" fill="url(#hdf)" stroke="#c4cee2"/></g>
  <g stroke="#4a5d86" stroke-width="5" stroke-linecap="round"><path d="M30 64h52M30 78h60M30 92h60M30 106h40"/></g></svg>`;

const Candado = () => <span className="lock-badge" title="Exclusivo para clientes de Portalfirma"><Icono nombre="lock" tam={12} /></span>;

export default function InicioGestion() {
  const { lista, recientesGetAll } = useReciente();
  const [, setVistos] = useState(0); // para quitar «Nuevo» al abrir
  const pregunta = useRef<HTMLInputElement>(null);

  useEffect(() => {
    recientesGetAll();
    const recargar = () => recientesGetAll();
    window.addEventListener('pf:recientes', recargar); // home.js avisa cuando cambia la lista (pf.onRecentChanged)
    return () => window.removeEventListener('pf:recientes', recargar);
  }, [recientesGetAll]);

  const hacer = (k: string) => { if (NUEVAS.has(k) && !visto(k)) { marcarVisto(k); setVistos((n) => n + 1); } accionGestion(k); };
  const Nuevo = ({ k }: { k: string }) => (NUEVAS.has(k) && !visto(k) ? <span className="new-badge">Nuevo</span> : null);
  const Tarjeta = ({ k, grande = false }: { k: string; grande?: boolean }) => {
    const [, ic, t, d, cls] = ACCION[k]; const m = DE_MIEMBROS.has(k);
    return (
      <button className={`hub-card ${grande ? 'big' : ''} ${cls || ''}`} data-act={k} {...(m ? { 'data-member': '' } : {})} title={`${d}${m ? ' · Exclusivo para clientes de Portalfirma' : ''}`} onClick={() => hacer(k)}>
        <span className="ic"><Icono nombre={ic} tam={grande ? 30 : 24} /></span><strong>{t}</strong>{grande && <small className="hc-d">{d}</small>}{m && <Candado />}
      </button>
    );
  };
  const Fila = ({ k }: { k: string }) => {
    const [, ic, t, d, cls] = ACCION[k]; const m = DE_MIEMBROS.has(k);
    return (
      <button className={`hub-card hub-row ${cls || ''}`} data-act={k} {...(m ? { 'data-member': '' } : {})} title={m ? 'Exclusivo para clientes de Portalfirma' : t} onClick={() => hacer(k)}>
        <span className="ic"><Icono nombre={ic} tam={20} /></span><span className="hr-t"><strong>{t}<Nuevo k={k} /></strong><small>{d}</small></span>{m && <Candado />}
      </button>
    );
  };
  const Nivel = ({ i }: { i: number }) => (
    <div className="lvl-h">
      <div><h3>{NIVELES[i].titulo}</h3><small>{NIVELES[i].sub}</small></div>
      <button className="ghost small lvl-help" data-help={NIVELES[i].clave} title="Ver guías de este nivel" onClick={() => abrirAyudaNivel(NIVELES[i].clave)}><Icono nombre="help" tam={15} /></button>
    </div>
  );
  const preguntar = (e: FormEvent) => { e.preventDefault(); enviarAlAgenteDesdeGestion(pregunta.current?.value.trim() || ''); };

  return (
    <>
      <div className="hub-title">
        <h1>Gestión documental</h1>
        <p>Crea, edita y prepara tus documentos, y envíalos a firmar con Portalfirma.</p>
        <form className="hub-agent" id="hubAg" onSubmit={preguntar}>
          <span className="ha-ic"><Icono nombre="sparkle" tam={16} /></span>
          <input id="hubAgQ" ref={pregunta} placeholder="Pídele al Agente Portalfirma: «¿quién falta por firmar en la operación 4424?»" autoComplete="off" />
          <button className="primary small" type="submit">Preguntar</button>
        </form>
      </div>
      <div className="hub">
        <div className="hub-col">
          <Nivel i={0} />
          <div className="hub-grid top">{NIVELES[0].grandes.map((k) => <Tarjeta key={k} k={k} grande />)}</div>
          <div className="hub-grid" style={{ marginTop: 12 }}>{NIVELES[0].chicas.map((k) => <Tarjeta key={k} k={k} />)}</div>
          <h3 className="hub-h">Herramientas de PDF</h3>
          <div className="tool-chips">
            {HERRAMIENTAS_PDF.map((k) => { const [, ic, t, d] = ACCION[k]; return <button key={k} className="tool-chip" data-act={k} title={d} onClick={() => hacer(k)}><Icono nombre={ic} tam={16} /><span>{t}</span></button>; })}
          </div>
        </div>
        <div className="hub-center">
          <div className="hub-panel hub-drop-panel">
            <div className="hub-drop" id="hubDrop" role="button" tabIndex={0} title="Abrir PDF"
              onClick={(e) => { if ((e.target as HTMLElement).closest('#hubDrive')) return abrirDrive(); hacer('open'); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hacer('open'); } }}>
              <span dangerouslySetInnerHTML={{ __html: DOC }} style={{ display: 'contents' }} />
              <span className="hd-tx">
                <strong>Arrastra archivos a esta ventana para abrirlos</strong>
                <span>PDF, Word, Excel o imágenes · o haz clic para elegir</span>
                <button className="ghost small with-ic hub-drive" id="hubDrive"><Icono nombre="drive" tam={15} /><span>o tráelos desde Google Drive</span></button>
              </span>
            </div>
            <div className="hub-btns">
              <button className="secondary" data-act="new" onClick={() => hacer('new')}>Crear PDF</button>
              <button className="primary" data-act="send" data-member="" onClick={() => hacer('send')}>Enviar a firmar<Candado /></button>
              <button className="secondary" data-act="tpls" onClick={() => hacer('tpls')}>Plantillas con campos</button>
            </div>
          </div>
          <div className="hub-panel hub-not">
            <div className="hn-h"><span className="hn-ic"><Icono nombre="notary" tam={20} /></span><div><h3>Notaría</h3><small>Firmas ante notario y documentos notariales, sin filas</small></div></div>
            <div className="hn-grid">
              <button className="hn-card main" data-act="escr" onClick={() => hacer('escr')}>
                <span className="hn-cic"><Icono nombre="users" tam={26} /></span>
                <span className="hn-tx"><strong>{ACCION.escr[2]}<Nuevo k="escr" /></strong><small>{ACCION.escr[3]}</small></span>
                <span className="hn-go">Comenzar <Icono nombre="arrowR" tam={15} /></span>
              </button>
              <button className="hn-card" data-act="tpl" data-member="" onClick={() => hacer('tpl')}>
                <span className="hn-cic alt"><Icono nombre="notary" tam={22} /></span>
                <span className="hn-tx"><strong>Notaría virtual</strong><small>{ACCION.tpl[3]}</small></span><Candado />
                <span className="hn-go">Abrir <Icono nombre="arrowR" tam={15} /></span>
              </button>
            </div>
          </div>
          <div className="hub-panel">
            <div className="recent-head">
              <h3><Icono nombre="clock" tam={17} /> Recientes</h3>
              {lista.length > RECIENTES && <button className="ghost small with-ic" id="recAll" onClick={abrirRecientes}><span>Ver todos ({lista.length})</span><Icono nombre="arrowR" tam={14} /></button>}
            </div>
            <div className="recent-list">
              {lista.length ? lista.slice(0, RECIENTES).map((x) => (
                <div key={x.path} className="recent-item" data-path={x.path} title={x.path} onClick={() => abrirReciente(x.path)}>
                  <IconoArchivo nombre={x.name} />
                  <span className="rc-tx"><div className="nm">{x.name}</div><div className="pt">{carpetaDe(x.path)}{!x.exists && <> · <b className="tw:text-err tw:font-semibold">no encontrado</b></>}</div></span>
                  <span className="muted small">{tamano(x.size)}</span><span className="muted small">{fechaCorta(x.date)}</span>
                </div>
              )) : <div className="recent-empty">Aquí aparecerán los documentos que abras o guardes.</div>}
            </div>
          </div>
          <div className="hub-panel" id="tplLibHost"><BibliotecaPlantillas /></div>
        </div>
        <div className="hub-col">
          <Nivel i={1} />
          <div className="hub-rows">{NIVELES[1].filas.map((k) => <Fila key={k} k={k} />)}</div>
          <Nivel i={2} />
          <div className="hub-rows">{NIVELES[2].filas.map((k) => <Fila key={k} k={k} />)}</div>
        </div>
      </div>
    </>
  );
}
