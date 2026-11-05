// Pestaña «Propietario» de la ficha: quién captó la propiedad, los datos del dueño (o el aviso de que están
// reservados al captador), las notas sobre el propietario y los documentos que firma.
// Las pruebas usan #fDueno, #fCaptador, #fEquipo, .im-dueno y .im-lock.
import { useEffect, useState, type MouseEvent } from 'react';
import Icono from '../../ui/Icono';
import { copiarCorreo, whatsapp } from './comun';
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
    <div className="im-ddocs" data-ddocs={id}>
      {!ds ? <p className="muted small">Cargando documentos…</p> : ds === 'error' ? null : <>
        <h4>Documentos que firma{ds.length > 0 && <> <i className="muted">({ds.length})</i></>}</h4>
        {ds.length ? ds.slice(0, 8).map((x, i) => (
          <div className="im-doc" key={i}>
            <span className="im-dic"><Icono nombre="sign" tam={15} /></span>
            <span className="im-dt"><b>{x.titulo}</b><small>{fecha(x.fecha)}{x.propiedad ? ' · ' + x.propiedad.codigo : ''}</small></span>
            {x.archivo && <button className="ghost small" data-pdf2={x.archivo} onClick={() => abrir(x.archivo!)}>PDF</button>}
          </div>
        )) : <p className="muted small">Aún no firma documentos desde Asset.</p>}
      </>}
    </div>
  );
}

function TarjetaDueno({ c }: { c: IPersona }) {
  const { personaGuardar } = usePersona();
  const [notas, setNotas] = useState(c.notas || '');
  useEffect(() => { setNotas(c.notas || ''); }, [c.notas]);
  const datos: [string, string | undefined][] = [['RUT', c.rut || 'Sin RUT todavía'], ['Celular', c.telefono], ['Correo', c.email], ['Dirección', c.direccion], ['Estado civil', c.estadoCivil], ['Profesión', c.profesion]];
  const guardar = async () => avisar(await personaGuardar({ ...c, notas }, 'Notas guardadas.'));
  return (
    <div className="im-box im-dueno">
      <div className="im-bh"><h3>{c.nombre}</h3><button className="ghost small" data-per={c.id} onClick={() => abrirPersona(c.id)}>Ver persona</button></div>
      <dl className="im-dl">{datos.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <div className="row">
        {c.telefono && <button className="secondary small" data-wa={c.telefono} onClick={() => whatsapp(c.telefono!)}><Icono nombre="whatsapp" tam={14} /> WhatsApp</button>}
        {c.email && <button className="secondary small" data-mail={c.email} onClick={() => copiarCorreo(c.email)}><Icono nombre="mail" tam={14} /> Copiar correo</button>}
      </div>
      <label className="im-dnotas">Notas sobre el propietario <small className="muted">(cómo es, cómo prefiere que lo contacten, acuerdos…)</small>
        <textarea rows={3} data-dnota={c.id} value={notas} onChange={(e) => setNotas(e.target.value)} />
      </label>
      <div className="row"><button className="secondary small" data-dguardar={c.id} onClick={guardar}>Guardar notas</button></div>
      <DocumentosDueno id={c.id} />
    </div>
  );
}

export default function Propietario({ p }: { p: IPropiedad }) {
  const { personas, fichaSetCaptador } = useFicha();
  const { perfil } = usePerfil();
  if (!perfil) return <div className="im-pw" id="fDueno"><p className="muted small">Cargando…</p></div>;

  const capt = p.captador;
  const duenos = (p.vinculos || []).filter((v) => v.rol === 'propietario').map((v) => personas.find((c) => c.id === v.personaId)).filter(Boolean) as IPersona[];
  const f = p.ficha || {};
  const verUsuarios = (e: MouseEvent) => { e.preventDefault(); abrirUsuarios(); };
  const asignar = async (corredorId: string) => avisar(await fichaSetCaptador(corredorId || null));

  return (
    <div className="im-pw" id="fDueno">
      <div className="im-box im-capt">
        <div className="im-bh"><h3>Quién captó esta propiedad</h3></div>
        <p className="muted small">Entraste como <b>{perfil.nombre}</b> ({perfil.esAdmin ? 'administrador' : 'corredor'}) · <a href="#" id="fEquipo" onClick={verUsuarios}>usuarios</a></p>
        {perfil.esAdmin ? <>
          <label className="im-captsel">Captada por
            <select id="fCaptador" value={capt?.id || ''} onChange={(e) => asignar(e.target.value)}>
              <option value="">— sin captador —</option>
              {perfil.corredores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
          {perfil.corredores.length < 2 && <p className="muted small">Agrega a los corredores en Usuarios (menú de tu cuenta) para asignar quién captó cada propiedad.</p>}
        </> : <p>Captada por <b>{capt?.nombre || 'nadie todavía'}</b>{capt?.id === perfil.corredorId ? ' (tú)' : ''}.</p>}
        <p className="muted small">Toda la cartera la ven todos los corredores; los datos del propietario solo quien captó la propiedad y el administrador.</p>
      </div>

      {p.duenoVisible === false ? (
        <div className="im-box im-lock"><Icono nombre="lock" tam={22} />
          <div><b>Datos del propietario reservados</b>
            <p className="muted small">Los ve {capt ? `${capt.nombre}, que captó esta propiedad,` : 'el administrador (aún no tiene captador asignado)'} y el administrador. Puedes ofrecer la propiedad, agendar visitas y abrir negocios con tus clientes; para el mandato o el contrato pídeselo a {capt ? capt.nombre.split(' ')[0] : 'el administrador'}.</p>
          </div>
        </div>
      ) : duenos.length ? duenos.map((c) => <TarjetaDueno key={c.id} c={c} />) : (
        <div className="im-box"><h3>Propietario</h3>
          {f.propietarioNombre ? <>
            <p><b>{f.propietarioNombre}</b>{f.propietarioCelular ? ' · ' + f.propietarioCelular : ''}{f.propietarioEmail ? ' · ' + f.propietarioEmail : ''}</p>
            <p className="muted small">Anotado en la ficha; queda en Personas cuando tenga RUT válido.</p>
          </> : <p className="muted small">Todavía no hay propietario. Vincúlalo para poder enviar el mandato.</p>}
          <div className="row"><button className="secondary small" id="fDVinc" onClick={() => abrirModal(<VincularPersona p={p} />)}><Icono nombre="plus" tam={13} /> Vincular propietario</button></div>
        </div>
      )}
    </div>
  );
}
