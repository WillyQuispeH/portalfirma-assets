// Evaluación del arrendatario y de sus N avales (modal-125). El corredor:
//  1. pide la documentación por WhatsApp (plantilla aprobada) al arrendatario y a cada aval que elija;
//  2. ve, por persona, qué documentos llegaron, el resumen que hizo la IA de cada uno y el puntaje de 100;
//  3. ve el porcentaje de aprobación global y DECIDE (aprobar o rechazar). El porcentaje es una ayuda, no una resolución.
// El servidor hace todo el trabajo (api/src/whatsapp/evaluacion.ts); esta ventana pide, muestra y deja decidir.
// Los id (#evPanel, #evSolicitar, #evAprobar, #evRechazar, [data-ev-aval], [data-ev-persona]) los usan las pruebas.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '../../ui/Modal';
import Boton from '../../ui/Boton';
import Badge from '../../ui/Badge';
import Textarea from '../../ui/Textarea';
import EstadoVacio from '../../ui/EstadoVacio';
import { evaluacionService } from '../../../store/services/evaluacion.service';
import { propiedadService } from '../../../store/services/propiedad.service';
import { api } from '../../../utils/api';
import type { IEvaluacion, IEvalPersona, TEvaluacionRespuesta } from '../../../store/interfaces/evaluacion.interface';
import type { IPersona } from '../../../store/interfaces/persona.interface';

