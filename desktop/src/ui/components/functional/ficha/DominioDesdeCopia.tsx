// modal-150: «Leer desde la copia de dominio». El corredor elige una copia de dominio vigente (un PDF o una foto) —o una que ya
// está entre los documentos de la propiedad—, Asset la lee con IA y le MUESTRA lo que encontró para que lo confirme:
// fojas, número, año y Conservador de la inscripción de dominio (y el rol, si la propiedad no lo tiene), el resumen, las alertas
// (hipotecas, embargos, prohibiciones), si la copia es reciente y si el dueño inscrito coincide con el de la ficha.
// Nada se guarda sin que confirme: «Guardar en la ficha» actualiza solo esos datos de la propiedad (por el mismo camino que la
// edición de la ficha: inmoPropGuardar). La lectura la hace la API (POST /propiedades/:id/dominio-ia).
//   · desde React:        abrirLecturaDominio(propiedadId, () => recargar())          (al guardar)
//   · desde el JS antiguo: window.Ventanas.abrir('inmo.dominioCopia', { propiedadId, alTerminar: (guardado) => … }, { clave: 'modal-150', ancho: true })
//     (ahí quien llama cierra o vuelve a abrir su ventana: este modal es el único que hay a la vez)
// Los id (#dcLista, #dcSubir, #dcLeer, #dcLeyendo, #dcResumen, #dcAlertas, #dcAviso, #dcDueno, #dcFojas, #dcNumero, #dcAnio,
// #dcConservador, #dcRol, #dcErr, #mCancel, #mOk) los usan las pruebas.
import { useEffect, useState } from 'react';
import Boton from '../../ui/Boton';
import Icono from '../../ui/Icono';
import Input from '../../ui/Input';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../ui/Ventana';
import { NOTA, Opcion } from '../gestion/editor-pdf/Modales';
import { ErrorVentana } from '../negocios/VentanasAntiguas';
import { api } from '../../../utils/api';
import { abrirModal, cerrarModal } from '../../../utils/modal';
import { toast } from '../../../utils/app';
import { cx } from '../../../utils/cx';
import { fecha } from '../../../utils/formato';
import type { ICartera, IDocumentoPropiedad, IPropiedad } from '../../../store/interfaces/propiedad.interface';
import type { IPersona } from '../../../store/interfaces/persona.interface';

/** lo que devuelve la API al leer la copia de dominio (no se guarda: es una propuesta) */
export interface IPropuestaDominio {
  legible: boolean; fojas: string; numeroInscripcion: string; anioInscripcion: string; conservador: string; rol: string;
  propietarios: { nombre: string; rut?: string }[]; deslindes?: string; vigente: boolean | null; emision: string; alertas: string[]; resumen: string;
}

export const TIPO_COPIA = 'Copia de dominio';
const esCopia = (d: IDocumentoPropiedad) => d.tipo === TIPO_COPIA || /dominio/i.test(d.nombre);

// ---- comparar el dueño inscrito con el de la ficha (sin tildes ni mayúsculas, y sin importar el orden de los nombres) ----
const palabras = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter((x) => x.length > 1);
const soloRut = (s?: string) => String(s || '').replace(/[^0-9kK]/g, '').toUpperCase();
export function mismaPersona(a: { nombre: string; rut?: string }, b: { nombre: string; rut?: string }): boolean {
  if (soloRut(a.rut).length > 6 && soloRut(b.rut).length > 6) return soloRut(a.rut) === soloRut(b.rut);
  const x = palabras(a.nombre); const y = palabras(b.nombre);
  if (!x.length || !y.length) return false;
  const comunes = x.filter((w) => y.includes(w)).length;
  return comunes >= Math.min(2, x.length, y.length);
}
/** los dueños que figuran en la ficha: las personas vinculadas como propietario (o, si no hay, el nombre que quedó escrito en la ficha) */
function duenosDeFicha(p: IPropiedad, personas: IPersona[]): { nombre: string; rut?: string }[] {
  const l = (p.vinculos || []).filter((v) => v.rol === 'propietario').map((v) => personas.find((q) => q.id === v.personaId)).filter((q): q is IPersona => !!q && !q.reservado && !!q.nombre).map((q) => ({ nombre: q.nombre, rut: q.rut }));
  const escrito = String(p.ficha?.propietarioNombre || '').trim();
  return l.length ? l : escrito ? [{ nombre: escrito }] : [];
}

const diasDesde = (iso: string) => Math.floor((Date.now() - new Date(iso + 'T12:00:00').getTime()) / 864e5);
const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

