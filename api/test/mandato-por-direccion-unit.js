// Mandato pedido por dirección: busca la propiedad, la crea si no está y registra al dueño sin preguntar (sin base de datos: dobles).
const { HerramientasDocumentos } = require('../dist/whatsapp/herramientas/documentos');
const ok = (v, m) => { if (!v) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };

function armar(propiedades) {
  const llamadas = { crear: [], dueno: [] };
  const h = Object.create(HerramientasDocumentos.prototype);
  h.db = {
    propiedad: {
      findMany: async ({ where }) => propiedades.filter((p) => !where.comuna || p.comuna.toLowerCase().includes(where.comuna.contains.toLowerCase())),
      findFirstOrThrow: async () => ({ id: 'nueva', codigo: 'PF-2000', direccion: 'Av. Eyzaguirre 766', comuna: 'Providencia' }),
    },
    propiedadPersona: { count: async () => 0 },
  };
  h.acciones = {
    crear: async (_u, e) => { llamadas.crear.push(e); return { propiedad: { id: 'nueva' } }; },
    registrarPropietario: async (_u, _id, x) => { llamadas.dueno.push(x); return { ok: true, nombre: x.nombre }; },
  };
  return { h, llamadas };
}
const c = { corredoraId: 'c1', usuarioId: 'u1', nombre: 'Pedro', admin: false, texto: '', adjuntos: [] };
const dArr = { id: 'mandato_arriendo' };
const dVen = { id: 'mandato_venta' };
const cartera = [
  { id: 'a', codigo: 'PF-1055', direccion: 'Av. Apoquindo 3000', unidad: '2D', comuna: 'Las Condes' },
  { id: 'b', codigo: 'PF-1001', direccion: 'Avenida Eyzaguirre 766', unidad: '1120', comuna: 'Providencia' },
];

(async () => {
  // 1. no está: se crea como departamento en arriendo, con el dueño (RUT inválido → sin RUT)
  let { h, llamadas } = armar([cartera[0]]);
  let r = await h.propiedadPorDireccion(c, dArr, { direccion: 'Avenida Eyzaguirre 766', comuna: 'Providencia', unidad: '1120', propietario: { nombre: 'Juan José Lupe Ordóñez', rut: '2.764.800-3' } });
  ok(!r.error && r.prop.codigo === 'PF-2000', 'una dirección que no está en la cartera se crea');
  const e = llamadas.crear[0];
  ok(e.tipo === 'departamento' && e.arriendo === true && e.venta === false && e.comuna === 'Providencia' && e.unidad === '1120' && e.captadorId === 'u1', 'queda como departamento en arriendo (mandato de arriendo), captado por quien lo pidió');
  ok(e.titulo === 'Departamento en Providencia', 'con título automático');
  ok(llamadas.dueno.length === 1 && llamadas.dueno[0].rut === '' && /no es válido/.test(r.notas.join(' ')), 'el dueño se registra aunque el RUT sea inválido (sin RUT) y se avisa');
  ok(r.notas.some((n) => n.startsWith('Creé la propiedad PF-2000')), 'queda anotado lo que se creó');

  // 2. mandato de venta de una casa sin número de depto
  ({ h, llamadas } = armar([]));
  await h.propiedadPorDireccion(c, dVen, { direccion: 'Panorámica Sur 12290', comuna: 'Lo Barnechea' });
  ok(llamadas.crear[0].tipo === 'casa' && llamadas.crear[0].venta === true && llamadas.crear[0].arriendo === false, 'sin depto es casa y el mandato de venta la deja en venta');

  // 3. ya existe (otra forma de escribirla): no se crea
  ({ h, llamadas } = armar(cartera));
  r = await h.propiedadPorDireccion(c, dArr, { direccion: 'Av. Eyzaguirre 766', comuna: 'providencia', unidad: '1120' });
  ok(r.prop.codigo === 'PF-1001' && !llamadas.crear.length, 'si ya está (aunque se escriba distinto) se usa esa y no se duplica');

  // 4. lo parecido en otra comuna no cuenta
  ({ h, llamadas } = armar(cartera));
  r = await h.propiedadPorDireccion(c, dArr, { direccion: 'Av. Apoquindo 3000', comuna: 'Providencia' });
  ok(llamadas.crear.length === 1, 'una propiedad parecida en otra comuna no se confunde con esta');

  // 5. sin número no hay dirección
  ({ h, llamadas } = armar([]));
  r = await h.propiedadPorDireccion(c, dArr, { direccion: 'Avenida Eyzaguirre', comuna: 'Providencia' });
  ok(/número/.test(r.error) && !llamadas.crear.length, 'sin número de calle pide el número y no crea nada');
  // 6. sin comuna no se puede crear
  r = await h.propiedadPorDireccion(c, dArr, { direccion: 'Avenida Eyzaguirre 766' });
  ok(/comuna/.test(r.error), 'sin comuna (y sin estar en la cartera) pide la comuna');
  console.log('OK');
})().catch((e) => { console.error(e.message); process.exit(1); });
