// Borrador de escritura de compraventa: la plantilla HTML se llena con datos falsos (sin red ni base de datos), no queda ninguna
// variable sin reemplazar y los bloques condicionales (crédito/contado, personería, deslindes, promesa) aparecen o no según los datos.
// Requiere compilar antes (yarn build) o tener la plantilla copiada en dist/documentos/plantillas.
// Con un segundo argumento «pdf» además arma el PDF (requiere Chromium: PDF_CHROMIUM=/ruta/al/chrome).
const fs = require('fs');
const { llenar, cargarPlantilla } = require('../dist/documentos/plantilla');
const { muestra } = require('../dist/documentos/muestras');
const { bloquesDe } = require('../dist/documentos/bloques');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const plantilla = cargarPlantilla('escritura-compraventa');
  const base = muestra('escritura-compraventa');
  base.corredora = { ...base.corredora, nombre: 'Inmobiliaria <Ejemplo> SpA' };
  const html = llenar(plantilla, base);
  ok(!/\{\{|\}\}/.test(html), 'no queda ninguna variable sin reemplazar');
  ok(/Inmobiliaria &lt;Ejemplo&gt; SpA/.test(html), 'los datos se escapan (nada de HTML de afuera)');
  ok(/Escritura de compraventa/.test(html) && /45ª Notaría de Santiago/.test(html), 'lleva el título y la notaría');
  ok(/BORRADOR|Borrador de minuta/i.test(html) && /No es la escritura pública/.test(html), 'dice que es un borrador y no la escritura pública');
  ok(/4\.850 Unidades de Fomento/.test(html) && /valor de la Unidad de Fomento/.test(html), 'precio en UF con su equivalente en pesos');
  ok(/970 Unidades de Fomento/.test(html) && /Banco Ejemplo/.test(html) && /Hipoteca y prohibición/.test(html), 'con crédito: pie, saldo, banco y la cláusula de hipoteca');
  ok(/Fojas 1234 Número 5678/.test(html) && /Los deslindes del Inmueble/.test(html) && /1 estacionamiento y 1 bodega/.test(html), 'dominio, deslindes e inmueble con sus extras');
  ok(/promesa de compraventa de fecha 20 de noviembre de 2026/.test(html) && /Personería/.test(html), 'promesa y personería aparecen');
  ok(/Ley Nº 21\.442/.test(html), 'edificio: derechos sobre bienes comunes');
  ok(/todos ellos, en conjunto/.test(html), 'varios vendedores: comparecen en conjunto');
  ok(!/<!--/.test(html), 'los comentarios de la plantilla no salen en el documento');

  // al contado, sin promesa, sin personería, sin deslindes, casa (sin copropiedad), precio en pesos, un solo vendedor
  const contado = {
    ...base,
    pago: { credito: false, contado: true, modo: 'Al contado', piePct: '100', pie: '', saldoPct: '0', saldo: '', banco: '' },
    promesa: { fecha: '', notaria: '' },
    escritura: { notaria: '[Notaría]', fecha: '[fecha]', personerias: '' },
    vendedor: { ...base.vendedor, varios: false, repr: '', nombre: 'Rosa Propietaria', texto: 'Rosa Propietaria, cédula de identidad número 9.876.543-2', lineas: [base.vendedor.lineas[0]] },
    comprador: { ...base.comprador, repr: '' },
    propiedad: { ...base.propiedad, deslindes: '', incluye: '', rol: '', supUtil: '', supTotal: '', copropiedad: false, conservador: 'Conservador de Bienes Raíces competente' },
    precio: { monto: '$200.000.000', largo: '$200.000.000 (pesos chilenos)', uf: false },
    entrega: { cuando: 'en este acto' },
  };
  const h2 = llenar(plantilla, contado);
  ok(!/\{\{|\}\}/.test(h2), 'al contado tampoco quedan variables');
  ok(/al contado, en este acto/.test(h2) && !/Hipoteca y prohibición/.test(h2) && !/crédito hipotecario/.test(h2), 'al contado: sin crédito ni cláusula de hipoteca');
  ok(!/promesa de compraventa de fecha/.test(h2) && !/Personería/.test(h2) && !/Los deslindes/.test(h2) && !/comprende además/.test(h2), 'sin promesa, personería, deslindes ni extras, esos bloques no salen');
  ok(!/Copropiedad Inmobiliaria/.test(h2) && !/valor de la Unidad de Fomento/.test(h2) && !/Rol de avalúo número/.test(h2), 'sin copropiedad, UF ni rol, esos textos no salen');
  ok(/\[Notaría\]/.test(h2) && /\[fecha\]/.test(h2), 'sin notaría ni fecha quedan los marcadores «[Notaría]» y «[fecha]» para completar');

  // el editor de plantillas reconoce las cláusulas como editables
  const b = bloquesDe(plantilla).filter((x) => x.tipo === 'clausula');
  ok(b.length === 10 && b.every((x) => x.texto !== null), `las ${b.length} cláusulas son editables por el sistema de plantillas`);

  if (process.argv[2] === 'pdf') {
    const { PdfService } = require('../dist/documentos/pdf.service');
    const pdf = await new PdfService().pdf(html);
    ok(pdf.slice(0, 4).toString() === '%PDF', 'el PDF se genera');
    fs.writeFileSync(process.argv[3] || 'escritura-compraventa-prueba.pdf', pdf);
    const pdf2 = await new PdfService().pdf(h2);
    ok(pdf2.slice(0, 4).toString() === '%PDF', 'el PDF al contado se genera');
    fs.writeFileSync((process.argv[3] || 'escritura-compraventa-prueba.pdf').replace(/\.pdf$/, '-contado.pdf'), pdf2);
  }
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
