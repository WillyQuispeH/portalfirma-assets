// Detalle de una persona del CRM: datos, propiedades vinculadas, documentos que firma e historial con notas.
// Se abre con Inmo.abrirPersona(id) (src/renderer/inmo.js), que la monta en #view-personas, el mismo contenedor de la
// lista. Hecha con el kit: Layout (cabecera con «volver»), Avatar, Badge, Boton, Card, ListaDatos, ItemLista, LineaTiempo, Input,
// ModalConfirmar; «Editar» abre FormPersona.
// Las pruebas usan #pBack, #pEdit, #pDel (y #mOk/#mCancel al confirmar), #pDocs (con data-doc y data-pdf),
// #pNota/#pNotaT, [data-p] en cada propiedad, [data-datos] y el historial [data-historial] con li[data-nota].
import { useEffect, useState, type FormEvent } from 'react';
import { ROL } from '../cartera/catalogos';
import { TONO_ROL } from '../personas/Personas';
import { abrirFormPersona } from '../personas/controlador';
import { TONO_FIRMA, copiarCorreo, estadoFirma, whatsapp } from '../ficha/comun';
import { usePersona } from '../../../store/hooks/usePersona.hook';
import { abrirFicha, abrirLead, abrirPersonas, avisar, toast } from '../../../utils/app';
import { fecha, fechaHora } from '../../../utils/formato';
import Layout from '../../ui/Layout';
import Avatar from '../../ui/Avatar';
import Badge from '../../ui/Badge';
import Boton from '../../ui/Boton';
import Card from '../../ui/Card';
import ListaDatos from '../../ui/ListaDatos';
import ItemLista, { Miniatura } from '../../ui/ItemLista';
import LineaTiempo from '../../ui/LineaTiempo';
import Input from '../../ui/Input';
import EstadoVacio from '../../ui/EstadoVacio';
import Icono from '../../ui/Icono';
import { ModalConfirmar } from '../../ui/Modal';

function Documentos({ id }: { id: string }) {
  const { documentos, personaPdfAbrir } = usePersona();
  const ds = documentos[id];
  const abrir = async (ruta: string) => { const r = await personaPdfAbrir(ruta); if (r.error) toast(r.error, 4000); };
  const titulo = Array.isArray(ds) ? `Documentos (${ds.length})` : 'Documentos';
  return (
    <div id="pDocs">
      <Card titulo={titulo} subtitulo="Lo que firma desde Asset, en todas sus propiedades">
        {!ds ? <EstadoVacio compacto texto="Cargando…" />
          : ds === 'error' ? <EstadoVacio compacto texto="No se pudieron cargar." />
            : ds.length ? (
              <div className="tw:-mx-3 tw:flex tw:flex-col">
                {ds.slice(0, 12).map((d, i) => {
                  const [t, c] = estadoFirma(d.estado);
                  return (
                    <ItemLista key={i} data-doc=""
                      media={<span className="tw:grid tw:place-items-center tw:w-9 tw:h-9 tw:rounded-xl tw:bg-sunken tw:text-muted"><Icono nombre={d.origen === 'asset' ? 'filePlus' : 'sign'} tam={16} /></span>}
                      titulo={d.titulo}
                      detalle={[fecha(d.fecha), d.propiedad?.codigo, d.operacion ? 'operación ' + d.operacion : ''].filter(Boolean).join(' · ')}
                      derecha={<>
                        <Badge tono={TONO_FIRMA[c] ?? 'gris'} punto>{t}</Badge>
                        {d.archivo && <Boton variante="secundario" tamano="sm" data-pdf={d.archivo} onClick={() => abrir(d.archivo!)}>PDF</Boton>}
                      </>} />
                  );
                })}
              </div>
            ) : <EstadoVacio compacto texto="Aún no firma documentos desde Asset." />}
      </Card>
    </div>
  );
}

