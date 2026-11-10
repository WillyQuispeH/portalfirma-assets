// Leads: «Nuevo» pasa a «Contactado» cuando el corredor toma la conversación o le responde desde la app (regla decidida con
// el usuario). No retrocede ni pisa un estado más avanzado, y lo que responde Sofía no cuenta. PF_MOCK, con el wechatia de mentira.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pflc-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pflc-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const pf = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x), [fn, a]).then((r) => (r && r.ok === false ? Promise.reject(new Error(r.error)) : r?.data));
  const herr = (n, a) => pf('assetEjecutar', n, a);
  const estado = async (id) => (await pf('leadsObtener', id)).estado;
  try {
    await w.setViewportSize({ width: 1500, height: 920 });
    await w.waitForFunction(() => window.pf && window.Inmo, null, { timeout: 15000 });
    await app.evaluate(() => { global.__waMock = { enviados: [], usuarios: [], convs: [], msgs: {} }; });
    const crear = async (nombre, tel) => (await herr('asset_crear_lead', { nombre, telefono: tel, canal: 'whatsapp' })).lead.id;

    const a = await crear('Lead Uno', '+56 9 5555 0101');
    ok(await estado(a) === 'nuevo', 'un lead recién registrado está en «Nuevo»');
    await pf('leadsAtencion', a, 'corredor');
    const la = await pf('leadsObtener', a);
    ok(la.estado === 'contactado' && la.atiende === 'corredor' && (la.historial || []).some((h) => /tomó la conversación/.test(h.texto)), 'al tomar la conversación pasa a «Contactado» y queda en su historial');

    const b = await crear('Lead Dos', '+56 9 5555 0102');
    await pf('leadsAtencion', b, 'agente');
    ok(await estado(b) === 'nuevo', 'devolverle la conversación a Sofía no lo cambia');

    const c = await crear('Lead Tres', '+56 9 5555 0103');
    await pf('leadsActualizar', c, { estado: 'visita' });
    await pf('leadsAtencion', c, 'corredor');
    ok(await estado(c) === 'visita', 'si ya estaba más avanzado («Visita agendada»), no retrocede');

    const d = await crear('Lead Cuatro', '+56 9 5555 0104');
    await app.evaluate((_, id) => global.__leads.registrarWa(id, { de: 'agente', texto: 'Hola, soy Sofía' }), d);
    ok(await estado(d) === 'nuevo', 'lo que responde Sofía no lo cambia');
    await app.evaluate((_, id) => global.__leads.registrarWa(id, { de: 'cliente', texto: 'Hola, ¿sigue disponible?' }), d);
    ok(await estado(d) === 'nuevo', 'ni lo que escribe el cliente');
    await app.evaluate((_, id) => global.__leads.registrarWa(id, { de: 'broker', texto: 'Hola, te escribo yo directamente' }), d);
    const ld = await pf('leadsObtener', d);
    ok(ld.estado === 'contactado' && (ld.historial || []).some((h) => /corredor respondió/.test(h.texto)), 'cuando responde el corredor (desde la app o a mano) pasa a «Contactado»');

    const e = await crear('Lead Cinco', '+56 9 5555 0105');
    ok(await estado(e) === 'nuevo', 'sin que nadie responda, sigue en «Nuevo»');
    ok(!errs.length, 'sin errores en la ventana' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('leads-contactado-e2e: OK');
  } finally { await app.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
