// Pestañas «Negocios», «Firmas y documentos», «Portales» e «Historial» de la ficha.
// Los id y data-* (#fFirmasBox, #fDocs, #fPI, data-neg, data-pi, data-lead…) los usan las pruebas y Aprende.
import { useState, type FormEvent } from 'react';
import Icono from '../../ui/Icono';
import { FinalizarAviso } from './Modales';
import { ListaActividad, copiarCorreo, estadoFirma, whatsapp } from './comun';
import { useFicha } from '../../../store/hooks/useFicha.hook';
import {
  abrirNegocio, abrirPortales, abrirUrl, avisar, crearPersona, nuevoNegocioDe, operacionEnAgente,
  publicarEnPortalInmobiliario, seguimientoFirmas, toast,
} from '../../../utils/app';
import { abrirModal } from '../../../utils/modal';
import { fecha, fechaHora } from '../../../utils/formato';
import type { IPropiedad, TOperacion } from '../../../store/interfaces/propiedad.interface';
import type { INegocio } from '../../../store/interfaces/negocio.interface';
import type { TFiltroNegocios } from '../../../store/hooks/useFicha.hook';

const OPS: TOperacion[] = ['venta', 'arriendo'];

// ---------- Negocios: una fila por negocio (cliente, operación, etapa con su avance y la próxima acción) ----------
function FilaNegocio({ n }: { n: INegocio }) {
  const total = n.total || 0; const pct = total ? Math.round((((n.orden ?? 0) + 1) / total) * 100) : 0; const pa = n.proximaAccion;
  const abierto = n.estado === 'abierto';
  return (
    <button className="im-nrow" data-neg={n.id} onClick={() => abrirNegocio(n.id)}>
      <span className="im-nc"><b>{n.cliente?.nombre || 'Sin cliente'}</b><small>{n.tipo === 'venta' ? 'Venta' : 'Arriendo'}</small></span>
      <span className="im-ne">{abierto
        ? <><b>{n.etapaInfo?.t || ''}</b><span className="im-nbar"><i style={{ width: `${pct}%` }} /></span><small>Etapa {(n.orden ?? 0) + 1} de {total}</small></>
        : <b className={n.estado === 'ganado' ? 'ok' : 'bad'}>{n.estado === 'ganado' ? 'Cerrado con éxito' : 'Perdido'}</b>}</span>
      <span className="im-na">{abierto && <>{pa?.texto || n.siguiente || '—'}{pa?.fecha && <small>{fecha(pa.fecha)}</small>}</>}</span>
      <Icono nombre="chevR" tam={16} />
    </button>
  );
}

export function Negocios({ p }: { p: IPropiedad }) {
  const { negocios: l, filtroNegocios, fichaSetFiltroNegocios } = useFicha();
  const ops = OPS.filter((o) => p[o]);
  const f: TFiltroNegocios = filtroNegocios || (l.some((n) => n.estado === 'abierto') ? 'abiertos' : 'todos');
  const ver = l.filter((n) => (f === 'todos' ? true : f === 'abiertos' ? n.estado === 'abierto' : n.estado !== 'abierto'));
  const cuenta = (k: TFiltroNegocios) => l.filter((n) => (k === 'abiertos' ? n.estado === 'abierto' : n.estado !== 'abierto')).length;
  const FILTROS: [TFiltroNegocios, string][] = [['abiertos', 'Abiertos'], ['cerrados', 'Cerrados'], ['todos', 'Todos']];
  return (
    <div className="im-pw">
      <div className="im-box">
        <div className="im-bh"><h3>Negocios</h3>
          <span>{ops.map((o) => <button key={o} className="secondary small" data-negnew={o} onClick={() => nuevoNegocioDe({ tipo: o, propId: p.id })}><Icono nombre="plus" tam={13} /> {o === 'venta' ? 'Venta' : 'Arriendo'}</button>)}</span>
        </div>
        {l.length ? <>
          <div className="im-nf">{FILTROS.map(([k, t]) => (
            <button key={k} className={`im-nfb${f === k ? ' on' : ''}`} data-nf={k} onClick={() => fichaSetFiltroNegocios(k)}>{t}{k !== 'todos' && <> <b>{cuenta(k)}</b></>}</button>
          ))}</div>
          <div className="im-ntab">
            <div className="im-nhead"><span>Cliente</span><span>Etapa</span><span>Próxima acción</span><span /></div>
            {ver.length ? ver.map((n) => <FilaNegocio key={n.id} n={n} />) : <p className="muted small" style={{ padding: '10px 4px' }}>No hay negocios con ese filtro.</p>}
          </div>
        </> : <p className="muted small">Sin negocios. Créalo cuando aparezca un interesado: cada etapa te dirá qué falta y qué firmar.</p>}
      </div>
    </div>
  );
}

