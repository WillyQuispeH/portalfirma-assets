// Respuesta del proceso principal por IPC (window.pf.<fn>): { ok, data } o { ok: false, error }.
// utils/api.ts entrega solo `data` y lanza un Error si ok es falso.
export interface IRespuesta<T> {
  ok: boolean;
  data?: T;
  error?: string;
}