function Historial() {
  const { actividad, personaNota } = usePersona();
  const [texto, setTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const guardar = async (e: FormEvent) => {
    e.preventDefault(); const t = texto.trim(); if (!t) return;
    setGuardando(true);
    const r = await personaNota(t); setGuardando(false);
    if (r.error) return toast(r.error, 4000);
    setTexto('');
  };
  return (
    <Card titulo="Historial">
      <form id="pNota" onSubmit={guardar} className="tw:flex tw:gap-2 tw:mb-4">
        <Input id="pNotaT" placeholder="Agregar una nota" aria-label="Nota" clasesCampo="tw:flex-1" value={texto} onChange={(e) => setTexto(e.target.value)} />
        <Boton type="submit" variante="secundario" cargando={guardando} disabled={!texto.trim()}>Guardar</Boton>
      </form>
      <LineaTiempo items={actividad.map((a) => ({ texto: a.texto, fecha: fechaHora(a.fecha), destacado: a.tipo === 'nota' }))} />
    </Card>
  );
}

interface IFichaPersonaProps {
  id: string;
  vez?: number; // inmo.js la sube para pedir que se recargue (después de editar)
}

export default function FichaPersona({ id, vez }: IFichaPersonaProps) {
  const { persona: c, propiedades, cargado, error, personaGet, personaBorrar } = usePersona();
  const [borrar, setBorrar] = useState(false);

  useEffect(() => { personaGet(id); }, [id, vez, personaGet]);
  // la persona ya no está (eliminada): vuelve a la lista
  useEffect(() => { if (cargado && !error && !c) abrirPersonas(); }, [cargado, error, c]);

  if (!c) return <Layout>{error ? <p role="alert" className="tw:text-red-softink">No se pudo leer la persona: {error}</p> : <EstadoVacio compacto texto="Cargando…" />}</Layout>;

  const props = propiedades.flatMap((p) => (p.vinculos || []).filter((v) => v.personaId === c.id).map((v) => ({ p, rol: v.rol })));
  const empresa = c.tipo === 'juridica';

  return (
    <Layout
      tinte="#6a2fe0"
      volver={{ texto: 'Personas', alTocar: abrirPersonas, id: 'pBack' }}
      antes={<Avatar nombre={c.nombre} tamano="xl" />}
      sobretitulo={`${empresa ? 'Persona jurídica' : 'Persona natural'} · ${c.rut ? 'RUT ' + c.rut : 'Sin RUT todavía'}`}
      titulo={c.nombre}
      subtitulo={c.roles.length
        ? <span className="tw:flex tw:flex-wrap tw:gap-1 tw:mt-1">{c.roles.map((r) => <Badge key={r} tono={TONO_ROL[r]}>{ROL[r]}</Badge>)}</span>
        : 'Sin rol'}
      acciones={<>
        <Boton id="pEdit" variante="secundario" icono="edit" onClick={() => abrirFormPersona(c)}>Editar</Boton>
        <Boton id="pDel" variante="peligro" icono="trash" onClick={() => setBorrar(true)}>Eliminar</Boton>
      </>}
    >
      <div className="tw:grid tw:gap-4 tw:lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] tw:items-start">
        <div className="tw:grid tw:gap-4">
          <Card titulo="Datos">
            <div data-datos>
              <ListaDatos vacio="Sin datos de contacto todavía." datos={[
                ['Corredor', c.corredor?.nombre],
                ['Correo', c.email],
                ['Teléfono', c.telefono],
                ['Dirección', c.direccion],
                [empresa ? 'Giro' : 'Profesión', c.profesion],
                ...(!empresa ? [['Estado civil', c.estadoCivil], ['Nacionalidad', c.nacionalidad]] as [string, string | undefined][] : []),
              ]} />
            </div>
            {c.notas && <p className="tw:mt-4 tw:mb-0 tw:p-3 tw:rounded-xl tw:bg-sunken tw:text-sm tw:leading-relaxed tw:whitespace-pre-wrap">{c.notas}</p>}
            {(c.leadId || c.telefono || c.email) && (
              <div className="tw:flex tw:flex-wrap tw:gap-2 tw:mt-4">
                {c.leadId && <Boton id="pLead" variante="secundario" tamano="sm" icono="sparkle" onClick={() => abrirLead(c.leadId!)}>Ver en Leads</Boton>}
                {c.telefono && <Boton id="pWa" variante="secundario" tamano="sm" icono="whatsapp" onClick={() => whatsapp(c.telefono!)}>WhatsApp</Boton>}
                {c.email && <Boton id="pMail" variante="secundario" tamano="sm" icono="mail" onClick={() => copiarCorreo(c.email)}>Copiar correo</Boton>}
              </div>
            )}
          </Card>

          <Card titulo={`Propiedades${props.length ? ` (${props.length})` : ''}`}>
            {props.length ? (
              <div className="tw:-mx-3 tw:flex tw:flex-col">
                {props.map(({ p, rol }) => (
                  <ItemLista key={`${p.id}-${rol}`} data-p={p.id} alTocar={() => abrirFicha(p.id)} flecha
                    media={<Miniatura src={p.fotos?.[0]} icono="house" />}
                    titulo={p.titulo}
                    detalle={[ROL[rol as keyof typeof ROL] || rol, p.codigo, p.comuna].filter(Boolean).join(' · ')} />
                ))}
              </div>
            ) : <EstadoVacio compacto texto="No está vinculada a ninguna propiedad." />}
          </Card>

          <Documentos id={c.id} />
        </div>
        <Historial />
      </div>

      <ModalConfirmar clave="modal-120" abierto={borrar} onCerrar={() => setBorrar(false)} peligro
        titulo={`¿Eliminar a ${c.nombre}?`} mensaje="Se quita de tu CRM. Si está vinculada a una propiedad, primero hay que quitar el vínculo."
        textoConfirmar="Eliminar" idConfirmar="mOk" idCancelar="mCancel"
        onConfirmar={async () => {
          const r = await personaBorrar();
          if (r.error) throw new Error(r.error);
          avisar(r); abrirPersonas();
        }} />
    </Layout>
  );
}
