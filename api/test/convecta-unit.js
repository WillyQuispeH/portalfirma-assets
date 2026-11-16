// Importar desde Convecta: lectura paginada con la clave en la cabecera, traducción de cada propiedad al formato de Asset y
// asignación del corredor por correo (sin red externa ni base de datos: Convecta es un servidor local falso).
// Requiere compilar antes (yarn build o la API en yarn dev, que deja dist/).
const http = require('http');
const { ConvectaService, aPropiedadAsset } = require('../dist/propiedades/convecta');
const { PropiedadesService } = require('../dist/propiedades/propiedades.service');
const ok = (v, m) => { if (!v) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };

const media = (n, type = 'Image', visibility = 1) => ({ idPropertyMedia: n, name: 'f' + n, url: `https://fotos.test/${n}.jpg`, order: n, type, visibility });
const prop = (id, extra = {}) => ({
  idProperty: id, idType: 2, sale: true, rent: false, visible: true, street: 'Los Lomajes', number: 1168, unit: 0, letter: '', role: '123-45',
  idBorough: 311, observations: '<p>Linda casa&nbsp;con <b>piscina</b></p><p>Quincho</p>', propertyTitle: 'Departamento en Lo Barnechea',
  priceSale: 21900, priceRent: 0, currencySale: { name: 'UF', symbol: 'UF' }, currencyRent: { name: 'Peso', symbol: '$' },
  coordinatesLat: '-33,39356598711942', coordinatesLong: '-70,51248232763004',
  user: { fullName: 'Ana Pérez', email: 'Ana@Correo.cl', phone1: '+56911112222' },
  characteristics: { totalSurface: 120, utildSurface: 90, bedrooms: 3, bathrooms: 2, parkings: 1, warehouses: 0 },
  propertyMedia: [media(2), media(1), media(3, 'Document'), media(4, 'Image', 0)],
  ...extra,
});
const TODAS = [prop(101), prop(102, { idType: 4, propertyTitle: 'Sitio en Colina', idBorough: 292, user: { fullName: 'Luis Soto', email: 'luis@otro.cl' } }),
  prop(103, { idType: 9, propertyTitle: 'Local en Providencia', idBorough: 999, rent: true, sale: false, priceRent: 800000, currencyRent: { name: 'Peso', symbol: '$' }, visible: false, user: null })];

