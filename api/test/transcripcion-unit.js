// Transcripción: lo determinista (sin red). Los casos salen de audios reales de prueba transcritos con
// gpt-4o-mini-transcribe: RUT en palabras o en dígitos, teléfonos que el modelo escribió mal, códigos PF1002…
// Requiere compilar antes (yarn build o la API en yarn dev, que deja dist/).
const { normalizarTranscripcion: n, palabrasANumero, dvRut, celularChileno } = require('../dist/ia/transcripcion');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
const igual = (a, b, m) => ok(a === b, `${m}${a === b ? '' : `\n      esperado: ${b}\n      obtenido: ${a}`}`);

// ---- números en palabras
ok(palabrasANumero('quince millones cuatrocientos treinta y dos mil ochocientos setenta y seis'.split(' ')) === 15432876, 'quince millones … setenta y seis = 15.432.876');
ok(palabrasANumero('once millones ciento once mil ciento once'.split(' ')) === 11111111, 'once millones ciento once mil ciento once = 11.111.111');
ok(palabrasANumero('veintiún millones'.split(' ')) === 21000000 && palabrasANumero('mil'.split(' ')) === 1000, 'veintiún millones y mil');
ok(palabrasANumero(['hola']) === null && palabrasANumero([]) === null, 'lo que no es número da null');
ok(dvRut('15432876') === '9' && dvRut('11111111') === '1' && dvRut('12345678') === '5' && dvRut('7654321') === '6', 'dígito verificador (módulo 11)');
ok(celularChileno('981234567') === '+56 9 8123 4567' && celularChileno('56981234567') === '+56 9 8123 4567' && celularChileno('9654322187') === null && celularChileno('44975958') === null, 'celular chileno: 9 dígitos que parten en 9');

// ---- RUT
let r = n('El root de la dueña es quince millones cuatrocientos treinta y dos mil ochocientos setenta y seis guion nueve.');
igual(r.texto, 'El RUT de la dueña es 15.432.876-9.', 'RUT dicho con palabras → dígitos con puntos y guion («root» → RUT)');
ok(!r.avisos.length, 'y queda sin avisos (el verificador cuadra)');
r = n('El RUT es once millones ciento once mil ciento once guion uno y el celular es nueve cuarenta y cuatro noventa y siete cincuenta y nueve cincuenta y ocho.');
ok(/^El RUT es 11\.111\.111-1 y el celular es/.test(r.texto), 'otro RUT en palabras: ' + r.texto);
r = n('El RUT de la dueña es 15.432.876-9.');
igual(r.texto, 'El RUT de la dueña es 15.432.876-9.', 'un RUT ya bien escrito no cambia');
r = n('su rut 15432876-9 y listo');
igual(r.texto, 'su RUT 15.432.876-9 y listo', 'RUT pegado y con guion → con puntos');
r = n('El RUT es 15.432.876-5.');
ok(r.texto === 'El RUT es 15.432.876-5.' && r.avisos.length === 1 && /15\.432\.876-5/.test(r.avisos[0]) && /no es válido/.test(r.avisos[0]), 'RUT con el verificador malo: lo deja y avisa que lo confirme');
r = n('el rut es quince millones cuatrocientos treinta y dos mil ochocientos setenta y seis guion cinco');
ok(/15\.432\.876-5/.test(r.texto) && r.avisos.length === 1, 'también avisa si el RUT en palabras no cuadra');
r = n('El RUT es once millones ciento once mil ciento once guion k');
ok(r.avisos.length === 1 && /11\.111\.111-K/.test(r.texto), 'verificador K: 11.111.111-K no cuadra (el real es 1) y avisa');
r = n('Camina por la calle Los Leones y pone guion bajo');
ok(r.texto === 'Camina por la calle Los Leones y pone guion bajo' && !r.avisos.length, 'un «guion» cualquiera no se toca');

