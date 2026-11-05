// Notaría virtual: el catálogo de trámites de Portalfirma (por categoría o búsqueda) y el formulario del trámite
// elegido. Portalfirma genera el documento con esos datos y lo envía a firmar.
//
// Sigue en src/renderer/templates.js (por utils/app.ts) la confirmación del envío: muestra el saldo, envía y abre
// la pantalla «Enviado» de app.js. Los id tpl* y las clases tpl-* los usan las pruebas y los estilos.
import { useEffect, useRef, useState } from 'react';
import Icono from '../../../ui/Icono';
import { useNotaria } from '../../../../store/hooks/useNotaria.hook';
import { abrirUrl, toast } from '../../../../utils/app';
import { confirmarEnvio as confirmarEnvioNotaria } from './controlador';
import { CATEGORIAS, ESTADO_CIVIL, bonito, errorCampo, esTextoLargo, lineasFirmantes, ordenarValor, valoresParaEnviar, variables } from '../../../../utils/notaria';
import type { IVariable } from '../../../../store/interfaces/notaria.interface';

function Catalogo() {
  const { cargado, categoria, consulta, buscando, errorCatalogo, resultados, notariaBuscar, notariaAbrir } = useNotaria();
  const [q, setQ] = useState(consulta);
  useEffect(() => { if (!cargado) notariaBuscar(categoria || CATEGORIAS[0], categoria || CATEGORIAS[0]); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- al montar
  const buscar = () => { const t = q.trim(); if (t.length >= 2) notariaBuscar(t, null); };
  const abrir = async (id: string) => { const err = await notariaAbrir(id); if (err) toast('No se pudo abrir la plantilla: ' + err, 5000); };
  return <>
    <div className="tpl-head">
      <div><h2>Notaría virtual</h2><p className="muted">Elige un trámite, completa los datos y envíalo a firmar.</p></div>
      <div className="row tpl-search">
        <input type="search" id="tplQuery" placeholder="Buscar trámite (ej. poder para retirar auto, declaración de domicilio…)" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') buscar(); }} />
        <button className="secondary" id="tplGo" onClick={buscar}>Buscar</button>
      </div>
    </div>
    <div className="chips tpl-cats" id="tplCats">
      {CATEGORIAS.map((c) => <button key={c} className={`chip ${c === categoria ? 'active' : ''}`} data-cat={c} onClick={() => { setQ(''); notariaBuscar(c, c); }}>{c}</button>)}
    </div>
    <div id="tplResults" className="tpl-grid">
      {buscando ? <p className="muted">Buscando trámites…</p>
        : errorCatalogo ? <p className="error">No se pudo cargar el catálogo: {errorCatalogo}</p>
        : !resultados.length ? <p className="muted">No se encontraron trámites. Prueba con otras palabras.</p>
        : resultados.map((t) => (
          <div key={t.template_version_id} className="card tpl-card">
            <span className="pill">Plantilla</span>
            <h3>{t.name}</h3>
            <p className="muted small">{t.description || 'Sin descripción'}</p>
            <div className="actions"><button className="primary small" data-use={t.template_version_id} onClick={() => abrir(t.template_version_id)}>Usar plantilla</button></div>
          </div>
        ))}
    </div>
  </>;
}

function Campo({ v, valor, error, alCambiar }: { v: IVariable; valor: string; error: string; alCambiar: (x: string) => void }) {
  const p = { 'data-f': v.id, className: error ? 'invalid' : '', value: valor, onChange: (e: { target: { value: string } }) => alCambiar(e.target.value) };
  let control;
  switch (v.input_type) {
    case 'date': control = <input type="date" {...p} />; break;
    case 'email': control = <input type="email" {...p} placeholder="nombre@correo.cl" />; break;
    case 'phone': control = <input type="tel" {...p} placeholder="+56 9 1234 5678" />; break;
    case 'rut': control = <input type="text" {...p} placeholder="12.345.678-9" />; break;
    case 'select': control = <>
      <input type="text" list={`dl-${v.id}`} {...p} placeholder="Elige o escribe" />
      <datalist id={`dl-${v.id}`}>{(/civil/i.test(v.id) ? ESTADO_CIVIL : []).map((o) => <option key={o} value={o} />)}</datalist>
    </>; break;
    default: control = esTextoLargo(v) ? <textarea rows={3} {...p} /> : <input type="text" {...p} />;
  }
  return <label>{bonito(v.label || v.name)}{v.required ? ' *' : ''}{control}{error && <span className="missing">{error}</span>}</label>;
}

function Formulario() {
  const { actual: f, valores, tocado, notariaVolver, notariaValor, notariaTocar, notariaReiniciar } = useNotaria();
  const [error, setError] = useState('');
  const grupos = useRef<HTMLDivElement>(null);
  // Al salir de un campo (evento «change» del navegador): el RUT con puntos y el teléfono con su código
  useEffect(() => {
    const host = grupos.current; if (!host || !f) return;
    const alCambiar = (e: Event) => {
      const el = e.target as HTMLInputElement; const id = el.dataset.f; if (!id) return;
      const v = variables(f).find((x) => x.id === id); const orden = ordenarValor(v, el.value);
      if (orden !== el.value) notariaValor(id, orden);
    };
    host.addEventListener('change', alCambiar); return () => host.removeEventListener('change', alCambiar);
  }, [f, notariaValor]);
  if (!f) return null;
  const firmantes = (f.groups || []).filter((g) => g.type === 'signer');
  const enviar = () => {
    notariaTocar();
    const mala = variables(f).find((v) => errorCampo(v, valores[v.id]));
    if (mala) {
      setError(`Revisa los campos marcados (${bonito(mala.label || mala.name)}).`);
      setTimeout(() => document.querySelector('#view-tpl input.invalid, #view-tpl textarea.invalid')?.scrollIntoView({ block: 'center' }), 0);
      return;
    }
    setError('');
    confirmarEnvioNotaria(
      { id: f.template_version_id, nombre: f.name, valores: valoresParaEnviar(f, valores), firmantes: lineasFirmantes(f, valoresParaEnviar(f, valores)) },
      { alError: (msg: string) => setError('Portalfirma rechazó el envío: ' + msg), alEnviar: notariaReiniciar },
    );
  };
  return <>
    <div className="review-head">
      <div>
        <button className="ghost small" id="tplBack" onClick={notariaVolver}><Icono nombre="chevL" tam={15} /> Volver al catálogo</button>
        <h2>{f.name}</h2><p className="muted">{f.description || ''}</p>
        {firmantes.length > 0 && <p className="small">Firman: <strong>{firmantes.map((g) => bonito(g.group)).join(', ')}</strong>. Recibirán su enlace de firma al correo indicado.</p>}
        {f.requires_property && <p className="notice small">Este trámite usa datos de una propiedad: complétalos en la sección correspondiente.</p>}
      </div>
      {f.url && <button className="ghost small" id="tplWeb" onClick={() => abrirUrl(f.url!)}>Ver en la web</button>}
    </div>
    <div id="tplGroups" ref={grupos}>
      {(f.groups || []).map((g, i) => (
        <div key={i} className="card">
          <div className="row-between"><h3>{bonito(g.group)}</h3>{g.type === 'signer' && <span className="pill ok">Firma</span>}</div>
          <div className="tw:grid tw:grid-cols-3 tw:gap-x-3 tw:gap-y-0 tw:max-[820px]:grid-cols-2">{(g.variables || []).map((v) => <Campo key={v.id} v={v} valor={valores[v.id] ?? ''} error={tocado ? errorCampo(v, valores[v.id]) : ''} alCambiar={(x) => notariaValor(v.id, x)} />)}</div>
        </div>
      ))}
    </div>
    <div className="actions"><span id="tplError" className="error">{error}</span><button className="primary" id="tplSend" onClick={enviar}>Generar y enviar a firmar</button></div>
  </>;
}

export default function NotariaVirtual() {
  const { actual, abriendo } = useNotaria();
  if (abriendo) return <div className="card"><p className="muted">Cargando formulario…</p></div>;
  return actual ? <Formulario /> : <Catalogo />;
}
