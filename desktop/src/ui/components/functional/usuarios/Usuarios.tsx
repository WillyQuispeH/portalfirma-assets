// Usuarios de la corredora (reemplaza a «Corredores» y a «¿Quién usa este equipo?»). Va en el modal de la app (ancho).
//  · Administrador: lista completa, agregar usuario con clave inicial, editar nombre, rol, teléfono y si está activo,
//    asignar una clave nueva, vincular cada uno con su usuario de wechatia (o traerlos y vincular por correo) y ver
//    sus conversaciones con el Agente y lo que el Agente hizo (ConversacionesUsuario, solo lectura).
//  · Corredor: ve el equipo (nombre, contacto y rol), sin editar.
// Con el kit: las partes de la ventana (VentanaCabecera, VentanaCuerpo y VentanaPie), Boton, Input, Select, Switch,
// Badge, Avatar y EstadoVacio. Cada vista (la lista, agregar, editar y la clave nueva) tiene sus tres partes; los
// formularios se envían desde el pie con <Boton form="usrForm">.
// WhatsApp: cada uno vincula su celular con su equipo (Pedro, Juanita, Diego, Fernanda) desde Configuración; aquí se ve
// quién lo tiene ([data-usr-wa]) y el administrador le puede pedir que lo vincule ([data-usr-pedir]: le llega un aviso).
// Los id (#usrPanel, #usrNuevo, #usrForm, #usrNombre…, [data-usr], [data-usr-ed], [data-usr-clave], [data-usr-conv]) los usan las pruebas.
import { useEffect, useState, type FormEvent } from 'react';
import Boton from '../../ui/Boton';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import Badge from '../../ui/Badge';
import Switch from '../../ui/Switch';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../ui/Ventana';
import Avatar from '../../ui/Avatar';
import EstadoVacio from '../../ui/EstadoVacio';
import ConversacionesUsuario from './ConversacionesUsuario';
import { useUsuario } from '../../../store/hooks/useUsuario.hook';
import { useAcceso } from '../../../store/hooks/useAcceso.hook';
import { usePerfil } from '../../../store/hooks/usePerfil.hook';
import type { IUsuario } from '../../../store/interfaces/usuario.interface';
import type { RolAsset } from '../../../store/interfaces/acceso.interface';
import { cerrarModal } from '../../../utils/modal';
import { toast } from '../../../utils/app';
import { api } from '../../../utils/api';
import { fechaHora } from '../../../utils/formato';

const ROLES: [RolAsset, string][] = [['CORREDOR', 'Corredor'], ['ADMIN', 'Administrador']];
// nota en gris y error de los formularios
const NOTA = 'tw:m-0 tw:text-[12.5px] tw:text-muted tw:leading-relaxed';
const ERROR = 'tw:m-0 tw:text-[13px] tw:font-semibold tw:text-red-softink';

type TModo = { tipo: 'nuevo' } | { tipo: 'editar'; u: IUsuario } | { tipo: 'clave'; u: IUsuario } | null;

