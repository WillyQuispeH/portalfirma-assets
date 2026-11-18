// Mandato de gestión de venta: la plantilla HTML se llena con datos falsos (sin red ni base de datos) y no queda ninguna
// variable sin reemplazar. Requiere compilar antes (yarn build) o tener la plantilla copiada en dist/documentos/plantillas.
// Con un segundo argumento «pdf» además arma el PDF (requiere Chromium: PDF_CHROMIUM=/ruta/al/chrome).
const fs = require('fs');
const { llenar, cargarPlantilla } = require('../dist/documentos/plantilla');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const base = {
    numero: '7', fechaEmision: '17 de noviembre de 2026', ciudad: 'Vitacura',
    corredora: { nombre: 'Inmobiliaria <Ejemplo> SpA', rut: '76.123.456-7', representante: 'don Juan Pérez, cédula de identidad número 1.111.111-1', domicilio: 'Av. Kennedy 7600, piso 7, Vitacura', logo: '' },
    corredor: { nombre: 'Ana Pérez', email: 'ana@ejemplo.cl', telefono: '' },
    mandante: { nombre: 'Rosa Propietaria', texto: 'Rosa Propietaria, chilena, casada, cédula de identidad número 9.876.543-2', rut: '9.876.543-2', email: 'rosa@mail.cl', telefono: '+56 9 1111 2222' },
    propiedad: { codigo: 'PF-2001', tipo: 'Departamento', direccion: 'Av. Apoquindo 3000, depto. 504', comuna: 'Las Condes', supTotal: '95 m²', supUtil: '80 m²', rol: '1234-56', precio: 'UF 9.500' },
    comision: { pct: '2', indemnizacion: '4' },
    publicar: { si: true, no: false }, exclusividad: { si: false, no: true },
    condiciones: { otras: 'Se vende con estacionamiento y bodega.' },
  };
  const html = llenar(cargarPlantilla('mandato-venta'), base);
  ok(!/\{\{|\}\}/.test(html), 'no queda ninguna variable sin reemplazar');
  ok(/Inmobiliaria &lt;Ejemplo&gt; SpA/.test(html), 'los datos se escapan (nada de HTML de afuera)');
  ok(/UF 9\.500/.test(html) && /2 % \+ IVA/.test(html) && /el 4 % \+ IVA/.test(html), 'precio, comisión e indemnización (el doble) aparecen');
  ok(/Av\. Kennedy 7600/.test(html) && /Se vende con estacionamiento/.test(html), 'domicilio de la corredora y otras condiciones aparecen');
  ok(!/<!--/.test(html), 'los comentarios de la plantilla no salen en el documento');
  const sin = llenar(cargarPlantilla('mandato-venta'), { ...base, corredora: { nombre: 'Corredora', rut: '', representante: '', domicilio: '', logo: '' }, condiciones: { otras: '' } });
  ok(!/\{\{|\}\}/.test(sin), 'sin datos opcionales tampoco quedan variables');
  ok(!/Condiciones especiales/.test(sin) && !/domicilio para estos efectos/.test(sin) && !/RUT ,/.test(sin), 'sin otras condiciones, domicilio ni RUT de la corredora, esos bloques no salen');
  if (process.argv[2] === 'pdf') {
    const { PdfService } = require('../dist/documentos/pdf.service');
    const pdf = await new PdfService().pdf(html);
    ok(pdf.slice(0, 4).toString() === '%PDF', 'el PDF se genera');
    fs.writeFileSync(process.argv[3] || 'mandato-venta-prueba.pdf', pdf);
  }
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
