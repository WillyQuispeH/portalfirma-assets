// Tipos de documento (Configuración › Documentos): siembra por defecto, reconocer el tipo que leyó la IA, firma por tipo, la firma de los
// tipos con plantilla (un solo lugar: la plantilla), permisos, aislamiento entre corredoras y la lectura de firmantes que trae `tipoConocido`.
// Sin red ni base (base falsa). Requiere compilar antes (yarn build o la API en yarn dev, que deja dist/).
const { TiposDocumentoService, TIPOS_POR_DEFECTO, reconocerEn } = require('../dist/documentos/tipos-documento');
const { PlantillasDocService, configFirma } = require('../dist/documentos/plantillas-doc');
const { ExtraerFirmantesService } = require('../dist/documentos/extraer-firmantes');
const ok = (v, m) => { if (!v) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };

(async () => {
  const regs = new Map();
  const k = (w) => `${w.corredoraId}|${w.coleccion}|${w.id}`;
  const db = {
    registro: {
      findUnique: async ({ where }) => regs.get(k(where.corredoraId_coleccion_id)) ?? null,
      findMany: async ({ where }) => [...regs.values()].filter((r) => r.corredoraId === where.corredoraId && r.coleccion === where.coleccion),
      createMany: async ({ data }) => { for (const d of data) if (!regs.has(k(d))) regs.set(k(d), { ...d, creadoEn: new Date() }); },
      create: async ({ data }) => { regs.set(k(data), { ...data, creadoEn: new Date() }); },
      update: async ({ where, data }) => { const w = where.corredoraId_coleccion_id; regs.set(k(w), { ...regs.get(k(w)), datos: data.datos }); },
      upsert: async ({ where, create, update }) => { const w = where.corredoraId_coleccion_id; const prev = regs.get(k(w)); regs.set(k(w), prev ? { ...prev, datos: update.datos } : { ...create }); },
      delete: async ({ where }) => { regs.delete(k(where.corredoraId_coleccion_id)); },
    },
    usuario: { findUnique: async () => ({ nombre: 'Tomás Admin' }) },
  };
  const plantillas = new PlantillasDocService(db, { pdf: async () => Buffer.from('%PDF') });
  const s = new TiposDocumentoService(db, plantillas);
  const admin = { sub: 'u1', corredoraId: 'TL', rol: 'ADMIN' };
  const corredor = { sub: 'u2', corredoraId: 'TL', rol: 'CORREDOR' };

  // ---- siembra
  let l = await s.lista('TL');
  ok(l.length === TIPOS_POR_DEFECTO.length && l.some((t) => t.nombre === 'Carta oferta'), 'la primera vez la corredora recibe los tipos por defecto (con «Carta oferta»)');
  ok(JSON.stringify(l.map((t) => t.id)) === JSON.stringify(TIPOS_POR_DEFECTO.map((t) => t.id)), 'en el orden de siempre');
  ok(l.every((t) => t.tipoFirma === 'simple' && t.tramite === 'none'), 'parten con firma simple y sin trámite');
  await s.lista('TL');
  ok((await s.lista('TL')).length === TIPOS_POR_DEFECTO.length, 'volver a pedirla no duplica nada');

  // ---- reconocer
  const r = (...t) => reconocerEn(l, ...t)?.id ?? null;
  ok(r('Carta de oferta de compra') === 'carta-oferta', '«Carta de oferta de compra» es la carta oferta');
  ok(r('Mandato de venta') === 'mandato-venta' && r('MANDATO DE GESTIÓN DE VENTA de propiedad') === 'mandato-venta', 'el mandato de venta, con otras palabras y en mayúsculas');
  ok(r('Mandato de corretaje de arriendo') === 'mandato-arriendo', 'y el de arriendo no se confunde con el de venta');
  ok(r('Promesa de compra venta') === 'promesa-compraventa', 'promesa de compra venta (separado)');
  ok(r('Contrato de prestación de servicios') === null && r('') === null && r(null, undefined) === null, 'lo desconocido (o vacío) no calza con nada');
  ok((await s.reconocer('TL', 'Acta de entrega e inventario'))?.id === 'acta-entrega', 'reconocer() usa el catálogo de la corredora');

  // ---- firma por tipo
  let t = await s.actualizar(admin, 'poder', { tipoFirma: 'avanzada', tramite: 'legalization' });
  ok(t.tipoFirma === 'avanzada' && t.tramite === 'legalization', 'el administrador define firma y trámite de un tipo');
  ok((await s.reconocer('TL', 'poder notarial'))?.tipoFirma === 'avanzada', 'y el tipo reconocido trae esa firma');
  const noAdmin = await s.actualizar(corredor, 'poder', { tipoFirma: 'simple' }).then(() => null, (e) => e.message);
  ok(/administrador/.test(noAdmin), 'solo el administrador edita');
  ok((await s.lista('OTRA')).find((x) => x.id === 'poder').tipoFirma === 'simple', 'otra corredora sigue con lo suyo');

  // ---- los tipos con plantilla: la firma es la de la plantilla (un solo lugar)
  t = await s.actualizar(admin, 'carta-oferta', { tipoFirma: 'avanzada', tramite: 'none' });
  ok(t.tipoFirma === 'avanzada' && (await configFirma(db, 'TL', 'carta-oferta')).tipoFirma === 'avanzada', 'cambiar la firma de «Carta oferta» cambia la de la plantilla (los documentos que arma Asset)');
  await plantillas.guardarFirma(admin, 'mandato-venta', { tipoFirma: 'visada', tramite: 'legalization' });
  const mv = (await s.lista('TL')).find((x) => x.id === 'mandato-venta');
  ok(mv.tipoFirma === 'visada' && mv.tramite === 'legalization', 'y al revés: lo que se configura en Plantillas se ve en Documentos');

  // ---- crear / borrar
  const nuevo = await s.crear(corredor, { nombre: 'Finiquito de arriendo', tipoFirma: 'avanzada', tramite: 'none', palabras: ['finiquito'] });
  ok(nuevo.id === 'finiquito-de-arriendo' && nuevo.plantilla === null, 'cualquier usuario puede agregar un tipo nuevo');
  ok((await s.reconocer('TL', 'Finiquito de contrato de arriendo'))?.id === 'finiquito-de-arriendo', 'y se reconoce por su nombre o sus palabras');
  const igual = await s.crear(corredor, { nombre: 'finiquito DE arriendo', tipoFirma: 'simple', tramite: 'none' });
  ok(igual.id === nuevo.id && igual.tipoFirma === 'avanzada', 'agregar uno que ya existe (mismo nombre) devuelve el existente, sin cambiarlo');
  const rn = await s.actualizar(admin, 'finiquito-de-arriendo', { nombre: 'Carta oferta' }).then(() => null, (e) => e.message);
  ok(/Ya existe/.test(rn), 'no se repite el nombre al renombrar');
  const nb = await s.borrar(corredor, 'poder').then(() => null, (e) => e.message);
  ok(/administrador/.test(nb), 'solo el administrador borra');
  await s.borrar(admin, 'poder');
  ok(!(await s.lista('TL')).some((x) => x.id === 'poder') && !(await s.lista('TL')).some((x) => x.id === '_sembrado'), 'borrado: no vuelve a aparecer (ni la marca interna se ve)');
  ok((await s.borrar(admin, 'no-existe').then(() => 0, (e) => e.status ?? e.getStatus?.())) === 404, 'borrar uno inexistente es 404');

  // ---- la lectura de firmantes trae el tipo conocido
  let sistema = '';
  const ia = { leerDocumento: async (o) => { sistema = o.sistema; return { legible: true, tipoDocumento: 'Carta de oferta de compra', tipoCatalogo: 'Carta oferta', firmantes: [{ nombre: 'Ana Rojas', rut: '12.345.678-5', rol: 'oferente', email: 'ana@x.cl', pagina: 2 }], avisos: [] }; } };
  const ext = new ExtraerFirmantesService(ia, s);
  const pdf = Buffer.from('%PDF-1.4 ' + 'x'.repeat(200)).toString('base64');
  let x = await ext.extraerPdf('TL', pdf);
  ok(/TIPOS CONOCIDOS/.test(sistema) && sistema.includes('«Carta oferta»') && sistema.includes('«Finiquito de arriendo»'), 'a la IA se le pasa la lista de tipos de la corredora');
  ok(x.tipoConocido?.nombre === 'Carta oferta' && x.tipoConocido.tipoFirma === 'avanzada' && x.tipoConocido.tramite === 'none', 'el documento sale reconocido, con su firma y trámite');
  ok(x.tipoDocumento === 'Carta de oferta de compra' && x.firmantes.length === 1, 'y se siguen entregando el tipo leído y los firmantes');
  // la IA no eligió de la lista pero describió algo que calza
  ia.leerDocumento = async () => ({ legible: true, tipoDocumento: 'Mandato de gestión de venta', tipoCatalogo: '', firmantes: [], avisos: [] });
  x = await ext.extraerPdf('TL', pdf);
  ok(x.tipoConocido?.id === 'mandato-venta' && x.tipoConocido.tipoFirma === 'visada', 'si la IA no eligió, se reconoce por lo que describió');
  // un tipo inventado por la IA que no está en la lista no cuenta
  ia.leerDocumento = async () => ({ legible: true, tipoDocumento: 'Contrato de prestación de servicios', tipoCatalogo: 'Contrato inventado', firmantes: [], avisos: [] });
  x = await ext.extraerPdf('TL', pdf);
  ok(x.tipoConocido === null, 'un documento de un tipo que la corredora no tiene queda sin tipo conocido (se usan los valores de siempre)');
  ok((await ext.extraerPdf('OTRA', pdf).then((r) => r.tipoConocido)) === null, 'cada corredora se reconoce con su propio catálogo');
  const malo = await ext.extraerPdf('TL', Buffer.from('no soy pdf '.repeat(30)).toString('base64')).then(() => null, (e) => e.message);
  ok(/no es un PDF/.test(malo), 'un archivo que no es PDF se rechaza como antes');

  console.log('OK');
})().catch((e) => { console.error(e.message); process.exit(1); });
