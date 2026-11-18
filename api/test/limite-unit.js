// Límite de peticiones por persona: con sesión cuenta por usuario (no por IP), el ingreso por IP + correo y lo demás por IP.
// Requiere compilar antes (yarn build o la API en yarn dev, que deja dist/).
const { LimiteGuard } = require('../dist/comun/limite.guard');
const ok = (v, m) => { if (!v) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const g = Object.create(LimiteGuard.prototype);
  g.jwt = { verifyAsync: async (t) => { if (t === 'bueno') return { sub: 'u-1' }; throw new Error('firma'); } };
  const t = (req) => g.getTracker({ ip: '200.1.1.1', ips: [], headers: {}, ...req });
  ok((await t({ usuario: { sub: 'u-9' } })) === 'u:u-9', 'con sesión ya verificada: por usuario');
  ok((await t({ headers: { authorization: 'Bearer bueno' } })) === 'u:u-1', 'con token válido (sin depender del orden de los guardias): por usuario');
  ok((await t({ headers: { authorization: 'Bearer falso' } })) === 'ip:200.1.1.1', 'token inválido: por IP');
  ok((await t({ originalUrl: '/v1/auth/ingresar', body: { email: ' Ana@X.cl ' } })) === 'i:200.1.1.1:ana@x.cl', 'ingreso: por IP + correo');
  ok((await t({ originalUrl: '/v1/salud' })) === 'ip:200.1.1.1', 'lo demás sin sesión: por IP');
  console.log('OK');
})().catch((e) => { console.error(e.message); process.exit(1); });
