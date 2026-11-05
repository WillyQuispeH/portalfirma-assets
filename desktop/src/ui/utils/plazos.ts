// Cálculos de Plazos y vencimientos (sin pantalla; los usan el store y la pantalla): la fecha clave de cada contrato,
// el semáforo, el orden,
// el resumen del informe básico y lo que se le pide a la IA para el informe inteligente.
import type { IAnalisisPlazo, IContratoPlazo, IDocPlazo } from '../store/interfaces/plazo.interface';

const DIA = 86400000;
export const ACCION: Record<string, string> = { termino_anticipado: 'Término anticipado', aviso_no_renovacion: 'Aviso de no renovación', reajuste: 'Reajuste', renovacion: 'Renovación', anexo: 'Anexo', ninguna: 'Sin acción' };
export const fecha = (iso?: string | null) => { try { return iso ? new Date(iso + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; } catch { return '—'; } };
const hoy = () => new Date(new Date().toISOString().slice(0, 10) + 'T12:00:00');
const sumarMeses = (iso: string, m: number) => { const d = new Date(iso + 'T12:00:00'); d.setMonth(d.getMonth() + m); return d.toISOString().slice(0, 10); };
const sumarDias = (iso: string, n: number) => new Date(new Date(iso + 'T12:00:00').getTime() + n * DIA).toISOString().slice(0, 10);

export interface IFechaClave { deadline?: string | null; label: string; end?: string; missed?: boolean; idx?: number }

// Fecha clave de UN contrato: el aviso (si renueva sola) o el término; en indefinidos, el próximo reajuste.
export function fechaClave(a?: IContratoPlazo | null): IFechaClave {
  if (!a) return { label: '' };
  const t = hoy().toISOString().slice(0, 10);
  if (!a.indefinido && a.fecha_termino) {
    let fin = a.fecha_termino; const per = Number(a.periodo_renovacion_meses) || 12;
    if (a.renovacion_automatica) { let n = 0; while (fin < t && n++ < 40) fin = sumarMeses(fin, per); }
    const aviso = Number(a.aviso_dias) || 0;
    if (a.renovacion_automatica && aviso) {
      const limite = sumarDias(fin, -aviso);
      if (limite >= t) return { deadline: limite, label: 'Último día para avisar la no renovación', end: fin };
      return { deadline: fin, label: 'Se renueva sola (ya pasó el plazo de aviso)', end: fin, missed: true };
    }
    return { deadline: fin, label: fin < t ? 'Venció' : 'Vence', end: fin };
  }
  if (a.reajuste?.proxima_fecha) return { deadline: a.reajuste.proxima_fecha, label: 'Próximo reajuste' };
  if (a.encontrado === false) return { deadline: null, label: 'Sin fechas detectadas' };
  return { deadline: null, label: 'Indefinido' };
}

// Un documento puede traer varios contratos: manda la fecha clave más próxima.
export const contratos = (a?: IAnalisisPlazo | null): IContratoPlazo[] => (!a ? [] : Array.isArray(a.contratos) && a.contratos.length ? a.contratos : [a as IContratoPlazo]);
export function fechaClaveDoc(a?: IAnalisisPlazo | null): IFechaClave {
  const l = contratos(a); const ks = l.map((c, i) => ({ ...fechaClave(c), idx: i }));
  const conFecha = ks.filter((k) => k.deadline).sort((x, y) => x.deadline!.localeCompare(y.deadline!));
  const k = conFecha[0] || ks[0] || { deadline: null, label: 'Sin fechas detectadas' };
  if (l.length > 1) k.label += ` · contrato ${(k.idx ?? 0) + 1} de ${l.length}`;
  return k;
}

export const lectura = (it: IDocPlazo) => it.analysis || it.basic || null; // el inteligente, si existe; si no, el básico

// [texto, color] del semáforo: rojo 30 días o menos, amarillo hasta 90, verde más de 90 o indefinido
export function semaforo(it: IDocPlazo): [string, string] {
  if (it.status !== 'done') return ['', 'muted'];
  if (!it.deadline) { const sin = /Sin fechas/.test(it.deadlineLabel || ''); return [sin ? 'Sin fechas' : 'Sin vencimiento', sin ? 'muted' : 'ok']; }
  const d = Math.round((new Date(it.deadline + 'T12:00:00').getTime() - hoy().getTime()) / DIA);
  if (d < 0) return [`Hace ${-d} día${d === -1 ? '' : 's'}`, 'bad'];
  if (d <= 30) return [d === 0 ? 'Hoy' : `En ${d} día${d === 1 ? '' : 's'}`, 'bad'];
  if (d <= 90) return [`En ${d} días`, 'wait'];
  return [`En ${d} días`, 'ok'];
}
export function orden(a: IDocPlazo, b: IDocPlazo) {
  const rango = (x: IDocPlazo) => (x.status !== 'done' ? 3 : x.deadline ? 0 : 2);
  return rango(a) - rango(b) || String(a.deadline || '9999').localeCompare(String(b.deadline || '9999')) || String(a.name).localeCompare(String(b.name));
}

// Resumen del informe básico, armado con los datos encontrados
export function resumenBasico(l: IContratoPlazo[]): string {
  const f = l.filter((x) => x.encontrado !== false);
  if (!f.length) return 'La lectura automática no encontró fechas en este documento. El informe inteligente puede leerlo con más detalle.';
  const uno = (x: IContratoPlazo) => (x.indefinido ? 'de duración indefinida'
    : `${x.plazo ? 'por ' + x.plazo : ''}${x.fecha_inicio ? ' desde el ' + fecha(x.fecha_inicio) : ''}${x.renovacion_automatica ? `, se renueva sola${x.periodo_renovacion_meses ? ` cada ${x.periodo_renovacion_meses} meses` : ''}` : ''}${x.aviso_dias ? ` y hay que avisar con ${x.aviso_dias} días de anticipación para terminarlo` : ''}`);
  return l.length > 1 ? `Este documento trae ${l.length} contratos. ` + l.map((x, i) => `Contrato ${i + 1}: ${uno(x)}.`).join(' ') : `Contrato ${uno(f[0])}.`;
}

// lo que se le pide a la IA para el informe inteligente (el mismo texto de antes)
export const PEDIDO = (nombre: string, texto: string, basico?: IAnalisisPlazo | null) => `PLAZOS
Archivo: ${nombre}
Fecha de hoy: ${new Date().toISOString().slice(0, 10)}
Analiza este documento (derecho chileno) para un sistema de recordatorio de plazos. Un mismo PDF puede traer VARIOS contratos distintos: devuelve uno por cada contrato en "contratos". Devuelve SOLO un objeto JSON:
{"tipo": "tipo de documento (ej. Contrato de arrendamiento)",
 "resumen": "2 o 3 frases sobre la situación de los plazos, considerando la fecha de hoy",
 "contratos": [{"titulo": "identificación breve (ej. Arriendo Calle Nueva 120, depto 1411)",
   "partes": [{"rol": "Arrendador|Arrendatario|Propietario|Aval|…", "nombre": "...", "rut": "...", "domicilio": "...", "representante": "nombre y RUT si es persona jurídica o actúa por otro, o null"}],
   "objeto": "qué se contrata, con la dirección o identificación del bien", "monto": "precio o renta tal como aparece, o null",
   "fecha_inicio": "YYYY-MM-DD o null", "plazo": "texto (ej. 12 meses) o indefinido", "indefinido": true/false,
   "fecha_termino": "YYYY-MM-DD o null", "renovacion_automatica": true/false, "periodo_renovacion_meses": número o null,
   "aviso_dias": número o null, "reajuste": {"tipo": "IPC|UF|otro", "periodicidad_meses": número, "proxima_fecha": "YYYY-MM-DD"} o null}],
 "acciones": [{"contrato": índice (desde 0) del contrato al que se refiere, "tipo": "termino_anticipado|aviso_no_renovacion|reajuste|renovacion|anexo|ninguna", "titulo": "nombre del documento a redactar", "motivo": "por qué conviene y hasta cuándo", "urgente": true/false}]}
Reglas: no inventes datos; si algo no está usa null. Distingue a quien firma como arrendador (o su representante o corredor) del propietario del bien: el propietario va con rol "Propietario". Un contrato con plazo fijo y renovación automática NO es indefinido. Ordena las acciones de la más conveniente a la menos. Si no hay nada que hacer, una sola acción "ninguna" con título "Déjalo así". No sugieras pagarés
${basico ? `Lectura automática previa (puede tener errores, verifícala contra el texto): ${JSON.stringify((basico.contratos || []).map(({ encontrado: _e, ...c }) => c))}\n` : ''}Documento:
<<<
${texto}
>>>`;

// lo que se le pide a la IA para redactar el documento sugerido, con los datos del contrato al que se refiere
export function pedidoRedaccion(it: IDocPlazo, s: { contrato?: number; titulo: string; motivo?: string }) {
  const todo = it.analysis!; const l = contratos(todo);
  const a = l[Number.isInteger(s.contrato) && l[s.contrato!] ? s.contrato! : 0];
  const fin = l.length === 1 ? it.end || a.fecha_termino : fechaClave(a).end || a.fecha_termino;
  const partes = (a.partes || []).map((p) => `${p.rol || 'Parte'}: ${p.nombre || '[NOMBRE]'}${p.rut ? ', RUT ' + p.rut : ''}${p.domicilio ? ', domicilio ' + p.domicilio : ''}${p.representante ? ', representada por ' + p.representante : ''}`).join('; ');
  return `${s.titulo}, referido al ${todo.tipo || 'contrato'} de fecha ${a.fecha_inicio || '[FECHA DEL CONTRATO]'}.
Partes del contrato original (usa estos datos como "valor" de los campos): ${partes}.
Objeto del contrato: ${a.objeto || '[OBJETO]'}.${a.monto ? ` Precio o renta vigente: ${a.monto}.` : ''}
Plazo: ${a.plazo || ''}${fin ? `, término el ${fin}` : ''}${a.renovacion_automatica ? `, con renovación automática${a.periodo_renovacion_meses ? ` cada ${a.periodo_renovacion_meses} meses` : ''}` : ''}${a.aviso_dias ? `, aviso de ${a.aviso_dias} días` : ''}.${a.reajuste ? ` Reajuste: ${a.reajuste.tipo}${a.reajuste.periodicidad_meses ? ` cada ${a.reajuste.periodicidad_meses} meses` : ''}.` : ''}
Motivo: ${s.motivo || ''}
Redacta el documento completo para que lo firmen las partes que correspondan, citando el contrato original.`;
}
