// Google (calendario y Drive) contra un Google FALSO (sin red, sin base de datos): el servicio crea, actualiza y borra el evento en el
// calendario del corredor, sube copias del PDF a las carpetas de Drive de la empresa y del usuario, no hace nada si no hay Google
// conectado y nunca lanza si Google falla. Uso: node test/google-unit.js (necesita `dist`: nest build o yarn dev).
const http = require('http');
const { GoogleService } = require('../dist/conexiones/google');
const { GoogleOAuth, GoogleEmpresaOAuth } = require('../dist/conexiones/google.oauth');
const { rutaDrive, tipoDeDocumento } = require('../dist/documentos/drive');
const { FirmasRondaService } = require('../dist/firmas/ronda');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };

(async () => {
  const log = []; let n = 0;
  const falso = http.createServer((req, res) => {
    const trozos = []; req.on('data', (c) => trozos.push(c)); req.on('end', () => {
      const cuerpo = Buffer.concat(trozos); const url = new URL(req.url, 'http://x');
      log.push({ m: req.method, ruta: url.pathname, q: url.search, auth: req.headers.authorization, cuerpo: cuerpo.toString('utf8') });
      const j = (s, o) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (url.pathname === '/calendar/v3/calendars/primary/events' && req.method === 'POST') return j(200, { id: 'gev' + ++n });
      if (/^\/calendar\/v3\/calendars\/primary\/events\//.test(url.pathname)) return j(req.method === 'DELETE' ? 204 : 200, {});
      if (url.pathname === '/drive/v3/files' && req.method === 'GET') return j(200, { files: [] });
      if (url.pathname === '/drive/v3/files' && req.method === 'POST') return j(200, { id: 'carpeta' + ++n });
      if (url.pathname === '/upload/drive/v3/files') return j(200, { id: 'archivo', webViewLink: 'https://drive.google.com/file/d/archivo/view' });
      return j(404, {});
    });
  });
  await new Promise((r) => falso.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + falso.address().port;

  const filas = { 'ev1': { id: 'ev1', corredoraId: 'c1', corredorId: 'u1', tipo: 'visita', estado: 'programado', fecha: new Date('2026-12-05T00:00:00Z'), hora: '11:00', propiedadId: 'p1', personaIds: ['11111111-1111-1111-1111-111111111111'], datos: { titulo: 'Visita CV-1', lugar: 'Av. Prueba 123', notas: 'Llevar llaves', duracion: 60 }, eliminadoEn: null } };
  const db = {
    evento: { update: async ({ where, data }) => { Object.assign(filas[where.id], data); return filas[where.id]; }, findUnique: async ({ where }) => filas[where.id] },
    propiedad: { findUnique: async () => ({ codigo: 'CV-1', titulo: 'Depto en Providencia' }), findFirst: async () => ({ codigo: 'CV-1', titulo: 'Depto en Providencia' }) },
    negocio: { findFirst: async () => ({ tipo: 'arriendo', clienteId: 'cli1' }) },
    persona: { findMany: async () => [{ nombre: 'Ana Visitante', telefono: '+56911112222' }], findUnique: async () => ({ nombre: 'Ana Pérez' }) },
  };
  let conectados = new Set(['google:u1', 'google:u2', 'google_corredora:null']);
  const conexiones = {
    hay: () => true,
    acceso: async (prov, d) => { if (!conectados.has(prov + ':' + d.usuarioId)) throw new Error('sin conexión'); return 'tok-' + prov; },
  };
  const config = { get: (k) => ({ NODE_ENV: 'development', GOOGLE_API_URL: base })[k] };
  const g = new GoogleService(db, conexiones, config);

  // ---- el calendario del corredor
  await g.sincronizarEvento(filas.ev1);
  let post = log.find((x) => x.m === 'POST' && x.ruta.endsWith('/events'));
  let cuerpo = JSON.parse(post.cuerpo);
  ok(post && post.auth === 'Bearer tok-google', 'crea el evento en el Google Calendar con la sesión de ese corredor');
  ok(cuerpo.summary === 'Visita CV-1' && cuerpo.location === 'Av. Prueba 123' && /Llevar llaves/.test(cuerpo.description) && /Ana Visitante/.test(cuerpo.description) && /CV-1/.test(cuerpo.description), 'lleva título, lugar, notas, propiedad y persona');
  ok(cuerpo.start.dateTime === '2026-12-05T11:00:00' && cuerpo.end.dateTime === '2026-12-05T12:00:00' && cuerpo.start.timeZone === 'America/Santiago', 'horario de Chile: 11:00 a 12:00 (60 min)');
  ok(filas.ev1.datos.googleEventId === 'gev1', 'el id del evento de Google queda anotado en el evento');
  filas.ev1.hora = '23:30'; await g.sincronizarEvento(filas.ev1);
  const patch = log.find((x) => x.m === 'PATCH'); cuerpo = JSON.parse(patch.cuerpo);
  ok(patch && patch.ruta.endsWith('/events/gev1') && cuerpo.end.dateTime === '2026-12-06T00:30:00', 'al reprogramar lo actualiza (y el fin cruza la medianoche bien)');
  filas.ev1.hora = null; await g.sincronizarEvento(filas.ev1);
  cuerpo = JSON.parse(log.filter((x) => x.m === 'PATCH').pop().cuerpo);
  ok(cuerpo.start.date === '2026-12-05' && cuerpo.end.date === '2026-12-06', 'sin hora es un evento de todo el día');
  filas.ev1.estado = 'cancelado'; await g.sincronizarEvento(filas.ev1);
  ok(log.some((x) => x.m === 'DELETE' && x.ruta.endsWith('/events/gev1')) && !filas.ev1.datos.googleEventId, 'una visita cancelada se borra de Google y se quita el id');
  const antes = log.length; await g.sincronizarEvento({ ...filas.ev1, estado: 'programado', corredorId: 'u9', datos: {} });
  ok(log.length === antes, 'si el corredor no conectó Google, no hace nada (y no falla)');
  await g.sincronizarEvento({ ...filas.ev1, corredorId: null });
  ok(log.length === antes, 'un evento sin corredor tampoco');

  // ---- Drive: empresa y usuario
  log.length = 0;
  const r = await g.subirDocumento({ corredoraId: 'c1', usuarioId: 'u1', nombre: 'Orden de visita nº 5 - CV-1.pdf', bytes: Buffer.from('%PDF-1.4 prueba'), ref: { tipo: 'Órdenes de visita', propiedadId: 'p1', negocioId: 'n1' } });
  ok(r.length === 2 && r[0].donde === 'Drive de la empresa' && r[1].donde === 'tu Drive' && /drive\.google\.com/.test(r[0].enlace), 'sube una copia al Drive de la empresa y otra al del usuario');
  const carpetas = log.filter((x) => x.m === 'POST' && x.ruta === '/drive/v3/files').map((x) => JSON.parse(x.cuerpo).name);
  ok(JSON.stringify(carpetas.slice(0, 4)) === JSON.stringify(['Portalfirma Asset', 'Propiedades', 'CV-1 · Depto en Providencia', 'Arriendo · Ana Pérez']), 'ordena por carpetas: Portalfirma Asset / Propiedades / CV-1 · título / Arriendo · Cliente (una carpeta por negocio)');
  const subcarpetas = log.filter((x) => x.m === 'POST' && x.ruta === '/drive/v3/files').slice(0, 4).map((x) => JSON.parse(x.cuerpo).parents?.[0]);
  ok(subcarpetas[0] === undefined && subcarpetas.slice(1).every(Boolean), 'cada carpeta cuelga de la anterior (la primera, de la raíz del Drive)');
  ok(JSON.stringify(rutaDrive('Mandatos de arriendo', { codigo: 'CV-1', titulo: 'Depto / Providencia' })) === JSON.stringify(['Propiedades', 'CV-1 · Depto Providencia', 'Mandatos de arriendo']), 'lo que no es de un negocio (mandato) va en una carpeta por tipo dentro de la propiedad, sin barras en el nombre');
  ok(tipoDeDocumento('Carta oferta nº 3') === 'Cartas oferta' && tipoDeDocumento('Orden de visita nº 5') === 'Órdenes de visita' && tipoDeDocumento('Contrato de arriendo nº 1') === 'Contratos de arriendo' && tipoDeDocumento('Algo raro') === null, 'reconoce el tipo de documento por su nombre');
  ok(JSON.stringify(rutaDrive('Cartas oferta', null)) === JSON.stringify(['Otros documentos', 'Cartas oferta']) && rutaDrive('Mandatos de arriendo', { codigo: 'PF-9' })[1] === 'PF-9', 'sin propiedad va a «Otros documentos»; sin título, solo el código');
  const sube = log.find((x) => x.ruta === '/upload/drive/v3/files');
  ok(/multipart\/related/.test(JSON.stringify(sube)) || /Orden de visita/.test(sube.cuerpo), 'el PDF viaja en una subida multipart con su nombre');
  ok(log.some((x) => x.auth === 'Bearer tok-google_corredora') && log.some((x) => x.auth === 'Bearer tok-google'), 'cada copia usa su propia sesión (empresa y usuario)');
  conectados = new Set(['google:u2']);
  const solo = await g.subirDocumento({ corredoraId: 'c1', usuarioId: 'u2', nombre: 'x.pdf', bytes: Buffer.from('x') });
  ok(solo.length === 1 && solo[0].donde === 'tu Drive', 'si la empresa no conectó su Drive, queda solo en el del usuario');
  conectados = new Set();
  ok((await g.subirDocumento({ corredoraId: 'c1', usuarioId: 'u1', nombre: 'x.pdf', bytes: Buffer.from('x') })).length === 0, 'sin nada conectado no sube nada (y no falla)');

  // ---- el documento firmado: se baja de Portalfirma y se sube a la carpeta del negocio
  conectados = new Set(['google:u1', 'google_corredora:null']); log.length = 0;
  const pf = { archivoDeCorredora: async (c, contrato) => { if (contrato !== 'ct-9') throw new Error('contrato inesperado ' + contrato); return { nombre: 'x.pdf', base64: Buffer.from('%PDF firmado').toString('base64') }; } };
  const ronda = new FirmasRondaService(db, pf, {}, {}, g, { get: () => 0 });
  await ronda.copiarFirmadoADrive({ corredoraId: 'c1', enviadoPorId: 'u1', documento: 'Carta oferta nº 3', operacion: 123, propiedadIds: ['p1'], negocioId: 'n1' }, { processId: 'ct-9' });
  const nombres = log.filter((x) => x.ruta === '/upload/drive/v3/files').map((x) => /"name":"([^"]+)"/.exec(x.cuerpo)?.[1]);
  ok(nombres.length === 2 && nombres.every((n) => n === 'Carta oferta nº 3 (firmado) - CV-1.pdf'), 'al quedar firmado, sube el PDF firmado («… (firmado)») al Drive de la empresa y al del usuario');
  ok(log.filter((x) => x.m === 'POST' && x.ruta === '/drive/v3/files').map((x) => JSON.parse(x.cuerpo).name).slice(0, 4).join(' / ') === 'Portalfirma Asset / Propiedades / CV-1 · Depto en Providencia / Arriendo · Ana Pérez', 'y lo deja en la carpeta de su negocio');
  log.length = 0; await ronda.copiarFirmadoADrive({ corredoraId: 'c1', enviadoPorId: 'u1', documento: 'Carta oferta nº 3', operacion: 1, propiedadIds: [], negocioId: null }, {});
  ok(log.length === 0, 'si Portalfirma no da el contrato, no sube nada (y no falla)');

  // ---- si Google falla, nunca lanza
  conectados = new Set(['google:u1']); falso.close(); await new Promise((res) => setTimeout(res, 50));
  filas.ev1.estado = 'programado'; filas.ev1.corredorId = 'u1'; filas.ev1.datos = {};
  await g.sincronizarEvento(filas.ev1); ok(true, 'con Google caído, el calendario no lanza');
  ok((await g.subirDocumento({ corredoraId: 'c1', usuarioId: 'u1', nombre: 'x.pdf', bytes: Buffer.from('x') })).length === 0, 'con Google caído, Drive tampoco lanza');

  // ---- el proveedor OAuth: permisos distintos para el usuario y para la empresa
  const cfg = { get: (k) => ({ NODE_ENV: 'development', GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'sec' })[k] };
  const u = new GoogleOAuth(cfg); const e = new GoogleEmpresaOAuth(cfg);
  ok(u.configurado && u.dueno === 'usuario' && e.dueno === 'corredora', 'hay un proveedor por usuario y otro de la empresa');
  const au = new URL((await u.autorizar({ redirectUri: 'http://x/cb', state: 's' })).url); const ae = new URL((await e.autorizar({ redirectUri: 'http://x/cb', state: 's' })).url);
  ok(/calendar\.events/.test(au.searchParams.get('scope')) && /drive\.file/.test(au.searchParams.get('scope')), 'el usuario pide calendario y Drive (permisos acotados)');
  ok(!/calendar/.test(ae.searchParams.get('scope')) && /drive\.file/.test(ae.searchParams.get('scope')), 'la empresa pide solo Drive');
  ok(au.searchParams.get('access_type') === 'offline' && au.searchParams.get('prompt') === 'consent' && au.searchParams.get('code_challenge_method') === 'S256', 'sin conexión (refresh token), con consentimiento y PKCE');
  ok(!new GoogleOAuth({ get: () => undefined }).configurado, 'sin las credenciales de la app de Google, no se registra');
  console.log('OK google');
})().catch((e) => { console.error(e.message); process.exit(1); });