// ---------- Firmas y documentos ----------
export function Firmas({ p }: { p: IPropiedad }) {
  const { fichaPdfAbrir, fichaDocElegir, fichaDocCarpeta, fichaDocAbrir, fichaDocQuitar } = useFicha();
  const l = (p.firmas || []).slice(0, 5);
  const err = (r: { error?: string }) => { if (r.error) toast(r.error, 4000); };
  return (
    <div className="im-fcols">
      <div>
        <div className="im-box" id="fFirmasBox">
          <div className="im-bh"><h3>Documentos en firma</h3>{l.length > 0 && <button className="ghost small" id="fFirmas" onClick={() => seguimientoFirmas(p.id)}><Icono nombre="rotateR" tam={13} /> Seguimiento</button>}</div>
          {l.length ? l.map((x, i) => { const [t, c] = estadoFirma(x.estado); return (
            <div className="im-doc" key={i}>
              <span className="im-dic"><Icono nombre="sign" tam={16} /></span>
              <span className="im-dt"><b>{x.plantilla}</b><small>{fecha(x.fecha)}{x.operacion ? ' · operación ' + x.operacion : ''} · {(x.firmantes || []).map((s) => s.nombre).join(', ')}</small></span>
              <i className={`im-st ${c}`}>{t}</i>
              {x.archivo && <button className="ghost small im-pdf" data-pdf={x.archivo} title="Abrir el PDF creado en Asset" onClick={async () => err(await fichaPdfAbrir(x.archivo!))}>PDF</button>}
              {x.operacion && <button className="secondary small" data-fop={x.operacion} onClick={() => operacionEnAgente(Number(x.operacion))}>Ver</button>}
            </div>
          ); }) : <p className="muted small">Genera contratos, promesas, mandatos u órdenes de visita con tus plantillas: se llenan solos con la ficha y las personas. Si no tienes la plantilla (por ejemplo, el comprobante de pago de una reserva), Asset lo crea.</p>}
        </div>
      </div>
      <div>
        <div className="im-box" id="fDocs">
          <div className="im-bh"><h3>Documentos</h3>
            <span>
              <button className="ghost small" id="fDir" title="Abrir carpeta" onClick={async () => err(await fichaDocCarpeta())}><Icono nombre="folderOpen" tam={15} /></button>
              <button className="secondary small" id="fDoc" onClick={async () => avisar(await fichaDocElegir(), 4000)}><Icono nombre="plus" tam={13} /> Agregar</button>
            </span>
          </div>
          {(p.documentos || []).length ? p.documentos!.map((d) => (
            <div className="im-doc" key={d.id}>
              <span className="im-dic"><Icono nombre="file" tam={16} /></span>
              <span className="im-dt"><b>{d.nombre}</b><small>{fecha(d.fecha)}</small></span>
              <button className="secondary small" data-open={d.id} onClick={async () => err(await fichaDocAbrir(d.id))}>Abrir</button>
              <button className="ghost small" data-rm={d.id} title="Quitar" onClick={async () => err(await fichaDocQuitar(d.id))}><Icono nombre="trash" tam={14} /></button>
            </div>
          )) : <p className="muted small">Arrastra aquí mandatos, escrituras, certificados o fotos. Los PDF se abren en el editor para enviarlos a firmar.</p>}
        </div>
      </div>
    </div>
  );
}

