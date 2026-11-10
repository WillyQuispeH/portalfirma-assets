// Dictado: los datos del propietario que el corredor dicta junto con la propiedad ya no se pierden en silencio.
// Se capturan, se advierte un RUT inválido ANTES de crear y, al crear, se registra al propietario o se dice por qué no.
// Sin Electron: solo dictado.js con una IA y un CRM de mentira.
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };

// RUT: módulo 11 (el mismo criterio que inmo.validRut)
const validRut = (r) => { const c = String(r || '').replace(/[^0-9kK]/g, '').toUpperCase(); if (c.length < 2) return false; let s = 0, m = 2; for (let i = c.length - 2; i >= 0; i--) { s += Number(c[i]) * m; m = m === 7 ? 2 : m + 1; } const d = 11 - (s % 11); return c.slice(-1) === (d === 11 ? '0' : d === 10 ? 'K' : String(d)); };

(async () => {
  let ultimoPedido = null;
  const ai = { chat: async (o) => { ultimoPedido = o; return { text: JSON.stringify({ tipo: 'departamento', venta: true, precioVenta: { valor: 6900, moneda: 'UF' }, direccion: 'Av. Irarrázaval 3450', unidad: '804', comuna: 'Ñuñoa', dormitorios: 3, banos: 2,
    propietario: { nombre: 'María José Contreras Vidal', rut: '15.432.876-5', telefono: '+56 9 6543 2187', email: 'mj@correo.cl' }, titulo: 'Departamento 3D2B en Ñuñoa', descripcion: 'Departamento luminoso en Ñuñoa.', dudas: [] }) }; } };
  const d = require('../src/dictado').crear({ ai, validarRut: validRut });

  const r = await d.extraer({ texto: 'Capté un depto en Ñuñoa, Irarrázaval 3450 depto 804, 3 dormitorios. La dueña es María José Contreras Vidal, RUT 15.432.876-5, teléfono +56 9 6543 2187' });
  ok(/PROPIETARIO/.test(ultimoPedido.system), 'le pide a la IA que capture los datos del propietario');
  ok(r.campos.propietario && r.campos.propietario.nombre === 'María José Contreras Vidal' && r.campos.propietario.rut === '15.432.876-5' && r.campos.propietario.telefono === '+56 9 6543 2187', 'lo dictado del propietario queda en la ficha');
  ok(!('propietario' in d.aFicha(r.campos)), 'el propietario no se mezcla con los datos de la propiedad');

  ok(validRut('15.432.876-9') && !validRut('15.432.876-5'), 'el RUT dictado (…-5) no cuadra y el correcto es …-9');
  const av = d.avisos(r.campos);
  ok(av.length === 1 && /15\.432\.876-5/.test(av[0]) && /no es válido/.test(av[0]), 'avisa el RUT inválido antes de crear: ' + av[0]);
  ok(d.avisos({ propietario: { nombre: 'Ana', rut: '15.432.876-9' } }).length === 0 && d.avisos({}).length === 0, 'sin problemas (o sin propietario), no avisa nada');
  ok(d.avisos({ propietario: { rut: '15.432.876-9' } }).some((x) => /nombre/.test(x)), 'avisa si falta el nombre del propietario');

  // CRM de mentira: valida el RUT como el real y guarda lo que le llega
  const personas = []; const vinculos = [];
  const inmo = {
    guardarPersona: async (o) => { if (o.rut && !validRut(o.rut)) throw new Error('El RUT no es válido.'); const p = { id: 'p' + (personas.length + 1), nombre: o.nombre, rut: o.rut || '', roles: o.roles }; personas.push(p); return p; },
    vincular: async (propId, personaId, rol) => { vinculos.push({ propId, personaId, rol }); },
  };
  let reg = await d.registrarPropietario(inmo, 'prop1', r.campos.propietario);
  ok(reg && reg.ok === false && /RUT no es válido/.test(reg.motivo) && reg.nombre === 'María José Contreras Vidal' && !personas.length && !vinculos.length, 'con el RUT inválido no registra a nadie y dice el motivo: «' + reg.motivo + '»');

  reg = await d.registrarPropietario(inmo, 'prop1', { ...r.campos.propietario, rut: '15.432.876-9' });
  ok(reg.ok && reg.nombre === 'María José Contreras Vidal' && personas.length === 1 && personas[0].roles[0] === 'propietario' && vinculos[0].rol === 'propietario' && vinculos[0].propId === 'prop1', 'con el RUT correcto lo registra como propietario y lo vincula a la propiedad');

  reg = await d.registrarPropietario(inmo, 'prop1', { telefono: '+56 9 1111 2222' });
  ok(reg && reg.ok === false && /nombre/.test(reg.motivo), 'sin nombre no lo registra y lo dice');
  ok(await d.registrarPropietario(inmo, 'prop1', null) === null && await d.registrarPropietario(inmo, 'prop1', {}) === null, 'si no se dictó propietario, no hace ni dice nada');

  // la corrección dictada («el RUT es …») mantiene lo demás: el JSON previo viaja a la IA con el propietario
  await d.extraer({ texto: 'el RUT es 15.432.876-9', previo: r.campos });
  ok(/"propietario"/.test(ultimoPedido.messages[0].content) && /María José/.test(ultimoPedido.messages[0].content), 'al corregir, la IA recibe el propietario ya dictado');
  console.log('dictado-propietario-unit: OK');
})().catch((e) => { console.error(e); process.exit(1); });
