// Pestaña «Propietario» de la ficha: quién captó la propiedad, los datos del dueño (o el aviso de que están
// reservados al captador), las notas sobre el propietario y los documentos que firma.
// Con el kit: Card, Boton, Select, Textarea, ListaDatos, ItemLista y Badge.
// Las pruebas usan #fDueno, #fCaptador, #fEquipo, .im-dueno, .im-lock, [data-dnota], [data-dguardar] y [data-ddocs].
import { useEffect, useState, type MouseEvent } from 'react';
import Icono from '../../ui/Icono';
import Boton from '../../ui/Boton';
import Card from '../../ui/Card';
import Select from '../../ui/Select';
import Textarea from '../../ui/Textarea';
import ListaDatos from '../../ui/ListaDatos';
import ItemLista from '../../ui/ItemLista';
import EstadoVacio from '../../ui/EstadoVacio';
import { IconoDoc, copiarCorreo, whatsapp } from './comun';
import { VincularPersona } from './Modales';
import { useFicha } from '../../../store/hooks/useFicha.hook';
import { usePerfil } from '../../../store/hooks/usePerfil.hook';
import { usePersona } from '../../../store/hooks/usePersona.hook';
import { abrirPersona, avisar, toast } from '../../../utils/app';
import { abrirUsuarios } from '../usuarios/controlador';
import { abrirModal } from '../../../utils/modal';
import { fecha } from '../../../utils/formato';
import type { IPropiedad } from '../../../store/interfaces/propiedad.interface';
import type { IPersona } from '../../../store/interfaces/persona.interface';

function DocumentosDueno({ id }: { id: string }) {
  const { documentos, personaDocumentosGet, personaPdfAbrir } = usePersona();
  useEffect(() => { personaDocumentosGet(id); }, [id, personaDocumentosGet]);
  const ds = documentos[id];
  const abrir = async (ruta: string) => { const r = await personaPdfAbrir(ruta); if (r.error) toast(r.error, 4000); };
  return (
    <div className="tw:mt-5" data-ddocs={id}>
      {!ds ? <EstadoVacio compacto texto="Cargando documentos…" /> : ds === 'error' ? null : <>
        <h4 className="tw:m-0 tw:mb-1.5 tw:text-sm tw:font-bold">Documentos que firma{ds.length > 0 && <span className="tw:font-normal tw:text-muted"> ({ds.length})</span>}</h4>
        {ds.length ? (
          <div className="tw:-mx-3 tw:flex tw:flex-col">
            {ds.slice(0, 8).map((x, i) => (
              <ItemLista key={i} data-doc="" media={<IconoDoc nombre="sign" />} titulo={x.titulo}
                detalle={`${fecha(x.fecha)}${x.propiedad ? ' · ' + x.propiedad.codigo : ''}`}
                derecha={x.archivo && <Boton variante="secundario" tamano="sm" data-pdf2={x.archivo} onClick={() => abrir(x.archivo!)}>PDF</Boton>} />
            ))}
          </div>
        ) : <EstadoVacio compacto texto="Aún no firma documentos desde Asset." />}
      </>}
    </div>
  );
}

function TarjetaDueno({ c }: { c: IPersona }) {
  const { personaGuardar } = usePersona();
  const [notas, setNotas] = useState(c.notas || '');
  useEffect(() => { setNotas(c.notas || ''); }, [c.notas]);
  const guardar = async () => avisar(await personaGuardar({ ...c, notas }, 'Notas guardadas.'));
  return (
    <div className="im-dueno">
      <Card titulo={c.nombre} accion={<Boton variante="fantasma" tamano="sm" data-per={c.id} onClick={() => abrirPersona(c.id)}>Ver persona</Boton>}>
        <ListaDatos datos={[['RUT', c.rut || 'Sin RUT todavía'], ['Celular', c.telefono], ['Correo', c.email], ['Dirección', c.direccion], ['Estado civil', c.estadoCivil], ['Profesión', c.profesion]]} />
        {(c.telefono || c.email) && (
          <div className="tw:flex tw:flex-wrap tw:gap-2 tw:mt-4">
            {c.telefono && <Boton variante="secundario" tamano="sm" icono="whatsapp" data-wa={c.telefono} onClick={() => whatsapp(c.telefono!)}>WhatsApp</Boton>}
            {c.email && <Boton variante="secundario" tamano="sm" icono="mail" data-mail={c.email} onClick={() => copiarCorreo(c.email)}>Copiar correo</Boton>}
          </div>
        )}
        <Textarea clasesCampo="tw:mt-5" etiqueta={<>Notas sobre el propietario <small className="tw:font-normal tw:text-muted">(cómo es, cómo prefiere que lo contacten, acuerdos…)</small></>}
          rows={3} data-dnota={c.id} value={notas} onChange={(e) => setNotas(e.target.value)} />
        <div className="tw:mt-2"><Boton variante="secundario" tamano="sm" data-dguardar={c.id} onClick={guardar}>Guardar notas</Boton></div>
        <DocumentosDueno id={c.id} />
      </Card>
    </div>
  );
}

