// Documentos a medida (0.11): cuando la cuenta no tiene una plantilla con el nombre del documento pedido,
// Asset lo arma con los datos de la propiedad, la persona y el negocio, lo convierte en PDF, lo sube a Portalfirma
// (ingest_document_tools) y lo envía a firmar (send_to_sign_document_tools). Queda guardado en la ficha de la
// propiedad, en la de cada firmante y en el negocio (si su etapa pide firma), igual que una orden de visita.
// Antes de crear, siempre se busca: si hay una plantilla que coincide se usa esa; si hay parecidas, se muestran.
const fs = require('fs');
const path = require('path');

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const err = (m, code) => Object.assign(new Error(m), code ? { code } : {});
const hoy = () => require('./hora').hoy();
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fechaLarga = (iso) => { if (!iso) return ''; const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return `${d} de ${MESES[m - 1]} de ${y}`; };
const precioTxt = (p) => (!p || p.valor == null ? '' : p.moneda === 'CLP' ? '$' + Number(p.valor).toLocaleString('es-CL') : `${p.moneda} ${Number(p.valor).toLocaleString('es-CL')}`);

// ---------- número en palabras (para montos en pesos) ----------
const U = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiún', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const D = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const C = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
function cientos(n) { if (n === 100) return 'cien'; const c = Math.floor(n / 100); const r = n % 100; const dec = r < 30 ? U[r] : D[Math.floor(r / 10)] + (r % 10 ? ' y ' + U[r % 10] : ''); return [C[c], dec].filter(Boolean).join(' '); }
function enPalabras(n) {
  n = Math.floor(Math.abs(Number(n) || 0)); if (!n) return 'cero';
  const mill = Math.floor(n / 1e6); const miles = Math.floor((n % 1e6) / 1000); const r = n % 1000; const out = [];
  if (mill) out.push(mill === 1 ? 'un millón' : enPalabras(mill) + ' millones');
  if (miles) out.push(miles === 1 ? 'mil' : cientos(miles) + ' mil');
  if (r) out.push(cientos(r));
  return out.join(' ').replace(/\s+/g, ' ').trim();
}
const montoTxt = (monto, moneda) => { const v = Number(String(monto || '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')); if (!v) return ''; return moneda === 'UF' ? `UF ${v.toLocaleString('es-CL')}` : `$${Math.round(v).toLocaleString('es-CL')} (${enPalabras(v)} pesos)`; };

