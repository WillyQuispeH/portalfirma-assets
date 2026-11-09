// «Gestionar una propiedad», primeros pasos: elegir la propiedad, ver cómo está (negocios, firmas, lo último y
// sugerencias) y anotar lo que pasó fuera de Asset. Con el kit: Card (Tarjeta), Input, Tabs, ItemLista, Badge,
// LineaTiempo, Select, Textarea y Boton.
/* eslint-disable @typescript-eslint/no-explicit-any -- datos del proceso principal sin tipos */
import { useEffect, useRef, useState } from 'react';
import Boton from '../../../ui/Boton';
import Badge from '../../../ui/Badge';
import Input from '../../../ui/Input';
import Select from '../../../ui/Select';
import Textarea from '../../../ui/Textarea';
import Tabs from '../../../ui/Tabs';
import ItemLista, { Miniatura } from '../../../ui/ItemLista';
import LineaTiempo from '../../../ui/LineaTiempo';
import EstadoVacio from '../../../ui/EstadoVacio';
import Icono from '../../../ui/Icono';
import { toast } from '../../../../utils/app';
import {
  Ag, Etapas, Falta, Lista, Muted, Seccion, Tarjeta, W, amable, api, carteraActual, dirTxt, estadoFirma, estadoProp, fechaCorta, norm,
  precio, precios, primer, useTarjeta,
} from './comun';
import { agendar, anotar, estado, firmas, formulario, iniciar, plantillas } from './gestion';

export const enfocar = (ref: React.RefObject<HTMLElement | null>) => { const t = setTimeout(() => ref.current?.focus(), 80); return () => clearTimeout(t); };

// ---------- 1. elegir la propiedad ----------
export function ElegirPropiedad({ destino }: { destino?: string }) {
  const { terminar } = useTarjeta();
  const [q, setQ] = useState(''); const [op, setOp] = useState<'' | 'venta' | 'arriendo'>('');
  const entrada = useRef<HTMLInputElement>(null);
  useEffect(() => enfocar(entrada), []);
  const { propiedades, personas } = carteraActual();
  const per = (id: string) => personas.find((c) => c.id === id);
  const tok = norm(q).split(/\s+/).filter(Boolean);
  const activas = propiedades.filter((p) => !p.archivada);
  const lista = activas.filter((p) => (!op || p[op]) && tok.every((t) => norm([p.codigo, p.titulo, p.direccion, p.unidad, p.comuna, p.rol,
    ...(p.vinculos || []).map((v: any) => { const c = per(v.personaId); return c ? c.nombre + ' ' + c.rut : ''; })].join(' ')).includes(t)))
    .sort((a, b) => String(b.actualizado || '').localeCompare(String(a.actualizado || '')));
  const elegir = (p: any) => {
    terminar(<>Propiedad: <b>{p.codigo}</b> · {p.titulo}</>, `Propiedad: ${p.codigo} · ${p.titulo}`, () => iniciar({ destino }));
    Ag().contexto({ tipo: 'propiedad', id: p.id });
    if (destino === 'documento') plantillas(p); else estado(p.id);
  };
  return (
    <Tarjeta n={1} titulo="¿Qué propiedad quieres gestionar?" sub="Busca por código, dirección, comuna o propietario">
      <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
        <Input ref={entrada} data-q icono="search" clasesCampo="tw:flex-1 tw:min-w-[220px]" placeholder="Ej.: CV-9002, Irarrázaval, Ñuñoa…" spellCheck={false} aria-label="Buscar propiedad"
          value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && lista[0]) elegir(lista[0]); }} />
        <Tabs dato="o" etiqueta="Operación" valor={op} alCambiar={setOp}
          opciones={[['', 'Todas', activas.length], ['venta', 'Venta', activas.filter((p) => p.venta).length], ['arriendo', 'Arriendo', activas.filter((p) => p.arriendo).length]]} />
      </div>
      {lista.length ? (
        <div className="ga-props tw:flex tw:flex-col tw:gap-2">
          <Lista>
            {lista.slice(0, 8).map((p) => (
              <ItemLista key={p.id} className="ga-pc" data-p={p.id} alTocar={() => elegir(p)} flecha
                media={<Miniatura src={p.fotos?.[0]} icono="house" tam={52} />}
                titulo={p.titulo} detalle={`${p.codigo} · ${dirTxt(p) || 'Sin dirección'}`}
                derecha={<span className="tw:text-[13px] tw:font-semibold tw:text-brand tw:whitespace-nowrap">{precios(p)}</span>} />
            ))}
          </Lista>
          {lista.length > 8 && <Muted>y {lista.length - 8} más: escribe para afinar la búsqueda.</Muted>}
        </div>
      ) : (
        <EstadoVacio icono="house" titulo={q ? `No encontré propiedades con «${q}»` : 'Aún no hay propiedades'} texto="Puedes pedirle al Agente «sube una propiedad nueva…»." />
      )}
    </Tarjeta>
  );
}