export default function Usuarios() {
  const { usuario: cuenta } = useAcceso();
  // el rol sale del proceso principal (accEstado: el usuario de la sesión de Asset), no del estado de la pantalla
  const { perfil, perfilGet } = usePerfil();
  const admin = !!perfil?.esAdmin; const yo = { id: perfil?.usuarioId || '' };
  const { lista, cargando, error, usuarioGetAll } = useUsuario();
  const [modo, setModo] = useState<TModo>(null);
  const [verAgente, setVerAgente] = useState<IUsuario | null>(null);
  const [listoPerfil, setListoPerfil] = useState(false);
  // el celular vinculado de cada usuario (por id)
  const [wa, setWa] = useState<Record<string, string>>({});
  const cargarWa = () => api<{ items: { usuarioId: string; telefono: string }[] }>('waEquipo')
    .then((r) => setWa(Object.fromEntries(r.items.map((x) => [x.usuarioId, x.telefono])))).catch(() => setWa({}));
  useEffect(() => { cargarWa(); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- al abrir
  const pedirVinculo = async (u: IUsuario) => {
    try { await api('waPedirVinculo', u.id); toast(`Le dejamos un aviso a ${u.nombre} con los pasos para vincular su celular.`); }
    catch (e) { toast((e as Error).message, 5000); }
  };
  useEffect(() => { perfilGet().then(() => setListoPerfil(true)); }, [perfilGet]);
  useEffect(() => { if (listoPerfil) usuarioGetAll(admin); }, [usuarioGetAll, admin, listoPerfil, yo.id]);

  const listo = () => { setModo(null); perfilGet(); };
  const titulo = `${admin ? 'Usuarios' : 'Equipo'} de ${cuenta?.corredora?.nombre || 'la corredora'}`;
  if (!listoPerfil) return <>
    <VentanaCabecera icono="users" titulo={cuenta?.corredora?.nombre || 'Usuarios'} />
    <VentanaCuerpo><div id="usrPanel" className="usr"><EstadoVacio compacto texto="Cargando…" /></div></VentanaCuerpo>
    <VentanaPie><Boton id="mCancel" variante="secundario" onClick={() => cerrarModal()}>Cerrar</Boton></VentanaPie>
  </>;

  // agregar, editar o asignar clave: cada formulario es una vista de la ventana; al terminar o cancelar vuelve a la lista
  if (admin && modo?.tipo === 'nuevo') return <FormNuevo onListo={() => { listo(); toast('Usuario agregado. Ya puede entrar con su correo y la clave inicial.'); }} onCancelar={() => setModo(null)} />;
  if (admin && modo?.tipo === 'editar') return <FormEditar key={modo.u.id} u={modo.u} yo={yo.id} onListo={() => { listo(); toast('Usuario guardado.'); }} onCancelar={() => setModo(null)} />;
  if (admin && modo?.tipo === 'clave') return <FormClave key={modo.u.id} u={modo.u} onListo={() => { setModo(null); toast(`Clave nueva asignada a ${modo.u.nombre}. Sus sesiones abiertas se cerraron.`); }} onCancelar={() => setModo(null)} />;

  return <>
    <VentanaCabecera icono="users" titulo={titulo}
      descripcion="Cada persona entra con su correo y su clave. El administrador ve y hace todo; el corredor ve toda la cartera, pero los datos del propietario solo en las propiedades que captó, y solo sus leads y negocios." />
    <VentanaCuerpo>
      <div id="usrPanel" className="usr tw:flex tw:flex-col tw:gap-4 tw:min-w-0">
        {error && <p role="alert" className="tw:m-0 tw:text-red-softink tw:text-sm" id="usrErrLista">{error}</p>}
        <ul className="tw:list-none tw:m-0 tw:p-0 tw:flex tw:flex-col tw:gap-2" id="usrLista">
          {lista.map((u) => <Fila key={u.id} u={u} yo={yo.id} admin={admin} onEditar={() => setModo({ tipo: 'editar', u })} onClave={() => setModo({ tipo: 'clave', u })} onAgente={() => setVerAgente(u)} wa={wa[u.id] || ''} onPedir={() => pedirVinculo(u)} />)}
          {!lista.length && !cargando && <li><EstadoVacio icono="users" texto="Aún no hay usuarios." /></li>}
          {cargando && !lista.length && <li><EstadoVacio compacto texto="Cargando…" /></li>}
        </ul>

        {admin && verAgente && <ConversacionesUsuario u={verAgente} onCerrar={() => setVerAgente(null)} />}

        {!admin && <p className={NOTA}>Agregar o editar usuarios lo hace el administrador.</p>}
      </div>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={() => cerrarModal()}>Cerrar</Boton>
      {admin && <Boton id="usrNuevo" icono="plus" onClick={() => setModo({ tipo: 'nuevo' })}>Agregar usuario</Boton>}
    </VentanaPie>
  </>;
}

function Fila({ u, yo, admin, onEditar, onClave, onAgente, wa, onPedir }: { u: IUsuario; yo: string; admin: boolean; onEditar: () => void; onClave: () => void; onAgente: () => void; wa: string; onPedir: () => void }) {
  return (
    <li data-usr={u.id} className={`tw:flex tw:items-center tw:gap-3 tw:p-3 tw:rounded-xl tw:border tw:border-solid tw:border-edge tw:border-b-2 tw:border-b-edge-b tw:bg-card ${u.activo ? '' : 'tw:opacity-60'}`}>
      <Avatar nombre={u.nombre} />
      <div className="tw:min-w-0 tw:flex-1">
        <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
          <b className="tw:text-sm">{u.nombre}</b>{u.id === yo && <span className="tw:text-xs tw:text-muted">(tú)</span>}
          <Badge tono={u.rol === 'ADMIN' ? 'lavanda' : 'azul'}>{u.rol === 'ADMIN' ? 'Administrador' : 'Corredor'}</Badge>
          {!u.activo && <Badge tono="rojo" punto>Inactivo</Badge>}
          <span data-usr-wa={u.id}>
            {wa ? <Badge tono="verde" icono="whatsapp" ajustar>WhatsApp · {wa}</Badge> : <Badge tono="gris" icono="whatsapp" ajustar>Sin WhatsApp</Badge>}
          </span>
        </div>
        <small className="tw:block tw:text-xs tw:text-muted tw:truncate">
          {[u.email, u.telefono].filter(Boolean).join(' · ')}
          {admin && <> · {u.wechatiaId ? `wechatia: ${u.wechatiaNombre || u.wechatiaId}` : <i>sin vincular a wechatia</i>}</>}
          {admin && u.ultimoIngreso ? ` · último ingreso ${fechaHora(u.ultimoIngreso)}` : ''}
        </small>
      </div>
      {admin && <div className="tw:flex tw:gap-1 tw:flex-none">
        {!wa && u.activo && u.id !== yo && <Boton variante="secundario" tamano="sm" icono="whatsapp" data-usr-pedir={u.id} title="Le llega un aviso con los pasos para vincular su celular con su equipo" onClick={onPedir}>Pedir que vincule</Boton>}
        <Boton variante="fantasma" tamano="sm" data-usr-ed={u.id} onClick={onEditar}>Editar</Boton>
        <Boton variante="fantasma" tamano="sm" data-usr-clave={u.id} onClick={onClave}>Clave</Boton>
        <Boton variante="fantasma" tamano="sm" data-usr-conv={u.id} onClick={onAgente}>Conversaciones</Boton>
      </div>}
    </li>
  );
}

const CAJA_FORM = 'tw:flex tw:flex-col tw:gap-3';
const GRILLA = 'tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3';

// el pie de los formularios: Cancelar (#mCancel: la X y Esc también vuelven a la lista) y enviar el formulario #usrForm
function Acciones({ enviando, texto, onCancelar }: { enviando: boolean; texto: string; onCancelar: () => void }) {
  return (
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={onCancelar}>Cancelar</Boton>
      <Boton type="submit" form="usrForm" id="usrGuardar" cargando={enviando}>{texto}</Boton>
    </VentanaPie>
  );
}

function FormNuevo({ onListo, onCancelar }: { onListo: () => void; onCancelar: () => void }) {
  const { usuarioCrear } = useUsuario();
  const [d, setD] = useState({ nombre: '', email: '', telefono: '', rol: 'CORREDOR' as RolAsset, clave: '' });
  const [err, setErr] = useState(''); const [enviando, setEnviando] = useState(false);
  const enviar = async (e: FormEvent) => {
    e.preventDefault(); setEnviando(true); setErr('');
    const r = await usuarioCrear(d); setEnviando(false);
    if (r) setErr(r); else onListo();
  };
  return <>
    <VentanaCabecera icono="user" titulo="Nuevo usuario" descripcion="Entra con su correo y la clave inicial que le asignes." />
    <VentanaCuerpo>
    <form id="usrForm" className={CAJA_FORM} onSubmit={enviar}>
      <div className={GRILLA}>
        <Input id="usrNombre" etiqueta="Nombre" value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} autoFocus />
        <Input id="usrEmail" etiqueta="Correo (para entrar)" type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} />
        <Input id="usrTel" etiqueta="Teléfono" placeholder="+56 9 …" value={d.telefono} onChange={(e) => setD({ ...d, telefono: e.target.value })} ayuda="Para avisarle los leads por WhatsApp" />
        <Select id="usrRol" etiqueta="Rol" opciones={ROLES} value={d.rol} onChange={(e) => setD({ ...d, rol: e.target.value as RolAsset })} />
        <Input id="usrClave" etiqueta="Clave inicial" type="password" autoComplete="new-password" value={d.clave} onChange={(e) => setD({ ...d, clave: e.target.value })} ayuda="Al menos 8 caracteres. Dásela a la persona; puede cambiarla después." />
      </div>
      {err && <p role="alert" className={ERROR} id="usrErr">{err}</p>}
    </form>
    </VentanaCuerpo>
    <Acciones enviando={enviando} texto="Agregar" onCancelar={onCancelar} />
  </>;
}

