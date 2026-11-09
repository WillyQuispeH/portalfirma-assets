// «Gestionar una propiedad», documentos: elegir la plantilla de la cuenta, el formulario prellenado con la ficha,
// el CRM y los datos del corredor, revisar y enviar a firmar, y el seguimiento de la firma.
// Con el kit: Card (Tarjeta), Input, Select, ItemLista, Avatar, Badge y Boton.
/* eslint-disable @typescript-eslint/no-explicit-any -- datos del proceso principal sin tipos */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Boton from '../../../ui/Boton';
import Badge from '../../../ui/Badge';
import Card from '../../../ui/Card';
import Input from '../../../ui/Input';
import Select from '../../../ui/Select';
import Avatar from '../../../ui/Avatar';
import Icono from '../../../ui/Icono';
import ItemLista from '../../../ui/ItemLista';
import EstadoVacio from '../../../ui/EstadoVacio';
import { toast } from '../../../../utils/app';
import {
  Ag, Campos, Cargando, Casilla, ErrorTexto, Etiqueta, Falta, Grupo, Lista, Muted, Nota, Tarjeta, TarjetaCargando, W,
  api, cleanRut, estadoFirma, fechaCorta, norm, useTarjeta,
} from './comun';
import { enfocar } from './Propiedad';
import { docNuevo, formulario, operaciones, plantillas, resultado } from './gestion';

const FUENTE: Record<string, string> = { propiedad: 'de la ficha', persona: 'del CRM', hoy: 'hoy', corredor: 'tus datos', cuenta: 'de la cuenta' };
const icTpl = (n: string) => (/arriendo|arrendamiento/i.test(n) ? 'key' : /compraventa|promesa|oferta/i.test(n) ? 'coins' : /visita|acta/i.test(n) ? 'pin' : /poder|mandato|corretaje/i.test(n) ? 'briefcase' : 'file');
export const IconoFila = ({ nombre }: { nombre: string }) => <span className="tw:grid tw:place-items-center tw:size-9 tw:rounded-xl tw:bg-lav-soft tw:text-lav-softink"><Icono nombre={nombre} tam={16} /></span>;

// ---------- 3. qué documento ----------
export function Plantillas({ p }: { p: any }) {
  const { terminar } = useTarjeta();
  const [q, setQ] = useState(''); const [buscar, setBuscar] = useState('');
  const [lista, setLista] = useState<any[] | null>(null); const [error, setError] = useState('');
  const entrada = useRef<HTMLInputElement>(null);
  useEffect(() => enfocar(entrada), []);
  useEffect(() => { const t = setTimeout(() => setBuscar(q.trim().length > 1 ? q.trim() : ''), 450); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    let vivo = true; setLista(null); setError('');
    api<any[]>('docPlantillas', { texto: buscar, propId: p.id }).then((l) => { if (vivo) { setLista(l); setTimeout(() => Ag().bajar(), 0); } }, (e) => { if (vivo) setError(e.message); });
    return () => { vivo = false; };
  }, [buscar, p.id]);
  const elegir = (t: any) => { terminar(<>Documento: <b>{t.nombre}</b></>, `Documento: ${t.nombre}`, () => plantillas(p)); formulario(p, t); };
  const crear = () => { terminar(<>Documento nuevo: <b>{buscar}</b></>, `Documento nuevo: ${buscar}`, () => plantillas(p)); docNuevo({ propId: p.id, titulo: buscar }); };
  const filaCrear = buscar && lista && (
    <ItemLista className="ga-tp ga-crear" data-crear alTocar={crear} flecha media={<IconoFila nombre="filePlus" />}
      titulo={`${lista.length ? '¿No es ninguno? ' : 'No hay una plantilla así. '}Crear «${buscar}» con Asset`}
      detalle={`Asset lo arma en PDF con los datos de ${p.codigo} y sus personas, y lo envía a firmar.`} />
  );
  return (
    <Tarjeta n={3} titulo="¿Qué documento quieres hacer?" sub={`Plantillas de tu cuenta en la Notaría virtual · ordenadas para ${p.codigo}`}>
      <Input ref={entrada} data-q icono="search" placeholder="Busca: contrato de arriendo, promesa, mandato, acta de entrega…" spellCheck={false} aria-label="Buscar plantilla" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="ga-tpls">
        {error ? <ErrorTexto texto={error} /> : !lista ? <Cargando texto={buscar ? `Buscando «${buscar}»…` : 'Buscando tus plantillas…'} /> : (
          <Lista>
            {lista.map((t) => (
              <ItemLista key={t.id} className="ga-tp" data-t={t.id} alTocar={() => elegir(t)} flecha media={<IconoFila nombre={icTpl(t.nombre)} />} titulo={t.nombre} detalle={t.descripcion} />
            ))}
            {!lista.length && !filaCrear && <EstadoVacio compacto texto="No encontré plantillas con esa búsqueda." className="tw:px-3 tw:py-2" />}
            {filaCrear}
          </Lista>
        )}
      </div>
    </Tarjeta>
  );
}

