// Número de WhatsApp por corredora: cada corredora usa el número que guardó su administrador; WA_NUMERO del servidor solo
// se aplica a la subcuenta WA_LOCATION_ID (Portal Firma), nunca a otra corredora. Sin red ni base (base falsa).
// Requiere compilar antes (yarn build o la API en yarn dev, que deja dist/).
const { WechatiaService, Wechatia, formatearNumero } = require('../dist/whatsapp/wechatia');
const ok = (v, m) => { if (!v) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };

const conexiones = new Map();
const db = { conexion: {
  findUnique: async ({ where }) => conexiones.get(where.corredoraId_proveedor_dueno.corredoraId) ?? null,
  update: async ({ where, data }) => { for (const [k, c] of conexiones) if (c.id === where.id) conexiones.set(k, { ...c, ...data }); },
} };
const cifrado = { cifrar: (t) => t, descifrar: (t) => t };
const cfg = (o) => ({ get: (k) => o[k] });
const con = (id, datos) => conexiones.set(id, { id: 'cx-' + id, estado: 'activa', accesoCif: 'pit-x', datos });

(async () => {
  ok(formatearNumero('944975958') === '+56 9 4497 5958' && formatearNumero('+56 9 4497-5958') === '+56 9 4497 5958' && formatearNumero('22223333') === null, 'formatea celulares chilenos y rechaza los demás');
  const s = new WechatiaService(db, cifrado, cfg({ NODE_ENV: 'production', WA_NUMERO: '+56944975958', WA_LOCATION_ID: 'LOC-PF' }));
  con('pf', { locationId: 'LOC-PF' });
  con('tl', { locationId: 'LOC-TL' });
  ok((await s.credenciales('pf')).numero === '+56944975958', 'Portal Firma (su subcuenta) sigue con WA_NUMERO');
  ok((await s.credenciales('tl')).numero === undefined, 'otra corredora NO hereda WA_NUMERO (sin número: no se filtra y wechatia usa el suyo)');
  ok((await s.numeroEmpresa('tl')) === null && (await s.numeroEmpresa('pf')) === '+56 9 4497 5958', 'numeroEmpresa por corredora');

  const admin = { sub: 'u', corredoraId: 'tl', rol: 'ADMIN' };
  const e = await s.guardarNumero(admin, { numero: '9 1234 5678' });
  ok(e.numero === '+56 9 1234 5678' && (await s.credenciales('tl')).numero === '+56 9 1234 5678', 'el administrador guarda el número de su corredora');
  ok(conexiones.get('tl').datos.locationId === 'LOC-TL', 'guardar el número no toca el resto de la conexión');
  const no = await s.guardarNumero({ ...admin, rol: 'CORREDOR' }, { numero: '' }).then(() => null, (x) => x.message);
  ok(/administrador/.test(no), 'solo el administrador cambia el número');
  await s.guardarNumero(admin, { numero: '' });
  ok((await s.credenciales('tl')).numero === undefined, 'vacío = sin número');

  const w = new Wechatia({ token: 't', locationId: 'L', numero: '+56 9 1234 5678' });
  ok(w.esDeEsteNumero({ tipo: 'TYPE_WHATSAPP', de: '+56999999999', para: '+56912345678', direccion: 'entrante' }), 'lee los WhatsApp que llegan a su número');
  ok(!w.esDeEsteNumero({ tipo: 'TYPE_WHATSAPP', de: '+56999999999', para: '+56944975958', direccion: 'entrante' }), 'ignora los que llegan a otro número de la subcuenta');
  console.log('OK');
})().catch((e) => { console.error(e.message); process.exit(1); });
