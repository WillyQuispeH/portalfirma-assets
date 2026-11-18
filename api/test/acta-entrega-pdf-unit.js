// Acta de entrega e inventario: los datos del negocio (formato nuevo y antiguo) se convierten en variables, la plantilla HTML
// se llena y se convierte en PDF (sin red ni base de datos).
// Requiere compilar antes (yarn build) y un Chromium: PDF_CHROMIUM=/ruta/al/chrome. Sin Chromium: SIN_PDF=1 se salta el PDF.
const { llenar, cargarPlantilla } = require('../dist/documentos/plantilla');
const { varsActaEntrega, fotosParaPdf, faltaEnEntrega, FOTOS_POR_ESPACIO } = require('../dist/negocios/acta-entrega-datos');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
// una imagen PNG de 1×1 (lo que el servicio incrusta ya achicado)
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
(async () => {
  const comun = {
    numero: 7, hoy: '2026-11-17',
    corredora: { nombre: 'Inmobiliaria <Ejemplo> SpA', rut: '77.494.165-7', domicilio: 'Av. Presidente Kennedy 7600, piso 7, Vitacura', logo: '' },
    duenos: [{ nombre: 'Rosa Propietaria', rut: '11.111.111-1' }],
    arrendatario: { nombre: 'Matías Serrano', rut: '7.654.321-6' },
    propiedad: { codigo: 'PF-1001', tipo: 'departamento', direccion: 'Av. Apoquindo 3000', unidad: '504', comuna: 'Las Condes', estacionamientos: 1, bodegas: 0 },
    usuario: { nombre: 'Ana Corredora' },
  };
  // formato NUEVO: espacios con ítems y fotos
  const nuevo = {
    fecha: '2026-12-01', entregadoPor: { nombre: 'Francisca Zenteno', rut: '17.704.454-7' },
    accesos: [{ nombre: 'Llaves puerta principal', cantidad: '2' }, { nombre: 'Control remoto portón', cantidad: '1' }, { nombre: 'Chip de acceso', cantidad: '' }],
    llaves: 'Además, 1 llave del buzón.', estacionamientos: 'E-12', bodega: 'B-30', gastosComunesDesde: '2026-12-05',
    aspectos: ['Grifería completa funcionando', 'Se entrega con aseo profundo realizado'],
    medidores: { luz: { numero: '123', lectura: '4.500' }, agua: { numero: '77', lectura: '210' }, aguaCaliente: { numero: '', lectura: '88' }, calefaccion: { numero: '', lectura: '' } },
    inventario: [
      { espacio: 'Cocina', estado: 'regular', nota: 'Mancha en el mesón', items: [{ nombre: 'Enchufes', cantidad: '4', estado: 'bueno', nota: '' }, { nombre: 'Focos apliques', cantidad: '', estado: 'na', nota: '' }, { nombre: 'Equipamiento', cantidad: '1', estado: 'malo', nota: 'Horno sin perilla' }], fotos: [{ clave: 'c/1.jpg', nombre: '1.jpg' }, { clave: 'c/2.jpg', nombre: '2.jpg' }] },
      { espacio: 'Living', estado: 'bueno', items: [{ nombre: 'Pisos', cantidad: '', estado: 'bueno', nota: '' }], fotos: Array.from({ length: 9 }, (_, i) => ({ clave: `l/${i}.jpg`, nombre: `${i}.jpg` })) },
      { espacio: '   ', estado: 'bueno' },
    ],
    observaciones: 'Pintura reciente.',
  };
  ok(faltaEnEntrega(nuevo) === '' && /fecha/.test(faltaEnEntrega({ inventario: nuevo.inventario })) && /vacío/.test(faltaEnEntrega({ fecha: '2026-12-01', inventario: [{ espacio: ' ' }] })), 'valida fecha e inventario');
  const claves = fotosParaPdf(nuevo);
  ok(claves.length === 2 + FOTOS_POR_ESPACIO, `respeta el límite de fotos por espacio (${claves.length})`);
  const imagenes = new Map(claves.map((c) => [c, PIXEL]));
  const v = varsActaEntrega({ ...comun, entrega: nuevo, imagenes });
  const html = llenar(cargarPlantilla('acta-entrega'), v);
  ok(!/\{\{|\}\}/.test(html), 'formato nuevo: no queda ninguna variable sin reemplazar');
  ok(/Horno sin perilla/.test(html) && /Agua caliente/.test(html) && /Control remoto portón/.test(html) && !/Chip de acceso/.test(html), 'ítems, medidores y accesos con cantidad aparecen');
  ok(!/Focos apliques/.test(html), 'los ítems «no aplica» no salen');
  ok(/Francisca Zenteno/.test(html) && /E-12/.test(html) && /5 de diciembre de 2026/.test(html) && /Grifería completa/.test(html), 'quien entrega, estacionamiento, gastos comunes y aspectos generales');
  ok(/Inmobiliaria &lt;Ejemplo&gt; SpA/.test(html), 'los datos se escapan');
  ok(/Registro fotográfico/.test(html) && (html.match(/<img src="data:image\/png/g) || []).length === claves.length, 'el registro fotográfico lleva las fotos por espacio');

  // formato ANTIGUO: inventario [{ espacio, estado, nota }] y medidores luz/agua/gas, sin accesos ni fotos
  const viejo = {
    fecha: '2026-12-01', llaves: '2 llaves de la puerta principal', observaciones: '',
    medidores: { luz: { numero: '', lectura: '' }, agua: { numero: '', lectura: '' }, gas: { numero: '9', lectura: '15' } },
    inventario: [{ espacio: 'Living-comedor', estado: 'bueno', nota: '' }, { espacio: 'Cocina', estado: 'regular', nota: 'Mancha en el mesón' }],
  };
  ok(faltaEnEntrega(viejo) === '' && fotosParaPdf(viejo).length === 0, 'el formato antiguo se acepta');
  const hv = llenar(cargarPlantilla('acta-entrega'), varsActaEntrega({ ...comun, usuario: { nombre: 'Ana Corredora' }, entrega: viejo }));
  ok(!/\{\{|\}\}/.test(hv), 'formato antiguo: no queda ninguna variable sin reemplazar');
  ok(/Living-comedor/.test(hv) && /Mancha en el mesón/.test(hv) && /2 llaves de la puerta principal/.test(hv) && />Gas</.test(hv), 'formato antiguo: espacios, llaves y medidores aparecen');
  ok(/Ana Corredora/.test(hv) && !/Registro fotográfico/.test(hv) && !/>Observaciones</.test(hv) && !/Aspectos generales/.test(hv), 'sin fotos, observaciones ni aspectos, esos bloques no salen; entrega el usuario');
  ok(/1 \(número no indicado\)/.test(hv), 'sin número de estacionamiento usa la cantidad de la ficha');

  if (process.env.SIN_PDF === '1') process.exit(0);
  const { PdfService } = require('../dist/documentos/pdf.service');
  const pdf = await new PdfService().pdf(html);
  ok(pdf.slice(0, 4).toString() === '%PDF', 'el PDF se genera');
  if (process.env.GUARDAR_PDF) require('fs').writeFileSync(process.env.GUARDAR_PDF, pdf);
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