// ---------- 4. formulario prellenado ----------
const tipoInput = (c: any) => (c.tipo === 'date' ? 'date' : c.tipo === 'email' ? 'email' : c.tipo === 'phone' ? 'tel' : 'text');
const cap = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export function Formulario({ p, t }: { p: any; t: any }) {
  const { node, terminar } = useTarjeta();
  const [f, setF] = useState<any>(null); const [error, setError] = useState('');
  const [valores, setValores] = useState<Record<string, string>>({});
  const [fuentes, setFuentes] = useState<Record<string, string>>({});
  const [personas, setPersonas] = useState<Record<string, string>>({});
  const [ligar, setLigar] = useState(true);
  const [revisando, setRevisando] = useState(false);
  const [rev, setRev] = useState<any>(null); // lo que devuelve docRevisar: se muestra antes de enviar
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    let vivo = true;
    api('docFormulario', { plantilla: t.id, propId: p.id, personas: {} }).then((x: any) => {
      if (!vivo) return;
      const v: Record<string, string> = {}; const fu: Record<string, string> = {}; const ps: Record<string, string> = {};
      for (const g of x.grupos) { if (g.firmante && g.rol !== 'corredor') ps[g.grupo] = g.personaId || ''; for (const c of g.campos) { v[c.id] = c.valor || ''; if (c.fuente) fu[c.id] = c.fuente; } }
      setValores(v); setFuentes(fu); setPersonas(ps); setF(x); setTimeout(() => Ag().bajar(), 0);
    }, (e) => { if (vivo) setError(e.message); });
    return () => { vivo = false; };
  }, [p.id, t.id]);

  if (error) return <Tarjeta n={4} titulo={t.nombre}><ErrorTexto texto={error} /></Tarjeta>;
  if (!f) return <TarjetaCargando texto={`Preparando «${t.nombre}» con los datos de ${p.codigo}…`} />;

  const campos = f.grupos.flatMap((g: any) => g.campos);
  const total = campos.length; const llenos = campos.filter((c: any) => c.valor).length;
  const faltan = campos.filter((c: any) => c.requerido && !String(valores[c.id] || '').trim());
  const pers = [...f.personas].sort((a: any, b: any) => (b.rolEnPropiedad ? 1 : 0) - (a.rolEnPropiedad ? 1 : 0) || a.nombre.localeCompare(b.nombre, 'es'));
  const elegirPersona = (g: any, id: string) => {
    const c = f.personas.find((x: any) => x.id === id);
    setPersonas((s) => ({ ...s, [g.grupo]: id }));
    setValores((s) => { const n = { ...s }; for (const x of g.campos) if (x.campoPersona) n[x.id] = c ? (c[x.campoPersona] || '') : ''; return n; });
    setFuentes((s) => { const n = { ...s }; for (const x of g.campos) if (x.campoPersona) delete n[x.id]; return n; });
  };
  const objeto = () => {
    const v: Record<string, string> = {}; for (const c of campos) v[c.id] = String(valores[c.id] || '').trim();
    const ps: Record<string, string | null> = {}; for (const k of Object.keys(personas)) ps[k] = personas[k] || null;
    return { plantilla: t.id, propId: p.id, valores: v, personas: ps, negocioId: f.negocio?.pideFirma && ligar ? f.negocio.id : null };
  };
  const revisar = async () => {
    if (faltan.length) { node.querySelector<HTMLInputElement>('.falta input')?.focus(); return toast('Completa los datos marcados.'); }
    setRevisando(true);
    let r: any; try { r = await api('docRevisar', objeto()); } catch (e) { setRevisando(false); return toast((e as Error).message, 5000); }
    setRevisando(false);
    if (r.faltan.length) return toast('Faltan datos: ' + r.faltan.join(', '), 6000);
    setRev(r); setTimeout(() => Ag().bajar(), 0);
  };
  const enviar = async () => {
    const o = objeto(); setEnviando(true);
    let res: any; try { res = await api('docGenerar', o); } catch (e) { setEnviando(false); return toast((e as Error).message, 6000); }
    terminar(<><b>{f.plantilla.nombre}</b> · {p.codigo} enviado a firmar</>, `${f.plantilla.nombre} · ${p.codigo} enviado a firmar`);
    resultado(res, p); W.AssetRefrescar?.();
  };
  const bloqueado = !!rev;

  return (
    <Tarjeta n={4} titulo={f.plantilla.nombre} sub={<>{p.codigo} · completé <b>{llenos} de {total}</b> datos con la ficha, el CRM y tus datos</>}
      falta={!rev && <Falta texto={faltan.length ? `Faltan ${faltan.length} ${faltan.length === 1 ? 'dato' : 'datos'}` : ''} ok="Todo completo" />}
      pie={!rev && <>
        <Boton variante="fantasma" data-otro onClick={() => plantillas(p)}>Otro documento</Boton>
        <Boton data-rev icono="sign" cargando={revisando} onClick={revisar}>Revisar y enviar a firmar</Boton>
      </>}>
      {f.grupos.map((g: any) => (
        <Grupo key={g.grupo} data-g={g.grupo} titulo={g.titulo} extra={g.rolTxt}>
          {g.firmante && g.rol !== 'corredor' && (
            <Select etiqueta={<span className="tw:inline-flex tw:items-center tw:gap-1.5"><Icono nombre="user" tam={13} /> Persona</span>} data-per={g.grupo} clasesCampo="ga-per"
              value={personas[g.grupo] || ''} disabled={bloqueado} onChange={(e) => elegirPersona(g, e.target.value)}>
              <option value="">Persona nueva (escribe sus datos)</option>
              {pers.map((c: any) => <option key={c.id} value={c.id}>{c.nombre} · {c.rut}{c.rolEnPropiedad ? ' · ' + c.rolEnPropiedad : ''}</option>)}
            </Select>
          )}
          <Campos>
            {g.campos.map((c: any) => (
              <Input key={c.id} etiqueta={<Etiqueta texto={cap(c.etiqueta)} opcional={!c.requerido} fuente={FUENTE[fuentes[c.id]]} />}
                pendiente={c.requerido && !String(valores[c.id] || '').trim()} resaltado={!!fuentes[c.id]}
                data-c={c.id} data-cp={c.campoPersona || ''} data-req={c.requerido ? 1 : ''} type={tipoInput(c)} spellCheck={false} disabled={bloqueado}
                value={valores[c.id] ?? ''} onChange={(e) => setValores((s) => ({ ...s, [c.id]: e.target.value }))} />
            ))}
          </Campos>
        </Grupo>
      ))}
      {f.aviso && <Nota>{f.aviso}</Nota>}
      {f.negocio?.pideFirma && (
        <Casilla className="ga-neg" data-neg checked={ligar} disabled={bloqueado} onChange={(e) => setLigar(e.target.checked)}>
          Ligar a la etapa «{f.negocio.etapa}» del negocio {f.negocio.titulo}: cuando se firme, el negocio avanza solo.
        </Casilla>
      )}
      {rev && (
        <Confirmacion firmantes={rev.firmantes.map((s: any) => <><b>{s.titulo}:</b> {s.nombre}{s.rut ? ' · ' + s.rut : ''}{s.email ? ' · ' + s.email : ''}</>)}
          nota={objeto().negocioId ? `Queda ligado al negocio ${f.negocio.titulo} (${f.negocio.etapa}).` : ''}
          cobro="Se cobra del saldo de Portalfirma y cada firmante recibe su enlace para firmar."
          enviando={enviando} textoEnviando="Generando y enviando…" alEditar={() => setRev(null)} alEnviar={enviar} />
      )}
    </Tarjeta>
  );
}

