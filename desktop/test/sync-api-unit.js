// «Mis operaciones» (src/sync.js) SOLO por la API de integración de Portalfirma de la corredora: todas las operaciones con getAll
// (GET /portalfirma-api/operaciones?desde&hasta) o, mientras no esté habilitado, por teléfono (POST /portalfirma-api/operaciones), y el
// detalle de GET /portalfirma-api/operacion/:n (con `files` convertido a lista). Sin credenciales (409) o sin cuenta de Asset no lista
// nada (NEEDS_PF_API) y no usa el MCP ni la sesión personal; lo que dejó otra fuente en la copia guardada no se muestra.
// Se simulan electron, store, inmo y asset.
//   node test/sync-api-unit.js
const assert = require('assert');
const Module = require('module');
const path = require('path');
const src = path.join(__dirname, '..', 'src');
let getAllNuevo = false; let getAllListo = true; let st2; let guardado = {}; let conApi = true; let sinCredenciales = false; const llamadas = [];
const falso = {
  electron: { app: { getPath: () => require('os').tmpdir() } },
  [path.join(src, 'store.js')]: { get: (k) => guardado[k], set: (k, v) => { guardado[k] = v; } },
  [path.join(src, 'inmo.js')]: { get API() { return conApi; }, usuario: () => ({ telefono: '+56 9 8727 6858' }), historialEnvios: () => [] },
  [path.join(src, 'asset.js')]: { llamar: async (m, ruta, cuerpo) => {
    llamadas.push({ m, ruta, cuerpo });
    if (sinCredenciales) throw Object.assign(new Error('sin conexión'), { code: 'NECESITA_CONEXION', status: 409 });
    if (ruta === '/portalfirma-api/conexion') return { conectado: true };
    if (ruta.startsWith('/portalfirma-api/operaciones?') && getAllNuevo) return { listo: true, motivo: null, filas: [{ operation: 777, contractId: 'c-7', creado: '2026-11-18T10:00:00', actualizado: '2026-11-19T10:00:00', nombre: 'Contrato de arriendo', estado: 'process', firmantes: 3, firmaron: 1, legalizado: false, sinEnviar: false }, { operation: 778, contractId: 'c-8', creado: '2026-11-01T10:00:00', actualizado: '2026-11-02T10:00:00', nombre: 'Mandato', estado: 'finalized', firmantes: 1, firmaron: 1, legalizado: true, sinEnviar: false }] };
    if (ruta.startsWith('/portalfirma-api/operaciones?')) return getAllListo ? { listo: true, motivo: null, filas: [{ operation: 555, contractId: 'c-1', creado: '2026-11-19T10:00:00Z', firmantes: 2 }] } : { listo: false, motivo: 'Petición en mantenimiento', filas: [] };
    if (ruta === '/portalfirma-api/operaciones') return { totalInRange: 1, operations: [{ contract_id: 'c-1', operation: 555, stage: 'process', document_name: 'Orden de visita', createdDateAt: '2026-11-19T10:00:00Z', updatedDateAt: '2026-11-20T10:00:00Z' }] };
    if (ruta === '/portalfirma-api/operacion/555') return { processId: 'c-1', operation: 555, status: 'process', signatories: [{ name: 'Ana', signed: true }, { name: 'Bruno', signed: false }], files: { original: { id: 'f1', name: 'Orden.pdf' }, signed: null, legalized: null }, updatedDateAt: '2026-11-20T10:00:00Z' };
    throw new Error('ruta inesperada ' + ruta);
  } },
};
const orig = Module._load;
Module._load = function (req, parent, ...r) {
  if (req === 'electron') return falso.electron;
  const abs = req.startsWith('.') ? path.resolve(path.dirname(parent.filename), req) : req;
  for (const k of Object.keys(falso)) if (abs === k || abs + '.js' === k) return falso[k];
  return orig.call(this, req, parent, ...r);
};
const sync = require(path.join(src, 'sync.js'));
sync.init();
(async () => {
  // con getAll habilitado: todas las operaciones de la empresa por la API de integración, el MCP no se toca
  let r = await sync.sync({ full: true });
  const ga = llamadas.find((l) => l.ruta.startsWith('/portalfirma-api/operaciones?'));
  assert.ok(ga && ga.m === 'GET' && /desde=\d{4}-\d{2}-\d{2}&hasta=\d{4}-\d{2}-\d{2}$/.test(ga.ruta), 'pide getAll por rango de fechas (sin teléfono)');
  assert.ok(!llamadas.some((l) => l.ruta === '/portalfirma-api/operaciones'), 'y no necesita el listado por teléfono');
  const it = r.items.find((x) => x.operation === 555);
  assert.ok(it && it.contractId === 'c-1', 'lista la operación de getAll');
  assert.strictEqual(it.name, 'Orden', 'el nombre sale del archivo original del detalle (getAll no lo trae)');
  assert.strictEqual(it.signed, 1, 'y quién firmó, del detalle'); assert.strictEqual(it.signers, 2);
  const d = await sync.detail(555);
  assert.strictEqual(d.signatories.length, 2); assert.ok(Array.isArray(d.files) && d.files.length === 1 && d.files[0].fileName === 'original Orden.pdf', 'files pasa de objeto a lista');
  assert.strictEqual(d.versions[1].done, false, 'Firmado: todavía no (falta Bruno)');
  const st = await sync.status(); assert.strictEqual(st.corredora, true, 'conectada por la API de la corredora');
  // getAll todavía en mantenimiento: el listado por teléfono de la misma API
  guardado = {}; getAllListo = false; llamadas.length = 0;
  r = await sync.sync({ full: true });
  assert.ok(llamadas.some((l) => l.ruta === '/portalfirma-api/operaciones' && l.m === 'POST' && l.cuerpo.phone === '56987276858' && l.cuerpo.limit === 100), 'sin getAll, lista por teléfono por la API');
  assert.ok(r.items.some((x) => x.operation === 555), 'y trae la operación'); getAllListo = true;
  // sin credenciales de la API (409): no lista nada ni usa el MCP
  guardado = {}; sinCredenciales = true;
  await assert.rejects(() => sync.sync({ full: true }), (e) => e.code === 'NEEDS_PF_API' && /Integraciones/.test(e.message));
  await assert.rejects(() => sync.detail(555), (e) => e.code === 'NEEDS_PF_API');
  st2 = await sync.status(); assert.strictEqual(st2.integracion, false); assert.strictEqual(st2.corredora, false);
  // sin cuenta de Asset: tampoco
  sinCredenciales = false; conApi = false;
  await assert.rejects(() => sync.sync({ full: true }), (e) => e.code === 'NEEDS_PF_API');
  conApi = true;
  // lo que dejó otra fuente (MCP o sesión personal) en la copia guardada no se muestra
  guardado = { opsCache: { items: { 1: { operation: 1, name: 'Viejo del MCP', stage: 'process' } }, details: {}, lastSync: '2026-01-01T00:00:00Z', phone: '56987276858' } };
  assert.strictEqual(sync.list().items.length, 0, 'la copia de otra fuente no se muestra');
  assert.strictEqual((await sync.status()).count, 0);
  // getAll nuevo (paginado por etapa): ya trae el nombre, la etapa y los firmantes, y se pide UNA vez por todo el rango
  guardado = {}; conApi = true; getAllNuevo = true; llamadas.length = 0;
  r = await sync.sync({ full: true });
  assert.strictEqual(llamadas.filter((l) => l.ruta.startsWith('/portalfirma-api/operaciones?')).length, 1, 'una sola consulta por todo el rango');
  const n7 = r.items.find((x) => x.operation === 777); const n8 = r.items.find((x) => x.operation === 778);
  assert.ok(n7 && n7.name === 'Contrato de arriendo' && n7.stage === 'process' && n7.signers === 3 && n7.signed === 1, 'el nombre y los firmantes salen del listado, sin pedir el detalle');
  assert.ok(n8 && n8.stage === 'finalized' && n8.name === 'Mandato', 'cada operación con su etapa');
  assert.ok(!llamadas.some((l) => /\/portalfirma-api\/operacion\/\d+$/.test(l.ruta)), 'no pide el detalle de cada operación al sincronizar');
  getAllNuevo = false;
  console.log('sync-api-unit OK');
})().catch((e) => { console.error(e); process.exit(1); });
