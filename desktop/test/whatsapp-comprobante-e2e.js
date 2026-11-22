// Un comprobante de pago que el ejecutivo manda por WhatsApp (PDF o foto) con «sube este comprobante al negocio de la propiedad CV-9002»:
//  · un PDF NO se confunde con el chat exportado de un lead (antes cualquier archivo iba a «Fernanda · Leads»);
//  · el asistente (Diego) lee el comprobante, SIEMPRE pregunta a qué negocio va (todos tienen su código NG-XXX), pregunta solo lo que el
//    comprobante no trae (monto, moneda, fecha, medio, a qué corresponde el pago) y pide confirmar con SÍ antes de subirlo;
//  · al confirmar queda en el negocio (pago con su comprobante) y en su historial.
// El WhatsApp y el modelo son los de prueba (PF_MOCK); la lectura del comprobante y la subida del archivo, también.   node test/whatsapp-comprobante-e2e.js
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfwc-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfwc-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const txt = (s) => w.textContent(s).then((t) => (t || '').replace(/\s+/g, ' '));
  let n = 0;
  const escribe = (body, att) => app.evaluate((_, a) => { const W = global.__waMock; (W.msgs.c9 ||= []).push({ id: 'in' + a.n, direction: 'inbound', body: a.body, attachments: a.att || [], dateAdded: new Date(Date.now() + a.n * 1000).toISOString() }); }, { body, att, n: ++n });
  const enviados = () => app.evaluate(() => (global.__waMock?.enviados || []).map((e) => e.contactId + '|' + e.message));
  const esperaEnvio = async (re, desde) => { for (let i = 0; i < 60; i++) { await w.evaluate(() => window.pf.waRevisar()); const e = (await enviados()).slice(desde); const m = e.find((x) => re.test(x)); if (m) return m; await w.waitForTimeout(500); } throw new Error('FALLÓ: no llegó el mensaje esperado ' + re + '\n' + (await enviados()).slice(desde).join('\n---\n')); };
  try {
    await w.setViewportSize({ width: 1500, height: 960 });
    await w.waitForSelector('#view-agente .ag.ag-full', { timeout: 15000 });
    await w.evaluate(() => window.Inmo.importar()); await w.waitForSelector('text=Cartera actualizada', { timeout: 15000 }); await w.click('#mOk');
    await app.evaluate(() => { global.__waMock = { convs: [{ id: 'c9', contactId: 'k9', phone: '+56987276858', fullName: 'Jerónimo' }], msgs: { c9: [] }, enviados: [], contactos: {} }; });
    await w.evaluate(() => window.Agente.vista()); await w.waitForSelector('#agWa'); await w.click('#agWa'); await w.waitForSelector('#waKey');
    await w.fill('#waKey', 'pit-f0e1d2c3f0e1d2c3f0e1d2c3'); await w.fill('#waLoc', 'PlPVNYvbNWr6nrRB9VHG'); await w.click('#waKeyOk'); await w.waitForSelector('#waVin:not([disabled])');
    await w.click('#waVin'); await w.waitForSelector('.wa-cod b'); const cod = (await txt('.wa-cod b')).trim();
    await escribe('Hola, mi código es ' + cod.toLowerCase()); await esperaEnvio(/^k9\|Listo, este celular quedó conectado/, 0); await w.click('#mCancel');

    // dos negocios abiertos de la misma propiedad (CV-9002), cada uno con su código NG-XXX
    const d = await w.evaluate(() => window.pf.inmoListar().then((r) => r.data));
    const prop = d.propiedades.find((p) => p.codigo === 'CV-9002'); const [c1, c2] = d.personas.filter((p) => p.nombre).slice(0, 2);
    const g1 = await w.evaluate((o) => window.pf.negGuardar(o).then((r) => r.data), { tipo: 'arriendo', etapa: 'interes', propId: prop.id, clienteId: c1.id });
    const r2 = await w.evaluate((o) => window.pf.negGuardar(o), { tipo: 'arriendo', etapa: 'interes', propId: prop.id, clienteId: c2.id }); if (!r2.ok) throw new Error('no se pudo crear el 2.º negocio: ' + r2.error); const g2 = r2.data;
    ok(/^NG-\d{3}$/.test(g1.codigo) && /^NG-\d{3}$/.test(g2.codigo) && g1.codigo !== g2.codigo, `cada negocio tiene su código (${g1.codigo} y ${g2.codigo})`);

    // el comprobante (PDF) que lee la IA: trae monto, moneda, fecha y medio
    await app.evaluate(() => {
      global.__waChat = { bytes: '%PDF-1.4 comprobante de prueba', nombre: 'septiembre 2026.pdf' };
      global.__comprobanteLeido = { esComprobante: true, monto: 450000, moneda: 'CLP', fecha: '2026-11-12', medio: 'transferencia', banco: 'BancoEstado', referencia: '98765432', emisor: 'Juan Pérez', destinatario: 'Inmobiliaria Ejemplo', concepto: '', avisos: [] };
      global.__subidos = []; global.__subirArchivoRegistro = async (c, id, nombre, buf) => { global.__subidos.push({ c, id, nombre, bytes: buf.length }); return `c/test/r/${c}/${id}/${nombre}`; };
    });
    let e0 = (await enviados()).length;
    await escribe('hola quiero que subas este comprobante al negocio de la propiedad CV-9002', ['mock:chat-comprobante.pdf']);
    const lista = await esperaEnvio(/^k9\|\*Diego\* · Seguimiento\n[\s\S]*¿A cuál lo subo\?/, e0);
    ok(!(await enviados()).slice(e0).some((x) => /no es un chat exportado/.test(x)), 'un PDF ya no se confunde con el chat exportado de un lead (no sale «Fernanda · Leads»)');
    ok(lista.includes(g1.codigo) && lista.includes(g2.codigo), 'SIEMPRE pregunta a qué negocio va: lista los dos con su código NG-XXX');

    e0 = (await enviados()).length; await escribe(`${g1.codigo} reserva`);
    const conf = await esperaEnvio(/^k9\|\*Diego\* · Seguimiento\n[\s\S]*Responde \*SÍ\* para confirmar/, e0);
    ok(/\$450\.000/.test(conf) && /Reserva/.test(conf) && /12\/11\/2026/.test(conf) && /Transferencia/.test(conf) && /septiembre 2026\.pdf/.test(conf) && conf.includes(g1.codigo), 'con los datos que trae el comprobante no pregunta nada más: pide confirmar con monto, fecha, medio y archivo');
    ok(!/me falta/i.test((await enviados()).slice(e0).join(' ')), 'y no pidió ningún dato que el comprobante ya traía');
    e0 = (await enviados()).length; await escribe('sí');
    await esperaEnvio(/^k9\|[\s\S]*subí el comprobante[\s\S]*Reserva/, e0);
    const neg = await w.evaluate((id) => window.pf.negObtener(id).then((r) => r.data), g1.id);
    const pg = neg.ciclo?.pagos?.reserva;
    ok(pg && pg.monto === 450000 && pg.moneda === 'CLP' && pg.fecha === '2026-11-12' && pg.medio === 'transferencia' && /98765432/.test(pg.nota) && /septiembre 2026\.pdf/.test(pg.comprobante?.nombre), 'queda en el negocio: la reserva con monto, moneda, fecha, medio y su comprobante');
    ok(await app.evaluate(() => global.__subidos.length === 1 && global.__subidos[0].c === 'archivos_negocio'), 'el archivo se sube a la carpeta del negocio');
    ok(neg.etapa === 'reserva' && /Comprobante de pago subido por WhatsApp/.test((neg.actividad || []).map((a) => a.texto).join(' ')), 'registrar la reserva mueve el negocio a «Reserva» y queda en su historial');

    // un comprobante al que le faltan datos: pregunta SOLO lo que falta (aquí la fecha y el medio)
    await app.evaluate(() => { global.__comprobanteLeido = { esComprobante: true, monto: 300000, moneda: 'CLP', fecha: null, medio: null, banco: '', referencia: '', emisor: '', destinatario: '', concepto: '', avisos: ['No se alcanza a leer la fecha'] }; });
    e0 = (await enviados()).length;
    await escribe(`sube este pago al ${g2.codigo}, es otro pago`, ['mock:chat-comprobante2.pdf']);
    const falta = await esperaEnvio(/^k9\|\*Diego\* · Seguimiento\n[\s\S]*Me falta/, e0);
    ok(/la fecha/.test(falta) && /el medio de pago/.test(falta) && !/el monto/.test(falta) && !/la moneda/.test(falta), 'si el comprobante no trae la fecha ni el medio, pregunta solo eso (no el monto ni la moneda, que sí traía)');
    e0 = (await enviados()).length; await escribe('fue el 05/11/2026 por transferencia');
    const conf2 = await esperaEnvio(/^k9\|\*Diego\* · Seguimiento\n[\s\S]*Responde \*SÍ\* para confirmar/, e0);
    ok(/\$300\.000/.test(conf2) && /05\/11\/2026/.test(conf2) && /Otro pago/.test(conf2), 'con lo que respondió, pide confirmar');
    e0 = (await enviados()).length; await escribe('no'); await esperaEnvio(/^k9\|[\s\S]*Cancelado/, e0);
    const neg2 = await w.evaluate((id) => window.pf.negObtener(id).then((r) => r.data), g2.id);
    ok(!(neg2.ciclo?.comprobantes || []).length && (await app.evaluate(() => global.__subidos.length)) === 1, 'al responder NO no se sube ni se registra nada');

    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK whatsapp comprobante');
  } catch (e) { console.error(e.message); await w.screenshot({ path: path.join(__dirname, 'wc-error.png') }).catch(() => {}); process.exitCode = 1; } finally { await app.close(); }
})();
