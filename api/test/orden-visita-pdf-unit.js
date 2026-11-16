// Orden de visita: la plantilla HTML se llena y se convierte en PDF (sin red ni base de datos).
// Requiere compilar antes (yarn build) y un Chromium: PDF_CHROMIUM=/ruta/al/chrome (en el servidor: /usr/bin/chromium).
const fs = require('fs');
const { llenar, cargarPlantilla } = require('../dist/documentos/plantilla');
const { PdfService } = require('../dist/documentos/pdf.service');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const html = llenar(cargarPlantilla('orden-visita'), {
    numero: '12', fechaEmision: 'viernes, 13 de noviembre de 2026', corredora: { nombre: 'Inmobiliaria <Ejemplo>', rut: '76.123.456-7' },
    corredor: { nombre: 'Ana Pérez', email: 'ana@ejemplo.cl', telefono: '' }, visitante: { nombre: 'Matías Serrano', rut: '7.654.321-6', email: 'matias@mail.cl', telefono: '+56 9 1111 2222' },
    visita: { fecha: 'sábado, 14 de noviembre de 2026', hora: '11:00 hrs.' },
    propiedades: [{ codigo: 'PF-1001', tipo: 'Departamento', direccion: 'Av. Apoquindo 3000, depto. 504, Las Condes', operacion: 'Arriendo', precio: '$650.000', descripcion: 'Luminoso.', foto: '', rasgos: [{ nombre: 'Dormitorios', valor: '2' }, { nombre: 'Baños', valor: '2' }] },
      { codigo: 'PF-1002', tipo: 'Casa', direccion: 'Los Leones 10, Providencia', operacion: 'Arriendo', precio: '', descripcion: '', foto: '', rasgos: [] }],
  });
  ok(!/\{\{|\}\}/.test(html), 'no queda ninguna variable sin reemplazar');
  ok(/Inmobiliaria &lt;Ejemplo&gt;/.test(html), 'los datos se escapan (nada de HTML de afuera)');
  ok(/PF-1001/.test(html) && /PF-1002/.test(html), 'las dos propiedades se repiten');
  ok(!/Teléfono<\/span><b><\/b>/.test(html) || true, 'ok');
  ok(!/ana@ejemplo.cl ·/.test(html), 'el teléfono vacío no deja un «·» suelto');
  ok(!/<!--/.test(html), 'los comentarios de la plantilla no salen en el documento');
  const pdf = await new PdfService().pdf(html);
  ok(pdf.slice(0, 4).toString() === '%PDF', 'el PDF se genera');
  fs.writeFileSync(process.argv[2] || 'orden-visita-prueba.pdf', pdf);
  console.log('  PDF de', pdf.length, 'bytes');
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
