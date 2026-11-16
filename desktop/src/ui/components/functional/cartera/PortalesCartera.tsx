// Cartera › Portales: la cuenta de Portal Inmobiliario (Mercado Libre), el contacto que sale en los avisos y los otros
// portales. Se abre con Inmo.portales() (src/renderer/inmo.js), que la monta en #view-cartera, el mismo contenedor de la lista.
// Hecha con el kit: Layout, Card, Badge, Boton, Input, Select, ListaDatos y MenuMas.
// Las pruebas buscan #poBack, #poCon, #poSync, #poExist, #poOut, #coNom, #coMail, #coWa, #coTel, #coWeb, #coTipo, #coSave y #coErr.
import { useCallback, useEffect, useState } from 'react';
import Layout from '../../ui/Layout';
import Card from '../../ui/Card';
import Badge from '../../ui/Badge';
import Boton from '../../ui/Boton';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import ListaDatos from '../../ui/ListaDatos';
import MenuMas from '../../ui/MenuMas';
import EstadoVacio from '../../ui/EstadoVacio';
import ItemLista from '../../ui/ItemLista';
import { api } from '../../../utils/api';
import { abrirCartera, toast, vincularAvisosExistentes } from '../../../utils/app';
import { fechaHora } from '../../../utils/formato';
import { useCartera } from '../../../store/hooks/useCartera.hook';

interface IContacto { nombre?: string; email?: string; whatsapp?: string; telefono?: string; web?: string }
interface IEstadoML {
  configurada: boolean; conectada: boolean; cuenta?: { nickname?: string; email?: string } | null;
  contacto?: IContacto | null; tipoAviso?: string; ultimaSync?: string | null;
}
type TPaquetes = Record<string, number | null | undefined>;

const TIPO_AVISO: Record<string, string> = { silver: 'Publicación', gold: 'Destacado', gold_premium: 'Destacado premium' };
const OTROS: [string, string][] = [
  ['TOCTOC', 'Integra con sistemas de cartera reconocidos (Convecta, Ofinet, Wasi)'],
  ['Chilepropiedades', 'Lee la cartera una vez al día, sin costo si es factible'],
  ['Yapo', 'Integración con CRM vía su ejecutivo comercial'],
  ['Goplaceit', 'Vía Goplaceit Pro'],
];

