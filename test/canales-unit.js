// 0.16.28 · en la conversación de WhatsApp de una persona pueden aparecer mensajes de Instagram (wechatia une los
// contactos): Diego, Fernanda y la postventa solo leen los de WhatsApp; la conversación igual se revisa si tiene teléfono.
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
const { whatsappWechatia } = require('../src/postventa');
const res = { locationId: () => 'loc', api: async (m, p) => {
  if (/search/.test(p)) return { conversations: [{ id: 'c1', phone: '+56987276858', lastMessageType: 'TYPE_INSTAGRAM' }, { id: 'c2', lastMessageType: 'TYPE_INSTAGRAM' }, { id: 'c3', phone: '+5691', lastMessageType: 'TYPE_WHATSAPP' }] };
  return { messages: { messages: [{ id: 'i1', direction: 'inbound', messageType: 'TYPE_INSTAGRAM', body: 'Hola me interesa una propiedad', dateAdded: '2026-10-29T14:57:00Z' }, { id: 'w1', direction: 'inbound', messageType: 'TYPE_WHATSAPP', body: '¿Tengo leads de Instagram?', dateAdded: '2026-11-03T14:55:00Z' }, { id: 'e1', direction: 'inbound', messageType: 'TYPE_EMAIL', body: 'correo', dateAdded: '2026-11-03T14:56:00Z' }] } };
} };
(async () => {
  const wa = whatsappWechatia(res);
  const cs = (await wa.conversaciones()).map((c) => c.id);
  ok(cs.includes('c1') && cs.includes('c3') && !cs.includes('c2'), 'se revisan las conversaciones con teléfono aunque el último mensaje sea de Instagram; las de solo Instagram no');
  const ms = await wa.mensajes('c1');
  ok(ms.length === 1 && ms[0].id === 'w1', 'de esa conversación solo se leen los mensajes de WhatsApp (no los de Instagram ni correo)');
  console.log('\nOK canales-unit');
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
