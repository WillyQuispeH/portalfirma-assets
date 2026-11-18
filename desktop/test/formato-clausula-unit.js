// Prueba del editor de cláusulas (Configuración › Plantillas): texto guardado → documento del editor → texto, idéntico.
// Recorre TODAS las cláusulas editables de las 7 plantillas base de la API (api/dist: compila antes con «cd api && npx nest build»)
// y casos sueltos (negrita en ítem, salto en párrafo, condicional de bloque e inline, dato al inicio/fin).
// También revisa que todo dato usado tenga nombre legible en el diccionario (datos.ts).
const fs = require('fs'); const path = require('path');
const cargarTs = (rel) => {
  const ts = require('typescript'); const Module = require('module');
  const file = path.join(__dirname, '..', 'src', 'ui', 'components', 'functional', 'configuracion', 'plantillas', rel);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const m = new Module(file); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(js, file); return m.exports;
};
const F = cargarTs('formatoClausula.ts');
const D = cargarTs('datos.ts');
const api = path.join(__dirname, '..', '..', 'api', 'dist', 'documentos');
if (!fs.existsSync(path.join(api, 'bloques.js'))) { console.error('Falta api/dist: corre «cd api && npx nest build»'); process.exit(1); }
const { cargarPlantilla } = require(path.join(api, 'plantilla'));
const { bloquesDe, variablesDe } = require(path.join(api, 'bloques'));

let fallas = 0;
const ok = (c, m) => { if (!c) { fallas++; console.error('  ✘ FALLÓ: ' + m); } else if (process.env.V) console.log('  ✔ ' + m); };
const sinFinales = (s) => s.replace(/[ \t]+$/gm, '');
const vuelta = (t, tipo) => { const { titulo, doc } = F.textoADoc(t, tipo); return F.docATexto(titulo, JSON.parse(JSON.stringify(doc)), tipo); };
const crudo = (doc) => JSON.stringify(doc).match(/\{\{|\}\}|\*\*/g); // códigos que se verían en el editor (fuera de attrs)
const textoVisible = (doc) => { const out = []; const r = (n) => { if (n.type === 'text') out.push(n.text); (n.content || []).forEach(r); }; r(doc); return out.join(''); };

const PLANTILLAS = ['acta-entrega', 'acta-visita', 'carta-oferta', 'contrato-arriendo', 'mandato-arriendo', 'mandato-venta', 'orden-visita'];
let total = 0;
console.log('Ida y vuelta de las cláusulas de las plantillas base');
for (const n of PLANTILLAS) {
  const html = cargarPlantilla(n); const vars = variablesDe(html);
  let k = 0;
  for (const b of bloquesDe(html)) {
    if (b.texto === null) continue;
    k++; total++;
    const v = vuelta(b.texto, b.tipo);
    ok(sinFinales(v) === sinFinales(b.texto), `${n} › ${b.clave} vuelve idéntica` + (v !== b.texto ? `\n--- original\n${b.texto}\n--- vuelta\n${v}` : ''));
    const { doc } = F.textoADoc(b.texto, b.tipo);
    const vis = textoVisible(doc);
    ok(!/\{\{|\}\}|\*\*|__/.test(vis), `${n} › ${b.clave}: el editor no muestra códigos («${(vis.match(/.{0,20}(\{\{|\}\}|\*\*|__).{0,20}/) || [''])[0]}»)`);
    for (const d of F.datosDe(b.texto)) ok(D.datoConocido(d), `${n}: el dato «${d}» tiene nombre legible (${D.etiquetaDato(d)})`);
  }
  for (const v of vars) { const e = D.etiquetaDato(v); ok(!/[{}]/.test(e) && !(v.includes('.') && e.includes(v)) && !/[a-z][A-Z]/.test(e),`etiqueta de «${v}» legible: ${e}`); }
  console.log(`  ✔ ${n}: ${k} cláusulas editables`);
}
ok(total > 50, `se revisaron ${total} cláusulas`);
void crudo;