// ---- teléfonos
r = n('Su teléfono es 9654322187.');
ok(r.texto === 'Su teléfono es 9654322187.' && r.avisos.length === 1 && /9654322187/.test(r.avisos[0]), 'el teléfono de 10 dígitos que salió mal del audio no se acepta y se avisa');
r = n('El celular es 944-97-59-58 y el RUT es 11.111.111-1');
ok(r.texto === 'El celular es +56 9 4497 5958 y el RUT es 11.111.111-1' && !r.avisos.length, 'celular con guiones → +56 9 4497 5958');
r = n('Fernanda, registra a Catalina, teléfono 981234567. Busca arriendo.');
ok(/teléfono \+56 9 8123 4567\./.test(r.texto), 'celular pegado → +56 9 8123 4567');
r = n('El RUT es once millones ciento once mil ciento once guion uno y el celular es nueve cuarenta y cuatro noventa y siete cincuenta y nueve cincuenta y ocho.');
igual(r.texto, 'El RUT es 11.111.111-1 y el celular es +56 9 4497 5958.', 'celular dicho con palabras («nueve cuarenta y cuatro noventa y siete…») → +56 9 4497 5958');
r = n('Su teléfono es nueve sesenta y cinco cuarenta y tres veintiuno ochenta y siete. Gracias.');
igual(r.texto, 'Su teléfono es +56 9 6543 2187. Gracias.', 'otro celular con palabras (veintiuno = 21)');
r = n('Catalina, teléfono nueve ochenta y uno veintitrés cuarenta y cinco sesenta y siete, busca arriendo');
igual(r.texto, 'Catalina, teléfono +56 9 8123 4567, busca arriendo', 'con veintitrés (tilde) y seguido de una coma');
r = n('teléfono nueve cuarenta y cuatro noventa y siete');
ok(r.avisos.length === 1 && /944/.test(r.avisos[0]), 'si dicen de menos, lo convierte pero avisa que no tiene 9 dígitos');
r = n('escríbele al WhatsApp tres veces al día y llama al celular de Juan');
ok(!r.avisos.length && r.texto === 'escríbele al WhatsApp tres veces al día y llama al celular de Juan', 'frases con «WhatsApp tres veces» no se tocan');
r = n('Su WhatsApp: +56 9 6543 2187');
ok(r.texto === 'Su WhatsApp: +56 9 6543 2187' && !r.avisos.length, 'un celular bien escrito no cambia');
r = n('el número de contacto es 22 345 67 89');
ok(r.avisos.length === 1, 'un fijo (9 dígitos que no parten en 9) se avisa para confirmar');
r = n('Capté en Irarrázaval 3450, departamento 804, UF 6900');
ok(r.texto === 'Capté en Irarrázaval 3450, departamento 804, UF 6900' && !r.avisos.length, 'cifras de una captación no se tocan');
r = n('el número 12345678 de la operación');
ok(!r.avisos.length, 'un número de operación no se confunde con un teléfono');

// ---- códigos de propiedad
igual(n('en la PF1002 y la pf 1003 y la Pf-1004').texto, 'en la PF-1002 y la PF-1003 y la PF-1004', 'códigos PF con o sin espacio o guion → PF-NNNN');
igual(n('la WE045 y la PF1001', ['PF', 'WE']).texto, 'la WE-045 y la PF-1001', 'con los prefijos de la corredora');
igual(n('por 7100 UF y la CV1234', ['PF']).texto, 'por 7100 UF y la CV1234', 'prefijos que la corredora no usa no se tocan');
igual(n('precio UF 6900', ['PF', 'UF']).texto, 'precio UF 6900', 'nunca convierte UF 6900 en un código');

