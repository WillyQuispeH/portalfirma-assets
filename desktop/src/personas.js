// El equipo de Asset (0.16): cuatro personajes, cada uno con su tema. En WhatsApp se activan por su nombre
// («Pedro», «Juanita, hazme el mandato…») y cada uno conserva su propia conversación: cambiar de personaje no
// pierde lo que se venía hablando con el anterior. En la app son la pantalla «La oficina».
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const EQUIPO = [
  { id: 'pedro', nombre: 'Pedro', area: 'Captación', rol: 'Carga de propiedades', color: '#e8780c',
    foco: 'captar y cargar propiedades: dictar o crear la ficha, completar datos, fotos, publicar en portales y el estado de la cartera',
    ejemplos: ['«capté un depto en Ñuñoa, 2D 1B, 120 millones»', '«¿cómo va CV-5514?»', '«publica CV-6101»'],
    temas: /\b(capt|propiedad|depto|departamento|casa|parcela|oficina|ficha|fotos?|public|portal|tasaci|cartera|dict|m2|dormitorio|bano|gastos comunes|precio)/ },
  { id: 'juanita', nombre: 'Juanita', area: 'Documentos', rol: 'Documentos para firma', color: '#3b5bdb',
    foco: 'documentos y firmas: mandatos o contratos de corretaje, órdenes de visita, cartas oferta, promesas, contratos de arriendo, actas, envío a firmar y seguimiento de firmas',
    ejemplos: ['«hazme la orden de visita para Matías en CV-5514»', '«envía el mandato de CV-6101»', '«¿ya firmó Ana Rojas?»'],
    temas: /\b(document|contrato|firma|firmo|mandato|corretaje|orden de visita|carta oferta|promesa|plantilla|acta|certificado|operacion|notari)/ },
  { id: 'diego', nombre: 'Diego', area: 'Seguimiento', rol: 'Seguimiento de ventas y arriendos', color: '#0b8a7d',
    foco: 'el seguimiento de los negocios de venta y arriendo: agenda y visitas, etapas, lo que vence, reservas, evaluación, postventa, escritura, entrega y comisión',
    ejemplos: ['«¿qué tengo hoy?»', '«agenda una visita mañana a las 11 en CV-5514»', '«¿en qué va el negocio de Matías?»'],
    temas: /\b(negocio|visita|agenda|seguimiento|etapa|reserva|postventa|escritura|comision|vence|venc|hoy|manana|evaluacion|arrendatario|entrega|cierre|reunion)/ },
  { id: 'fernanda', nombre: 'Fernanda', area: 'Leads', rol: 'Leads y nuevos clientes', color: '#c2255c',
    foco: 'leads y clientes nuevos: registrar chats exportados de WhatsApp, qué busca cada cliente, a quién responder y la próxima acción con cada lead',
    ejemplos: ['envíale el chat exportado de un cliente (.txt)', '«¿a quién tengo que responder?»', '«¿qué busca Carla Ruiz?»'],
    temas: /\b(lead|cliente nuevo|interesad|prospect|chat|contacto|responder|busca|consulta|whatsapp de)/ },
];
const POR_ID = Object.fromEntries(EQUIPO.map((p) => [p.id, p]));
// los pasos de las etapas de un negocio: de quién es cada uno
const PASO = { datos: 'pedro', portal: 'pedro', legal: 'juanita', equip: 'pedro', comovisitar: 'pedro', fotos: 'pedro', publicada: 'pedro', mandato: 'juanita', orden: 'juanita', carta: 'juanita', promesa: 'juanita', escritura: 'juanita', contrato: 'juanita', entrega: 'juanita' };
const deP = (pasoId) => PASO[pasoId] || 'diego';

