// Recordatorios de visitas al corredor: cuándo toca cada uno (hora de Chile, sin red).
// Requiere compilar antes (yarn build o la API en yarn dev, que deja dist/).
const { recordatoriosDebidos: d } = require('../dist/whatsapp/recordatorio-visita');
const ok = (v, m) => { if (!v) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
const j = (x) => JSON.stringify(x);
const hoy = '2026-11-24';
const manana = '2026-11-25';
const min = (h, m = 0) => h * 60 + m;

// la víspera: desde las 18:00 del día anterior
ok(j(d({ fecha: manana, hora: '10:00' }, { fecha: hoy, minutos: min(17, 59) })) === '[]', 'a las 17:59 todavía no hay recordatorio de la víspera');
ok(j(d({ fecha: manana, hora: '10:00' }, { fecha: hoy, minutos: min(18) })) === '["vispera"]', 'a las 18:00 sale el de la víspera');
ok(j(d({ fecha: manana, hora: null }, { fecha: hoy, minutos: min(21, 30) })) === '["vispera"]', 'una visita de todo el día también lo recibe (hasta tarde)');
ok(j(d({ fecha: '2026-11-26', hora: '10:00' }, { fecha: hoy, minutos: min(19) })) === '[]', 'una visita de pasado mañana no se recuerda aún');
// 1 hora antes
ok(j(d({ fecha: hoy, hora: '15:00' }, { fecha: hoy, minutos: min(13, 59) })) === '[]', 'a más de 1 hora no sale el de la hora');
ok(j(d({ fecha: hoy, hora: '15:00' }, { fecha: hoy, minutos: min(14) })) === '["hora"]', 'a 1 hora de la visita sale el de la hora');
ok(j(d({ fecha: hoy, hora: '15:00' }, { fecha: hoy, minutos: min(14, 45) })) === '["hora"]', 'sigue saliendo si la ronda se atrasó');
ok(j(d({ fecha: hoy, hora: '15:00' }, { fecha: hoy, minutos: min(15) })) === '[]', 'ya empezó: no se recuerda');
ok(j(d({ fecha: hoy, hora: null }, { fecha: hoy, minutos: min(9) })) === '[]', 'una visita de todo el día no tiene el de la hora');
ok(j(d({ fecha: '2026-11-23', hora: '15:00' }, { fecha: hoy, minutos: min(14) })) === '[]', 'una visita de ayer no se recuerda');
// cambio de mes y de año en la víspera
ok(j(d({ fecha: '2027-01-01', hora: '09:00' }, { fecha: '2026-12-31', minutos: min(18, 5) })) === '["vispera"]', 'la víspera cruza el fin de año');
console.log('OK');

// la ronda completa con una base y un wechatia de mentira
(async () => {
  const { RecordatorioVisitaService: S, ETIQUETA_RECORDATORIO_VISITA } = require('../dist/whatsapp/recordatorio-visita');
  const registros = new Map();
  const enviadas = [];
  const visita = (id, o = {}) => ({ id, fecha: new Date('2026-11-25T00:00:00Z'), hora: '10:00', propiedadId: 'p1', negocioId: 'n1', personaIds: [], corredorId: 'u1', creadoPorId: 'u1', ...o });
  const db = {
    waVinculo: { findMany: async () => [{ usuarioId: 'u1', corredoraId: 'c1', telefono: '+56911112222' }] },
    evento: { findMany: async () => [visita('e1')] },
    usuario: { findUnique: async () => ({ nombre: 'Abad Pérez' }) },
    propiedad: { findUnique: async () => ({ codigo: 'CV-9001', direccion: 'Av. Apoquindo 1234', comuna: 'Las Condes', titulo: 't' }) },
    negocio: { findUnique: async () => ({ clienteId: '11111111-1111-1111-1111-111111111111', datos: { codigo: 'NG-014' } }) },
    persona: { findFirst: async () => ({ nombre: 'Ana Pérez', telefono: '+56 9 1234 5678' }) },
    registro: {
      create: async ({ data }) => { if (registros.has(data.id)) throw Object.assign(new Error('dup'), { code: 'P2002' }); registros.set(data.id, data.datos); },
      update: async ({ where, data }) => { registros.set(where.corredoraId_coleccion_id.id, data.datos); },
      delete: async ({ where }) => { registros.delete(where.corredoraId_coleccion_id.id); },
    },
  };
  const wa = { cliente: async () => ({ enviarPlantilla: async (o) => { enviadas.push(o); return { contactId: 'x' }; } }) };
  const enviados = { registrar: async () => {} };
  const s = new S(db, wa, enviados, { get: () => 0 });
  const tarde = { fecha: '2026-11-24', minutos: 18 * 60 + 5 };
  ok((await s.ronda(tarde)) === 1 && enviadas.length === 1, 'la ronda de las 18:05 envía el recordatorio de la víspera');
  const e = enviadas[0];
  ok(e.etiqueta === ETIQUETA_RECORDATORIO_VISITA && e.telefono === '+56911112222', 'va al celular del corredor, con la etiqueta de la plantilla');
  ok(j(e.campos) === j({ nombre: 'Abad', fecha: 'miércoles 25 de noviembre', hora: '10:00', propiedad: 'CV-9001 · Av. Apoquindo 1234, Las Condes', interesado: 'Ana Pérez · +56 9 1234 5678', negocio: 'NG-014' }), 'lleva fecha, hora, propiedad, interesado y negocio');
  ok((await s.ronda({ fecha: '2026-11-24', minutos: 18 * 60 + 10 })) === 0 && enviadas.length === 1, 'la siguiente ronda no lo repite');
  // se reprograma a otra hora: se vuelve a recordar
  db.evento.findMany = async () => [visita('e1', { hora: '11:30' })];
  ok((await s.ronda({ fecha: '2026-11-24', minutos: 19 * 60 })) === 1 && enviadas.length === 2, 'si se reprograma, se recuerda de nuevo');
  // sin WhatsApp de la empresa: no queda marcado y reintenta (hasta 3 veces)
  registros.clear(); enviadas.length = 0;
  wa.cliente = async () => null;
  await s.ronda(tarde); await s.ronda(tarde); await s.ronda(tarde); await s.ronda(tarde);
  ok(registros.size === 0 && enviadas.length === 0, 'si no pudo enviar, no queda como enviado');
  wa.cliente = async () => ({ enviarPlantilla: async (o) => { enviadas.push(o); return {}; } });
  ok((await s.ronda(tarde)) === 0, 'tras 3 fallos deja de reintentar esa visita');
  console.log('OK ronda');
})().catch((e) => { console.error(e); process.exit(1); });
