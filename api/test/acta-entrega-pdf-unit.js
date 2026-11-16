// Acta de entrega e inventario: la plantilla HTML se llena y se convierte en PDF (sin red ni base de datos).
const { llenar, cargarPlantilla } = require('../dist/documentos/plantilla');
const { PdfService } = require('../dist/documentos/pdf.service');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const base = {
    numero: '1', fechaEmision: '13 de noviembre de 2026', fechaEntrega: '1 de diciembre de 2026', corredora: { nombre: 'Inmobiliaria <Ejemplo>' },
    arrendador: 'Rosa Propietaria, RUT 1-9', arrendatario: { nombre: 'Matías Serrano', rut: '7.654.321-6' },
    propiedad: { codigo: 'PF-1001', tipo: 'Departamento', direccion: 'Av. Apoquindo 3000, depto. 504, Las Condes' },
    llaves: '2 llaves de la puerta principal y 1 del buzón.', hayMedidores: true, medidores: [{ nombre: 'Electricidad', numero: '123', lectura: '4.500' }, { nombre: 'Agua', numero: '77', lectura: '210' }],
    inventario: [{ espacio: 'Living', estado: 'Bueno', nota: '' }, { espacio: 'Cocina', estado: 'Regular', nota: 'Mancha en el mesón' }], observaciones: 'Pintura reciente.',
  };
  const html = llenar(cargarPlantilla('acta-entrega'), base);
  ok(!/\{\{|\}\}/.test(html), 'no queda ninguna variable sin reemplazar');
  ok(/Mancha en el mesón/.test(html) && /Electricidad/.test(html) && /Inmobiliaria &lt;Ejemplo&gt;/.test(html), 'inventario, medidores y escape aparecen');
  const sin = llenar(cargarPlantilla('acta-entrega'), { ...base, hayMedidores: false, medidores: [], observaciones: '' });
  ok(!/>Medidores</.test(sin) && !/Observaciones generales/.test(sin), 'sin medidores ni observaciones, esos bloques no salen');
  const pdf = await new PdfService().pdf(html);
  ok(pdf.slice(0, 4).toString() === '%PDF', 'el PDF se genera');
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
