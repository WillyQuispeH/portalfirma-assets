// Confirmación de visita por WhatsApp: cómo se entiende la respuesta del arrendatario (sin red).
// Requiere compilar antes (yarn build o la API en yarn dev, que deja dist/).
const { clasificarRespuesta: c } = require('../dist/whatsapp/confirmacion-visita');
const ok = (v, m) => { if (!v) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
for (const t of ['Sí', 'si, ahí estaré', 'Ok', 'Confirmo!', 'Dale', 'perfecto, gracias', '👍', 'Listo']) ok(c(t) === 'confirma', `«${t}» confirma`);
for (const t of ['No puedo ese día', 'no', 'Mejor otro día', 'Tengo que cancelar', 'ya no me interesa', 'podemos cambiar la hora']) ok(c(t) === 'cambio', `«${t}» pide cambiar`);
for (const t of ['¿A qué hora era?', 'dónde queda', 'hola', '', 'Buenas tardes, quería saber si el departamento tiene estacionamiento y cuánto es el gasto común de la propiedad']) ok(c(t) === 'otro', `«${t.slice(0, 40)}» sigue su camino (no confirma)`);
console.log('OK');