// ---------- 2. la propiedad primero: cómo está, qué negocios tiene y qué sugiere (nada obligatorio) ----------
const ROL: Record<string, string> = { propietario: 'Propietario', arrendatario: 'Arrendatario', comprador: 'Comprador', codeudor: 'Codeudor', interesado: 'Interesado', proveedor: 'Proveedor' };
const ACCIONES: [string, string, string][] = [['documento', 'filePlus', 'Documento'], ['agendar', 'calendar', 'Agendar'], ['orden', 'pin', 'Orden de visita'], ['negocio', 'briefcase', 'Nuevo negocio'], ['publicar', 'export', 'Publicar'], ['ficha', 'file', 'Ficha']];

export function EstadoPropiedad({ p, s }: { p: any; s: any }) {
  const P = s.prop;
  const [ordenando, setOrdenando] = useState(false);
  const uno = s.negocios.length === 1 ? s.negocios[0] : null; const opP = p.arriendo ? 'arriendo' : 'venta';
  const accion = async (k: string) => {
    if (k === 'anotar') return anotar(p, s);
    if (k === 'documento') return plantillas(p);
    if (k === 'agendar') return agendar({ propId: p.id, personaId: uno?.clienteId || null, negocioId: uno?.id || null });
    if (k === 'orden') {
      setOrdenando(true);
      try {
        const l = await api<any[]>('docPlantillas', { texto: 'Orden de visita', propId: p.id }); const t = l.find((x) => /^orden de visita/i.test(x.nombre)) || l[0];
        if (!t) throw new globalThis.Error('No encontré la plantilla «Orden de visita» en tu cuenta.');
        Ag().decir(`Orden de visita · ${p.codigo}`, 'user'); formulario(p, t);
      } catch (e) { toast((e as Error).message, 5000); } finally { setOrdenando(false); }
      return;
    }
    if (k === 'negocio') return Ag().prellenar(`Crea un negocio de ${opP} de ${p.codigo} con `);
    if (k === 'publicar') { Ag().acoplar(); return W.Publicaciones.publicar(p.id); }
    if (k === 'ficha') { Ag().acoplar(); return W.Inmo.abrirFicha(p.id); }
  };
  const historial = [
    ...s.proximos.slice(0, 3).map((e: any) => ({ destacado: true, fecha: `${e.fecha.slice(8)}/${e.fecha.slice(5, 7)}${e.hora ? ' ' + e.hora : ''} · agendado`,
      texto: <>{e.titulo}{e.tipo === 'visita' && (e.orden ? ' · con orden' : <> · <i>sin orden aún</i></>)}</> })),
    ...(s.historial || s.ultimo).map((h: any) => ({ texto: h.texto, fecha: fechaCorta(h.fecha), destacado: false })),
  ];
  const restantes = s.totalProximos - 3;

  return (
    <Tarjeta titulo={P.titulo} sub={`${P.codigo} · ${String(P.tipo || '').replace(/_/g, ' ')}${P.rol ? ' · Rol ' + P.rol : ''}`}
      pie={<div className="ga-row tw:flex tw:flex-wrap tw:justify-end tw:gap-2">
        <Boton data-a="anotar" tamano="sm" icono="edit" onClick={() => accion('anotar')}>Anotar lo que pasó</Boton>
        {ACCIONES.map(([k, ic, t]) => <Boton key={k} data-a={k} tamano="sm" variante="secundario" icono={ic} cargando={k === 'orden' && ordenando} onClick={() => accion(k)}>{t}</Boton>)}
      </div>}>
      <div className="ga-pp tw:flex tw:items-start tw:gap-4">
        <Miniatura src={p.fotos?.[0]} icono="house" tam={88} />
        <div className="tw:flex tw:flex-col tw:gap-2 tw:min-w-0">
          <span className="tw:flex tw:items-center tw:gap-1.5 tw:text-[13px] tw:text-muted"><Icono nombre="pin" tam={13} /> {P.direccion || 'Sin dirección'}</span>
          <span className="ga-prs tw:flex tw:flex-wrap tw:items-center tw:gap-x-4 tw:gap-y-1.5">
            {(['venta', 'arriendo'] as const).filter((o) => P[o]).map((o) => { const [t, tono] = estadoProp(P[o].estado); return (
              <span key={o} className="ga-pr tw:inline-flex tw:items-center tw:gap-2 tw:text-[13px]"><span className="tw:text-muted">{o === 'venta' ? 'Venta' : 'Arriendo'}</span><b>{precio(P[o].precio) || '—'}</b><Badge tono={tono}>{t}</Badge></span>
            ); })}
          </span>
          <span className="ga-pers tw:flex tw:flex-wrap tw:gap-1.5">
            {P.personas.length ? P.personas.map((v: any, i: number) => <Badge key={i} tono="lavanda" icono="user">{v.nombre} · {ROL[v.rol] || v.rol}</Badge>)
              : <Badge tono="amarillo" icono="alert">Sin personas vinculadas</Badge>}
          </span>
        </div>
      </div>

      <Seccion icono="briefcase" titulo={s.negocios.length === 1 ? 'Negocio en curso' : s.negocios.length ? `${s.negocios.length} negocios en curso` : 'Negocios'}>
        {s.negocios.length ? (
          <Lista>
            {s.negocios.map((n: any) => (
              <ItemLista key={n.id} className="ga-ng" data-neg={n.id} flecha
                alTocar={() => Ag().contexto({ tipo: 'propiedad', id: p.id, negocio: n.id }, { ver: true })}
                titulo={<span className="ga-ngh tw:flex tw:items-center tw:gap-2">{n.cliente || 'Sin cliente'} <span className="tw:font-normal tw:text-muted">{n.tipo === 'venta' ? 'venta' : 'arriendo'}</span><em className="tw:not-italic"><Badge tono="lavanda">{n.etapaTxt || ''}</Badge></em></span>}
                detalle={<span className={n.vencida ? 'ga-venc tw:text-err' : ''}>{n.siguiente ? `Siguiente: ${amable(n.siguiente)}` : ''}{n.proximaAccion?.texto ? `${n.siguiente ? ' · ' : ''}${n.proximaAccion.texto}${n.proximaAccion.fecha ? ' · ' + n.proximaAccion.fecha : ''}` : ''}</span>}
                derecha={<span className="tw:w-24"><Etapas etapas={n.etapas || []} orden={n.orden} /></span>} />
            ))}
          </Lista>
        ) : <Muted>Sin negocios en curso.</Muted>}
      </Seccion>

      {s.firmas.length > 0 && (
        <Seccion icono="sign" titulo="En firma">
          <Lista>
            {s.firmas.map((f: any, i: number) => (
              <ItemLista key={i} className="ga-fr" data-op={f.operacion || ''} flecha media={<Icono nombre="sign" tam={16} />}
                alTocar={() => (f.operacion ? Ag().contexto({ tipo: 'operacion', op: Number(f.operacion), propId: p.id }, { ver: true }) : firmas(p.id))}
                titulo={f.plantilla} detalle={f.operacion ? 'Operación ' + f.operacion : ''} derecha={<Badge tono={estadoFirma('en_firma')[1]}>En firma</Badge>} />
            ))}
          </Lista>
        </Seccion>
      )}

      <Seccion icono="clock" titulo="Lo último" derecha={restantes > 0 && <Badge tono="lavanda">y {restantes} {restantes === 1 ? 'visita más' : 'visitas más'}</Badge>}>
        <LineaTiempo className="ga-hist scroll tw:max-h-[84px] tw:overflow-y-auto tw:pr-2" items={historial} vacio="Todavía no hay movimientos." />
      </Seccion>

      {s.sugerencias.length > 0 && (
        <div className="ga-sugs tw:flex tw:flex-wrap tw:items-center tw:gap-2">
          <span className="tw:inline-flex tw:items-center tw:gap-1.5 tw:text-[13px] tw:font-semibold tw:text-lav-softink"><Icono nombre="sparkle" tam={13} /> Te sugiero <span className="tw:font-normal tw:text-muted">(opcional)</span></span>
          {s.sugerencias.map((x: any, i: number) => <Boton key={i} data-s={i} tamano="sm" variante="secundario" onClick={() => Ag().accion(x.accion)}>{x.label}</Boton>)}
        </div>
      )}
    </Tarjeta>
  );
}

