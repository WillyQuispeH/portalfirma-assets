// Inicio de Gestión documental: lo esencial, abrir arrastrando, la Notaría, los recientes y las plantillas,
// y en la columna derecha las herramientas de PDF, lo que ahorra tiempo y lo avanzado. Se dibuja en #homeBody.
//
// Sin barra del Agente: ya está en la barra superior. Con el kit: Layout, Card, Boton, Badge, ItemLista y EstadoVacio. Cada botón llama a homeAction() de
// src/renderer/home.js (accionGestion). La biblioteca de plantillas (#tplLibHost) es BibliotecaPlantillas.
// Marcas que usan las pruebas y la Ayuda (sin estilos propios): .hub-card[data-act] (con .big o .hub-row),
// [data-member] + .lock-badge (candado para quien no es cliente, styles.css body.guest), .new-badge, .tool-chip,
// .tool-chips, .lvl-h h3, .lvl-help[data-help], .hub-center (la columna principal), .hub-col (la derecha), .hub-not,
// .hn-card(.main), .hub-panel, #hubDrop, #hubDrive, #recAll, .recent-list y .recent-item[data-path].
import { useEffect, useState, type ReactNode } from 'react';
import Icono from '../../../ui/Icono';
import Layout from '../../../ui/Layout';
import Card from '../../../ui/Card';
import Boton from '../../../ui/Boton';
import Badge from '../../../ui/Badge';
import ItemLista from '../../../ui/ItemLista';
import EstadoVacio from '../../../ui/EstadoVacio';
import { RELLENO, SUAVE, type TTono } from '../../../ui/tonos';
import { cx } from '../../../../utils/cx';
import { useReciente } from '../../../../store/hooks/useReciente.hook';
import BibliotecaPlantillas from '../editor-pdf/BibliotecaPlantillas';
import { abrirAyudaNivel, abrirDrive, abrirReciente, accionGestion, abrirRecientes } from '../../../../utils/app';
import { IconoArchivo, carpetaDe, fechaCorta, tamano } from '../comun/archivos';
import { ACCION, DE_MIEMBROS, HERRAMIENTAS_PDF, NIVELES, NUEVAS, marcarVisto, visto } from './acciones';

const RECIENTES = 3;
// color de cada acción (acciones.ts) → tono del kit
const TONO: Record<string, TTono> = {
  'c-blue': 'azul', 'c-indigo': 'lavanda', 'c-violet': 'lavanda', 'c-teal': 'verde', 'c-red': 'rojo', 'c-green': 'verde',
  'c-pink': 'durazno', 'c-amber': 'amarillo', 'c-cyan': 'azul', 'c-slate': 'gris', 'c-ai': 'lavanda', pf: 'durazno',
};
const tonoDe = (k: string): TTono => TONO[ACCION[k][4]] || 'gris';
// la ilustración del documento (fija, propia de la app)
const DOC = `<svg viewBox="0 0 120 140" width="64" height="76" aria-hidden="true"><defs><linearGradient id="hdg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dfe6f3"/></linearGradient><linearGradient id="hdf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eef2fa"/><stop offset="1" stop-color="#c9d3e6"/></linearGradient><filter id="hds" x="-30%" y="-20%" width="160%" height="150%"><feDropShadow dx="0" dy="8" stdDeviation="7" flood-color="#3a4a78" flood-opacity=".22"/></filter></defs>
  <g filter="url(#hds)"><path d="M18 10h58l26 26v88a8 8 0 0 1-8 8H18a8 8 0 0 1-8-8V18a8 8 0 0 1 8-8z" fill="url(#hdg)" stroke="#c4cee2"/><path d="M76 10v20a6 6 0 0 0 6 6h20z" fill="url(#hdf)" stroke="#c4cee2"/></g>
  <g stroke="#4a5d86" stroke-width="5" stroke-linecap="round"><path d="M30 64h52M30 78h60M30 92h60M30 106h40"/></g></svg>`;

// botón táctil del kit (borde inferior más grueso, como Card), para las tarjetas de acción; el color va aparte:
// RELLENO del kit (fondo, borde y texto del tono de la acción) o el degradado de marca (boton-brand)
const TACTIL = 'tw:relative tw:m-0 tw:cursor-pointer tw:font-[inherit] tw:text-left tw:rounded-2xl tw:border tw:border-solid tw:border-b-[3px] tw:transition-[transform,box-shadow,filter] tw:duration-150 tw:hover:-translate-y-0.5 tw:hover:shadow-md tw:active:translate-y-0 tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-lav-edge';
const MARCA = 'tw:boton-brand tw:text-white tw:hover:brightness-[1.06]';
const color = (k: string) => RELLENO[tonoDe(k)];