console.log('Casos sueltos');
const casos = [
  ['negrita dentro de un ítem', '# Título\n\nIntro:\n\n- **a)**Primero con {{corredora.nombre}}\n- segundo **muy** importante'],
  ['salto de línea dentro de un párrafo', '# T\n\nLínea uno\nLínea dos con **negrita**\nLínea tres'],
  ['condicional de bloque con ítems', '# T\n\nAntes.\n\n{{#corredora.rut}}\n\nCon RUT {{corredora.rut}}:\n\n- uno\n- dos\n\n{{/corredora.rut}}\n\nDespués.'],
  ['condicional de bloque invertido y anidado', '# T\n\n{{^codeudor}}\n\nSin codeudor.\n\n{{#corredora.rut}}\n\nRUT {{corredora.rut}}\n\n{{/corredora.rut}}\n\n{{/codeudor}}'],
  ['condicional inline', '# T\n\nLa corredora {{corredora.nombre}}{{#corredora.rut}}, RUT **{{corredora.rut}}**{{/corredora.rut}} y {{^codeudor}}nadie más{{/codeudor}}.'],
  ['dato al inicio y al fin', '# T\n\n{{visitante.nombre}} visitará {{propiedad.direccion}}'],
  ['negrita sobre un dato y cursiva anidada', '# __Primero ·__ Inmueble\n\nMonto **{{oferta.monto}}** y __otra **cosa**__ fin.'],
  ['marcas sueltas quedan como texto', '# T\n\nUn ** suelto y un __ también'],
];
for (const [nombre, t] of casos) {
  const v = vuelta(t, 'clausula');
  ok(v === t, `${nombre}` + (v !== t ? `\n--- original\n${t}\n--- vuelta\n${v}` : ''));
  console.log(`  ${v === t ? '✔' : '✘'} ${nombre}`);
}
// la comparecencia es un solo párrafo
const comp = 'Don/doña **{{mandante.texto}}**{{#corredora.rut}}, RUT {{corredora.rut}}{{/corredora.rut}}, en adelante el **MANDANTE**.';
ok(vuelta(comp, 'comparecencia') === comp, 'comparecencia vuelve idéntica');
const dc = F.textoADoc(comp, 'comparecencia').doc;
ok(dc.content.length === 1 && dc.content[0].type === 'paragraph', 'la comparecencia es un solo párrafo');
// estructura esperada
const est = F.textoADoc(casos[2][1], 'clausula').doc;
ok(est.content[1].type === 'condicional' && est.content[1].content.some((x) => x.type === 'bulletList'), 'el condicional de bloque contiene la lista');
const inl = F.textoADoc(casos[4][1], 'clausula').doc.content[0].content;
ok(inl.some((x) => x.type === 'condInline' && x.attrs.interior === ', RUT **{{corredora.rut}}**'), 'el condicional inline guarda su interior');
ok(F.partirTitulo('__Primero ·__ Inmueble').prefijo === '__Primero ·__ ' && F.partirTitulo('__Primero ·__ Inmueble').resto === 'Inmueble', 'partirTitulo separa el prefijo');
ok(F.prefijoLegible('__2.__ ') === '2.', 'el prefijo se lee sin códigos');
ok(D.etiquetaDato('propiedad.supUtil') === 'Superficie útil' && D.etiquetaDato('algo.otroDato') === 'Algo · otro dato', 'etiquetas automáticas legibles');
ok(D.vistaInterior(', RUT {{corredora.rut}}') === ', RUT ‹RUT de la corredora›', 'vista previa del interior legible');
// editar: documento armado a mano (como lo deja el editor) → texto
const editado = F.docATexto('__Segundo ·__ Precio', { type: 'doc', content: [
  { type: 'paragraph', content: [{ type: 'text', text: 'Paga ' }, { type: 'dato', attrs: { nombre: 'corredora.nombre' }, marks: [{ type: 'bold' }] }, { type: 'text', text: ' ya.' }] },
  { type: 'paragraph' },
  { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'uno', marks: [{ type: 'italic' }] }] }] }] },
] }, 'clausula');
ok(editado === '# __Segundo ·__ Precio\n\nPaga **{{corredora.nombre}}** ya.\n\n- __uno__', 'documento del editor → texto (párrafo vacío se ignora)');

if (fallas) { console.error(`\n${fallas} falla(s)`); process.exitCode = 1; } else console.log(`\nFORMATO CLÁUSULA OK (${total} cláusulas + casos)`);
