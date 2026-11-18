// Sistema de plantillas: bloques editables (ida y vuelta idéntica), versión propia por corredora que no toca a otra,
// validación de datos {{…}}, aprobación y estado. Sin red ni base (base falsa); el PDF de muestra solo si hay Chromium.
// Requiere compilar antes (yarn build o la API en yarn dev, que deja dist/).
const { PlantillasDocService } = require('../dist/documentos/plantillas-doc');
const { bloquesDe, aplicar } = require('../dist/documentos/bloques');
const { cargarPlantilla } = require('../dist/documentos/plantilla');
const { PLANTILLAS_DOC } = require('../dist/documentos/muestras');
const ok = (v, m) => { if (!v) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
const normal = (s) => s.replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim();

(async () => {
  for (const p of PLANTILLAS_DOC) {
    const h = cargarPlantilla(p.nombre); const b = bloquesDe(h);
    const propios = Object.fromEntries(b.filter((x) => x.texto !== null).map((x) => [x.clave, x.texto]));
    ok(normal(aplicar(h, propios)) === normal(h), `${p.nombre}: el texto de la base vuelve al mismo HTML (${Object.keys(propios).length}/${b.length} editables)`);
  }

  const regs = new Map();
  const k = (w) => `${w.corredoraId}|${w.coleccion}|${w.id}`;
  const db = {
    registro: {
      findUnique: async ({ where }) => regs.get(k(where.corredoraId_coleccion_id)) ?? null,
      findMany: async ({ where }) => [...regs.values()].filter((r) => r.corredoraId === where.corredoraId && r.coleccion === where.coleccion),
      upsert: async ({ where, create, update }) => { const w = where.corredoraId_coleccion_id; const prev = regs.get(k(w)); regs.set(k(w), prev ? { ...prev, datos: update.datos } : { ...create }); },
    },
    usuario: { findUnique: async () => ({ nombre: 'Tomás Admin' }) },
    corredora: { findUnique: async () => ({ nombre: 'The Living', rut: '76.123.456-7' }) },
  };
  const s = new PlantillasDocService(db, { pdf: async () => Buffer.from('%PDF-falso') });
  const admin = { sub: 'u1', corredoraId: 'TL', rol: 'ADMIN' };
  const corredor = { sub: 'u2', corredoraId: 'TL', rol: 'CORREDOR' };

  let d = await s.detalle(admin, 'mandato-arriendo');
  ok(d.estado === 'borrador' && d.version === 0 && d.bloques.length > 3 && d.variables.includes('corredora.nombre'), 'sin versión propia: base, en borrador, con sus datos disponibles');
  const cl = d.bloques.find((b) => b.editable && b.tipo === 'clausula');
  const nuevo = cl.texto.replace(/\n\n/, '\n\nTexto agregado por el abogado de {{corredora.nombre}}.\n\n');
  d = await s.guardar(admin, 'mandato-arriendo', { bloques: { [cl.clave]: nuevo }, nota: 'Revisión 1' });
  ok(d.version === 1 && d.bloques.find((b) => b.clave === cl.clave).cambiado, 'guardar crea la versión 1 con la cláusula cambiada');
  ok((await s.html('TL', 'mandato-arriendo')).includes('Texto agregado por el abogado de {{corredora.nombre}}.'), 'los documentos de esa corredora usan su versión');
  ok(!(await s.html('OTRA', 'mandato-arriendo')).includes('Texto agregado'), 'otra corredora sigue con la base');

  const malo = await s.guardar(admin, 'mandato-arriendo', { bloques: { [cl.clave]: nuevo + '\n\n{{inventado}}' } }).then(() => null, (e) => e.message);
  ok(/no existe en esta plantilla/.test(malo), 'un dato {{…}} que no existe se rechaza');
  const abierto = await s.guardar(admin, 'mandato-arriendo', { bloques: { [cl.clave]: nuevo + '\n\n{{#corredora.rut}}' } }).then(() => null, (e) => e.message);
  ok(/Falta cerrar/.test(abierto), 'un bloque condicional sin cerrar se rechaza');
  const html = await s.guardar(admin, 'mandato-arriendo', { bloques: { [cl.clave]: nuevo + '\n\n<script>x</script>' } }).then(() => s.html('TL', 'mandato-arriendo'));
  ok(html.includes('&lt;script&gt;') && !html.includes('<script>x'), 'el HTML que se escribe se escapa: nunca entra al documento');

  const noAdmin = await s.guardar(corredor, 'mandato-arriendo', { bloques: {} }).then(() => null, (e) => e.message);
  ok(/administrador/.test(noAdmin), 'solo el administrador edita');
  d = await s.aprobar(admin, 'mandato-arriendo', { revisor: 'Abogada María Soto', nota: 'OK' });
  ok(d.estado === 'aprobada' && d.aprobacion.revisor === 'Abogada María Soto' && d.aprobacion.porNombre === 'Tomás Admin', 'aprobar registra quién revisó y quién lo anotó');
  d = await s.guardar(admin, 'mandato-arriendo', { bloques: { [cl.clave]: nuevo } });
  ok(d.estado === 'borrador', 'un cambio después de aprobar vuelve a borrador');
  d = await s.restaurar(admin, 'mandato-arriendo', 0);
  ok(d.bloques.every((b) => !b.cambiado) && d.versiones[0].nota === 'Vuelve a la plantilla base', 'restaurar la base queda como versión nueva');
  const l = await s.lista(corredor);
  ok(l.items.length === PLANTILLAS_DOC.length && !l.puedeEditar, 'la lista muestra todas las plantillas; el corredor solo mira');
  const pv = await s.vistaPrevia(admin, 'mandato-arriendo', { [cl.clave]: nuevo });
  ok(Buffer.from(pv.pdf, 'base64').toString().startsWith('%PDF'), 'vista previa con cambios sin guardar');
  console.log('OK');
})().catch((e) => { console.error(e.message); process.exit(1); });
