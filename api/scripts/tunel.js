// Túnel SSH para desarrollo: deja el PostgreSQL del servidor (127.0.0.1:5432 visto desde el servidor) en
// localhost:SSH_PUERTO_LOCAL de este equipo, sin abrir el puerto 5432 a internet. Ctrl+C para cerrarlo.
// Usa tu clave SSH (~/.ssh/id_ed25519), que debe estar autorizada en el servidor: no pide ni guarda contraseñas.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const env = {};
for (const l of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(l);
  if (m) env[m[1]] = m[2];
}
const host = env.SSH_HOST;
const user = env.SSH_USER || 'root';
const local = env.SSH_PUERTO_LOCAL || '15432';
if (!host) throw new Error('Falta SSH_HOST en api/.env');

console.log(`Túnel: localhost:${local} → ${user}@${host} → 127.0.0.1:5432 (Ctrl+C para cerrar)`);
const args = [
  '-N',
  '-o',
  'ExitOnForwardFailure=yes',
  '-o',
  'ServerAliveInterval=30',
  '-o',
  'BatchMode=yes',
  // una sola clave: probar varias hace que el servidor corte («Too many authentication failures») y fail2ban bloquee
  '-o',
  'IdentitiesOnly=yes',
  '-i',
  path.join(os.homedir(), '.ssh', 'id_ed25519'),
  '-L',
  `${local}:127.0.0.1:5432`,
  `${user}@${host}`,
];
const p = spawn('ssh', args, { stdio: 'inherit' });
p.on('exit', (c) => process.exit(c ?? 0));