export default function Propietario({ p }: { p: IPropiedad }) {
  const { personas, fichaSetCaptador } = useFicha();
  const { perfil } = usePerfil();
  if (!perfil) return <div id="fDueno" className="tw:max-w-[920px]"><EstadoVacio compacto texto="Cargando…" /></div>;

  const capt = p.captador;
  const duenos = (p.vinculos || []).filter((v) => v.rol === 'propietario').map((v) => personas.find((c) => c.id === v.personaId)).filter(Boolean) as IPersona[];
  const f = p.ficha || {};
  const verUsuarios = (e: MouseEvent) => { e.preventDefault(); abrirUsuarios(); };
  const asignar = async (corredorId: string) => avisar(await fichaSetCaptador(corredorId || null));

  return (
    <div id="fDueno" className="tw:max-w-[920px] tw:flex tw:flex-col tw:gap-4">
      <Card titulo="Quién captó esta propiedad">
        <div className="tw:flex tw:flex-col tw:gap-3 tw:text-sm">
          <p className="tw:m-0 tw:text-[13px] tw:text-muted">Entraste como <b>{perfil.nombre}</b> ({perfil.esAdmin ? 'administrador' : 'corredor'}) · <a href="#" id="fEquipo" onClick={verUsuarios}>usuarios</a></p>
          {perfil.esAdmin ? <>
            <Select id="fCaptador" etiqueta="Captada por" clasesCampo="tw:max-w-[320px]" value={capt?.id || ''} onChange={(e) => asignar(e.target.value)}>
              <option value="">— sin captador —</option>
              {perfil.corredores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </Select>
            {perfil.corredores.length < 2 && <p className="tw:m-0 tw:text-[13px] tw:text-muted">Agrega a los corredores en Usuarios (menú de tu cuenta) para asignar quién captó cada propiedad.</p>}
          </> : <p className="tw:m-0">Captada por <b>{capt?.nombre || 'nadie todavía'}</b>{capt?.id === perfil.corredorId ? ' (tú)' : ''}.</p>}
          <p className="tw:m-0 tw:text-[13px] tw:text-muted">Toda la cartera la ven todos los corredores; los datos del propietario solo quien captó la propiedad y el administrador.</p>
        </div>
      </Card>

      {p.duenoVisible === false ? (
        <Card>
          <div className="im-lock">
            <Icono nombre="lock" tam={22} />
            <div><b>Datos del propietario reservados</b>
              <p className="tw:text-[13px] tw:text-muted">Los ve {capt ? `${capt.nombre}, que captó esta propiedad,` : 'el administrador (aún no tiene captador asignado)'} y el administrador. Puedes ofrecer la propiedad, agendar visitas y abrir negocios con tus clientes; para el mandato o el contrato pídeselo a {capt ? capt.nombre.split(' ')[0] : 'el administrador'}.</p>
            </div>
          </div>
        </Card>
      ) : duenos.length ? duenos.map((c) => <TarjetaDueno key={c.id} c={c} />) : (
        <Card titulo="Propietario">
          {f.propietarioNombre ? <>
            <p className="tw:mt-0 tw:mb-1 tw:text-sm"><b>{f.propietarioNombre}</b>{f.propietarioCelular ? ' · ' + f.propietarioCelular : ''}{f.propietarioEmail ? ' · ' + f.propietarioEmail : ''}</p>
            <p className="tw:m-0 tw:text-[13px] tw:text-muted">Anotado en la ficha; queda en Personas cuando tenga RUT válido.</p>
          </> : <p className="tw:m-0 tw:text-[13px] tw:text-muted">Todavía no hay propietario. Vincúlalo para poder enviar el mandato.</p>}
          <div className="tw:mt-4"><Boton id="fDVinc" variante="secundario" tamano="sm" icono="plus" onClick={() => abrirModal(<VincularPersona p={p} />)}>Vincular propietario</Boton></div>
        </Card>
      )}
    </div>
  );
}
