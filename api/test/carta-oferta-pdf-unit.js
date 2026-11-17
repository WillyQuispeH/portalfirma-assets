// Carta oferta: la plantilla HTML se llena y se convierte en PDF (sin red ni base de datos).
// Requiere compilar antes (yarn build) y un Chromium: PDF_CHROMIUM=/ruta/al/chrome (en el servidor: /usr/bin/chromium).
const fs = require('fs');
const { llenar, cargarPlantilla } = require('../dist/documentos/plantilla');
const { PdfService } = require('../dist/documentos/pdf.service');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const base = {
    numero: '3', fechaEmision: 'viernes, 13 de noviembre de 2026', ciudad: 'Las Condes', operacionVerbo: 'arrendar', operacionTxt: 'Arriendo', contrato: 'arrendamiento', esVenta: false, esArriendo: true, rol: { oferente: 'Arrendatario', contraparte: 'Arrendador' },
    corredora: { nombre: 'Inmobiliaria <Ejemplo>', rut: '76.123.456-7' }, corredor: { nombre: 'Ana Pérez', email: 'ana@ejemplo.cl', telefono: '' },
    oferente: { nombre: 'Matías Serrano', rut: '7.654.321-6', email: 'matias@mail.cl', telefono: '+56 9 1111 2222', calidad: 'arrendatario', perfil: 'chileno, soltero', domicilio: 'Los Leones 567, Providencia' },
    contraparte: { nombre: 'Rosa Propietaria', firma: 'Rosa Propietaria', texto: 'Rosa Propietaria, chilena, casada, cédula de identidad número 1-9' },
    propietario: 'Rosa Propietaria', propiedad: { codigo: 'PF-1001', tipo: 'Departamento', direccion: 'Av. Apoquindo 3000, depto. 504, Las Condes', precioLista: '$700.000', rol: '', dominio: '' },
    oferta: { monto: '$650.000', montoLargo: '$650.000 (pesos chilenos)', garantia: '1 mes de renta', plazo: '12 meses', vigencia: '7 días', vence: 'viernes, 20 de noviembre de 2026', condiciones: 'Entrega con pintura reciente.\nMascota pequeña.' },
  };
  const html = llenar(cargarPlantilla('carta-oferta'), base);
  ok(!/\{\{|\}\}/.test(html), 'no queda ninguna variable sin reemplazar');
  ok(/Inmobiliaria &lt;Ejemplo&gt;/.test(html), 'los datos se escapan (nada de HTML de afuera)');
  ok(/Entrega con pintura reciente/.test(html) && /1 mes de renta/.test(html), 'las condiciones y la garantía aparecen');
  const sin = llenar(cargarPlantilla('carta-oferta'), { ...base, oferta: { ...base.oferta, garantia: '', plazo: '', condiciones: '' }, propiedad: { ...base.propiedad, precioLista: '' } });
  ok(!/Garantía o reserva/.test(sin) && !/>Condiciones</.test(sin) && !/Precio publicado/.test(sin), 'sin garantía, plazo, condiciones ni precio publicado, esos bloques no salen');
  ok(!/<!--/.test(html), 'los comentarios de la plantilla no salen en el documento');
  const pdf = await new PdfService().pdf(html);
  ok(pdf.slice(0, 4).toString() === '%PDF', 'el PDF se genera');
  fs.writeFileSync(process.argv[2] || 'carta-oferta-prueba.pdf', pdf);
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
