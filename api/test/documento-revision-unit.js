// Documento a revisión fuera de las 24 h: plantilla ahora, PDF cuando la persona responde (sin red ni base de datos).
// Requiere compilar antes (yarn build o la API en yarn dev, que deja dist/).
const { DocumentoRevisionService } = require('../dist/whatsapp/documento-revision');
const ok = (v, m) => { if (!v) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };

function armar({ archivoExiste = true } = {}) {
  const filas = new Map();
  const db = {
    usuario: { findUnique: async () => ({ nombre: 'Willy Abad' }) },
    corredora: { findUnique: async () => ({ nombre: 'PortalFirma' }) },
    registro: {
      upsert: async ({ where, create, update }) => {
        const k = where.corredoraId_coleccion_id.id;
        filas.set(k, { ...(filas.get(k) || create), datos: (filas.get(k) ? update : create).datos, coleccion: create.coleccion, id: k, eliminadoEn: null, actualizadoEn: new Date() });
      },
      findMany: async ({ where }) => [...filas.values()].filter((f) => f.datos.a === where.datos.equals),
      update: async ({ where, data }) => { filas.get(where.corredoraId_coleccion_id.id).datos = data.datos; },
    },
  };
  const log = { plantillas: [], registrados: [], avisos: [], actividad: [], enviados: [] };
  const enviados = {
    plantilla: async (u, b) => { log.plantillas.push(b); return { contactId: 'c1' }; },
    registrar: async (...a) => log.registrados.push(a),
  };
  const r2 = { tamano: async () => (archivoExiste ? 1234 : null), urlDescarga: async (k, n) => `https://r2/${k}?n=${n}` };
  const avisos = { crear: async (a) => log.avisos.push(a) };
  const actividad = { registrar: async (a) => log.actividad.push(...a) };
  const wa = { enviarAContacto: async (cid, texto, canal, adj) => { log.enviados.push({ cid, texto, canal, adj }); return { messageId: 'm9' }; } };
  return { s: new DocumentoRevisionService(db, enviados, r2, avisos, actividad, { crear: async (_k, clave) => 'https://api/d/' + clave.split('/').pop() }), log, filas, wa };
}
const u = { sub: 'u1', corredoraId: 'k1', rol: 'corredor' };
const pedido = {
  personaId: 'p1', nombre: 'María José Contreras', telefono: '+56 9 8259 7210', negocioId: 'n1', propiedadId: 'pr1',
  documento: 'el contrato de arriendo (versión 2)', propiedad: 'PF-1001 (Irarrázaval 3450, Ñuñoa)',
  texto: 'Hola María, te envío el contrato…', clave: 'negocios/n1/contrato-v2.pdf', archivo: 'Contrato v2.pdf',
};
const cv = { telefono: '+56982597210', contactId: 'c1' };
const msj = (texto, min = 1) => ({ id: 'x' + texto, direccion: 'entrante', texto, adjuntos: [], fecha: new Date(Date.now() + min * 60_000).toISOString() });

(async () => {
  {
    const { s, log, filas, wa } = armar();
    await s.solicitar(u, pedido);
    const p = log.plantillas[0];
    ok(p.etiqueta === 'asset_documento_revision', 'manda la plantilla asset_documento_revision');
    ok(p.campos.nombre === 'María' && p.campos.remitente === 'Willy Abad, de PortalFirma', 'nombre y remitente');
    ok(p.campos.documento === pedido.documento && p.campos.propiedad === pedido.propiedad, 'documento y propiedad');
    ok(filas.get('n1:p1').datos.estado === 'enviada', 'queda pendiente');

    const antes = { ...msj('hola', -120) };
    ok((await s.interceptar(wa, 'k1', cv, [antes])).length === 1 && !log.enviados.length, 'un mensaje anterior al envío no lo dispara');
    const resto = await s.interceptar(wa, 'k1', cv, [msj('Enviar el documento')]);
    ok(resto.length === 0, 'el toque del botón no sigue a los asistentes');
    ok(log.enviados[0].texto.startsWith(pedido.texto) && log.enviados[0].texto.includes('https://api/d/contrato-v2.pdf'), 'manda el mensaje del corredor con el PDF como enlace (wechatia no entrega adjuntos)');
    ok(filas.get('n1:p1').datos.estado === 'entregada', 'queda entregada');
    ok(/se le envió el contrato/.test(log.avisos[0].texto) && log.avisos[0].usuarioId === 'u1', 'avisa al corredor');
    ok(log.actividad.length === 1, 'deja registro en el negocio');
    await s.interceptar(wa, 'k1', cv, [msj('gracias', 5)]);
    ok(log.enviados.length === 1, 'no lo vuelve a mandar');
  }
  {
    const { s, log, wa } = armar();
    await s.solicitar(u, pedido);
    const resto = await s.interceptar(wa, 'k1', cv, [msj('¿cuál es el monto de la garantía?')]);
    ok(resto.length === 1 && log.enviados.length === 1, 'un texto propio: manda el PDF y el mensaje sigue su camino');
    ok(/Respondió: "¿cuál es el monto/.test(log.avisos[0].texto), 'el aviso incluye lo que respondió');
  }
  {
    const { s, log, filas, wa } = armar({ archivoExiste: false });
    await s.solicitar(u, pedido);
    await s.interceptar(wa, 'k1', cv, [msj('Enviar el documento')]);
    ok(!log.enviados.length && filas.get('n1:p1').datos.estado === 'fallida', 'si el archivo ya no está: no manda nada y queda fallida');
    ok(/no se le pudo enviar/.test(log.avisos[0].texto), 'y avisa al corredor para reenviarlo');
  }
  {
    const { s, log, wa } = armar();
    await s.solicitar(u, pedido);
    const r = await s.interceptar(wa, 'k1', { telefono: '+56911111111', contactId: 'c2' }, [msj('Enviar el documento')]);
    ok(r.length === 1 && !log.enviados.length, 'otro celular: no toca nada');
  }
  console.log('OK');
})().catch((e) => { console.error(e.message); process.exit(1); });
