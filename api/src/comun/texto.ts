// Utilidades de texto compartidas: búsqueda normalizada y RUT chileno.

/** Minúsculas, sin tildes ni espacios repetidos: lo que se guarda en `busqueda` y lo que se compara al buscar. */
export const normalizar = (...partes: (string | null | undefined)[]) =>
  partes.filter(Boolean).join(' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** RUT sin puntos ni guion, con el dígito verificador en mayúscula (12.345.678-k → 12345678K). */
type Dato = string | number | null | undefined;

export const limpiarRut = (r: Dato) =>
  String(r ?? '')
    .replace(/[^0-9kK]/g, '')
    .toUpperCase();

export function rutValido(r: Dato): boolean {
  const c = limpiarRut(r);
  if (c.length < 2) return false;
  const cuerpo = c.slice(0, -1);
  const dv = c.slice(-1);
  let suma = 0;
  let mul = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const res = 11 - (suma % 11);
  return dv === (res === 11 ? '0' : res === 10 ? 'K' : String(res));
}

/** 12345678K → 12.345.678-K */
export const formatearRut = (r: Dato) => {
  const c = limpiarRut(r);
  return c.length < 2 ? String(r ?? '') : c.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + c.slice(-1);
};

/** Texto opcional: recortado; vacío → null. */
export const texto = (v: Dato, max = 2000) => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
};

/** Condición de búsqueda: cada palabra debe aparecer (en cualquier orden) en el texto normalizado `busqueda`. */
export const palabras = (q: string) =>
  normalizar(q)
    .split(' ')
    .filter(Boolean)
    .slice(0, 8)
    .map((w) => ({ busqueda: { contains: w } }));
