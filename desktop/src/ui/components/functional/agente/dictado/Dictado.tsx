// Dictar una propiedad: grabas un audio (o pegas texto) mientras captas; Asset llena la ficha, te dice qué falta y
// qué le pareció dudoso, y puedes corregir dictando («no, son 92 metros»). Se crea solo cuando confirmas.
// Con el kit: Card (Tarjeta), Input, Select, Textarea, Badge y Boton. Lo que vino del dictado va «resaltado» (lila)
// hasta que lo cambias; lo que falta, «pendiente» (amarillo).
/* eslint-disable @typescript-eslint/no-explicit-any -- datos del proceso principal sin tipos */
import { useEffect, useRef, useState } from 'react';
import Boton from '../../../ui/Boton';
import Badge from '../../../ui/Badge';
import Card from '../../../ui/Card';
import Input from '../../../ui/Input';
import Select from '../../../ui/Select';
import Textarea from '../../../ui/Textarea';
import { cx } from '../../../../utils/cx';
import { toast } from '../../../../utils/app';
import { Ag, Casilla, Falta, Muted, Nota, Tarjeta, W, api, cartera, useTarjeta } from '../tarjetas/comun';
import { Grabadora } from './Grabadora';

const TIPOS: [string, string][] = [['departamento', 'Departamento'], ['casa', 'Casa'], ['oficina', 'Oficina'], ['local_comercial', 'Local comercial'], ['parcela', 'Parcela'], ['sitio', 'Sitio'], ['terreno_construccion', 'Terreno'], ['bodega', 'Bodega'], ['estacionamiento', 'Estacionamiento'], ['industrial', 'Industrial'], ['agricola', 'Agrícola']];
const NUMEROS: [string, string][] = [['dormitorios', 'Dormitorios'], ['banos', 'Baños'], ['estacionamientos', 'Estacionamientos'], ['bodegas', 'Bodegas'], ['supUtil', 'm² útiles'], ['supTotal', 'm² totales'], ['gastosComunes', 'Gastos comunes ($)']];

/** la tarjeta completa: primero la captura (si no viene ya la ficha), luego la ficha para revisar */
export function Dictado({ r0, texto0 }: { r0?: any; texto0?: string }) {
  const [ficha, setFicha] = useState<{ r: any; texto: string; n: number } | null>(r0 ? { r: r0, texto: texto0 || '', n: 0 } : null);
  const llenar = (r: any, texto: string) => setFicha((f) => ({ r, texto, n: (f?.n || 0) + 1 }));
  return ficha ? <Ficha key={ficha.n} r={ficha.r} transcripcion={ficha.texto} alCorregir={llenar} /> : <Captura alLlenar={llenar} />;
}

// ---------- 1. captura ----------
function Captura({ alLlenar }: { alLlenar: (r: any, texto: string) => void }) {
  const { node } = useTarjeta();
  const [texto, setTexto] = useState(''); const [falta, setFalta] = useState(''); const [llenando, setLlenando] = useState(false);
  const caja = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const t = setTimeout(() => caja.current?.focus(), 50); Ag().bajar(); return () => clearTimeout(t); }, []);
  const procesar = async (t = texto) => {
    const x = t.trim(); if (x.length < 8) return setFalta('Graba o escribe los datos de la propiedad.');
    if (W.Asistente?.ensureConsent && !(await W.Asistente.ensureConsent())) return;
    setLlenando(true); setFalta('');
    try { const r = await api('dictExtraer', { texto: x }); if (r.tokens) W.Asistente?.actualizarTokens?.(r.tokens); node.dataset.resumen = 'Dictado de propiedad'; alLlenar(r, x); }
    catch (e) { setLlenando(false); setFalta((e as Error).message); }
  };
  return (
    <Tarjeta icono="mic" titulo="Dictar una propiedad" sub="Graba un audio (o pega la descripción) mientras captas: Asset llena la ficha y te pregunta lo que falta."
      falta={<Falta texto={falta} />}
      pie={<Boton data-ok icono="sparkle" cargando={llenando} onClick={() => procesar()}>{llenando ? 'Llenando la ficha…' : 'Llenar la ficha'}</Boton>}>
      <div className="dc-cap tw:flex tw:flex-col tw:gap-3">
        <Grabadora alTexto={(t) => { const v = [texto.trim(), t].filter(Boolean).join('\n'); setTexto(v); procesar(v); }} />
        <Textarea ref={caja} etiqueta="O escríbelo" data-txt rows={5} value={texto} onChange={(e) => setTexto(e.target.value)}
          placeholder="Ej.: Estoy captando un departamento en arriendo en Avenida del Tranque 1234, depto 26B, Lo Barnechea. Tres dormitorios, dos baños, 85 metros útiles, estacionamiento y bodega. 850 lucas, gastos comunes 120 mil…" />
      </div>
    </Tarjeta>
  );
}

