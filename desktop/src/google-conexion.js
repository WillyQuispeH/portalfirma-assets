// Las conexiones con Google (calendario y Drive) viven en el servidor (api/src/conexiones/google*.ts): la app solo abre la página de
// autorización de Google en el navegador y espera a que el servidor la reciba, igual que Mercado Libre. Hay dos:
//  · «google»           — la cuenta de cada usuario: su Google Calendar (las visitas se crean ahí) y su Drive (copia de lo que envía a firmar).
//  · «google_corredora» — el Drive general de la empresa: lo conecta el administrador, una vez.
// En el modo de prueba (PF_MOCK) se simula con un estado en memoria.
const { shell } = require('electron');
const MOCK = process.env.PF_MOCK === '1';
const asset = () => require('./asset');
const err = (m, code) => Object.assign(new Error(m), code ? { code } : {});
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const PROVEEDORES = ['google', 'google_corredora'];
const simulado = { google: null, google_corredora: null };

const valido = (p) => { if (!PROVEEDORES.includes(p)) throw err('Esa conexión de Google no existe.'); return p; };
const publica = (c) => (c ? { conectada: c.estado === 'activa', estado: c.estado, cuenta: c.cuenta || null, conectadoEn: c.conectadoEn || null, error: c.error || null } : { conectada: false, estado: null, cuenta: null, conectadoEn: null, error: null });

/** { disponible, usuario, empresa, admin }: «disponible» es false si el servidor no tiene la app de Google configurada */
async function estado() {
  if (MOCK) return { disponible: true, admin: true, usuario: publica(simulado.google), empresa: publica(simulado.google_corredora) };
  const { proveedores } = await asset().llamar('GET', '/conexiones');
  const de = (id) => (proveedores || []).find((p) => p.id === id);
  const u = de('google'); const e = de('google_corredora');
  return { disponible: !!u, admin: !!e?.puedeConectar, usuario: publica(u?.conexion), empresa: publica(e?.conexion) };
}

async function conectar(proveedor) {
  valido(proveedor);
  if (MOCK) { simulado[proveedor] = { estado: 'activa', cuenta: proveedor === 'google' ? 'corredor@gmail.com' : 'empresa@gmail.com', conectadoEn: new Date().toISOString() }; return estado(); }
  let url;
  try { ({ url } = await asset().llamar('POST', `/conexiones/${proveedor}/iniciar`)); }
  catch (e) { if (e.status === 403) throw err('El Drive de la empresa se conecta una vez: pídele al administrador que lo conecte desde su Asset.', 'SOLO_ADMIN'); if (e.status === 404) throw err('Google no está configurado en el servidor de Asset todavía.', 'NO_CONFIGURADO'); throw e; }
  const desde = Date.now();
  await shell.openExternal(url);
  const fin = desde + 5 * 60_000;
  while (Date.now() < fin) {
    await dormir(2000);
    const r = await asset().llamar('GET', `/conexiones/${proveedor}`).catch(() => null);
    if (r?.conexion?.estado === 'activa' && r.conexion.conectadoEn && new Date(r.conexion.conectadoEn).getTime() > desde - 60_000) return estado();
  }
  throw err('No se completó la conexión con Google (se acabó el tiempo). Inténtalo de nuevo.', 'CANCELADO');
}

async function desconectar(proveedor) {
  valido(proveedor);
  if (MOCK) { simulado[proveedor] = null; return estado(); }
  try { await asset().llamar('DELETE', `/conexiones/${proveedor}`); }
  catch (e) { if (e.status === 403) throw err('Solo el administrador puede desconectar el Drive de la empresa.', 'SOLO_ADMIN'); throw e; }
  return estado();
}

module.exports = { estado, conectar, desconectar };
