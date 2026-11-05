// Pestañas «Negocios», «Firmas y documentos», «Portales» e «Historial» de la ficha.
// Con el kit: Card, Boton, Tabs, Badge, ItemLista, Input y LineaTiempo; la tabla de negocios sigue con sus
// clases im-n* de styles.css.
// Los id y data-* (#fFirmasBox, #fDocs, #fPI, [data-doc], [data-st], data-neg, data-nf, data-pi, data-lead,
// [data-pv], [data-nuevo]…) los usan las pruebas y Aprende.
import { useState, type FormEvent } from 'react';
import Icono from '../../ui/Icono';
import Boton from '../../ui/Boton';
import Card from '../../ui/Card';
import Tabs, { type TTabOpcion } from '../../ui/Tabs';
import Badge from '../../ui/Badge';
import ItemLista from '../../ui/ItemLista';
import Input from '../../ui/Input';
import EstadoVacio from '../../ui/EstadoVacio';
import { FinalizarAviso } from './Modales';
import { IconoDoc, ListaActividad, TONO_FIRMA, copiarCorreo, estadoFirma, whatsapp } from './comun';
import { useFicha } from '../../../store/hooks/useFicha.hook';
import {
  abrirNegocio, abrirPortales, abrirUrl, avisar, crearPersona, nuevoNegocioDe, operacionEnAgente,
  publicarEnPortalInmobiliario, seguimientoFirmas, toast,
} from '../../../utils/app';
import { abrirModal } from '../../../utils/modal';
import { fecha, fechaHora } from '../../../utils/formato';
import { cx } from '../../../utils/cx';
import type { IPropiedad, TOperacion } from '../../../store/interfaces/propiedad.interface';
import type { INegocio } from '../../../store/interfaces/negocio.interface';
import type { TFiltroNegocios } from '../../../store/hooks/useFicha.hook';
import type { TTono } from '../../ui/tonos';

const OPS: TOperacion[] = ['venta', 'arriendo'];
// dos columnas en pantallas anchas (como el resumen)
const COLUMNAS = 'tw:grid tw:gap-4 tw:lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] tw:items-start';

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
  const FILTROS: TTabOpcion<TFiltroNegocios>[] = [['abiertos', 'Abiertos', cuenta('abiertos')], ['cerrados', 'Cerrados', cuenta('cerrados')], ['todos', 'Todos']];
  return (
    <div className="tw:max-w-[920px]">
      <Card titulo="Negocios" accion={ops.length > 0 && (
        <span className="tw:flex tw:gap-2">
          {ops.map((o) => <Boton key={o} variante="secundario" tamano="sm" icono="plus" data-negnew={o} onClick={() => nuevoNegocioDe({ tipo: o, propId: p.id })}>{o === 'venta' ? 'Venta' : 'Arriendo'}</Boton>)}
        </span>
      )}>
        {l.length ? <>
          <Tabs dato="nf" etiqueta="Filtrar negocios" className="tw:mb-3" opciones={FILTROS} valor={f} alCambiar={fichaSetFiltroNegocios} />
          <div className="im-ntab">
            <div className="im-nhead"><span>Cliente</span><span>Etapa</span><span>Próxima acción</span><span /></div>
            {ver.length ? ver.map((n) => <FilaNegocio key={n.id} n={n} />) : <EstadoVacio compacto texto="No hay negocios con ese filtro." className="tw:px-2.5 tw:py-2.5" />}
          </div>
        </> : <EstadoVacio compacto texto="Sin negocios. Créalo cuando aparezca un interesado: cada etapa te dirá qué falta y qué firmar." />}
      </Card>
    </div>
  );
}

