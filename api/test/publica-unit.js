// scripts/publica.js (ngrok → API_URL_PUBLICA en api/.env) contra un «agente ngrok» FALSO en el puerto 4041 (el 4040 suele tenerlo el
// ngrok real de otro proyecto): con un ngrok ya abierto le agrega el túnel de la API, pone la dirección en el .env, deja la marca que
// espera la API, y al cerrar lo restaura todo y quita solo su túnel. Restaura el .env aunque falle. Uso: node test/publica-unit.js
const http = require('http'); const fs = require('fs'); const path = require('path'); const { spawn } = require('child_process');
const raiz = path.join(__dirname, '..'); const ENV = path.join(raiz, '.env'); const MARCA = path.join(raiz, '.publica-lista');
const original = fs.readFileSync(ENV, 'utf8');
const lineas = () => fs.readFileSync(ENV, 'utf8').split(/\r?\n/);
const ok = (c, m) => { if (!c) { fs.writeFileSync(ENV, original); throw new Error('FALLÓ: ' + m); } console.log('  ✔ ' + m); };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const antes = (original.split(/\r?\n/).find((l) => l.startsWith('API_URL_PUBLICA=')) || '');

const tuneles = [{ name: 'otro', public_url: 'https://otro.ngrok-free.app', config: { addr: 'http://localhost:6505' } }];
const agente = http.createServer((q, r) => {
  const t = []; q.on('data', (c) => t.push(c)); q.on('end', () => {
    r.setHeader('content-type', 'application/json');
    if (q.method === 'GET') return r.end(JSON.stringify({ tunnels: tuneles }));
    if (q.method === 'POST') { const b = JSON.parse(Buffer.concat(t).toString()); tuneles.push({ name: b.name, public_url: `https://${b.domain || 'azar-777.ngrok-free.app'}`, config: { addr: 'http://localhost:' + b.addr } }); return r.end(JSON.stringify({ public_url: tuneles[tuneles.length - 1].public_url })); }
    if (q.method === 'DELETE') { const i = tuneles.findIndex((x) => q.url.endsWith('/' + x.name)); if (i >= 0) tuneles.splice(i, 1); r.statusCode = 204; return r.end(); }
    r.end('{}');
  });
});

agente.listen(4041, '127.0.0.1', async () => {
  try {
    fs.rmSync(MARCA, { force: true });
    const h = spawn(process.execPath, ['scripts/publica.js'], { cwd: raiz, env: { ...process.env, NGROK_API: 'http://127.0.0.1:4041' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; h.stdout.on('data', (d) => (out += d)); h.stderr.on('data', (d) => (out += d));
    for (let i = 0; i < 40 && !fs.existsSync(MARCA); i++) await esperar(250);   // espera la marca (node y ngrok falso tardan un poco)
    ok(/agrego el túnel/.test(out), 'con un ngrok ya abierto para otra cosa, le agrega el túnel en vez de abrir otro');
    ok(lineas().includes('API_URL_PUBLICA=https://azar-777.ngrok-free.app'), 'pone la dirección pública en api/.env');
    ok(fs.existsSync(MARCA) && fs.readFileSync(MARCA, 'utf8') === 'https://azar-777.ngrok-free.app', 'deja la marca para que la API espere la dirección');
    ok(/callback\/google_corredora/.test(out) && /callback\/mercadolibre/.test(out) && /callback\/google\b/.test(out), 'imprime las redirecciones para registrar en Google y Mercado Libre');
    ok(tuneles.length === 2 && tuneles[1].name === 'asset-api' && tuneles[1].config.addr === 'http://localhost:3000', 'el túnel apunta a la API (:3000)');
    // en Windows no hay SIGINT elegante (Ctrl+C sí lo da en la terminal): se prueba el cierre forzado y su remedio, --restaurar
    h.kill(); await esperar(800);
    await new Promise((r) => spawn(process.execPath, ['scripts/publica.js', '--restaurar'], { cwd: raiz, env: { ...process.env, NGROK_API: 'http://127.0.0.1:4041' }, stdio: 'ignore' }).on('exit', r));
    ok(lineas().includes(antes), '--restaurar deja API_URL_PUBLICA como estaba (aunque la ventana se haya cerrado a la fuerza)');
    ok(!fs.existsSync(MARCA), 'y quita la marca');
    ok(lineas().includes('API_URL_PUBLICA=http://localhost:3000') || antes.startsWith('API_URL_PUBLICA=http://localhost'), 'sin dejar la dirección de ngrok');
    ok(fs.readFileSync(ENV, 'utf8').replace(/\r\n/g, '\n') === original.replace(/\r\n/g, '\n'), 'el resto del .env no cambió');
    fs.writeFileSync(ENV, original); agente.close(); console.log('OK publica'); process.exit(0);
  } catch (e) { fs.writeFileSync(ENV, original); console.error(e.message); process.exit(1); }
});
