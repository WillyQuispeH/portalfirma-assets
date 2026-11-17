// yarn publica: abre un túnel de ngrok a la API local (http://localhost:3000) y pone la dirección pública en api/.env
// (API_URL_PUBLICA). Sirve para lo que necesita una dirección https pública en desarrollo: Mercado Libre (su redirección
// exige https), los avisos de wechatia y el feed de los portales. Google acepta http://localhost, así que para Google no hace falta.
//  · Si ya hay un túnel de ngrok a ese puerto (panel de ngrok en localhost:4040), lo reutiliza.
//  · Si ngrok YA está abierto para otra cosa (la cuenta gratis solo deja un ngrok a la vez), le agrega un túnel «asset-api» por su API
//    local en vez de abrir otro ngrok, y al cerrar quita solo ese túnel (el otro sigue como estaba).
//  · NGROK_DOMINIO (en api/.env, opcional): tu dominio fijo gratis de ngrok (xxx.ngrok-free.app). Con él la dirección NO cambia entre
//    sesiones y no hay que volver a registrar la redirección en Google o Mercado Libre. Sin él, ngrok da una dirección nueva cada vez.
//  · Crea api/.publica-lista cuando la dirección ya está en el .env: dev.js (--esperar-publica) espera ese archivo antes de levantar la API.
//  · Al cerrar (Ctrl+C) deja API_URL_PUBLICA como estaba y cierra el túnel. Si la ventana se cierra a la fuerza (sin Ctrl+C) no alcanza a
//    hacerlo: `yarn publica --restaurar` (lo corre start-dev.ps1 -Detener) deja el .env en la dirección local.
// Requiere ngrok instalado y con su token: winget install ngrok.ngrok  y  ngrok config add-authtoken <token>
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const archivoEnv = path.join(raiz, '.env');
const marca = path.join(raiz, '.publica-lista');
const leerEnv = () => fs.readFileSync(archivoEnv, 'utf8');
// (solo espacios y tabuladores: un valor vacío no debe comerse la línea siguiente)
const valor = (txt, k) => new RegExp(`^[ \\t]*${k}[ \\t]*=[ \\t]*(.*?)[ \\t]*\\r?$`, 'm').exec(txt)?.[1] ?? '';
const puerto = Number(valor(leerEnv(), 'PORT') || 3000);
const dominio = valor(leerEnv(), 'NGROK_DOMINIO').replace(/^https?:\/\//, '').replace(/\/+$/, '');
const local = `http://localhost:${puerto}`;
// lo que había antes: solo si era una dirección local (si quedó una de ngrok de una sesión que no se cerró bien, se vuelve a la local)
const previa = valor(leerEnv(), 'API_URL_PUBLICA');
const original = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(previa) ? previa : local;
const AGENTE = (process.env.NGROK_API || 'http://127.0.0.1:4040').replace(/\/+$/, '');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** escribe API_URL_PUBLICA en el .env (conserva el resto y los saltos de línea) */
function ponerUrl(url) {
  let s = leerEnv(); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  s = /^API_URL_PUBLICA=.*$/m.test(s) ? s.replace(/^API_URL_PUBLICA=.*$/m, `API_URL_PUBLICA=${url}`) : `${s.replace(/\n*$/, '\n')}API_URL_PUBLICA=${url}\n`;
  fs.writeFileSync(archivoEnv, crlf ? s.replace(/\n/g, '\r\n') : s);
}

/** el túnel https que ya apunta a nuestro puerto, según el panel local de ngrok */
async function tunelActivo() {
  try {
    const r = await fetch(`${AGENTE}/api/tunnels`, { signal: AbortSignal.timeout(1500) });
    const j = await r.json();
    return (j.tunnels || []).find((t) => t.public_url?.startsWith('https://') && new RegExp(`:${puerto}$`).test(t.config?.addr || ''))?.public_url ?? null;
  } catch { return null; }
}

/** ¿hay un ngrok abierto (para otra cosa)? Responde su API local. */
async function hayAgente() {
  try { return (await fetch(`${AGENTE}/api/tunnels`, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; }
}

let tunelAgregado = false;
/** le agrega un túnel al ngrok que ya está abierto (por su API local); devuelve la dirección pública */
async function agregarAlAgente() {
  const r = await fetch(`${AGENTE}/api/tunnels`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({ name: 'asset-api', proto: 'http', addr: String(puerto), ...(dominio ? { domain: dominio } : {}) }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.public_url) throw new Error(j.msg || j.details?.err || `ngrok respondió ${r.status}`);
  tunelAgregado = true;
  return String(j.public_url).replace(/^http:/, 'https:');
}

let hijo = null; let cerrando = false;
function cerrar(code = 0) {
  if (cerrando) return; cerrando = true;
  try { ponerUrl(original); } catch { /* el .env ya no está */ }
  try { fs.rmSync(marca, { force: true }); } catch { /* ya no está */ }
  if (hijo) hijo.kill();
  if (tunelAgregado) fetch(`${AGENTE}/api/tunnels/asset-api`, { method: 'DELETE', signal: AbortSignal.timeout(3000) }).catch(() => null).finally(() => process.exit(code));
  else process.exit(code);
}
process.on('SIGINT', () => cerrar(0));
process.on('SIGTERM', () => cerrar(0));
process.on('exit', () => { try { fs.rmSync(marca, { force: true }); } catch { /* ya no está */ } });

(async () => {
  if (process.argv.includes('--restaurar')) {
    ponerUrl(original); fs.rmSync(marca, { force: true });
    console.log(`[publica] API_URL_PUBLICA quedó en ${original}`); return;
  }
  fs.rmSync(marca, { force: true });
  let url = await tunelActivo();
  if (url) console.log(`[publica] ya hay un túnel de ngrok a :${puerto}: lo reutilizo.`);
  else if (await hayAgente()) {
    console.log('[publica] ngrok ya está abierto (para otra cosa): le agrego el túnel de la API.');
    try { url = await agregarAlAgente(); } catch (e) { console.error(`[publica] no pude agregar el túnel al ngrok abierto: ${e.message}`); process.exit(1); }
  } else {
    const args = ['http', String(puerto), '--log=stdout', ...(dominio ? [`--url=https://${dominio}`] : [])];
    let salida = '';
    try {
      hijo = spawn('ngrok', args, { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
    } catch (e) { console.error(`[publica] no pude abrir ngrok: ${e.message}`); process.exit(1); }
    hijo.stdout.on('data', (d) => { salida += d; }); hijo.stderr.on('data', (d) => { salida += d; });
    let murio = false; hijo.on('exit', (c) => { murio = true; if (!cerrando && !url) { console.error(`[publica] ngrok se cerró (código ${c}). ${/4018|authtoken/i.test(salida) ? 'Falta su token: ngrok config add-authtoken <token> (lo ves en dashboard.ngrok.com).' : /not recognized|no se reconoce|ENOENT/i.test(salida) ? 'No está instalado: winget install ngrok.ngrok' : salida.split('\n').filter((l) => /err|ERR/.test(l)).slice(-3).join('\n')}`); process.exit(1); } });
    for (let i = 0; i < 60 && !url && !murio; i++) { await esperar(500); url = await tunelActivo(); }
    if (!url) { console.error('[publica] ngrok no abrió el túnel a tiempo.\n' + salida.split('\n').slice(-6).join('\n')); cerrar(1); return; }
  }
  ponerUrl(url);
  fs.writeFileSync(marca, url);
  console.log(`[publica] ${url}  →  http://localhost:${puerto}   (API_URL_PUBLICA quedó en api/.env)`);
  console.log('[publica] redirecciones para registrar en Mercado Libre / Google (con dirección pública):');
  console.log(`          ${url}/v1/conexiones/callback/mercadolibre`);
  console.log(`          ${url}/v1/conexiones/callback/google`);
  console.log(`          ${url}/v1/conexiones/callback/google_corredora`);
  if (!dominio) console.log('[publica] OJO: sin NGROK_DOMINIO la dirección cambia cada vez; ngrok da un dominio fijo gratis (dashboard.ngrok.com › Domains).');
  setInterval(() => {}, 1 << 30); // se queda abierto hasta Ctrl+C (el túnel vive mientras tanto)
})();
