// «Ficha completa» (modal-20, ficha-bloques.js): los ~130 datos de la propiedad en 5 bloques. Cada pestaña muestra
// cuánto falta y marca lo CLAVE (*); lo marcado con ★ va a los portales. Los sí/no del equipamiento se marcan como
// fichas: lo que no se marca queda en «No». Al cambiar de pestaña se guarda lo cambiado.
// Guardar, recargar la ficha y completar con texto dictado siguen en ficha-bloques.js (alGuardar, alCompletar…).
// Los id (#fb_<campo>, #fbp_tipo, #fbp_venta, #fbDicta, #fbOk…) y las clases .fb-tab[data-t], .fb-chip[data-b] y
// .fb-falta los usan las pruebas (y los estilos de .fb-tab/.fb-chip, en styles.css).
import { useState, type ReactNode } from 'react';
import Boton from '../../../ui/Boton';
import Input from '../../../ui/Input';
import Select from '../../../ui/Select';
import Textarea from '../../../ui/Textarea';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../../ui/Ventana';
import { Opcion } from '../../gestion/editor-pdf/Modales';
import { cx } from '../../../../utils/cx';
import { toast } from '../../../../utils/app';

type TValor = string | number | boolean | null | { valor: number; moneda: string };
interface ICampo { id: string; t: string; k?: string; b: string; op?: string[]; clave?: boolean; falta?: boolean; pi?: boolean; aplica?: boolean; reservado?: boolean; per?: boolean; plano?: boolean; valor?: TValor }
interface IBloque { id: string; t: string; n: number; d: string; listo: boolean; faltanClave: string[] }
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- la propiedad tal como viene de la base
export interface IFicha { prop: Record<string, any>; campos: ICampo[]; bloques: IBloque[]; siguiente?: string }

const LARGOS = ['formaVisitar', 'notasInternas', 'hipoteca', 'tipoSeguridad', 'horarioContacto'];
const MONEDAS: [string, string][] = [['UF', 'UF'], ['CLP', 'CLP'], ['USD', 'USD']];
const SINO: [string, string][] = [['si', 'Sí'], ['no', 'No']];

// el texto del campo según su valor, y el valor según el texto (lo que hacía leer())
const aTexto = (c: ICampo, v: TValor | undefined): string => {
  if (c.k === 'bool') return v === true ? 'si' : v === false ? 'no' : '';
  if (c.k === 'precio') return String((v as { valor?: number } | null)?.valor ?? '');
  return String(v ?? '');
};
const deTexto = (c: ICampo, x: string, moneda: string): TValor => {
  if (c.k === 'bool') return x === 'si' ? true : x === 'no' ? false : null;
  if (c.k === 'precio') return x === '' ? null : { valor: Number(x), moneda };
  if (c.k === 'num') return x === '' ? null : Number(x);
  return x === '' ? null : x;
};

