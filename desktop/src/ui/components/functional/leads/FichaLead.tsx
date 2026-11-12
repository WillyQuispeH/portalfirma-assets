// Ficha del lead (columna derecha de Leads, plegable). Se guarda sola al cambiar un campo (sin botón «Guardar»):
// los selects al momento y lo escrito un momento después de dejar de escribir.
// Arriba: corredor y estado. Luego: resumen de la IA, próxima acción, qué busca y contacto; propiedades, links e
// historial van plegados. Las acciones poco usadas, en «⋯».
// Las pruebas usan #ldFicha [data-k=…] (estado, motivo, b_*, nombre, telefono, email, rut, notas), #ldCor, #ldDerivar,
// #ldPersona, .ld-res y .ld-hist.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { leadService } from '../../../store/services/lead.service';
import { abrirFicha, abrirPersona, abrirUrl, toast } from '../../../utils/app';
import { cx } from '../../../utils/cx';
import Boton from '../../ui/Boton';
import Icono from '../../ui/Icono';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import Textarea from '../../ui/Textarea';
import MenuMas from '../../ui/MenuMas';
import { fechaCorta, busquedaTxt, nombreDe } from './formato';
import type { ILeadCambios, ILeadDetalle, ILeadLista } from '../../../store/interfaces/lead.interface';

const TIPOS: [string, string][] = [['departamento', 'Departamento'], ['casa', 'Casa'], ['oficina', 'Oficina'], ['local_comercial', 'Local'], ['parcela', 'Parcela'], ['terreno_construccion', 'Terreno'], ['bodega', 'Bodega'], ['estacionamiento', 'Estacionamiento']];

interface IForm {
  estado: string; motivo: string;
  nombre: string; telefono: string; email: string; rut: string; notas: string;
  pa_texto: string; pa_fecha: string;
  b_operacion: string; b_tipo: string; b_comunas: string; b_valor: string; b_moneda: string;
  b_dormitorios: string; b_banos: string; b_plazo: string; b_estacionamiento: boolean; b_mascotas: boolean;
}

function formDe(l: ILeadDetalle): IForm {
  const b = l.busqueda || {};
  const s = (v: unknown) => (v == null ? '' : String(v));
  return {
    estado: l.estado, motivo: s(l.motivoPerdida),
    nombre: s(l.nombre), telefono: s(l.telefono), email: s(l.email), rut: s(l.rut), notas: s(l.notas),
    pa_texto: s(l.proximaAccion?.texto), pa_fecha: s(l.proximaAccion?.fecha),
    b_operacion: s(b.operacion), b_tipo: s(b.tipo), b_comunas: (b.comunas || []).join(', '), b_valor: s(b.presupuesto?.valor), b_moneda: b.presupuesto?.moneda === 'UF' ? 'UF' : 'CLP',
    b_dormitorios: s(b.dormitorios), b_banos: s(b.banos), b_plazo: s(b.plazo), b_estacionamiento: !!b.estacionamiento, b_mascotas: !!b.mascotas,
  };
}

function cambiosDe(f: IForm, l: ILeadDetalle): ILeadCambios {
  const n = (v: string) => (v === '' ? null : Number(v));
  return {
    estado: f.estado, motivo: f.motivo, nombre: f.nombre, telefono: f.telefono, email: f.email, rut: f.rut, notas: f.notas,
    proximaAccion: { texto: f.pa_texto.trim(), fecha: f.pa_fecha || null },
    busqueda: {
      ...(l.busqueda || {}),
      operacion: f.b_operacion || undefined, tipo: f.b_tipo || undefined,
      comunas: f.b_comunas.split(',').map((x) => x.trim()).filter(Boolean),
      presupuesto: f.b_valor ? { valor: Number(f.b_valor), moneda: f.b_moneda } as never : null,
      dormitorios: n(f.b_dormitorios), banos: n(f.b_banos), plazo: f.b_plazo.trim() || null,
      estacionamiento: f.b_estacionamiento || null, mascotas: f.b_mascotas || null,
    },
  };
}

