// Usuarios de la corredora (reemplaza a «Corredores» y a «¿Quién usa este equipo?»). Va en el modal de la app (ancho).
//  · Administrador: lista completa, agregar usuario con clave inicial, editar nombre, rol, teléfono y si está activo,
//    asignar una clave nueva y vincular cada uno con su usuario de wechatia (o traerlos y vincular por correo).
//  · Corredor: ve el equipo (nombre, contacto y rol), sin editar.
// Los id (#usrPanel, #usrNuevo, #usrForm, #usrNombre…, [data-usr], [data-usr-ed], [data-usr-clave]) los usan las pruebas.
import { useEffect, useState, type FormEvent } from 'react';
import Boton from '../../ui/Boton';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import Badge from '../../ui/Badge';
import Switch from '../../ui/Switch';
import Icono from '../../ui/Icono';
import { useUsuario } from '../../../store/hooks/useUsuario.hook';
import { useAcceso } from '../../../store/hooks/useAcceso.hook';
import { usePerfil } from '../../../store/hooks/usePerfil.hook';
import type { IUsuario } from '../../../store/interfaces/usuario.interface';
import type { RolAsset } from '../../../store/interfaces/acceso.interface';
import { cerrarModal } from '../../../utils/modal';
import { toast } from '../../../utils/app';
import { fechaHora } from '../../../utils/formato';

const ROLES: [RolAsset, string][] = [['CORREDOR', 'Corredor'], ['ADMIN', 'Administrador']];
const iniciales = (n: string) => String(n || '').trim().split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase() || '?';

type TModo = { tipo: 'nuevo' } | { tipo: 'editar'; u: IUsuario } | { tipo: 'clave'; u: IUsuario } | null;

export default function Usuarios() {
  const { usuario: cuenta } = useAcceso();
  // el rol sale del proceso principal (accEstado: el usuario de la sesión de Asset), no del estado de la pantalla
  const { perfil, perfilGet } = usePerfil();
  const admin = !!perfil?.esAdmin; const yo = { id: perfil?.usuarioId || '' };
  const { lista, cargando, error, wechatia, usuarioGetAll, usuarioWechatia } = useUsuario();
  const [modo, setModo] = useState<TModo>(null);
  const [trayendo, setTrayendo] = useState(false);
  const [listoPerfil, setListoPerfil] = useState(false);
  useEffect(() => { perfilGet().then(() => setListoPerfil(true)); }, [perfilGet]);
  useEffect(() => { if (listoPerfil) usuarioGetAll(admin); }, [usuarioGetAll, admin, listoPerfil, yo.id]);

  const listo = () => { setModo(null); perfilGet(); };
  if (!listoPerfil) return <div id="usrPanel" className="usr tw:text-sm tw:text-muted"><span className="spinner sm" /> Cargando…</div>;
  const traerWechatia = async () => {
    setTrayendo(true); await usuarioWechatia(); setTrayendo(false);
  };

  return (
    <div id="usrPanel" className="usr tw:flex tw:flex-col tw:gap-4 tw:min-w-0">
      <div className="tw:flex tw:items-start tw:gap-3">
        <span className="tw:flex tw:items-center tw:justify-center tw:w-10 tw:h-10 tw:rounded-xl tw:bg-lav tw:text-lav-ink tw:flex-none"><Icono nombre="users" tam={20} /></span>
        <div className="tw:min-w-0">
          <h2 className="tw:m-0 tw:text-lg tw:font-bold">{admin ? 'Usuarios' : 'Equipo'} de {cuenta?.corredora?.nombre || 'la corredora'}</h2>
          <p className="tw:m-0 tw:mt-1 tw:text-[13px] tw:text-muted">
            Cada persona entra con su correo y su clave. El administrador ve y hace todo; el corredor ve toda la cartera, pero los datos del propietario solo en las propiedades que captó, y solo sus leads y negocios.
          </p>
        </div>
      </div>

      {error && <p className="tw:m-0 tw:text-err tw:text-sm" id="usrErrLista">{error}</p>}
      <ul className="tw:list-none tw:m-0 tw:p-0 tw:flex tw:flex-col tw:gap-2" id="usrLista">
        {lista.map((u) => <Fila key={u.id} u={u} yo={yo.id} admin={admin} onEditar={() => setModo({ tipo: 'editar', u })} onClave={() => setModo({ tipo: 'clave', u })} />)}
        {!lista.length && !cargando && <li className="tw:text-sm tw:text-muted">Aún no hay usuarios.</li>}
        {cargando && !lista.length && <li className="tw:text-sm tw:text-muted"><span className="spinner sm" /> Cargando…</li>}
      </ul>

      {admin && modo?.tipo === 'nuevo' && <FormNuevo onListo={() => { listo(); toast('Usuario agregado. Ya puede entrar con su correo y la clave inicial.'); }} onCancelar={() => setModo(null)} />}
      {admin && modo?.tipo === 'editar' && <FormEditar key={modo.u.id} u={modo.u} yo={yo.id} wechatia={wechatia} onListo={() => { listo(); toast('Usuario guardado.'); }} onCancelar={() => setModo(null)} />}
      {admin && modo?.tipo === 'clave' && <FormClave key={modo.u.id} u={modo.u} onListo={() => { setModo(null); toast(`Clave nueva asignada a ${modo.u.nombre}. Sus sesiones abiertas se cerraron.`); }} onCancelar={() => setModo(null)} />}

      {admin && wechatia && (
        <p className="tw:m-0 tw:text-[13px] tw:text-muted" id="usrWcInfo">
          {wechatia.error ? wechatia.error : `wechatia: ${wechatia.usuarios.length} usuario${wechatia.usuarios.length === 1 ? '' : 's'}${wechatia.vinculados ? ` · ${wechatia.vinculados} vinculado${wechatia.vinculados === 1 ? '' : 's'} por su correo` : ''}. Elige el de cada uno al editarlo.`}
        </p>
      )}

      <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2 tw:pt-1">
        {admin && !modo && <Boton id="usrNuevo" icono="plus" onClick={() => setModo({ tipo: 'nuevo' })}>Agregar usuario</Boton>}
        {admin && <Boton id="usrWcTraer" variante="secundario" icono="users" cargando={trayendo} onClick={traerWechatia}>Traer usuarios de wechatia</Boton>}
        {!admin && <p className="tw:m-0 tw:text-[13px] tw:text-muted">Agregar o editar usuarios lo hace el administrador.</p>}
        <span className="tw:flex-1" />
        <Boton id="mCancel" variante="fantasma" onClick={() => cerrarModal()}>Cerrar</Boton>
      </div>
    </div>
  );
}

