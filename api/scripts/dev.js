// yarn dev: abre el túnel SSH a la base (si no está abierto ya), espera a que responda y levanta la API con recarga.
// Ctrl+C cierra las dos cosas. Equivale a `yarn tunel` en una terminal y `yarn start:dev` en otra.
// Con --esperar-tunel (yarn dev:panel, lo usa start-dev.ps1) no abre el túnel: espera a que lo abra otro panel.
const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

const raiz = path.join(__dirname, '..');
const env = {};
for (const l of fs.readFileSync(path.join(raiz, '.env'), 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(l);
  if (m) env[m[1]] = m[2];
}
const puerto = Number(env.SSH_PUERTO_LOCAL || 15432);

const abierto = () =>
  new Promise((listo) => {
    const s = net.connect(puerto, '127.0.0.1');
    s.once('connect', () => (s.destroy(), listo(true)));
    s.once('error', () => listo(false));
  });

const hijos = [];
const salir = (code = 0) => {
  for (const h of hijos) h.kill();
  process.exit(code);
};
process.on('SIGINT', () => salir(0));
process.on('SIGTERM', () => salir(0));

const esperarTunel = process.argv.includes('--esperar-tunel');

(async () => {
  if (esperarTunel) {
    console.log(`[dev] esperando el túnel en localhost:${puerto}...`);
    let listo = await abierto();
    for (let i = 0; i < 120 && !listo; i++) {
      await new Promise((r) => setTimeout(r, 500));
      listo = await abierto();
    }
    if (!listo) {
      console.error('[dev] el túnel no se abrió en 60 segundos. Revisa el panel «tunel BD».');
      salir(1);
    }
  } else if (await abierto()) {
    console.log(`[dev] el túnel ya está abierto en localhost:${puerto}`);
  } else {
    const t = spawn(process.execPath, [path.join(__dirname, 'tunel.js')], { cwd: raiz, stdio: 'inherit' });
    hijos.push(t);
    t.on('exit', (c) => {
      console.error(`[dev] el túnel se cerró (código ${c}). Revisa tu conexión y que tu clave SSH esté autorizada.`);
      salir(1);
    });
    let listo = false;
    for (let i = 0; i < 30 && !listo; i++) {
      await new Promise((r) => setTimeout(r, 500));
      listo = await abierto();
    }
    if (!listo) {
      console.error('[dev] el túnel no respondió en 15 segundos.');
      salir(1);
    }
  }
  const nest = path.join(raiz, 'node_modules', '@nestjs', 'cli', 'bin', 'nest.js');
  const api = spawn(process.execPath, [nest, 'start', '--watch'], { cwd: raiz, stdio: 'inherit' });
  hijos.push(api);
  api.on('exit', (c) => salir(c ?? 0));
})();