/** una sección plegable (su contenido sigue en el DOM, oculto, para el texto de las pruebas) */
function Seccion({ titulo, abierta: inicial = true, cuenta, children, className }: { titulo: string; abierta?: boolean; cuenta?: number; children: ReactNode; className?: string }) {
  const [abierta, setAbierta] = useState(inicial);
  return (
    <section className={cx('tw:border-0 tw:border-t tw:border-dashed tw:border-edge tw:pt-2.5', className)}>
      <button type="button" aria-expanded={abierta} onClick={() => setAbierta(!abierta)}
        className="tw:flex tw:w-full tw:items-center tw:gap-1.5 tw:m-0 tw:p-0 tw:bg-transparent tw:border-0 tw:cursor-pointer tw:text-[11.5px] tw:font-bold tw:uppercase tw:tracking-wide tw:text-muted tw:hover:text-text">
        <Icono nombre={abierta ? 'chevD' : 'chevR'} tam={13} />{titulo}{cuenta != null && <span className="tw:font-semibold tw:normal-case">({cuenta})</span>}
      </button>
      <div hidden={!abierta} className="tw:mt-2.5">{children}</div>
    </section>
  );
}

interface IFichaLeadProps {
  l: ILeadDetalle;
  datos: ILeadLista;
  alCambiar: () => void;
  alPlegar: () => void;
}

