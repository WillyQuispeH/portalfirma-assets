// Pestaña «Resumen» de la ficha: la captación, la galería, las características, la comercialización,
// las personas vinculadas y lo último del historial.
import { useEffect, useRef, useState } from 'react';
import Icono from '../../ui/Icono';
import { ESTADO, ROL } from '../cartera/catalogos';
import { Fila, ListaActividad, copiarCorreo, num, precio, whatsapp } from './comun';
import { VincularPersona } from './Modales';
import { useFicha, type TFichaTab } from '../../../store/hooks/useFicha.hook';
import { abrirPersona, avisar, bloqueCaptacion, fichaCompleta, fotosDesdeDrive, toast } from '../../../utils/app';
import { abrirModal } from '../../../utils/modal';
import type { IPropiedad, TPropiedadEstado } from '../../../store/interfaces/propiedad.interface';
import type { TPersonaRol } from '../../../store/interfaces/persona.interface';

// La captación la dibuja src/renderer/etapas.js (Etapas.bloque) en su propio contenedor, que React deja vacío.
// En cada recarga de la ficha (version) Etapas lo vuelve a dibujar en el MISMO contenedor: si se creara uno
// nuevo, un dibujo que aún espera su respuesta quedaría en un nodo fuera de la página (y sus botones, sin dueño).
function Captacion({ propId, version }: { propId: string; version: number }) {
  const caja = useRef<HTMLDivElement>(null);
  const { fichaRecargar } = useFicha();
  useEffect(() => {
    const el = caja.current; if (!el) return;
    if (!el.childNodes.length) el.innerHTML = '<p class="muted small">Cargando la captación…</p>';
    bloqueCaptacion(el, propId, () => { fichaRecargar(); });
  }, [propId, version, fichaRecargar]);
  return <div className="im-captres" id="fCapt" ref={caja} />;
}

function Galeria({ p }: { p: IPropiedad }) {
  const fotos = p.fotos || [];
  const [sel, setSel] = useState(0);
  const [rotas, setRotas] = useState<number[]>([]); // fotos que no cargan (sin conexión o URL vencida)
  const rota = (i: number) => setRotas((r) => (r.includes(i) ? r : [...r, i]));
  const actual = fotos[sel] ? sel : 0;
  const sinFoto = <span className="im-noph"><Icono nombre="house" tam={34} /></span>;
  return (
    <div className="im-gal">
      {fotos.length ? <>
        <div className="im-gmain">{rotas.includes(actual) ? sinFoto : <img key={actual} src={fotos[actual]} alt="" loading="lazy" onError={() => rota(actual)} />}</div>
        {fotos.length > 1 && (
          <div className="im-thumbs">
            {fotos.slice(0, 12).map((u, i) => rotas.includes(i) && i !== actual ? null : (
              <img key={i} src={u} data-i={i} className={i === actual ? 'on' : ''} loading="lazy" alt="" onClick={() => setSel(i)} onError={() => rota(i)} />
            ))}
          </div>
        )}
      </> : <div className="im-gmain vacia">{sinFoto}<span className="im-gnote">Sin fotos todavía</span></div>}
      <button className="secondary small im-gdrive" id="fDrive" onClick={() => fotosDesdeDrive(p.id)}><Icono nombre="drive" tam={14} /> Fotos desde Drive</button>
    </div>
  );
}

function Caracteristicas({ p }: { p: IPropiedad }) {
  const vacia = [p.supTotal, p.supUtil, p.dormitorios, p.banos, p.estacionamientos, p.bodegas, p.gastosComunes].every((x) => x == null || (x as unknown) === '') && !p.amoblado && !p.corredor;
  const { fichaRecargar } = useFicha();
  return (
    <div className="im-box"><h3>Características</h3>
      {vacia && <p className="muted small im-vacio">Sin características todavía · <a href="#" id="fCarVacio" onClick={(e) => { e.preventDefault(); fichaCompleta(p.id, () => { fichaRecargar(); }); }}>Completar ficha</a></p>}
      <dl className="im-dl">
        <Fila k="Superficie total" v={p.supTotal != null ? num(p.supTotal) + ' m²' : ''} />
        <Fila k="Superficie útil" v={p.supUtil != null ? num(p.supUtil) + ' m²' : ''} />
        <Fila k="Dormitorios" v={p.dormitorios} />
        <Fila k="Baños" v={p.banos} />
        <Fila k="Estacionamientos" v={p.estacionamientos} />
        <Fila k="Bodegas" v={p.bodegas} />
        <Fila k="Gastos comunes" v={p.gastosComunes != null ? '$' + num(p.gastosComunes) : ''} />
        <Fila k="Amoblado" v={p.amoblado ? 'Sí' : ''} />
        <Fila k="Corredor" v={p.corredor ? <>{p.corredor.nombre}{p.corredor.email && <><br /><span className="muted small">{p.corredor.email}</span></>}</> : ''} />
      </dl>
      {p.descripcion && <><h3 style={{ marginTop: 14 }}>Descripción</h3><p className="im-desc">{p.descripcion}</p></>}
      {p.notasInternas && <><h3 style={{ marginTop: 14 }}>Notas internas</h3><p className="im-desc">{p.notasInternas}</p></>}
    </div>
  );
}

