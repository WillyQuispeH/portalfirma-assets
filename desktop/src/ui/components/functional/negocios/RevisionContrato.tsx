// Revisión del contrato de arriendo (etapa 2 · Cierre del arriendo), ordenada en cuatro partes:
//  1. el CONTRATO: la versión actual (se ve en un modal con «Ver el PDF») y, en el «⋯», editar y guardar una versión nueva o registrar la que
//     devolvió alguien editada. Cada versión queda archivada como PDF; una versión nueva anula las aprobaciones;
//  2. los FIRMANTES (propietarios, arrendatario y codeudores), cada uno en su card con dos casillas: «Enviar a revisión» (se eligen a quiénes se
//     manda el contrato por WhatsApp, con el PDF adjunto) y «Aprueba» (se marca cuando ese firmante aprueba el borrador). El paso se logra
//     cuando TODOS aprobaron la última versión; esa misma versión es la que se envía a firmar en «Contrato firmado»;
//  3. los COMENTARIOS que dejó cada uno.
// Todo queda en el negocio (ciclo.contrato: versiones, aprobado[personaId], envios, comentarios) con negGuardar; los archivos van a R2.
// Los id (#rcPanel, #rcArmar, #rcVer, #rcRevisar, #rcMensaje, #rcEnviar, #rcComentario, #rcTexto, #rcGuardar, #rcVisor, #rcVisorCerrar,
// #rcEnviar-<personaId>, #rcAprueba-<personaId>, [data-rc-firmante], [data-version]) los usan las pruebas.
/* eslint-disable @typescript-eslint/no-explicit-any -- el negocio llega del proceso principal sin tipos */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Boton from '../../ui/Boton';
import Badge from '../../ui/Badge';
import Card from '../../ui/Card';
import Checkbox from '../../ui/Checkbox';
import Modal from '../../ui/Modal';
import Select from '../../ui/Select';
import Textarea from '../../ui/Textarea';
import MenuMas from '../../ui/MenuMas';
import VisorPdf from '../agenda/VisorPdf';
import { api } from '../../../utils/api';
import { toast } from '../../../utils/app';

interface IFirmante { personaId: string; rol: string; nombre: string }
interface IVersion { n: number; fecha: string; de: string; nota: string; archivo: { clave: string; nombre: string } | null; generada?: boolean; firmantes?: IFirmante[] }
interface IComentario { fecha: string; de: string; texto: string; version: number }
interface IEnvio { version: number; personaId?: string; persona: string; fecha: string; automatico: boolean }
const DE: [string, string][] = [['corredora', 'La corredora'], ['propietario', 'Un propietario'], ['arrendatario', 'El arrendatario'], ['codeudor', 'Un codeudor']];
const DE_TXT = Object.fromEntries(DE);
const ROL_TONO: Record<string, 'gris' | 'azul' | 'lavanda'> = { Arrendador: 'gris', Arrendatario: 'azul', Codeudor: 'lavanda' };
const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));
const fdm = (iso: string) => new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' });
const primer = (n: string) => String(n || '').trim().split(/\s+/)[0] || '';

function Seccion({ titulo, ayuda, acciones, children }: { titulo: string; ayuda?: ReactNode; acciones?: ReactNode; children: ReactNode }) {
  return (
    <div className="tw:flex tw:flex-col tw:gap-2.5">
      <div className="tw:flex tw:items-center tw:gap-2 tw:flex-nowrap">
        <div className="tw:min-w-0 tw:flex-1">
          <h4 className="tw:m-0 tw:text-[13px] tw:font-bold">{titulo}</h4>
          {ayuda && <p className="tw:mt-0.5 tw:mb-0 tw:text-xs tw:text-muted">{ayuda}</p>}
        </div>
        {acciones && <div className="tw:flex tw:flex-none tw:items-center tw:gap-2">{acciones}</div>}
      </div>
      {children}
    </div>
  );
}