// ---------- Firmas y documentos ----------
export function Firmas({ p }: { p: IPropiedad }) {
  const { fichaPdfAbrir, fichaDocElegir, fichaDocCarpeta, fichaDocAbrir, fichaDocQuitar } = useFicha();
  const l = (p.firmas || []).slice(0, 5);
  const err = (r: { error?: string }) => { if (r.error) toast(r.error, 4000); };
  return (
    <div className={COLUMNAS}>
      <div id="fFirmasBox" className="tw:min-w-0">
        <Card titulo="Documentos en firma"
          accion={l.length > 0 && <Boton id="fFirmas" variante="fantasma" tamano="sm" icono="rotateR" onClick={() => seguimientoFirmas(p.id)}>Seguimiento</Boton>}>
          {l.length ? (
            <div className="tw:-mx-3 tw:flex tw:flex-col">
              {l.map((x, i) => {
                const [t, c] = estadoFirma(x.estado);
                return (
                  <ItemLista key={i} data-doc="" media={<IconoDoc nombre="sign" />} titulo={x.plantilla}
                    detalle={`${fecha(x.fecha)}${x.operacion ? ' · operación ' + x.operacion : ''} · ${(x.firmantes || []).map((s) => s.nombre).join(', ')}`}
                    derecha={<>
                      <Badge tono={TONO_FIRMA[c] ?? 'gris'} punto>{t}</Badge>
                      {x.archivo && <Boton variante="fantasma" tamano="sm" data-pdf={x.archivo} title="Abrir el PDF creado en Asset" onClick={async () => err(await fichaPdfAbrir(x.archivo!))}>PDF</Boton>}
                      {x.operacion && <Boton variante="secundario" tamano="sm" data-fop={x.operacion} onClick={() => operacionEnAgente(Number(x.operacion))}>Ver</Boton>}
                    </>} />
                );
              })}
            </div>
          ) : <EstadoVacio compacto texto="Genera contratos, promesas, mandatos u órdenes de visita con tus plantillas: se llenan solos con la ficha y las personas. Si no tienes la plantilla (por ejemplo, el comprobante de pago de una reserva), Asset lo crea." />}
        </Card>
      </div>
      <div id="fDocs" className="tw:min-w-0">
        <Card titulo="Documentos" accion={
          <span className="tw:flex tw:gap-1">
            <Boton id="fDir" variante="fantasma" tamano="sm" icono="folderOpen" title="Abrir carpeta" aria-label="Abrir carpeta" onClick={async () => err(await fichaDocCarpeta())} />
            <Boton id="fDoc" variante="secundario" tamano="sm" icono="plus" onClick={async () => avisar(await fichaDocElegir(), 4000)}>Agregar</Boton>
          </span>
        }>
          {(p.documentos || []).length ? (
            <div className="tw:-mx-3 tw:flex tw:flex-col">
              {p.documentos!.map((d) => (
                <ItemLista key={d.id} data-doc="" media={<IconoDoc nombre="file" />} titulo={d.nombre} detalle={fecha(d.fecha)}
                  derecha={<>
                    <Boton variante="secundario" tamano="sm" data-open={d.id} onClick={async () => err(await fichaDocAbrir(d.id))}>Abrir</Boton>
                    <Boton variante="fantasma" tamano="sm" icono="trash" data-rm={d.id} title="Quitar" aria-label="Quitar" onClick={async () => err(await fichaDocQuitar(d.id))} />
                  </>} />
              ))}
            </div>
          ) : <EstadoVacio compacto texto="Arrastra aquí mandatos, escrituras, certificados o fotos. Los PDF se abren en el editor para enviarlos a firmar." />}
        </Card>
      </div>
    </div>
  );
}

// ---------- Portales: el aviso en Portal Inmobiliario y los interesados que llegan de los avisos ----------
// estado del aviso: [texto, clave (data-st), tono]
const PI_ST: Record<string, [string, string, TTono]> = {
  active: ['Activo', 'ok', 'verde'], paused: ['Pausado', 'res', 'amarillo'], closed: ['Finalizado', 'off', 'gris'],
  under_review: ['En revisión', 'res', 'amarillo'], inactive: ['Inactivo', 'off', 'gris'],
};
const CANAL_IC: Record<string, string> = { whatsapp: 'whatsapp', question: 'help', call: 'phone', schedule: 'calendar', quotation: 'coins' };

function FilaAviso({ p, op }: { p: IPropiedad; op: TOperacion }) {
  const { fichaAvisoEstado, fichaAvisoActualizar } = useFicha();
  const [ocupado, setOcupado] = useState(false);
  const a = p.portales?.pi?.[op]; const st = a?.status || ''; const [l, c, tono] = PI_ST[st] || [st, '', 'gris'];
  const hacer = async (fn: () => Promise<{ mensaje?: string; error?: string }>) => { setOcupado(true); avisar(await fn(), 6000); setOcupado(false); };
  const finalizar = () => abrirModal(<FinalizarAviso op={op} alConfirmar={() => hacer(() => fichaAvisoEstado(op, 'closed'))} />);
  return (
    <div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:py-3 tw:border-0 tw:border-t tw:border-solid tw:border-edge tw:first:border-t-0 tw:first:pt-0">
      <span className="tw:flex tw:flex-col tw:items-start tw:gap-1">
        <small className="tw:text-xs tw:text-muted">{op === 'venta' ? 'Venta' : 'Arriendo'}{a?.itemId ? ' · ' + a.itemId : ''}</small>
        {!a?.itemId ? <Badge>No publicado</Badge> : <span data-st={c}><Badge tono={tono} punto>{l}</Badge></span>}
        {a?.error && <em className="tw:not-italic tw:text-xs tw:text-err tw:max-w-[260px]">{a.error}</em>}
      </span>
      <span className="tw:flex tw:flex-wrap tw:gap-1.5">
        {!a?.itemId || st === 'closed'
          ? <Boton tamano="sm" data-pi="publicar" data-op={op} onClick={() => publicarEnPortalInmobiliario(p, op)}>{st === 'closed' ? 'Publicar de nuevo' : 'Publicar'}</Boton>
          : <>
            {a.permalink && <Boton variante="fantasma" tamano="sm" icono="export" data-pi="ver" data-op={op} title="Abrir el aviso" aria-label="Abrir el aviso" onClick={() => abrirUrl(a.permalink!)} />}
            <Boton variante="secundario" tamano="sm" data-pi="actualizar" data-op={op} disabled={ocupado} onClick={() => hacer(() => fichaAvisoActualizar(op))}>Actualizar</Boton>
            {st === 'active' && <Boton variante="fantasma" tamano="sm" data-pi="paused" data-op={op} disabled={ocupado} onClick={() => hacer(() => fichaAvisoEstado(op, 'paused'))}>Pausar</Boton>}
            {st === 'paused' && <Boton variante="fantasma" tamano="sm" data-pi="active" data-op={op} disabled={ocupado} onClick={() => hacer(() => fichaAvisoEstado(op, 'active'))}>Reactivar</Boton>}
            <Boton variante="peligro" tamano="sm" data-pi="closed" data-op={op} disabled={ocupado} onClick={finalizar}>Finalizar</Boton>
          </>}
      </span>
    </div>
  );
}