/** «Revisa antes de enviar a firmar»: firmantes, cobro y los botones para volver o enviar (un Card amarillo) */
export function Confirmacion({ firmantes, nota, cobro, extra, falta, enviando, textoEnviando, alEditar, alEnviar }: {
  firmantes: ReactNode[]; nota?: string; cobro: string; extra?: ReactNode; falta?: string; enviando: boolean; textoEnviando: string; alEditar: () => void; alEnviar: () => void;
}) {
  return (
    <div className="ga-conf">
      <Card tono="amarillo" titulo={<span className="tw:flex tw:items-center tw:gap-2"><Icono nombre="alert" tam={16} />Revisa antes de enviar a firmar</span>}
        pie={<div className="ga-conf-pie tw:flex tw:flex-wrap tw:items-center tw:justify-end tw:gap-2">
          <span className="tw:mr-auto">{falta && <Falta texto={falta} />}</span>
          <Boton variante="fantasma" data-edit disabled={enviando} onClick={alEditar}>Volver a editar</Boton>
          <Boton data-send icono="sign" cargando={enviando} onClick={alEnviar}>{enviando ? textoEnviando : 'Confirmar y enviar a firmar'}</Boton>
        </div>}>
        <div className="tw:flex tw:flex-col tw:gap-3 tw:text-text">
          <ul className="tw:m-0 tw:pl-5 tw:flex tw:flex-col tw:gap-1 tw:text-[13.5px]">{firmantes.map((x, i) => <li key={i}>{x}</li>)}</ul>
          {nota && <Muted>{nota}</Muted>}
          {extra}
          <p className="tw:m-0 tw:text-[13px] tw:font-semibold tw:text-yellow-ink">{cobro}</p>
        </div>
      </Card>
    </div>
  );
}

