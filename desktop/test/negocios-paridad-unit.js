// Paridad entre la vista derivada del escritorio (negocios.js › vista, etapas.js › pasos, aplicarEstado) y las reglas del
// servidor (api/src/negocios/negocio-reglas.ts), que son la referencia: la lógica de negocio vive UNA vez en el servidor y
// el escritorio solo la repite para MOSTRAR. Si alguien cambia un lado y no el otro, esta prueba lo detecta.
// Sin Electron ni servidor: negocios de ejemplo (venta y arriendo, varias etapas, firmas, pagos, contrato, postarriendo).
// Uso: node test/negocios-paridad-unit.js
const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };

process.env.PF_MOCK = '1';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-paridad-')); process.env.PF_INMO_DIR = tmp;

// las reglas del servidor (TypeScript) sin compilar
const API_DIR = path.join(__dirname, '..', '..', 'api');
require(path.join(API_DIR, 'node_modules', 'ts-node')).register({ transpileOnly: true, cwd: API_DIR });
const R = require(path.join(API_DIR, 'src', 'negocios', 'negocio-reglas.ts'));

const hace = (dias) => new Date(Date.now() - dias * 864e5).toISOString();
const dia = (dias) => new Date(Date.now() + dias * 864e5).toISOString().slice(0, 10);
const firmado = (extra = {}) => ({ operacion: 5001, estado: 'firmado', firmados: 2, total: 2, firmado: hace(2), ...extra });
const pago = (monto, extra = {}) => ({ monto, moneda: 'CLP', fecha: dia(-3), medio: 'transferencia', nota: '', comprobante: null, ...extra });