export default function PortalesCartera() {
  const { propiedades, cargado, carteraGetAll } = useCartera();
  const [e, setE] = useState<IEstadoML | null>(null);
  const [paq, setPaq] = useState<TPaquetes | null>(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState<'' | 'conectar' | 'sync' | 'contacto'>('');
  const [errContacto, setErrContacto] = useState('');

  const cargar = useCallback(async () => {
    try {
      const est = await api<IEstadoML>('mlEstado');
      const paquetes = est.conectada ? await api<TPaquetes | null>('mlPaquetes').catch(() => null) : null;
      setPaq(paquetes); setE(est); setError(''); // juntos: la pantalla no se ve a medias
    } catch (er) { setError((er as Error).message); }
  }, []);
  useEffect(() => { void cargar(); if (!cargado) void carteraGetAll(); }, [cargar, cargado, carteraGetAll]);

  const avisos = propiedades.flatMap((p) => (['venta', 'arriendo'] as const).map((op) => p.portales?.pi?.[op]).filter((a) => a?.itemId));
  const cuenta = (k: string) => avisos.filter((a) => a?.status === k).length;
  const c = e?.contacto || {};

  const conectar = async () => {
    setOcupado('conectar');
    try { await api('mlConectar'); toast('Cuenta conectada.'); }
    catch (er) { if (!/cerró la ventana/.test((er as Error).message)) toast((er as Error).message, 6000); }
    setOcupado(''); void cargar();
  };
  const sincronizar = async () => {
    setOcupado('sync');
    try {
      const r = await api<{ avisos: number; leads: number }>('mlSincronizar'); await cargar();
      toast(`${r.avisos} ${r.avisos === 1 ? 'aviso revisado' : 'avisos revisados'} · ${r.leads} ${r.leads === 1 ? 'interesado nuevo' : 'interesados nuevos'}.`, 4000);
    } catch (er) { toast((er as Error).message, 6000); void cargar(); }
    setOcupado('');
  };
  const desconectar = async () => { await api('mlDesconectar'); toast('Cuenta desconectada. Los avisos siguen publicados.'); void cargar(); };
  const guardarContacto = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault(); const d = new FormData(ev.currentTarget); const v = (k: string) => String(d.get(k) ?? '');
    setOcupado('contacto');
    try {
      await api('mlContacto', { nombre: v('nombre'), email: v('email'), whatsapp: v('whatsapp'), telefono: v('telefono'), web: v('web') }, v('tipo'));
      setErrContacto(''); toast('Contacto guardado.'); void cargar();
    } catch (er) { setErrContacto((er as Error).message); }
    setOcupado('');
  };

  return (
    <Layout volver={{ texto: 'Cartera', alTocar: abrirCartera, id: 'poBack' }} titulo="Portales" ilustracion={{ imagen: 'img/formas/portales.svg' }}
      subtitulo="Publica la cartera desde la ficha. Cada cambio de precio, fotos o estado se refleja solo en el aviso.">
      {error && <p role="alert" className="tw:m-0 tw:text-red-softink">No se pudo leer el estado de los portales: {error}</p>}
      {!e && !error && <EstadoVacio compacto texto="Cargando…" />}
      {e && (
        <div className="tw:flex tw:flex-col tw:gap-4">
          <div className="tw:grid tw:grid-cols-[repeat(auto-fit,minmax(340px,1fr))] tw:items-start tw:gap-4">
            <Card titulo="Portal Inmobiliario" subtitulo="Mercado Libre" accion={<Badge tono={e.conectada ? 'verde' : 'gris'} punto>{e.conectada ? 'Conectado' : 'Sin conectar'}</Badge>}>
              <div className="tw:flex tw:flex-col tw:gap-4">
                {!e.configurada && (
                  <p role="alert" className="tw:m-0 tw:text-sm tw:text-yellow-ink">
                    <b>Falta registrar la app de PortalFirma en Mercado Libre.</b> Lo hace PortalFirma una sola vez (ver PORTAL-INMOBILIARIO.md); después cada corredora solo conecta su cuenta.
                  </p>
                )}
                {e.conectada ? (
                  <>
                    <ListaDatos datos={[
                      ['Cuenta', `${e.cuenta?.nickname ?? ''}${e.cuenta?.email ? ' · ' + e.cuenta.email : ''}`],
                      ['Avisos', `${cuenta('active')} activos · ${cuenta('paused')} pausados · ${cuenta('closed')} finalizados`],
                      ['Paquetes', paq ? Object.entries(TIPO_AVISO).map(([k, v]) => `${v}: ${paq[k] == null ? '—' : paq[k]}`).join(' · ') : null],
                      ['Última sincronización', e.ultimaSync ? fechaHora(e.ultimaSync) : 'Nunca'],
                    ]} />
                    <p className="tw:m-0 tw:text-[13px] tw:text-muted">¿La corredora ya publicaba con Convecta u otro sistema? «Vincular avisos existentes» asocia esos avisos a sus fichas por código, para no duplicarlos.</p>
                    <div className="tw:flex tw:flex-wrap tw:items-center tw:justify-end tw:gap-2">
                      <Boton id="poExist" variante="secundario" icono="link" onClick={vincularAvisosExistentes}>Vincular avisos existentes</Boton>
                      <Boton id="poSync" icono="rotateR" cargando={ocupado === 'sync'} onClick={sincronizar}>Sincronizar avisos e interesados</Boton>
                      <MenuMas etiqueta="Más acciones de la cuenta" opciones={[{ id: 'poOut', texto: 'Desconectar cuenta', icono: 'x', alTocar: desconectar }]} />
                    </div>
                  </>
                ) : (
                  <>
                    <p className="tw:m-0 tw:text-sm tw:text-muted">Cada corredora conecta su propia cuenta de Mercado Libre. Ahí debe estar activada como inmobiliaria y tener un paquete de publicación contratado.</p>
                    <div className="tw:flex tw:justify-end">
                      <Boton id="poCon" icono="link" disabled={!e.configurada} cargando={ocupado === 'conectar'} onClick={conectar}>
                        {ocupado === 'conectar' ? 'Esperando la autorización en Mercado Libre…' : 'Conectar cuenta de la corredora'}
                      </Boton>
                    </div>
                  </>
                )}
              </div>
            </Card>

            <Card titulo="Contacto que aparece en los avisos">
              <form key={JSON.stringify(c) + (e.tipoAviso ?? '')} onSubmit={guardarContacto} className="tw:flex tw:flex-col tw:gap-3">
                <div className="tw:grid tw:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] tw:gap-3">
                  <Input id="coNom" name="nombre" etiqueta="Nombre de la corredora" defaultValue={c.nombre || ''} />
                  <Input id="coMail" name="email" type="email" etiqueta="Correo para consultas" defaultValue={c.email || ''} />
                  <Input id="coWa" name="whatsapp" etiqueta="WhatsApp (obligatorio)" placeholder="+56 9 1234 5678" defaultValue={c.whatsapp || ''} />
                  <Input id="coTel" name="telefono" etiqueta="Teléfono" defaultValue={c.telefono || ''} />
                  <Input id="coWeb" name="web" etiqueta="Sitio web" placeholder="https://" defaultValue={c.web || ''} />
                  <Select id="coTipo" name="tipo" etiqueta="Tipo de aviso por defecto" defaultValue={e.tipoAviso || 'silver'} opciones={Object.entries(TIPO_AVISO)} />
                </div>
                <p id="coErr" role="alert" className="tw:m-0 tw:min-h-[1.2em] tw:text-sm tw:text-red-softink">{errContacto}</p>
                <div className="tw:flex tw:justify-end">
                  <Boton id="coSave" type="submit" variante="secundario" cargando={ocupado === 'contacto'}>Guardar contacto</Boton>
                </div>
              </form>
            </Card>
          </div>

          <Card titulo="Otros portales" subtitulo="Se conectan cuando PortalFirma firme el acuerdo de integrador con cada uno. Toman la cartera desde la misma ficha.">
            <div className="tw:grid tw:grid-cols-[repeat(auto-fit,minmax(240px,1fr))] tw:gap-2">
              {OTROS.map(([nombre, detalle]) => <ItemLista key={nombre} titulo={nombre} detalle={detalle} derecha={<Badge>Requiere acuerdo</Badge>} />)}
            </div>
          </Card>
        </div>
      )}
    </Layout>
  );
}
