// Contrato de arriendo: la plantilla HTML se llena y se convierte en PDF (sin red ni base de datos).
// Requiere compilar antes (yarn build) y un Chromium: PDF_CHROMIUM=/ruta/al/chrome.
const fs = require('fs');
const { llenar, cargarPlantilla } = require('../dist/documentos/plantilla');
const { PdfService } = require('../dist/documentos/pdf.service');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const base = {
    numero: '1', fechaEmision: '13 de noviembre de 2026', ciudad: 'Las Condes', corredora: { nombre: 'Inmobiliaria <Ejemplo>', rut: '76.123.456-7' },
    corredor: { nombre: 'Ana Pérez', email: 'ana@ejemplo.cl', telefono: '' },
    arrendador: { texto: 'Rosa Propietaria, RUT 1-9, y Juan Soto, RUT 2-7', firma: 'Rosa Propietaria y Juan Soto', email: 'rosa@mail.cl', domicilio: '', cuentaTxt: 'en la cuenta que el Arrendador indique por escrito' },
    arrendatario: { nombre: 'Matías Serrano', texto: 'Matías Serrano, RUT 7.654.321-6', rut: '7.654.321-6', email: 'm@mail.cl', telefono: '', domicilio: '' },
    codeudor: { texto: 'Pedro Aval, RUT 9.999.999-3, y Ana Fiadora, RUT 8.888.888-8', titulo: 'codeudores solidarios', etiqueta: 'los «Codeudores»', verbo: 'intervienen', obliga: 'se obligan solidariamente', nombres: 'Pedro Aval y Ana Fiadora' },
    propiedad: { codigo: 'PF-1001', tipo: 'Departamento', direccion: 'Av. Apoquindo 3000, depto. 504, Las Condes', descripcion: 'departamento 504', dominio: 'en el Conservador de Bienes Raíces respectivo.' },
    contrato: { inicio: '1 de diciembre de 2026', termino: '30 de noviembre de 2027', avisoDias: '60', multaMora: '0,5 Unidades de Fomento', plazo: '12 meses', aviso: 'Aviso de 60 días.', renta: '$650.000', diaPago: '5', reajuste: 'Reajuste IPC semestral.', garantia: '2 meses de renta ($1.300.000)', destino: 'vivienda', clausulas: 'Se permite mascota pequeña.' },
  };
  const html = llenar(cargarPlantilla('contrato-arriendo'), base);
  ok(!/\{\{|\}\}/.test(html), 'no queda ninguna variable sin reemplazar');
  ok(/codeudores solidarios/i.test(html) && /Pedro Aval/.test(html) && /Ana Fiadora/.test(html) && /intervienen/.test(html) && /2 meses de renta/.test(html) && /mascota pequeña/.test(html), 'varios codeudores, garantía en meses y cláusulas adicionales aparecen');
  const sin = llenar(cargarPlantilla('contrato-arriendo'), { ...base, codeudor: undefined, contrato: { ...base.contrato, clausulas: '' } });
  ok(!/Fiador y codeudor/.test(sin) && !/intervienen/.test(sin) && !/Cláusulas especiales/.test(sin), 'sin codeudor ni cláusulas, esos bloques no salen');
  const pdf = await new PdfService().pdf(html);
  ok(pdf.slice(0, 4).toString() === '%PDF', 'el PDF se genera');
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