function Fila({ u, yo, admin, onEditar, onClave }: { u: IUsuario; yo: string; admin: boolean; onEditar: () => void; onClave: () => void }) {
  return (
    <li data-usr={u.id} className={`tw:flex tw:items-center tw:gap-3 tw:p-3 tw:rounded-xl tw:border tw:border-solid tw:border-edge tw:border-b-2 tw:border-b-edge-b tw:bg-card ${u.activo ? '' : 'tw:opacity-60'}`}>
      <span className="tw:flex tw:items-center tw:justify-center tw:w-9 tw:h-9 tw:rounded-full tw:bg-sunken tw:text-[13px] tw:font-bold tw:flex-none">{iniciales(u.nombre)}</span>
      <div className="tw:min-w-0 tw:flex-1">
        <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
          <b className="tw:text-sm">{u.nombre}</b>{u.id === yo && <span className="tw:text-xs tw:text-muted">(tú)</span>}
          <Badge tono={u.rol === 'ADMIN' ? 'lavanda' : 'azul'}>{u.rol === 'ADMIN' ? 'Administrador' : 'Corredor'}</Badge>
          {!u.activo && <Badge tono="rojo" punto>Inactivo</Badge>}
        </div>
        <small className="tw:block tw:text-xs tw:text-muted tw:truncate">
          {[u.email, u.telefono].filter(Boolean).join(' · ')}
          {admin && <> · {u.wechatiaId ? `wechatia: ${u.wechatiaNombre || u.wechatiaId}` : <i>sin vincular a wechatia</i>}</>}
          {admin && u.ultimoIngreso ? ` · último ingreso ${fechaHora(u.ultimoIngreso)}` : ''}
        </small>
      </div>
      {admin && <div className="tw:flex tw:gap-1 tw:flex-none">
        <Boton variante="fantasma" tamano="sm" data-usr-ed={u.id} onClick={onEditar}>Editar</Boton>
        <Boton variante="fantasma" tamano="sm" data-usr-clave={u.id} onClick={onClave}>Clave</Boton>
      </div>}
    </li>
  );
}

const CAJA_FORM = 'tw:flex tw:flex-col tw:gap-3 tw:p-4 tw:rounded-xl tw:bg-sunken tw:border tw:border-solid tw:border-edge';
const GRILLA = 'tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3';

function Acciones({ enviando, texto, onCancelar }: { enviando: boolean; texto: string; onCancelar: () => void }) {
  return (
    <div className="tw:flex tw:gap-2 tw:justify-end">
      <Boton variante="secundario" onClick={onCancelar}>Cancelar</Boton>
      <Boton type="submit" id="usrGuardar" cargando={enviando}>{texto}</Boton>
    </div>
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
  return (
    <form id="usrForm" className={CAJA_FORM} onSubmit={enviar}>
      <b className="tw:text-sm">Nuevo usuario</b>
      <div className={GRILLA}>
        <Input id="usrNombre" etiqueta="Nombre" value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} autoFocus />
        <Input id="usrEmail" etiqueta="Correo (para entrar)" type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} />
        <Input id="usrTel" etiqueta="Teléfono" placeholder="+56 9 …" value={d.telefono} onChange={(e) => setD({ ...d, telefono: e.target.value })} ayuda="Para avisarle los leads por WhatsApp" />
        <Select id="usrRol" etiqueta="Rol" opciones={ROLES} value={d.rol} onChange={(e) => setD({ ...d, rol: e.target.value as RolAsset })} />
        <Input id="usrClave" etiqueta="Clave inicial" type="password" autoComplete="new-password" value={d.clave} onChange={(e) => setD({ ...d, clave: e.target.value })} ayuda="Al menos 8 caracteres. Dásela a la persona; puede cambiarla después." />
      </div>
      {err && <p className="tw:m-0 tw:text-err tw:text-sm" id="usrErr">{err}</p>}
      <Acciones enviando={enviando} texto="Agregar" onCancelar={onCancelar} />
    </form>
  );
}