const TONO = { alto: 'verde', medio: 'amarillo', bajo: 'rojo' } as const;
const NIVEL = { alto: 'Alto', medio: 'Medio', bajo: 'Bajo' } as const;
const CLASE: Record<string, string> = {
  contrato_trabajo: 'Contrato de trabajo', cedula_frente: 'Cédula (frente)', cedula_reverso: 'Cédula (reverso)', cedula_ambas: 'Cédula',
  liquidacion: 'Liquidación', afp: 'Certificado AFP', dicom: 'Informe Dicom', otro: 'No reconocido',
};
const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function EvaluacionArriendo({ negocioId, onCerrar }: { negocioId: string; onCerrar: () => void }) {
  const [ev, setEv] = useState<TEvaluacionRespuesta | null>(null);
  const [personas, setPersonas] = useState<IPersona[]>([]);
  const [titularId, setTitularId] = useState<string | null>(null);
  const [avales, setAvales] = useState<string[]>([]);
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');
  const [trabajando, setTrabajando] = useState('');

  const cargar = useCallback(async () => {
    try { setEv(await evaluacionService.ver(negocioId)); setError(''); } catch (e) { setError(mensaje(e)); setEv({ vacia: true }); }
  }, [negocioId]);
  useEffect(() => {
    cargar();
    propiedadService.getAll().then((c) => setPersonas(c.personas)).catch(() => undefined);
    api<{ clienteId?: string | null }>('negObtener', negocioId).then((n) => setTitularId(n.clienteId ?? null)).catch(() => undefined);
  }, [cargar, negocioId]);

  const pedidos = useMemo(() => new Set(ev && !ev.vacia ? ev.personas.map((p) => p.personaId) : []), [ev]);
  const titular = personas.find((p) => p.id === titularId);
  const candidatos = personas.filter((p) => p.id !== titularId && !pedidos.has(p.id) && !p.reservado);

  const hacer = async (que: string, f: () => Promise<IEvaluacion>) => {
    setTrabajando(que); setError('');
    try { setEv(await f()); } catch (e) { setError(mensaje(e)); }
    setTrabajando('');
  };
  const solicitar = () => hacer('solicitar', async () => { const r = await evaluacionService.solicitar(negocioId, avales); setAvales([]); return r; });
  const decidir = (d: 'aprobada' | 'rechazada') => hacer(d, () => evaluacionService.decidir(negocioId, d, nota));
  const verArchivo = async (personaId: string, n: number) => {
    try { const r = await evaluacionService.archivo(negocioId, personaId, n); window.open(r.url, '_blank'); } catch (e) { setError(mensaje(e)); }
  };

  const abierta = ev && !ev.vacia ? ev : null;
  const pendientes = abierta?.personas.filter((p) => !p.completa) ?? [];

  return (
    <Modal clave="modal-125" abierto onCerrar={onCerrar} tamano="xl" icono="listCheck" titulo="Evaluación del arrendatario" id="evPanel"
      descripcion="Pide los documentos por WhatsApp al arrendatario y a sus avales; Asset los lee y arma un resumen con un porcentaje. La decisión es tuya.">
      <div className="tw:flex tw:flex-col tw:gap-4">
        {error && <p role="alert" id="evError" className="tw:m-0 tw:text-[13px] tw:font-semibold tw:text-red-softink">{error}</p>}
        {ev === null && <EstadoVacio compacto texto="Cargando…" />}

        {abierta?.analisis && (
          <section id="evResumen" className="tw:rounded-xl tw:border tw:border-solid tw:border-edge tw:p-3 tw:flex tw:flex-col tw:gap-2">
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

        {abierta?.personas.map((p) => <TarjetaPersona key={p.personaId} p={p} verArchivo={verArchivo} />)}

        {abierta && pendientes.length > 0 && !abierta.decision && (
          <p className="tw:m-0 tw:text-[13px] tw:text-muted" id="evFaltan">Todavía falta documentación de: {pendientes.map((p) => p.nombre).join(', ')}. Puedes decidir igual, pero el puntaje está incompleto.</p>
        )}

        {/* pedir documentos: la primera vez al arrendatario (y a los avales que elijas); después, a más avales */}
        {!abierta?.decision && (
          <section className="tw:rounded-xl tw:border tw:border-solid tw:border-edge tw:p-3 tw:flex tw:flex-col tw:gap-2">
            <h3 className="tw:m-0 tw:text-sm tw:font-bold">{abierta ? 'Pedir los documentos a otro aval' : 'Solicitar documentación por WhatsApp'}</h3>
            <p className="tw:m-0 tw:text-[13px] tw:text-muted">
              {abierta ? 'Los avales que ya recibieron el mensaje no aparecen aquí.' : `Se le escribe a ${titular?.nombre ?? 'el arrendatario'}${titular?.telefono ? ` (${titular.telefono})` : ''} y a los avales que marques. Piden: contrato de trabajo, cédula por ambos lados, últimas 3 liquidaciones, AFP de 6 meses y Dicom.`}
            </p>
            {candidatos.length > 0 && (
              <fieldset className="tw:border-0 tw:p-0 tw:m-0 tw:flex tw:flex-col tw:gap-1 tw:max-h-[170px] tw:overflow-auto">
                <legend className="tw:text-xs tw:font-semibold tw:mb-1">Avales (opcional, los que quieras)</legend>
                {candidatos.map((c) => (
                  <label key={c.id} className="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:cursor-pointer">
                    <input type="checkbox" data-ev-aval={c.id} checked={avales.includes(c.id)} disabled={!c.telefono}
                      onChange={(e) => setAvales((a) => (e.target.checked ? [...a, c.id] : a.filter((x) => x !== c.id)))} />
                    {c.nombre}{c.telefono ? <span className="tw:text-muted"> · {c.telefono}</span> : <span className="tw:text-muted"> · sin celular</span>}
                  </label>
                ))}
              </fieldset>
            )}
            <div>
              <Boton id="evSolicitar" icono="whatsapp" cargando={trabajando === 'solicitar'} disabled={!!trabajando || (!!abierta && avales.length === 0)} onClick={solicitar}>
                {abierta ? 'Pedir a los avales marcados' : avales.length ? `Solicitar documentación (${avales.length + 1} personas)` : 'Solicitar documentación'}
              </Boton>
            </div>
          </section>
        )}

        {abierta && !abierta.decision && (
          <section className="tw:rounded-xl tw:border tw:border-solid tw:border-edge tw:p-3 tw:flex tw:flex-col tw:gap-2">
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
    </Modal>
  );
}

function TarjetaPersona({ p, verArchivo }: { p: IEvalPersona; verArchivo: (personaId: string, n: number) => void }) {
  return (
    <section data-ev-persona={p.personaId} className="tw:rounded-xl tw:border tw:border-solid tw:border-edge tw:p-3 tw:flex tw:flex-col tw:gap-2">
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
        <details>
          <summary className="tw:cursor-pointer tw:text-[13px] tw:font-semibold">Archivos recibidos ({p.archivos.length}) y lo que Asset leyó</summary>
          <ul className="tw:list-none tw:m-0 tw:mt-1 tw:p-0 tw:flex tw:flex-col tw:gap-1">
            {p.archivos.map((a) => (
              <li key={a.n} className="tw:text-[13px] tw:flex tw:gap-2 tw:items-start">
                <button type="button" className="tw:bg-transparent tw:border-0 tw:p-0 tw:text-lav-ink tw:underline tw:cursor-pointer tw:text-[13px] tw:shrink-0" onClick={() => verArchivo(p.personaId, a.n)}>
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