// ---------- anotar lo que pasó (fuera de Asset: por teléfono, en persona…) ----------
const TIPOS: [string, string][] = [['llamada', 'Llamé'], ['visita', 'Visitó'], ['documentos', 'Envió documentos'], ['oferta', 'Hizo oferta'], ['otro', 'Otro']];

export function Anotar({ p, s }: { p: any; s: any }) {
  const { terminar, quitar } = useTarjeta();
  const negs = s?.negocios || [];
  const [tipo, setTipo] = useState('llamada'); const [texto, setTexto] = useState(''); const [neg, setNeg] = useState(negs[0]?.id || '');
  const [falta, setFalta] = useState(''); const [enviando, setEnviando] = useState(false);
  const caja = useRef<HTMLTextAreaElement>(null);
  useEffect(() => enfocar(caja), []);
  const ok = async () => {
    const t = texto.trim();
    if (!t && tipo === 'otro') return setFalta('Escribe qué pasó.');
    setEnviando(true);
    try {
      const r = await api('estAnotar', p.id, { tipo, texto: t, negocioId: neg || undefined });
      const donde = r.negocio ? `en el negocio de ${primer(r.negocio.cliente) || p.codigo}` : `en ${p.codigo}`;
      terminar(<>Anotado {donde}: «{r.anotado}»</>, `Anotado ${donde}: «${r.anotado}»`);
      W.AssetRefrescar?.(); W.Lienzo?.refrescar?.();
      Ag().sugerencias([...r.sugerencias, { label: 'Ver estado de la propiedad', accion: { tipo: 'estadoProp', propId: p.id } }]);
    } catch (e) { setEnviando(false); setFalta((e as Error).message); }
  };
  return (
    <Tarjeta icono="edit" titulo="Anotar lo que pasó" sub={`${p.codigo} · queda en el historial y te sugiero qué sigue. Nada cambia sin tu toque.`}
      falta={<Falta texto={falta} />}
      pie={<><Boton variante="fantasma" data-cancel onClick={quitar}>Cancelar</Boton><Boton data-ok icono="check" cargando={enviando} onClick={ok}>Anotar</Boton></>}>
      <Tabs dato="t" etiqueta="Qué pasó" opciones={TIPOS} valor={tipo} alCambiar={(v) => { setTipo(v); caja.current?.focus(); }} className="tw:max-w-full tw:overflow-x-auto" />
      {negs.length > 0 && (
        <Select etiqueta="Negocio" data-f="neg" value={neg} onChange={(e) => setNeg(e.target.value)}>
          {negs.map((n: any) => <option key={n.id} value={n.id}>{n.cliente || 'Sin cliente'} · {n.etapaTxt || ''}</option>)}
          <option value="">Solo la propiedad</option>
        </Select>
      )}
      <Textarea ref={caja} etiqueta="Qué pasó" data-f="txt" rows={2} placeholder="Ej.: quiere visitar el jueves a las 11" value={texto} onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ok(); } else if (e.key === 'Escape') quitar(); }} />
    </Tarjeta>
  );
}
