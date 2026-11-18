// Plantillas de documentos en modo de prueba (PF_MOCK=1): imita GET/PUT /v1/plantillas… de la API en memoria, con una
// plantilla de ejemplo (orden de visita), para la pantalla Configuración › Plantillas y su prueba (test/plantillas-doc-e2e.js).
function pdfMuestra(lineas) {
  const txt = lineas.map((l, i) => `BT /F1 12 Tf 60 ${760 - i * 18} Td (${String(l).normalize('NFD').replace(/[^\x20-\x7e]/g, '').replace(/[()\\]/g, '').slice(0, 90)}) Tj ET`).join('\n');
  const obj = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(txt)} >>\nstream\n${txt}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let s = '%PDF-1.4\n'; const pos = [];
  obj.forEach((o, i) => { pos.push(Buffer.byteLength(s)); s += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = Buffer.byteLength(s);
  s += `xref\n0 ${obj.length + 1}\n0000000000 65535 f \n${pos.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}`;
  s += `trailer\n<< /Size ${obj.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return Buffer.from(s).toString('base64');
}

function crear() {
  const BASE = {
    nombre: 'orden-visita', titulo: 'Orden de visita', descripcion: 'La firma el visitante antes de conocer la propiedad.',
    variables: ['corredora.nombre', 'corredora.rut', 'propiedad.direccion', 'visitante.nombre', 'visita.fecha'],
    bloques: [
      { clave: 'comparecencia', titulo: 'Comparecencia', tipo: 'comparecencia', base: null },
      { clave: 'objeto', titulo: 'Primero: objeto', tipo: 'clausula', base: '# Primero: objeto\n\n{{visitante.nombre}} visitará la propiedad de **{{propiedad.direccion}}** el {{visita.fecha}}.' },
      { clave: 'comision', titulo: 'Segundo: comisión', tipo: 'clausula', base: '# Segundo: comisión\n\nSi compra o arrienda, pagará a {{corredora.nombre}} la comisión pactada.\n\n- 2% más IVA en venta\n- 50% de un mes en arriendo' },
    ],
  };
  const r = { versiones: [], aprobacion: null };
  const vigente = () => r.versiones[r.versiones.length - 1] || null;
  const estado = () => (!r.aprobacion || r.aprobacion.n !== (vigente()?.n ?? 0) ? 'borrador' : 'aprobada');
  const existe = (n) => { if (n !== BASE.nombre) throw new Error('Esa plantilla no existe.'); };
  const nueva = (bloques, nota) => {
    r.versiones.push({ n: (vigente()?.n ?? 0) + 1, bloques, nota: nota || '', porNombre: 'Usuario de prueba', en: new Date().toISOString() });
  };
  const detalle = (n) => {
    existe(n); const v = vigente();
    return {
      nombre: BASE.nombre, titulo: BASE.titulo, descripcion: BASE.descripcion, puedeEditar: true, estado: estado(), version: v?.n ?? 0,
      aprobacion: r.aprobacion, variables: BASE.variables,
      bloques: BASE.bloques.map((b) => ({ clave: b.clave, titulo: b.titulo, tipo: b.tipo, editable: b.base !== null, base: b.base,
        texto: b.base === null ? null : (v?.bloques[b.clave] ?? b.base), cambiado: b.base !== null && v?.bloques[b.clave] !== undefined })),
      versiones: r.versiones.map((x) => ({ n: x.n, nota: x.nota, porNombre: x.porNombre, en: x.en, cambiadas: Object.keys(x.bloques).length })).reverse(),
    };
  };
  return {
    lista: () => {
      const v = vigente();
      return { puedeEditar: true, items: [{ nombre: BASE.nombre, titulo: BASE.titulo, descripcion: BASE.descripcion, estado: estado(), version: v?.n ?? 0,
        propia: !!v && Object.keys(v.bloques).length > 0, cambiadas: v ? Object.keys(v.bloques).length : 0, editables: 2, aprobacion: r.aprobacion, actualizada: v?.en ?? null }] };
    },
    detalle,
    guardar: (n, o) => {
      existe(n); const propios = {};
      for (const [clave, texto] of Object.entries(o.bloques || {})) {
        const b = BASE.bloques.find((x) => x.clave === clave);
        if (!b || b.base === null) throw new Error(`La cláusula «${clave}» no se puede editar.`);
        const t = String(texto).replace(/\r/g, '').trim();
        if (!t) throw new Error(`«${b.titulo}» no puede quedar vacía.`);
        const malo = [...t.matchAll(/\{\{\s*([^#/}][^}]*?)\s*\}\}/g)].map((m) => m[1]).find((x) => !BASE.variables.includes(x));
        if (malo) throw new Error(`${b.titulo}: El dato «{{${malo}}}» no existe en esta plantilla.`);
        if (t !== b.base.trim()) propios[clave] = t;
      }
      if (JSON.stringify(vigente()?.bloques ?? {}) !== JSON.stringify(propios)) nueva(propios, o.nota);
      return detalle(n);
    },
    previa: (n) => { existe(n); return { pdf: pdfMuestra(['Orden de visita (muestra)', 'Corredora de prueba', 'Pagina de ejemplo']) }; },
    aprobar: (n, o) => {
      existe(n); const revisor = String(o.revisor || '').trim();
      if (revisor.length < 2) throw new Error('Escribe quién revisó la plantilla (nombre del abogado o notario).');
      r.aprobacion = { n: vigente()?.n ?? 0, revisor, nota: o.nota || '', porNombre: 'Usuario de prueba', en: new Date().toISOString() };
      return detalle(n);
    },
    restaurar: (n, version) => {
      existe(n); const v = version === 0 ? { bloques: {} } : r.versiones.find((x) => x.n === version);
      if (!v) throw new Error('Esa versión no existe.');
      nueva({ ...v.bloques }, version === 0 ? 'Vuelta a la base' : `Vuelta a la versión ${version}`);
      return detalle(n);
    },
  };
}

module.exports = { crear, pdfMuestra };