function Interesados({ p }: { p: IPropiedad }) {
  const { personas, fichaVincular } = useFicha();
  const l = (p.leads || []).slice(0, 12);
  if (!l.length) return <Card titulo="Interesados desde portales"><EstadoVacio compacto texto="Todavía no llegan interesados desde los avisos." /></Card>;
  const soloRut = (r: string) => String(r).replace(/[^0-9kK]/g, '');
  // «Agregar al CRM»: «Nueva persona» (src/renderer/inmo.js) con sus datos, y queda vinculada como interesada
  const agregar = (x: typeof l[number]) => crearPersona({
    rol: 'interesado', pre: { nombre: x.nombre || '', email: x.email || '', telefono: x.telefono || '' },
    despues: async (c) => { const r = await fichaVincular(c.id, 'interesado'); if (r.error) toast(r.error, 4000); },
  });
  return (
    <Card titulo="Interesados desde portales" accion={<Badge>{p.leads!.length}</Badge>}>
      <div className="tw:-mx-3 tw:flex tw:flex-col">
        {l.map((x, i) => {
          const c = x.rut ? personas.find((q) => soloRut(q.rut || '') === soloRut(x.rut!)) : null;
          return (
            <ItemLista key={i} data-pv="" className={cx(!x.visto && 'tw:bg-green-soft/40')}
              media={<IconoDoc nombre={CANAL_IC[x.canal || ''] || 'user'} />}
              titulo={<>{x.nombre || 'Sin nombre'}{!x.visto && <> <span data-nuevo=""><Badge tono="verde">Nuevo</Badge></span></>}</>}
              detalle={`${x.canalTxt || x.canal} · ${fechaHora(x.fecha)}${x.rut ? ' · ' + x.rut : ''}`}
              derecha={<>
                {x.telefono && <Boton variante="fantasma" tamano="sm" icono="whatsapp" title="WhatsApp" aria-label="WhatsApp" data-wa={x.telefono} onClick={() => whatsapp(x.telefono!)} />}
                {x.email && <Boton variante="fantasma" tamano="sm" icono="mail" title="Copiar correo" aria-label="Copiar correo" data-mail={x.email} onClick={() => copiarCorreo(x.email!)} />}
                {x.rut
                  ? c && <Boton variante="fantasma" tamano="sm" icono="briefcase" title="Crear negocio con esta persona" aria-label="Crear negocio con esta persona"
                    data-negnew={p.venta ? 'venta' : 'arriendo'} data-cli={c.id} onClick={() => nuevoNegocioDe({ tipo: p.venta ? 'venta' : 'arriendo', propId: p.id, clienteId: c.id })} />
                  : <Boton variante="fantasma" tamano="sm" icono="plus" title="Agregar al CRM" aria-label="Agregar al CRM" data-lead={i} onClick={() => agregar(x)} />}
              </>} />
          );
        })}
      </div>
    </Card>
  );
}

export function Portales({ p }: { p: IPropiedad }) {
  const { portal } = useFicha();
  const ops = OPS.filter((o) => p[o]);
  return (
    <div className={COLUMNAS}>
      <div className="tw:min-w-0">
        {ops.length ? (
          <div id="fPI">
            <Card titulo={<span className="im-pih"><span className="im-pilogo">PI</span>Portal Inmobiliario</span>}
              accion={portal?.conectada
                ? <small className="tw:text-[13px] tw:text-muted">{portal.cuenta?.nickname || ''}</small>
                : <Boton variante="fantasma" tamano="sm" data-pi="config" onClick={abrirPortales}>Conectar cuenta</Boton>}>
              {ops.map((op) => <FilaAviso key={op} p={p} op={op} />)}
            </Card>
          </div>
        ) : <Card><EstadoVacio compacto texto="Marca la propiedad en venta o arriendo para publicarla." /></Card>}
      </div>
      <div className="tw:min-w-0"><Interesados p={p} /></div>
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
    <div className="tw:max-w-[920px]">
      <Card titulo="Historial">
        <form id="fNota" onSubmit={guardar} className="tw:flex tw:gap-2 tw:mb-4">
          <Input id="fNotaT" placeholder="Agregar una nota (visita, llamada, acuerdo…)" aria-label="Nota" clasesCampo="tw:flex-1" value={texto} onChange={(e) => setTexto(e.target.value)} />
          <Boton type="submit" variante="secundario">Guardar</Boton>
        </form>
        <ListaActividad items={actividad} />
      </Card>
    </div>
  );
}
