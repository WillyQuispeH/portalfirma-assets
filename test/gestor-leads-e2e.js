// 0.16.23 · Gestor de leads: cada interesado queda en Personas aunque no dé su RUT (los datos se agregan a medida que
// llegan), el corredor dueño sale del «Propietario» de wechatia (o se asigna a mano), todo queda en el historial y se
// puede avisar al corredor por WhatsApp.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfgl-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfgl-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const txt = (s) => w.textContent(s).then((t) => (t || '').replace(/\s+/g, ' '));
  const shot = (n) => w.screenshot({ path: path.resolve(__dirname, n) });
  const pfc = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x), [fn, a]).then((r) => (r && r.ok === false && r.error ? Promise.reject(new Error(r.error)) : r?.data ?? r));
  try {
    await w.setViewportSize({ width: 1500, height: 960 });
    await w.waitForSelector('#view-agente .ag.ag-full', { timeout: 15000 });
    await app.evaluate(() => { const t = (m) => new Date(Date.now() - m * 60000).toISOString();
      global.__waMock = { enviados: [], usuarios: [{ id: 'u-ana', name: 'Ana Rivas', email: 'ana@thelivingchile.cl' }, { id: 'u-beto', name: 'Beto Soto', email: 'beto@thelivingchile.cl' }],
        convs: [{ id: 'ig1', contactId: 'c-ig1', fullName: 'Valentina Paz', lastMessageType: 'TYPE_INSTAGRAM', instagramUsername: 'vale.paz', assignedTo: 'u-ana' }],
        msgs: { ig1: [{ id: 'i1', direction: 'inbound', messageType: 'TYPE_INSTAGRAM', body: 'Hola, busco arrendar depto en Providencia para mi familia, hasta 800 lucas', dateAdded: t(30) }] } }; });
    // corredores: lista propia, vinculada con wechatia por el correo
    await w.click('#nav [data-view="leads"]'); await w.waitForSelector('#ldCorBtn'); await w.click('#ldCorBtn'); await w.waitForSelector('#coNuevo');
    for (const [n, c, e] of [['Ana Rivas', '+56 9 5555 0001', 'ana@thelivingchile.cl'], ['Beto Soto', '+56 9 5555 0002', 'beto@thelivingchile.cl']]) {
      await w.click('#coNuevo'); await w.fill('#coN', n); await w.fill('#coC', c); await w.fill('#coE', e); await w.click('#coOk'); await w.waitForSelector(`.ld-cors li:has-text("${n}")`); }
    await w.click('[data-ed]'); await w.click('#coWc'); await w.waitForSelector('select#coW');
    ok(/wechatia: Ana Rivas/.test(await txt('.ld-cors')) && /wechatia: Beto Soto/.test(await txt('.ld-cors')), 'los corredores se vinculan solos con su usuario de wechatia (por el correo)');
    await shot('gl0-corredores.png'); await w.click('#mCancel');
    // llega un lead por Instagram, asignado a Ana en wechatia
    await pfc('obsConfigurar', { activo: true, autorizado: true }); await pfc('obsRevisar');
    await w.click('#nav [data-view="leads"]'); await w.waitForSelector('#ldItems .ld-it:has-text("Valentina Paz")', { timeout: 10000 });
    await w.click('#ldItems .ld-it:has-text("Valentina Paz")'); await w.waitForSelector('#ldCor'); await w.waitForTimeout(400);
    ok(/Ana Rivas/.test(await txt('#ldItems .ld-it')) && (await w.$eval('#ldCor', (s) => s.selectedOptions[0].textContent)) === 'Ana Rivas', 'el lead queda de Ana: el «Propietario» que tiene en wechatia');
    const h = await txt('.ld-hist');
    ok(/Llegó por Instagram \(@vale.paz\)/.test(h) && /Asignado a Ana Rivas \(según wechatia\)/.test(h) && /Quedó guardado en Personas/.test(h), 'historial: cómo llegó, a quién se asignó y que quedó en Personas');
    // cambio manual de corredor
    await w.selectOption('#ldCor', { label: 'Beto Soto' }); await w.waitForTimeout(600);
    ok(/Pasó de Ana Rivas a Beto Soto/.test(await txt('.ld-hist')), 'reasignar a mano queda en el historial');
    await shot('gl1-lead.png');
    // persona guardada sin RUT, con su corredor y el historial
    await w.click('#ldPersona'); await w.waitForSelector('.im-pt h1');
    ok(/Valentina Paz/.test(await txt('.im-pt h1')) && /Sin RUT todavía/.test(await txt('.im-pt')) && /Beto Soto/.test(await txt('.im-dl')), 'queda en Personas sin RUT, como interesada, con su corredor');
    ok(/Llegó como interesado por Instagram/.test(await txt('.im-act')) && /Pasó de Ana Rivas a Beto Soto/.test(await txt('.im-act')), 'el historial de la persona registra la llegada y el cambio de corredor');
    await shot('gl2-persona.png');
    // llegan más datos: se agregan a la persona (sin pisar lo que ya tenía)
    await app.evaluate(() => { global.__waMock.msgs.ig1.push({ id: 'i2', direction: 'inbound', messageType: 'TYPE_INSTAGRAM', body: 'Mi celular es +56 9 6543 2100 y mi correo vale.paz@gmail.com', dateAdded: new Date().toISOString() }); });
    await pfc('obsRevisar'); await w.click('#pLead'); await w.waitForSelector('#ldCor'); await w.click('#ldPersona'); await w.waitForSelector('.im-pt h1');
    ok(/6543/.test(await txt('.im-dl')) && /vale.paz@gmail.com/.test(await txt('.im-dl')) && /Se agregó su teléfono, correo/.test(await txt('.im-act')), 'el celular y el correo que dio después se agregan a la persona y quedan en su historial');
    // en wechatia no cambió el dueño: se respeta la asignación hecha en Asset
    ok(/Beto Soto/.test(await txt('.im-dl')), 'si wechatia no cambia el dueño, se respeta lo asignado en Asset');
    // wechatia cambia el dueño → se actualiza
    await app.evaluate(() => { global.__waMock.convs[0].assignedTo = 'u-ana'; }); // igual que antes: no cambia
    await app.evaluate(() => { global.__waMock.convs[0].assignedTo = 'u-beto'; }); await pfc('obsRevisar');
    await app.evaluate(() => { global.__waMock.convs[0].assignedTo = 'u-ana'; }); await pfc('obsRevisar');
    await w.click('#pLead'); await w.waitForSelector('#ldCor'); await w.waitForTimeout(400);
    ok((await w.$eval('#ldCor', (s) => s.selectedOptions[0].textContent)) === 'Ana Rivas' && /Pasó de Beto Soto a Ana Rivas \(según wechatia\)/.test(await txt('.ld-hist')), 'si cambia el Propietario en wechatia, cambia aquí y queda registrado');
    // avisar al corredor
    await w.click('#ldDerivar'); await w.waitForSelector('.ld-pre');
    const pre = await txt('.ld-pre');
    ok(/Lead para ti/.test(pre) && /Valentina Paz/.test(pre) && /6543/.test(pre) && /wa\.me\/56965432100/.test(pre) && /Instagram/.test(pre), 'el aviso al corredor lleva los datos, qué busca y el enlace para escribirle');
    await shot('gl3-derivar.png');
    await w.click('#mOk'); await w.waitForTimeout(1500);
    const env = await app.evaluate(() => global.__waMock.enviados.map((e) => e.message || ''));
    const salio = env.some((m) => /Lead para ti/.test(m));
    if (!salio) { ok(/Abrir mi WhatsApp/.test(await txt('#mOk')), 'si no sale por la empresa (24 h), ofrece abrir tu WhatsApp con el aviso'); await w.click('#mCancel'); }
    else ok(true, 'el aviso salió por WhatsApp a Ana');
    await w.waitForTimeout(400);
    ok(/Derivado a Ana Rivas/.test(await txt('.ld-hist')), 'la derivación queda en el historial');
    ok(!errs.length, 'sin errores en la pantalla ' + errs.join(' | '));
    console.log('\nOK gestor-leads-e2e');
  } catch (e) { console.error(e.message); await shot('gl-error.png').catch(() => {}); process.exitCode = 1; }
  finally { await app.close(); }
})();
