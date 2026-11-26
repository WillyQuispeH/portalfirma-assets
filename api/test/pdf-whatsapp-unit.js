// WhatsApp: «envíalo a firmar» con un PDF adjunto (enviar_pdf_a_firmar) y «guárdala» (guardar_tipo_documento). Sin red ni base: la lectura de
// firmantes, el envío y el catálogo son falsos. Comprueba el flujo en dos pasos, que la firma salga del tipo reconocido, que no se pregunte
// lo que ya se sabe y que la pregunta de guardar solo aparezca cuando el tipo no era conocido.
const { HerramientasFirmas } = require('../dist/whatsapp/herramientas/documentos-firmas');
const ok = (v, m) => { if (!v) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };

(async () => {
  const filas = [];
  const db = { firma: { upsert: async (o) => { filas.push(o.create); } } };
  let lectura;
  const extraer = { extraerPdf: async () => lectura };
  const enviados = [];
  const envio = { enviar: async (o) => { enviados.push(o); return { operacion: 555, tipoFirma: 'x', tramite: o.protocolizacion, firmantes: [] }; } };
  const creados = [];
  const tipos = { crear: async (_u, b) => { creados.push(b); return { id: 'x', nombre: b.nombre, tipoFirma: b.tipoFirma, tramite: b.tramite }; } };
  const h = new HerramientasFirmas(db, {}, {}, {}, {}, {}, {}, {}, extraer, envio, tipos);
  const tool = (n) => h.herramientas.find((x) => x.name === n);
  const pdf = { nombre: 'oferta.pdf', mime: 'application/pdf', bytes: Buffer.from('%PDF-1.4 ' + 'x'.repeat(50)) };
  const ctx = (texto, adjuntos = []) => ({ corredoraId: 'TL', usuarioId: 'u1', nombre: 'Ana', admin: false, texto, adjuntos });
  const ana = { nombre: 'Ana Rojas', rut: '12.345.678-5', email: 'ana@x.cl', telefono: '', rol: 'oferente', rutValido: true, pagina: 1 };
  const luis = { nombre: 'Luis Pérez', rut: '11.111.111-1', email: 'luis@x.cl', telefono: '', rol: 'propietario', rutValido: true, pagina: 2 };

  ok(tool('enviar_pdf_a_firmar') && tool('guardar_tipo_documento'), 'las dos herramientas existen');
  let r = await tool('enviar_pdf_a_firmar').ejecutar(ctx('envíalo a firmar'), {});
  ok(/Mándame el PDF/.test(r.error), 'sin PDF adjunto pide el archivo');

  // ---- un tipo conocido: la firma y el trámite salen del catálogo
  lectura = { legible: true, tipoDocumento: 'Carta de oferta de compra', tipoConocido: { id: 'carta-oferta', nombre: 'Carta oferta', tipoFirma: 'visada', tramite: 'legalization' }, firmantes: [ana, luis], avisos: [] };
  r = await tool('enviar_pdf_a_firmar').ejecutar(ctx('envíalo a firmar', [pdf]), {});
  ok(r.ok && r.necesitaConfirmacion && r.firma === 'firma visada con legalización notarial' && r.tipoReconocido === 'Carta oferta', 'tipo conocido: usa la firma y el trámite configurados, sin preguntar');
  ok(r.firmantes.length === 2 && !enviados.length, 'muestra quién firma y todavía no envía');
  const sinSi = await tool('enviar_pdf_a_firmar').ejecutar(ctx('mmm déjame pensarlo'), { confirmado: true });
  ok(/no confirmó|todavía/.test(sinSi.error) && !enviados.length, 'sin un «sí» del corredor no se envía');
  r = await tool('enviar_pdf_a_firmar').ejecutar(ctx('sí'), { confirmado: true });
  ok(r.enviada && r.operacion === 555 && enviados.length === 1, 'con el sí lo envía (el «sí» no trae el archivo: usa el preparado)');
  const e = enviados[0];
  ok(e.protocolizacion === 'legalization' && e.firmantes.every((f) => f.typeSign === 'visada') && e.firmantes[0].alias === 'oferente' && e.bytes.length === pdf.bytes.length, 'se envía con la firma y el trámite del tipo, y los roles leídos');
  ok(filas.length === 1 && filas[0].operacion === 555 && filas[0].origen === 'whatsapp', 'queda registrado en «Mis operaciones»');
  ok(!r.indicacionGuardar, 'si el tipo era conocido no pregunta si guarda la configuración');
  const otra = await tool('enviar_pdf_a_firmar').ejecutar(ctx('sí'), { confirmado: true });
  ok(otra.error && enviados.length === 1, 'un segundo «sí» no lo envía de nuevo');

  // ---- tipo desconocido: firma avanzada por defecto y al final pregunta si se guarda
  lectura = { legible: true, tipoDocumento: 'Contrato de prestación de servicios', tipoConocido: null, firmantes: [ana], avisos: ['Una duda'] };
  r = await tool('enviar_pdf_a_firmar').ejecutar(ctx('mándalo a firmar', [pdf]), {});
  ok(r.firma === 'firma avanzada' && !r.tipoReconocido && /no es un tipo que la corredora tenga configurado/.test(r.indicacion), 'tipo desconocido: firma avanzada sin trámite y se avisa');
  r = await tool('enviar_pdf_a_firmar').ejecutar(ctx('hazlo con legalización'), { tipo_firma: 'simple', tramite: 'legalizacion' });
  ok(r.firma === 'firma simple con legalización notarial' && r.necesitaConfirmacion, 'el corredor puede pedir otra firma o trámite en otro mensaje (sin volver a mandar el PDF)');
  r = await tool('enviar_pdf_a_firmar').ejecutar(ctx('sí'), { confirmado: true });
  ok(r.enviada && enviados[1].firmantes[0].typeSign === 'simple' && enviados[1].protocolizacion === 'legalization', 'se envía con lo que pidió');
  ok(/¿Guardo esta configuración/.test(r.indicacionGuardar) && /Contrato de prestación de servicios/.test(r.indicacionGuardar), 'al final pregunta si guarda la configuración para ese tipo');
  r = await tool('guardar_tipo_documento').ejecutar(ctx('sí'), { nombre: 'Contrato de prestación de servicios', tipo_firma: 'simple', tramite: 'legalizacion' });
  ok(r.ok && creados[0].tipoFirma === 'simple' && creados[0].tramite === 'legalization', 'guardar_tipo_documento deja la configuración por defecto');

  // ---- lo que falta se pide, sin enviar
  lectura = { legible: true, tipoDocumento: 'Anexo', tipoConocido: null, firmantes: [{ ...ana, email: '' }, { ...luis, rut: '' }], avisos: [] };
  r = await tool('enviar_pdf_a_firmar').ejecutar(ctx('envíalo', [pdf]), {});
  ok(r.listo === false && r.faltan.some((x) => /correo de Ana/.test(x)) && r.faltan.some((x) => /RUT válido de Luis/.test(x)), 'si falta un correo o un RUT, lo pide y no prepara el envío');
  r = await tool('enviar_pdf_a_firmar').ejecutar(ctx('sí'), { confirmado: true });
  ok(r.error && enviados.length === 2, 'y sin preparar no se puede confirmar');
  lectura = { legible: false, firmantes: [], avisos: [] };
  r = await tool('enviar_pdf_a_firmar').ejecutar(ctx('envíalo', [pdf]), {});
  ok(/No pude leer/.test(r.error), 'un documento ilegible se dice claro');

  console.log('OK');
})().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