// ---------- 6. seguimiento ----------
/** cómo va una operación: estado y quién firmó (se actualiza con «Ver estado ahora») */
export function useSeguimiento(op: number | null) {
  const [seg, setSeg] = useState<any>(null);
  const actualizar = async (silencioso?: boolean) => {
    if (!op) return null;
    try { const r = await api('docSeguimiento', op); setSeg(r); return r; } catch (e) { if (!silencioso) toast((e as Error).message, 5000); return null; }
  };
  return { seg, actualizar };
}
const firmo = (seg: any, s: any) => seg?.firmantes.find((x: any) => (cleanRut(x.rut) && cleanRut(x.rut) === cleanRut(s.rut)) || norm(x.nombre).includes(norm(s.nombre).split(' ')[0]))?.firmo;

export function Resultado({ r, p }: { r: any; p: any }) {
  const op = r.operacion; const { seg, actualizar } = useSeguimiento(op);
  const [t, tono] = estadoFirma(seg?.estado || 'en_firma');
  return (
    <Tarjeta icono="check" titulo="Enviado a firmar" sub={`${r.plantilla} · ${p.codigo}`}
      pie={<div className="ga-btns tw:flex tw:flex-wrap tw:justify-end tw:gap-2">
        <Boton variante="fantasma" icono="house" data-ficha onClick={() => { Ag().acoplar(); W.Inmo.abrirFicha(p.id); }}>Ver la ficha</Boton>
        <Boton variante="secundario" icono="sparkle" data-ask disabled={!op} onClick={() => Ag().enviar(`¿Cómo va la firma de la operación ${op}? ¿Quién falta?`)}>Preguntar al Agente</Boton>
        <Boton variante="secundario" icono="rotateR" data-est disabled={!op} onClick={() => actualizar()}>Ver estado ahora</Boton>
        <Boton icono="listCheck" data-ops disabled={!op} onClick={() => operaciones(op)}>Seguir en Operaciones</Boton>
      </div>}>
      <div className="ga-firm tw:flex tw:flex-col tw:gap-2">
        <div className="ga-firm-h tw:flex tw:items-center tw:gap-2">
          <b className="tw:text-[13px]">Firmantes</b>
          <span className="tw:text-[13px] tw:text-muted" data-prog>{seg ? `${seg.firmados} de ${seg.total} firmaron` : ''}</span>
          <span className="tw:ml-auto tw:flex tw:items-center tw:gap-2">
            {op && <span className="ga-opn"><Badge tono="gris">Operación {op}</Badge></span>}
            <span data-est-op><Badge tono={tono} punto>{t}</Badge></span>
          </span>
        </div>
        <Lista>
          {r.firmantes.map((s: any, i: number) => {
            const si = firmo(seg, s);
            return (
              <ItemLista key={i} className="ga-fi" data-rut={cleanRut(s.rut)} data-nom={norm(s.nombre)} media={<Avatar nombre={s.nombre || '?'} tamano="sm" />}
                titulo={s.nombre} detalle={[s.rol, s.rut].filter(Boolean).join(' · ')} derecha={<Badge tono={si ? 'verde' : 'amarillo'}>{si ? 'Firmó' : 'Pendiente'}</Badge>} />
            );
          })}
        </Lista>
      </div>
      {r.negocio && <Nota icono="briefcase" tono="azul">{r.negocio}</Nota>}
      <Muted>Mientras firman, sigue el trámite aquí, pregúntale al Agente o ábrelo en el panel de Operaciones: el chat queda a tu lado.</Muted>
    </Tarjeta>
  );
}

