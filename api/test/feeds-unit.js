// Feeds para los portales (Chilepropiedades, Broku…): el XML solo trae lo publicado en ese portal, sin datos del propietario,
// y la dirección pública lleva una clave secreta que solo ve el administrador (sin base de datos: db falsa).
// Requiere compilar antes (yarn build o la API en yarn dev, que deja dist/).
const { construirFeed, FeedsController, PORTALES_FEED } = require('../dist/propiedades/feeds');
const ok = (v, m) => { if (!v) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };

const prop = (o = {}) => ({
  id: 'p1', codigo: 'CV-1', titulo: 'Depto en Ñuñoa', tituloPortal: null, tipo: 'departamento', venta: true, arriendo: false, precioVenta: '4500', monedaVenta: 'UF',
  precioArriendo: null, monedaArriendo: null, estadoVenta: 'disponible', estadoArriendo: null, direccion: 'Irarrázaval 1', unidad: '45', comuna: 'Ñuñoa', lat: -33.45, lng: -70.6,
  supTotal: '80', supUtil: '70', dormitorios: 2, banos: 1, estacionamientos: 1, amoblado: false, gastosComunes: '90000.4', descripcion: 'Luminoso ]]> y céntrico', notasInternas: 'SECRETO',
  ficha: { propietarioNombre: 'Dueño Secreto', propietarioRut: '1-9' }, portales: { chilepropiedades: { venta: { status: 'en_feed', destacado: true } }, broku: { venta: { status: 'pausada' } } },
  fotos: [{ url: 'https://f.test/1.jpg' }, { url: 'http://inseguro.test/2.jpg' }], ...o,
});
const contacto = { nombre: 'Corredora Demo', email: 'ventas@demo.cl', whatsapp: '+56 9 3480 0626', telefono: '+56 2 2222 2222' };