type TFase = 'cargando' | 'elegir' | 'leyendo' | 'confirmar';

export function DominioDesdeCopia({ propiedadId, alTerminar }: { propiedadId: string; alTerminar: (guardado: boolean) => void }) {
  const [fase, setFase] = useState<TFase>('cargando');
  const [prop, setProp] = useState<IPropiedad | null>(null); const [personas, setPersonas] = useState<IPersona[]>([]);
  const [docs, setDocs] = useState<IDocumentoPropiedad[]>([]); const [sel, setSel] = useState('');
  const [error, setError] = useState(''); const [subiendo, setSubiendo] = useState(false); const [guardando, setGuardando] = useState(false);
  const [lectura, setLectura] = useState<IPropuestaDominio | null>(null);
  const [v, setV] = useState({ fojas: '', numero: '', anio: '', conservador: '', rol: '' });

  useEffect(() => {
    let vivo = true;
    api<ICartera>('inmoListar').then((c) => {
      if (!vivo) return;
      const p = c.propiedades.find((x) => x.id === propiedadId) || null;
      setProp(p); setPersonas(c.personas);
      const l = [...(p?.documentos || [])].sort((a, b) => Number(esCopia(b)) - Number(esCopia(a)));
      setDocs(l); setSel(l.find(esCopia)?.id || ''); setFase('elegir');
      if (!p) setError('No encontré la propiedad.');
    }).catch((e) => { if (vivo) { setError(mensaje(e)); setFase('elegir'); } });
    return () => { vivo = false; };
  }, [propiedadId]);

  const leer = async (documentoId: string) => {
    setError(''); setFase('leyendo');
    try {
      const r = await api<IPropuestaDominio>('propLeerDominio', propiedadId, documentoId);
      if (!r.legible) { setError('No pude leer esa copia: se ve borrosa o no es una copia de dominio. Prueba con otra o con una foto más clara.'); setFase('elegir'); return; }
      setLectura(r);
      const f = (prop?.ficha || {}) as Record<string, unknown>; const t = (x: unknown) => String(x ?? '').trim();
      // lo leído manda; si no se pudo leer un dato, queda el que ya tiene la ficha
      setV({ fojas: r.fojas || t(f.fojas), numero: r.numeroInscripcion || t(f.numeroInscripcion), anio: r.anioInscripcion || t(f.anioInscripcion), conservador: r.conservador || t(f.conservador), rol: prop?.rol ? '' : r.rol || '' });
      setFase('confirmar');
    } catch (e) { setError(mensaje(e)); setFase('elegir'); }
  };

  /** abre el selector de archivos del computador: lo elegido se sube a la propiedad como «Copia de dominio» y se lee */
  const subir = async () => {
    setError(''); setSubiendo(true);
    try {
      const antes = new Set(docs.map((d) => d.id));
      const r = await api<IPropiedad | null>('inmoDocElegir', propiedadId, TIPO_COPIA);
      if (!r) { setSubiendo(false); return; }
      const l = [...(r.documentos || [])].sort((a, b) => Number(esCopia(b)) - Number(esCopia(a)));
      setDocs(l);
      const nuevo = (r.documentos || []).find((d) => !antes.has(d.id));
      setSubiendo(false);
      if (nuevo) { setSel(nuevo.id); await leer(nuevo.id); }
    } catch (e) { setError(mensaje(e)); setSubiendo(false); }
  };

  const guardar = async () => {
    const t = (x: string) => x.trim();
    const ficha = Object.fromEntries(Object.entries({ fojas: t(v.fojas), numeroInscripcion: t(v.numero), anioInscripcion: t(v.anio), conservador: t(v.conservador) }).filter(([, x]) => x));
    if (!Object.keys(ficha).length && !t(v.rol)) { setError('Escribe al menos las fojas o el número de la inscripción.'); return; }
    setGuardando(true); setError('');
    try {
      // solo esos datos: lo demás de la ficha no se toca
      await api('inmoPropGuardar', { id: propiedadId, ...(t(v.rol) && !prop?.rol ? { rol: t(v.rol) } : {}), ficha });
      try { await window.Inmo.cargar(); } catch { /* la lista se pone al día sola */ }
      toast('Inscripción de dominio guardada en la ficha.');
      alTerminar(true);
    } catch (e) { setError(mensaje(e)); setGuardando(false); }
  };

  const f = (prop?.ficha || {}) as Record<string, unknown>; const hoy = (k: string) => String(f[k] ?? '').trim();
  const campo = (k: keyof typeof v, ficha: string) => ({ value: v[k], onChange: (e: { target: { value: string } }) => { setV((x) => ({ ...x, [k]: e.target.value })); setError(''); },
    ayuda: ficha && ficha !== v[k].trim() ? `En la ficha: ${ficha}` : undefined });

  // ---- avisos de la lectura ----
  const avisos: string[] = [];
  if (lectura) {
    const dias = lectura.emision ? diasDesde(lectura.emision) : null;
    if (lectura.vigente === false) avisos.push('Esta copia no figura como vigente: pide una nueva al Conservador antes de firmar.');
    else if (dias != null && dias > 30) avisos.push(`La copia no es reciente: se emitió el ${fecha(lectura.emision)} (hace ${dias} días). Pide una vigente, de menos de 30 días.`);
    if (prop?.rol && lectura.rol && lectura.rol.replace(/\D/g, '') !== String(prop.rol).replace(/\D/g, '')) avisos.push(`El rol de la copia (${lectura.rol}) es distinto del de la ficha (${prop.rol}). El de la ficha no se cambia.`);
  }
  const duenos = prop ? duenosDeFicha(prop, personas) : [];
  const sinCoincidir = (lectura?.propietarios || []).filter((x) => duenos.length > 0 && !duenos.some((d) => mismaPersona(x, d)));
  const coincide = !!lectura?.propietarios.length && duenos.length > 0 && sinCoincidir.length === 0;
  const cancelar = () => alTerminar(false);

  const cabecera = <VentanaCabecera icono="sparkle" titulo="Leer desde la copia de dominio" cerrable={fase !== 'leyendo'}
    descripcion={fase === 'confirmar' ? 'Revisa lo que leí: puedes corregirlo antes de guardar en la ficha.' : prop ? `${prop.codigo} · ${prop.titulo}` : undefined} onCerrar={cancelar} />;

  if (fase === 'cargando') return <>{cabecera}<VentanaCuerpo><div className="tw:flex tw:items-center tw:gap-3 tw:text-sm tw:text-muted"><div className="spinner" />Cargando…</div></VentanaCuerpo></>;

  if (fase === 'leyendo') return <>
    {cabecera}
    <VentanaCuerpo>
      <div id="dcLeyendo" className="tw:flex tw:flex-col tw:items-center tw:gap-3 tw:py-8 tw:text-sm tw:text-muted">
        <div className="spinner" />
        <b className="tw:text-text">Leyendo la copia de dominio…</b>
        <span>Puede tardar unos 20 segundos.</span>
      </div>
    </VentanaCuerpo>
    <VentanaPie><Boton id="mCancel" variante="secundario" onClick={cancelar}>Cancelar</Boton></VentanaPie>
  </>;

  if (fase === 'elegir') return <>
    {cabecera}
    <VentanaCuerpo>
      <div className="tw:flex tw:flex-col tw:gap-3">
        <p className="tw:m-0 tw:text-sm tw:leading-relaxed">Elige la copia de dominio vigente de la propiedad (un PDF o una foto). Asset la lee y te muestra lo que encontró para que lo confirmes: no se guarda nada sin que tú lo apruebes.</p>
        {docs.length > 0 ? (
          <div id="dcLista" role="radiogroup" aria-label="Documentos de la propiedad" className="tw:flex tw:flex-col tw:gap-2.5">
            {docs.map((d) => (
              <Opcion key={d.id} type="radio" name="dcDoc" data-doc={d.id} checked={sel === d.id} onChange={() => { setSel(d.id); setError(''); }}>
                <b className="tw:font-semibold">{d.nombre}</b>{esCopia(d) && <span className="tw:ml-2 tw:text-xs tw:text-green-softink">copia de dominio</span>}
                <small className="tw:block tw:text-xs tw:text-muted">{fecha(d.fecha)}</small>
              </Opcion>
            ))}
          </div>
        ) : <p className={NOTA}>La propiedad todavía no tiene documentos. Sube la copia de dominio y la leo de inmediato.</p>}
        <div className="tw:flex tw:justify-end">
          <Boton id="dcSubir" variante="secundario" tamano="sm" icono="upload" cargando={subiendo} onClick={subir}>{docs.length ? 'Subir otro archivo…' : 'Elegir un PDF o una foto…'}</Boton>
        </div>
        <ErrorVentana id="dcErr" texto={error} />
      </div>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={cancelar} disabled={subiendo}>Cancelar</Boton>
      <Boton id="dcLeer" icono="sparkle" disabled={!sel || subiendo} onClick={() => leer(sel)}>Leer esta copia</Boton>
    </VentanaPie>
  </>;

  return <>
    {cabecera}
    <VentanaCuerpo>
      <div className="tw:flex tw:flex-col tw:gap-3">
        {lectura?.resumen && <p id="dcResumen" className="tw:m-0 tw:text-sm tw:leading-relaxed">{lectura.resumen}</p>}

        {!!lectura?.alertas.length && (
          <div id="dcAlertas" role="alert" className="tw:flex tw:flex-col tw:gap-1.5 tw:rounded-control tw:bg-yellow-soft tw:p-3 tw:text-yellow-softink">
            <span className="tw:flex tw:items-center tw:gap-1.5 tw:text-[13px] tw:font-bold"><Icono nombre="alert" tam={15} /> Ojo: la copia menciona {lectura.alertas.length === 1 ? 'esto' : 'estas cosas'}</span>
            <ul className="tw:m-0 tw:pl-5 tw:text-[13px] tw:leading-relaxed">{lectura.alertas.map((a, i) => <li key={i}>{a}</li>)}</ul>
          </div>
        )}

        {avisos.length > 0 && (
          <div id="dcAviso" role="alert" className="tw:flex tw:flex-col tw:gap-1 tw:rounded-control tw:bg-yellow-soft tw:p-3 tw:text-[13px] tw:leading-relaxed tw:text-yellow-softink">
            {avisos.map((a, i) => <span key={i} className="tw:flex tw:items-start tw:gap-1.5"><span className="tw:mt-0.5 tw:flex-none"><Icono nombre="alert" tam={14} /></span>{a}</span>)}
          </div>
        )}

        {(lectura?.propietarios.length ?? 0) > 0 && (
          <div id="dcDueno" data-estado={sinCoincidir.length ? 'distinto' : coincide ? 'igual' : 'sin-ficha'}
            className={cx('tw:flex tw:flex-col tw:gap-1 tw:rounded-control tw:p-3 tw:text-[13px] tw:leading-relaxed', sinCoincidir.length ? 'tw:bg-yellow-soft tw:text-yellow-softink' : coincide ? 'tw:bg-green-soft tw:text-green-softink' : 'tw:bg-gray-soft tw:text-gray-softink')}>
            {sinCoincidir.length
              ? sinCoincidir.map((x, i) => <span key={i}><b>Ojo:</b> el dueño inscrito es {x.nombre}{x.rut ? ` (${x.rut})` : ''}, en la ficha figura {duenos.map((d) => d.nombre).join(' y ')}.</span>)
              : coincide ? <span><b>El dueño inscrito coincide con la ficha:</b> {lectura!.propietarios.map((x) => x.nombre).join(' y ')}.</span>
                : <span>Dueño inscrito: {lectura!.propietarios.map((x) => x.nombre).join(' y ')}. En la ficha no hay un propietario para comparar.</span>}
          </div>
        )}

        <div className="tw:grid tw:grid-cols-2 tw:gap-3">
          <Input etiqueta="Fojas de la inscripción" id="dcFojas" autoComplete="off" pendiente={!v.fojas.trim()} {...campo('fojas', hoy('fojas'))} />
          <Input etiqueta="Número" id="dcNumero" autoComplete="off" pendiente={!v.numero.trim()} {...campo('numero', hoy('numeroInscripcion'))} />
          <Input etiqueta="Año del registro" id="dcAnio" inputMode="numeric" autoComplete="off" placeholder="2015" {...campo('anio', hoy('anioInscripcion'))} />
          <Input etiqueta="Conservador de" id="dcConservador" autoComplete="off" placeholder="Santiago" {...campo('conservador', hoy('conservador'))} />
          {!prop?.rol && <div className="tw:col-span-2"><Input etiqueta="Rol de avalúo (la propiedad no lo tiene)" id="dcRol" autoComplete="off" placeholder="1234-56" {...campo('rol', '')} /></div>}
        </div>
        <ErrorVentana id="dcErr" texto={error} />
      </div>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={cancelar} disabled={guardando}>Cancelar</Boton>
      <Boton id="mOk" icono="save" cargando={guardando} onClick={guardar}>Guardar en la ficha</Boton>
    </VentanaPie>
  </>;
}

/** abre la lectura de la copia de dominio de una propiedad desde React; `alGuardar` se llama solo si el corredor confirmó y se guardó */
export function abrirLecturaDominio(propiedadId: string, alGuardar?: () => void) {
  abrirModal(<DominioDesdeCopia propiedadId={propiedadId} alTerminar={(guardado) => { cerrarModal(); if (guardado) alGuardar?.(); }} />, { clave: 'modal-150', ancho: true });
}
