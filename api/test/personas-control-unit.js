// Control al registrar personas: el nombre no es un RUT y no se crea otra con el mismo nombre, correo o celular (sin red).
// Requiere compilar antes (yarn build o la API en yarn dev, que deja dist/).
const { PersonasService, nombreEsRut } = require('../dist/personas/personas.service');
const ok = (v, m) => { if (!v) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };

for (const n of ['10.508.558-3', '10508558-3', '9.876.543-K', ' 12.345.678-5 ']) ok(nombreEsRut(n), `«${n}» es un RUT`);
for (const n of ['Pilar Prieto', '+56 9 8847 6632', '988476632', 'ana@correo.cl', 'Inversiones 10.508 SpA']) ok(!nombreEsRut(n), `«${n}» no es un RUT (se acepta como nombre)`);

(async () => {
  const existente = { id: 'p1', nombre: 'Pilar Prieto', rut: null, rutFormato: null, email: null, telefono: null };
  const conRut = { id: 'p2', nombre: 'Juan Pérez', rut: '111111111', rutFormato: '11.111.111-1', email: 'juan@x.cl', telefono: '+56 9 1111 2222' };
  let consultas = 0;
  const db = {
    persona: {
      findMany: async ({ where }) => { consultas++; const q = where.busqueda?.startsWith || ''; const sin = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); return [existente, conRut].filter((p) => sin(p.nombre + ' ' + (p.rutFormato || '')).startsWith(q)); },
      findFirst: async ({ where }) => [existente, conRut].find((p) => p.email && p.email === where.email) || null,
      findUniqueOrThrow: async ({ where }) => [existente, conRut].find((p) => p.id === where.id),
    },
    $queryRaw: async () => [{ id: 'p2' }],
  };
  const s = new PersonasService(db, {});
  const buscar = (o, ex) => s.parecida('c1', o, ex);
  ok((await buscar({ nombre: 'pilar  PRIETO' }))?.persona.id === 'p1', 'el mismo nombre (sin importar mayúsculas ni espacios) es la misma persona');
  ok((await buscar({ nombre: 'Pilar Prieto', rut: '10.508.558-3' }))?.persona.id === 'p1', 'con el nombre de una ficha sin RUT, aunque traiga RUT, es la misma persona (se le completa)');
  ok(!(await buscar({ nombre: 'Juan Pérez', rut: '22.222.222-2' })), 'mismo nombre pero otro RUT: es otra persona');
  ok((await buscar({ nombre: 'Juan Pérez', rut: '11.111.111-1' }))?.persona.id === 'p2', 'mismo nombre y mismo RUT: la misma');
  ok((await buscar({ nombre: 'Otro Nombre', email: 'JUAN@x.cl' }))?.motivo === 'el correo', 'el mismo correo delata a la misma persona');
  ok((await buscar({ nombre: 'Otro Nombre', telefono: '+56 9 1111 2222' }))?.motivo === 'el celular', 'el mismo celular también');
  ok(!(await buscar({ nombre: 'Persona Nueva', email: 'nueva@x.cl', telefono: '+56 9 5555 4444' }).then((r) => (r && r.motivo === 'el celular' ? null : r))), 'una persona realmente nueva no choca por nombre ni correo');
  consultas = 0;
  ok(!(await buscar({ nombre: '+56 9 8847 6632' }).then((r) => (r?.motivo === 'el nombre' ? r : null))) && consultas === 0, 'un celular o correo como nombre (marcador de interesado) no se compara por nombre');
  // crear: el nombre RUT se rechaza antes de tocar la base
  let e; try { await s.crear({ corredoraId: 'c1', sub: 'u' }, { nombre: '10.508.558-3', rut: '10.508.558-3' }); } catch (x) { e = x; }
  ok(e && e.getStatus() === 400 && e.getResponse().code === 'NOMBRE_ES_RUT', 'crear con un RUT de nombre responde 400 NOMBRE_ES_RUT');
  e = null; try { await s.crear({ corredoraId: 'c1', sub: 'u' }, { nombre: 'pilar prieto' }); } catch (x) { e = x; }
  ok(e && e.getStatus() === 409 && e.getResponse().code === 'DUP_PERSONA' && e.getResponse().personaId === 'p1' && /Ya existe «Pilar Prieto» \(sin RUT\)/.test(e.getResponse().message), 'crear otra «Pilar Prieto» responde 409 DUP_PERSONA con la ficha que ya existe');
  e = null; try { await s.actualizar({ corredoraId: 'c1', sub: 'u' }, 'p1', { nombre: '10.508.558-3' }); } catch (x) { e = x; }
  ok(e && e.getResponse().code === 'NOMBRE_ES_RUT', 'editar el nombre a un RUT también se rechaza');
  console.log('OK');
})().catch((e) => { console.error(e); process.exit(1); });
