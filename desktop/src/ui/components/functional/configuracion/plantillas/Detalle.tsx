// Configuración › Plantillas › una plantilla (pantalla propia con Layout): cabecera con estado, versión y acciones;
// abajo, cláusulas en cards (izquierda, ancho arrastrable) y vista previa PDF (derecha: hoja entera, zoom y pager flotantes).
//  · El administrador edita cada cláusula con un editor tipo Word (EditorClausula: negrita, cursiva, listas, datos como
//    fichas y partes condicionales; nunca ve el formato guardado, lo arma formatoClausula.ts), «Probar» arma la vista previa con los cambios sin guardarlos, «Guardar versión» crea una versión nueva y «Aprobar»
//    registra la revisión del abogado o notario. En «⋯»: historial (restaurar), volver todo a la base y descargar el PDF.
//  · Los demás la ven y prueban, sin editar.
// «Configurar la firma…» (en «⋯», modal-149): tipo de firma y legalización notarial de los documentos de esta plantilla (solo el administrador cambia).
// API: pl:detalle / pl:guardar / pl:previa / pl:aprobar / pl:restaurar / pl:firma (src/main.js → /v1/plantillas…).
// Ids para pruebas: #plDetalle, #plBack, [data-clausula], #plTexto (el editor; ids de su barra en EditorClausula), #plVerBase, #plVolverBase, #plProbar,
// #plFirmaBtn, #plFirmaResumen, #plTipoFirma, #plTramite, #plGuardar, #plAprobar, #plMas, #plHistorialBtn, #plBaseTodo, #plDescargar, #plVista.
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, type PointerEvent as PointerEventR, type ReactNode } from 'react';
import Layout, { MIGA_INICIO } from '../../../ui/Layout';
import Card from '../../../ui/Card';
import Boton from '../../../ui/Boton';
import Badge from '../../../ui/Badge';
import MenuMas, { type IOpcionMenu } from '../../../ui/MenuMas';
import EstadoVacio from '../../../ui/EstadoVacio';
import VisorPdf, { PdfCargando } from '../../agenda/VisorPdf';
import { api } from '../../../../utils/api';
import { confirmar, toast } from '../../../../utils/app';
import { descargarPdf } from '../../../../utils/pdf';
import { fecha } from '../../../../utils/formato';
import { cx } from '../../../../utils/cx';
import EstadoPlantilla from './EstadoPlantilla';
import EditorClausula from './EditorClausula';
import { configurarFirma, elegirVersion, pedirAprobacion, pedirNotaVersion } from './ventanas';
import { FIRMA_BASE, resumenFirma } from './firma';
import type { IDetallePlantilla } from './tipos';

const textosDe = (d: IDetallePlantilla) => Object.fromEntries(d.bloques.filter((b) => b.editable).map((b) => [b.clave, b.texto ?? '']));
const igual = (a?: string | null, b?: string | null) => (a ?? '').replace(/\r/g, '').trim() === (b ?? '').replace(/\r/g, '').trim();

const CLAVE_ANCHO = 'pf.plClausulasW';
const ANCHO_DEF = 560; // con el editor enriquecido la cláusula necesita espacio
const ANCHO_MIN = 280;
const ANCHO_MAX = 900;
const PDF_MIN = 320;

function leerAncho(): number {
  try {
    const n = Number(localStorage.getItem(CLAVE_ANCHO));
    if (Number.isFinite(n) && n >= ANCHO_MIN && n <= ANCHO_MAX) return Math.round(n);
  } catch { /* sin storage */ }
  return ANCHO_DEF;
}