// documentos enviados a firmar desde las propiedades (todos o los de una)
function FilaFirma({ f }: { f: any }) {
  const op = Number(f.operacion) || null; const { seg, actualizar } = useSeguimiento(op);
  const [t, tono] = estadoFirma(seg?.estado || f.estado);
  return (
    <ItemLista className="ga-flr" data-op={f.operacion || ''} media={<IconoFila nombre="sign" />} titulo={f.plantilla}
      detalle={`${f.p.codigo} · ${fechaCorta(f.fecha)}${f.operacion ? ' · operación ' + f.operacion : ''} · ${f.firmantes.map((s: any) => s.nombre).join(', ')}`}
      derecha={<>
        <span data-est-op><Badge tono={tono}>{t}</Badge></span>
        {op && <>
          <Boton variante="fantasma" tamano="sm" className="tw:px-2" data-ver title="Ver estado" aria-label="Ver estado" icono="rotateR"
            onClick={async () => { const r = await actualizar(); if (r) toast(`Operación ${op}: ${r.firmados} de ${r.total} firmaron.`); }} />
          <Boton variante="secundario" tamano="sm" data-ops onClick={() => operaciones(op)}>Operaciones</Boton>
        </>}
      </>} />
  );
}
export function Firmas({ lista, codigo }: { lista: any[]; codigo?: string }) {
  return (
    <Tarjeta icono="sign" titulo="Documentos en firma" sub={codigo ?? 'Lo último que enviaste a firmar desde tus propiedades'}>
      {lista.length ? <div className="ga-fl-l"><Lista>{lista.map((f, i) => <FilaFirma key={i} f={f} />)}</Lista></div>
        : <EstadoVacio icono="sign" titulo="Todavía no hay documentos" texto="Los que envíes a firmar desde Asset aparecen aquí. Usa «Generar un documento»." />}
    </Tarjeta>
  );
}