export function FichaCompleta({ ficha: inicial, tab: tabInicial, tipos, alGuardar, alListo, alCompletar, alCerrar }: {
  ficha: IFicha; tab: string; tipos: Record<string, string>;
  /** guarda la propiedad y devuelve la ficha recargada */
  alGuardar: (o: Record<string, unknown>) => Promise<IFicha>;
  /** después de «Guardar y cerrar» */
  alListo: () => void;
  /** completa la ficha con texto dictado y devuelve la ficha recargada */
  alCompletar: (texto: string) => Promise<IFicha>;
  alCerrar: () => void;
}) {
  const [fi, setFi] = useState(inicial); const [tab, setTab] = useState(tabInicial);
  const [cambios, setCambios] = useState<Record<string, TValor>>({}); const [plano, setPlano] = useState<Record<string, unknown>>({});
  const [textos, setTextos] = useState<Record<string, string>>({}); const [monedas, setMonedas] = useState<Record<string, string>>({});
  const [err, setErr] = useState(''); const [dicta, setDicta] = useState(''); const [dictando, setDictando] = useState(false);
  const prop = fi.prop;
  const hayCambios = Object.keys(cambios).length > 0 || Object.keys(plano).length > 0;
  const valor = (c: ICampo) => (cambios[c.id] !== undefined ? cambios[c.id] : c.valor);
  const moneda = (c: ICampo) => monedas[c.id] || (valor(c) as { moneda?: string } | null)?.moneda || 'UF';
  const escribir = (c: ICampo, x: string, m = moneda(c)) => { setTextos((t) => ({ ...t, [c.id]: x })); setCambios((o) => ({ ...o, [c.id]: deTexto(c, x, m) })); };
  const texto = (c: ICampo) => (textos[c.id] !== undefined ? textos[c.id] : aTexto(c, valor(c)));
  const pv = (k: string) => (plano[k] !== undefined ? plano[k] : prop[k]);

  async function guardar(cerrar: boolean) {
    const o: Record<string, unknown> & { ficha: Record<string, TValor> } = { id: prop.id, ficha: {} };
    for (const [k, v] of Object.entries(cambios)) { const c = fi.campos.find((y) => y.id === k); if (c?.plano) o[k] = v; else o.ficha[k] = v; }
    Object.assign(o, plano);
    if (o.venta === false && o.arriendo === false) { setErr('Marca si va en venta, en arriendo o ambas.'); return false; }
    try {
      const nueva = await alGuardar(o);
      if (cerrar) { alListo(); return true; }
      setFi(nueva); setCambios({}); setPlano({}); setTextos({}); setMonedas({}); setErr('');
      return true;
    } catch (e) { setErr((e as Error).message); return false; }
  }
  const irA = async (t: string) => { if (hayCambios && !(await guardar(false))) return; setTab(t); };
  const completar = async () => {
    const t = dicta.trim(); if (!t) { document.getElementById('fbDicta')?.focus(); return; }
    if (hayCambios && !(await guardar(false))) return;
    setDictando(true);
    try { const nueva = await alCompletar(t); setFi(nueva); setDicta(''); } catch (e) { setErr((e as Error).message); } finally { setDictando(false); }
  };

  const b = fi.bloques.find((x) => x.id === tab) || fi.bloques[0];
  const cs = fi.campos.filter((c) => c.b === tab && c.aplica && !['tipo', 'operacion'].includes(c.id));
  const fichas = cs.filter((c) => c.k === 'bool' && c.b === 'equip');

  const marcas = (c: ICampo) => <>
    {c.clave && <b className="fb-clave" title="Clave: sin este dato no se avanza">*</b>}
    {c.pi && <span className="fb-pi" title="Va a los portales">★</span>}
  </>;
  const campo = (c: ICampo): ReactNode => {
    const id = 'fb_' + c.id;
    const cls = cx('fb-c', c.clave && c.falta && cambios[c.id] === undefined && 'fb-falta');
    if (c.reservado) return <Input key={c.id} clasesCampo={cls} etiqueta={c.t} value="Reservado al captador" disabled title="Los datos del propietario solo los ve quien captó la propiedad" />;
    if (c.per && c.valor && !prop.ficha?.[c.id]) return <Input key={c.id} clasesCampo={cls} etiqueta={<>{c.t}{marcas(c)}</>} value={String(c.valor)} disabled title="Del propietario vinculado en el CRM" />;
    if (c.k === 'bool' && c.b === 'equip') return null; // van como fichas
    const et = <>{c.t}{marcas(c)}</>;
    const comun = { id, 'data-c': c.id, value: texto(c) };
    if (c.k === 'bool') return <Select key={c.id} clasesCampo={cls} etiqueta={et} vacia="—" opciones={SINO} {...comun} onChange={(e) => escribir(c, e.target.value)} />;
    if (c.k === 'lista') return (
      <div key={c.id} className="tw:contents">
        <Input clasesCampo={cls} etiqueta={et} list={id + '_l'} placeholder="Elige o escribe" {...comun} onChange={(e) => escribir(c, e.target.value)} />
        <datalist id={id + '_l'}>{(c.op || []).map((o) => <option key={o} value={o} />)}</datalist>
      </div>
    );
    if (c.k === 'precio') return (
      <div key={c.id} className={cx(cls, 'tw:flex tw:flex-col tw:gap-1.5')}>
        <label htmlFor={id} className="tw:block tw:m-0 tw:text-[13px] tw:font-semibold tw:text-text">{et}</label>
        <div className="tw:flex tw:gap-1.5">
          <Input type="number" step="any" clasesCampo="tw:flex-1 tw:min-w-0" {...comun} onChange={(e) => escribir(c, e.target.value)} />
          <Select id={id + '_m'} aria-label="Moneda" clasesCampo="tw:w-[86px] tw:flex-none" opciones={MONEDAS} value={moneda(c)}
            onChange={(e) => { const m = e.target.value; setMonedas((x) => ({ ...x, [c.id]: m })); escribir(c, texto(c), m); }} />
        </div>
      </div>
    );
    if (LARGOS.includes(c.id)) return <Textarea key={c.id} clasesCampo={cx(cls, 'tw:col-span-full')} etiqueta={et} rows={2} {...comun} onChange={(e) => escribir(c, e.target.value)} />;
    return <Input key={c.id} clasesCampo={cls} etiqueta={et} {...(c.k === 'num' ? { type: 'number', step: 'any' } : {})} {...comun} onChange={(e) => escribir(c, e.target.value)} />;
  };

  let resumen: ReactNode;
  if (b.id === 'equip') resumen = ' · Nada es obligatorio: marca lo que tiene';
  else if (b.faltanClave.length) resumen = <> · <b className="tw:text-err">Falta lo clave: {b.faltanClave.join(', ')}</b></>;
  else resumen = <> · <b className="tw:text-green-ink">Lo clave está completo</b></>;

  return <>
    <VentanaCabecera icono="house" titulo={`Ficha de ${prop.codigo || ''}`} descripcion={prop.titulo || undefined} onCerrar={alCerrar} />
    <VentanaCuerpo className="tw:flex tw:flex-col tw:gap-3">
      <div className="fb-tabs tw:m-0" id="fbTabs" role="tablist">
        {fi.bloques.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={x.id === tab} className={cx('fb-tab', x.id === tab && 'on')} data-t={x.id} onClick={() => irA(x.id)}>
            <span className={cx('fb-n', x.listo && 'ok')}>{x.listo ? '✓' : x.n}</span>{x.t}{x.faltanClave.length > 0 && <small>faltan {x.faltanClave.length}</small>}
          </button>
        ))}
      </div>
      <div className="tw:flex tw:gap-2 tw:items-stretch">
        <Textarea id="fbDicta" rows={2} clasesCampo="tw:flex-1 tw:min-w-0" value={dicta} onChange={(e) => setDicta(e.target.value)}
          placeholder="Dicta o pega datos sueltos: «depto 504, piso 5, orientación norte, tiene piscina y quincho, no se permiten mascotas…»" />
        <Boton id="fbDictaOk" variante="secundario" icono="sparkle" className="tw:self-start" cargando={dictando} onClick={completar}>Completar con esto</Boton>
      </div>
      <div id="fbCuerpo" className="tw:flex tw:flex-col tw:gap-3">
        <p className="tw:m-0 tw:text-[12.5px] tw:text-muted">{b.d}{resumen}</p>
        <div className="tw:grid tw:grid-cols-2 tw:lg:grid-cols-3 tw:gap-x-3 tw:gap-y-3 tw:items-end">
          {tab === 'esencial' && <>
            <Select id="fbp_tipo" clasesCampo="fb-c" etiqueta={<>Tipo de propiedad<b className="fb-clave">*</b></>} opciones={Object.entries(tipos)}
              value={String(pv('tipo') ?? '')} onChange={(e) => setPlano((x) => ({ ...x, tipo: e.target.value }))} />
            <div className="fb-c tw:flex tw:flex-col tw:gap-1.5">
              <span className="tw:text-[13px] tw:font-semibold tw:text-text">Operación<b className="fb-clave">*</b></span>
              <div className="tw:flex tw:gap-4 tw:h-10 tw:items-center">
                <Opcion type="checkbox" id="fbp_venta" checked={!!pv('venta')} onChange={(e) => setPlano((x) => ({ ...x, venta: e.target.checked }))}>Venta</Opcion>
                <Opcion type="checkbox" id="fbp_arriendo" checked={!!pv('arriendo')} onChange={(e) => setPlano((x) => ({ ...x, arriendo: e.target.checked }))}>Arriendo</Opcion>
              </div>
            </div>
          </>}
          {cs.map(campo)}
        </div>
        {fichas.length > 0 && <>
          <h4 className="tw:m-0 tw:mt-1 tw:text-sm">Lo que tiene la propiedad <small className="tw:font-normal tw:text-muted">(lo que no marques queda en «No»)</small></h4>
          <div className="fb-chips">
            {fichas.map((c) => {
              const on = !!valor(c);
              return <button key={c.id} type="button" className={cx('fb-chip', on && 'on')} data-b={c.id} aria-pressed={on}
                onClick={() => setCambios((o) => ({ ...o, [c.id]: !on }))}>{c.pi ? '★ ' : ''}{c.t}</button>;
            })}
          </div>
        </>}
      </div>
      <p className="error tw:m-0 tw:text-[13px] tw:empty:hidden" id="fbErr" role="alert">{err}</p>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="fbCerrar" variante="secundario" onClick={alCerrar}>Cerrar</Boton>
      <Boton id="fbGuardar" variante="secundario" onClick={() => guardar(false).then((ok) => ok && toast('Guardado.'))}>Guardar</Boton>
      <Boton id="fbOk" onClick={() => guardar(true)}>Guardar y cerrar</Boton>
    </VentanaPie>
  </>;
}