// ---- casos reales de la voz del usuario (notas por WhatsApp, 2026-11-10)
r = n('busca a la persona con RUT uno cinco cuatro tres dos ocho siete seis guión nueve y dime su teléfono');
igual(r.texto, 'busca a la persona con RUT 15.432.876-9 y dime su teléfono', 'RUT dicho dígito por dígito («uno cinco cuatro … guión nueve») → 15.432.876-9');
ok(!r.avisos.length, 'y su verificador cuadra: sin avisos');
r = n('con RUT 1-5-4-3-2-8-7-6-9 está en el CRM');
igual(r.texto, 'con RUT 15.432.876-9 está en el CRM', 'RUT con los dígitos separados por guiones («1-5-4-3-2-8-7-6-9») → 15.432.876-9');
r = n('Catalina Fuentes Ríos con RUT uno nueve dos tres cuatro cinco seis siete guión siete está en el CRM');
igual(r.texto, 'Catalina Fuentes Ríos con RUT 19.234.567-7 está en el CRM', 'otro RUT dígito por dígito (19.234.567-7)');
r = n('Catalina Fuentes Ríos, con RUT 192345678-7, está en el CRM');
ok(/RUT 19\.234\.567\.8-7|RUT 192\.345\.678-7/.test(r.texto) && r.avisos.length === 1 && /no es válido/.test(r.avisos[0]), 'RUT con un dígito de más («192345678-7»): se detecta y se avisa (antes pasaba sin aviso): ' + r.texto);
r = n('con RUT 15.432.876-9 y dime su teléfono y 1-5-4');
igual(r.texto, 'con RUT 15.432.876-9 y dime su teléfono y 1-5-4', 'un RUT ya bien escrito no se rehace ni se come lo que sigue');
r = n('RUT 1 2');
igual(r.texto, 'RUT 1 2', 'pocos dígitos después de «RUT»: no se toca');
igual(n('¿qué visitas hay en la PF mil uno y a qué hora?', ['PF']).texto, '¿qué visitas hay en la PF-1001 y a qué hora?', '«PF mil uno» con palabras → PF-1001');
igual(n('la PF mil quinientos dos, y listo', ['PF']).texto, 'la PF-1502, y listo', '«PF mil quinientos dos» → PF-1502');
igual(n('en la PF dos cosas', ['PF']).texto, 'en la PF dos cosas', '«PF dos» no es un código (número muy chico)');
const cods = ['PF-1001', 'WE-045'];
igual(n('qué visitas hay agendadas en el APF-1001 y a qué hora', ['PF'], cods).texto, 'qué visitas hay agendadas en el PF-1001 y a qué hora', '«APF-1001» (mal oído) → PF-1001 si ese código existe en la cartera');
igual(n('Sí, hablamos de la P1001.', ['PF'], cods).texto, 'Sí, hablamos de la PF-1001.', '«P1001» → PF-1001');
igual(n('Sí, hablamos de la APC1001.', ['PF'], cods).texto, 'Sí, hablamos de la PF-1001.', '«APC1001» → PF-1001');
igual(n('el precio es UF 1001 y CLP 1001', ['PF'], cods).texto, 'el precio es UF 1001 y CLP 1001', 'UF y CLP nunca se toman por un código');
igual(n('vale en 1001 pesos', ['PF'], cods).texto, 'vale en 1001 pesos', 'en minúsculas y sin letras de código no se toca');
igual(n('la APF-2002 no existe', ['PF'], cods).texto, 'la APF-2002 no existe', 'si el número no es de ningún código de la cartera, no se inventa uno');
igual(n('RUT USD 9999', ['PF'], cods).texto, 'RUT USD 9999', 'siglas ajenas no se tocan');

// ---- varios a la vez
r = n('Pedro, el RUT del dueño es quince millones cuatrocientos treinta y dos mil ochocientos setenta y seis guion nueve, su teléfono 981234567, de la PF1001.');
igual(r.texto, 'Pedro, el RUT del dueño es 15.432.876-9, su teléfono +56 9 8123 4567, de la PF-1001.', 'RUT, celular y código en el mismo audio');
console.log('transcripcion-unit: OK');