// ---------- Portales: el aviso en Portal Inmobiliario y los interesados que llegan de los avisos ----------
const PI_ST: Record<string, [string, string]> = { active: ['Activo', 'ok'], paused: ['Pausado', 'res'], closed: ['Finalizado', 'off'], under_review: ['En revisión', 'res'], inactive: ['Inactivo', 'off'] };
const CANAL_IC: Record<string, string> = { whatsapp: 'whatsapp', question: 'help', call: 'phone', schedule: 'calendar', quotation: 'coins' };

function FilaAviso({ p, op }: { p: IPropiedad; op: TOperacion }) {
  const { fichaAvisoEstado, fichaAvisoActualizar } = useFicha();
  const [ocupado, setOcupado] = useState(false);
  const a = p.portales?.pi?.[op]; const st = a?.status || ''; const [l, c] = PI_ST[st] || [st, ''];
  const hacer = async (fn: () => Promise<{ mensaje?: string; error?: string }>) => { setOcupado(true); avisar(await fn(), 6000); setOcupado(false); };
  const finalizar = () => abrirModal(<FinalizarAviso op={op} alConfirmar={() => hacer(() => fichaAvisoEstado(op, 'closed'))} />);
  return (
    <div className="im-pirow">
      <span className="im-pit">
        <small>{op === 'venta' ? 'Venta' : 'Arriendo'}{a?.itemId ? ' · ' + a.itemId : ''}</small>
        {!a?.itemId ? <span className="im-st">No publicado</span> : <span className={`im-st ${c}`}>{l}</span>}
        {a?.error && <em className="im-err">{a.error}</em>}
      </span>
      <span className="im-pib">
        {!a?.itemId || st === 'closed'
          ? <button className="primary small" data-pi="publicar" data-op={op} onClick={() => publicarEnPortalInmobiliario(p, op)}>{st === 'closed' ? 'Publicar de nuevo' : 'Publicar'}</button>
          : <>
            {a.permalink && <button className="ghost small" data-pi="ver" data-op={op} title="Abrir el aviso" onClick={() => abrirUrl(a.permalink!)}><Icono nombre="export" tam={14} /></button>}
            <button className="secondary small" data-pi="actualizar" data-op={op} disabled={ocupado} onClick={() => hacer(() => fichaAvisoActualizar(op))}>Actualizar</button>
            {st === 'active' && <button className="ghost small" data-pi="paused" data-op={op} disabled={ocupado} onClick={() => hacer(() => fichaAvisoEstado(op, 'paused'))}>Pausar</button>}
            {st === 'paused' && <button className="ghost small" data-pi="active" data-op={op} disabled={ocupado} onClick={() => hacer(() => fichaAvisoEstado(op, 'active'))}>Reactivar</button>}
            <button className="ghost small im-danger" data-pi="closed" data-op={op} disabled={ocupado} onClick={finalizar}>Finalizar</button>
          </>}
      </span>
    </div>
  );
}

