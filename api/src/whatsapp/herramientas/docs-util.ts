// Ayudas de las herramientas de documentos y firmas del servidor (documentos.ts, documentos-firmas.ts).
import { HttpException } from '@nestjs/common';
import type { UsuarioToken } from '../../auth/usuario-actual';
import type { CtxHerr } from './tipos';

export type Rec = Record<string, unknown>;

/** un error que se le dice al corredor tal cual (dato inválido, falta algo): las herramientas lo devuelven como { error } */
export class ErrorDoc extends Error {}

/** el usuario del WhatsApp como lo esperan los servicios de documentos (los mismos que usa la app por la API) */
export const tokenDe = (c: CtxHerr): UsuarioToken => ({
  sub: c.usuarioId,
  corredoraId: c.corredoraId,
  rol: c.admin ? 'ADMIN' : 'CORREDOR',
  sid: 'whatsapp',
});

/** el mensaje de un error (de Nest o común) para decírselo al corredor */
export const mensajeError = (e: unknown) => {
  if (e instanceof HttpException) {
    const r = e.getResponse();
    const m = typeof r === 'object' && r ? (r as { message?: unknown }).message : null;
    return Array.isArray(m) ? m.join(' ') : typeof m === 'string' ? m : e.message;
  }
  return (e as Error)?.message || 'Algo falló.';
};

export const txt = (v: unknown, max = 2000) => String(v ?? '').trim().slice(0, max);
export const hay = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== '';

/** un número escrito por una persona («1.500.000», «2,5», 100) */
export const numero = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v ?? '').replace(/[^\d.,-]/g, '');
  if (!s) return null;
  s = /^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** sí/no escrito por una persona o la IA; undefined si no se dijo */
export const siNo = (v: unknown): boolean | undefined => {
  if (v === true || v === false) return v;
  const t = txt(v, 20).toLowerCase();
  if (!t) return undefined;
  if (/^(si|sí|s|true|1|yes)$/.test(t)) return true;
  if (/^(no|n|false|0)$/.test(t)) return false;
  return undefined;
};

export const fechaOk = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(txt(v, 10));
export const emailOk = (e: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(txt(e, 200));

/** un texto de la entrada que debe ser fecha AAAA-MM-DD (o vacío) */
export const fechaEntrada = (v: unknown, que: string): string | undefined => {
  if (!hay(v)) return undefined;
  if (!fechaOk(v)) throw new ErrorDoc(`${que}: la fecha debe ir como AAAA-MM-DD (por ejemplo 2026-12-01).`);
  return txt(v, 10);
};

/** una entrada que debe ser una de estas opciones (o vacía) */
export const opcion = (v: unknown, validas: string[], que: string): string | undefined => {
  if (!hay(v)) return undefined;
  const t = txt(v, 60).toLowerCase().replace(/\s+/g, '_');
  if (!validas.includes(t)) throw new ErrorDoc(`${que}: debe ser ${validas.join(', ')}.`);
  return t;
};

/** un número positivo de la entrada (o undefined si no vino) */
export const positivo = (v: unknown, que: string, max = 1e12): number | undefined => {
  if (!hay(v)) return undefined;
  const n = numero(v);
  if (n == null || n <= 0 || n > max) throw new ErrorDoc(`${que}: debe ser un número mayor que cero.`);
  return n;
};

/** el primer nombre («Ana María Rojas» → «Ana») */
export const primerNombre = (n: string) => txt(n, 120).split(/\s+/)[0] || '';

/** celular chileno con código de país para mostrar */
export const telefonoOk = (t: unknown) => String(t ?? '').replace(/\D/g, '').length >= 8;
