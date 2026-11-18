// Agente por WhatsApp: conectar el WhatsApp de la empresa (wechatia), vincular el celular del usuario con un
// código y decidir si este computador responde. Lo hecho por WhatsApp queda en la conversación «WhatsApp» del Agente.
// Va en el modal de la app (ancho), con las partes del kit (VentanaCabecera, VentanaCuerpo y VentanaPie).
// Ids para pruebas: #waAg, #waKey, #waLoc, #waKeyOk, #waVin, #waCopy, #waDes, #waAct, #waNum, .wa-paso, .wa-cod.
import { useEffect, useState, type ReactNode } from 'react';
import Icono from '../../ui/Icono';
import Boton from '../../ui/Boton';
import Badge from '../../ui/Badge';
import Input from '../../ui/Input';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../ui/Ventana';
import { useWhatsApp } from '../../../store/hooks/useWhatsApp.hook';
import { useCuenta } from '../../../store/hooks/useCuenta.hook';
import { cx } from '../../../utils/cx';
import { cerrarModal } from '../../../utils/modal';
import { toast } from '../../../utils/app';

const valorDe = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value.trim() || '';

const EQUIPO = [
  { nombre: 'Pedro', rol: 'Captación' },
  { nombre: 'Juanita', rol: 'Documentos' },
  { nombre: 'Diego', rol: 'Seguimiento' },
  { nombre: 'Fernanda', rol: 'Leads' },
] as const;

const Cabecera = () => (
  <VentanaCabecera
    icono="whatsapp"
    tonoIcono="verde"
    titulo="Agente por WhatsApp"
    descripcion="Habla con tu equipo desde el celular. Todo queda en la conversación WhatsApp del Agente."
  />
);
const Pie = () => <VentanaPie><Boton variante="secundario" id="mCancel" onClick={cerrarModal}>Cerrar</Boton></VentanaPie>;

const fmtTel = (t?: string | null) => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 11 ? `+${d.slice(0, 2)} ${d.slice(2, 3)} ${d.slice(3, 7)} ${d.slice(7)}` : t || ''; };

function Paso({ n, ok, off, titulo, estado, children }: {
  n: number; ok?: boolean; off?: boolean; titulo: string; estado?: string; children: ReactNode;
}) {
  return (
    <div className={cx('wa-paso', ok && 'ok', off && 'off')}>
      <span className="wa-n" aria-hidden>{ok ? <Icono nombre="check" tam={14} /> : n}</span>
      <div className="tw:min-w-0 tw:flex-1 tw:flex tw:flex-col tw:gap-ui">
        <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
          <b className="tw:text-[15px] tw:font-bold tw:text-text">{titulo}</b>
          {estado && <Badge tono={ok ? 'verde' : 'gris'} punto>{estado}</Badge>}
        </div>
        {children}
      </div>
    </div>
  );
}