const personas = [
  { id: 'c1', nombre: 'Ana Compradora', rut: '11.111.111-1', tipo: 'natural', roles: ['comprador'], email: 'a@x.cl', telefono: '+56911111111' },
  { id: 'c2', nombre: 'Beto Arrendatario', rut: '22.222.222-2', tipo: 'natural', roles: ['arrendatario'], email: 'b@x.cl', telefono: '+56922222222' },
  { id: 'c3', nombre: 'Rosa Propietaria', rut: '9.876.543-2', tipo: 'natural', roles: ['propietario'], email: 'r@x.cl', telefono: '+56933333333' },
];
const propiedades = [
  { id: 'p1', codigo: 'PF-1', titulo: 'Casa en venta', comuna: 'Ñuñoa', venta: true, arriendo: false, estadoVenta: 'disponible', estadoArriendo: null, fotos: [], vinculos: [{ personaId: 'c3', rol: 'propietario' }], portales: {},
    firmas: [
      { operacion: 77, plantilla: 'Orden de visita', estado: 'firmado', fecha: hace(9), firmado: hace(9), negocioId: 'nv2', firmantes: [{ personaId: 'c1' }] },
      { operacion: 78, plantilla: 'Acta de visita', estado: 'en_firma', fecha: hace(8), negocioId: null, firmantes: [{ rut: '11.111.111-1' }] },
    ] },
  { id: 'p2', codigo: 'PF-2', titulo: 'Depto en arriendo', comuna: 'Providencia', venta: false, arriendo: true, estadoVenta: null, estadoArriendo: 'disponible', fotos: ['https://x/f.jpg'], vinculos: [{ personaId: 'c3', rol: 'propietario' }],
    portales: { pi: { arriendo: { status: 'active' } } },
    firmas: [{ operacion: 90, plantilla: 'Orden de visita', estado: 'en_firma', fecha: hace(5), negocioId: null, firmantes: [{ personaId: 'c2' }] }] },
];
const negocios = [
  { id: 'nv1', codigo: 'NG-001', tipo: 'venta', estado: 'abierto', etapa: 'interes', etapaDesde: hace(1), creado: hace(1), propId: 'p1', clienteId: 'c1', valor: { valor: 5000, moneda: 'UF' }, comision: { tipo: '%', valor: 2 }, tareas: { interes: [true] }, firmas: {} },
  { id: 'nv2', codigo: 'NG-002', tipo: 'venta', estado: 'abierto', etapa: 'reserva', etapaDesde: hace(6), creado: hace(10), propId: 'p1', clienteId: 'c1', valor: { valor: 4800, moneda: 'UF' }, comision: { tipo: 'monto', valor: 90 }, tareas: { interes: [true], visita: [true, true], reserva: [true] },
    firmas: { reserva: { operacion: 5000, estado: 'en_firma', firmados: 1, total: 2 }, oferta: firmado() }, proximaAccion: { texto: 'Llamar al banco', fecha: dia(-2) } },
  { id: 'nv3', codigo: 'NG-003', tipo: 'venta', estado: 'abierto', etapa: 'promesa', etapaDesde: hace(30), creado: hace(40), propId: 'p1', clienteId: 'c1', valor: { valor: 4800, moneda: 'UF' }, comision: { tipo: '%', valor: 2 }, tareas: { reserva: [true, true], promesa: [true, false] },
    firmas: { reserva: firmado(), promesa: firmado({ operacion: 5002 }) }, pasos: { negociacion: { e: 'ok', f: hace(20), d: '', quien: '', vence: null }, financiamiento: { e: 'pend', f: null, d: 'Esperando al banco', quien: 'el banco', vence: dia(5) } } },
  { id: 'nv4', codigo: 'NG-004', tipo: 'venta', estado: 'ganado', etapa: 'entrega', etapaDesde: hace(3), creado: hace(90), cierre: hace(2), propId: 'p1', clienteId: 'c1', valor: { valor: 4800, moneda: 'UF' }, comision: { tipo: '%', valor: 2 }, tareas: { entrega: [true, true] },
    firmas: { reserva: firmado(), promesa: firmado(), escritura: firmado(), entrega: firmado() }, comisionPagada: { fecha: dia(-1) } },
  { id: 'nv5', codigo: 'NG-005', tipo: 'venta', estado: 'perdido', etapa: 'visita', etapaDesde: hace(15), creado: hace(20), cierre: hace(12), motivoPerdida: 'Compró otra', propId: 'p1', clienteId: 'c1', valor: null, comision: null, tareas: {}, firmas: {} },
  { id: 'na1', codigo: 'NG-006', tipo: 'arriendo', estado: 'abierto', etapa: 'visita', etapaDesde: hace(2), creado: hace(3), propId: 'p2', clienteId: 'c2', valor: { valor: 600000, moneda: 'CLP' }, comision: { tipo: '%', valor: 50 }, tareas: { interes: [true] }, firmas: {}, proximaAccion: { texto: 'Confirmar visita', fecha: dia(1) } },
  { id: 'na2', codigo: 'NG-007', tipo: 'arriendo', estado: 'abierto', etapa: 'reserva', etapaDesde: hace(8), creado: hace(12), propId: 'p2', clienteId: 'c2', valor: { valor: 600000, moneda: 'CLP' }, comision: { tipo: '%', valor: 50 }, tareas: { reserva: [true] },
    firmas: { oferta: firmado({ operacion: 6001 }) }, ciclo: { pagos: { reserva: pago(100000) } },
    aceptacion: { rondas: [{ fecha: hace(7), tipo: 'oferta', por: 'interesado', monto: 580000, moneda: 'CLP', garantia: '1 mes', plazo: '12 meses', condiciones: '', nota: '' }, { fecha: hace(6), tipo: 'aceptada', por: 'propietario', monto: 580000, moneda: 'CLP', garantia: '1 mes', plazo: '12 meses', condiciones: '', nota: '' }] } },
  { id: 'na3', codigo: 'NG-008', tipo: 'arriendo', estado: 'abierto', etapa: 'contrato', etapaDesde: hace(4), creado: hace(20), propId: 'p2', clienteId: 'c2', valor: { valor: 600000, moneda: 'CLP' }, comision: { tipo: '%', valor: 50 }, tareas: { reserva: [true], contrato: [false] },
    firmas: { oferta: firmado({ operacion: 6001 }), reserva: firmado({ operacion: 6002 }), contrato: { operacion: 6003, estado: 'en_firma', firmados: 1, total: 3 } },
    ciclo: { pagos: { reserva: pago(100000), garantia: pago(600000), primerMes: pago(600000) },
      contrato: { versiones: [{ n: 1, fecha: hace(6), de: 'asset', nota: '', generada: true, firmantes: [{ personaId: 'c2', nombre: 'Beto Arrendatario' }, { personaId: 'c3', nombre: 'Rosa Propietaria' }] }], aprobado: { c2: hace(5) },
        datos: { inicio: dia(10), plazoMeses: 12, reajuste: 'ipc_semestral', avisoDias: 60 } } } },
  { id: 'na4', codigo: 'NG-009', tipo: 'arriendo', estado: 'ganado', etapa: 'entrega', etapaDesde: hace(25), creado: hace(80), cierre: hace(20), propId: 'p2', clienteId: 'c2', valor: { valor: 600000, moneda: 'CLP' }, comision: { tipo: '%', valor: 50 }, tareas: { entrega: [true, true] },
    firmas: { oferta: firmado({ operacion: 6001 }), reserva: firmado({ operacion: 6002 }), contrato: firmado({ operacion: 6003 }), entrega_acta: firmado({ operacion: 6004 }) },
    ciclo: { pagos: { reserva: pago(100000), garantia: pago(600000), primerMes: pago(600000) }, comision: { facturaFecha: dia(-5), factura: { numero: '123', fecha: dia(-4), monto: 300000, moneda: 'CLP' }, pago: pago(300000) },
      contrato: { versiones: [{ n: 1, fecha: hace(60), de: 'asset', nota: '', generada: true, firmantes: [{ personaId: 'c2', nombre: 'Beto Arrendatario' }] }], aprobado: { c2: hace(59) },
        datos: { inicio: dia(-90), plazoMeses: 12, reajuste: 'ipc_semestral', avisoDias: 60 } },
      entrega: { fecha: dia(-85), inventario: [{ espacio: 'Living' }] }, postarriendo: { reajustes: [{ desde: dia(-30), ipc: 3, rentaAntes: 600000, rentaNueva: 618000, registrado: hace(30) }], rentaActual: 618000 } } },
];
fs.writeFileSync(path.join(tmp, 'datos.json'), JSON.stringify({ version: 1, propiedades, personas, negocios, actividad: [] }));

