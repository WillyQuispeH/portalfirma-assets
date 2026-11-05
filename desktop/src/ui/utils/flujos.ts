// Reglas de Flujos documentales (sin pantalla): unir las columnas de la nómina con los datos del modelo, nombres
// de columna, la nómina de ejemplo y el estado de cada fila de una ejecución (cola → operación → firmas).
import type { ICampoModelo, IEjecucion, IFilaEjecucion, IModelo, INomina, TRegla } from '../store/interfaces/flujo.interface';
import type { IColaMasiva } from '../store/interfaces/masiva.interface';

export const normalizar = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
export const plural = (n: number, a: string, b: string) => `${n} ${n === 1 ? a : b}`;
export const fechaHora = (iso: string) => { try { return new Date(iso).toLocaleString('es-CL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
const bonito = (t: string) => (t === t.toUpperCase() ? t.toLowerCase().replace(/^\S/, (c) => c.toUpperCase()).replace(/\brut\b/g, 'RUT').replace(/\buf\b/g, 'UF').replace(/\bdom\b/g, 'DOM') : t);
export const etiquetaCorta = (f: ICampoModelo) => bonito(f.label.replace(/\s*\(.*$/, '').trim());
export const nombreColumna = (f: ICampoModelo) => (f.group === 'documento' ? etiquetaCorta(f) : `${f.groupLabel} - ${etiquetaCorta(f)}`);

// Une solo las columnas que reconoce; respeta las reglas guardadas que siguen sirviendo
export function unirColumnas(m: IModelo, nomina: INomina, reglas: Record<string, TRegla>): Record<string, TRegla> {
  const out = { ...reglas }; const hs = nomina.headers.map((h) => ({ h, n: normalizar(h) }));
  for (const f of m.fields) {
    const cur = out[f.id];
    if (cur && (cur.type !== 'col' || hs.some((x) => x.h === cur.header))) continue;
    const cands = [nombreColumna(f), `${f.groupLabel} ${f.label}`, f.label, `${f.key} ${f.group}`, f.key].map(normalizar);
    let mejor = hs.find((x) => cands.slice(0, 2).includes(x.n));
    const repetido = m.fields.filter((g) => normalizar(g.label) === normalizar(f.label)).length > 1; // «Nombre» se repite en cada firmante
    if (!mejor && !repetido) mejor = hs.find((x) => cands.slice(2).includes(x.n));
    if (!mejor) mejor = hs.find((x) => x.n.includes(normalizar(f.groupLabel)) && x.n.includes(normalizar(etiquetaCorta(f))));
    if (!mejor && !repetido) mejor = hs.find((x) => x.n === normalizar(etiquetaCorta(f)) || (normalizar(etiquetaCorta(f)).length > 4 && x.n.includes(normalizar(etiquetaCorta(f)))));
    if (mejor) out[f.id] = { type: 'col', header: mejor.h };
    else if (/^fecha/i.test(f.key) && f.group === 'documento') out[f.id] = { type: 'today' };
    else if (cur?.type === 'col') delete out[f.id];
  }
  return out;
}

// La regla con nombre de columna se traduce a su posición en esta nómina
export function reglasResueltas(reglas: Record<string, TRegla>, nomina: INomina) {
  const out: Record<string, TRegla | { type: 'col'; col: number }> = {};
  for (const [id, r] of Object.entries(reglas)) {
    if (r.type === 'col') { const i = nomina.headers.indexOf(r.header); if (i >= 0) out[id] = { type: 'col', col: i }; } else out[id] = r;
  }
  return out;
}

// Nómina de ejemplo (CSV para Excel, con BOM) con una columna por dato que no es fijo
export function nominaEjemplo(m: IModelo) {
  const cols = [...new Set(m.fields.filter((f) => !/^(ciudad|fecha)/i.test(f.key) || f.group !== 'documento').map(nombreColumna))];
  const csv = '﻿' + cols.map((c) => `"${c.replace(/"/g, '""')}"`).join(';') + '\r\n';
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `Nómina - ${m.nombre.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 60)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export type TOps = { items: { operation: number | string; stage?: string; status?: string; signers?: number; signed?: number }[] } | null;
function estadoOp(op: number | string, ops: TOps): [string, string] {
  const o = ops?.items?.find((x) => String(x.operation) === String(op));
  if (!o) return [`Enviado · N° ${op}`, 'ok'];
  if (o.stage === 'finalized' || o.status === 'finalized') return o.signers && (o.signed ?? 0) < o.signers ? [`Cerrada sin todas las firmas · N° ${op}`, 'wait'] : [`Firmado · N° ${op}`, 'ok'];
  return [`Firmando ${o.signed ?? 0}/${o.signers ?? '?'} · N° ${op}`, 'run'];
}
const COLA: Record<string, [string, string]> = {
  queued: ['En cola', 'muted'], converting: ['Preparando', 'run'], uploading: ['Subiendo', 'run'], analyzing: ['Revisando', 'run'], ready: ['Listo para enviar', 'ok'],
  needs_data: ['Faltan datos', 'wait'], sending: ['Enviando', 'run'], error: ['Error', 'bad'], send_error: ['No se envió', 'bad'], skipped: ['Omitido', 'muted'],
};
// [texto, clase] de una fila de una ejecución
export function estadoFila(fila: IFilaEjecucion, cola: IColaMasiva, ops: TOps): [string, string] {
  const it = cola.items.find((x) => x.id === fila.bulkId || ((x as { flow?: { runId?: string } }).flow?.runId && x.path === fila.file));
  if (!it) return fila.operation ? estadoOp(fila.operation, ops) : ['Fuera de la cola', 'muted'];
  if (it.status === 'sent') return estadoOp(it.operation!, ops);
  return COLA[it.status] || [it.status, 'muted'];
}
export function conteoEjecucion(run: IEjecucion, cola: IColaMasiva, ops: TOps) {
  const c = { ready: 0, sent: 0, signed: 0, error: 0, busy: 0 };
  for (const f of run.rows || []) {
    const [l, cl] = estadoFila(f, cola, ops);
    if (/^Firmado/.test(l)) c.signed++; else if (/Enviado|Firmando|Cerrada/.test(l)) c.sent++; else if (/Listo/.test(l)) c.ready++; else if (cl === 'bad' || /Faltan/.test(l)) c.error++; else if (cl === 'run' || /cola/.test(l)) c.busy++;
  }
  return c;
}
