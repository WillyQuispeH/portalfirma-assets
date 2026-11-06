// Prueba de punta a punta de la revisión de firmas en el servidor (src/firmas/ronda.ts) y de los avisos (/v1/avisos),
// contra la API corriendo (yarn dev) y asset_dev, con un Portalfirma FALSO (servidor MCP) que levanta esta prueba: la
// sesión de Portalfirma de la corredora de prueba guarda su dirección en datos.mcpUrl (solo fuera de producción).
// Crea una corredora de prueba (con su sesión) y otra sin sesión, y al final las borra con todo lo suyo.
// Uso: node test/firmas-ronda-e2e.js [url]
// Revisa: «revisar ahora» consulta lo que está en firma con la sesión de la corredora (lo pide cualquier usuario);
// quién firmó (con su calidad, aunque Portalfirma no la diga), firmado por todos y legalizado; lo que no cambió no sube
// la versión; un error de Portalfirma no corta la vuelta; lo ya firmado no se consulta; lo revisado hace poco no se
// repite; avisos para quien envió (no para otros), que se toman una sola vez; la firma de la etapa actual de un negocio
// queda firmada con «avanzar» y aviso al corredor a cargo, y queda en el historial del negocio; sin sesión, 409.
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const argon2 = require('argon2');
const { PrismaClient } = require('@prisma/client');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');

const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/).map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2].trim().replace(/^"(.*)"$/, '$1')]),
);
const B = (process.argv[2] || 'http://localhost:3000') + '/v1';
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
const req = async (metodo, ruta, cuerpo, token) => {
  const r = await fetch(B + ruta, { method: metodo, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { s: r.status, j };
};
const ingresar = async (email, clave) => (await req('POST', '/auth/ingresar', { email, clave })).j.tokenAcceso;
const SUF = Date.now().toString(36);
// cifrado igual al de la API (src/conexiones/cifrado.ts)
function cifrar(texto) {
  const llave = Buffer.from(env.CONEXIONES_CLAVE, 'base64'); const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', llave, iv); const d = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), d.toString('base64url')].join('.');
}

// ---------------------------------------------------------------- Portalfirma falso
const TOKEN = 'tok-prueba-' + SUF;
const OP = 900000000 + Math.floor(Math.random() * 90000000); // números de operación que no chocan con los reales
const DET = {}; const consultas = [];
function portalfirmaFalso() {
  const s = http.createServer(async (rq, rs) => {
    if (rq.headers.authorization !== 'Bearer ' + TOKEN) { rs.writeHead(401).end(); return; }
    let b = ''; for await (const c of rq) b += c;
    const srv = new McpServer({ name: 'pf-falso', version: '1.0.0' });
    srv.tool('process_detail_get_by_operation', { operation: z.number() }, async ({ operation }) => {
      consultas.push(operation); const d = DET[operation];
      if (d === 'error') return { content: [{ type: 'text', text: 'Error: operación no encontrada' }], isError: true };
      return { content: [{ type: 'text', text: JSON.stringify(d || {}) }] };
    });
    const t = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    rs.on('close', () => { t.close(); srv.close(); });
    await srv.connect(t);
    await t.handleRequest(rq, rs, b ? JSON.parse(b) : undefined);
  });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r(s)));
}
const firmante = (name, rut, signed, alias) => ({ name, rut, signed, email: name.split(' ')[0].toLowerCase() + '@x.cl', phone: '+56911112222', ...(alias ? { alias } : {}) });

