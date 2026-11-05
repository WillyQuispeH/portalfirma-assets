// Genera test/fixtures/contrato_prueba.pdf: contrato de prestación de servicios ficticio, de varias páginas.
// Uso: npx electron test/make-contrato-fixture.js
// Lo usan plantillas-e2e, asistente-e2e, detectar-e2e y clientes-e2e. Textos que esas pruebas (y el modo de prueba de la IA, src/ai.js) esperan:
//  - primer párrafo con «Santiago», «2 de octubre de 2026», «comparecen:», JUAN PEREZ SOTO / 11.111.111-1 (Prestador) y MARIA GONZALEZ ROJAS / 22.222.222-2 (Cliente);
//  - «servicios de asesoria al CLIENTE» y «El precio sera de $500.000 ... mensuales» (errores a propósito que corrige el Asistente);
//  - nombre y RUT de cada parte en una misma línea (pdftext-unit borra la línea de MARIA y espera que siga «JUAN PEREZ SOTO, RUT 11.111.111-1»);
//  - los nombres se repiten en otros párrafos y en las firmas; RUT, fecha y monto aparecen una sola vez; sin corchetes.
const { app, BrowserWindow } = require('electron'); const fs = require('fs'); const path = require('path');
const P = (t) => `<p>${t}</p>`;
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false });
  const html = `<html><head><meta charset="utf-8"><style>
    body{font-family:Arial;font-size:12pt;line-height:1.35;margin:0}
    h1{font-size:15pt;text-align:center;margin:0 0 18pt} p{margin:0 0 1.3em}
    .firmas{display:flex;justify-content:space-between;margin-top:60pt} .firmas div{width:45%;text-align:center}
  </style></head><body>
    <h1>CONTRATO DE PRESTACIÓN DE SERVICIOS</h1>
    ${P('En Santiago, a 2 de octubre de 2026, comparecen: JUAN PEREZ SOTO, RUT 11.111.111-1, contador auditor, domiciliado en Avenida Italia 1000, Providencia, en adelante «el PRESTADOR»; y MARIA GONZALEZ ROJAS, RUT 22.222.222-2, ingeniera comercial, con domicilio en Los Leones 200, comuna de Providencia, en adelante «el CLIENTE»; ambos mayores de edad, quienes exponen que han convenido el siguiente contrato.')}
    ${P('PRIMERO: Objeto. Por el presente instrumento, el PRESTADOR se obliga a prestar servicios de asesoria al CLIENTE en materias contables y tributarias, incluyendo la preparación de declaraciones mensuales de impuestos, la revisión de la contabilidad y la atención de consultas del giro.')}
    ${P('SEGUNDO: Forma de prestar los servicios. Los servicios se prestarán de manera independiente, sin vínculo de subordinación ni dependencia, en las oficinas del PRESTADOR o en forma remota, según lo requiera la naturaleza de cada encargo. El PRESTADOR podrá apoyarse en colaboradores de su exclusiva responsabilidad, quienes no tendrán relación contractual alguna con el CLIENTE.')}
    ${P('TERCERO: Precio. El precio sera de $500.000 mensuales, impuestos incluidos, contra la emisión de la respectiva boleta de honorarios. Los gastos extraordinarios que demande la prestación de los servicios, tales como derechos notariales, copias o traslados fuera de la Región Metropolitana, serán de cargo del CLIENTE, previa aprobación por escrito.')}
    ${P('CUARTO: Obligaciones del PRESTADOR. El PRESTADOR se obliga a cumplir los encargos con la diligencia de un buen padre de familia; a presentar dentro de plazo las declaraciones que le correspondan; a informar al CLIENTE de los avances en reuniones periódicas; y a conservar respaldo ordenado de los antecedentes que reciba, los que restituirá al término del contrato.')}
    ${P('QUINTO: Obligaciones del CLIENTE. El CLIENTE se obliga a entregar oportunamente la documentación necesaria para la prestación de los servicios, a responder las consultas del PRESTADOR dentro de un plazo razonable y a informar cualquier cambio relevante en su actividad, en especial la apertura o cierre de sucursales y la contratación de trabajadores.')}
    ${P('SEXTO: Responsabilidad. El PRESTADOR no responderá de multas, intereses o reajustes que se originen en información incompleta, inexacta o entregada fuera de plazo por el CLIENTE. Con todo, deberá advertir por escrito al CLIENTE apenas detecte cualquier inconsistencia en los antecedentes recibidos.')}
    ${P('SÉPTIMO: Confidencialidad. El PRESTADOR guardará estricta reserva de toda la información que conozca con ocasión de este contrato y no podrá revelarla a terceros sin autorización expresa del CLIENTE, salvo requerimiento de autoridad competente. Esta obligación se mantendrá vigente aun después del término del contrato.')}
    ${P('OCTAVO: Datos personales. Las partes tratarán los datos personales a que tengan acceso únicamente para los fines de este contrato, conforme a la Ley N° 19.628 sobre protección de la vida privada, y adoptarán las medidas de seguridad razonables para resguardarlos.')}
    ${P('NOVENO: Propiedad de los documentos. Los informes, planillas y demás documentos que el PRESTADOR elabore para el CLIENTE serán de propiedad de este último una vez pagado el precio correspondiente al mes en que fueron entregados.')}
    ${P('DÉCIMO: Comunicaciones. Las comunicaciones entre las partes se efectuarán por correo electrónico a las direcciones que cada una informe por escrito, y se entenderán recibidas el día hábil siguiente a su envío.')}
    ${P('UNDÉCIMO: Domicilio. Para todos los efectos legales derivados del presente contrato, las partes fijan su domicilio en la comuna de Providencia y se someten a la competencia de sus Tribunales Ordinarios de Justicia.')}
    ${P('DUODÉCIMO: Ejemplares. El presente contrato se firma de forma electrónica por MARIA GONZALEZ ROJAS y por JUAN PEREZ SOTO, quedando una copia en poder de cada parte.')}
    <div class="firmas"><div>JUAN PEREZ SOTO<br>PRESTADOR</div><div>MARIA GONZALEZ ROJAS<br>CLIENTE</div></div>
  </body></html>`;
  await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  const pdf = await w.webContents.printToPDF({ pageSize: 'Letter', margins: { marginType: 'custom', top: 0.9, bottom: 0.9, left: 1, right: 1 }, generateTaggedPDF: false });
  const dest = process.env.PF_FIXTURE_OUT || path.join(__dirname, 'fixtures', 'contrato_prueba.pdf'); fs.writeFileSync(dest, pdf); console.log('ok', pdf.length); app.quit();
});
