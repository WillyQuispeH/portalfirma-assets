// Tipos de documento en modo de prueba (PF_MOCK=1): imita GET/POST/PUT/DELETE /v1/tipos-documento en memoria, para la pantalla
// Configuración › Documentos y su prueba. Parte con los mismos tipos por defecto de la API.
function crear() {
  const base = [
    ['orden-visita', 'Orden de visita'], ['carta-oferta', 'Carta oferta'], ['contrato-arriendo', 'Contrato de arriendo'],
    ['mandato-arriendo', 'Mandato de gestión de arriendo'], ['mandato-venta', 'Mandato de gestión de venta'], ['promesa-compraventa', 'Promesa de compraventa'],
    ['escritura-compraventa', 'Escritura de compraventa'], ['acta-entrega', 'Acta de entrega'], ['acta-visita', 'Acta de visita'],
    ['anexo-contrato', 'Anexo de contrato'], ['poder', 'Poder'], ['declaracion-jurada', 'Declaración jurada'],
  ];
  const plantillas = new Set(['orden-visita', 'carta-oferta', 'contrato-arriendo', 'mandato-arriendo', 'mandato-venta', 'promesa-compraventa', 'escritura-compraventa', 'acta-entrega', 'acta-visita']);
  let items = base.map(([id, nombre]) => ({ id, nombre, tipoFirma: 'simple', tramite: 'none', palabras: [], plantilla: plantillas.has(id) ? id : null }));
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  return {
    lista: async () => ({ puedeEditar: true, items }),
    crear: async (o) => {
      const ya = items.find((t) => norm(t.nombre) === norm(o.nombre)); if (ya) return ya;
      const t = { id: norm(o.nombre).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'documento', nombre: String(o.nombre).trim(), tipoFirma: o.tipoFirma || 'simple', tramite: o.tramite === 'legalization' ? 'legalization' : 'none', palabras: o.palabras || [], plantilla: null };
      items = [...items, t]; return t;
    },
    editar: async (id, o) => {
      const t = items.find((x) => x.id === id); if (!t) throw new Error('Ese tipo de documento no existe.');
      if (o.nombre !== undefined) { if (items.some((x) => x.id !== id && norm(x.nombre) === norm(o.nombre))) throw new Error(`Ya existe «${o.nombre}».`); t.nombre = String(o.nombre).trim(); }
      if (o.tipoFirma !== undefined) t.tipoFirma = o.tipoFirma;
      if (o.tramite !== undefined) t.tramite = o.tramite === 'legalization' ? 'legalization' : 'none';
      if (o.palabras !== undefined) t.palabras = o.palabras;
      return t;
    },
    borrar: async (id) => { items = items.filter((x) => x.id !== id); return { ok: true }; },
  };
}
module.exports = { crear };
