// Prueba de punta a punta de la IA de la app de escritorio por el servidor (src/ia/ia-app.ts), contra la API corriendo
// (yarn dev) y asset_dev, con una IA FALSA (API de mensajes de Anthropic) que levanta esta misma prueba. La IA falsa se
// le asigna a una corredora de prueba con «iaBase» en su conexión de wechatia (fuera de producción, IaService la usa
// en vez de la de verdad). Crea la corredora con un usuario y al final la borra con todo lo suyo.
// Uso: node test/ia-app-e2e.js [url]
const http = require('http');
const argon2 = require('argon2');
const { PrismaClient } = require('@prisma/client');

const B = (process.argv[2] || 'http://localhost:3000') + '/v1';
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
const req = async (metodo, ruta, cuerpo, token) => {
  const r = await fetch(B + ruta, { method: metodo, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { s: r.status, j };
};
const SUF = Date.now().toString(36);

// ---------------------------------------------------------------- IA falsa: anota cada llamada y responde según la tarea
const IA = { llamadas: [] };
function iaFalsa() {
  const s = http.createServer((rq, rs) => {
    let t = ''; rq.on('data', (d) => (t += d)); rq.on('end', () => {
      const body = JSON.parse(t || '{}'); IA.llamadas.push({ body, cabeceras: rq.headers });
      const ultimo = body.messages[body.messages.length - 1];
      const r = body.tools?.length && typeof ultimo.content === 'string'
        ? { content: [{ type: 'text', text: 'Busco la propiedad.' }, { type: 'tool_use', id: 'tu_1', name: body.tools[0].name, input: { q: 'Ñuñoa' } }], stop_reason: 'tool_use' }
        : { content: [{ type: 'text', text: body.tools?.length ? 'Encontré 2 propiedades en Ñuñoa.' : 'Texto listo.' }], stop_reason: 'end_turn' };
      rs.writeHead(200, { 'content-type': 'application/json' });
      rs.end(JSON.stringify({ id: 'msg_' + IA.llamadas.length, type: 'message', role: 'assistant', model: body.model, ...r, stop_sequence: null, usage: { input_tokens: 120, output_tokens: 30 } }));
    });
  });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r(s)));
}

