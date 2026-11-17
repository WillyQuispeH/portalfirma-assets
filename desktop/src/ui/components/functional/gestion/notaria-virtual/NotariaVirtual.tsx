// Notaría virtual: el catálogo de trámites de Portalfirma (por categoría o búsqueda) y el formulario del trámite
// elegido. Portalfirma genera el documento con esos datos y lo envía a firmar.
//
// Sigue en src/renderer/templates.js (por utils/app.ts) la confirmación del envío: muestra el saldo, envía y abre
// la pantalla «Enviado» de app.js. Los id tpl* y las clases tpl-* los usan las pruebas y los estilos.
import { useEffect, useRef, useState } from 'react';
import { useNotaria } from '../../../../store/hooks/useNotaria.hook';
import { abrirUrl, toast } from '../../../../utils/app';
import { confirmarEnvio as confirmarEnvioNotaria } from './controlador';
import { CATEGORIAS, ESTADO_CIVIL, bonito, errorCampo, esTextoLargo, lineasFirmantes, ordenarValor, valoresParaEnviar, variables } from '../../../../utils/notaria';
import type { IVariable } from '../../../../store/interfaces/notaria.interface';

import Boton from '../../../ui/Boton';
import Input from '../../../ui/Input';
import Textarea from '../../../ui/Textarea';
import Layout from '../../../ui/Layout';
import Card from '../../../ui/Card';
import Badge from '../../../ui/Badge';
import { EsqueletoTexto, EsqueletoZona } from '../../../ui/Esqueleto';
function Catalogo() {
  const { cargado, categoria, consulta, buscando, errorCatalogo, resultados, notariaBuscar, notariaAbrir } = useNotaria();
  const [q, setQ] = useState(consulta);
  useEffect(() => { if (!cargado) notariaBuscar(categoria || CATEGORIAS[0], categoria || CATEGORIAS[0]); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- al montar
  const buscar = () => { const t = q.trim(); if (t.length >= 2) notariaBuscar(t, null); };
  const abrir = async (id: string) => { const err = await notariaAbrir(id); if (err) toast('No se pudo abrir la plantilla: ' + err, 5000); };
  return (
    <Layout titulo="Notaría virtual" ilustracion={{ imagen: 'img/formas/etapa.svg', tinte: '#6d5bd0' }} subtitulo="Elige un trámite, completa los datos y envíalo a firmar."
      barra={(
        <div className="tpl-search tw:flex tw:w-full tw:items-center tw:gap-ui">
          <Input type="search" id="tplQuery" icono="search" clasesCampo="tw:flex-1" placeholder="Buscar trámite (ej. poder para retirar auto, declaración de domicilio…)" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') buscar(); }} />
          <Boton variante="secundario" id="tplGo" onClick={buscar}>Buscar</Boton>
        </div>
      )}>
      <div className="chips tpl-cats" id="tplCats">
        {CATEGORIAS.map((c) => <button key={c} className={`chip ${c === categoria ? 'active' : ''}`} data-cat={c} onClick={() => { setQ(''); notariaBuscar(c, c); }}>{c}</button>)}
      </div>
      <div id="tplResults" className="tw:grid tw:grid-cols-[repeat(auto-fill,minmax(300px,1fr))] tw:gap-ui tw:items-stretch">
        {buscando ? [0, 1, 2].map((i) => <Card key={i} className="tpl-card tw:h-full"><EsqueletoZona etiqueta="Buscando trámites"><EsqueletoTexto lineas={3} /></EsqueletoZona></Card>)
          : errorCatalogo ? <p className="error">No se pudo cargar el catálogo: {errorCatalogo}</p>
          : !resultados.length ? <p className="tw:m-0 tw:text-sm tw:text-muted">No se encontraron trámites. Prueba con otras palabras.</p>
          : resultados.map((t) => (
            <Card key={t.template_version_id} className="tpl-card tw:h-full tw:flex tw:flex-col tw:[&>div]:flex-1" titulo={t.name}
              accion={<Badge tono="lavanda">Plantilla</Badge>}
              pie={<div className="tw:flex tw:justify-end"><Boton tamano="sm" data-use={t.template_version_id} onClick={() => abrir(t.template_version_id)}>Usar plantilla</Boton></div>}>
              <p className="tw:m-0 tw:text-sm tw:text-muted tw:line-clamp-4">{t.description || 'Sin descripción'}</p>
            </Card>
          ))}
      </div>
    </Layout>
  );
}

function Campo({ v, valor, error, alCambiar }: { v: IVariable; valor: string; error: string; alCambiar: (x: string) => void }) {
  const p = { 'data-f': v.id, etiqueta: `${bonito(v.label || v.name)}${v.required ? ' *' : ''}`, error: error || null, value: valor, onChange: (e: { target: { value: string } }) => alCambiar(e.target.value) };
  switch (v.input_type) {
    case 'date': return <Input type="date" {...p} />;
    case 'email': return <Input type="email" {...p} placeholder="nombre@correo.cl" />;
    case 'phone': return <Input type="tel" {...p} placeholder="+56 9 1234 5678" />;
    case 'rut': return <Input type="text" {...p} placeholder="12.345.678-9" />;
    case 'select': return <>
      <Input type="text" list={`dl-${v.id}`} {...p} placeholder="Elige o escribe" />
      <datalist id={`dl-${v.id}`}>{(/civil/i.test(v.id) ? ESTADO_CIVIL : []).map((o) => <option key={o} value={o} />)}</datalist>
    </>;
    default: return esTextoLargo(v) ? <Textarea rows={3} {...p} /> : <Input type="text" {...p} />;
  }
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
      setTimeout(() => document.querySelector('#view-tpl [aria-invalid="true"]')?.scrollIntoView({ block: 'center' }), 0);
      return;
    }
    setError('');
    confirmarEnvioNotaria(
      { id: f.template_version_id, nombre: f.name, valores: valoresParaEnviar(f, valores), firmantes: lineasFirmantes(f, valoresParaEnviar(f, valores)) },
      { alError: (msg: string) => setError('Portalfirma rechazó el envío: ' + msg), alEnviar: notariaReiniciar },
    );
  };
  return (
    <Layout titulo={f.name} ilustracion={{ imagen: 'img/formas/etapa.svg', tinte: '#6d5bd0' }} subtitulo={f.description || ''}
      volver={{ texto: 'Notaría virtual', alTocar: notariaVolver, id: 'tplBack' }}
      acciones={<>
        {f.url && <Boton variante="secundario" id="tplWeb" onClick={() => abrirUrl(f.url!)}>Ver en la web</Boton>}
        <Boton id="tplSend" onClick={enviar}>Generar y enviar a firmar</Boton>
      </>}>
      {firmantes.length > 0 && <p className="tw:m-0 tw:text-sm">Firman: <strong>{firmantes.map((g) => bonito(g.group)).join(', ')}</strong>. Recibirán su enlace de firma al correo indicado.</p>}
      {f.requires_property && <p className="tw:m-0 tw:text-sm tw:text-yellow-softink">Este trámite usa datos de una propiedad: complétalos en la sección correspondiente.</p>}
      <div id="tplGroups" ref={grupos} className="tw:flex tw:flex-col tw:gap-ui">
        {(f.groups || []).map((g, i) => (
          <Card key={i} titulo={bonito(g.group)} accion={g.type === 'signer' ? <Badge tono="verde">Firma</Badge> : undefined}>
            <div className="tw:grid tw:grid-cols-3 tw:gap-ui tw:max-[820px]:grid-cols-2">{(g.variables || []).map((v) => <Campo key={v.id} v={v} valor={valores[v.id] ?? ''} error={tocado ? errorCampo(v, valores[v.id]) : ''} alCambiar={(x) => notariaValor(v.id, x)} />)}</div>
          </Card>
        ))}
      </div>
      <p id="tplError" role="alert" className="error tw:m-0 tw:min-h-[1.2em]">{error}</p>
    </Layout>
  );
}

export default function NotariaVirtual() {
  const { actual, abriendo } = useNotaria();
  if (abriendo) return <Layout titulo="Notaría virtual" ilustracion={{ imagen: 'img/formas/etapa.svg', tinte: '#6d5bd0' }} subtitulo="Abriendo el formulario…"><Card><EsqueletoZona etiqueta="Cargando el formulario"><EsqueletoTexto lineas={5} /></EsqueletoZona></Card></Layout>;
  return actual ? <Formulario /> : <Catalogo />;
}