export default function FichaLead({ l, datos, alCambiar, alPlegar }: IFichaLeadProps) {
  const [f, setF] = useState<IForm>(() => formDe(l));
  const [estadoGuardado, setEstadoGuardado] = useState<'' | 'guardando' | 'guardado' | 'error'>('');
  const [error, setError] = useState('');
  const [leyendo, setLeyendo] = useState(false);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimo = useRef<IForm>(f);

  // otro lead: su ficha (lo que se esté escribiendo del anterior se guarda antes)
  useEffect(() => { setF(formDe(l)); ultimo.current = formDe(l); setError(''); setEstadoGuardado(''); }, [l.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // lo que la IA o el servidor cambió (reanalizar, wechatia…) llega si no hay nada a medio guardar
  useEffect(() => { if (!espera.current) { const x = formDe(l); setF(x); ultimo.current = x; } }, [l]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (espera.current) { clearTimeout(espera.current); void guardar(ultimo.current); } }, [l.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const guardar = async (x: IForm) => {
    espera.current = null;
    setEstadoGuardado('guardando');
    try { await leadService.actualizar(l.id, cambiosDe(x, l)); setEstadoGuardado('guardado'); setError(''); alCambiar(); }
    catch (e) { setEstadoGuardado('error'); setError((e as Error).message); }
  };
  /** cambia un campo; `ya` = guardar al momento (selects, casillas), si no, al dejar de escribir */
  const poner = <K extends keyof IForm>(k: K, v: IForm[K], ya = false) => {
    const x = { ...f, [k]: v }; setF(x); ultimo.current = x;
    if (espera.current) clearTimeout(espera.current);
    if (ya) void guardar(x);
    else espera.current = setTimeout(() => void guardar(ultimo.current), 900);
  };
  const txt = (k: keyof IForm) => ({ 'data-k': k, value: f[k] as string, onChange: (e: { target: { value: string } }) => poner(k, e.target.value as never) });

  const perfil = (window as unknown as { PERFIL?: { esAdmin?: boolean } }).PERFIL;
  const esAdmin = !perfil || !!perfil.esAdmin;

  const asignar = async (corredorId: string) => {
    try { await leadService.asignar(l.id, corredorId || null); toast(corredorId ? 'Lead asignado. Queda en su historial.' : 'El lead quedó sin corredor.'); alCambiar(); }
    catch (e) { toast((e as Error).message, 5000); }
  };
  const reanalizar = async () => {
    setLeyendo(true);
    try { await leadService.reanalizar(l.id); toast('Conversación analizada de nuevo.'); alCambiar(); }
    catch (e) { toast((e as Error).message, 6000); }
    finally { setLeyendo(false); }
  };
  const pasarACliente = () => {
    const c = cambiosDe(f, l);
    window.Inmo.formPersona(null, {
      rol: 'interesado',
      pre: { nombre: f.nombre || l.chatCon, telefono: f.telefono, email: f.email, rut: f.rut, notas: [l.resumen, busquedaTxt(c.busqueda) && 'Busca: ' + busquedaTxt(c.busqueda)].filter(Boolean).join('\n') },
      despues: async (p) => { await leadService.actualizar(l.id, { personaId: p.id } as ILeadCambios); toast('Quedó como cliente en Personas.'); alCambiar(); },
    });
  };

  const venc = !!l.vencida;
  const indicador = estadoGuardado === 'guardando' ? 'Guardando…' : estadoGuardado === 'guardado' ? 'Guardado' : estadoGuardado === 'error' ? 'No se guardó' : '';
  return (
    <div className="ld-ficha tw:rounded-2xl tw:border-edge tw:border-b-[3px] tw:border-b-edge-b" id="ldFicha">
      <div className="tw:sticky tw:top-0 tw:z-[1] tw:flex tw:items-center tw:gap-2 tw:px-4 tw:py-2.5 tw:border-0 tw:border-b tw:border-solid tw:border-edge tw:bg-card">
        <b className="tw:flex-1 tw:text-[13.5px]">Ficha</b>
        {indicador && <small className={cx('tw:text-[11.5px]', estadoGuardado === 'error' ? 'tw:text-red-softink' : 'tw:text-muted')}>{estadoGuardado === 'guardado' && <Icono nombre="check" tam={11} />} {indicador}</small>}
        <MenuMas id="ldMas" tamano="sm" opciones={[
          { id: 'ldIA', icono: 'sparkle', texto: leyendo ? 'Leyendo la conversación…' : 'Reanalizar con IA', disabled: leyendo, alTocar: () => void reanalizar() },
          l.personaId
            ? { id: 'ldPersona2', icono: 'user', texto: 'Ver persona', alTocar: () => abrirPersona(l.personaId!) }
            : { id: 'ldCliente', icono: 'user', texto: 'Pasar a cliente', alTocar: pasarACliente },
          { id: 'ldAct', icono: 'upload', texto: 'Agregar mensajes (chat exportado)', alTocar: () => window.Leads.agregarMensajes(!!l.ig) },
          { id: 'ldBorrar', icono: 'trash', texto: 'Eliminar lead', alTocar: () => window.Leads.eliminar(l.id, nombreDe(l), l.mensajes ?? l.mensajesLista.length) },
        ]} />
        <Boton variante="fantasma" tamano="sm" icono="x" aria-label="Ocultar la ficha" title="Ocultar la ficha" onClick={alPlegar} />
      </div>

      <div className="tw:flex tw:flex-col tw:gap-3 tw:px-4 tw:pt-3 tw:pb-5">
        {/* a cargo de quién y en qué va */}
        <div className="tw:flex tw:items-end tw:gap-2">
          <Select id="ldCor" etiqueta="Corredor" clasesCampo="tw:flex-1 tw:min-w-0" value={l.corredorId || ''} disabled={!esAdmin}
            title={esAdmin ? undefined : 'Reasignar leads lo hace el administrador'} onChange={(e) => void asignar(e.target.value)}>
            <option value="">Sin corredor</option>
            {datos.corredores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </Select>
          <Boton variante="secundario" icono="whatsapp" id="ldDerivar" disabled={!l.corredorId} title={l.corredorId ? 'Avisarle al corredor por WhatsApp' : 'Primero asigna un corredor'}
            aria-label="Avisar al corredor" onClick={() => window.Leads.derivar(l.id)} />
        </div>
        <Select etiqueta="Estado" data-k="estado" value={f.estado} onChange={(e) => poner('estado', e.target.value, true)}
          opciones={datos.estados} />
        {f.estado === 'perdido' && <Input etiqueta="Motivo" placeholder="Encontró otra, ya no busca…" {...txt('motivo')} />}

        {l.resumen && <p className="ld-res tw:m-0 tw:rounded-xl tw:bg-lav-soft tw:px-3 tw:py-2.5 tw:text-[13px] tw:leading-relaxed"><Icono nombre="sparkle" tam={13} /> {l.resumen}</p>}
        {l.perfil && <p className="tw:m-0 tw:text-[13px] tw:leading-relaxed"><b className="tw:block tw:text-[11.5px] tw:uppercase tw:tracking-wide tw:text-muted">Perfil</b>{l.perfil}</p>}

        <div className={cx('tw:flex tw:flex-col tw:gap-2 tw:rounded-xl tw:p-2.5', venc ? 'tw:bg-red-soft' : 'tw:bg-yellow-soft')}>
          <span className={cx('tw:flex tw:items-center tw:gap-1.5 tw:text-[12.5px] tw:font-bold', venc ? 'tw:text-red-softink' : 'tw:text-yellow-softink')}><Icono nombre="clock" tam={13} /> Próxima acción{venc && ' (vencida)'}</span>
          <div className="tw:grid tw:grid-cols-[1fr_132px] tw:gap-1.5">
            <Input aria-label="Próxima acción" placeholder="Ej.: enviarle 3 opciones" {...txt('pa_texto')} />
            <Input aria-label="Fecha" type="date" {...txt('pa_fecha')} />
          </div>
        </div>

        <Seccion titulo="Qué busca">
          <div className="tw:grid tw:grid-cols-2 tw:gap-x-2 tw:gap-y-2.5">
            <Select etiqueta="Operación" data-k="b_operacion" value={f.b_operacion} onChange={(e) => poner('b_operacion', e.target.value, true)} vacia="—" opciones={[['arriendo', 'Arriendo'], ['venta', 'Compra']]} />
            <Select etiqueta="Tipo" data-k="b_tipo" value={f.b_tipo} onChange={(e) => poner('b_tipo', e.target.value, true)} vacia="—" opciones={TIPOS} />
            <Input etiqueta="Comunas" placeholder="Ñuñoa, Providencia" clasesCampo="tw:col-span-2" {...txt('b_comunas')} />
            <div className="tw:col-span-2 tw:grid tw:grid-cols-[1fr_76px] tw:items-end tw:gap-1.5">
              <Input etiqueta="Presupuesto" type="number" min={0} {...txt('b_valor')} />
              <Select aria-label="Moneda" data-k="b_moneda" value={f.b_moneda} onChange={(e) => poner('b_moneda', e.target.value, true)} opciones={[['CLP', '$'], ['UF', 'UF']]} />
            </div>
            <Input etiqueta="Dormitorios" type="number" {...txt('b_dormitorios')} />
            <Input etiqueta="Baños" type="number" {...txt('b_banos')} />
            <Input etiqueta="Para cuándo" placeholder="Ej.: noviembre" clasesCampo="tw:col-span-2" {...txt('b_plazo')} />
            <div className="tw:col-span-2 tw:flex tw:gap-4 tw:text-[13px]">
              {(['b_estacionamiento', 'b_mascotas'] as const).map((k) => (
                <label key={k} className="tw:flex tw:items-center tw:gap-1.5 tw:cursor-pointer">
                  <input type="checkbox" data-k={k} checked={f[k]} onChange={(e) => poner(k, e.target.checked, true)} className="tw:size-4 tw:accent-[var(--ui-lav-edge)]" />
                  {k === 'b_estacionamiento' ? 'Estacionamiento' : 'Mascotas'}
                </label>
              ))}
            </div>
            {!!l.busqueda?.otros?.length && <p className="tw:col-span-2 tw:m-0 tw:text-[12px] tw:text-muted">También: {l.busqueda.otros.join(' · ')}</p>}
          </div>
        </Seccion>

        <Seccion titulo="Contacto">
          <div className="tw:grid tw:grid-cols-2 tw:gap-x-2 tw:gap-y-2.5">
            <Input etiqueta="Nombre" {...txt('nombre')} />
            <Input etiqueta="Teléfono" type="tel" placeholder="+56 9 …" {...txt('telefono')} />
            <Input etiqueta="Correo" type="email" {...txt('email')} />
            <Input etiqueta="RUT" {...txt('rut')} />
          </div>
          {l.ig && <p className="tw:mt-2 tw:mb-0 tw:flex tw:items-center tw:gap-1.5 tw:text-[12px] tw:text-muted"><Icono nombre="instagram" tam={12} /> Instagram{l.ig.usuario ? ' · @' + l.ig.usuario : ''}{l.ig.cuenta ? ' · cuenta ' + l.ig.cuenta : ''}</p>}
          {l.personaId && <Boton variante="fantasma" tamano="sm" icono="user" id="ldPersona" className="tw:mt-2" onClick={() => abrirPersona(l.personaId!)}>Ver persona</Boton>}
        </Seccion>

        <Textarea etiqueta="Notas" rows={2} {...txt('notas')} />

        {!!l.propiedadesInfo?.length && (
          <Seccion titulo="Propiedades de la conversación" abierta={false} cuenta={l.propiedadesInfo.length}>
            <div className="tw:flex tw:flex-col tw:gap-1.5">
              {l.propiedadesInfo.map((p) => (
                <button key={p.id} type="button" data-prop={p.id} onClick={() => abrirFicha(p.id)}
                  className="tw:grid tw:grid-cols-[44px_1fr] tw:items-center tw:gap-x-2.5 tw:m-0 tw:p-1.5 tw:rounded-lg tw:border tw:border-solid tw:border-edge tw:bg-card tw:text-left tw:cursor-pointer tw:hover:bg-hover">
                  {p.foto ? <img src={p.foto} alt="" className="tw:row-span-2 tw:h-9 tw:w-11 tw:rounded-md tw:object-cover" /> : <span className="tw:row-span-2 tw:grid tw:h-9 tw:w-11 tw:place-items-center tw:rounded-md tw:bg-sunken"><Icono nombre="house" tam={16} /></span>}
                  <b className="tw:text-[12.5px]">{p.codigo}</b><small className="tw:truncate tw:text-[11.5px] tw:text-muted">{p.titulo}</small>
                </button>
              ))}
            </div>
          </Seccion>
        )}
        {!!l.links?.length && (
          <Seccion titulo="Links compartidos" abierta={false} cuenta={l.links.length}>
            <div className="tw:flex tw:flex-col tw:gap-1 tw:text-[12.5px]">
              {l.links.slice(0, 8).map((u) => <a key={u} href="#" onClick={(e) => { e.preventDefault(); abrirUrl(u); }} className="tw:truncate tw:text-blue-softink">{u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 48)}</a>)}
            </div>
          </Seccion>
        )}
        {!!l.historial?.length && (
          <Seccion titulo="Historial" abierta={false} cuenta={l.historial.length}>
            <ul className="ld-hist tw:m-0 tw:grid tw:list-none tw:gap-2 tw:p-0 tw:text-[12.5px]">
              {[...l.historial].reverse().slice(0, 30).map((h, i) => (
                <li key={i} className={cx(h.tipo, 'tw:flex tw:justify-between tw:gap-2 tw:leading-snug')}>
                  <span>{h.texto}</span>
                  <small className="tw:whitespace-nowrap tw:text-muted">{fechaCorta(h.fecha)} {new Date(h.fecha).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</small>
                </li>
              ))}
            </ul>
          </Seccion>
        )}
        {error && <p role="alert" id="ldErr" className="tw:m-0 tw:text-[12.5px] tw:text-red-softink">{error}</p>}
      </div>
    </div>
  );
}
