// Espera a que la API de Asset responda (GET /v1/salud con la base conectada) antes de abrir la app de escritorio.
// Lo usa `yarn dev:api` (start-dev.ps1 lo corre en su panel): así el ingreso no parte con «No se pudo conectar».
// URL: PF_ASSET_API o http://localhost:3000/v1. Se rinde a los 3 minutos (la app abre igual y deja reintentar).
const base = (process.env.PF_ASSET_API || 'http://localhost:3000/v1').replace(/\/+$/, '');
const limite = Date.now() + 3 * 60 * 1000;

(async () => {
  console.log(`[desktop] esperando la API de Asset en ${base} ...`);
  for (;;) {
    try {
      const r = await fetch(base + '/salud', { signal: AbortSignal.timeout(2000) });
      if (r.ok && (await r.json()).db) break;
    } catch {}
    if (Date.now() > limite) {
      console.warn('[desktop] la API no respondió en 3 minutos: abro la app igual.');
      break;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log('[desktop] API lista.');
})();