/** los pasos: WhatsApp de la empresa, tu celular y responder desde este computador */
export function PasosWhatsApp() {
  const { estado: e, waCargar, waConectar, waVincular, waDesvincular, waConfigurar, waRevisarVinculo } = useWhatsApp();
  const { usuario } = useCuenta();
  const [listo, setListo] = useState(false);
  const [errClave, setErrClave] = useState(''); const [conectando, setConectando] = useState(false);
  useEffect(() => { waCargar().then(() => setListo(true)); }, [waCargar]);
  // con el código a la vista, revisa cada 2 segundos si ya llegó el mensaje desde el celular
  const codigo = e?.codigo;
  useEffect(() => {
    if (!codigo) return;
    const t = setInterval(async () => { if (await waRevisarVinculo()) { clearInterval(t); toast('Celular vinculado.'); } }, 2000);
    return () => clearInterval(t);
  }, [codigo, waRevisarVinculo]);

  if (!listo || !e) {
    return (
      <div className="wa-ag" id="waAg">
        <div className="tw:flex tw:min-h-[160px] tw:items-center tw:justify-center tw:gap-2 tw:text-sm tw:text-muted">
          <span className="spinner sm" />Cargando…
        </div>
      </div>
    );
  }

  const paso1 = !!e.conectado;
  const conectar = async () => {
    const k = valorDe('waKey');
    if (!k) { setErrClave('Pega la clave.'); return; }
    setConectando(true); setErrClave('');
    const err = await waConectar(k, valorDe('waLoc'));
    setConectando(false);
    if (err) setErrClave(err); else toast('WhatsApp de la empresa conectado.');
  };
  const vincular = async () => { const err = await waVincular(usuario?.namePerson || '', usuario?.email || ''); if (err) toast(err, 6000); };
  const copiar = async () => { try { await navigator.clipboard.writeText(e.codigo || ''); toast('Código copiado.'); } catch { /* sin portapapeles */ } };
  const desvincular = async () => { await waDesvincular(); toast('Celular desvinculado.'); };
  const activar = async (activo: boolean) => {
    await waConfigurar({ activo });
    toast(activo ? 'El Agente responde tu WhatsApp desde este computador.' : 'Agente por WhatsApp en pausa.');
  };

  return (
    <div className="wa-ag" id="waAg">
      <div className="tw:mb-1 tw:rounded-card tw:border tw:border-solid tw:border-edge tw:bg-sunken tw:p-4">
        <p className="tw:m-0 tw:text-sm tw:leading-relaxed tw:text-muted">
          Escribe el nombre de quien necesitas y te atiende. Cada uno guarda su propia conversación.
        </p>
        <div className="tw:mt-3 tw:flex tw:flex-wrap tw:gap-2">
          {EQUIPO.map((p) => (
            <span key={p.nombre} className="tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-control tw:border tw:border-solid tw:border-edge tw:bg-card tw:px-2.5 tw:py-1.5 tw:text-[13px]">
              <b className="tw:font-semibold tw:text-text">{p.nombre}</b>
              <span className="tw:text-muted">{p.rol}</span>
            </span>
          ))}
        </div>
      </div>

      <Paso n={1} ok={paso1} titulo="WhatsApp de la empresa" estado={paso1 ? 'Conectado' : 'Pendiente'}>
        {paso1 ? (
          <p className="tw:m-0 tw:text-sm tw:text-muted">Listo{e.propia ? ' con la clave de tu integración' : ''}.</p>
        ) : (
          <>
            <p className="tw:m-0 tw:text-sm tw:text-muted">Pega la clave que te entregaron para conectar el WhatsApp de la corredora.</p>
            <div className="wa-f tw:items-end">
              <Input id="waKey" type="password" autoComplete="off" spellCheck={false} etiqueta="Clave" placeholder="Clave (pit-…)" clasesCampo="tw:flex-1 tw:min-w-[180px]" />
              <Input id="waLoc" defaultValue={e.locationId || ''} etiqueta="Cuenta" placeholder="Cuenta (si te la pidieron)" spellCheck={false} clasesCampo="tw:flex-1 tw:min-w-[180px]" />
              <Boton id="waKeyOk" cargando={conectando} onClick={conectar}>Conectar</Boton>
            </div>
            {errClave && <p className="error tw:m-0" id="waKeyErr">{errClave}</p>}
          </>
        )}
      </Paso>

      <Paso n={2} ok={!!e.telefono} off={!paso1} titulo="Tu celular" estado={e.telefono ? 'Vinculado' : e.codigo ? 'Esperando mensaje' : 'Pendiente'}>
        {e.telefono ? (
          <>
            <p className="tw:m-0 tw:text-sm tw:text-muted">Vinculado: <b className="tw:text-text">{fmtTel(e.telefono)}</b>. Solo los mensajes de este celular los atiende tu Asset.</p>
            <div className="wa-f"><Boton variante="fantasma" tamano="sm" id="waDes" onClick={desvincular}>Desvincular</Boton></div>
          </>
        ) : e.codigo ? (
          <>
            <p className="tw:m-0 tw:text-sm tw:text-muted">
              Desde tu celular, envía este mensaje por WhatsApp al número de la empresa <b className="tw:text-text">{e.numeroEmpresa}</b>:
            </p>
            <div className="wa-cod">
              <b>{e.codigo}</b>
              <Boton variante="secundario" id="waCopy" onClick={copiar}>Copiar</Boton>
            </div>
            <p className="muted small tw:m-0 tw:flex tw:items-center tw:gap-2"><span className="spinner sm" /> Esperando tu mensaje…</p>
          </>
        ) : (
          <>
            <p className="tw:m-0 tw:text-sm tw:text-muted">Asset te da un código; lo envías desde tu celular y queda vinculado a tu cuenta.</p>
            <div className="wa-f"><Boton id="waVin" disabled={!paso1} icono="whatsapp" onClick={vincular}>Vincular mi celular</Boton></div>
          </>
        )}
      </Paso>

      <Paso n={3} ok={!!e.activo} off={!e.telefono} titulo="Responder desde este computador" estado={e.activo ? 'Activo' : 'En pausa'}>
        <label className="pv-sw tw:m-0">
          <input type="checkbox" id="waAct" checked={!!e.activo} disabled={!e.telefono} onChange={(ev) => activar(ev.target.checked)} />
          <span>
            <b>{e.activo ? 'Activo en este computador' : 'En pausa'}</b>
            <small>Funciona mientras Asset esté abierto aquí. Actívalo en un solo computador.</small>
          </span>
        </label>
      </Paso>

      <details className="lz-det tw:mt-1">
        <summary className="tw:cursor-pointer tw:text-sm tw:font-semibold tw:text-muted">Más opciones</summary>
        <div className="tw:mt-3">
          <Input
            id="waNum"
            key={e.numeroEmpresa || ''}
            defaultValue={e.numeroEmpresa || ''}
            etiqueta="Número de WhatsApp de la empresa"
            ayuda="Se guarda al salir del campo."
            onBlur={(ev) => { if (ev.target.value !== (e.numeroEmpresa || '')) waConfigurar({ numeroEmpresa: ev.target.value }); }}
            onKeyDown={(ev) => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); }}
          />
        </div>
      </details>
    </div>
  );
}

export default function AgenteWhatsApp() {
  return <>
    <Cabecera />
    <VentanaCuerpo><PasosWhatsApp /></VentanaCuerpo>
    <Pie />
  </>;
}