/** el PDF de una versión, en un modal por encima de la ventana (sin salir de la app) */
function VisorContrato({ negocioId, version, alCerrar }: { negocioId: string; version: IVersion; alCerrar: () => void }) {
  const [pdf, setPdf] = useState(''); const [error, setError] = useState('');
  useEffect(() => { api<{ pdf: string }>('contratoVersion', { negocioId, clave: version.archivo!.clave }).then((r) => setPdf(r.pdf)).catch((e) => setError(mensaje(e))); }, [negocioId, version]);
  return (
    <Modal abierto onCerrar={alCerrar} titulo={`Contrato · versión ${version.n}`} descripcion={version.nota || undefined} icono="file" tamano="xl" clave="modal-130"
      pie={<Boton id="rcVisorCerrar" variante="secundario" onClick={alCerrar}>Cerrar</Boton>}>
      <div id="rcVisor">{error ? <p className="tw:m-0 tw:text-sm tw:text-muted">{error}</p> : !pdf ? <div className="tw:grid tw:place-items-center tw:min-h-[240px]"><div className="spinner" /></div> : <VisorPdf base64={pdf} />}</div>
    </Modal>
  );
}

export default function RevisionContrato({ negocioId, alCambio, reabrir }: { negocioId: string; alCambio?: () => void; reabrir?: () => void }) {
  const [n, setN] = useState<any>(null);
  const [form, setForm] = useState<null | { tipo: 'version' | 'comentario'; de: string; texto: string; version: number }>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [wsp, setWsp] = useState<null | { texto: string; enviando: boolean }>(null);
  const [visor, setVisor] = useState<IVersion | null>(null);
  const [error, setError] = useState(''); const [trabajando, setTrabajando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => { try { setN(await api<any>('negObtener', negocioId)); } catch (e) { setError(mensaje(e)); } }, [negocioId]);
  useEffect(() => { cargar(); }, [cargar]);
  // una versión guardada antes de que se registraran los firmantes: se completan ahora (propietarios, arrendatario y avales) y quedan guardados
  const sinFirmantes = !!n?.ciclo?.contrato?.versiones?.length && !(n.ciclo.contrato.versiones[n.ciclo.contrato.versiones.length - 1].firmantes || []).length;
  useEffect(() => {
    if (!sinFirmantes) return;
    (async () => {
      try {
        const r = await api<{ firmantes: IFirmante[] }>('contratoFirmantes', { negocioId });
        if (!r.firmantes.length) return;
        const base = JSON.parse(JSON.stringify((await api<any>('negObtener', negocioId)).ciclo || {}));
        const vs = base.contrato?.versiones || []; if (!vs.length || (vs[vs.length - 1].firmantes || []).length) return;
        vs[vs.length - 1].firmantes = r.firmantes;
        await api('negGuardar', { id: negocioId, ciclo: base }); await cargar(); alCambio?.();
      } catch { /* sin firmantes: la lista queda vacía y lo dice */ }
    })();
  }, [sinFirmantes, negocioId, cargar, alCambio]);
  if (!n) return <p className="tw:m-0 tw:text-[13px] tw:text-muted">{error || 'Cargando…'}</p>;

  const k = n.ciclo?.contrato || {};
  const versiones: IVersion[] = k.versiones || []; const comentarios: IComentario[] = k.comentarios || []; const ap: Record<string, string> = k.aprobado || {}; const envios: IEnvio[] = k.envios || [];
  const ultima = versiones[versiones.length - 1]; const firmantes: IFirmante[] = ultima?.firmantes || [];
  const personas: any[] = (window as any).Inmo?._IM?.data?.personas || [];
  const persona = (id: string) => personas.find((p) => p.id === id) || {};
  const faltan = firmantes.filter((f) => !ap[f.personaId]); const listo = !!ultima && firmantes.length > 0 && faltan.length === 0;

  const guardar = async (mut: (c: any) => void, aviso: string) => {
    const base = JSON.parse(JSON.stringify((await api<any>('negObtener', negocioId)).ciclo || {})); base.contrato ||= {}; mut(base.contrato);
    await api('negGuardar', { id: negocioId, ciclo: base }); toast(aviso); await cargar(); alCambio?.();
  };
  const armar = () => { setError(''); (window as any).Etapas?.armarContrato?.(negocioId, () => reabrir?.()); };
  const abrirForm = (tipo: 'version' | 'comentario') => { setForm({ tipo, de: 'propietario', texto: '', version: ultima?.n || 1 }); setArchivo(null); setError(''); setWsp(null); };
  const registrar = async () => {
    if (!form) return;
    if (form.tipo === 'comentario' && !form.texto.trim()) return setError('Escribe el comentario.');
    if (form.tipo === 'version' && !archivo) return setError('Adjunta el archivo de la versión editada (PDF).');
    setTrabajando(true); setError('');
    try {
      const fecha = new Date().toISOString();
      if (form.tipo === 'version') {
        const arch = await api<any>('negArchivoSubir', { negocioId, nombre: archivo!.name, mime: archivo!.type || undefined, bytes: new Uint8Array(await archivo!.arrayBuffer()) });
        await guardar((c) => { const vs = c.versiones || []; c.versiones = [...vs, { n: vs.length + 1, fecha, de: form.de, nota: form.texto.trim(), archivo: { clave: arch.clave, nombre: arch.nombre }, firmantes: vs[vs.length - 1]?.firmantes || [] }]; c.aprobado = {}; }, 'Versión registrada: los firmantes tienen que volver a aprobar.');
      } else await guardar((c) => { c.comentarios = [...(c.comentarios || []), { fecha, de: form.de, texto: form.texto.trim(), version: form.version }]; }, 'Comentario registrado.');
      setForm(null);
    } catch (e) { setError(mensaje(e)); }
    setTrabajando(false);
  };
  const aprueba = (f: IFirmante, si: boolean) => guardar((c) => { const a = { ...(c.aprobado || {}) }; if (si) a[f.personaId] = new Date().toISOString(); else delete a[f.personaId]; c.aprobado = a; }, si ? `${f.nombre} aprobó el contrato.` : 'Aprobación quitada.').catch((e) => setError(mensaje(e)));
  const alternarEnvio = (id: string, si: boolean) => setElegidos((s) => { const x = new Set(s); if (si) x.add(id); else x.delete(id); return x; });

  // enviar a revisión: el mensaje sale armado (con {nombre} para cada uno), se edita y SOLO se envía si la corredora lo confirma
  const preparar = async () => {
    setError(''); setForm(null);
    const ids = firmantes.filter((f) => elegidos.has(f.personaId)).map((f) => f.personaId);
    try {
      const r = await api<any>('contratoRevisionPreparar', { negocioId, personaId: ids[0], neutro: ids.length > 1 });
      const nombre = primer(r.persona?.nombre || '');
      setWsp({ texto: nombre ? String(r.texto).replace(new RegExp(`Hola ${nombre}`), 'Hola {nombre}') : r.texto, enviando: false });
    } catch (e) { setError(mensaje(e)); }
  };
  const enviarWsp = async (via?: 'abrir') => {
    if (!wsp) return; setWsp({ ...wsp, enviando: true }); setError('');
    const ids = firmantes.filter((f) => elegidos.has(f.personaId)); const ok: string[] = []; const mal: string[] = []; const espera: string[] = [];
    for (const f of ids) {
      try { const r = await api<any>('contratoRevisionEnviar', { negocioId, personaId: f.personaId, texto: wsp.texto.split('{nombre}').join(primer(f.nombre)), modo: via }); ok.push(f.personaId); if (r?.plantilla) espera.push(primer(f.nombre)); }
      catch (e) { mal.push(`${f.nombre}: ${mensaje(e)}`); }
    }
    await cargar(); alCambio?.();
    if (ok.length) toast(via ? 'Se abrió WhatsApp con el mensaje: adjunta el PDF (botón «Ver el PDF»).'
      : espera.length ? `${espera.join(', ')} no ha${espera.length === 1 ? '' : 'n'} escrito en 24 h: se le${espera.length === 1 ? '' : 's'} mandó el aviso aprobado por WhatsApp y el PDF le${espera.length === 1 ? '' : 's'} llega apenas responda${espera.length === 1 ? '' : 'n'}.`
      : `Contrato enviado por WhatsApp a ${ok.length} ${ok.length === 1 ? 'persona' : 'personas'}.`, via || espera.length ? 7000 : 2600);
    setElegidos((s) => { const x = new Set(s); ok.forEach((id) => x.delete(id)); return x; });
    if (mal.length) { setError(`No se pudo enviar a: ${mal.join(' · ')}`); setWsp((w) => (w ? { ...w, enviando: false } : w)); } else setWsp(null);
  };

  const estado = listo ? <Badge tono="verde" icono="check" ajustar>Aprobado por todos</Badge> : !ultima ? <Badge tono="gris" punto>Sin contrato</Badge> : <Badge tono="amarillo" icono="clock" ajustar>Faltan {faltan.length} por aprobar</Badge>;
  const ocupado = !!form || !!wsp;

  return (
    <div className="tw:flex tw:flex-col tw:gap-5" id="rcPanel">
      <div className="tw:flex tw:items-center tw:gap-3 tw:flex-nowrap">
        <p className="tw:m-0 tw:flex-1 tw:text-xs tw:text-muted">Arma el contrato, envíaselo a los firmantes y marca quiénes lo aprueban. Cuando todos aprueban la última versión, esa misma se envía a firmar en «Contrato firmado».</p>
        {estado}
      </div>

      {/* 1. el contrato */}
      <Seccion titulo="Contrato" acciones={ultima && !ocupado && <MenuMas tamano="sm" etiqueta="Más acciones" opciones={[
        { texto: 'Editar y guardar una versión nueva', icono: 'edit', alTocar: armar },
        { texto: 'Registrar una versión editada (con su archivo)', icono: 'upload', alTocar: () => abrirForm('version') },
      ]} />}>
        {!ultima ? (
          <div className="tw:flex tw:flex-col tw:gap-2.5">
            <p className="tw:m-0 tw:text-xs tw:text-muted">Todavía no hay contrato: «Armar el contrato» llena las condiciones (inicio, plazo, renta, reajuste…) y genera el PDF con la plantilla de Asset. Cada versión que guardes queda archivada con su PDF.</p>
            <div className="tw:flex tw:justify-end"><Boton id="rcArmar" icono="file" onClick={armar}>Armar el contrato</Boton></div>
          </div>
        ) : (
          <>
            <Card relleno={false}>
              <div className="tw:flex tw:items-center tw:gap-3 tw:p-3 tw:flex-nowrap" data-version={ultima.n}>
                <Badge tono="lavanda">V{ultima.n}</Badge>
                <span className="tw:min-w-0 tw:flex-1 tw:text-[13px]"><b>{ultima.generada ? (ultima.n === 1 ? 'Borrador armado en Asset' : 'Armado en Asset') : `Editado por ${DE_TXT[ultima.de]?.replace(/^(La|El|Un|Una) /, '').toLowerCase() || ultima.de}`}</b> · {fdm(ultima.fecha)}{ultima.nota ? <span className="tw:block tw:text-muted">{ultima.nota}</span> : null}</span>
                {ultima.archivo ? <Boton id="rcVer" variante="secundario" icono="eye" onClick={() => setVisor(ultima)}>Ver el PDF</Boton> : <span className="tw:text-xs tw:text-muted">Sin archivo</span>}
              </div>
            </Card>
            {versiones.length > 1 && (
              <details>
                <summary className="tw:cursor-pointer tw:text-xs tw:font-semibold tw:text-muted">Versiones anteriores ({versiones.length - 1})</summary>
                <ul className="tw:list-none tw:m-0 tw:mt-2 tw:p-0 tw:flex tw:flex-col tw:gap-1.5">
                  {[...versiones].slice(0, -1).reverse().map((v) => (
                    <li key={v.n} data-version={v.n} className="tw:flex tw:items-center tw:gap-2.5 tw:text-[13px] tw:flex-nowrap">
                      <Badge tono="gris">V{v.n}</Badge>
                      <span className="tw:min-w-0 tw:flex-1 tw:truncate">{fdm(v.fecha)}{v.nota ? ` · ${v.nota}` : ''}</span>
                      {v.archivo && <Boton tamano="sm" variante="secundario" onClick={() => setVisor(v)}>Ver</Boton>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </Seccion>

      {/* 2. los firmantes: a quiénes se les envía y quiénes aprueban */}
      {ultima && (
        <Seccion titulo={`Firmantes (${firmantes.length})`} ayuda="Marca «Enviar» en quienes recibirán el contrato por WhatsApp, y «Aprueba» cuando ese firmante apruebe el borrador.">
          <div className="tw:flex tw:flex-col tw:gap-2">
            {firmantes.length === 0 && <p className="tw:m-0 tw:text-xs tw:text-muted">Esta versión no tiene firmantes registrados: guarda una versión nueva desde «Armar el contrato».</p>}
            {firmantes.map((f) => {
              const per = persona(f.personaId); const enviosDe = envios.filter((e) => e.personaId === f.personaId); const ult = enviosDe[enviosDe.length - 1]; const sinCel = !per.telefono;
              return (
                <Card key={f.personaId} relleno={false}>
                  <div data-rc-firmante={f.personaId} className="tw:flex tw:items-center tw:gap-4 tw:p-3 tw:flex-nowrap">
                    <div className="tw:min-w-0 tw:flex-1 tw:flex tw:flex-col tw:gap-0.5">
                      <div className="tw:flex tw:items-center tw:gap-2 tw:flex-nowrap"><b className="tw:text-[13px] tw:truncate">{f.nombre}</b><Badge tono={ROL_TONO[f.rol] || 'gris'}>{f.rol}</Badge></div>
                      <small className="tw:text-xs tw:text-muted tw:truncate">{[per.telefono || 'Sin celular', per.email].filter(Boolean).join(' · ')}</small>
                      <small className="tw:text-xs tw:text-muted" data-rc-estado={f.personaId}>
                        {ap[f.personaId] ? `Aprobó el ${fdm(ap[f.personaId])}` : ult ? `Se le envió la V${ult.version} el ${fdm(ult.fecha)}${ult.automatico ? '' : ' (abierto en WhatsApp)'}` : 'Sin enviar'}
                      </small>
                    </div>
                    <div className="tw:flex-none tw:flex tw:flex-col tw:gap-2">
                      <Checkbox id={`rcEnviar-${f.personaId}`} marcado={elegidos.has(f.personaId)} alCambiar={(si) => alternarEnvio(f.personaId, si)} deshabilitado={ocupado || sinCel || !ultima.archivo} etiqueta="Enviar a revisión" descripcion={sinCel ? 'Sin celular en su ficha' : undefined} />
                      <Checkbox id={`rcAprueba-${f.personaId}`} marcado={!!ap[f.personaId]} alCambiar={(si) => aprueba(f, si)} deshabilitado={ocupado} etiqueta="Aprueba el borrador" />
                    </div>
                  </div>
                </Card>
              );
            })}
            {wsp ? (
              <div className="tw:flex tw:flex-col tw:gap-2">
                <Textarea etiqueta={`Mensaje por WhatsApp para ${elegidos.size === 1 ? firmantes.find((f) => elegidos.has(f.personaId))?.nombre : `${elegidos.size} personas`} (va con el PDF adjunto; {'{nombre}'} se reemplaza por el nombre de cada uno)`} id="rcMensaje" rows={7} value={wsp.texto} onChange={(e) => setWsp((w) => (w ? { ...w, texto: e.target.value } : w))} />
                {error && <p className="error tw:m-0 tw:text-[13px]" id="rcError">{error}</p>}
                <div className="tw:flex tw:items-center tw:justify-end tw:gap-2 tw:flex-nowrap">
                  {elegidos.size === 1 && <MenuMas tamano="md" etiqueta="Otras formas de enviarlo" opciones={[{ texto: 'Abrir en WhatsApp (yo envío el PDF)', icono: 'whatsapp', disabled: wsp.enviando, alTocar: () => enviarWsp('abrir') }]} />}
                  <Boton variante="secundario" onClick={() => { setWsp(null); setError(''); }} disabled={wsp.enviando}>Cancelar</Boton>
                  <Boton id="rcEnviar" variante="exito" icono="whatsapp" cargando={wsp.enviando} onClick={() => enviarWsp()}>Enviar por WhatsApp ({elegidos.size})</Boton>
                </div>
              </div>
            ) : (
              <div className="tw:flex tw:justify-end"><Boton id="rcRevisar" variante="exito" icono="whatsapp" disabled={ocupado || elegidos.size === 0} onClick={preparar}>{elegidos.size ? `Enviar a revisión (${elegidos.size})` : 'Elige a quién enviarlo'}</Boton></div>
            )}
          </div>
        </Seccion>
      )}

      {/* 3. comentarios */}
      <Seccion titulo={`Comentarios${comentarios.length ? ` (${comentarios.length})` : ''}`} acciones={!ocupado && <Boton id="rcComentario" tamano="sm" variante="secundario" icono="plus" disabled={!ultima} onClick={() => abrirForm('comentario')}>Agregar comentario</Boton>}>
        {comentarios.length === 0 && !form && <p className="tw:m-0 tw:text-xs tw:text-muted">Los comentarios de cada firmante y de la corredora quedan acá, con la versión a la que se refieren.</p>}
        {comentarios.length > 0 && (
          <ul className="tw:list-none tw:m-0 tw:p-0 tw:flex tw:flex-col tw:gap-2">
            {[...comentarios].reverse().map((c, i) => (
              <li key={i} className="tw:flex tw:items-start tw:gap-2.5 tw:text-[13px] tw:flex-nowrap">
                <span className="tw:w-11 tw:flex-none tw:pt-0.5 tw:text-xs tw:text-muted">{fdm(c.fecha)}</span>
                <Badge tono="gris">V{c.version}</Badge>
                <span className="tw:min-w-0 tw:flex-1"><b>{DE_TXT[c.de] || c.de}:</b> {c.texto}</span>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      {form && (
        <Seccion titulo={form.tipo === 'version' ? 'Registrar una versión editada' : 'Nuevo comentario'}>
          <div className={form.tipo === 'comentario' ? 'tw:grid tw:grid-cols-2 tw:gap-3' : ''}>
            <Select etiqueta={form.tipo === 'version' ? 'La editó' : 'Lo hace'} opciones={DE} value={form.de} onChange={(e) => setForm((x) => (x ? { ...x, de: e.target.value } : x))} />
            {form.tipo === 'comentario' && <Select etiqueta="Sobre la versión" opciones={versiones.map((v): [string, string] => [String(v.n), `V${v.n}`])} value={String(form.version)} onChange={(e) => setForm((x) => (x ? { ...x, version: Number(e.target.value) } : x))} />}
          </div>
          <Textarea etiqueta={form.tipo === 'version' ? <>Nota <span className="tw:font-normal tw:text-muted">(qué cambió)</span></> : 'Comentario'} id="rcTexto" rows={3} value={form.texto} onChange={(e) => setForm((x) => (x ? { ...x, texto: e.target.value } : x))} />
          {form.tipo === 'version' && (
            <div className="tw:flex tw:items-center tw:gap-2 tw:flex-nowrap">
              <input ref={entrada} type="file" style={{ display: 'none' }} accept=".pdf,application/pdf" onChange={(e) => { setArchivo(e.target.files?.[0] ?? null); e.target.value = ''; }} />
              <Boton variante="secundario" icono="upload" onClick={() => entrada.current?.click()}>{archivo ? 'Cambiar archivo' : 'Adjuntar el PDF'}</Boton>
              <span className="tw:min-w-0 tw:flex-1 tw:truncate tw:text-xs tw:text-muted">{archivo ? archivo.name : 'Solo PDF: es el que se enviará a firmar si se aprueba'}</span>
            </div>
          )}
          {form.tipo === 'version' && Object.keys(ap).length > 0 && <p className="tw:m-0 tw:text-xs tw:text-muted">Al registrar una versión nueva se anulan las aprobaciones: todos tienen que volver a aprobar.</p>}
          {error && <p className="error tw:m-0 tw:text-[13px]" id="rcError">{error}</p>}
          <div className="tw:flex tw:items-center tw:justify-end tw:gap-2 tw:flex-nowrap">
            <Boton variante="secundario" onClick={() => { setForm(null); setError(''); }} disabled={trabajando}>Cancelar</Boton>
            <Boton id="rcGuardar" icono="check" cargando={trabajando} onClick={registrar}>Registrar</Boton>
          </div>
        </Seccion>
      )}
      {error && !form && !wsp && <p className="error tw:m-0 tw:text-[13px]">{error}</p>}
      {visor?.archivo && <VisorContrato negocioId={negocioId} version={visor} alCerrar={() => setVisor(null)} />}
    </div>
  );
}
