// Lectura de la copia de dominio con IA: propone fojas, número, año y conservador (no guarda nada), valida que el documento
// sea de la propiedad de la corredora y limpia lo que devuelva la IA. Base, almacenamiento e IA falsos (sin red).
// Requiere compilar antes (yarn build o la API en yarn dev, que deja dist/).
const { DominioIaService } = require('../dist/propiedades/dominio-ia');
const ok = (v, m) => { if (!v) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  let enviado = null;
  const db = {
    propiedad: { findFirst: async ({ where }) => (where.corredoraId === 'TL' && where.id === 'p1' ? { id: 'p1' } : null) },
    propiedadDocumento: { findFirst: async ({ where }) => (where.propiedadId === 'p1' && where.id === 'd1' ? { id: 'd1', clave: 'x', claveAlmacenamiento: 'c/TL/p/p1/docs/a.pdf', tamano: 100 } : null) },
  };
  const r2 = { bajar: async () => Buffer.from('%PDF-1.4 falso') };
  const ia = { leerDocumento: async (o) => { enviado = o; return { legible: true, fojas: '45.678 vta.', numeroInscripcion: 'N° 12.345', anioInscripcion: 'año 2019', conservador: 'Conservador de Bienes Raíces de Las Condes', rol: 'Rol 1234-56', propietarios: [{ nombre: 'Rosa Prueba', rut: '15.432.876-9' }, { nombre: '' }], vigente: true, emision: '2026-11-10', alertas: ['Hipoteca a favor de Banco X', ''], resumen: 'Dominio vigente.' }; } };
  const s = new DominioIaService(db, r2, ia);
  const u = { sub: 'u', corredoraId: 'TL', rol: 'CORREDOR' };
  const r = await s.leer(u, 'p1', 'd1');
  ok(r.fojas === '45678 vta' && r.numeroInscripcion === '12345' && r.anioInscripcion === '2019' && r.conservador === 'Las Condes' && r.rol === '1234-56', 'limpia lo que devuelve la IA: fojas, número, año, conservador y rol sin puntos ni palabras de más');
  ok(r.propietarios.length === 1 && r.alertas.length === 1 && r.vigente === true && r.legible, 'propietarios y alertas sin vacíos');
  ok(enviado.contenido[0].type === 'document' && enviado.contenido[0].source.media_type === 'application/pdf', 'el PDF se manda a la IA como documento');
  ok(enviado.sistema.includes('nunca lo inventes'), 'la IA tiene la orden de no inventar datos');
  const otra = await s.leer({ ...u, corredoraId: 'OTRA' }, 'p1', 'd1').then(() => null, (e) => e.message);
  ok(/No encontré la propiedad/.test(otra), 'una corredora no puede leer documentos de otra');
  const sinDoc = await s.leer(u, 'p1', 'd9').then(() => null, (e) => e.message);
  ok(/No encontré ese documento/.test(sinDoc), 'el documento tiene que ser de esa propiedad');
  console.log('OK');
})().catch((e) => { console.error(e.message); process.exit(1); });