(async () => {
  const vistas = [];
  const srv = http.createServer((req, res) => {
    let cuerpo = ''; req.on('data', (d) => (cuerpo += d)); req.on('end', () => {
      const u = new URL(req.url, 'http://x'); vistas.push({ metodo: req.method, ruta: u.pathname, pag: u.searchParams.get('pageNumber'), tam: u.searchParams.get('pageSize'), clave: req.headers['ocp-apim-subscription-key'] });
      if (req.headers['ocp-apim-subscription-key'] !== 'clave-buena') { res.writeHead(401); return res.end('{}'); }
      const pag = Number(u.searchParams.get('pageNumber'));
      const items = pag === 1 ? TODAS.slice(0, 2) : TODAS.slice(2); // 2 páginas
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ items, totalPages: 2, totalRecords: 3, pageNumber: pag, pageSize: 2 }));
    });
  });
  await new Promise((r) => srv.listen(0, r)); const url = `http://127.0.0.1:${srv.address().port}/web/v1`;
  const cfg = (o) => ({ get: (k) => o[k] });
  try {
    const cv = new ConvectaService(cfg({ CONVECTA_API_URL: url, CONVECTA_SUBSCRIPTION_KEY: 'clave-buena' }));
    const leidas = await cv.propiedades();
    ok(leidas.length === 3 && vistas.length === 2, 'lee todas las páginas (2 llamadas, 3 propiedades)');
    ok(vistas.every((v) => v.metodo === 'POST' && v.ruta === '/web/v1/properties' && v.tam === '50' && v.clave === 'clave-buena'), 'POST /properties?pageNumber=N&pageSize=50 con la clave en la cabecera');
    const sinClave = await new ConvectaService(cfg({ CONVECTA_API_URL: url })).propiedades().then(() => null, (e) => e.message);
    ok(/no está configurado/.test(sinClave), 'sin clave en el servidor avisa que Convecta no está configurado');
    const mala = await new ConvectaService(cfg({ CONVECTA_API_URL: url, CONVECTA_SUBSCRIPTION_KEY: 'mala' })).propiedades().then(() => null, (e) => e.message);
    ok(/rechazó la clave/.test(mala), 'una clave rechazada se explica con claridad');

    const a = aPropiedadAsset(TODAS[0]);
    ok(a.codigo === 'CV-101' && a.tipo === 'departamento' && a.venta === true && a.arriendo === false, 'código CV-<id>, tipo y operación');
    ok(a.precioVenta.valor === 21900 && a.precioVenta.moneda === 'UF' && a.precioArriendo === null, 'precio de venta en UF; el arriendo en 0 no se importa');
    ok(a.direccion === 'Los Lomajes 1168' && a.unidad === null && a.comuna === 'Lo Barnechea' && a.region === 'Metropolitana de Santiago', 'dirección, sin unidad 0, comuna y región');
    ok(a.lat === -33.39356598711942 && a.lng === -70.51248232763004, 'las coordenadas con coma decimal se leen');
    ok(a.descripcion === 'Linda casa con piscina\nQuincho', 'la descripción HTML pasa a texto');
    ok(JSON.stringify(a.fotos) === JSON.stringify(['https://fotos.test/1.jpg', 'https://fotos.test/2.jpg']), 'solo imágenes visibles, en orden');
    ok(a.supTotal === 120 && a.supUtil === 90 && a.dormitorios === 3 && a.banos === 2 && a.estacionamientos === 1 && a.bodegas === null, 'superficies y ambientes (0 = sin dato)');
    ok(aPropiedadAsset(TODAS[1]).tipo === 'sitio' && aPropiedadAsset(TODAS[1]).comuna === 'Colina', 'tipo 4 = sitio y comuna conocida');
    const c = aPropiedadAsset(TODAS[2]);
    ok(c.tipo === 'local_comercial' && c.comuna === 'Providencia' && c.region === null && c.arriendo === true && c.precioArriendo.moneda === 'CLP', 'tipo y comuna desconocidos se deducen del título; arriendo en pesos');

    // importación completa: el corredor se asigna por correo
    const enviados = [];
    const svc = new PropiedadesService({ usuario: { findMany: async () => [{ id: 'u-ana', email: ' ana@correo.cl ' }, { id: 'u-otro', email: 'otro@x.cl' }] } }, {}, {}, cv);
    svc.importar = async (_u, { sistema, items }) => { enviados.push({ sistema, items }); return { nuevas: items.length, actualizadas: 0, sinCambios: 0, personas: 0, captadores: items.filter((i) => i.captadorId).length, total: items.length }; };
    const r = await svc.importarConvecta({ sub: 'adm', corredoraId: 'c1', rol: 'ADMIN', sid: 's' });
    const items = enviados[0].items;
    ok(enviados[0].sistema === 'convecta' && items.length === 3, 'importa con el sistema «convecta»');
    ok(items[0].captadorId === 'u-ana', 'el correo coincide sin importar mayúsculas ni espacios → captador asignado');
    ok(items[1].captadorId === null && items[2].captadorId === null, 'sin coincidencia o sin correo queda sin captador');
    ok(items[2].archivada === true && items[0].archivada === false, 'la no visible llega archivada');
    ok(r.captadores === 1 && r.sinCaptador === 2 && r.sinCorredor.length === 2 && r.sinCorredor.some((f) => f.email === 'luis@otro.cl' && f.propiedades === 1), 'informa los correos que no existen en Asset');
    const noAdmin = await svc.importarConvecta({ sub: 'x', corredoraId: 'c1', rol: 'CORREDOR', sid: 's' }).then(() => null, (e) => e.message);
    ok(/administrador/.test(noAdmin), 'solo el administrador puede importar');
    console.log('OK');
  } finally { srv.close(); }
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