function FormEditar({ u, yo, wechatia, onListo, onCancelar }: { u: IUsuario; yo: string; wechatia: ReturnType<typeof useUsuario>['wechatia']; onListo: () => void; onCancelar: () => void }) {
  const { usuarioEditar } = useUsuario();
  const [d, setD] = useState({ nombre: u.nombre, telefono: u.telefono || '', rol: u.rol, activo: u.activo, wechatiaId: u.wechatiaId || '' });
  const [err, setErr] = useState(''); const [enviando, setEnviando] = useState(false);
  const soyYo = u.id === yo;
  const opcionesWc = wechatia?.usuarios?.length ? wechatia.usuarios : null;
  const enviar = async (e: FormEvent) => {
    e.preventDefault(); setEnviando(true); setErr('');
    const wc = opcionesWc?.find((x) => x.id === d.wechatiaId);
    const r = await usuarioEditar(u.id, { nombre: d.nombre, telefono: d.telefono, ...(soyYo ? {} : { rol: d.rol, activo: d.activo }),
      ...(d.wechatiaId !== (u.wechatiaId || '') ? { wechatiaId: d.wechatiaId || null, wechatiaNombre: wc?.nombre || null } : {}) });
    setEnviando(false);
    if (r) setErr(r); else onListo();
  };
  return (
    <form id="usrForm" className={CAJA_FORM} onSubmit={enviar}>
      <b className="tw:text-sm">Editar a {u.nombre} <span className="tw:font-normal tw:text-muted">· {u.email}</span></b>
      <div className={GRILLA}>
        <Input id="usrNombre" etiqueta="Nombre" value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} />
        <Input id="usrTel" etiqueta="Teléfono" placeholder="+56 9 …" value={d.telefono} onChange={(e) => setD({ ...d, telefono: e.target.value })} />
        <Select id="usrRol" etiqueta="Rol" opciones={ROLES} value={d.rol} disabled={soyYo} onChange={(e) => setD({ ...d, rol: e.target.value as RolAsset })}
          ayuda={soyYo ? 'No puedes quitarte el rol de administrador.' : undefined} />
        {opcionesWc
          ? <Select id="usrWc" etiqueta="Usuario en wechatia" vacia="— sin vincular —" value={d.wechatiaId} onChange={(e) => setD({ ...d, wechatiaId: e.target.value })}
              opciones={opcionesWc.map((w) => [w.id, `${w.nombre}${w.email ? ' · ' + w.email : ''}`] as [string, string])} />
          : <Input id="usrWc" etiqueta="Usuario en wechatia (ID)" placeholder="Opcional" value={d.wechatiaId} onChange={(e) => setD({ ...d, wechatiaId: e.target.value })}
              ayuda="O usa «Traer usuarios de wechatia» para elegirlo de la lista." />}
      </div>
      <Switch id="usrActivo" activo={d.activo} deshabilitado={soyYo} alCambiar={(v) => setD({ ...d, activo: v })} etiqueta="Activo"
        descripcion={soyYo ? 'No puedes desactivarte.' : 'Desactivado no puede entrar y se cierran sus sesiones abiertas.'} />
      {err && <p className="tw:m-0 tw:text-err tw:text-sm" id="usrErr">{err}</p>}
      <Acciones enviando={enviando} texto="Guardar" onCancelar={onCancelar} />
    </form>
  );
}

function FormClave({ u, onListo, onCancelar }: { u: IUsuario; onListo: () => void; onCancelar: () => void }) {
  const { usuarioClave } = useUsuario();
  const [clave, setClave] = useState(''); const [err, setErr] = useState(''); const [enviando, setEnviando] = useState(false);
  const enviar = async (e: FormEvent) => {
    e.preventDefault(); setEnviando(true); setErr('');
    const r = await usuarioClave(u.id, clave); setEnviando(false);
    if (r) setErr(r); else onListo();
  };
  return (
    <form id="usrForm" className={CAJA_FORM} onSubmit={enviar}>
      <b className="tw:text-sm">Clave nueva para {u.nombre}</b>
      <Input id="usrClaveNueva" etiqueta="Clave nueva" type="password" autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} autoFocus
        ayuda="Al menos 8 caracteres. Se cierran sus sesiones abiertas: entra de nuevo con esta clave." />
      {err && <p className="tw:m-0 tw:text-err tw:text-sm" id="usrErr">{err}</p>}
      <Acciones enviando={enviando} texto="Asignar clave" onCancelar={onCancelar} />
    </form>
  );
}
