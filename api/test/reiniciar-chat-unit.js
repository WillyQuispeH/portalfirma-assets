// El comando para reiniciar el chat del ejecutivo (solo la frase completa) y el «Entendí» dentro de la respuesta.
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../src/whatsapp/equipo.ts', 'utf8');
const m = /const REINICIAR = (\/.*\/);/.exec(src);
const R = eval(m[1]);
const { norm } = require('../dist/whatsapp/comun');
const ok = (v, x) => { if (!v) throw new Error('FALLÓ: ' + x); console.log('  ✔ ' + x); };
const va = (t) => R.test(norm(t).replace(/[¿?¡!.,]/g, '').trim());
for (const t of ['/reiniciar', '/reset', '/nuevo', 'Reiniciar', 'reiniciar chat', 'Empezar de nuevo', 'empecemos de nuevo.', 'nueva conversación', 'Borrar el chat', 'resetear la conversación']) ok(va(t), `«${t}» reinicia`);
for (const t of ['nuevo', 'es un cliente nuevo', 'quiero empezar de nuevo la orden de visita', 'reiniciar el computador', 'no, reset del router', 'sí']) ok(!va(t), `«${t}» NO reinicia`);
ok(/🎙️ _Entendí: «\$\{dichos/.test(src) && !/wa\.enviarAContacto\(cv\.contactId, eco\)/.test(src), 'el «Entendí» va dentro de la respuesta, no como mensaje aparte');
console.log('OK');
