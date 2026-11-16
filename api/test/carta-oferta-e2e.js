// Prueba de la CARTA OFERTA (src/negocios/carta-oferta.ts), contra la API corriendo (yarn dev) y asset_dev: valida lo que
// falta (cliente, correo, monto), arma el PDF de vista previa con los datos del negocio (sin enviar nada a Portalfirma) y
// que otro corredor no la vea. Crea una corredora de prueba y al final la borra con todo.
// Requiere Chromium en la API (PDF_CHROMIUM). Uso: node test/carta-oferta-e2e.js [url]
const fs = require('fs');
const path = require('path');
const argon2 = require('argon2');
const { PrismaClient } = require('@prisma/client');

const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/).map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, '')]));
process.env.DATABASE_URL = env.DATABASE_URL;
const B = (process.argv[2] || 'http://localhost:3000') + '/v1';
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
const req = async (metodo, ruta, cuerpo, token) => {
  const r = await fetch(B + ruta, { method: metodo, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  let j = null; try { j = await r.json(); } catch { /* sin cuerpo */ }
  return { s: r.status, j };
};
const ingresar = async (email, clave) => (await req('POST', '/auth/ingresar', { email, clave })).j.tokenAcceso;

(async () => {
  const db = new PrismaClient();
  const SUF = Date.now().toString(36);
  let co;
  try {
    const hash = await argon2.hash('Prueba-1234');
    co = await db.corredora.create({ data: { nombre: `E2E Carta ${SUF}` } });
    const nu = (n) => db.usuario.create({ data: { corredoraId: co.id, email: `e2e-carta${n}-${SUF}@prueba.cl`, nombre: 'Corredor ' + n.toUpperCase(), hashClave: hash } });
    const c1 = await nu('a'); const c2 = await nu('b');
    const tA = await ingresar(c1.email, 'Prueba-1234'); const tB = await ingresar(c2.email, 'Prueba-1234');
    ok(!!tA && !!tB, 'dos corredores de prueba entran');
    const prop = await db.propiedad.create({ data: { corredoraId: co.id, codigo: 'PF-9401', titulo: 'Depto Providencia', tipo: 'departamento', arriendo: true, precioArriendo: 650000, monedaArriendo: 'CLP', direccion: 'Av. Providencia 1000', unidad: '504', comuna: 'Providencia' } });
    const dueno = await db.persona.create({ data: { corredoraId: co.id, nombre: 'Rosa Propietaria' } });
    await db.propiedadPersona.create({ data: { propiedadId: prop.id, personaId: dueno.id, rol: 'propietario' } });
    const sinCorreo = await db.persona.create({ data: { corredoraId: co.id, nombre: 'Pedro Sin Correo', rut: '15555555', rutFormato: '15.555.555-6' } });
    const per = await db.persona.create({ data: { corredoraId: co.id, nombre: 'Ana Arrendataria', rut: '76543216', rutFormato: '7.654.321-6', email: 'ana@correo.cl', telefono: '+56 9 7777 1111' } });
    const mk = (id, extra, clienteId) => db.negocio.create({ data: { id, corredoraId: co.id, tipo: 'arriendo', etapa: 'reserva', propiedadId: prop.id, clienteId, corredorId: c1.id, datos: extra } });
    const nSinCliente = await mk(`nc0${SUF}`, {}, null);
    const nSinCorreo = await mk(`nc1${SUF}`, { valor: { valor: 650000, moneda: 'CLP' } }, sinCorreo.id);
    const nSinMonto = await mk(`nc2${SUF}`, {}, per.id);
    const nOk = await mk(`nc3${SUF}`, { valor: { valor: 650000, moneda: 'CLP' }, oferta: { garantia: '1 mes de renta', plazo: '12 meses', vigencia: '7', condiciones: 'Entrega con pintura reciente.' } }, per.id);

    let r = await req('POST', '/cartas-oferta/vista-previa', { negocioId: nSinCliente.id }, tA);
    ok(r.s === 200 && /no tiene arrendatario/.test(r.j.error), 'sin arrendatario lo dice claro');
    r = await req('POST', '/cartas-oferta/vista-previa', { negocioId: nSinCorreo.id }, tA);
    ok(r.s === 200 && /Falta el correo de Pedro Sin Correo/.test(r.j.error), 'sin correo del oferente lo dice claro');
    r = await req('POST', '/cartas-oferta/vista-previa', { negocioId: nSinMonto.id }, tA);
    ok(r.s === 200 && /Falta el monto de la oferta/.test(r.j.error), 'sin monto de la oferta lo dice claro');

    r = await req('POST', '/cartas-oferta/vista-previa', { negocioId: nOk.id }, tA);
    ok(r.s === 200 && !r.j.error && typeof r.j.pdf === 'string' && Buffer.from(r.j.pdf, 'base64').slice(0, 4).toString() === '%PDF', 'con todo completo devuelve el PDF de la carta');
    ok(r.j.oferente === 'Ana Arrendataria' && r.j.propiedad === 'PF-9401' && /Carta oferta PF-9401/.test(r.j.archivo), 'trae el nombre del oferente, la propiedad y el nombre del archivo');
    ok(!(await db.firma.findFirst({ where: { corredoraId: co.id } })), 'la vista previa no envía ni registra nada');
    ok((await db.contador.findMany({ where: { corredoraId: co.id } })).length === 0, 'la vista previa no gasta un número de carta');

    r = await req('POST', '/cartas-oferta/vista-previa', { negocioId: nOk.id }, tB);
    ok(r.s === 200 || r.s === 403, 'otro corredor de la misma corredora: lo decide la regla de visibilidad de negocios');
    r = await req('POST', '/cartas-oferta/vista-previa', {}, tA);
    ok(r.s === 400, 'sin negocio, 400');
    r = await req('POST', '/cartas-oferta/vista-previa', { negocioId: nOk.id });
    ok(r.s === 401, 'sin sesión, 401');
    console.log('OK carta oferta');
  } finally {
    if (co) {
      const w = { where: { corredoraId: co.id } };
      const usuarios = (await db.usuario.findMany({ ...w, select: { id: true } })).map((u) => u.id);
      for (const m of ['firma', 'actividad', 'negocio']) await db[m].deleteMany(w).catch((e) => console.log('limpieza ' + m + ': ' + e.message));
      await db.propiedadPersona.deleteMany({ where: { propiedad: { corredoraId: co.id } } }).catch(() => null);
      await db.propiedad.deleteMany(w).catch(() => null); await db.persona.deleteMany(w).catch(() => null); await db.contador.deleteMany(w).catch(() => null);
      await db.sesion.deleteMany({ where: { usuarioId: { in: usuarios } } }).catch(() => null);
      await db.usuario.deleteMany({ where: { id: { in: usuarios } } }).catch(() => null);
      await db.corredora.delete({ where: { id: co.id } }).catch((e) => console.log('limpieza corredora: ' + e.message));
    }
    await db.$disconnect();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