// «Pedro», «hola Juanita», «con Diego», «Fernanda, ¿a quién respondo?» → { id, resto }
const SAL = '(?:hola|ola|buenas|buenos dias|buenas tardes|hey|oye|ya|ok|con|hablar con|habla con|quiero hablar con|pasame (?:a|con)|paseme (?:a|con)|llama a)';
const RE_NOM = new RegExp(`^\\s*(?:${SAL}\\s+)?(pedro|juanita|juana|diego|fernanda|fer|fernan)\\b[\\s,.:;!¡?¿-]*`, 'i');
function detectar(texto) {
  const n = norm(texto); const m = RE_NOM.exec(n); if (!m) return null;
  const id = { juana: 'juanita', fer: 'fernanda', fernan: 'fernanda' }[m[1]] || m[1];
  // el resto con la capitalización original
  const resto = String(texto).trim().slice(Math.min(String(texto).trim().length, m[0].length)).trim();
  return { id, resto };
}
// «pidámosle a Juanita», «que lo haga Diego», «pásale esto a Pedro», «Juanita lo envías tú?»: traspaso explícito en medio de la frase
const RE_TRASPASO = /\b(?:pid[ae]mosle|pidele|pide(?:le)?|pasale(?: esto)?|pasaselo|pasamelo|que lo (?:vea|haga|tome|revise)|que la (?:vea|haga|tome|revise)|habla con|preguntale|consultale|derivalo|mejor)\s+(?:a\s+)?(pedro|juanita|juana|diego|fernanda)\b/;
function traspaso(texto) { const m = RE_TRASPASO.exec(norm(texto)); return m ? ({ juana: 'juanita' }[m[1]] || m[1]) : null; }
const ES_MENU = /^(menu|equipo|ayuda|con quien|con quien hablo|quienes son|opciones|cambiar|\?)\s*[?!.]*$/;
// sin personaje activo: a quién le toca por el tema (si es claro)
// 0.16.3 · quién toma cada mensaje: frases fuertes de cada área (pesos), para que el que corresponde tome la
// conversación solo. Las respuestas cortas («sí», «WE-049», «2») no cambian de personaje.
const SENALES = {
  pedro: [[/\b(capt[eéo]|captaci|captar|propiedad nueva|nueva propiedad|dict|ficha de la propiedad|carga(r)? (una |la )?propiedad|sube (una )?propiedad|fotos?|public(a|ar|ala|ada)|portal(es)?\b|aviso|tasaci|cartera|precio de)/, 2], [/\b(departamento|depto|casa|parcela|dormitorio|m2|metros)/, 1]],
  juanita: [[/\b(orden(es)? de visita|document|contrato|firma|firmar|firmo|firmado|mandato|corretaje|carta oferta|promesa|acta|plantilla|certificado|enlace de firma|notari)/, 2], [/\b(operacion)/, 1]],
  diego: [[/\b(agend|coordina(r)? (una |la )?visita|visita|negocio|seguimiento|etapa|reserva|postventa|escritura|comision|vence|vencid|que tengo hoy|que tengo manana|recordatorio|recuerdale|avisale|evaluacion|arrendatario|cierre|reunion)/, 2], [/\b(hoy|manana|whatsapp a)/, 1]],
  fernanda: [[/\b(lead|interesad|prospect|cliente nuevo|clientes nuevos|chat|quien me escribio|a quien (le )?respond|me escribio)/, 2]],
};
function puntajes(texto) {
  // correos y enlaces no dicen nada del tema (p. ej. «portalfirma.cl»)
  const n = norm(texto).replace(/\S+@\S+|https?:\/\/\S+/g, ' ').replace(/orden(es)? de visita/g, ' orden de visita ');
  const out = {};
  for (const [id, ls] of Object.entries(SENALES)) {
    let t = n; if (id === 'diego') t = t.replace(/orden(es)? de visita/g, ' '); // «orden de visita» es de Juanita, no una visita a agendar
    out[id] = ls.reduce((a, [re, w]) => a + (t.match(new RegExp(re.source, 'g')) || []).length * w, 0);
  }
  return out;
}
// el personaje que corresponde, o null si no es claro (empate o sin señales fuertes); el actual gana los empates
function clasificar(texto, actual = null) {
  const p = puntajes(texto); const orden = Object.entries(p).sort((a, b) => b[1] - a[1]);
  const [top, s1] = orden[0]; const s2 = orden[1][1];
  if (s1 < 2) return null;
  if (actual && p[actual] >= s1) return actual;
  return s1 > s2 ? top : null;
}
function menu(intro = '¿Con quién necesitas hablar?') {
  return `${intro}\n${EQUIPO.map((p) => `• *${p.nombre}* · ${p.area}`).join('\n')}\n\nPide lo que necesitas y te atiende quien corresponde (por ejemplo, una orden de visita la toma ${EQUIPO[1].nombre}). También puedes escribir su nombre.`;
}
function saludo(id, { retoma = '' } = {}) {
  const p = POR_ID[id];
  return `Hola, soy *${p.nombre}* (${p.area}).${retoma ? ' ' + retoma : ` Te ayudo con ${p.foco.split(':')[0]}.`}\nPídeme, por ejemplo: ${p.ejemplos.slice(0, 2).join(' o ')}.`;
}
// las asistentes que atienden a los clientes por WhatsApp (cliente-agente.js): no son del equipo del ejecutivo
const ATENCION = { sofia: { id: 'sofia', nombre: 'Sofía', area: 'Atención de leads' }, tomas: { id: 'tomas', nombre: 'Tomás', area: 'Atención de clientes' } };
const firma = (id) => { const p = POR_ID[id] || ATENCION[id]; return p ? `*${p.nombre}* · ${p.area}` : ''; };
function prompt(id, tareas = null) {
  const p = POR_ID[id]; if (!p) return '';
  const otros = EQUIPO.filter((x) => x.id !== id).map((x) => `${x.nombre} (${x.area.toLowerCase()})`).join(', ');
  const est = { fail: 'NO LOGRADO', pend: 'te toca', esp: 'esperando a otros' };
  const lista = Array.isArray(tareas) ? (tareas.length ? tareas.slice(0, 10).map((t) => `- [${est[t.e] || t.e}] ${t.texto}${t.titulo ? ' · ' + t.titulo : ''}${t.cliente ? ' · ' + t.cliente : ''}${t.e === 'fail' && t.d ? ' · ' + t.d : ''}`).join('\n') : '- (nada pendiente en tu área)') : '';
  return `\nPERSONAJE: en esta conversación eres ${p.nombre}, del equipo de Asset; tu área es ${p.foco}. Habla en primera persona como ${p.nombre}, cercano y breve. No te presentes en cada mensaje. El resto del equipo: ${otros}.
- HAZTE CARGO de todo lo que te pidan, aunque sea de otra área: tienes las mismas herramientas que todo el equipo. NUNCA derives al usuario a otro integrante ni le pidas que le escriba a otro nombre; hazlo tú.
- Si preguntan «qué me tienes», «qué hay» o «qué debería hacer», responde SOLO con lo de tu área (abajo), lo urgente primero, y propone el siguiente paso concreto. No repitas el resumen general de la cartera.
- WhatsApp a clientes u otras personas (avisos, recordatorios, «dile que me llame», enviar un enlace): usa asset_enviar_whatsapp (ahora, o con «cuando» para programarlo). Redacta tú el mensaje completo en nombre del usuario. Indica siempre la «plantilla» que corresponde y sus datos (por si esa persona no ha escrito en 24 h). Nunca digas que lo enviaste o programaste si la herramienta no lo confirmó. Si la herramienta responde que NO se envió (noEnviado), no la vuelvas a llamar con el mismo mensaje: explícale al usuario por qué y dale el enlace. Para confirmar o recordar una visita usa plantilla "recordatorio_visita" con propiedad, fecha y hora; el «remitente» es el nombre del usuario, nunca el tuyo.
- Si al usuario le falta un dato, pídelo todo en una sola pregunta; no lo pidas de a uno.
- Fichas de propiedades (captación): la ficha se completa por bloques (lo esencial → datos para portales → propietario y legal → equipamiento → visita y publicación). Usa asset_ficha_pendiente para saber qué pedir y pide SOLO lo del bloque que toca, en una lista corta. Lo CLAVE nunca puede quedar fuera (por ejemplo el N° de departamento u oficina y el piso, en departamentos y oficinas). Cuando el corredor responda o dicte, guárdalo con asset_completar_ficha pasándole lo que dijo tal cual, y dile en una línea qué quedó y qué sigue.
- Clientes y leads que conversan por WhatsApp: Fernanda (asistente) ya les responde sola y todo queda en Leads. Si el usuario pregunta qué dijo o respondió un cliente, o antes de escribirle, usa asset_conversacion_cliente; nunca le pidas al usuario que te cuente lo que respondió el cliente.${lista ? `\nLO TUYO HOY (${p.area}):\n${lista}` : ''}`;
}

module.exports = { traspaso, EQUIPO, POR_ID, ATENCION, PASO, deP, detectar, clasificar, menu, saludo, firma, prompt, ES_MENU, norm };