const inmo = require('../src/inmo'); inmo._reset();
const NG = require('../src/negocios');
const etapas = require('../src/etapas').crear({ agenda: { listar: () => [] }, formatos: null });

// ctx del servidor construido con los mismos datos
const ctxDe = (n) => {
  const p = propiedades.find((x) => x.id === n.propId); const c = personas.find((x) => x.id === n.clienteId);
  return {
    prop: p ? { id: p.id, codigo: p.codigo, titulo: p.titulo, comuna: p.comuna, venta: p.venta, arriendo: p.arriendo, estadoVenta: p.estadoVenta, estadoArriendo: p.estadoArriendo, fotos: (p.fotos || []).length,
      publicada: Object.values(p.portales || {}).some((x) => Object.values(x || {}).some((a) => a && ['active', 'en_feed', 'publicada'].includes(String(a.status)))) } : null,
    firmasProp: (p?.firmas || []).map((f) => ({ plantilla: f.plantilla, estado: f.estado, operacion: f.operacion, fecha: f.fecha, firmado: f.firmado || null, negocioId: f.negocioId || null, firmantes: (f.firmantes || []).map((s) => ({ personaId: s.personaId, rut: s.rut })) })),
    visitas: [], clienteNombre: c?.nombre || null, clienteRut: c?.rut || null, hoy: new Date().toISOString().slice(0, 10), ahora: '12:00',
  };
};
const limpiar = (x) => JSON.parse(JSON.stringify(x));
const dif = (a, b) => JSON.stringify(limpiar(a)) === JSON.stringify(limpiar(b));

