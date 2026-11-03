// Formatos propios de THE LIVING SpA (THE LIVING.rar, 27-10-2026). El texto legal es el de sus documentos, sin
// cambios; Asset solo pone los datos donde iban las líneas en blanco. Sin pies de firma: firman con Portalfirma.
// Cada formato declara su hito (paso de la etapa), la operación, los datos que usa y quién firma.
'use strict';
const fs = require('fs');
const path = require('path');

let LOGO = '';
try { LOGO = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(__dirname, 'the-living-logo.jpg')).toString('base64'); } catch {}

// datos de la empresa que vienen en sus propios formatos (los correos y celulares de los representantes se piden una vez)
const EMPRESA = {
  razonSocial: 'THE LIVING SpA', rut: '77.494.165-7', giro: 'corretaje de propiedades',
  domicilio: 'Av. Pdte. Kennedy 7600, piso 7, Vitacura', ciudad: 'Santiago',
  representantes: {
    venta: { nombre: 'Aníbal Ignacio Cortés Fernández', rut: '13.832.457-5' },
    arriendo: { nombre: 'Christian Rolf Goldberger Garcés', rut: '12.154.746-5' },
  },
};

const CSS = `
  @page { size: Letter; margin: 30mm 20mm 20mm; }
  * { box-sizing: border-box; }
  body { font: 10.5pt/1.38 Calibri, Carlito, 'Segoe UI', Arial, sans-serif; color: #111; margin: 0; }
  .logo { text-align: center; } .logo img { height: 13mm; }
  @media print { .logo { display: none; } }
  h1 { font-size: 10.5pt; text-align: center; text-decoration: underline; margin: 0 0 14px; }
  p { margin: 0 0 9px; text-align: justify; }
  .u { display: inline-block; min-width: 18mm; border-bottom: 1px solid #111; padding: 0 3px; text-align: left; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0 14px; page-break-inside: avoid; }
  td, th { border: 1px solid #111; padding: 3px 6px; vertical-align: top; }
  th { text-align: center; }
  .dt td:nth-child(odd) { width: 14%; } .dt td:nth-child(even) { width: 36%; }
  ol { margin: 0 0 10px 0; padding-left: 26px; } ol li { margin-bottom: 2px; text-align: justify; }
  .opc td { width: 25%; } .nota { font-style: italic; }
  .esp { background: #fff3a0; display: inline-block; padding: 0 2px; }
  @media screen { body { padding: 10mm 16mm 16mm; } .logo { margin-bottom: 10mm; } }
`;
const marca = (si) => (si ? '☒ SÍ ☐ NO' : '☐ SÍ ☒ NO');
const pagina = (titulo, cuerpo) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${titulo}</title><style>${CSS}</style></head><body>
  ${LOGO ? `<div class="logo"><img src="${LOGO}" alt=""></div>` : ''}<h1>${titulo}</h1>${cuerpo}</body></html>`;
const tablaInmueble = (v, etiquetaPrecio, precio) => `<table class="dt"><tr><th colspan="4">DESCRIPCIÓN INMUEBLE</th></tr>
  <tr><td>Ubicación<br>(Dirección)</td><td>${v.ubicacion}</td><td>Comuna:</td><td>${v.comuna}</td></tr>
  <tr><td>Superficie Total (mts²)</td><td>${v.supTotal}</td><td>Superficie Útil (mts²)</td><td>${v.supUtil}</td></tr>
  <tr><td>Rol:</td><td>${v.rol}</td><td>${etiquetaPrecio}</td><td>${precio}</td></tr></table>`;
const PUBLICIDAD = (quien) => `<p>El MANDANTE autoriza expresamente al CORREDOR a publicar y difundir la propiedad objeto del presente mandato en sus plataformas digitales y redes sociales, tales como Instagram, Facebook, TikTok, página Web de The Living, entre otras que estime pertinentes, bajo su propia línea editorial, estética y criterios comunicacionales, sin que ello implique obligación de su parte de ajustarse a indicaciones específicas del Mandante respecto del contenido o estilo de las publicaciones.</p>
  <p>La publicación se realizará en los plazos y momentos que The Living estime adecuados, considerando criterios técnicos y estratégicos, tales como el nivel de demanda del mercado, disponibilidad de contenidos y calendario de publicaciones.</p>
  <p>Asimismo, se deja expresa constancia que las propiedades entregadas en mandato con exclusividad tendrán prioridad en el orden de publicación, promoción y difusión, por sobre aquellas en modalidad de no exclusividad, sin perjuicio de la buena fe y diligencia que igualmente aplicará ${quien} a todas las gestiones encomendadas.</p>
  <p><b>Exclusividad:</b> En caso de exclusividad, durante el período de 6 meses, el/la propietario/a se compromete a no solicitar los servicios de otra empresa de corretaje ni a realizar gestiones de venta/arriendo directa o indirecta del inmueble mencionado, ya sea personalmente o a través de terceros. Cualquier oferta de compra recibida será canalizada exclusivamente a través de THE LIVING SpA. En caso de incumplir este acuerdo, el propietario/a deberá abonar una penalización equivalente al doble de los honorarios acordados, más IVA.</p>`;
const OPCIONES = (v, contraparte) => `<table class="opc"><tr><td>Quiero que se publique en Portales Inmobiliarios y Redes Sociales (marcar el casillero)</td><td>${marca(v.publicar)}</td><td>Quiero Exclusividad (marcar el casillero)</td><td>${marca(v.exclusividad)}</td></tr>
  <tr><td colspan="4" class="nota">Nota: El MANDATE entiende que al <b>no</b> ser publicada en los portales inmobiliarios, se hace más difícil encontrar al ${contraparte}.</td></tr></table>`;
const PRIMERO = (fin, items) => `<p><b>PRIMERO:</b> En este acto vengo en declarar y obligarme a lo siguiente:</p><ol>${items.map((t) => `<li>${t}</li>`).join('')}</ol>`;
const DECLARA = ['Declaro ser dueño/a del Inmueble objeto de este encargo y no tener impedimento legal para celebrar actos y contratos al respecto.', 'Declaro que toda la información entregada al CORREDOR es verdadera.', 'Me obligo a proporcionar todos los antecedentes relativos al Inmueble que se requieran y autorizo al CORREDOR para solicitar los mismos por su propia cuenta.'];

const FORMATOS = [
  {
    id: 'mandato_venta', titulo: 'Mandato de gestión de venta', hito: 'mandato', op: 'venta', rep: 'venta',
    descripcion: 'El propietario encarga a The Living la venta del inmueble (2% + IVA, 180 días).', firma: { tipo: 'simple', tramite: 'none' },
    usa: ['hoy', 'duenoNombre', 'duenoTelefono', 'duenoRut', 'duenoEmail', 'ubicacion', 'comuna', 'supTotal', 'supUtil', 'rol', 'precioVenta', 'publicar', 'exclusividad'],
    firmantes: [{ rol: 'propietario', alias: 'mandante', titulo: 'Mandante (propietario)' }],   // 28-10: solo firma el mandante
    html: (v, e) => pagina('MANDATO DE GESTIÓN DE VENTA', `
      <p style="text-align:left">Fecha: <span class="u">${v.hoy}</span><br>
      ${v.trato} <span class="u" style="min-width:95mm">${v.duenoNombre}</span> teléfono: <span class="u">${v.duenoTelefono}</span><br>
      Rut: <span class="u" style="min-width:40mm">${v.duenoRut}</span> email: <span class="u" style="min-width:40mm">${v.duenoEmail}</span>, en adelante el <b>MANDANTE,</b> encarga a <b>${e.razonSocial}</b>, sociedad del giro de ${e.giro}, RUT ${e.rut}, representada por don ${e.rep.nombre}, cédula de identidad número ${e.rep.rut}, ambos con domicilio para estos efectos en ${e.domicilio} en adelante el <b>CORREDOR,</b> la venta del siguiente Inmueble:</p>
      ${tablaInmueble(v, v.etiquetaPrecioVenta, v.precioVenta)}
      ${PRIMERO('la venta', [...DECLARA, 'Autorizo al CORREDOR a tomar y publicar imágenes del Inmueble en los distintos portales y redes sociales, coordinar visitas, promocionar y realizar todas las gestiones necesarias para materializar la venta.', 'El MANDANTE libera al CORREDOR de toda responsabilidad ante siniestro, mantención o cuidado del Inmueble.'])}
      <p>El MANDANTE será responsable de solicitar asesoramiento legal, tributario y/o contable. <b>SEGUNDO</b>: <b>COMISIÓN.</b> El MANDANTE pagará al CORREDOR, una comisión de corretaje del <b>2% + IVA</b> sobre el monto final de la transacción. El pago correspondiente a THE LIVING SpA se documentará al momento de la suscripción de la promesa de compraventa, mediante cheque nominativo a nombre de THE LIVING SpA sin fecha, el cual quedará custodiado con instrucciones notariales y se entregará y pagará al CORREDOR una vez que se inscriba la compraventa en el Conservador de Bienes Raíces respectivo.</p>
      <p>En caso de que la negociación derive en un contrato distinto, tales como arriendo, leasing, arriendo con opción, u otro similar, el MANDANTE pagará al CORREDOR una comisión de corretaje del 2,0 % más IVA, calculado sobre el monto total del contrato.</p>
      <p>El retraso en el pago por más de 20 días corridos, devengará un interés por cada día de retraso equivalente al máximo convencional que permita la ley. El CORREDOR se reserva el derecho a cobrar comisión al respectivo Comprador y/o hacer canje con otros corredores.</p>
      <p><b>TERCERO:</b> El MANDANTE se obliga a no entenderse ni a vender la propiedad de forma directa a clientes del CORREDOR sin su intermediación, y en caso de que lo hiciera pagará a título de indemnización el doble de la comisión acordada, es decir, el 4% + IVA del monto total de la transacción. Son CLIENTES del CORREDOR las personas naturales o jurídicas que hayan firmado una orden de visita emitida por THE LIVING SpA, así mismo los terceros relacionados con las referidas personas naturales y/o jurídicas, aun cuando esta orden de venta no esté vigente al momento del cierre del negocio.</p>
      <p><b>CUARTO</b>: <b>VIGENCIA.</b> El presente mandato de venta tendrá una vigencia de 180 días, renovándose automática y sucesivamente por períodos iguales y sucesivos de 90 días cada uno, salvo que cualquiera de las partes manifieste por correo electrónico a la otra su voluntad de ponerle término. Estando en trámite una oferta por la propiedad no se podrá poner término a este mandato. Si alguno CLIENTES del CORREDOR o sus relacionados, dentro de los ciento ochenta días siguientes al término del contrato, cerraren con el Mandante alguno de los negocios descritos en el presente instrumento, el Mandante pagará al CORREDOR la totalidad de la comisión correspondiente.</p>
      <p><b>QUINTO: PUBLICIDAD Y DIFUSIÓN.</b></p>${PUBLICIDAD('el CORREDOR')}
      ${OPCIONES(v, 'Comprador')}
      <p><b>SEXTO:</b> Para todos los efectos derivados del presente Contrato, las partes fijan su domicilio en la ciudad de Santiago y se someten a la jurisdicción de sus tribunales ordinarios.</p>`),
  },
  {
    id: 'mandato_arriendo', titulo: 'Mandato de gestión de arriendo', hito: 'mandato', op: 'arriendo', rep: 'arriendo',
    descripcion: 'El propietario encarga a The Living el arriendo del inmueble (50% de un mes + IVA, 90 días).', firma: { tipo: 'simple', tramite: 'none' },
    usa: ['hoy', 'duenoNombre', 'duenoTelefono', 'duenoRut', 'duenoEmail', 'ubicacion', 'comuna', 'supTotal', 'supUtil', 'rol', 'precioArriendo', 'publicar', 'exclusividad', 'mascotas', 'mesesGarantia'],
    firmantes: [{ rol: 'propietario', alias: 'mandante', titulo: 'Mandante (propietario)' }],   // 28-10: solo firma el mandante
    html: (v, e) => pagina('MANDATO DE GESTIÓN DE ARRIENDO', `
      <p style="text-align:left">Fecha: <span class="u">${v.hoy}</span><br>
      ${v.trato} <span class="u" style="min-width:75mm">${v.duenoNombre}</span>, teléfono <span class="u">${v.duenoTelefono}</span> Rut: <span class="u">${v.duenoRut}</span><br>
      email: <span class="u" style="min-width:55mm">${v.duenoEmail}</span>, en adelante el <b>MANDANTE,</b> encarga a <b>${e.razonSocial}</b>, sociedad del giro de ${e.giro}, RUT ${e.rut}, representada por don ${e.rep.nombre}, cédula de identidad número ${e.rep.rut}, en adelante el <b>CORREDOR,</b> el arrendamiento del siguiente Inmueble:</p>
      ${tablaInmueble(v, v.etiquetaPrecioArriendo, v.precioArriendo)}
      ${PRIMERO('el arriendo', [...DECLARA, 'Autorizo al CORREDOR a tomar y publicar imágenes del Inmueble del Inmueble en los distintos portales y redes sociales, coordinar visitas, promocionar y realizar todas las gestiones necesarias para materializar el arriendo.', 'El MANDANTE libera al CORREDOR de toda responsabilidad ante siniestro, mantención o cuidado del Inmueble.', 'El MANDANTE será responsable de solicitar asesoramiento legal, tributario y contable.'])}
      <p><b>SEGUNDO</b>: <b>COMISIÓN. A)</b> para arriendos residenciales cuya duración sea inferior a 24 meses, el MANDANTE pagará al CORREDOR una comisión de corretaje del 50% del valor de un mes de arrendamiento más IVA. <b>B)</b> En caso de ser un contrato de igual o superior a 24 meses la comisión será de 2% más IVA sobre el monto total del contrato, con una comisión mínima de una renta promedio mensual más IVA. <b>C)</b> Para arriendos comerciales, el MANDANTE pagará al CORREDOR una comisión de corretaje del 2,0 % más IVA, calculado sobre el monto total del contrato, con una comisión mínima de una renta promedio mensual más IVA. <b>D)</b> En caso de que la negociación derive en un contrato distinto, tales como compraventa, leasing, arriendo con opción, u otro similar, el MANDANTE pagará al CORREDOR una comisión de corretaje del 2,0 % más IVA, calculado sobre el monto total del contrato.</p>
      <p>El pago correspondiente se realizará al momento de la suscripción del contrato de Arriendo. El retraso en el pago por más de 20 días corridos, devengará un interés por cada día de retraso equivalente al máximo convencional que permita la ley. El CORREDOR se reserva el derecho a cobrar comisión al respectivo Arrendatario y/o hacer canje con otros corredores.</p>
      <p><b>TERCERO</b>: <b>RESPONSABILIDADES.</b> La intermediación por servicio de corretaje de propiedades implica la toma de imágenes y la publicación de la propiedad en los distintos portales, la coordinación de las visitas a la propiedad, transmitir los antecedentes entregados por el arrendatario al arrendador, coordinar la firma del contrato arrendamiento y la entrega material del inmueble. El CORREDOR no administrará el contrato de arrendamiento, ni responderá de algún eventual daño oculto o incumplimiento de cualquiera de las partes. El MANDANTE es responsable de la elección del arrendatario, de la revisión de sus antecedentes y de indicar por escrito e incorporar en el contrato las restricciones que pueda tener el arriendo. Del mismo modo, el arrendatario es responsable de la veracidad de los antecedentes que entregue al arrendador para su evaluación.</p>
      <p><b>CUARTO</b>: El MANDANTE se obliga a no entenderse ni a arrendar la propiedad de forma directa a clientes del CORREDOR sin su intermediación, y en caso de que lo hiciera pagará a título de indemnización el doble de la comisión acordada. Son CLIENTES del CORREDOR las personas naturales o jurídicas que hayan firmado una orden de visita emitida por <b>THE LIVING SpA</b>, asimismo los terceros relacionados con las referidas personas naturales y/o jurídicas, aun cuando esta orden de arrendamiento no esté vigente al momento del cierre del negocio.</p>
      <p><b>QUINTO</b>: <b>VIGENCIA.</b> La presente orden de arrendamiento tendrá una vigencia de 90 días, renovándose automática y sucesivamente por períodos iguales y sucesivos de 90 días cada uno, salvo que cualquiera de las partes manifieste por correo electrónico a la otra su voluntad de ponerle término. Estando en trámite una oferta por la propiedad no se podrá poner término a esta orden. Si alguno CLIENTES del CORREDOR o sus relacionados, dentro de los 180 días siguientes al término del contrato, cerraren con el Mandante alguno de los negocios descritos en el presente instrumento, el Mandante pagará al CORREDOR la totalidad de la comisión correspondiente.</p>
      <p><b>SEXTO: PUBLICIDAD Y DIFUSIÓN.</b></p>${PUBLICIDAD('The Living')}
      ${OPCIONES(v, 'Arrendatario')}
      <p><b>SEPTIMO:</b> Para todos los efectos derivados del presente Contrato, las partes fijan su domicilio en la ciudad de Santiago y se someten a la jurisdicción de sus tribunales ordinarios</p>
      <p style="text-align:left"><span class="esp">Condiciones Especiales:</span><br><span class="esp">Se aceptan mascotas: <span class="u">${v.mascotasTxt}</span></span><br><span class="esp">Cuantos meses de garantía de solicitarán: <span class="u">${v.mesesGarantia}</span></span></p>`),
  },
];

// el logo va en el encabezado de cada página del PDF (en la vista previa, arriba del título)
const CABECERA = LOGO ? `<div style="width:100%;text-align:center;padding-top:8mm"><img src="${LOGO}" style="height:13mm"></div>` : '';
// ---------- orden de visita (formato que usa hoy The Living, ov_14917) ----------
const OV_CSS = `
  @page { size: Letter; margin: 12mm 14mm 10mm; } * { box-sizing: border-box; }
  body { font: 9.3pt/1.32 Arial, Helvetica, sans-serif; color: #111; margin: 0; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #bbb; padding-bottom: 8px; margin-bottom: 12px; }
  .top img { height: 13mm; } .top .n { text-align: right; } .top .n b { display: block; font-size: 15pt; color: #333; } .top .n small { font-size: 9.5pt; color: #333; }
  .sol h3 { margin: 0; font-size: 11.5pt; } .sol p { margin: 1px 0; font-size: 10.5pt; } .sol .g { color: #888; }
  .prop { display: flex; gap: 10px; margin: 8px 0 10px; page-break-inside: avoid; position: relative; }
  .prop .ft { width: 64mm; height: 42mm; flex: 0 0 64mm; background: #fff; border-bottom: 3px solid #1d2b4f; overflow: hidden; } .prop .ft img { width: 100%; height: 100%; object-fit: cover; }
  .prop .tx { flex: 1; min-width: 0; } .prop .ti { color: #1d2b4f; font-weight: bold; font-size: 11pt; padding-right: 70px; } .prop .di { color: #1d2b4f; font-weight: bold; font-size: 10.5pt; margin-bottom: 4px; padding-right: 70px; }
  .prop .pr { border-bottom: 1px solid #ccc; padding-bottom: 3px; margin-bottom: 3px; } .prop .pr b { color: #1d2b4f; font-size: 11pt; } .prop .pr span { margin-left: 8px; font-size: 9pt; }
  .prop .rs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px 8px; border-bottom: 1px solid #ccc; padding-bottom: 3px; margin-bottom: 3px; font-size: 9pt; } .prop .rs i { color: #888; font-style: normal; } .prop .rs b { color: #1d2b4f; }
  .prop .de { font-size: 9pt; } .cod { position: absolute; right: 0; top: 0; background: #1d2b4f; color: #fff; border-radius: 14px; min-width: 44px; padding: 4px 8px; font-size: 8pt; text-align: center; line-height: 1.15; white-space: nowrap; }
  .leg p { margin: 0 0 1px; font-size: 8.1pt; line-height: 1.28; text-align: justify; }
  .fin { page-break-inside: avoid; } .pie { margin-top: 30px; display: flex; justify-content: space-between; text-align: center; font-size: 9.5pt; } .pie div { width: 46%; } .pie b { display: block; }
  .emp { text-align: center; font-size: 9.5pt; margin-top: 12px; }
`;
const ORDEN_VISITA = {
  id: 'orden_visita', titulo: 'Orden de visita', hito: 'orden', sinCabecera: true,
  descripcion: 'El visitante reconoce que The Living le presentó la propiedad y se obliga a pagar la comisión por su intermedio (250 días hábiles).', firma: { tipo: 'simple', tramite: 'none' },
  usa: ['visitNombre', 'visitRut', 'visitEmail', 'visitTelefono', 'ejecNombre', 'ejecEmail', 'operacion', 'ubicacion', 'comuna', 'precioOp'],
  firmantes: [{ rol: 'visitante', alias: 'visitante', titulo: 'Visitante' }],
  html: (v, e) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Orden de visita nº ${v.numero}</title><style>${OV_CSS}</style></head><body>
    <div class="top">${LOGO ? `<img src="${LOGO}" alt="">` : '<b>THE LIVING</b>'}<div class="n"><b>Orden de visita nº ${Number(v.numero).toLocaleString('es-CL')}</b><small>${v.fecha}</small></div></div>
    <div class="sol"><h3>Por si o por Agente Oficioso de a:</h3><p>${v.visit.nombre} | RUT: ${v.visit.rut} | ${v.visit.email} | F.: ${v.visit.telefono}</p><p class="g">Vengo a solicitar se emita orden de visita por las siguientes propiedades:</p></div>
    ${v.props.map((p) => `<div class="prop"><div class="ft">${p.foto ? `<img src="${p.foto}" alt="">` : ''}</div><div class="tx">
      <div class="cod">Cód:<br>${p.codigo}</div><div class="ti">${p.tipo}</div><div class="di">${p.direccion}</div>
      <div class="pr"><b>${p.opTxt}: ${p.precio}</b>${p.clp ? `<span>${p.clp}</span>` : ''}</div>
      ${p.rasgos.length ? `<div class="rs">${p.rasgos.map(([k, x]) => `<span><i>• ${k}:</i> <b>${x}</b></span>`).join('')}</div>` : ''}
      <div class="de">${p.desc}</div></div></div>`).join('')}
    <div class="leg">
      <p>La información entregada sobre las propiedades es referencial. De interesarme por alguna de las propiedades antes detalladas, me obligo a encargar a THE LIVING realizar las gestiones de compraventa o arriendo, comprometiéndome a pagar la comisión correspondiente, incluidos los impuestos aplicables.</p>
      <p>Declaro, bajo juramento, contar con las facultades para solicitar esta orden y para comprometerme —o a mi mandante— a cumplir todas y cada una de las obligaciones que contraigo al subscribirlas. Reconozco que THE LIVING fue la primera en ofrecerme estas propiedades y me comprometo a gestionar cualquier transacción exclusivamente a través suyo y a pagar la comisión correspondiente por su gestión de corretaje.</p>
      <p>TABLA DE HONORARIOS: A) VENTAS: 2% + IVA sobre el valor de venta con un mínimo de UF 100. B) Arriendo: B1) arriendo a menos 2 años el equivalente al 50% + IVA de la renta de un mes de arrendamiento. B2) arriendo 2 años o más: el equivalente al 2% + IVA de la suma de todas las rentas de arrendamiento del período pactado. B3) Para arriendos comerciales, 2% + IVA del total del contrato, con un mínimo de una renta mensual + IVA.</p>
      <p>Me obligo a pagar el doble de la comisión si realizo la operación por otra vía, directa o indirectamente, o si un tercero accede a la propiedad usando esta información, que es personal e intransferible. Vigencia del documento: 250 días hábiles.</p>
      <p>Cualquier controversia o dificultad que pueda surgir entre las partes, de cualquier naturaleza o materia que sea, será resuelta cada vez por un árbitro designado por el Centro de Arbitraje y Mediación de la Cámara Chilena de Comercio de Santiago A.G., en calidad de árbitro mixto, esto es, árbitro de derecho en cuanto al fondo y arbitrador en cuanto al procedimiento, en contra de cuyas resoluciones no procederá recurso alguno. Las partes otorgan mandato irrevocable al Centro de Arbitraje y Mediación de la Cámara de Comercio de Santiago A.G., para que, a solicitud de cualquiera de ellas, proceda a la designación del árbitro. El árbitro queda facultado para resolver todo asunto relacionado con su competencia y jurisdicción.</p>
      <p>Garantía de Seriedad (arriendos): Para reservar, el interesado debe pagar $250.000 como garantía, válida por 3 días desde el pago. En ese periodo debe entregar la documentación requerida. Si desiste, el monto no será reembolsado. Si el propietario rechaza la operación o por causas ajenas al interesado: se devuelve el total en un máximo de 5 días hábiles. El monto abonado se descontará de los honorarios de corretaje.</p>
    </div>
    <div class="fin"><div class="pie"><div><b>${v.ejec.nombre}</b>${v.ejec.email}<br>${v.ejec.telefono || ''}</div><div><b>${v.visit.nombre}</b>RUT: ${v.visit.rut}</div></div>
    <div class="emp">THE LIVING<br>Av. Pdte. Kennedy 7600, piso 7, Vitacura - Teléfono: 232532435 - Correo Electrónico: contacto@theliving.cl<br>https://theliving.cl</div></div>
  </body></html>`,
};
FORMATOS.push(ORDEN_VISITA);

module.exports = { id: 'the-living', nombre: 'The Living', EMPRESA, FORMATOS, CABECERA };
