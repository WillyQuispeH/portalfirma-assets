// Detalle de una persona del CRM: datos, propiedades vinculadas, documentos que firma e historial con notas.
// Se abre con Inmo.abrirPersona(id) (src/renderer/inmo.js), que la monta en #view-personas, el mismo
// contenedor de la lista. «Editar» sigue en inmo.js (formPersona: también lo usan otras pantallas).
// Las pruebas usan #pBack, #pEdit, #pDel, #pDocs, #pNota, #pNotaT y .im-pp[data-p].
import { useEffect, useState, type FormEvent } from 'react';
import Icono from '../../ui/Icono';
import { ROL } from '../cartera/catalogos';
import { Fila, ListaActividad, copiarCorreo, estadoFirma, whatsapp } from '../ficha/comun';
import { EliminarPersona } from '../ficha/Modales';
import { usePersona } from '../../../store/hooks/usePersona.hook';
import { abrirFicha, abrirLead, abrirPersonas, editarPersona, toast } from '../../../utils/app';
import { abrirModal } from '../../../utils/modal';
import { fecha } from '../../../utils/formato';
import type { IPropiedad } from '../../../store/interfaces/propiedad.interface';

function FotoMini({ p }: { p: IPropiedad }) {
  const [rota, setRota] = useState(false);
  const u = p.fotos?.[0];
  return <span className="im-pph">{u && !rota ? <img src={u} alt="" loading="lazy" onError={() => setRota(true)} /> : <span className="im-noph"><Icono nombre="house" tam={34} /></span>}</span>;
}

function Documentos({ id }: { id: string }) {
  const { documentos, personaPdfAbrir } = usePersona();
  const ds = documentos[id];
  const abrir = async (ruta: string) => { const r = await personaPdfAbrir(ruta); if (r.error) toast(r.error, 4000); };
  return (
    <div className="im-box" id="pDocs">
      {!ds ? <><h3>Documentos</h3><p className="muted small">Cargando…</p></>
        : ds === 'error' ? <><h3>Documentos</h3><p className="muted small">No se pudieron cargar.</p></>
          : <>
            <h3>Documentos <i className="muted">({ds.length})</i></h3>
            {ds.length ? ds.slice(0, 12).map((d, i) => { const [t, c] = estadoFirma(d.estado); return (
              <div className="im-doc" key={i}>
                <span className="im-dic"><Icono nombre={d.origen === 'asset' ? 'filePlus' : 'sign'} tam={16} /></span>
                <span className="im-dt"><b>{d.titulo}</b><small>{fecha(d.fecha)}{d.propiedad ? ' · ' + d.propiedad.codigo : ''}{d.operacion ? ' · operación ' + d.operacion : ''}</small></span>
                <i className={`im-st ${c}`}>{t}</i>
                {d.archivo && <button className="ghost small im-pdf" data-pdf={d.archivo} onClick={() => abrir(d.archivo!)}>PDF</button>}
              </div>
            ); }) : <p className="muted small">Aún no firma documentos desde Asset.</p>}
          </>}
    </div>
  );
}

function Historial() {
  const { actividad, personaNota } = usePersona();
  const [texto, setTexto] = useState('');
  const guardar = async (e: FormEvent) => {
    e.preventDefault(); const t = texto.trim(); if (!t) return;
    const r = await personaNota(t); if (r.error) return toast(r.error, 4000);
    setTexto('');
  };
  return (
    <div className="im-box"><h3>Historial</h3>
      <form className="im-nota" id="pNota" onSubmit={guardar}>
        <input id="pNotaT" placeholder="Agregar una nota" value={texto} onChange={(e) => setTexto(e.target.value)} />
        <button className="secondary small">Guardar</button>
      </form>
      <ListaActividad items={actividad} />
    </div>
  );
}

interface IFichaPersonaProps {
  id: string;
  vez?: number; // inmo.js la sube para pedir que se recargue (después de editar)
}

