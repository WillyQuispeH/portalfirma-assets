// Las operaciones de un negocio desde la app, contra la API real de Asset (SIN PF_MOCK): la lógica de negocio vive en el servidor
// (api/src/negocios/negocio-acciones.ts) y el escritorio solo le pide cada operación y deja su copia igual a lo que devolvió.
// Revisa, con el administrador de api/.env (SEMBRAR_ADMIN_*, que no se imprimen): crear, tarea, mover (la propiedad queda reservada), paso manual,
// pagos con comprobante (el archivo viaja a la API y queda en R2), quitar un pago, factura, pago de la comisión (cierra el negocio y la propiedad
// queda arrendada), reabrir, aceptación del propietario, aprobación del contrato, postarriendo, perder un negocio (la propiedad vuelve a disponible),
// nota, próxima acción, condiciones, firma fuera de Asset, vincular firma, y que un cambio hecho por otra persona (versión) no se pise.
// En cada paso compara la base (por Prisma) con la copia local de la app. Al final deshace todo lo que creó.
// Requiere la API corriendo (start-dev.ps1 o `yarn dev` en api/). Uso: node test/negocios-acciones-api-e2e.js [url-de-la-api]
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };

const API_DIR = path.join(__dirname, '..', '..', 'api');
const env = Object.fromEntries(fs.readFileSync(path.join(API_DIR, '.env'), 'utf8').split(/\r?\n/).map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2].trim().replace(/^"(.*)"$/, '$1')]));
const API = (process.argv[2] || 'http://localhost:3000') + '/v1';
process.env.DATABASE_URL ||= env.DATABASE_URL;
const { PrismaClient } = require(path.join(API_DIR, 'node_modules', '@prisma/client'));
const SUF = Date.now().toString(36);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const PDF = Array.from(Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'));
const hoy = () => new Date().toISOString().slice(0, 10);
const req = async (metodo, ruta, cuerpo, token) => {
  const r = await fetch(API + ruta, { method: metodo, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  let j = null; try { j = await r.json(); } catch {} return { s: r.status, j };
};
async function hasta(fn, ms = 12000) { const fin = Date.now() + ms; let v; while (Date.now() < fin) { v = await fn(); if (v) return v; await dormir(300); } return v; }
const estable = (v) => (Array.isArray(v) ? v.map(estable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, estable(v[k])])) : v);
const igual = (a, b) => JSON.stringify(estable(a ?? null)) === JSON.stringify(estable(b ?? null));

(async () => {
  const salud = await fetch(API + '/salud').then((r) => r.json()).catch(() => null);
  if (!salud?.db) { console.error(`La API no responde en ${API} (o no llega a la base). Levántala con start-dev.ps1.`); process.exit(1); }
  const db = new PrismaClient();
  const inicio = new Date();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-negacc-'));
  const creados = { props: [], personas: [], negocios: [] }; let admin = null; let app = null;
  try {
    admin = await db.usuario.findUnique({ where: { email: String(env.SEMBRAR_ADMIN_EMAIL).toLowerCase() } });
    const tok = (await req('POST', '/auth/ingresar', { email: env.SEMBRAR_ADMIN_EMAIL, clave: env.SEMBRAR_ADMIN_CLAVE })).j.tokenAcceso;
    const prop = (await req('POST', '/propiedades', { titulo: `E2E Acciones ${SUF}`, tipo: 'departamento', venta: true, arriendo: true, direccion: 'Av. Prueba 789', comuna: 'Providencia' }, tok)).j; creados.props.push(prop.id);
    const cli = (await req('POST', '/personas', { nombre: `E2E Arrendataria ${SUF}`, email: `arr-${SUF}@prueba.cl`, roles: ['arrendatario'] }, tok)).j; creados.personas.push(cli.id);
    const cli2 = (await req('POST', '/personas', { nombre: `E2E Compradora ${SUF}`, email: `comp-${SUF}@prueba.cl`, roles: ['comprador'] }, tok)).j; creados.personas.push(cli2.id);

    app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${path.join(tmp, 'ud')}`], cwd: path.join(__dirname, '..'),
      env: { ...process.env, PF_MOCK: '', PF_MOCK_LOGGED: '', PF_MOCK_ASSET_LOGIN: '', PF_ASSET_API: API, PF_INMO_DIR: path.join(tmp, 'inmo'), PF_AI_MANAGED: 'none', PF_NO_TOURS: '1' } });
    const w = await app.firstWindow(); const errs = [];
    w.on('pageerror', (e) => errs.push(e.message));
    const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
    const falla = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => (r.ok ? null : r.error)), [fn, a]);
    await w.waitForSelector('#assetAcceso #acEmail', { timeout: 20000 });
    await w.fill('#acEmail', env.SEMBRAR_ADMIN_EMAIL); await w.fill('#acClave', env.SEMBRAR_ADMIN_CLAVE); await w.click('#acEntrar');
    await w.waitForSelector('#assetAcceso', { state: 'detached', timeout: 30000 });
    ok(true, 'entra con el administrador de Asset');

    const fila = (id) => db.negocio.findUnique({ where: { id } });
    // la base y la copia local de la app dicen lo mismo (etapa, estado, versión y los datos que cambian las acciones)
    const iguales = async (id, m) => {
      const l = await hasta(async () => { const x = await call('negObtener', id); const f = await fila(id); return x.version === f.version ? x : null; });
      const f = await fila(id); const d = f.datos || {};
      ok(!!l && l.etapa === f.etapa && l.estado === f.estado && l.version === f.version && igual(l.ciclo, d.ciclo) && igual(l.firmas, d.firmas) && igual(l.tareas, d.tareas) && igual(l.aceptacion, d.aceptacion) && igual(l.pasos, d.pasos) && igual(l.valor, d.valor), `${m}: la copia de la app es igual a la base (v${f.version})`);
      return f;
    };
    const propBase = () => db.propiedad.findUnique({ where: { id: prop.id } });
    const propLocal = async () => (await call('inmoListar')).propiedades.find((p) => p.id === prop.id);

    // 1) crear: el servidor le da el código NG-XXX, vincula al cliente y la copia local lo recibe igual
    const A = await call('negGuardar', { tipo: 'arriendo', propId: prop.id, clienteId: cli.id, valor: { valor: 650000, moneda: 'CLP' }, comision: { tipo: '%', valor: 50 } }); creados.negocios.push(A.id);
    let f = await iguales(A.id, 'crear un arriendo');
    ok(/^NG-\d+$/.test(f.datos.codigo || '') && f.tipo === 'arriendo' && f.etapa === 'interes' && f.datos.valor.valor === 650000 && A.codigo === f.datos.codigo, `lo creó el servidor, con su código ${f.datos.codigo}`);
    ok((await propLocal()).vinculos.some((v) => v.personaId === cli.id && v.rol === 'arrendatario'), 'la ficha de la propiedad ya trae al arrendatario vinculado');
    ok(/Ya hay un negocio/.test((await falla('negGuardar', { tipo: 'arriendo', propId: prop.id, clienteId: cli.id })) || ''), 'otro negocio igual abierto lo rechaza el servidor (no lo repite la app)');

    // 2) tarea y mover: la propiedad queda reservada (la aplica el servidor) y la app la ve así
    await call('negTarea', A.id, 'visita', 0, true);
    f = await iguales(A.id, 'marcar una tarea');
    ok(f.datos.tareas.visita[0] === true, 'la tarea quedó marcada en la base');
    const mv = await call('negMover', A.id, 'reserva');
    f = await iguales(A.id, 'mover a «Reserva»');
    ok(f.etapa === 'reserva' && mv.mensajes.some((m) => /reservada/.test(m)), 'el negocio pasó a «Reserva» y el aviso dice que la propiedad quedó reservada');
    ok((await propBase()).estadoArriendo === 'reservada' && (await propLocal()).estadoArriendo === 'reservada', 'la propiedad quedó reservada en la base y en la copia de la app');
    ok(/etapa/i.test((await falla('negMover', A.id, 'inventada')) || ''), 'una etapa que no existe la rechaza el servidor');

    // 3) paso manual
    await call('etMarcar', { negocioId: A.id, paso: 'evaluacion', estado: 'ok' });
    f = await iguales(A.id, 'marcar un paso a mano');
    ok(f.datos.pasos.evaluacion.e === 'ok', 'el paso «Evaluación» quedó logrado en la base');
    await call('etMarcar', { negocioId: A.id, paso: 'evaluacion', estado: null });
    f = await iguales(A.id, 'volver el paso a lo automático');
    ok(!f.datos.pasos?.evaluacion, 'y vuelve a lo automático');

    // 4) pagos con comprobante: el archivo viaja a la API y queda en R2 (carpeta de archivos del negocio)
    const rp = await call('negPago', { negocioId: A.id, tipo: 'reserva', monto: 100000, moneda: 'CLP', fecha: hoy(), medio: 'transferencia', referencia: 'OP-123', nota: 'reserva e2e', archivo: { nombre: 'comprobante.pdf', mime: 'application/pdf', bytes: PDF } });
    f = await iguales(A.id, 'pago de la reserva con comprobante');
    const pr = f.datos.ciclo.pagos.reserva;
    ok(pr.monto === 100000 && pr.comprobante?.clave?.startsWith(`c/${admin.corredoraId}/r/archivos_negocio/todos/${A.id}/`) && /Ref\. OP-123/.test(pr.nota), 'la reserva quedó con su monto, nota y el comprobante en R2');
    ok(rp.negocio.ciclo.pagos.reserva.comprobante.clave === pr.comprobante.clave, 'y la respuesta de la app trae el mismo comprobante');
    const desc = await req('GET', `/registros/archivos_negocio/${A.id}/archivos/descarga?clave=${encodeURIComponent(pr.comprobante.clave)}&nombre=comprobante.pdf`, null, tok);
    ok(desc.s === 200 && /^https?:/.test(desc.j?.url || ''), 'el comprobante se puede bajar');
    await call('negPago', { negocioId: A.id, tipo: 'garantia', monto: 650000, moneda: 'CLP', fecha: hoy(), medio: 'efectivo' });
    await call('negPago', { negocioId: A.id, tipo: 'primer_mes', monto: 650000, moneda: 'CLP', fecha: hoy(), medio: 'transferencia' });
    f = await iguales(A.id, 'garantía y primer mes');
    ok(f.datos.ciclo.pagos.garantia.monto === 650000 && f.datos.ciclo.pagos.primerMes.monto === 650000, 'los dos pagos quedaron en la base');
    await call('negPagoQuitar', A.id, 'primer_mes');
    f = await iguales(A.id, 'quitar el primer mes');
    ok(!f.datos.ciclo.pagos.primerMes && f.datos.ciclo.pagos.garantia, 'se borró solo ese pago');
    await call('negPago', { negocioId: A.id, tipo: 'primer_mes', monto: 640000, moneda: 'CLP', fecha: hoy(), medio: 'transferencia' });
    ok(/PDF o una imagen/.test((await falla('negPago', { negocioId: A.id, tipo: 'otro', monto: 1, moneda: 'CLP', fecha: hoy(), medio: 'otro', archivo: { nombre: 'x.txt', mime: 'text/plain', bytes: Array.from(Buffer.from('esto no es un pdf ni una imagen')) } })) || ''), 'un archivo que no es PDF ni imagen no se acepta');

    // 5) aceptación del propietario y contrato (aprobación)
    await call('negAceptacion', A.id, { accion: 'oferta', monto: 640000, moneda: 'CLP', garantia: '1 mes', plazo: '12 meses', nota: 'oferta e2e' });
    await call('negAceptacion', A.id, { accion: 'acepta' });
    f = await iguales(A.id, 'aceptación del propietario');
    ok(f.datos.aceptacion.rondas.length === 2 && f.datos.aceptacion.rondas[1].tipo === 'aceptada' && f.datos.valor.valor === 640000, 'la oferta y su aceptación quedaron, y el valor del negocio es lo acordado');
    ok(/terminó/.test((await falla('negAceptacion', A.id, { accion: 'contraoferta', monto: 1 })) || ''), 'responder de nuevo una negociación terminada lo rechaza el servidor');
    // las versiones del contrato aún no tienen acción en el servidor: se guardan con el PUT del documento (con su versión)
    const cicloActual = (await call('negObtener', A.id)).ciclo;
    await call('negGuardar', { id: A.id, ciclo: { ...cicloActual, contrato: { versiones: [{ n: 1, fecha: new Date().toISOString(), de: 'asset', nota: '', generada: true, firmantes: [{ personaId: cli.id, nombre: cli.nombre }] }], aprobado: {}, datos: { inicio: '2026-12-01', plazoMeses: 12, reajuste: 'ipc_semestral', avisoDias: 60 } } } });
    f = await hasta(async () => { const x = await fila(A.id); return x.datos.ciclo?.contrato?.versiones?.length ? x : null; });
    ok(f && f.datos.ciclo.pagos.reserva, 'la versión del contrato llegó a la base (y los pagos siguen)');
    await call('negContratoAprobar', A.id, { personaId: cli.id });
    f = await iguales(A.id, 'aprobar el contrato');
    ok(!!f.datos.ciclo.contrato.aprobado[cli.id], 'el firmante quedó aprobado en la base');
    await call('negContratoAprobar', A.id, { personaId: cli.id, aprobado: false });
    f = await iguales(A.id, 'quitar la aprobación');
    ok(!f.datos.ciclo.contrato.aprobado[cli.id], 'y se le puede quitar');

    // 6) postarriendo
    await call('negPostarriendo', A.id, { tipo: 'reajuste', desde: '2027-06-01', ipc: 3, rentaNueva: 659200 });
    await call('negPostarriendo', A.id, { tipo: 'renovacion', decision: 'renovar', meses: 12, nota: 'renueva' });
    await call('negPostarriendo', A.id, { tipo: 'devolucion', fechaRecepcion: hoy(), conforme: true, descuento: 0, fechaDevolucion: hoy(), archivo: { nombre: 'devolucion.pdf', mime: 'application/pdf', bytes: PDF } });
    f = await iguales(A.id, 'postarriendo');
    const post = f.datos.ciclo.postarriendo;
    ok(post.reajustes.length === 1 && post.rentaActual === 659200 && post.renovacion.meses === 12 && post.devolucion.devuelto === 650000 && post.devolucion.comprobante?.clave, 'reajuste, renovación y devolución (con su comprobante) quedaron en la base');
    await call('negPostarriendo', A.id, { tipo: 'quitar_renovacion' });
    await call('negPostarriendo', A.id, { tipo: 'quitar_devolucion' });
    f = await iguales(A.id, 'quitar la renovación y la devolución');
    ok(!f.datos.ciclo.postarriendo.renovacion && !f.datos.ciclo.postarriendo.devolucion, 'se pueden quitar');

    // 7) factura y pago de la comisión: el negocio se cierra ganado y la propiedad queda arrendada (lo hace el servidor)
    await call('negFactura', A.id, { numero: 'F-77', fecha: hoy(), monto: 325000, moneda: 'CLP' });
    f = await iguales(A.id, 'factura de la comisión');
    ok(f.datos.ciclo.comision.factura.numero === 'F-77' && /^\d{4}-\d{2}-\d{2}$/.test(f.datos.ciclo.comision.facturaFecha || ''), 'la factura quedó, con su fecha de facturación a 30 días de la entrega');
    const pc = await call('negPago', { negocioId: A.id, tipo: 'comision', monto: 325000, moneda: 'CLP', fecha: hoy(), medio: 'transferencia' });
    f = await iguales(A.id, 'pago de la comisión');
    ok(f.estado === 'ganado' && f.etapa === 'entrega' && pc.mensajes.some((m) => /ganado/.test(m)), 'registrar el pago de la comisión cerró el negocio como ganado (lo hizo el servidor)');
    ok((await propBase()).estadoArriendo === 'arrendada' && (await propLocal()).estadoArriendo === 'arrendada', 'la propiedad quedó arrendada en la base y en la copia de la app');
    await call('negReabrir', A.id);
    f = await iguales(A.id, 'reabrir');
    ok(f.estado === 'abierto', 'el negocio se pudo reabrir');

    // 8) un negocio de venta: perderlo, nota, próxima acción, condiciones, firmas
    const B = await call('negGuardar', { tipo: 'venta', propId: prop.id, clienteId: cli2.id, valor: { valor: 5000, moneda: 'UF' }, comision: { tipo: '%', valor: 2 } }); creados.negocios.push(B.id);
    await iguales(B.id, 'crear una venta');
    await call('negMover', B.id, 'reserva');
    ok((await propBase()).estadoVenta === 'reservada' && (await propLocal()).estadoVenta === 'reservada', 'la venta en «Oferta y reserva» deja la propiedad reservada (venta)');
    ok(/«otro»/.test((await falla('negPago', { negocioId: B.id, tipo: 'reserva', monto: 1000, moneda: 'CLP', fecha: hoy(), medio: 'otro' })) || ''), 'en una venta la reserva como pago la rechaza el servidor');
    await call('negPago', { negocioId: B.id, tipo: 'otro', monto: 1000, moneda: 'CLP', fecha: hoy(), medio: 'otro', referencia: 'abono' });
    f = await iguales(B.id, 'comprobante «otro» en la venta');
    ok(f.datos.ciclo.comprobantes.length === 1, 'quedó en la lista de comprobantes');
    ok(/por qué/.test((await falla('negCerrar', B.id, 'perdido', '')) || ''), 'perder un negocio sin motivo lo rechaza el servidor');
    await call('negCerrar', B.id, 'perdido', 'Se arrepintió');
    f = await iguales(B.id, 'perder el negocio');
    ok(f.estado === 'perdido' && f.datos.motivoPerdida === 'Se arrepintió' && (await propBase()).estadoVenta === 'disponible' && (await propLocal()).estadoVenta === 'disponible', 'quedó perdido y la propiedad volvió a «disponible»');
    await call('negReabrir', B.id);
    const act = await call('negNota', B.id, 'Nota de prueba e2e');
    ok(act.some((x) => /Nota de prueba e2e/.test(x.texto)), 'la nota quedó en el historial del negocio');
    await call('negGuardar', { id: B.id, proximaAccion: { texto: 'Llamar al banco', fecha: '2026-12-15' } });
    await call('negGuardar', { id: B.id, valor: { valor: 4900, moneda: 'UF' }, comision: { tipo: 'monto', valor: 90 }, cierreEstimado: '2027-01-20', oferta: { garantia: '10 %', plazo: '60 días', condiciones: 'Sujeto a crédito' } });
    f = await iguales(B.id, 'próxima acción y condiciones');
    ok(f.datos.proximaAccion.texto === 'Llamar al banco' && f.datos.proximaAccion.fecha === '2026-12-15' && f.datos.valor.valor === 4900 && f.datos.comision.tipo === 'monto' && f.datos.cierreEstimado === '2027-01-20' && f.datos.oferta.condiciones === 'Sujeto a crédito', 'quedaron en la base');
    await call('negFirmaFuera', A.id, 'reserva');
    await call('negFirmaVincular', B.id, 'reserva', 987654);
    f = await fila(A.id); const g = await fila(B.id);
    ok(f.datos.firmas.reserva.estado === 'firmado' && f.datos.firmas.reserva.fuera === true && g.datos.firmas.reserva.operacion === 987654 && g.datos.firmas.reserva.estado === 'en_firma', 'firmado fuera de Asset y vincular una operación quedaron en la base');
    await iguales(A.id, 'firmas del arriendo'); await iguales(B.id, 'firmas de la venta');

    // 9) otra persona cambia el negocio antes (versión): no se pisa, la app recarga y avisa
    const remoto = (await req('GET', `/negocios/${B.id}`, null, tok)).j;
    const r9 = await req('PUT', `/negocios/${B.id}`, { ...remoto, proximaAccion: { texto: 'Cambio de otra persona', fecha: '2026-12-20' } }, tok);
    ok(r9.s === 200, 'otra persona (otro equipo o WhatsApp) cambia el negocio en la API');
    const e9 = await falla('negTarea', B.id, 'reserva', 0, true);
    ok(/Otra persona cambió/.test(e9 || ''), 'la acción de la app con la versión vieja la rechaza el servidor y la app lo dice');
    ok((await call('negObtener', B.id)).proximaAccion?.texto === 'Cambio de otra persona', 'la app recargó el negocio con lo de la otra persona');
    await call('negTarea', B.id, 'reserva', 0, true);
    f = await iguales(B.id, 'repetir la acción ya con lo último');
    ok(f.datos.tareas.reserva[0] === true && f.datos.proximaAccion.texto === 'Cambio de otra persona', 'se aplicó sin pisar lo de la otra persona');

    // 10) borrar (sigue por el documento) y cola vacía
    await call('negBorrar', B.id);
    ok(await hasta(async () => !!(await fila(B.id))?.eliminadoEn), 'borrar el negocio llega como baja');
    await dormir(1500);
    const cola = path.join(tmp, 'inmo', 'cola-api.json');
    ok(!fs.existsSync(cola) || !JSON.parse(fs.readFileSync(cola, 'utf8')).ops?.length, 'no queda nada pendiente en la cola');
    ok(!errs.length, 'sin errores en la pantalla' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('\nOK negocios-acciones-api');
  } catch (e) {
    console.error(e.message); process.exitCode = 1;
  } finally {
    await dormir(1500);
    await app?.close().catch(() => {});
    try {
      await db.negocio.deleteMany({ where: { OR: [{ id: { in: creados.negocios } }, { propiedadId: { in: creados.props } }] } });
      await db.actividad.deleteMany({ where: { OR: [{ entidadId: { in: [...creados.props, ...creados.personas, ...creados.negocios] } }, { ref2: { in: [...creados.props, ...creados.personas, ...creados.negocios] } }] } });
      await db.propiedadPersona.deleteMany({ where: { propiedadId: { in: creados.props } } });
      await db.propiedad.deleteMany({ where: { id: { in: creados.props } } });
      await db.persona.deleteMany({ where: { id: { in: creados.personas } } });
      if (admin) await db.sesion.deleteMany({ where: { usuarioId: admin.id, creadoEn: { gte: inicio } } });
    } catch (e) { console.error('No se pudo deshacer todo:', e.message); process.exitCode = 1; }
    await db.$disconnect();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})();