(async () => {
  // 1) las etapas (nombres, tareas, firma, estado, final) son las mismas
  ok(dif(NG.ETAPAS, R.ETAPAS), 'las etapas de venta y arriendo (tareas, firmas, estado, final) son iguales a las del servidor');

  const diferencias = [];
  for (const n of negocios) {
    const loc = NG.ver(n.id); const ctx = ctxDe(n); const srv = R.vista(n, ctx.hoy);
    for (const k of ['etapaInfo', 'orden', 'total', 'siguiente', 'pendientes', 'comisionMonto', 'vencida', 'diasEnEtapa']) if (!dif(loc[k], srv[k])) diferencias.push(`${n.codigo} vista.${k}: escritorio ${JSON.stringify(loc[k])} · servidor ${JSON.stringify(srv[k])}`);
    const dl = loc.documentos; const ds = R.documentos(n, ctx);
    if (!dif(dl, ds)) diferencias.push(`${n.codigo} documentos: escritorio ${JSON.stringify(dl)} · servidor ${JSON.stringify(ds)}`);
    // pasos: id, estado y texto de cada uno, el actual y los avances por etapa
    const pl = etapas.pasos({ n: inmo.negocios().find((x) => x.id === n.id), p: null }); const ps = R.pasos(n, ctx);
    const resumen = (r) => ({ etapas: r.etapas.map((e) => ({ id: e.id, ok: e.ok, total: e.total, fail: e.fail, completa: e.completa, actual: e.actual, pasos: e.pasos.map((x) => ({ id: x.id, e: x.e, d: x.d, q: x.q, vence: x.vence })) })), actual: r.actual ? { id: r.actual.id, e: r.actual.e } : null, cerrado: r.cerrado });
    if (!dif(resumen(pl), resumen(ps))) {
      const a = resumen(pl); const b = resumen(ps);
      for (let i = 0; i < Math.max(a.etapas.length, b.etapas.length); i++) for (let j = 0; j < Math.max(a.etapas[i]?.pasos.length || 0, b.etapas[i]?.pasos.length || 0); j++) {
        const x = a.etapas[i]?.pasos[j]; const y = b.etapas[i]?.pasos[j]; if (!dif(x, y)) diferencias.push(`${n.codigo} pasos[${i}][${j}]: escritorio ${JSON.stringify(x)} · servidor ${JSON.stringify(y)}`);
      }
      if (!dif(a.actual, b.actual)) diferencias.push(`${n.codigo} paso actual: escritorio ${JSON.stringify(a.actual)} · servidor ${JSON.stringify(b.actual)}`);
    }
  }
  if (diferencias.length) { console.error(diferencias.join('\n')); throw new Error(`FALLÓ: ${diferencias.length} diferencias entre el escritorio y el servidor`); }
  ok(true, `vista, documentos y pasos de ${negocios.length} negocios (venta y arriendo, varias etapas, firmas, pagos y contrato) coinciden con el servidor`);

  // 2) el estado de la propiedad que deja cada negocio (aplicarEstado local = estadoObjetivo del servidor)
  const casos = [
    ['venta en reserva', { tipo: 'venta', etapa: 'reserva', estado: 'abierto', firmas: {} }, 'disponible'],
    ['venta en promesa', { tipo: 'venta', etapa: 'promesa', estado: 'abierto', firmas: {} }, 'disponible'],
    ['venta ganada', { tipo: 'venta', etapa: 'entrega', estado: 'ganado', firmas: {} }, 'reservada'],
    ['arriendo en reserva', { tipo: 'arriendo', etapa: 'reserva', estado: 'abierto', firmas: {} }, 'disponible'],
    ['arriendo con acta de entrega firmada', { tipo: 'arriendo', etapa: 'entrega', estado: 'abierto', firmas: { entrega_acta: { estado: 'firmado' } } }, 'reservada'],
    ['arriendo ganado', { tipo: 'arriendo', etapa: 'entrega', estado: 'ganado', firmas: {} }, 'disponible'],
    ['arriendo perdido tras reservar', { tipo: 'arriendo', etapa: 'reserva', estado: 'perdido', firmas: {} }, 'reservada'],
    ['arriendo en visita', { tipo: 'arriendo', etapa: 'visita', estado: 'abierto', firmas: {} }, 'reservada'],
  ];
  let cambios = [];
  NG.configurar({ alCambiarPropiedad: async (id, c) => { cambios.push(c); return []; } });
  for (const [nombre, base, actual] of casos) {
    const campo = base.tipo === 'venta' ? 'estadoVenta' : 'estadoArriendo';
    const prop = inmo.todas().find((x) => x.id === (base.tipo === 'venta' ? 'p1' : 'p2'));
    // dejamos solo este negocio como hermano, y la propiedad en el estado de partida
    const otros = inmo.negocios().splice(0, inmo.negocios().length); // vacía la lista local
    prop[campo] = actual; prop.venta = true; prop.arriendo = true;
    const n = { id: 'tmp', codigo: 'NG-T', creado: hace(1), etapaDesde: hace(1), propId: prop.id, clienteId: 'c1', tareas: {}, ...base };
    inmo.negocios().push(n); cambios = [];
    // se aplica con la operación que lo deja en ese estado (mover a su misma etapa no hace nada: se fuerza con reabrir/cerrar)
    if (base.estado === 'abierto') { n.etapa = 'interes'; await NG.mover('tmp', base.etapa).catch(() => null); if (base.etapa === 'interes') await NG.reabrir('tmp').catch(() => null); }
    else if (base.estado === 'ganado') { n.estado = 'abierto'; n.etapa = 'interes'; await NG.cerrar('tmp', 'ganado'); }
    else { n.estado = 'abierto'; n.etapa = base.etapa; await NG.cerrar('tmp', 'perdido', 'x'); }
    const local = cambios.length ? cambios[cambios.length - 1][campo] : actual;
    const espera = R.estadoObjetivo(base.tipo, [limpiar(inmo.negocios()[0])], actual);
    ok((espera ?? actual) === local, `estado de la propiedad (${nombre}, parte «${actual}»): escritorio «${local}» = servidor «${espera ?? actual}»`);
    inmo.negocios().splice(0, inmo.negocios().length, ...otros);
  }
  console.log('\nOK: el escritorio y el servidor muestran lo mismo');
  fs.rmSync(tmp, { recursive: true, force: true });
})().catch((e) => { console.error(e.message || e); process.exit(1); });
