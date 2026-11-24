// Detalle de un envío a firmar (enlaces) y aviso al corredor cuando firman (sin red). Requiere compilar antes (dist/).
const { resumenEnvio, respuestaEnvio, enlaceOperacion } = require('../dist/documentos/envio-firma');
const { textoAvisoFirma } = require('../dist/whatsapp/aviso-firma');
const { enlacesDe } = require('../dist/conexiones/portalfirma-api');
const ok = (v, m) => { if (!v) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };

ok(enlaceOperacion(4521) === 'https://cliente.portalfirma.cl/c?o=4521', 'el enlace de seguimiento lleva el número de operación');

const detalle = { signatories: [
  { name: 'Juan', paternalLastName: 'Pérez', maternalLastName: 'Soto', alias: 'visitante', email: 'j@x.cl', phone: '+56911111111', url: 'https://cliente.portalfirma.cl/v?c=a1' },
  { fullName: 'María Rojas', email: 'm@x.cl', url: 'https://cliente.portalfirma.cl/v?c=b2' },
] };
const f = enlacesDe(detalle);
ok(f.length === 2 && f[0].nombre === 'Juan Pérez Soto' && f[0].rol === 'visitante' && f[1].nombre === 'María Rojas', 'enlacesDe lee nombre y rol de cada firmante');
ok(f[0].url.endsWith('c=a1') && f[1].telefono === '', 'enlacesDe trae el enlace de cada uno');
ok(enlacesDe(null).length === 0 && enlacesDe({}).length === 0, 'sin detalle no hay firmantes (y no falla)');

const t = resumenEnvio({ documento: 'Orden de visita nº 11', operacion: 11527, firmantes: f, extra: ['VISITA AGENDADA', 'Fecha: Miércoles 25/11'].join(String.fromCharCode(10)) });
const orden = ['ORDEN DE VISITA N.º 11', 'Estado: Enviada a firma', 'Operación: #11527', 'FIRMANTES (2)', '1. Juan Pérez Soto (visitante)', 'Firma: https://cliente.portalfirma.cl/v?c=a1', '2. María Rojas', 'SEGUIMIENTO DE LA OPERACIÓN', 'https://cliente.portalfirma.cl/c?o=11527', 'VISITA AGENDADA', 'Puedes pedirme'];
let pos = -1; let bien = true; for (const x of orden) { const k = t.indexOf(x, pos + 1); if (k < 0) { bien = false; console.log('falta/desordenado:', x); break; } pos = k; }
ok(bien, 'el detalle sigue el orden: título, estado, operación, FIRMANTES con enlace, SEGUIMIENTO, bloque del documento, qué puedes pedir');
ok(!/saldo|cobr/i.test(t), 'no habla de saldo ni de cobros');
const sin = resumenEnvio({ documento: 'X', operacion: 9, firmantes: [] });
ok(sin.includes('c?o=9') && !sin.includes('FIRMANTES'), 'sin firmantes igual deja el enlace de la operación');
const r = respuestaEnvio('Doc', { operacion: 7, firmantes: f });
ok(r.detalleEnvio.includes('c?o=7') && /TEXTUALMENTE/.test(r.instruccionRespuesta), 'la herramienta manda mostrar el bloque tal cual');

const base = { corredoraId: 'c', enviadoPorId: 'u', operacion: 4521, documento: 'Orden de visita', cambios: [], firmados: 1, total: 2, faltan: ['María Rojas'], completo: false };
const a = textoAvisoFirma({ ...base, cambios: ['Juan Pérez (visitante) firmó «Orden de visita»'] });
ok(a.startsWith('✍️ Juan Pérez (visitante) firmó') && a.includes('Han firmado 1 de 2.') && a.includes('Falta: María Rojas.'), 'aviso de una firma: quién firmó, cuántos y quién falta');
ok(a.includes('https://cliente.portalfirma.cl/c?o=4521'), 'el aviso lleva el enlace de seguimiento');
const b = textoAvisoFirma({ ...base, cambios: ['María Rojas firmó «Orden de visita»', '«Orden de visita» quedó firmado por todos'], firmados: 2, faltan: [], completo: true });
ok(b.includes('✅ «Orden de visita» quedó firmado por todos') && !b.includes('Falta') && !b.includes('Han firmado'), 'aviso de firmado por todos');
console.log('OK');