(async () => {
  const db = new PrismaClient();
  const srv = await portalfirmaFalso(); const mcpUrl = `http://127.0.0.1:${srv.address().port}/mcp`;
  let co = null; let otra = null; const usuarios = [];
  try {
    const hash = await argon2.hash('clave-e2e-123', { type: argon2.argon2id });
    co = await db.corredora.create({ data: { nombre: `E2E Firmas ${SUF}` } });
    otra = await db.corredora.create({ data: { nombre: `E2E Otra ${SUF}` } });
    const nu = async (cid, n, rol) => { const x = await db.usuario.create({ data: { corredoraId: cid, email: `e2e-fr${n}-${SUF}@prueba.cl`, nombre: 'E2E FR ' + n, hashClave: hash, ...(rol ? { rol } : {}) } }); usuarios.push(x.id); return x; };
    const c1 = await nu(co.id, '1'); const c2 = await nu(co.id, '2'); const o1 = await nu(otra.id, 'o', 'ADMIN');
    const t1 = await ingresar(c1.email, 'clave-e2e-123'); const t2 = await ingresar(c2.email, 'clave-e2e-123'); const tO = await ingresar(o1.email, 'clave-e2e-123');
    ok(t1 && t2 && tO, 'ingresan dos corredores y el administrador de otra corredora');
    await db.conexion.create({ data: { corredoraId: co.id, usuarioId: null, dueno: 'corredora', proveedor: 'portalfirma', tipo: 'oauth', estado: 'activa', accesoCif: cifrar(TOKEN), datos: { mcpUrl } } });

    // ---- lo que está en firma (lo envió c1)
    const ops = [OP + 1, OP + 2, OP + 3, OP + 4, OP + 5]; const [o1n, o2n, o3n, o4n, o5n] = ops;
    const doc = (op, extra = {}) => ({ operacion: op, plantilla: `Doc ${op}`, estado: 'en_firma', firmantes: [{ nombre: 'Ana Pérez', rut: '12345678-5', rol: 'propietario', firmo: false }, { nombre: 'Bruno Soto', rut: '98765432-1', rol: 'comprador', firmo: false }], ...extra });
    for (const op of ops) { const r = await req('PUT', `/firmas/op${op}`, doc(op, op === o5n ? { estado: 'firmado' } : {}), t1); if (r.s !== 200) throw new Error(JSON.stringify(r.j)); }
    DET[o1n] = { status: 'inProgress', signatories: [firmante('Ana Pérez', '12.345.678-5', true), firmante('Bruno Soto', '98.765.432-1', false)] };
    DET[o2n] = { status: 'finalized', legalized: true, signatories: [firmante('Ana Pérez', '12345678-5', true, 'propietario'), firmante('Bruno Soto', '98765432-1', true, 'comprador')] };
    DET[o3n] = { status: 'inProgress', signatories: [firmante('Ana Pérez', '12345678-5', false), firmante('Bruno Soto', '98765432-1', false)] };
    DET[o4n] = 'error';
    // lo que guarda la app para o3 tal como quedaría tras revisarla (para que «no cambió» sea cierto)
    const f3 = await db.firma.findUnique({ where: { id: `op${o3n}` } });
    await db.firma.update({ where: { id: `op${o3n}` }, data: { firmantes: [{ nombre: 'Ana Pérez', rut: '12.345.678-5', rol: 'propietario', firmo: false, email: 'ana@x.cl', telefono: '+56911112222' }, { nombre: 'Bruno Soto', rut: '98.765.432-1', rol: 'comprador', firmo: false, email: 'bruno@x.cl', telefono: '+56911112222' }], version: f3.version } });
    // un negocio en la etapa «promesa», con su firma (y otra etapa ya firmada)
    const NEG = `n${SUF}x`;
    await db.negocio.create({ data: { id: NEG, corredoraId: co.id, tipo: 'venta', etapa: 'promesa', corredorId: c1.id, datos: { firmas: { promesa: { operacion: OP + 10, estado: 'en_firma' }, oferta: { operacion: OP + 11, estado: 'firmado' } } } } });
    DET[OP + 10] = { status: 'finalized', signatories: [{ signed: true }, { signed: true }] };

    // ---- revisar ahora (lo pide otro corredor: la sesión es de la corredora)
    let r = await req('POST', '/firmas/revisar', null, t2);
    ok(r.s === 200 && r.j.revisadas === 4 && consultas.length === 5, 'revisar ahora consulta lo que está en firma (4 documentos y la firma del negocio; 4 respondieron) con la sesión de la corredora');
    ok(!consultas.includes(o5n) && !consultas.includes(OP + 11), 'lo ya firmado no se consulta');
    ok(r.j.cambios.includes(`Ana Pérez (propietario) firmó «Doc ${o1n}»`), 'avisa quién firmó, con su calidad aunque Portalfirma no la informe');
    ok(r.j.cambios.includes(`«Doc ${o2n}» quedó firmado por todos`) && r.j.cambios.includes(`«Doc ${o2n}» quedó legalizado`), 'y cuando quedó firmado por todos y legalizado');
    const F = async (op) => db.firma.findUnique({ where: { id: `op${op}` } });
    const a1 = await F(o1n);
    ok(a1.firmados === 1 && a1.total === 2 && a1.firmantes[0].firmo && a1.firmantes[0].rut === '12.345.678-5' && a1.firmantes[0].rol === 'propietario' && a1.version === 2 && a1.revisadoEn, 'en la base: quién firmó, RUT con formato, calidad y nueva versión');
    const a2 = await F(o2n);
    ok(a2.estado === 'firmado' && a2.legalizado && a2.firmadoEn && a2.firmados === 2, 'el firmado por todos queda firmado y legalizado, con su fecha');
    const a3 = await F(o3n);
    ok(a3.version === f3.version && a3.revisadoEn, 'lo que no cambió solo marca la hora de revisión (sin nueva versión)');
    const a4 = await F(o4n);
    ok(a4.version === 1 && a4.estado === 'en_firma', 'un error de Portalfirma en una no corta la vuelta ni la cambia');
    const lista = (await req('GET', `/firmas?desde=${encodeURIComponent(new Date(Date.now() - 60000).toISOString())}`, null, t2)).j.items;
    ok(lista.some((x) => x.id === `op${o1n}` && x.firmantes[0].firmo), 'toda la corredora ve el cambio al sincronizar');

    // ---- el negocio
    const n = await db.negocio.findUnique({ where: { id: NEG } });
    ok(n.datos.firmas.promesa.estado === 'firmado' && n.datos.firmas.promesa.avanzar === true && n.datos.firmas.promesa.firmados === 2 && n.version === 2, 'la firma de la etapa actual del negocio queda firmada, con «avanzar» para la app');
    const actN = await db.actividad.findFirst({ where: { corredoraId: co.id, entidadId: NEG } });
    ok(actN && /promesa/.test(actN.texto), 'y queda en el historial del negocio');

    // ---- avisos
    let av = (await req('GET', '/avisos', null, t1)).j.items;
    ok(av.filter((x) => x.tipo === 'firmas').length === 2 && av.some((x) => x.texto.includes(`(operación ${o2n})`)), 'quien envió tiene un aviso por cada documento que cambió');
    const an = av.find((x) => x.tipo === 'firma_negocio');
    ok(an && an.datos.negocioId === NEG && an.datos.etapa === 'promesa' && an.datos.avanzar === true, 'y el corredor a cargo del negocio, uno para avanzarlo');
    ok(!(await req('GET', '/avisos', null, t2)).j.items.length, 'el otro corredor no tiene avisos');
    ok(!(await req('POST', '/avisos/tomar', { ids: av.map((x) => x.id) }, t2)).j.tomados.length, 'ni puede tomar los ajenos');
    r = await req('POST', '/avisos/tomar', { ids: av.map((x) => x.id) }, t1);
    ok(r.j.tomados.length === 3, 'el dueño los toma');
    ok(!(await req('POST', '/avisos/tomar', { ids: av.map((x) => x.id) }, t1)).j.tomados.length && !(await req('GET', '/avisos', null, t1)).j.items.length, 'una sola vez (otro equipo ya no los ve)');

    // ---- lo revisado hace poco no se repite
    const antes = consultas.length;
    r = await req('POST', '/firmas/revisar', null, t1);
    ok(r.j.revisadas === 0 && consultas.length === antes, 'revisar de nuevo enseguida no vuelve a consultar Portalfirma');

    // ---- sin sesión de Portalfirma
    await db.firma.create({ data: { id: `op${OP + 20}`, corredoraId: otra.id, operacion: OP + 20, documento: 'Otra', enviadoPorId: o1.id } });
    r = await req('POST', '/firmas/revisar', null, tO);
    ok(r.s === 409 && r.j.codigo === 'NECESITA_CONEXION', 'una corredora sin Portalfirma conectado: 409 NECESITA_CONEXION');
  } finally {
    srv.closeAllConnections(); // sin esto, close() espera las conexiones keep-alive y el proceso no termina
    srv.close();
    const cos = [co?.id, otra?.id].filter(Boolean);
    await db.aviso.deleteMany({ where: { corredoraId: { in: cos } } });
    await db.actividad.deleteMany({ where: { corredoraId: { in: cos } } });
    await db.firma.deleteMany({ where: { corredoraId: { in: cos } } });
    await db.negocio.deleteMany({ where: { corredoraId: { in: cos } } });
    await db.conexion.deleteMany({ where: { corredoraId: { in: cos } } });
    await db.sesion.deleteMany({ where: { usuarioId: { in: usuarios } } });
    await db.usuario.deleteMany({ where: { id: { in: usuarios } } });
    for (const c of cos) await db.corredora.delete({ where: { id: c } }).catch((e) => console.warn('no se borró la corredora de prueba:', e.message));
    await db.$disconnect();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
