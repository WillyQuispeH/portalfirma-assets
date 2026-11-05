// 0.16.24 · la misma persona en dos conversaciones de wechatia (wechatia unió el contacto al dar su teléfono): un solo lead
const os = require('os'); const fs = require('fs'); const path = require('path');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
const L = require('../src/leads');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pflf-'));
const leads = L.crear({ dir, ai: null });
const M = (id, texto, min) => ({ id, fecha: `2026-10-29T11:${String(min).padStart(2, '0')}:00`, de: 'cliente', texto });
leads.registrarCanal({ canal: 'instagram', convId: 'convIG', contactId: 'cIG', nombre: 'Jerónimo', mensajes: [M('j1', 'Hola me interesa una propiedad', 57), M('j2', 'Quiero una oficina en Las Condes', 58)] });
// wechatia une el contacto con uno que ya tenía ese teléfono: los mensajes aparecen en otra conversación, con otro nombre
leads.registrarCanal({ canal: 'instagram', convId: 'convWA', contactId: 'cWA', nombre: 'Cliente De Prueba', telefono: '+56987276858', mensajes: [M('j1', 'Hola me interesa una propiedad', 57), M('j2', 'Quiero una oficina en Las Condes', 58), M('j3', 'Mi teléfono es +56987276858', 59)] });
let l = leads.listar({}).leads;
ok(l.length === 1 && l[0].nombre === 'Jerónimo' && l[0].telefono === '+56987276858' && l[0].mensajes === 3, 'sigue siendo un solo lead (Jerónimo), con el teléfono y los 3 mensajes');
ok(l[0].canales.length === 2, 'el lead recuerda las dos conversaciones de wechatia');
// datos de antes (ya duplicados): se reparan al abrir
const d = leads._db(); d.wcIdx = {}; // como antes de 0.16.24
leads.registrarCanal({ canal: 'instagram', convId: 'convX', nombre: 'Ana', mensajes: [M('a1', 'hola', 10)] });
d.wcIdx = {}; leads.registrarCanal({ canal: 'instagram', convId: 'convY', nombre: 'Contacto Y', telefono: '+56911112222', mensajes: [M('a1', 'hola', 10), M('a2', 'busco casa', 11)] });
ok(leads.listar({}).leads.length === 3, '(simulación de los datos duplicados de antes)');
ok(leads.repararDuplicados() === 1, 'la reparación une los duplicados');
l = leads.listar({}).leads; const ana = l.find((x) => x.nombre === 'Ana');
ok(l.length === 2 && ana && ana.mensajes === 2 && ana.telefono === '+56911112222' && /Se unió/.test(JSON.stringify(ana.historial)), 'Ana queda con todo y el historial dice que se unió');
console.log('\nOK leads-fusion-unit');