const Candado = () => <span className="lock-badge" title="Exclusivo para clientes de Portalfirma"><Icono nombre="lock" tam={12} /></span>;
// el ícono de la acción: en una tarjeta de color va sobre blanco (toma el color del texto de la tarjeta)
const Burbuja = ({ k, tam = 'md', sobre = 'color' }: { k: string; tam?: 'sm' | 'md' | 'lg'; sobre?: 'color' | 'marca' }) => (
  <span className={cx('ic tw:grid tw:flex-none tw:place-items-center tw:shadow-sm', sobre === 'marca' ? 'tw:bg-white/20 tw:text-white' : 'tw:bg-card',
    tam === 'lg' ? 'tw:w-14 tw:h-14 tw:rounded-2xl' : tam === 'md' ? 'tw:w-11 tw:h-11 tw:rounded-xl' : 'tw:w-9 tw:h-9 tw:rounded-xl')}>
    <Icono nombre={ACCION[k][1]} tam={tam === 'lg' ? 28 : tam === 'md' ? 22 : 18} />
  </span>
);
const miembro = (k: string) => (DE_MIEMBROS.has(k) ? { 'data-member': '' } : {});

/** encabezado de un nivel (Lo esencial, Para ahorrar tiempo, Avanzado) con su botón de ayuda */
function Nivel({ i, children }: { i: number; children: ReactNode }) {
  const n = NIVELES[i];
  return (
    <Card>
      <div className="lvl-h tw:flex tw:items-start tw:gap-2 tw:mb-3">
        <div className="tw:min-w-0 tw:flex-1">
          <h3 className="tw:m-0 tw:text-[17px] tw:font-bold tw:leading-tight">{n.titulo}</h3>
          <p className="tw:m-0 tw:mt-1 tw:text-[13px] tw:text-muted">{n.sub}</p>
        </div>
        <Boton variante="fantasma" tamano="sm" className="lvl-help" data-help={n.clave} icono="help" title="Ver guías de este nivel" aria-label="Ver guías de este nivel" onClick={() => abrirAyudaNivel(n.clave)} />
      </div>
      {children}
    </Card>
  );
}