function Interesados({ p }: { p: IPropiedad }) {
  const { personas, fichaVincular } = useFicha();
  const l = (p.leads || []).slice(0, 12);
  if (!l.length) return <div className="im-box"><h3>Interesados desde portales</h3><p className="muted small">Todavía no llegan interesados desde los avisos.</p></div>;
  const soloRut = (r: string) => String(r).replace(/[^0-9kK]/g, '');
  // «Agregar al CRM»: «Nueva persona» (src/renderer/inmo.js) con sus datos, y queda vinculada como interesada
  const agregar = (x: typeof l[number]) => crearPersona({
    rol: 'interesado', pre: { nombre: x.nombre || '', email: x.email || '', telefono: x.telefono || '' },
    despues: async (c) => { const r = await fichaVincular(c.id, 'interesado'); if (r.error) toast(r.error, 4000); },
  });
  return (
    <div className="im-box">
      <div className="im-bh"><h3>Interesados desde portales</h3><small className="muted">{p.leads!.length}</small></div>
      {l.map((x, i) => {
        const c = x.rut ? personas.find((q) => soloRut(q.rut || '') === soloRut(x.rut!)) : null;
        return (
          <div key={i} className={`im-pv${x.visto ? '' : ' nuevo'}`}>
            <span className="im-av"><Icono nombre={CANAL_IC[x.canal || ''] || 'user'} tam={15} /></span>
            <span className="im-pvt"><b>{x.nombre || 'Sin nombre'}{!x.visto && <> <i className="im-new">Nuevo</i></>}</b><small>{x.canalTxt || x.canal} · {fechaHora(x.fecha)}{x.rut ? ' · ' + x.rut : ''}</small></span>
            {x.telefono && <button className="ghost small" title="WhatsApp" data-wa={x.telefono} onClick={() => whatsapp(x.telefono!)}><Icono nombre="whatsapp" tam={15} /></button>}
            {x.email && <button className="ghost small" title="Copiar correo" data-mail={x.email} onClick={() => copiarCorreo(x.email!)}><Icono nombre="mail" tam={15} /></button>}
            {x.rut
              ? c && <button className="ghost small" title="Crear negocio con esta persona" data-negnew={p.venta ? 'venta' : 'arriendo'} data-cli={c.id} onClick={() => nuevoNegocioDe({ tipo: p.venta ? 'venta' : 'arriendo', propId: p.id, clienteId: c.id })}><Icono nombre="briefcase" tam={15} /></button>
              : <button className="ghost small" title="Agregar al CRM" data-lead={i} onClick={() => agregar(x)}><Icono nombre="plus" tam={14} /></button>}
          </div>
        );
      })}
    </div>
  );
}

export function Portales({ p }: { p: IPropiedad }) {
  const { portal } = useFicha();
  const ops = OPS.filter((o) => p[o]);
  return (
    <div className="im-fcols">
      <div>
        {ops.length ? (
          <div className="im-box" id="fPI">
            <div className="im-bh">
              <h3 className="im-pih"><span className="im-pilogo">PI</span>Portal Inmobiliario</h3>
              {portal?.conectada ? <small className="muted">{portal.cuenta?.nickname || ''}</small> : <button className="ghost small" data-pi="config" onClick={abrirPortales}>Conectar cuenta</button>}
            </div>
            {ops.map((op) => <FilaAviso key={op} p={p} op={op} />)}
          </div>
        ) : <div className="im-box"><p className="muted small">Marca la propiedad en venta o arriendo para publicarla.</p></div>}
      </div>
      <div><Interesados p={p} /></div>
    </div>
  );
}

// ---------- Historial con notas ----------
export function Historial() {
  const { actividad, fichaNota } = useFicha();
  const [texto, setTexto] = useState('');
  const guardar = async (e: FormEvent) => {
    e.preventDefault(); const t = texto.trim(); if (!t) return;
    const r = await fichaNota(t); if (r.error) return toast(r.error, 4000);
    setTexto('');
  };
  return (
    <div className="im-pw">
      <div className="im-box"><h3>Historial</h3>
        <form className="im-nota" id="fNota" onSubmit={guardar}>
          <input id="fNotaT" placeholder="Agregar una nota (visita, llamada, acuerdo…)" value={texto} onChange={(e) => setTexto(e.target.value)} />
          <button className="secondary small">Guardar</button>
        </form>
        <ListaActividad items={actividad} />
      </div>
    </div>
  );
}
