// Promesa de compraventa: la plantilla HTML se llena con datos falsos (sin red ni base de datos) y no queda ninguna variable sin
// reemplazar; el servicio (con base y envío falsos) valida lo que falta, arma las variables y liga la firma a la etapa «promesa».
// Requiere compilar antes (yarn build) o tener la plantilla copiada en dist/documentos/plantillas.
// Con un segundo argumento «pdf» además arma el PDF (requiere Chromium: PDF_CHROMIUM=/ruta/al/chrome).
const fs = require('fs');
const { llenar, cargarPlantilla } = require('../dist/documentos/plantilla');
const { muestra } = require('../dist/documentos/muestras');
const { tipoDeDocumento } = require('../dist/documentos/drive');
const { PromesaCompraventaService } = require('../dist/negocios/promesa-compraventa');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };

(async () => {
  const plantilla = cargarPlantilla('promesa-compraventa');
  const base = muestra('promesa-compraventa');
  const html = llenar(plantilla, base);
  ok(!/\{\{|\}\}/.test(html), 'no queda ninguna variable sin reemplazar');
  ok(!/<!--/.test(html), 'los comentarios de la plantilla (BORRADOR y variables) no salen en el documento');
  ok(/4\.850 Unidades de Fomento/.test(html) && /970 Unidades de Fomento/.test(html) && /3\.880 Unidades de Fomento/.test(html), 'precio, pie y saldo aparecen');
  ok(/90 días corridos/.test(html) && /15 de febrero de 2027/.test(html) && /Notaría de don Pedro Ejemplo/.test(html), 'plazo de la escritura, fecha de entrega y notaría aparecen');
  ok(/crédito hipotecario/.test(html) && !/al contado, mediante vale vista/.test(html), 'saldo con crédito hipotecario: sale esa forma y no la de contado');
  ok(/Fojas 1234 Número 5678/.test(html) && /Rol de avalúo 1234-56/.test(html), 'inscripción de dominio y rol aparecen');
  ok(/Se incluyen las cortinas/.test(html) && /Condiciones adicionales/.test(html), 'las condiciones adicionales aparecen');
  ok(/100 Unidades de Fomento/.test(html) && /2 % más IVA/.test(html) && /Inmobiliaria Ejemplo SpA/.test(html), 'garantía de seriedad y comisión a nombre de la corredora');

  // datos escapados: nada de HTML de afuera
  ok(/Inmobiliaria &lt;X&gt;/.test(llenar(plantilla, { ...base, corredora: { ...base.corredora, nombre: 'Inmobiliaria <X>' } })), 'los datos se escapan (nada de HTML de afuera)');

  // bloques condicionales: al contado, sin fecha de entrega, sin notaría, sin otras condiciones ni rol
  const sin = llenar(plantilla, {
    ...base,
    pago: { hipotecario: false, contado: true, nota: '' },
    entrega: { conFecha: false, sinFecha: true, fecha: '' },
    notaria: { hay: false, sin: true, nombre: '' },
    condiciones: { otras: '' },
    propiedad: { ...base.propiedad, rol: '', superficie: '' },
    corredora: { nombre: 'Corredora', rut: '', domicilio: '', logo: '' },
  });
  ok(!/\{\{|\}\}/.test(sin), 'sin datos opcionales tampoco quedan variables');
  ok(/al contado, mediante vale vista/.test(sin) && !/crédito hipotecario otorgado/.test(sin), 'saldo al contado: sale esa forma y no la hipotecaria');
  ok(/en la fecha en que la compraventa quede inscrita/.test(sin) && !/15 de febrero/.test(sin), 'sin fecha de entrega: se entrega al inscribirse');
  ok(/Notario Público que las partes designen de común acuerdo/.test(sin) && !/Pedro Ejemplo/.test(sin), 'sin notaría: la designan las partes');
  ok(!/Condiciones adicionales/.test(sin) && !/Rol de avalúo/.test(sin) && !/superficie aproximada/.test(sin), 'sin otras condiciones, rol ni superficie, esos bloques no salen');
  ok(!/RUT ,/.test(sin) && !/, rol único tributario número ,/.test(sin), 'sin RUT de la corredora no quedan frases rotas');

  // ------------------------------------------------------------------ el servicio, con base y envío falsos
  const u = { sub: 'u1', corredoraId: 'C1', rol: 'ADMIN' };
  const persona = (id, o = {}) => ({ id, nombre: 'Persona ' + id, rut: '', rutFormato: '', email: '', telefono: '', nacionalidad: 'chilena', estadoCivil: 'soltero', profesion: 'ingeniero', direccion: 'Calle 1', ...o });
  const comprador = persona('pc', { nombre: 'Matías Ejemplo', rutFormato: '7.654.321-6', email: 'matias@ejemplo.cl' });
  const dueno = persona('pv', { nombre: 'Rosa Propietaria', rutFormato: '9.876.543-2', email: 'rosa@ejemplo.cl', estadoCivil: 'casada' });
  const escenario = (cambios = {}) => {
    const e = { comprador, duenos: [dueno], tipo: 'venta', datos: { valor: { valor: 4850, moneda: 'UF' }, oferta: { piePct: '20', seriedadUF: '100', comisionPct: '2' }, ciclo: { promesa: { escrituraDias: '75', saldoForma: 'hipotecario', notaria: 'la Notaría Ejemplo' } } },
      ficha: { fojas: '1234', numeroInscripcion: '5678', anioInscripcion: '2015', conservador: 'Santiago' }, firmas: [], actualizado: null, contador: 0, ...cambios };
    const db = {
      negocio: { findUnique: async () => ({ id: 'n1', corredoraId: 'C1', tipo: e.tipo, clienteId: e.comprador ? e.comprador.id : null, propiedadId: 'p1', corredorId: 'u1', eliminadoEn: null, datos: e.datos }), update: async ({ data }) => { e.actualizado = data; } },
      persona: { findFirst: async () => e.comprador },
      propiedad: { findFirst: async () => ({ id: 'p1', codigo: 'PF-2001', tipo: 'departamento', direccion: 'Av. Ejemplo 3000', unidad: '504', comuna: 'Las Condes', rol: '1234-56', supUtil: 80, supTotal: 95, ficha: e.ficha }) },
      propiedadPersona: { findMany: async () => e.duenos.map((persona) => ({ persona })) },
      usuario: { findUnique: async () => ({ id: 'u1', nombre: 'Ana Corredora', email: 'ana@ejemplo.cl', telefono: '' }) },
      corredora: { findUnique: async () => ({ nombre: 'Inmobiliaria Ejemplo SpA', rut: '76.123.456-7' }) },
      registro: { findUnique: async () => null },
      contador: { findUnique: async () => ({ valor: e.contador }), upsert: async () => ({ valor: ++e.contador }) },
      firma: { upsert: async (a) => { e.firmas.push(a.create); } },
    };
    const plantillas = { html: async () => cargarPlantilla('promesa-compraventa') };
    const pdfs = { pdf: async (h) => { e.html = h; return Buffer.from('%PDF-falso'); } };
    const envio = { enviar: async (a) => { e.envio = a; return { operacion: 123456 }; } };
    const actividad = { registrar: async (l) => { e.actividad = l; } };
    return { e, s: new PromesaCompraventaService(db, plantillas, pdfs, envio, actividad) };
  };

  let { e, s } = escenario();
  let r = await s.vistaPrevia(u, 'n1');
  ok(r.ok && Buffer.from(r.pdf, 'base64').toString().startsWith('%PDF') && /Promesa de compraventa PF-2001/.test(r.archivo), 'vista previa: arma el PDF de un negocio completo');
  ok(/75 días corridos/.test(e.html) && /la Notaría Ejemplo/.test(e.html) && /4\.850 Unidades de Fomento/.test(e.html) && !/\{\{/.test(e.html), 'lee el plazo y la notaría de n.datos.ciclo.promesa y el precio del negocio');
  ok(/Matías Ejemplo, chilena, soltero, ingeniero, cédula de identidad número 7.654.321-6/.test(e.html) && /Rosa Propietaria, chilena, casada/.test(e.html), 'comprador y vendedor salen con su perfil en la comparecencia');

  ({ e, s } = escenario({ tipo: 'arriendo' }));
  ok(/solo para negocios de venta/.test((await s.vistaPrevia(u, 'n1')).error), 'un negocio de arriendo no tiene promesa de compraventa');
  ({ e, s } = escenario({ comprador: null }));
  ok(/no tiene comprador/.test((await s.vistaPrevia(u, 'n1')).error), 'avisa si falta el comprador');
  ({ e, s } = escenario({ comprador: persona('pc', { nombre: 'Matías' }) }));
  ok(/Matías no tiene RUT/.test((await s.vistaPrevia(u, 'n1')).error), 'avisa si falta el RUT del comprador');
  ({ e, s } = escenario({ duenos: [] }));
  ok(/no tiene propietario/.test((await s.vistaPrevia(u, 'n1')).error), 'avisa si la propiedad no tiene propietario');
  ({ e, s } = escenario({ duenos: [persona('pv', { nombre: 'Rosa' })] }));
  ok(/Rosa no tiene RUT/.test((await s.vistaPrevia(u, 'n1')).error), 'avisa si falta el RUT del vendedor');
  ({ e, s } = escenario({ datos: { valor: {}, oferta: {} } }));
  ok(/Falta el precio/.test((await s.vistaPrevia(u, 'n1')).error), 'avisa si falta el precio');
  ({ e, s } = escenario({ datos: { valor: { valor: 100, moneda: 'UF' }, oferta: { piePct: '100' } } }));
  ok(/pie debe ser menor/.test((await s.vistaPrevia(u, 'n1')).error), 'avisa si el pie es el 100 %');

  // la vista previa no exige correo ni dominio; enviar a firmar sí
  ({ e, s } = escenario({ comprador: persona('pc', { nombre: 'Matías', rutFormato: '7.654.321-6' }) }));
  ok((await s.vistaPrevia(u, 'n1')).ok, 'la vista previa no exige el correo (se puede descargar sin firmar)');
  ok(/Falta el correo de Matías/.test((await s.enviar(u, 'n1')).error) && !e.envio && e.contador === 0, 'enviar exige el correo y no gasta folio ni envía nada');
  ({ e, s } = escenario({ ficha: {} }));
  ok((await s.vistaPrevia(u, 'n1')).ok, 'la vista previa no exige la inscripción de dominio');
  ok(/inscripción de dominio/.test((await s.enviar(u, 'n1')).error) && !e.envio, 'enviar exige la inscripción de dominio');

  // enviar: firman comprador y vendedor, serie propia, Drive y etapa «promesa»
  ({ e, s } = escenario());
  r = await s.enviar(u, 'n1');
  ok(r.ok && r.enviada && r.operacion === 123456 && r.numero === 1, 'enviar a firmar devuelve la operación y el folio de la serie propia');
  ok(e.envio.firmantes.length === 2 && e.envio.firmantes[0].alias === 'comprador' && e.envio.firmantes[1].alias === 'vendedor', 'firman el comprador y el vendedor');
  ok(e.envio.drive.tipo === 'Promesas de compraventa' && e.envio.drive.negocioId === 'n1' && /^Promesa de compraventa nº 1/.test(e.envio.nombreArchivo), 'se guarda en Drive como «Promesas de compraventa»');
  ok(tipoDeDocumento(e.envio.nombreArchivo) === 'Promesas de compraventa', 'Drive reconoce el documento por su nombre');
  const f = e.actualizado.datos.firmas.promesa;
  ok(f && f.operacion === 123456 && f.estado === 'en_firma' && f.total === 2, 'la firma queda ligada a la etapa «promesa» del negocio (así avanza solo al firmarse)');
  ok(e.actualizado.datos.ciclo.promesa.escrituraDias === '75', 'lo propio de la promesa (n.datos.ciclo) se conserva al registrar la firma');
  ok(e.firmas[0].documento === 'Promesa de compraventa nº 1' && e.firmas[0].datos.formato === 'promesa_compraventa' && e.firmas[0].negocioId === 'n1', 'se registra la firma en la propiedad y el negocio');
  ok(e.actividad.length === 2 && /Promesa de compraventa nº 1/.test(e.actividad[0].texto), 'queda en la actividad del negocio y de la propiedad');

  if (process.argv[2] === 'pdf') {
    const { PdfService } = require('../dist/documentos/pdf.service');
    const pdf = await new PdfService().pdf(html);
    ok(pdf.slice(0, 4).toString() === '%PDF', 'el PDF se genera');
    fs.writeFileSync(process.argv[3] || 'promesa-compraventa-prueba.pdf', pdf);
  }
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
