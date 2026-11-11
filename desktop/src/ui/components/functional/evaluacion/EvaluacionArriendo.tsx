// Evaluación del arrendatario y de sus N avales. Es el contenido del paso «Evaluación del arrendatario» dentro de su
// ventana (modal-13, ventanas/inmo/Etapas.tsx › MenuPaso). El corredor:
//  1. elige a quién pedirle la documentación (el arrendatario y/o avales) o registra un aval nuevo con nombre, RUT y
//     celular, y la solicita por WhatsApp (plantilla aprobada);
//  2. ve, por persona, lo que adjuntó (cada archivo se abre) y lo que la IA leyó de cada documento;
//  3. ve el resumen y el porcentaje de aprobación global y DECIDE (aprobar o rechazar). El porcentaje es una ayuda.
// El servidor hace todo el trabajo (api/src/whatsapp/evaluacion.ts); esto pide, muestra y deja decidir.
// Los id (#evPanel, #evSolicitar, #evAprobar, #evRechazar, #evAvalNombre/#evAvalRut/#evAvalTel/#evAvalAgregar,
// [data-ev-dest], [data-ev-persona]) los usan las pruebas.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Boton from '../../ui/Boton';
import Badge from '../../ui/Badge';
import Input from '../../ui/Input';
import Textarea from '../../ui/Textarea';
import EstadoVacio from '../../ui/EstadoVacio';
import { evaluacionService } from '../../../store/services/evaluacion.service';
import { propiedadService } from '../../../store/services/propiedad.service';
import { personaService } from '../../../store/services/persona.service';
import { api } from '../../../utils/api';
import { formatearRut, rutValido } from '../../../utils/rut';
import type { IEvaluacion, IEvalPersona, TEvaluacionRespuesta } from '../../../store/interfaces/evaluacion.interface';
import type { IPersona } from '../../../store/interfaces/persona.interface';

const TONO = { alto: 'verde', medio: 'amarillo', bajo: 'rojo' } as const;
const NIVEL = { alto: 'Alto', medio: 'Medio', bajo: 'Bajo' } as const;
const CLASE: Record<string, string> = {
  contrato_trabajo: 'Contrato de trabajo', cedula_frente: 'Cédula (frente)', cedula_reverso: 'Cédula (reverso)', cedula_ambas: 'Cédula',
  liquidacion: 'Liquidación', afp: 'Certificado AFP', dicom: 'Informe Dicom', otro: 'No reconocido',
};
const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));
const CAJA = 'tw:rounded-xl tw:border tw:border-solid tw:border-edge tw:p-3 tw:flex tw:flex-col tw:gap-2';

