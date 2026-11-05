// Pestaña «Avisos»: totales, cada aviso con su rendimiento y recomendaciones, y las disponibles sin publicar.
// Clases pb-av, pb-met, pb-pts, pb-empty y data-mas los usa test/publicaciones-e2e.js.
// Con el kit: Kpi, Card, Boton y EstadoVacio; el aviso conserva su grilla (.pb-av de styles.css) con el borde de una Card.
import { useState } from 'react';
import Icono from '../../ui/Icono';
import Boton from '../../ui/Boton';
import Card from '../../ui/Card';
import Kpi from '../../ui/Kpi';
import EstadoVacio from '../../ui/EstadoVacio';
import { abrirFicha, abrirUrl, ajustarPrecioAviso, elegirParaPublicar, publicarPropiedad } from '../../../utils/app';
import { monto } from '../../../utils/formato';
import { Anillo, BORDE_CARD, Estado, Foto, fmt, hace } from './comun';
import type { IAviso, IPanelPublicaciones } from '../../../store/interfaces/publicacion.interface';

function Aviso({ f }: { f: IAviso }) {
  const [sinFoto, setSinFoto] = useState(false);
  const dif = f.comparables?.dif;
  return (
    <article className={`pb-av ${BORDE_CARD}`} data-prop={f.propId} data-op={f.op}>
      <span className="ga-ph"><Foto url={f.foto} fallo={sinFoto} alFallar={() => setSinFoto(true)} /></span>
      <div className="pb-avt">
        <small>{f.codigo} · {f.op === 'venta' ? 'Venta' : 'Arriendo'} · {f.comuna || ''}</small>
        <b>{f.titulo}</b>
        <em>{f.precio ? monto(f.precio.valor, f.precio.moneda) : '—'}</em>
        <span className="pb-pts">
          {f.portales.map((x) => (
            <span key={x.nombre} className="pb-pt">
              {x.nombre} <Estado s={x.status} />
              {x.url && <a href="#" title="Ver aviso" onClick={(e) => { e.preventDefault(); abrirUrl(x.url!); }}><Icono nombre="link" tam={12} /></a>}
            </span>
          ))}
        </span>
      </div>
      <div className="pb-met">
        <span><b>{fmt(f.visitas)}</b><small>visitas</small></span>
        <span><b>{fmt(f.contactos)}</b><small>contactos</small></span>
        <span className={f.nuevos ? 'hot' : ''}><b>{f.interesados}</b><small>{f.nuevos ? `${f.nuevos} nuevos` : 'interesados'}</small></span>
        <Anillo n={f.calidad} />
      </div>
      <div className="pb-recs">
        {f.recomendaciones.length ? f.recomendaciones.slice(0, 2).map((r, i) => (
          <p key={i} className={`pb-rec ${r.grave ? 'bad' : ''}`}>
            <Icono nombre={r.tipo === 'precio' ? 'coins' : r.tipo === 'calidad' ? 'sparkle' : 'chart'} tam={14} />
            <span><b>{r.t}</b> {r.accion}</span>
            {r.tipo === 'precio'
              ? <Boton variante="secundario" tamano="sm" data-precio onClick={() => ajustarPrecioAviso(f.propId, f.op)}>Ajustar precio</Boton>
              : <Boton variante="secundario" tamano="sm" data-mejorar onClick={() => publicarPropiedad(f.propId, f.op, 1)}>Mejorar aviso</Boton>}
          </p>
        )) : (
          <p className="pb-rec ok">
            <Icono nombre="check" tam={14} />
            <span>Sin alertas. {dif != null ? `Precio por m² ${dif >= 0 ? dif + '% sobre' : Math.abs(dif) + '% bajo'} la mediana de tu cartera en la comuna.` : ''}</span>
          </p>
        )}
      </div>
      <div className="pb-acts">
        <Boton variante="fantasma" tamano="sm" icono="export" data-mas onClick={() => publicarPropiedad(f.propId, f.op, 2)}>Más portales</Boton>
        <Boton variante="fantasma" tamano="sm" icono="file" data-ficha onClick={() => abrirFicha(f.propId)}>Ficha</Boton>
      </div>
    </article>
  );
}

export default function Avisos({ d }: { d: IPanelPublicaciones }) {
  const t = d.totales;
  const kpis: [string, string | number, string][] = [['Avisos', t.avisos, 'export'], ['Visitas', fmt(t.visitas), 'search'], ['Contactos', fmt(t.contactos), 'phone'], ['Interesados nuevos', t.nuevos, 'users'], ['Alertas', t.alertas, 'alert']];
  return (
    <>
      <div className="ng-kpis pb-kpis">
        {kpis.map(([k, v, ic]) => <Kpi key={k} icono={ic} valor={v} texto={k} alerta={k === 'Alertas' && !!v} />)}
      </div>
      <p className="pb-sync tw:-mt-2 tw:mb-0 tw:mx-0.5 tw:text-xs tw:text-muted">
        {d.sync
          ? `Datos de los portales ${hace(d.sync)}. Portal Inmobiliario: últimos 30 días. Chilepropiedades: acumulado.`
          : 'Pulsa «Actualizar» para traer visitas, contactos e interesados desde los portales.'}
      </p>
      {d.avisos.length ? (
        <div className="pb-list">{d.avisos.map((f) => <Aviso key={`${f.propId}-${f.op}`} f={f} />)}</div>
      ) : (
        <Card relleno={false}>
          {/* .pb-empty (la busca la prueba) sin el marco punteado de styles.css: el marco lo pone la Card */}
          <EstadoVacio className="pb-empty tw:bg-transparent tw:border-0 tw:rounded-none" icono="export" titulo="Todavía no hay avisos publicados"
            texto="Elige una propiedad y pulsa «Publicar»: Asset revisa el aviso, te ayuda a mejorarlo y lo lleva a los portales."
            accion={<Boton id="pbNew2" icono="export" onClick={elegirParaPublicar}>Publicar una propiedad</Boton>} />
        </Card>
      )}
      {d.sinPublicar.length > 0 && (
        <Card titulo="Disponibles sin publicar" subtitulo={`${d.sinPublicar.length} ${d.sinPublicar.length === 1 ? 'propiedad' : 'propiedades'}: elige una para publicarla`}>
          <div className="pb-sp">
            {d.sinPublicar.slice(0, 12).map((x) => (
              <button key={x.propId} data-pub={x.propId} onClick={() => publicarPropiedad(x.propId)}>
                <Anillo n={x.calidad} /><span><b>{x.codigo}</b><small>{x.titulo}</small></span><Icono nombre="chevR" tam={14} />
              </button>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