/** manija entre cláusulas y PDF: arrastrar, ← → y doble clic para el ancho de siempre */
function Asa({ ancho, alCambiar }: { ancho: number; alCambiar: (px: number | null) => void }) {
  const arrastrar = (e: PointerEventR<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const asa = e.currentTarget;
    const fila = asa.parentElement; if (!fila) return;
    asa.setPointerCapture(e.pointerId);
    const x0 = e.clientX; const w0 = ancho; let w = w0;
    document.body.classList.add('ag-arrastrando');
    const limitar = (px: number) => Math.round(Math.max(ANCHO_MIN, Math.min(ANCHO_MAX, fila.clientWidth - PDF_MIN, px)));
    const mover = (ev: PointerEvent) => { w = limitar(w0 + (ev.clientX - x0)); alCambiar(w); };
    const soltar = () => {
      asa.removeEventListener('pointermove', mover); asa.removeEventListener('pointerup', soltar); asa.removeEventListener('pointercancel', soltar);
      document.body.classList.remove('ag-arrastrando');
      if (w !== w0) { try { localStorage.setItem(CLAVE_ANCHO, String(w)); } catch { /* */ } }
    };
    asa.addEventListener('pointermove', mover); asa.addEventListener('pointerup', soltar); asa.addEventListener('pointercancel', soltar);
  };
  const teclas = (e: KeyboardEvent<HTMLDivElement>) => {
    const paso = e.key === 'ArrowLeft' ? -16 : e.key === 'ArrowRight' ? 16 : 0;
    if (!paso) return;
    e.preventDefault();
    const fila = e.currentTarget.parentElement;
    const lim = fila ? fila.clientWidth - PDF_MIN : ANCHO_MAX;
    const w = Math.round(Math.max(ANCHO_MIN, Math.min(ANCHO_MAX, lim, ancho + paso)));
    alCambiar(w);
    try { localStorage.setItem(CLAVE_ANCHO, String(w)); } catch { /* */ }
  };
  return (
    <div id="plAsa" role="separator" aria-orientation="vertical" tabIndex={0}
      aria-valuenow={ancho} aria-valuemin={ANCHO_MIN} aria-valuemax={ANCHO_MAX}
      aria-label="Ancho de las cláusulas" title="Arrastra para cambiar el ancho · doble clic para restablecer"
      className="tw:group tw:relative tw:z-[3] tw:hidden tw:w-[9px] tw:shrink-0 tw:cursor-col-resize tw:touch-none tw:outline-none tw:xl:block tw:-mx-[4.5px]"
      onPointerDown={arrastrar} onKeyDown={teclas} onDoubleClick={() => { alCambiar(null); try { localStorage.removeItem(CLAVE_ANCHO); } catch { /* */ } }}>
      <span aria-hidden className="tw:pointer-events-none tw:absolute tw:inset-y-0 tw:left-[3px] tw:w-[3px] tw:rounded tw:bg-transparent tw:transition-colors tw:group-hover:bg-brand/55 tw:group-focus-visible:bg-brand/55 tw:group-active:bg-brand/55" />
    </div>
  );
}

function Marco({ nombre, titulo, subtitulo, acciones, alVolver, children }: {
  nombre: string; titulo: string; subtitulo?: ReactNode; acciones?: ReactNode; alVolver: () => void; children: ReactNode;
}) {
  return (
    <Layout
      id="plDetalle"
      altoCompleto
      migas={[
        MIGA_INICIO,
        { texto: 'Configuración', alTocar: alVolver },
        { texto: 'Plantillas', icono: 'template', alTocar: alVolver, id: 'plBack' },
        { texto: titulo },
      ]}
      titulo={titulo}
      subtitulo={subtitulo}
      acciones={acciones}
    >
      <div data-plantilla={nombre} className="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col">{children}</div>
    </Layout>
  );
}