const ESTADOS_VENTA: TPropiedadEstado[] = ['disponible', 'reservada', 'vendida', 'no_disponible'];
const ESTADOS_ARRIENDO: TPropiedadEstado[] = ['disponible', 'reservada', 'arrendada', 'no_disponible'];

function Comercializacion({ p }: { p: IPropiedad }) {
  const { fichaSetEstado } = useFicha();
  const cambiar = async (campo: 'estadoVenta' | 'estadoArriendo', valor: string) => avisar(await fichaSetEstado(campo, valor));
  const fila = (op: 'venta' | 'arriendo') => {
    const campo = op === 'venta' ? 'estadoVenta' : 'estadoArriendo'; const estados = op === 'venta' ? ESTADOS_VENTA : ESTADOS_ARRIENDO;
    return (
      <div className="im-com">
        <span><small>{op === 'venta' ? 'Venta' : 'Arriendo mensual'}</small><b>{precio(op === 'venta' ? p.precioVenta : p.precioArriendo) || 'Sin precio'}</b></span>
        <select data-est={campo} value={p[campo] || estados[0]} onChange={(e) => cambiar(campo, e.target.value)}>
          {estados.map((o) => <option key={o} value={o}>{ESTADO[o][0]}</option>)}
        </select>
      </div>
    );
  };
  return <div className="im-box"><h3>Comercialización</h3>{p.venta && fila('venta')}{p.arriendo && fila('arriendo')}</div>;
}

function PersonasVinculadas({ p }: { p: IPropiedad }) {
  const { personas, fichaDesvincular } = useFicha();
  const vincs = (p.vinculos || []).map((v) => ({ ...v, c: personas.find((x) => x.id === v.personaId) })).filter((v) => v.c);
  const quitar = async (personaId: string, rol: string) => { const r = await fichaDesvincular(personaId, rol); if (r.error) toast(r.error, 4000); };
  return (
    <div className="im-box">
      <div className="im-bh"><h3>Personas</h3><button className="secondary small" id="fVinc" onClick={() => abrirModal(<VincularPersona p={p} />)}><Icono nombre="plus" tam={13} /> Vincular</button></div>
      {vincs.length ? vincs.map(({ c, rol }) => c && (
        <div className="im-pv" key={`${c.id}-${rol}`}>
          <span className="im-av">{c.nombre.trim()[0] || '?'}</span>
          <span className="im-pvt">
            {c.reservado ? <b><Icono nombre="lock" tam={12} /> {c.nombre}</b> : <b data-per={c.id} onClick={() => abrirPersona(c.id)}>{c.nombre}</b>}
            <small>{ROL[rol as TPersonaRol] || rol}{c.rut ? ' · ' + c.rut : c.reservado ? ' · lo ve quien captó la propiedad' : ''}</small>
          </span>
          {c.telefono && <button className="ghost small" title="WhatsApp" data-wa={c.telefono} onClick={() => whatsapp(c.telefono!)}><Icono nombre="whatsapp" tam={15} /></button>}
          {c.email && <button className="ghost small" title="Copiar correo" data-mail={c.email} onClick={() => copiarCorreo(c.email)}><Icono nombre="mail" tam={15} /></button>}
          {!c.reservado && <button className="ghost small" title="Quitar vínculo" data-unl={c.id} data-rol={rol} onClick={() => quitar(c.id, rol)}><Icono nombre="x" tam={14} /></button>}
        </div>
      )) : <p className="muted small">Sin personas vinculadas. Agrega al propietario para poder firmar el mandato.</p>}
    </div>
  );
}

export default function Resumen({ p, irA, version }: { p: IPropiedad; irA: (t: TFichaTab) => void; version: number }) {
  const { actividad } = useFicha();
  return <>
    <Captacion key={p.id} propId={p.id} version={version} />
    <div className="im-fcols">
      <div>
        <Galeria p={p} />
        <Caracteristicas p={p} />
      </div>
      <div>
        <Comercializacion p={p} />
        <PersonasVinculadas p={p} />
        <div className="im-box">
          <div className="im-bh"><h3>Lo último</h3><button className="ghost small" data-go="historial" onClick={() => irA('historial')}>Ver todo</button></div>
          <ListaActividad items={actividad.slice(0, 5)} />
        </div>
      </div>
    </div>
  </>;
}
