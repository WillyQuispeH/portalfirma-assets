// Instancia única de acceso al proceso principal (en la guía, la instancia de Axios).
//
// En Asset no hay HTTP: cada llamada va por IPC con window.pf.<fn> (src/preload.js).
// Se reutiliza api() de src/renderer/app.js, que devuelve r.data, lanza un Error
// si r.ok es falso y maneja la sesión vencida. Todos los services pasan por aquí.
export function api<T>(fn: string, ...args: unknown[]): Promise<T> {
  if (typeof window.api !== 'function') return Promise.reject(new Error('api() de app.js no está cargada'));
  return window.api(fn, ...args) as Promise<T>;
}

// Igual que api(), pero sin efectos en pantalla: si la sesión venció no abre el inicio de sesión.
// Para tareas en segundo plano (p. ej. sincronizar reservas al abrir la agenda).
export async function apiSilenciosa<T>(fn: string, ...args: unknown[]): Promise<T> {
  const r = await window.pf[fn](...args);
  if (!r.ok) throw new Error(r.error);
  return r.data as T;
}

// La respuesta tal cual ({ ok, data, error, code }), para quien necesita el código de error
// (p. ej. el Agente distingue la sesión vencida, NEEDS_LOGIN, de los demás errores).
export function apiCruda<T>(fn: string, ...args: unknown[]): Promise<{ ok: boolean; data?: T; error?: string; code?: string }> {
  return window.pf[fn](...args) as Promise<{ ok: boolean; data?: T; error?: string; code?: string }>;
}