export default function PanelEvaluacion({ negocioId }: { negocioId: string }) {
  const [ev, setEv] = useState<TEvaluacionRespuesta | null>(null);
  const [personas, setPersonas] = useState<IPersona[]>([]);
  const [titularId, setTitularId] = useState<string | null>(null);
  const [conTitular, setConTitular] = useState(true);
  const [avales, setAvales] = useState<string[]>([]);
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');
  const [trabajando, setTrabajando] = useState('');
  const [nuevo, setNuevo] = useState({ nombre: '', rut: '', telefono: '' });
  const [errorAval, setErrorAval] = useState('');
  const [verForm, setVerForm] = useState(false);

  const cargar = useCallback(async () => {
    try { setEv(await evaluacionService.ver(negocioId)); setError(''); } catch (e) { setError(mensaje(e)); setEv({ vacia: true }); }
  }, [negocioId]);
  const cargarPersonas = useCallback(() => propiedadService.getAll().then((c) => setPersonas(c.personas)).catch(() => undefined), []);
  useEffect(() => {
    cargar(); cargarPersonas();
    api<{ clienteId?: string | null }>('negObtener', negocioId).then((n) => setTitularId(n.clienteId ?? null)).catch(() => undefined);
  }, [cargar, cargarPersonas, negocioId]);

  const abierta = ev && !ev.vacia ? ev : null;
  const pedidos = useMemo(() => new Set(abierta ? abierta.personas.map((p) => p.personaId) : []), [abierta]);
  const titular = personas.find((p) => p.id === titularId);
  const titularPedido = !!titularId && pedidos.has(titularId);
  // avales que se pueden elegir: las personas registradas como codeudor (o avales ya registrados aquí)
  const candidatos = personas.filter((p) => p.id !== titularId && !pedidos.has(p.id) && !p.reservado && p.roles?.includes('codeudor'));
  const destinatarios = (conTitular && !titularPedido && !!titularId ? 1 : 0) + avales.length;

  const hacer = async (que: string, f: () => Promise<IEvaluacion>) => {
    setTrabajando(que); setError('');
    try { setEv(await f()); } catch (e) { setError(mensaje(e)); }
    setTrabajando('');
  };
  const solicitar = () => hacer('solicitar', async () => {
    const r = await evaluacionService.solicitar(negocioId, avales, conTitular && !titularPedido);
    setAvales([]);
    return r;
  });
  const decidir = (d: 'aprobada' | 'rechazada') => hacer(d, () => evaluacionService.decidir(negocioId, d, nota));
  const verArchivo = async (personaId: string, n: number) => {
    try { const r = await evaluacionService.archivo(negocioId, personaId, n); window.open(r.url, '_blank'); } catch (e) { setError(mensaje(e)); }
  };

  const registrarAval = async () => {
    setErrorAval('');
    const nombre = nuevo.nombre.trim().replace(/\s+/g, ' ');
    if (!nombre) return setErrorAval('Escribe el nombre del aval.');
    if (!rutValido(nuevo.rut)) return setErrorAval('El RUT no es válido.');
    if (nuevo.telefono.replace(/\D/g, '').length < 8) return setErrorAval('Escribe su celular (para escribirle por WhatsApp).');
    setTrabajando('aval');
    try {
      const p = await personaService.guardar({ nombre, rut: formatearRut(nuevo.rut), telefono: nuevo.telefono.trim(), email: '', roles: ['codeudor'] } as IPersona);
      await cargarPersonas();
      setAvales((a) => [...a, p.id]);
      setNuevo({ nombre: '', rut: '', telefono: '' });
      setVerForm(false);
    } catch (e) { setErrorAval(mensaje(e)); }
    setTrabajando('');
  };

  const pendientes = abierta?.personas.filter((p) => !p.completa) ?? [];

  return (
    <div id="evPanel" className="tw:flex tw:flex-col tw:gap-3">
      {error && <p role="alert" id="evError" className="tw:m-0 tw:text-[13px] tw:font-semibold tw:text-red-softink">{error}</p>}
      {ev === null && <EstadoVacio compacto texto="Cargando…" />}

      {/* 1. a quién se le pide la documentación */}
      {!abierta?.decision && (
        <section className={CAJA}>
          <h3 className="tw:m-0 tw:text-sm tw:font-bold">Solicitar documentación por WhatsApp</h3>
          <p className="tw:m-0 tw:text-[13px] tw:text-muted">
            Elige a quién se le pide (arrendatario y/o avales). Reciben el mensaje y mandan sus documentos por el mismo chat: contrato de trabajo, cédula por ambos lados, últimas 3 liquidaciones, AFP de 6 meses y Dicom.
          </p>
          <div className="tw:flex tw:flex-col tw:gap-1">
            {titularId && (
              <label className="tw:flex tw:items-center tw:gap-2 tw:text-sm" data-ev-dest="arrendatario">
                <input type="checkbox" checked={titularPedido ? true : conTitular} disabled={titularPedido || !titular?.telefono} onChange={(e) => setConTitular(e.target.checked)} />
                <b>{titular?.nombre ?? 'Arrendatario'}</b> <Badge tono="azul">Arrendatario</Badge>
                <span className="tw:text-muted">{titularPedido ? 'ya se le pidió' : titular?.telefono || 'sin celular: agrégalo en su ficha'}</span>
              </label>
            )}
            {candidatos.map((c) => (
              <label key={c.id} className="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:cursor-pointer" data-ev-dest={c.id}>
                <input type="checkbox" checked={avales.includes(c.id)} disabled={!c.telefono}
                  onChange={(e) => setAvales((a) => (e.target.checked ? [...a, c.id] : a.filter((x) => x !== c.id)))} />
                <b>{c.nombre}</b> <Badge tono="lavanda">Aval</Badge>
                <span className="tw:text-muted">{c.telefono || 'sin celular'}</span>
              </label>
            ))}
            {!titularId && <p className="tw:m-0 tw:text-[13px] tw:text-muted">Este negocio no tiene arrendatario todavía.</p>}
          </div>

          {!verForm ? (
            <div><Boton id="evAvalNuevo" variante="secundario" icono="plus" tamano="sm" onClick={() => setVerForm(true)}>Registrar un aval</Boton></div>
          ) : (
            <div id="evAvalForm" className="tw:rounded-lg tw:bg-lav-soft tw:p-2 tw:flex tw:flex-col tw:gap-2">
              <div className="tw:flex tw:flex-wrap tw:gap-2">
                <Input id="evAvalNombre" etiqueta="Nombre completo" clasesCampo="tw:flex-[2_1_200px]" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
                <Input id="evAvalRut" etiqueta="RUT" clasesCampo="tw:flex-[1_1_130px]" placeholder="12.345.678-5" value={nuevo.rut} onChange={(e) => setNuevo({ ...nuevo, rut: e.target.value })} />
                <Input id="evAvalTel" etiqueta="Celular" clasesCampo="tw:flex-[1_1_140px]" placeholder="+56 9 1234 5678" inputMode="tel" value={nuevo.telefono} onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value })} />
              </div>
              {errorAval && <p role="alert" id="evAvalError" className="tw:m-0 tw:text-[13px] tw:font-semibold tw:text-red-softink">{errorAval}</p>}
              <div className="tw:flex tw:gap-2">
                <Boton id="evAvalAgregar" tamano="sm" cargando={trabajando === 'aval'} disabled={!!trabajando} onClick={registrarAval}>Registrar y seleccionar</Boton>
                <Boton variante="fantasma" tamano="sm" onClick={() => { setVerForm(false); setErrorAval(''); }}>Cancelar</Boton>
              </div>
              <p className="tw:m-0 tw:text-xs tw:text-muted">Queda guardado en Personas como aval; el resto de sus datos se completa después.</p>
            </div>
          )}

          <div>
            <Boton id="evSolicitar" icono="whatsapp" cargando={trabajando === 'solicitar'} disabled={!!trabajando || destinatarios === 0} onClick={solicitar}>
              {destinatarios ? `Enviar solicitud por WhatsApp (${destinatarios} ${destinatarios === 1 ? 'persona' : 'personas'})` : 'Elige a quién enviarla'}
            </Boton>
          </div>
        </section>
      )}

      {/* 2. resumen y porcentaje */}
      {abierta?.analisis && (
        <section id="evResumen" className={CAJA}>
          <div className="tw:flex tw:items-center tw:gap-3 tw:flex-wrap">
            <span className="tw:text-[34px] tw:font-extrabold tw:leading-none" id="evPorcentaje">{abierta.analisis.porcentaje}%</span>
            <Badge tono={TONO[abierta.analisis.nivel]} variante="tactil">Probabilidad {NIVEL[abierta.analisis.nivel]}</Badge>
            {abierta.decision && (
              <Badge tono={abierta.decision.estado === 'aprobada' ? 'verde' : 'rojo'} icono={abierta.decision.estado === 'aprobada' ? 'check' : 'x'}>
                {abierta.decision.estado === 'aprobada' ? 'Aprobada' : 'Rechazada'} por {abierta.decision.por}
              </Badge>
            )}
          </div>
          <p className="tw:m-0 tw:text-sm tw:whitespace-pre-line">{abierta.analisis.resumen}</p>
          <p className="tw:m-0 tw:text-xs tw:text-muted">
            Ayuda para decidir, no una resolución.{abierta.personas.length > 1 ? ' Con avales: 60 % el arrendatario y 40 % el promedio de los avales.' : ''}
            {abierta.analisis.arriendoClp ? ` Arriendo considerado: $${Math.round(abierta.analisis.arriendoClp).toLocaleString('es-CL')}.` : ' No se pudo comparar con el arriendo (falta el precio de la propiedad).'}
          </p>
        </section>
      )}

      {/* 3. lo que mandó cada uno */}
      {abierta?.personas.map((p) => <TarjetaPersona key={p.personaId} p={p} verArchivo={verArchivo} />)}
      {abierta && pendientes.length > 0 && !abierta.decision && (
        <p className="tw:m-0 tw:text-[13px] tw:text-muted" id="evFaltan">Todavía falta documentación de: {pendientes.map((p) => p.nombre).join(', ')}. Puedes decidir igual, pero el puntaje está incompleto.</p>
      )}

      {/* 4. la decisión */}
      {abierta && !abierta.decision && (
        <section className={CAJA}>
          <h3 className="tw:m-0 tw:text-sm tw:font-bold">Tu decisión</h3>
          <Textarea aria-label="Nota de la decisión" id="evNota" rows={2} placeholder="Nota (opcional): por qué apruebas o rechazas" value={nota} onChange={(e) => setNota(e.target.value)} />
          <div className="tw:flex tw:gap-2 tw:flex-wrap">
            <Boton id="evAprobar" variante="exito" icono="check" cargando={trabajando === 'aprobada'} disabled={!!trabajando} onClick={() => decidir('aprobada')}>Aprobar arrendatario</Boton>
            <Boton id="evRechazar" variante="peligro" icono="x" cargando={trabajando === 'rechazada'} disabled={!!trabajando} onClick={() => decidir('rechazada')}>Rechazar</Boton>
            <Boton id="evRecalcular" variante="fantasma" icono="refresh" cargando={trabajando === 'recalcular'} disabled={!!trabajando}
              onClick={() => hacer('recalcular', () => evaluacionService.recalcular(negocioId))}>Recalcular</Boton>
            <Boton id="evActualizar" variante="fantasma" disabled={!!trabajando} onClick={cargar}>Actualizar</Boton>
          </div>
          <p className="tw:m-0 tw:text-xs tw:text-muted">Al aprobar, el paso «Evaluación del arrendatario» queda logrado.</p>
        </section>
      )}
      {abierta?.decision?.nota && <p className="tw:m-0 tw:text-sm"><b>Nota:</b> {abierta.decision.nota}</p>}
    </div>
  );
}