function FormEditar({ u, yo, onListo, onCancelar }: { u: IUsuario; yo: string; onListo: () => void; onCancelar: () => void }) {
  const { usuarioEditar } = useUsuario();
  const [d, setD] = useState({ nombre: u.nombre, telefono: u.telefono || '', rol: u.rol, activo: u.activo, wechatiaId: u.wechatiaId || '' });
  const [err, setErr] = useState(''); const [enviando, setEnviando] = useState(false);
  const soyYo = u.id === yo;
  const enviar = async (e: FormEvent) => {
    e.preventDefault(); setEnviando(true); setErr('');
    const r = await usuarioEditar(u.id, { nombre: d.nombre, telefono: d.telefono, ...(soyYo ? {} : { rol: d.rol, activo: d.activo }),
      ...(d.wechatiaId !== (u.wechatiaId || '') ? { wechatiaId: d.wechatiaId || null, wechatiaNombre: null } : {}) });
    setEnviando(false);
    if (r) setErr(r); else onListo();
  };
  return <>
    <VentanaCabecera icono="edit" titulo={`Editar a ${u.nombre}`} descripcion={u.email} />
    <VentanaCuerpo>
    <form id="usrForm" className={CAJA_FORM} onSubmit={enviar}>
      <div className={GRILLA}>
        <Input id="usrNombre" etiqueta="Nombre" value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} />
        <Input id="usrTel" etiqueta="Teléfono" placeholder="+56 9 …" value={d.telefono} onChange={(e) => setD({ ...d, telefono: e.target.value })} />
        <Select id="usrRol" etiqueta="Rol" opciones={ROLES} value={d.rol} disabled={soyYo} onChange={(e) => setD({ ...d, rol: e.target.value as RolAsset })}
          ayuda={soyYo ? 'No puedes quitarte el rol de administrador.' : undefined} />
        <Input id="usrWc" etiqueta="Usuario en wechatia (ID)" placeholder="Opcional" value={d.wechatiaId} onChange={(e) => setD({ ...d, wechatiaId: e.target.value })} />
      </div>
      <Switch id="usrActivo" activo={d.activo} deshabilitado={soyYo} alCambiar={(v) => setD({ ...d, activo: v })} etiqueta="Activo"
        descripcion={soyYo ? 'No puedes desactivarte.' : 'Desactivado no puede entrar y se cierran sus sesiones abiertas.'} />
      {err && <p role="alert" className={ERROR} id="usrErr">{err}</p>}
    </form>
    </VentanaCuerpo>
    <Acciones enviando={enviando} texto="Guardar" onCancelar={onCancelar} />
  </>;
}

function FormClave({ u, onListo, onCancelar }: { u: IUsuario; onListo: () => void; onCancelar: () => void }) {
  const { usuarioClave } = useUsuario();
  const [clave, setClave] = useState(''); const [err, setErr] = useState(''); const [enviando, setEnviando] = useState(false);
  const enviar = async (e: FormEvent) => {
    e.preventDefault(); setEnviando(true); setErr('');
    const r = await usuarioClave(u.id, clave); setEnviando(false);
    if (r) setErr(r); else onListo();
  };
  return <>
    <VentanaCabecera icono="key" titulo={`Clave nueva para ${u.nombre}`} descripcion={u.email} />
    <VentanaCuerpo>
    <form id="usrForm" className={CAJA_FORM} onSubmit={enviar}>
      <Input id="usrClaveNueva" etiqueta="Clave nueva" type="password" autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} autoFocus
        ayuda="Al menos 8 caracteres. Se cierran sus sesiones abiertas: entra de nuevo con esta clave." />
      {err && <p role="alert" className={ERROR} id="usrErr">{err}</p>}
    </form>
    </VentanaCuerpo>
    <Acciones enviando={enviando} texto="Asignar clave" onCancelar={onCancelar} />
  </>;
}