(async () => {
  const a = construirFeed('chilepropiedades', [prop()], contacto);
  ok(a.avisos === 1 && /<referenceId><!\[CDATA\[ CV-1-V \]\]><\/referenceId>/.test(a.xml), 'un aviso en el feed, con su código y la letra de la operación (CV-1-V)');
  ok(/currency="CLF" operation="Venta"><!\[CDATA\[ 4500 \]\]>/.test(a.xml) && /<propertyType><!\[CDATA\[ Departamento/.test(a.xml), 'precio en UF (CLF) y tipo');
  ok(/<address><!\[CDATA\[ Irarrázaval 1 45 \]\]>/.test(a.xml) && /<commune><!\[CDATA\[ Ñuñoa/.test(a.xml), 'dirección con unidad y comuna');
  ok(/<picture><url><!\[CDATA\[ https:\/\/f\.test\/1\.jpg/.test(a.xml) && !/inseguro/.test(a.xml), 'solo fotos https');
  ok(/<featured><!\[CDATA\[ true/.test(a.xml) && /<communityFeesPrice><!\[CDATA\[ 90000 /.test(a.xml), 'destacado y gastos comunes redondeados');
  ok(!/SECRETO|Dueño Secreto|1-9/.test(a.xml), 'nunca salen las notas internas ni los datos del propietario');
  ok(/<usableFloorArea unit="m2"><!\[CDATA\[ 70 /.test(a.xml) && /<plotArea unit="m2"><!\[CDATA\[ 80 /.test(a.xml) && !/<floorArea/.test(a.xml), 'depto: la superficie útil va en usableFloorArea y el total en plotArea (no como construida)');
  const conK = construirFeed('chilepropiedades', [prop({ captador: { nombre: 'Ana Pérez', email: 'ana@demo.cl', telefono: '+56 9 1111 2222' } })], contacto).xml;
  ok(/<contact><name><!\[CDATA\[ Ana Pérez/.test(conK) && /<email><!\[CDATA\[ ana@demo\.cl/.test(conK) && /<phone whatsapp="true"><!\[CDATA\[ \+56 9 1111 2222/.test(conK) && !/ventas@demo\.cl/.test(conK), 'el contacto del aviso es el corredor que captó la propiedad (celular = WhatsApp)');
  ok(/<contact><name><!\[CDATA\[ Corredora Demo/.test(a.xml) && /ventas@demo\.cl/.test(a.xml), 'sin captador, el contacto es el de la corredora');
  const casa = construirFeed('chilepropiedades', [prop({ tipo: 'casa', ficha: { anio: 2005, pisos: 2, pisoUnidad: 3 } })], contacto).xml;
  ok(/<floorArea unit="m2"><!\[CDATA\[ 70 /.test(casa) && !/<usableFloorArea/.test(casa), 'casa: la superficie construida va en floorArea');
  ok(/<constructionYear><!\[CDATA\[ 2005 /.test(casa) && /<levels><!\[CDATA\[ 2 /.test(casa) && /<floorNumber><!\[CDATA\[ 3 /.test(casa), 'año de construcción, niveles y piso salen como enteros');
  const sitio = construirFeed('chilepropiedades', [prop({ tipo: 'sitio', supUtil: null })], contacto).xml;
  ok(/<plotArea unit="m2"><!\[CDATA\[ 80 /.test(sitio) && !/FloorArea/.test(sitio), 'sitio: el terreno va en plotArea');
  ok(/Luminoso \]\]\]\]><!\[CDATA\[> y céntrico/.test(a.xml), 'el texto con «]]>» queda escapado (el XML no se rompe)');
  ok(construirFeed('broku', [prop()], contacto).avisos === 0, 'una publicación pausada no está en el feed');
  ok(construirFeed('toctoc', [prop()], contacto).avisos === 0, 'lo publicado en otro portal no entra a este');
  ok(construirFeed('chilepropiedades', [prop({ estadoVenta: 'vendida' })], contacto).avisos === 0, 'una propiedad vendida sale del feed');
  ok(construirFeed('chilepropiedades', [prop({ precioVenta: null })], contacto).avisos === 0 && construirFeed('chilepropiedades', [prop({ comuna: null })], contacto).avisos === 0, 'sin precio o sin comuna no se publica (el portal la rechazaría)');
  ok(construirFeed('chilepropiedades', [prop({ tituloPortal: 'x'.repeat(100) })], contacto).xml.match(/<title><!\[CDATA\[ (x+) /)[1].length === 65, 'el título respeta el máximo del portal (65 en Chilepropiedades)');
  const ambos = construirFeed('chilepropiedades', [prop({ arriendo: true, estadoArriendo: 'disponible', precioArriendo: '600000', monedaArriendo: 'CLP', portales: { chilepropiedades: { venta: { status: 'publicada' }, arriendo: { status: 'en_feed' } } } })], contacto);
  ok(ambos.avisos === 2 && /CV-1-A/.test(ambos.xml) && /currency="CLP" operation="Arriendo"/.test(ambos.xml), 'venta y arriendo de una propiedad salen como dos avisos');
  ok(PORTALES_FEED.includes('broku') && PORTALES_FEED.includes('chilepropiedades'), 'Broku y Chilepropiedades están entre los portales con feed');

  // controlador con la base falsa
  const filas = new Map(); const props = [prop()];
  const db = {
    registro: {
      findUnique: async ({ where }) => { const k = where.corredoraId_coleccion_id; if (k.coleccion === 'corredora_config') return { datos: { contacto } }; return filas.get(k.corredoraId + k.coleccion) || null; },
      upsert: async ({ where, create, update }) => { const k = where.corredoraId_coleccion_id; const f = filas.get(k.corredoraId + k.coleccion); filas.set(k.corredoraId + k.coleccion, f ? { ...f, datos: update.datos } : { corredoraId: k.corredoraId, datos: create.datos }); },
      findFirst: async ({ where }) => [...filas.values()].find((f) => f.datos.token === where.datos.equals) || null,
    },
    propiedad: { findMany: async () => props },
    corredora: { findUnique: async () => ({ nombre: 'Corredora Demo SpA' }) },
  };
  const c = new FeedsController(db, { get: () => 'https://api.test/v1' });
  const u = { sub: 'adm', corredoraId: 'c1', rol: 'ADMIN', sid: 's' };
  const r1 = await c.direcciones(u); const r2 = await c.direcciones(u);
  const url = r1.feeds.chilepropiedades.url;
  ok(/^https:\/\/api\.test\/v1\/feeds\/[A-Za-z0-9_-]{30,}\/chilepropiedades\.xml$/.test(url) && url === r2.feeds.chilepropiedades.url, 'una dirección por portal con clave larga, y es la misma cada vez');
  ok(r1.feeds.chilepropiedades.avisos === 1 && r1.feeds.broku.avisos === 0 && Object.keys(r1.feeds).length === 4, 'cuenta los avisos de cada portal');
  const clave = url.split('/')[5];
  const xml = await c.leer(clave, 'chilepropiedades.xml');
  ok(/<listings>/.test(xml) && /CV-1-V/.test(xml), 'el portal lee el XML con la clave, sin sesión');
  ok(/<agencyName><!\[CDATA\[ Corredora Demo SpA \]\]><\/agencyName><agencyId><!\[CDATA\[ c1 \]\]>/.test(xml), 'la agencia lleva el nombre de la corredora y su id');
  const mala = await c.leer('x'.repeat(30), 'chilepropiedades.xml').then(() => null, (e) => e.status || e.getStatus?.());
  const otro = await c.leer(clave, 'desconocido.xml').then(() => null, (e) => e.status || e.getStatus?.());
  const corta = await c.leer('corta', 'chilepropiedades.xml').then(() => null, (e) => e.status || e.getStatus?.());
  ok(mala === 404 && otro === 404 && corta === 404, 'una clave equivocada o un portal que no existe responden 404');
  const r3 = await c.rotar(u); const nueva = r3.feeds.chilepropiedades.url.split('/')[5];
  ok(nueva !== clave && await c.leer(clave, 'chilepropiedades.xml').then(() => false, () => true) && /listings/.test(await c.leer(nueva, 'chilepropiedades.xml')), 'rotar la clave deja sin efecto la dirección anterior');
  console.log('OK');
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