function TarjetaPersona({ p, verArchivo }: { p: IEvalPersona; verArchivo: (personaId: string, n: number) => void }) {
  return (
    <section data-ev-persona={p.personaId} className={CAJA}>
      <div className="tw:flex tw:items-center tw:gap-2 tw:flex-wrap">
        <strong className="tw:text-sm">{p.nombre}</strong>
        <Badge tono={p.rol === 'aval' ? 'lavanda' : 'azul'}>{p.rol === 'aval' ? 'Aval' : 'Arrendatario'}</Badge>
        {p.completa ? <Badge tono="verde" icono="check">Documentación completa</Badge> : <Badge tono="amarillo" punto>Esperando documentos</Badge>}
        {p.analisis && <Badge tono={TONO[p.analisis.nivel]}>{p.analisis.porcentaje}%</Badge>}
      </div>
      <ul className="tw:list-none tw:m-0 tw:p-0 tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-x-4 tw:gap-y-0.5">
        {p.documentos.map((d) => (
          <li key={d.id} className="tw:text-[13px] tw:flex tw:gap-1.5" data-ev-doc={d.id} data-ok={d.ok ? '1' : '0'}>
            <span aria-hidden>{d.ok ? '✅' : '⬜'}</span><span>{d.nombre}{d.detalle ? ` — ${d.detalle}` : ''}</span>
          </li>
        ))}
      </ul>
      {p.archivos.length > 0 && (
        <details open>
          <summary className="tw:cursor-pointer tw:text-[13px] tw:font-semibold">Adjuntos ({p.archivos.length}) y lo que Asset leyó</summary>
          <ul className="tw:list-none tw:m-0 tw:mt-1 tw:p-0 tw:flex tw:flex-col tw:gap-1">
            {p.archivos.map((a) => (
              <li key={a.n} className="tw:text-[13px] tw:flex tw:gap-2 tw:items-start">
                <button type="button" data-ev-archivo={a.n} className="tw:bg-transparent tw:border-0 tw:p-0 tw:text-lav-ink tw:underline tw:cursor-pointer tw:text-[13px] tw:shrink-0" onClick={() => verArchivo(p.personaId, a.n)}>
                  {CLASE[a.clase] ?? 'Documento'}
                </button>
                <span className="tw:text-muted">{a.legible ? a.resumen : 'No se lee bien: se le pidió de nuevo.'}{a.alertas.length ? ` ⚠ ${a.alertas.join(' · ')}` : ''}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {p.analisis && (
        <details>
          <summary className="tw:cursor-pointer tw:text-[13px] tw:font-semibold">Cómo se calculó su puntaje</summary>
          <ul className="tw:list-none tw:m-0 tw:mt-1 tw:p-0 tw:flex tw:flex-col tw:gap-0.5">
            {p.analisis.criterios.map((c) => (
              <li key={c.id} className="tw:text-[13px]"><b>{c.nombre}</b> ({c.puntos}/{c.peso}): <span className="tw:text-muted">{c.detalle}</span></li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
