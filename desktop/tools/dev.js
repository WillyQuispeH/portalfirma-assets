// yarn dev: compila src/ui con Vite en modo observación y, cuando termina la
// primera compilación, arranca nodemon (que abre Electron y lo reinicia al
// cambiar algo en src/, incluida la salida de Vite en src/renderer/react).
const { spawn } = require('child_process');
const path = require('path');

const raiz = path.join(__dirname, '..');
let nodemon = null;

function arrancarNodemon() {
  const bin = path.join(raiz, 'node_modules', 'nodemon', 'bin', 'nodemon.js');
  nodemon = spawn(process.execPath, [bin], { cwd: raiz, stdio: 'inherit', env: { ...process.env, PF_DEV: '1' } });
  nodemon.on('exit', (code) => process.exit(code ?? 0));
}

(async () => {
  const { build } = await import('vite');
  const watcher = await build({ root: raiz, mode: 'development', logLevel: 'warn', build: { watch: {} } });
  watcher.on('event', (e) => {
    if (e.code === 'ERROR') console.error('[ui] error al compilar:', e.error?.message || e.error);
    if (e.code === 'BUNDLE_END' || e.code === 'END') {
      e.result?.close?.();
      if (e.code === 'END') { console.log('[ui] compilado'); if (!nodemon) arrancarNodemon(); }
    }
  });
  const salir = () => { nodemon?.kill(); watcher.close(); process.exit(0); };
  process.on('SIGINT', salir);
  process.on('SIGTERM', salir);
})().catch((err) => { console.error(err); process.exit(1); });
