// Muestras de documentos: cada plantilla de PLANTILLAS_DOC se llena con sus datos de ejemplo (sin red ni base de datos),
// no queda ninguna variable sin reemplazar y ninguna variable ni bloque queda vacío (la vista previa muestra el documento completo).
// Requiere compilar antes (yarn build) o tener las plantillas copiadas en dist/documentos/plantillas.
const { llenar, cargarPlantilla } = require('../dist/documentos/plantilla');
const { PLANTILLAS_DOC, muestra } = require('../dist/documentos/muestras');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };

// recorre la plantilla igual que llenar() y anota las variables o bloques que quedan vacíos
function buscar(ctx, ruta) {
  for (let i = ctx.length - 1; i >= 0; i--) {
    let v = ctx[i];
    for (const k of ruta.split('.')) { if (v == null || typeof v !== 'object') { v = undefined; break; } v = v[k]; }
    if (v !== undefined) return v;
  }
  return undefined;
}
function vacios(t, ctx, faltan) {
  const resto = t.replace(/\{\{#([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, k, dentro) => {
    const v = buscar(ctx, k);
    if (Array.isArray(v)) { if (!v.length) faltan.add('#' + k); v.forEach((it) => vacios(dentro, [...ctx, it], faltan)); }
    else if (v && typeof v === 'object') vacios(dentro, [...ctx, v], faltan);
    else if (v) vacios(dentro, ctx, faltan);
    else if (!/^(operacion\.venta|esArriendo|publicar\.no|exclusividad\.no|corredora\.logo|pago\.contado|entrega\.sinFecha|notaria\.sin)$/.test(k)) faltan.add('#' + k); // alternativas excluyentes
    return '';
  });
  resto.replace(/\{\{([\w.]+)\}\}/g, (_, k) => { const v = buscar(ctx, k); if (v == null || v === '') faltan.add(k); return ''; });
  return faltan;
}

ok(PLANTILLAS_DOC.length >= 7 && PLANTILLAS_DOC.some((p) => p.nombre === 'escritura-compraventa'), 'hay al menos 7 plantillas (incluye el borrador de escritura de compraventa)');
for (const p of PLANTILLAS_DOC) {
  const datos = muestra(p.nombre);
  const plantilla = cargarPlantilla(p.nombre);
  const html = llenar(plantilla, datos);
  ok(!/\{\{|\}\}/.test(html), `${p.nombre}: no queda ninguna variable sin reemplazar`);
  const faltan = [...vacios(plantilla.replace(/<!--[\s\S]*?-->/g, ''), [datos], new Set())];
  ok(!faltan.length, `${p.nombre}: todas las variables y bloques tienen datos${faltan.length ? ' (faltan: ' + faltan.join(', ') + ')' : ''}`);
  ok(p.titulo && p.descripcion, `${p.nombre}: tiene título y descripción`);
}
ok(Object.keys(muestra('no-existe')).length === 0, 'una plantilla desconocida da datos vacíos');
process.exit(0);