export default function FichaPersona({ id, vez }: IFichaPersonaProps) {
  const { persona: c, propiedades, cargado, error, personaGet } = usePersona();

  useEffect(() => { personaGet(id); }, [id, vez, personaGet]);
  // la persona ya no está (eliminada): vuelve a la lista
  useEffect(() => { if (cargado && !error && !c) abrirPersonas(); }, [cargado, error, c]);

  if (!c) return <div className="im-wrap">{error ? <p className="error">No se pudo leer la persona: {error}</p> : <p className="muted">Cargando…</p>}</div>;

  const props = propiedades.flatMap((p) => (p.vinculos || []).filter((v) => v.personaId === c.id).map((v) => ({ p, rol: v.rol })));

  return (
    <div className="im-wrap im-ficha">
      <div className="im-fh">
        <button className="ghost" id="pBack" onClick={abrirPersonas}><Icono nombre="chevL" tam={16} /> Personas</button>
        <span className="spacer" />
        <button className="secondary" id="pEdit" onClick={() => editarPersona(c)}><Icono nombre="edit" tam={15} /> Editar</button>
        <button className="danger" id="pDel" onClick={() => abrirModal(<EliminarPersona nombre={c.nombre} />)}>Eliminar</button>
      </div>
      <div className="im-ft im-pt">
        <span className="im-av xl">{c.nombre[0]}</span>
        <div>
          <small className="im-code">{c.tipo === 'juridica' ? 'Persona jurídica' : 'Persona natural'} · {c.rut ? 'RUT ' + c.rut : 'Sin RUT todavía'}</small>
          <h1>{c.nombre}</h1>
          <p>{c.roles.length ? c.roles.map((r) => <i key={r} className="im-rl">{ROL[r]}</i>) : <span className="muted">Sin rol</span>}</p>
        </div>
      </div>
      <div className="im-fcols">
        <div>
          <div className="im-box"><h3>Datos</h3>
            <dl className="im-dl">
              <Fila k="Corredor" v={c.corredor?.nombre} />
              <Fila k="Correo" v={c.email} />
              <Fila k="Teléfono" v={c.telefono} />
              <Fila k="Dirección" v={c.direccion} />
              <Fila k="Estado civil" v={c.estadoCivil} />
              <Fila k="Profesión" v={c.profesion} />
              <Fila k="Nacionalidad" v={c.nacionalidad} />
            </dl>
            {c.notas && <><h3 style={{ marginTop: 14 }}>Notas</h3><p className="im-desc">{c.notas}</p></>}
            <div className="row" style={{ marginTop: 12 }}>
              {c.leadId && <button className="secondary small" id="pLead" onClick={() => abrirLead(c.leadId!)}><Icono nombre="sparkle" tam={14} /> Ver en Leads</button>}
              {c.telefono && <button className="secondary small" id="pWa" onClick={() => whatsapp(c.telefono!)}><Icono nombre="whatsapp" tam={14} /> WhatsApp</button>}
              {c.email && <button className="secondary small" id="pMail" onClick={() => copiarCorreo(c.email)}><Icono nombre="mail" tam={14} /> Copiar correo</button>}
            </div>
          </div>
          <div className="im-box"><h3>Propiedades</h3>
            {props.length ? props.map(({ p, rol }) => (
              <button key={`${p.id}-${rol}`} className="im-pp" data-p={p.id} onClick={() => abrirFicha(p.id)}>
                <FotoMini p={p} />
                <span><b>{p.titulo}</b><small>{ROL[rol as keyof typeof ROL] || rol} · {p.codigo} · {p.comuna || ''}</small></span>
                <Icono nombre="chevR" tam={16} />
              </button>
            )) : <p className="muted small">No está vinculada a ninguna propiedad.</p>}
          </div>
          <Documentos id={c.id} />
        </div>
        <div><Historial /></div>
      </div>
    </div>
  );
}