export default function InicioGestion() {
  const { lista, recientesGetAll } = useReciente();
  const [, setVistos] = useState(0); // para quitar «Nuevo» al abrir

  useEffect(() => {
    recientesGetAll();
    const recargar = () => recientesGetAll();
    window.addEventListener('pf:recientes', recargar); // home.js avisa cuando cambia la lista (pf.onRecentChanged)
    return () => window.removeEventListener('pf:recientes', recargar);
  }, [recientesGetAll]);

  const hacer = (k: string) => { if (NUEVAS.has(k) && !visto(k)) { marcarVisto(k); setVistos((n) => n + 1); } accionGestion(k); };
  const Nuevo = ({ k }: { k: string }) => (NUEVAS.has(k) && !visto(k) ? <Badge tono="lavanda" variante="tactil" className="new-badge">Nuevo</Badge> : null);

  // tarjeta grande (Enviar a firmar, Mis operaciones) y chica (Abrir, Crear, Combinar, Convertir)
  const Tarjeta = ({ k, grande = false }: { k: string; grande?: boolean }) => {
    const [, , t, d] = ACCION[k]; const m = DE_MIEMBROS.has(k); const marca = k === 'send';
    return (
      <button type="button" className={cx('hub-card', grande && 'big', TACTIL, marca ? MARCA : color(k), grande ? 'tw:flex tw:flex-col tw:items-center tw:justify-center tw:gap-2 tw:min-h-[150px] tw:p-4 tw:text-center' : 'tw:flex tw:items-center tw:gap-3 tw:p-3')}
        data-act={k} {...miembro(k)} title={`${d}${m ? ' · Exclusivo para clientes de Portalfirma' : ''}`} onClick={() => hacer(k)}>
        <Burbuja k={k} tam={grande ? 'lg' : 'sm'} sobre={marca ? 'marca' : 'color'} />
        <strong className={cx('tw:font-bold tw:leading-tight', grande ? 'tw:text-base' : 'tw:text-sm')}>{t}</strong>
        {grande && <small className="tw:text-xs tw:leading-snug tw:opacity-80">{d}</small>}
        {m && <Candado />}
      </button>
    );
  };
  // fila con descripción (columna derecha)
  const Fila = ({ k }: { k: string }) => {
    const [, , t, d] = ACCION[k]; const m = DE_MIEMBROS.has(k);
    return (
      <button type="button" className={cx('hub-card hub-row', TACTIL, color(k), 'tw:flex tw:items-center tw:gap-3 tw:p-3 tw:pr-8')}
        data-act={k} {...miembro(k)} title={m ? 'Exclusivo para clientes de Portalfirma' : t} onClick={() => hacer(k)}>
        <Burbuja k={k} tam="sm" />
        <span className="tw:flex tw:min-w-0 tw:flex-col tw:gap-0.5">
          <strong className="tw:flex tw:flex-wrap tw:items-center tw:gap-1.5 tw:text-[13.5px] tw:font-bold">{t}<Nuevo k={k} /></strong>
          <small className="tw:text-xs tw:leading-snug tw:opacity-75">{d}</small>
        </span>
        {m && <Candado />}
      </button>
    );
  };

  return (
    <Layout
      titulo="Gestión documental"
      ilustracion={{ imagen: 'img/formas/etapa.svg', tinte: '#3d6fe0' }}
      subtitulo="Crea, edita y prepara tus documentos, y envíalos a firmar con Portalfirma."
      acciones={<>
        <Boton icono="sign" data-act="send" onClick={() => hacer('send')}>Enviar a firmar</Boton>
        <Boton variante="secundario" icono="folderOpen" data-act="open" onClick={() => hacer('open')}>Abrir PDF</Boton>
      </>}
    >
      <div className="tw:grid tw:items-start tw:gap-5 tw:grid-cols-1 tw:xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="hub-center tw:flex tw:min-w-0 tw:flex-col tw:gap-5">
          <Nivel i={0}>
            <div className="tw:grid tw:grid-cols-2 tw:gap-3">{NIVELES[0].grandes.map((k) => <Tarjeta key={k} k={k} grande />)}</div>
            <div className="tw:grid tw:grid-cols-2 tw:gap-3 tw:mt-3 tw:lg:grid-cols-4">{NIVELES[0].chicas.map((k) => <Tarjeta key={k} k={k} />)}</div>
          </Nivel>

          {/* abrir arrastrando (home.js recibe los archivos soltados en la ventana) */}
          <div className="hub-panel">
            <div id="hubDrop" role="button" tabIndex={0} title="Abrir PDF"
              className="tw:flex tw:items-center tw:gap-5 tw:p-5 tw:rounded-2xl tw:cursor-pointer tw:border-2 tw:border-dashed tw:border-lav-edge tw:bg-lav-soft/40 tw:transition-colors tw:hover:bg-lav-soft tw:focus-visible:outline-2 tw:focus-visible:outline-lav-edge"
              onClick={(e) => { if ((e.target as HTMLElement).closest('#hubDrive, [data-act]')) return; hacer('open'); }}
              onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); hacer('open'); } }}>
              <span className="tw:flex-none" dangerouslySetInnerHTML={{ __html: DOC }} />
              <span className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-1">
                <strong className="tw:text-base tw:font-bold tw:text-text">Arrastra archivos a esta ventana para abrirlos</strong>
                <span className="tw:text-[13px] tw:text-muted">PDF, Word, Excel o imágenes · o haz clic para elegir</span>
                <span className="tw:flex tw:flex-wrap tw:gap-2 tw:mt-2">
                  <Boton variante="secundario" tamano="sm" id="hubDrive" icono="drive" onClick={() => abrirDrive()}>Desde Google Drive</Boton>
                  <Boton variante="secundario" tamano="sm" icono="filePlus" data-act="new" onClick={() => hacer('new')}>Crear PDF</Boton>
                  <Boton variante="secundario" tamano="sm" icono="template" data-act="tpls" onClick={() => hacer('tpls')}>Plantillas con campos</Boton>
                </span>
              </span>
            </div>
          </div>

          <Card className="hub-panel hub-not" titulo={<span className="tw:inline-flex tw:items-center tw:gap-2"><Icono nombre="notary" tam={18} />Notaría</span>} subtitulo="Firmas ante notario y documentos notariales, sin filas">
            <div className="tw:grid tw:gap-3 tw:grid-cols-1 tw:md:grid-cols-2">
              <button type="button" className={cx('hn-card main', TACTIL, MARCA, 'tw:flex tw:items-start tw:gap-3 tw:p-4')} data-act="escr" onClick={() => hacer('escr')}>
                <Burbuja k="escr" sobre="marca" />
                <span className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-1">
                  <strong className="tw:flex tw:flex-wrap tw:items-center tw:gap-1.5 tw:text-sm tw:font-bold">{ACCION.escr[2]}<Nuevo k="escr" /></strong>
                  <small className="tw:text-xs tw:leading-snug tw:opacity-85">{ACCION.escr[3]}</small>
                  <span className="tw:inline-flex tw:self-start tw:items-center tw:gap-1 tw:mt-1.5 tw:px-2.5 tw:py-1 tw:rounded-full tw:bg-white/20 tw:text-[13px] tw:font-semibold">Comenzar <Icono nombre="arrowR" tam={14} /></span>
                </span>
              </button>
              <button type="button" className={cx('hn-card', TACTIL, color('tpl'), 'tw:flex tw:items-start tw:gap-3 tw:p-4 tw:pr-9')} data-act="tpl" {...miembro('tpl')} onClick={() => hacer('tpl')}>
                <Burbuja k="tpl" />
                <span className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-1">
                  <strong className="tw:text-sm tw:font-bold">Notaría virtual</strong>
                  <small className="tw:text-xs tw:leading-snug tw:opacity-75">{ACCION.tpl[3]}</small>
                  <span className="tw:inline-flex tw:self-start tw:items-center tw:gap-1 tw:mt-1.5 tw:px-2.5 tw:py-1 tw:rounded-full tw:bg-card tw:text-[13px] tw:font-semibold">Abrir <Icono nombre="arrowR" tam={14} /></span>
                </span>
                <Candado />
              </button>
            </div>
          </Card>

          <Card className="hub-panel" relleno={false}
            titulo={<span className="tw:inline-flex tw:items-center tw:gap-2"><Icono nombre="clock" tam={17} />Recientes</span>}
            accion={lista.length > RECIENTES && <Boton variante="fantasma" tamano="sm" id="recAll" iconoDerecha="arrowR" onClick={abrirRecientes}>Ver todos ({lista.length})</Boton>}>
            <div className="recent-list tw:flex tw:flex-col tw:gap-0.5 tw:p-1.5 tw:bg-transparent tw:border-0 tw:rounded-none">
              {lista.length ? lista.slice(0, RECIENTES).map((x) => (
                <ItemLista key={x.path} className="recent-item tw:border-0" data-path={x.path} alTocar={() => abrirReciente(x.path)}
                  media={<IconoArchivo nombre={x.name} />}
                  titulo={<span title={x.path}>{x.name}</span>}
                  detalle={<>{carpetaDe(x.path)}{!x.exists && <> · <b className="tw:text-err tw:font-semibold">no encontrado</b></>}</>}
                  derecha={<span className="tw:flex tw:flex-col tw:items-end tw:text-xs tw:text-muted"><span>{fechaCorta(x.date)}</span><span>{tamano(x.size)}</span></span>} />
              )) : <EstadoVacio compacto className="recent-empty tw:px-3 tw:py-3" texto="Aquí aparecerán los documentos que abras o guardes." />}
            </div>
          </Card>

          <Card className="hub-panel" relleno={false}><div id="tplLibHost"><BibliotecaPlantillas /></div></Card>
        </div>

        <div className="hub-col tw:flex tw:min-w-0 tw:flex-col tw:gap-5">
          <Card titulo="Herramientas de PDF" subtitulo="Abren el editor con la herramienta lista">
            <div className="tool-chips tw:flex tw:flex-wrap tw:gap-1.5">
              {HERRAMIENTAS_PDF.map((k) => {
                const [, ic, t, d] = ACCION[k];
                return (
                  <button key={k} type="button" className={cx('tool-chip tw:inline-flex tw:items-center tw:gap-1.5 tw:h-8 tw:m-0 tw:px-3 tw:rounded-full tw:border-0 tw:text-[12.5px] tw:font-semibold tw:cursor-pointer tw:font-[inherit] tw:transition-[filter,transform] tw:duration-100 tw:hover:brightness-95 tw:hover:-translate-y-px tw:focus-visible:outline-2 tw:focus-visible:outline-lav-edge', SUAVE[tonoDe(k)])}
                    data-act={k} title={d} onClick={() => hacer(k)}><Icono nombre={ic} tam={15} />{t}</button>
                );
              })}
            </div>
          </Card>
          <Nivel i={1}><div className="tw:flex tw:flex-col tw:gap-2">{NIVELES[1].filas.map((k) => <Fila key={k} k={k} />)}</div></Nivel>
          <Nivel i={2}><div className="tw:flex tw:flex-col tw:gap-2">{NIVELES[2].filas.map((k) => <Fila key={k} k={k} />)}</div></Nivel>
        </div>
      </div>
    </Layout>
  );
}