(async () => {
  const db = new PrismaClient();
  const ia = await iaFalsa(); const iaBase = `http://127.0.0.1:${ia.address().port}`;
  let co = null; const usuarios = [];
  try {
    const hash = await argon2.hash('clave-e2e-123', { type: argon2.argon2id });
    co = await db.corredora.create({ data: { nombre: `E2E IA app ${SUF}` } });
    const u = await db.usuario.create({ data: { corredoraId: co.id, email: `e2e-ia-${SUF}@prueba.cl`, nombre: 'Corredor IA', hashClave: hash, rol: 'ADMIN' } });
    usuarios.push(u.id);
    const t = (await req('POST', '/auth/ingresar', { email: u.email, clave: 'clave-e2e-123' })).j.tokenAcceso;
    ok(t, 'ingresa el usuario de prueba');
    // la IA de prueba de esta corredora (sin «base»: el lector de WhatsApp no la lee)
    await db.conexion.create({ data: { corredoraId: co.id, proveedor: 'wechatia', dueno: 'corredora', tipo: 'clave', datos: { locationId: 'loc-ia', iaBase } } });

    let r = await req('GET', '/ia/estado', null, t);
    ok(r.s === 200 && r.j.disponible && /sonnet/.test(r.j.modelos.agente) && /haiku/.test(r.j.modelos.corto), `estado: IA disponible (agente ${r.j.modelos?.agente}, corto ${r.j.modelos?.corto})`);

    // ---- el agente: primera vuelta pide una herramienta, la segunda responde
    const tools = [{ name: 'buscar_propiedades', description: 'Busca en la cartera', input_schema: { type: 'object', properties: { q: { type: 'string' } } } }];
    r = await req('POST', '/ia/mensajes', { tarea: 'agente', system: 'Eres el agente de Asset.', messages: [{ role: 'user', content: '¿Qué tengo en Ñuñoa?' }], tools, max_tokens: 4000 }, t);
    const a = IA.llamadas[IA.llamadas.length - 1].body;
    ok(r.s === 201 && r.j.stop_reason === 'tool_use' && r.j.content.some((b) => b.type === 'tool_use' && b.name === 'buscar_propiedades'), 'el agente recibe el pedido de herramienta tal cual (formato de la API de Anthropic)');
    ok(/sonnet/.test(a.model) && a.thinking?.type === 'between_tools' && a.output_config?.effort === 'medium' && a.tools?.length === 1, 'el servidor elige Sonnet, sin razonar entre herramientas y esfuerzo medio');
    ok(a.fallbacks === 'default' && /server-side-fallback/.test(IA.llamadas[IA.llamadas.length - 1].cabeceras['anthropic-beta'] || ''), 'con respaldo ante rechazos (Sonnet lo admite)');
    r = await req('POST', '/ia/mensajes', { tarea: 'agente', system: 'Eres el agente de Asset.', tools, messages: [
      { role: 'user', content: '¿Qué tengo en Ñuñoa?' },
      { role: 'assistant', content: r.j.content },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: '[{"codigo":"PF-1"},{"codigo":"PF-2"}]' }] },
    ] }, t);
    ok(r.s === 201 && r.j.stop_reason === 'end_turn' && /2 propiedades/.test(r.j.content[0].text), 'segunda vuelta con el resultado de la herramienta: responde');

    // ---- documento y corto
    r = await req('POST', '/ia/mensajes', { tarea: 'documento', system: 'Lee el documento.', messages: [{ role: 'user', content: [{ type: 'text', text: 'Resume' }] }] }, t);
    const d = IA.llamadas[IA.llamadas.length - 1].body;
    ok(r.s === 201 && /sonnet/.test(d.model) && !d.thinking && d.output_config?.effort === 'medium' && d.max_tokens === 8000, 'documento: Sonnet con su razonamiento y 8000 tokens de salida por defecto');
    r = await req('POST', '/ia/mensajes', { tarea: 'corto', system: 'Retoca el WhatsApp.', messages: [{ role: 'user', content: 'Hola, su reclamo PV-12 quedó ingresado.' }], max_tokens: 700 }, t);
    const c = IA.llamadas[IA.llamadas.length - 1];
    ok(r.s === 201 && /haiku/.test(c.body.model) && c.body.output_config?.effort === 'low' && !c.body.fallbacks && !/server-side-fallback/.test(c.cabeceras['anthropic-beta'] || ''), 'corto: Haiku, esfuerzo bajo y sin respaldo (Haiku no lo admite)');

    // ---- consumo, validación y acceso
    const consumo = await db.iaConsumo.findMany({ where: { corredoraId: co.id } });
    ok(consumo.length === 4 && consumo.filter((x) => x.uso === 'app:agente').length === 2 && consumo.some((x) => x.uso === 'app:corto' && /haiku/.test(x.modelo)), 'cada llamada queda en ia_consumo con su tarea y modelo');
    ok((await req('POST', '/ia/mensajes', { tarea: 'otra', messages: [{ role: 'user', content: 'x' }] }, t)).s === 400, 'una tarea desconocida se rechaza');
    ok((await req('POST', '/ia/mensajes', { tarea: 'agente', messages: [] }, t)).s === 400, 'sin mensajes se rechaza');
    ok((await req('POST', '/ia/mensajes', { tarea: 'agente', messages: [{ role: 'user', content: 'x' }] })).s === 401, 'sin sesión de Asset no hay IA');
    console.log('\nTodo bien.');
  } finally {
    ia.close();
    if (co) {
      await db.iaConsumo.deleteMany({ where: { corredoraId: co.id } });
      await db.conexion.deleteMany({ where: { corredoraId: co.id } });
      await db.sesion.deleteMany({ where: { usuarioId: { in: usuarios } } });
      await db.usuario.deleteMany({ where: { id: { in: usuarios } } });
      await db.corredora.delete({ where: { id: co.id } }).catch((e) => console.warn('no se borró la corredora de prueba:', e.message));
    }
    await db.$disconnect();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