// ---------- 2. resumen editable ----------
type TValores = Record<string, string>;
function inicial(c: any): { t: TValores; ck: Record<string, boolean> } {
  const t: TValores = { tipo: c.tipo || '', precioVenta: c.precioVenta ? String(c.precioVenta.valor) : '', precioVentaM: c.precioVenta?.moneda || 'UF',
    precioArriendo: c.precioArriendo ? String(c.precioArriendo.valor) : '', precioArriendoM: c.precioArriendo?.moneda || 'CLP', caracteristicas: (c.caracteristicas || []).join(', ') };
  for (const k of ['unidad', 'comuna', 'titulo', 'descripcion', ...NUMEROS.map(([x]) => x)]) t[k] = c[k] == null ? '' : String(c[k]);
  return { t, ck: { venta: !!c.venta, arriendo: !!c.arriendo, amoblado: !!c.amoblado } };
}

function Ficha({ r, transcripcion, alCorregir }: { r: any; transcripcion: string; alCorregir: (r: any, texto: string) => void }) {
  const { terminar } = useTarjeta();
  const c = r.campos; const hay = (k: string) => c[k] != null && c[k] !== '' && c[k] !== false;
  const [{ t, ck }, setV] = useState(() => inicial(c));
  const [tocados, setTocados] = useState<Set<string>>(new Set()); // lo que cambiaste ya no viene del dictado
  const [faltan, setFaltan] = useState<{ id: string; t: string }[] | null>(null);
  const [cor, setCor] = useState(false); const [t2, setT2] = useState(''); const [aplicando, setAplicando] = useState(false); const [creando, setCreando] = useState(false);
  const dirRef = useRef<HTMLInputElement>(null); const dir = useRef<{ valor: () => object } | null>(null);
  const [cambio, setCambio] = useState(0); // la dirección no la controla React (el campo inteligente escribe en ella)

  const leer = () => {
    const num = (k: string) => { const x = String(t[k] || '').trim().replace(/\./g, '').replace(',', '.'); return x === '' || isNaN(Number(x)) ? null : Number(x); };
    const o: any = {
      tipo: t.tipo || null, venta: ck.venta, arriendo: ck.arriendo, amoblado: ck.amoblado,
      precioVenta: t.precioVenta.trim() ? { valor: t.precioVenta.trim(), moneda: t.precioVentaM } : null,
      precioArriendo: t.precioArriendo.trim() ? { valor: t.precioArriendo.trim(), moneda: t.precioArriendoM } : null,
      caracteristicas: t.caracteristicas.split(',').map((x) => x.trim()).filter(Boolean), piso: c.piso, antiguedad: c.antiguedad, orientacion: c.orientacion, ficha: c.ficha,
      ...(dir.current?.valor() || {}),
    };
    o.direccion = dirRef.current?.value.trim() || null;
    for (const k of ['unidad', 'comuna', 'titulo', 'descripcion']) o[k] = String(t[k] || '').trim() || null;
    for (const [k] of NUMEROS) o[k] = num(k);
    return o;
  };
  const ultimo = useRef(leer); ultimo.current = leer;
  // qué falta (lo dice el proceso principal), cada vez que cambia algo
  useEffect(() => {
    let vivo = true;
    api<{ id: string; t: string }[]>('dictFaltan', ultimo.current()).catch(() => []).then((f) => { if (vivo) setFaltan(f); });
    return () => { vivo = false; };
  }, [t, ck, cambio]);
  useEffect(() => {
    const input = dirRef.current; if (!input || dir.current || input.closest('.dr') || !W.Direcciones) return;
    dir.current = W.Direcciones.conectar(input, { alElegir: (d: { comuna?: string }) => { if (d.comuna) setV((s) => ({ ...s, t: { ...s.t, comuna: d.comuna! } })); setCambio((n) => n + 1); } });
  }, []);
  useEffect(() => { Ag().bajar(); }, []);

  const tocar = (k: string) => setTocados((s) => (s.has(k) ? s : new Set(s).add(k)));
  const poner = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => { const v = e.target.value; tocar(k.replace(/M$/, '')); setV((s) => ({ ...s, t: { ...s.t, [k]: v } })); };
  const falta = (k: string) => !!faltan?.some((x) => x.id === k);
  /** marcas del kit: pendiente (falta) y resaltado (vino del dictado y no lo has cambiado) */
  const marcas = (k: string) => ({ pendiente: falta(k), resaltado: hay(k) && !tocados.has(k) });

  const aplicar = async (extra = t2) => {
    const x = extra.trim(); if (!x) return;
    setAplicando(true);
    try { const r2 = await api('dictExtraer', { texto: x, previo: leer() }); if (r2.tokens) W.Asistente?.actualizarTokens?.(r2.tokens); alCorregir(r2, `${transcripcion}\n${x}`); toast('Corrección aplicada.'); }
    catch (e) { setAplicando(false); toast((e as Error).message, 5000); }
  };
  const crear = async () => {
    const f = await api<{ id: string; t: string }[]>('dictFaltan', leer()).catch(() => []); setFaltan(f);
    if (f.some((x) => ['tipo', 'operacion', 'direccion'].includes(x.id))) return toast('Para crearla necesito al menos el tipo, si es venta o arriendo, y la dirección.', 5000);
    setCreando(true);
    let p: any; try { p = await api('dictCrear', leer()); } catch (er) { setCreando(false); return toast((er as Error).message, 5000); }
    const cola = f.length ? ` · faltó: ${f.map((x) => x.t.toLowerCase()).join(', ')}` : '';
    terminar(<><b>{p.codigo}</b> · {p.titulo} creada dictando{cola}</>, `${p.codigo} · ${p.titulo} creada dictando`);
    try { await cartera(); } catch { /* se verá al refrescar */ }
    W.AssetRefrescar?.();
    Ag().contexto({ tipo: 'propiedad', id: p.id });
    Ag().sugerencias([{ label: 'Subir fotos', accion: { tipo: 'fotosArchivos', propId: p.id } }, { label: 'Fotos desde Drive', accion: { tipo: 'fotosDrive', propId: p.id } }, { label: 'Ver la ficha', accion: { tipo: 'ficha', propId: p.id } }, { label: 'Gestionar la propiedad', accion: { tipo: 'estadoProp', propId: p.id } }, { label: 'Publicar en portales', accion: { tipo: 'publicar', propId: p.id } }]);
    Ag().festejo?.();
  };

  const tambien = [c.piso != null ? `piso ${c.piso}` : '', c.antiguedad != null ? `${c.antiguedad} años` : '', c.orientacion ? `orientación ${c.orientacion}` : ''].filter(Boolean);
  const operacionDictada = (c.venta || c.arriendo) && !tocados.has('operacion');
  const precio = (k: 'precioVenta' | 'precioArriendo', l: string) => (
    <div className="dc-pr tw:flex tw:items-end tw:gap-2">
      <Input etiqueta={l} clasesCampo="tw:flex-1 tw:min-w-0" {...marcas(k)} data-k={k} inputMode="decimal" value={t[k]} onChange={poner(k)} />
      <Select aria-label={`Moneda de ${l.toLowerCase()}`} clasesCampo="tw:w-[92px] tw:flex-none" data-k={k + 'M'} value={t[k + 'M']} onChange={poner(k + 'M')} opciones={[['CLP', 'CLP'], ['UF', 'UF'], ['USD', 'USD']]} />
    </div>
  );
  const texto = (k: string, l: string, ph = '', ancho = '') => <Input etiqueta={l} clasesCampo={ancho} {...marcas(k)} data-k={k} value={t[k]} placeholder={ph} onChange={poner(k)} />;

  return (
    <Tarjeta icono="house" titulo="Esto entendí" sub="Revisa y corrige lo que haga falta. Lo marcado en lila vino del dictado."
      falta={faltan && <Falta texto={faltan.length ? `Me falta: ${faltan.map((x) => x.t.toLowerCase()).join(', ')}` : ''} ok="Lista para crear" />}
      pie={<>
        <Boton variante="secundario" icono="mic" data-cor onClick={() => { setCor(true); setTimeout(() => Ag().bajar(), 0); }}>Corregir dictando</Boton>
        <Boton data-crear icono="check" cargando={creando} onClick={crear}>{creando ? 'Creando…' : 'Crear propiedad'}</Boton>
      </>}>
      {(r.dudas || []).length > 0 && <div data-avisos className="dc-dudas tw:flex tw:flex-col tw:gap-1.5">{r.dudas.map((d: string, i: number) => <Nota key={i}>{d}</Nota>)}</div>}
      <div className="dc-g tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-x-3 tw:gap-y-3">
        <Select etiqueta="Tipo" {...marcas('tipo')} data-k="tipo" value={t.tipo} onChange={poner('tipo')} vacia="—" opciones={TIPOS} />
        <div data-f="operacion" className={cx('dc-op tw:flex tw:flex-col tw:gap-1.5', falta('operacion') && 'falta')}>
          <span className="tw:text-[13px] tw:font-semibold">Operación</span>
          <span className={cx('tw:flex tw:items-center tw:gap-5 tw:h-10 tw:px-3 tw:rounded-[10px] tw:border tw:border-solid tw:border-b-2',
            falta('operacion') ? 'tw:border-yellow-edge tw:bg-field' : operacionDictada ? 'tw:border-edge tw:bg-lav-soft' : 'tw:border-edge tw:bg-field')}>
            <Casilla data-k="venta" checked={ck.venta} onChange={(e) => { tocar('operacion'); setV((s) => ({ ...s, ck: { ...s.ck, venta: e.target.checked } })); }}>Venta</Casilla>
            <Casilla data-k="arriendo" checked={ck.arriendo} onChange={(e) => { tocar('operacion'); setV((s) => ({ ...s, ck: { ...s.ck, arriendo: e.target.checked } })); }}>Arriendo</Casilla>
          </span>
        </div>
        {precio('precioVenta', 'Precio de venta')}{precio('precioArriendo', 'Precio de arriendo')}
        <Input ref={dirRef} etiqueta="Dirección" clasesCampo="tw:sm:col-span-2" {...marcas('direccion')} data-k="direccion" defaultValue={c.direccion || ''} placeholder="Calle y número"
          onInput={() => { tocar('direccion'); setCambio((n) => n + 1); }} />
        {texto('unidad', 'Depto / unidad', '26B')}{texto('comuna', 'Comuna')}
        {NUMEROS.map(([k, l]) => <Input key={k} etiqueta={l} {...marcas(k)} data-k={k} inputMode="numeric" value={t[k]} onChange={poner(k)} />)}
        <Casilla className="dc-am tw:self-end tw:pb-2.5" data-k="amoblado" checked={ck.amoblado} onChange={(e) => setV((s) => ({ ...s, ck: { ...s.ck, amoblado: e.target.checked } }))}>Amoblado</Casilla>
        {texto('titulo', 'Título del aviso', '', 'tw:sm:col-span-2')}
        <Input etiqueta={<>Características <span className="tw:font-normal tw:text-muted">(separadas por coma)</span></>} clasesCampo="tw:sm:col-span-2" {...marcas('caracteristicas')} data-k="caracteristicas" value={t.caracteristicas} onChange={poner('caracteristicas')} />
        <Textarea etiqueta="Descripción" clasesCampo="tw:sm:col-span-2" {...marcas('descripcion')} data-k="descripcion" rows={4} value={t.descripcion} onChange={poner('descripcion')} />
      </div>
      {tambien.length > 0 && <Muted>También anoté: {tambien.join(', ')} (queda en las notas internas).</Muted>}
      <details className="dc-tr tw:text-[13px] tw:text-muted">
        <summary className="tw:cursor-pointer tw:font-semibold">Lo que dictaste</summary>
        <p className="tw:mt-1.5 tw:mb-0 tw:whitespace-pre-line">{transcripcion}</p>
      </details>
      {cor && (
        <div className="dc-cor">
          <Card tono="lavanda" titulo="Corregir o agregar dictando" subtitulo="Ej.: «son 92 metros útiles, no 85» o «tiene piscina y quincho»."
            pie={<div className="tw:flex tw:justify-end tw:gap-2">
              <Boton variante="fantasma" tamano="sm" data-c2no onClick={() => setCor(false)}>Cancelar</Boton>
              <Boton tamano="sm" data-c2ok cargando={aplicando} onClick={() => aplicar()}>{aplicando ? 'Aplicando…' : 'Aplicar'}</Boton>
            </div>}>
            <div className="tw:flex tw:flex-col tw:gap-3">
              <Grabadora etiqueta="Grabar corrección" alTexto={(x) => { const v = [t2.trim(), x].filter(Boolean).join(' '); setT2(v); aplicar(v); }} />
              <Textarea aria-label="Corrección" data-t2 rows={2} placeholder="O escríbelo aquí" value={t2} onChange={(e) => setT2(e.target.value)} autoFocus />
            </div>
          </Card>
        </div>
      )}
      <Badge tono="lavanda" className="tw:self-start">Nada se crea hasta que tocas «Crear propiedad»</Badge>
    </Tarjeta>
  );
}