export default function Detalle({ nombre, alVolver }: { nombre: string; alVolver: () => void }) {
  const [d, setD] = useState<IDetallePlantilla | null>(null);
  const [error, setError] = useState('');
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [sel, setSel] = useState('');
  const [verBase, setVerBase] = useState(false);
  const [pdf, setPdf] = useState<{ base64: string; prueba: boolean } | null>(null);
  const [armando, setArmando] = useState(false);
  const [errorPdf, setErrorPdf] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [anchoClausulas, setAnchoClausulas] = useState(leerAncho);

  const aplicar = useCallback((x: IDetallePlantilla) => {
    setD(x); setTextos(textosDe(x));
    setSel((s) => (x.bloques.some((b) => b.clave === s) ? s : (x.bloques.find((b) => b.editable) ?? x.bloques[0])?.clave ?? ''));
  }, []);

  /** la vista previa: sin bloques, la versión guardada; con bloques, una prueba sin guardar */
  const previa = useCallback(async (bloques?: Record<string, string>) => {
    setArmando(true); setErrorPdf('');
    try { const r = await api<{ pdf: string }>('plPrevia', nombre, bloques); setPdf({ base64: r.pdf, prueba: !!bloques }); }
    catch (e) { setErrorPdf((e as Error).message); if (bloques) toast((e as Error).message, 7000); }
    setArmando(false);
  }, [nombre]);

  useEffect(() => {
    api<IDetallePlantilla>('plDetalle', nombre).then((x) => { aplicar(x); previa(); }).catch((e: Error) => setError(e.message));
  }, [nombre, aplicar, previa]);

  const hayCambios = useMemo(() => !!d && d.bloques.some((b) => b.editable && !igual(textos[b.clave], b.texto)), [d, textos]);

  const salir = async () => {
    if (hayCambios && !(await confirmar({ titulo: 'Salir sin guardar', texto: 'Hay cambios en las cláusulas que **no se han guardado**. Si sales, se pierden.', boton: 'Salir sin guardar', peligro: true, clave: 'modal-146' }))) return;
    alVolver();
  };

  if (error) {
    return (
      <Marco nombre={nombre} titulo="Plantilla" alVolver={alVolver}>
        <Card titulo="Plantilla"><EstadoVacio compacto texto={`No se pudo abrir la plantilla: ${error}`} /><Boton id="plBack" variante="secundario" icono="chevL" className="tw:mt-3" onClick={alVolver}>Volver</Boton></Card>
      </Marco>
    );
  }
  if (!d) {
    return (
      <Marco nombre={nombre} titulo="Plantilla" alVolver={alVolver}>
        <Card titulo="Plantilla"><EstadoVacio compacto texto="Cargando…" /></Card>
      </Marco>
    );
  }

  const editar = d.puedeEditar;

  const accion = async (hacer: () => Promise<IDetallePlantilla>, listo: string) => {
    setOcupado(true);
    try { aplicar(await hacer()); toast(listo); setOcupado(false); await previa(); }
    catch (e) { toast((e as Error).message, 7000); setOcupado(false); }
  };

  const guardar = async () => {
    const nota = await pedirNotaVersion(); if (nota === null) return;
    await accion(() => api<IDetallePlantilla>('plGuardar', nombre, { bloques: textos, ...(nota ? { nota } : {}) }), 'Versión guardada.');
  };
  const aprobar = async () => {
    const r = await pedirAprobacion(d.version); if (!r) return;
    await accion(() => api<IDetallePlantilla>('plAprobar', nombre, { revisor: r.revisor, ...(r.nota ? { nota: r.nota } : {}) }), 'Plantilla aprobada.');
  };
  const restaurar = (n: number) => accion(() => api<IDetallePlantilla>('plRestaurar', nombre, n), n ? `Se restauró la versión ${n}.` : 'La plantilla volvió a la base.');
  const historial = async () => {
    const n = await elegirVersion(d.versiones, d.version, editar); if (n === null) return;
    if (await confirmar({ titulo: n ? `Restaurar la versión ${n}` : 'Volver a la base', texto: `Se crea una versión nueva igual a ${n ? `la versión ${n}` : 'la base de Asset'}.${hayCambios ? ' Los cambios sin guardar se pierden.' : ''}`,
      nota: 'La plantilla queda por aprobar.', boton: 'Restaurar', clave: 'modal-145' })) await restaurar(n);
  };
  const baseTodo = async () => {
    if (await confirmar({ titulo: 'Volver toda la plantilla a la base', texto: 'Todas las cláusulas vuelven al **texto común de Asset**. Se guarda como una versión nueva: puedes recuperar la actual desde el historial.',
      nota: hayCambios ? 'Los cambios sin guardar se pierden.' : '', boton: 'Volver a la base', peligro: true, clave: 'modal-144' })) await restaurar(0);
  };
  const firmaConf = async () => {
    const nueva = await configurarFirma(d.firma ?? FIRMA_BASE, !editar); if (!nueva || !editar) return;
    setOcupado(true);   // la firma no cambia el texto: se actualiza el detalle sin rearmar la vista previa ni perder lo escrito
    try { const x = await api<IDetallePlantilla>('plFirma', nombre, nueva); setD((p) => (p ? { ...p, firma: x.firma ?? nueva } : p)); toast('Se guardó cómo se firma.'); }
    catch (e) { toast((e as Error).message, 7000); }
    setOcupado(false);
  };
  const descargar = async () => {
    try {
      const r = await api<{ pdf: string }>('plPrevia', nombre, hayCambios ? textos : undefined);
      const ruta = await descargarPdf(r.pdf, `${d.titulo} - muestra.pdf`);
      if (ruta) toast('PDF de muestra guardado.');
    } catch (e) { toast((e as Error).message, 7000); }
  };

  // botones: «⋯» (el resto), «Probar» (secundario) y el principal según el momento: guardar si hay cambios, si no aprobar
  const principal = !editar ? null : hayCambios ? 'guardar' : d.estado !== 'aprobada' ? 'aprobar' : null;
  const menu: IOpcionMenu[] = [
    ...(editar && principal !== 'aprobar' ? [{ id: 'plAprobar', texto: d.estado === 'aprobada' ? 'Volver a aprobar' : 'Aprobar', icono: 'check', disabled: hayCambios || ocupado, title: hayCambios ? 'Guarda los cambios antes de aprobar.' : undefined, alTocar: aprobar }] : []),
    { id: 'plHistorialBtn', texto: 'Historial de versiones', icono: 'clock', disabled: ocupado, alTocar: historial },
    ...(editar ? [{ id: 'plBaseTodo', texto: 'Volver toda la plantilla a la base', icono: 'undo', disabled: ocupado || (!hayCambios && !d.bloques.some((x) => x.cambiado)), alTocar: baseTodo }] : []),
    { id: 'plFirmaBtn', texto: editar ? 'Configurar la firma…' : 'Ver cómo se firma…', icono: 'sign', disabled: ocupado, alTocar: firmaConf },
    { id: 'plDescargar', texto: 'Descargar PDF de muestra', icono: 'download', alTocar: descargar },
  ];

  const abrirClausula = (clave: string) => {
    setSel((prev) => {
      if (prev !== clave) setVerBase(false);
      return clave;
    });
  };

  const subtitulo = (
    <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
      <EstadoPlantilla estado={d.estado} aprobacion={d.aprobacion} />
      <span id="plFirmaResumen" data-firma={d.firma?.tipoFirma || 'simple'} data-tramite={d.firma?.tramite || 'none'}>{resumenFirma(d.firma)}</span>
      <span>{d.version ? `versión ${d.version}` : 'la base de Asset'}{d.versiones[0] && d.version ? ` · ${d.versiones[0].porNombre} · ${fecha(d.versiones[0].en)}` : ''}</span>
    </div>
  );

  const acciones = (
    <>
      <MenuMas id="plMas" etiqueta="Más acciones de la plantilla" opciones={menu} />
      <Boton id="plProbar" variante="secundario" icono="run" cargando={armando} onClick={() => previa(hayCambios ? textos : undefined)}>{hayCambios ? 'Probar' : 'Actualizar vista previa'}</Boton>
      {principal === 'guardar' && <Boton id="plGuardar" icono="save" cargando={ocupado} onClick={guardar}>Guardar versión</Boton>}
      {principal === 'aprobar' && <Boton id="plAprobar" variante="exito" icono="check" cargando={ocupado} onClick={aprobar}>Aprobar</Boton>}
    </>
  );

  return (
    <Marco nombre={nombre} titulo={d.titulo} subtitulo={subtitulo} acciones={acciones} alVolver={salir}>
      {/* cláusulas a la izquierda (ancho arrastrable en xl); PDF a la derecha con zoom */}
      <div className="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-ui tw:xl:flex-row tw:xl:gap-0 tw:items-stretch">
        <div role="list"
          className="tw:flex tw:min-h-0 tw:w-full tw:flex-col tw:gap-ui tw:overflow-y-auto tw:xl:w-[var(--pl-clausulas-w)] tw:xl:shrink-0"
          style={{ ['--pl-clausulas-w' as string]: `${anchoClausulas}px` }}>
          {d.bloques.map((x) => {
            const abierta = x.clave === sel;
            const sinGuardar = x.editable && !igual(textos[x.clave], x.texto);
            const propia = x.editable && !igual(textos[x.clave], x.base);
            const badge = sinGuardar
              ? <Badge tono="amarillo" punto>Sin guardar</Badge>
              : propia ? <Badge tono="lavanda">Propia</Badge> : undefined;
            const detalle = !x.editable ? 'Se arma con los datos' : propia ? 'Cambiada' : 'Igual a la base';
            return (
              <div key={x.clave} role="listitem" data-clausula={x.clave} data-propia={propia || undefined} aria-current={abierta || undefined}
                className="tw:cursor-pointer" onClick={() => abrirClausula(x.clave)}>
                <Card
                  className={cx(abierta && 'tw:ring-1 tw:ring-edge')}
                  titulo={x.titulo}
                  subtitulo={detalle}
                  accion={badge}
                  relleno={abierta}
                >
                  {abierta && (
                    !x.editable
                      ? <p id="plSoloLectura" className="tw:m-0 tw:cursor-auto tw:text-sm tw:text-muted" onClick={(e) => e.stopPropagation()}>Esta parte se arma con los datos del documento; se ajusta desde su ventana.</p>
                      : (
                        <div className="tw:flex tw:cursor-auto tw:flex-col tw:gap-ui" onClick={(e) => e.stopPropagation()}>
                          <EditorClausula id="plTexto" tipo={x.tipo} texto={textos[x.clave] ?? ''} variables={d.variables} soloLectura={!editar}
                            etiqueta={`Texto de ${x.titulo}`} alCambiar={(t) => setTextos((v) => ({ ...v, [x.clave]: t }))} />
                          {verBase && (
                            <div id="plBase" className="tw:flex tw:flex-col tw:gap-1">
                              <small className="tw:text-xs tw:font-semibold tw:text-muted">Texto de la base de Asset</small>
                              <EditorClausula key={x.clave} tipo={x.tipo} texto={x.base} soloLectura etiqueta={`Texto de la base de ${x.titulo}`} />
                            </div>
                          )}
                          <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-ui">
                            <div className="tw:ml-auto tw:flex tw:flex-nowrap tw:items-center tw:gap-ui">
                              <Boton id="plVerBase" variante="secundario" icono="file" onClick={() => setVerBase((v) => !v)}>{verBase ? 'Ocultar la base' : 'Ver la base'}</Boton>
                              {editar && <Boton id="plVolverBase" variante="secundario" icono="undo" disabled={igual(textos[x.clave], x.base)}
                                onClick={() => setTextos((t) => ({ ...t, [x.clave]: x.base ?? '' }))}>Volver a la base</Boton>}
                            </div>
                          </div>
                        </div>
                      )
                  )}
                </Card>
              </div>
            );
          })}
        </div>

        <Asa ancho={anchoClausulas} alCambiar={(px) => setAnchoClausulas(px ?? ANCHO_DEF)} />

        <div id="plVista" data-prueba={pdf?.prueba || undefined} title={pdf?.prueba ? 'Prueba con los cambios sin guardar' : 'Versión guardada, con datos de ejemplo'}
          className="tw:relative tw:flex tw:min-h-[420px] tw:min-w-0 tw:flex-1 tw:flex-col tw:xl:min-h-0">
          {pdf?.prueba && (
            <span className="tw:pointer-events-none tw:absolute tw:left-2 tw:top-2 tw:z-10 tw:rounded-control tw:bg-card/90 tw:px-2 tw:py-0.5 tw:text-[11px] tw:font-semibold tw:text-muted">Prueba</span>
          )}
          <div className="tw:min-h-0 tw:flex-1">
            {armando ? <PdfCargando sinCaja /> : errorPdf ? <EstadoVacio compacto texto={`No se pudo armar la vista previa: ${errorPdf}`} /> : pdf
              ? <VisorPdf base64={pdf.base64} ajustar="pagina" flotante sinCaja zoom />
              : null}
          </div>
        </div>
      </div>
    </Marco>
  );
}