// ---------- documentos que Asset sabe armar ----------
const MEDIOS = ['Transferencia bancaria', 'Depósito', 'Vale vista', 'Efectivo', 'Tarjeta', 'Cheque'];
const CONCEPTOS = ['Comisión de corretaje', 'Garantía de arriendo', 'Primer mes de arriendo', 'Pie', 'Otro'];
const TIPOS = {
  comprobante_reserva: {
    titulo: 'Comprobante de pago de reserva', claves: /reserva/, extra: /pago|comprobante|recibo|respaldo|abono|transferencia/,
    descripcion: 'Respalda el pago de la reserva: quién pagó, cuánto, cómo y para qué propiedad. Lo firman el cliente y quien recibe.',
    campos: [['monto', 'Monto pagado', 'text', true], ['moneda', 'Moneda', ['CLP', 'UF'], true], ['fechaPago', 'Fecha del pago', 'date', true], ['medio', 'Medio de pago', MEDIOS, true],
      ['banco', 'Banco u origen', 'text', false], ['comprobante', 'N° de comprobante o transacción', 'text', false], ['plazo', 'Vigencia de la reserva (días)', 'number', true],
      ['imputacion', 'Si el negocio se concreta, el monto se imputa a', 'text', false], ['devolucion', 'Si no se concreta', 'text', true]],
    defaults: (ctx) => ({ moneda: 'CLP', fechaPago: hoy(), medio: 'Transferencia bancaria', plazo: '10', imputacion: ctx.op === 'arriendo' ? 'la garantía o el primer mes de arriendo' : 'el pie de la compraventa', devolucion: 'se devolverá íntegramente al cliente dentro de 5 días hábiles, salvo que el negocio no se concrete por desistimiento del cliente sin causa justificada.' }),
    firmantes: ['cliente', 'corredor'],
    cuerpo: (x) => [
      `En ${x.ciudad}, a ${fechaLarga(x.hoy)}, ${x.receptor.nombre}${x.receptor.rut ? ', RUT ' + x.receptor.rut : ''}, declara haber recibido de ${x.cliente.nombre}${x.cliente.rut ? ', RUT ' + x.cliente.rut : ''}, la suma de ${montoTxt(x.d.monto, x.d.moneda) || '____'}, por concepto de reserva de la propiedad ${x.propTxt}${x.op ? `, para su ${x.op === 'arriendo' ? 'arriendo' : 'compra'}` : ''}.`,
      `El pago se realizó el ${fechaLarga(x.d.fechaPago) || '____'} mediante ${String(x.d.medio || '____').toLowerCase()}${x.d.banco ? ` (${x.d.banco})` : ''}${x.d.comprobante ? `, comprobante N° ${x.d.comprobante}` : ''}.`,
      `La reserva tiene una vigencia de ${x.d.plazo || '____'} días corridos desde esta fecha. Durante ese plazo la propiedad no se ofrecerá a otros interesados.`,
      `Si el negocio se concreta, este monto se imputará a ${x.d.imputacion || 'lo que acuerden las partes'}. Si no se concreta, ${x.d.devolucion || 'las partes acordarán su devolución.'}`,
      'Las partes firman este comprobante de forma electrónica, a través de Portalfirma, en señal de conformidad.',
    ],
  },
  recibo_dinero: {
    titulo: 'Recibo de dinero', claves: /recibo|comprobante de pago|respaldo de pago|pago de (comision|garantia|arriendo|pie)/, extra: /./,
    descripcion: 'Respalda cualquier otro pago (comisión, garantía, arriendo, pie): quién pagó, cuánto, por qué y cómo.',
    campos: [['concepto', 'Concepto', CONCEPTOS, true], ['detalle', 'Detalle del concepto', 'text', false], ['monto', 'Monto pagado', 'text', true], ['moneda', 'Moneda', ['CLP', 'UF'], true], ['fechaPago', 'Fecha del pago', 'date', true],
      ['medio', 'Medio de pago', MEDIOS, true], ['banco', 'Banco u origen', 'text', false], ['comprobante', 'N° de comprobante o transacción', 'text', false]],
    defaults: (ctx) => ({ concepto: ctx.op === 'arriendo' ? 'Garantía de arriendo' : 'Comisión de corretaje', moneda: 'CLP', fechaPago: hoy(), medio: 'Transferencia bancaria' }),
    firmantes: ['cliente', 'corredor'],
    cuerpo: (x) => [
      `En ${x.ciudad}, a ${fechaLarga(x.hoy)}, ${x.receptor.nombre}${x.receptor.rut ? ', RUT ' + x.receptor.rut : ''}, declara haber recibido de ${x.cliente.nombre}${x.cliente.rut ? ', RUT ' + x.cliente.rut : ''}, la suma de ${montoTxt(x.d.monto, x.d.moneda) || '____'}, por concepto de ${String(x.d.concepto === 'Otro' ? x.d.detalle || '____' : x.d.concepto || '____').toLowerCase()}${x.d.concepto !== 'Otro' && x.d.detalle ? ` (${x.d.detalle})` : ''}, en relación con la propiedad ${x.propTxt}.`,
      `El pago se realizó el ${fechaLarga(x.d.fechaPago) || '____'} mediante ${String(x.d.medio || '____').toLowerCase()}${x.d.banco ? ` (${x.d.banco})` : ''}${x.d.comprobante ? `, comprobante N° ${x.d.comprobante}` : ''}.`,
      'Las partes firman este recibo de forma electrónica, a través de Portalfirma, en señal de conformidad.',
    ],
  },
  libre: {
    titulo: '', claves: /$^/, descripcion: 'Asset redacta el documento con la IA usando los datos de la propiedad, las personas y el negocio. Revisa el texto antes de enviarlo.',
    campos: [['instrucciones', 'Qué debe decir (opcional)', 'textarea', false]], defaults: () => ({}), firmantes: ['cliente', 'corredor'], cuerpo: null,
  },
};
const PLACEHOLDER = /^(cliente|firmante|firma|parte|persona|signer|signatario|usuario|nombre|xx+|_+|-+)$/i;
const VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'para', 'por', 'y', 'en', 'un', 'una', 'documento', 'doc', 'con', 'al', 'a', 'que', 'se', 'su', 'mi', 'necesito', 'quiero', 'hacer', 'crear', 'generar', 'armar']);
const palabras = (s) => norm(s).replace(/[^a-z0-9ñ ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !VACIAS.has(w)).map((w) => w.replace(/(es|s)$/, ''));

function inferirTipo(texto) {
  const t = norm(texto);
  if (TIPOS.comprobante_reserva.claves.test(t) && TIPOS.comprobante_reserva.extra.test(t)) return 'comprobante_reserva';
  if (/reserva/.test(t) && !/contrato|promesa|carta|desist/.test(t)) return 'comprobante_reserva';
  if (TIPOS.recibo_dinero.claves.test(t)) return 'recibo_dinero';
  return 'libre';
}
const tituloDe = (texto, tipo) => { if (tipo !== 'libre') return TIPOS[tipo].titulo; const t = String(texto || '').trim().replace(/^(necesito|quiero|crea|crear|genera|generar|haz|hacer|arma|armar)\s+(un|una|el|la)?\s*/i, '').replace(/\s+(para|de la propiedad|del cliente)\s+.*$/i, ''); return t ? t[0].toUpperCase() + t.slice(1, 90) : 'Documento'; };

function crear({ inmo, negocios, docs, ai, pf, renderPdf, dir, mock = false, firmas = null }) {
  const carpeta = () => { const d = path.join(dir(), 'documentos'); fs.mkdirSync(d, { recursive: true }); return d; };
  const corredor = () => ({ ...(inmo.config().contacto || {}), ...(inmo.config().corredor || {}) });

  // 1) ¿hay plantilla? coincide si contiene todas las palabras importantes del pedido; si no, se muestran las parecidas
  async function buscar({ texto, propId }) {
    const pedido = String(texto || '').trim(); if (pedido.length < 3) throw err('¿Qué documento necesitas?');
    const tipo = inferirTipo(pedido); const titulo = tituloDe(pedido, tipo);
    let l = []; try { l = await docs.plantillas({ texto: tipo === 'libre' ? titulo : TIPOS[tipo].titulo, propId }); } catch {}
    const claves = palabras(tipo === 'libre' ? titulo : TIPOS[tipo].titulo);
    const pts = l.map((t) => { const w = new Set(palabras(t.nombre)); const n = claves.filter((k) => w.has(k)).length; return { t, n, todas: claves.length && n === claves.length }; });
    const coincide = pts.find((x) => x.todas)?.t || null;
    const parecidas = pts.filter((x) => x.t !== coincide && x.n > 0).sort((a, b) => b.n - a.n).slice(0, 4).map((x) => x.t);
    return { pedido, titulo, tipo, tipoTxt: TIPOS[tipo].descripcion, coincide, parecidas, puedeCrear: true };
  }

  // contexto: propiedad, negocio y personas sugeridas
  function contexto({ propId, negocioId, personaId }) {
    const p = propId ? inmo.obtener(propId) : null;
    const neg = negocioId ? negocios.ver(negocioId) : p ? negocios.listar().negocios.find((n) => n.propId === p.id && n.estado === 'abierto') : null;
    const v = p?.vinculos || []; const op = neg?.tipo || (p?.arriendo && !p?.venta ? 'arriendo' : p?.venta ? 'venta' : p?.arriendo ? 'arriendo' : null);
    const cliId = personaId || neg?.clienteId || v.find((x) => ['arrendatario', 'comprador'].includes(x.rol))?.personaId || v.filter((x) => x.rol === 'interesado').slice(-1)[0]?.personaId || null;
    const propietarioId = v.find((x) => x.rol === 'propietario')?.personaId || null;
    return { p, neg, op, cliente: cliId ? inmo.personaPorId(cliId) : null, propietario: propietarioId ? inmo.personaPorId(propietarioId) : null };
  }
  // rol del firmante en el documento: Portalfirma exige el rol real («cliente» o «firmante» los rechaza como placeholder)
  const aliasDe = (tipo, rol, op, titulo) => { const pago = tipo === 'comprobante_reserva' || tipo === 'recibo_dinero';
    if (rol === 'corredor') return pago ? 'receptor' : 'corredor'; if (rol === 'propietario') return 'propietario';
    if (pago) return 'pagador'; if (/visita/i.test(titulo || '')) return 'visitante'; return op === 'arriendo' ? 'arrendatario' : op === 'venta' ? 'comprador' : 'interesado'; };
  const firmante = (rol, c) => (rol === 'corredor'
    ? { rol, titulo: 'Recibe (corredor)', alias: 'corredor', personaId: null, nombre: c.razonSocial || c.nombre || '', rut: c.rut || '', email: c.email || '', telefono: c.telefono || c.whatsapp || '', firma: true }
    : { rol, titulo: rol === 'propietario' ? 'Propietario' : 'Cliente', alias: rol, personaId: c?.id || null, nombre: c?.nombre || '', rut: c?.rut || '', email: c?.email || '', telefono: c?.telefono || '', firma: true });

  // 2) formulario prellenado
  function preparar({ tipo, titulo, propId, negocioId, personaId }) {
    const T = TIPOS[tipo] || TIPOS.libre; const x = contexto({ propId, negocioId, personaId });
    const def = T.defaults({ op: x.op });
    const campos = T.campos.map(([id, etiqueta, t, req]) => ({ id, etiqueta, tipo: Array.isArray(t) ? 'select' : t, opciones: Array.isArray(t) ? t : null, requerido: req, valor: def[id] ?? '' }));
    const fir = T.firmantes.map((r) => ({ ...firmante(r, r === 'corredor' ? corredor() : r === 'propietario' ? x.propietario : x.cliente), alias: aliasDe(tipo, r, x.op, titulo || T.titulo) }));
    return { tipo, titulo: titulo || T.titulo, descripcion: T.descripcion, propiedad: x.p ? { id: x.p.id, codigo: x.p.codigo, titulo: x.p.titulo } : null,
      negocio: x.neg ? { id: x.neg.id, titulo: x.neg.titulo, etapa: x.neg.etapaInfo?.t, pideFirma: !!x.neg.etapaInfo?.firma } : null, campos, firmantes: fir,
      personas: inmo.listar().personas.map((c) => ({ id: c.id, nombre: c.nombre, rut: c.rut, email: c.email, telefono: c.telefono, rol: (x.p?.vinculos || []).find((v) => v.personaId === c.id)?.rol || null })),
      variables: variables(x) };
  }
  // los datos que se usan (y que la IA puede citar)
  function variables(x) {
    const p = x.p; const c = corredor();
    return { fecha: fechaLarga(hoy()), ciudad: inmo.config().ciudad || 'Santiago', operacion: x.op,
      propiedad: p ? { codigo: p.codigo, titulo: p.titulo, tipo: String(p.tipo || '').replace(/_/g, ' '), direccion: [p.direccion, p.unidad ? 'depto. ' + p.unidad : ''].filter(Boolean).join(', '), comuna: p.comuna || '', rol: p.rol || '',
        precioVenta: precioTxt(p.precioVenta), precioArriendo: precioTxt(p.precioArriendo), gastosComunes: p.gastosComunes ? '$' + Number(p.gastosComunes).toLocaleString('es-CL') : '' } : null,
      negocio: x.neg ? { titulo: x.neg.titulo, etapa: x.neg.etapaInfo?.t || '' } : null, corredor: { nombre: c.razonSocial || c.nombre || '', rut: c.rut || '' } };
  }
  const propTxt = (p) => (p ? `ubicada en ${[p.direccion, p.unidad ? 'depto. ' + p.unidad : '', p.comuna].filter(Boolean).join(', ')} (código ${p.codigo})` : '____');

  // 3) texto del documento (párrafos). Los conocidos salen de su modelo; los demás los redacta la IA.
  async function redactar({ tipo, titulo, propId, negocioId, personaId, datos = {}, firmantes = [] }) {
    const T = TIPOS[tipo] || TIPOS.libre; const x = contexto({ propId, negocioId, personaId });
    const cli = firmantes.find((f) => f.rol === 'cliente') || firmante('cliente', x.cliente); const rec = firmantes.find((f) => f.rol === 'corredor') || firmante('corredor', corredor());
    if (T.cuerpo) return { parrafos: T.cuerpo({ ciudad: inmo.config().ciudad || 'Santiago', hoy: hoy(), d: datos, op: x.op, cliente: cli, receptor: rec, propTxt: propTxt(x.p) }), ia: false };
    const vars = { ...variables(x), titulo, firmantes: firmantes.filter((f) => f.firma).map((f) => ({ papel: f.titulo, nombre: f.nombre, rut: f.rut })) };
    const sys = 'Redactas documentos breves del rubro inmobiliario chileno para firmar electrónicamente. Usa SOLO los datos entregados; si falta un dato necesario, escribe «____» en su lugar. No inventes montos, fechas, RUT ni direcciones. Español de Chile, claro y formal, sin jerga legal innecesaria. Entre 3 y 8 párrafos. No incluyas el título, ni la línea de firmas, ni el lugar y fecha al final. Responde SOLO un JSON: {"parrafos": ["…", "…"]}.';
    const user = `REDACTAR_DOC\nDocumento: ${titulo}\n${datos.instrucciones ? 'Lo que debe decir: ' + datos.instrucciones + '\n' : ''}Datos (JSON):\n${JSON.stringify(vars)}\n`;
    const r = await ai.chat({ system: sys, messages: [{ role: 'user', content: user }], json: true, action: 'draft' });
    let j = null; try { j = JSON.parse(String(r.text).replace(/^```(json)?|```$/g, '').trim()); } catch {}
    const ps = (j?.parrafos || []).map((s) => String(s).trim()).filter(Boolean).slice(0, 12);
    if (!ps.length) throw err('La IA no devolvió el texto del documento. Intenta de nuevo o escríbelo tú.');
    return { parrafos: ps, ia: true, tokens: r.tokens };
  }

  // 4) PDF
  function html({ titulo, parrafos, firmantes, propiedad }) {
    const rc = (firmantes || []).find((f) => f.rol === 'corredor'); const c0 = corredor(); const c = { ...c0, ...(rc?.nombre ? { razonSocial: rc.nombre, rut: rc.rut || c0.rut } : {}) }; const emisor = c.razonSocial || c.nombre || '';
    const firm = firmantes.filter((f) => f.firma);
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>
      @page { size: Letter; margin: 22mm 22mm 20mm; } * { box-sizing: border-box; }
      body { font: 11.5pt/1.55 Georgia, 'Times New Roman', serif; color: #1b1f2a; margin: 0; }
      .h { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #2f49e0; padding-bottom: 8px; margin-bottom: 26px; font: 9pt/1.3 -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #5b6275; }
      .h b { display: block; font-size: 11pt; color: #1b1f2a; } h1 { font: 700 16pt/1.25 -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; text-align: center; margin: 0 0 22px; letter-spacing: .01em; text-transform: uppercase; }
      p { margin: 0 0 12px; text-align: justify; } .firmas { display: grid; grid-template-columns: repeat(${Math.min(2, firm.length || 1)}, 1fr); gap: 40px 36px; margin-top: 64px; page-break-inside: avoid; }
      .f { border-top: 1px solid #1b1f2a; padding-top: 6px; text-align: center; font: 9.5pt/1.4 -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; } .f b { display: block; font-size: 10pt; } .f small { color: #5b6275; }
    </style></head><body>
      <div class="h"><div><b>${esc(emisor || 'Documento')}</b>${c.rut ? 'RUT ' + esc(c.rut) : ''}</div><div>${propiedad ? `Propiedad ${esc(propiedad.codigo)}<br>` : ''}${esc(fechaLarga(hoy()))}</div></div>
      <h1>${esc(titulo)}</h1>
      ${parrafos.map((t) => `<p>${esc(t)}</p>`).join('')}
      <div class="firmas">${firm.map((f) => `<div class="f"><b>${esc(f.nombre || '____')}</b>${f.rut ? 'RUT ' + esc(f.rut) + '<br>' : ''}<small>${esc(f.titulo)}</small></div>`).join('')}</div>
    </body></html>`;
  }
  const archivoDe = (titulo, p) => path.join(carpeta(), `${(p ? p.codigo + ' - ' : '') + titulo} - ${hoy()}-${Date.now().toString(36).slice(-4)}.pdf`.replace(/[\\/:*?"<>|]/g, '-'));
  async function vistaPrevia(o) { const p = o.propId ? inmo.obtener(o.propId) : null; const f = archivoDe(o.titulo + ' (borrador)', p);
    fs.writeFileSync(f, await renderPdf(html({ titulo: o.titulo, parrafos: o.parrafos, firmantes: o.firmantes, propiedad: p }))); return f; }

  function validar(o) {
    const faltan = []; const T = TIPOS[o.tipo] || TIPOS.libre;
    for (const [id, et, , req] of T.campos) if (req && !String(o.datos?.[id] ?? '').trim()) faltan.push(et);
    if (!String(o.titulo || '').trim()) faltan.push('Título del documento');
    if (!(o.parrafos || []).some((x) => String(x).trim())) faltan.push('Texto del documento');
    if ((o.parrafos || []).some((x) => /____/.test(x))) faltan.push('Completar los «____» del texto');
    const firm = (o.firmantes || []).filter((f) => f.firma); if (!firm.length) faltan.push('Al menos un firmante');
    for (const x of require('./firmas').revisarFirmantes(firm)) faltan.push(`${x.nombre || x.calidad}: ${x.problemas.join('; ')}`);
    for (const f of firm) { const q = []; if (!String(f.alias || '').trim() || PLACEHOLDER.test(String(f.alias).trim())) q.push('su rol en el documento (por ejemplo pagador, visitante, arrendatario)'); if (!f.nombre) q.push('nombre'); if (!f.rut || !inmo.validRut(f.rut)) q.push('RUT válido'); if (!f.email) q.push('correo'); if (!f.telefono) q.push('celular'); if (q.length) faltan.push(`${f.titulo}: ${q.join(', ')}`); }
    return faltan;
  }

  // 5) PDF → Portalfirma → a firmar → queda guardado en la propiedad, en cada firmante y en el negocio
  async function enviar(o) {
    const faltan = validar(o); if (faltan.length) throw err('Faltan datos: ' + faltan.join('; ') + '.');
    const p = o.propId ? inmo.obtener(o.propId) : null; const firm = o.firmantes.filter((f) => f.firma);
    const archivo = archivoDe(o.titulo, p); const bytes = await renderPdf(html({ titulo: o.titulo, parrafos: o.parrafos, firmantes: o.firmantes, propiedad: p })); fs.writeFileSync(archivo, bytes);
    const ing = await pf.ingest(Buffer.from(bytes).toString('base64'), path.basename(archivo));
    const docId = ing?.document_id || ing?.fileId || ing?.id; if (!docId) throw err('Portalfirma no recibió el PDF' + (ing?.message ? ': ' + ing.message : '.'));
    const pagador = String(o.email || corredor().email || '').trim(); if (!pagador) throw err('Falta el correo del pagador (tu cuenta de Portalfirma).');
    const r = await pf.sendToSign({ document_id: docId, email: pagador, protocolization: 'none', signatories: firm.map((f) => ({ rut: inmo.fmtRut(f.rut), fullName: f.nombre, email: f.email, phone: f.telefono, alias: String(f.alias).trim().toLowerCase(), typeSign: 'simple' })) });
    const op = require('./firmas').operacionDe(r); const msg = typeof r?.message === 'string' ? r.message : '';
    if (op == null) throw err(/status code (\d+)/.test(msg) ? `Portalfirma no pudo crear la operación (error ${/status code (\d+)/.exec(msg)[1]}). Revisa «Mis operaciones» antes de reintentar.` : msg || 'Portalfirma no devolvió el número de operación.');
    // personas: corredor a la configuración; clientes nuevos al CRM y vinculados a la propiedad
    for (const f of firm) {
      if (f.rol === 'corredor') { inmo.guardarConfig({ corredor: { ...(inmo.config().corredor || {}), nombre: inmo.config().corredor?.nombre || f.nombre, rut: f.rut, email: f.email, telefono: f.telefono } }); continue; }
      let c = f.personaId ? inmo.personaPorId(f.personaId) : inmo.listar().personas.find((x) => x.rut === inmo.fmtRut(f.rut)) || null;
      if (!c) try { c = await inmo.guardarPersona({ nombre: f.nombre, rut: f.rut, email: f.email, telefono: f.telefono, roles: [f.rol === 'propietario' ? 'propietario' : 'interesado'] }); } catch { c = null; }
      else if ((!c.email && f.email) || (!c.telefono && f.telefono)) try { c = await inmo.guardarPersona({ ...c, email: c.email || f.email, telefono: c.telefono || f.telefono }); } catch {}
      f.personaId = c?.id || null;
      if (c && p && !(p.vinculos || []).some((v) => v.personaId === c.id)) try { await inmo.vincular(p.id, c.id, f.rol === 'propietario' ? 'propietario' : 'interesado'); } catch {}
      if (c) inmo.registrar(c.id, `Firma «${o.titulo}» · operación ${op}`, { ref2: p?.id });
    }
    const doc = { operacion: op, plantilla: o.titulo, plantillaId: null, origen: 'asset', tipo: o.tipo, archivo, datos: o.datos || {}, fecha: new Date().toISOString(), estado: 'en_firma',
      firmantes: firm.map((f) => ({ nombre: f.nombre, rut: inmo.fmtRut(f.rut), rol: f.titulo, personaId: f.personaId || null })), negocioId: null };
    let negMsg = null;
    if (o.negocioId) { const n = negocios.ver(o.negocioId); if (n?.etapaInfo?.firma) { negocios.vincularFirma(n.id, n.etapa, op); doc.negocioId = n.id; negMsg = `Quedó ligado a la etapa «${n.etapaInfo.t}» del negocio: cuando se firme, avanza solo.`; } }
    firmas?.registrar({ operacion: op, nombre: o.titulo, propId: p?.id || null, negocioId: doc.negocioId, firmantes: firm.map((f) => ({ nombre: f.nombre, rut: f.rut, alias: f.alias, email: f.email, telefono: f.telefono })), origen: 'asset' });
    if (p) inmo.agregarFirma(doc, [p.id], `«${o.titulo}» creado en Asset y enviado a firmar (operación ${op})`);
    else { const l = inmo.config().documentosSueltos || []; l.unshift(doc); inmo.guardarConfig({ documentosSueltos: l.slice(0, 100) }); }
    return { ok: true, operacion: op, plantilla: o.titulo, archivo, propiedad: p ? { id: p.id, codigo: p.codigo } : null, firmantes: doc.firmantes, negocio: negMsg, pago: r?.payment || null };
  }

  // documentos de una persona (los que firma: órdenes de visita, comprobantes, contratos…)
  function dePersona(personaId) {
    const c = inmo.personaPorId(personaId); const rut = c ? inmo.fmtRut(c.rut) : null;
    return [...inmo.todas().flatMap((p) => (p.firmas || []).map((f) => ({ ...f, prop: { id: p.id, codigo: p.codigo, titulo: p.titulo } }))), ...(inmo.config().documentosSueltos || [])]
      .filter((f) => (f.firmantes || []).some((s) => s.personaId === personaId || (rut && s.rut && inmo.fmtRut(s.rut) === rut)))
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).map((f) => ({ operacion: f.operacion, titulo: f.plantilla, fecha: f.fecha, estado: f.estado, origen: f.origen || 'plantilla', archivo: f.archivo && fs.existsSync(f.archivo) ? f.archivo : null, propiedad: f.prop || null }));
  }

  return { PLACEHOLDER, TIPOS: Object.fromEntries(Object.entries(TIPOS).map(([k, t]) => [k, { titulo: t.titulo, descripcion: t.descripcion }])), buscar, preparar, redactar, vistaPrevia, validar, enviar, dePersona, html, enPalabras, inferirTipo };
}

module.exports = { crear, enPalabras, inferirTipo };
