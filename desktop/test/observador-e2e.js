// 0.16.22 · Leads en vivo desde wechatia (solo lectura): Instagram y correo se anotan como leads con su historial,
// la IA deja perfil y contacto, nunca se responde por esos canales y Fernanda no los toma como WhatsApp.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
const OBS = require('../src/observador');
(async () => {
  ok(OBS.canalDe('TYPE_INSTAGRAM') === 'instagram' && OBS.canalDe('TYPE_EMAIL') === 'email' && OBS.canalDe('TYPE_WHATSAPP') === null, 'reconoce el canal de cada conversación');
  ok(OBS.sinCita(OBS.limpiarHtml('<p>Me interesa la casa</p><p>El lun, 20 oct 2026 a las 10:00, X escribió:</p><p>viejo</p>')) === 'Me interesa la casa', 'del correo deja solo lo nuevo (sin HTML ni lo citado)');
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfob-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfob-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const txt = (s) => w.textContent(s).then((t) => (t || '').replace(/\s+/g, ' '));
  const shot = (n) => w.screenshot({ path: path.resolve(__dirname, n) });
  try {
    await w.setViewportSize({ width: 1500, height: 960 });
    await w.waitForSelector('#view-agente .ag.ag-full', { timeout: 15000 });
    await app.evaluate(() => {
      const t = (min) => new Date(Date.now() - min * 60000).toISOString();
      global.__waMock = { enviados: [], convs: [
        { id: 'ig1', contactId: 'c-ig1', fullName: 'Valentina Paz', lastMessageType: 'TYPE_INSTAGRAM', instagramUsername: 'vale.paz' },
        { id: 'em1', contactId: 'c-em1', fullName: 'Rodrigo Lagos', email: 'rlagos@empresa.cl', lastMessageType: 'TYPE_EMAIL' },
        { id: 'wa1', contactId: 'c-wa1', fullName: 'Cliente WA', phone: '+56911112222', lastMessageType: 'TYPE_WHATSAPP' },
      ], msgs: {
        ig1: [{ id: 'i1', direction: 'inbound', messageType: 'TYPE_INSTAGRAM', body: 'Hola! vi el depa de Providencia en su historia, busco arrendar para mi familia, 2 dormitorios, hasta 800 lucas', dateAdded: t(50) },
          { id: 'i2', direction: 'outbound', messageType: 'TYPE_INSTAGRAM', body: 'Hola Valentina! Sí está disponible. ¿Me dejas tu celular?', dateAdded: t(45) },
          { id: 'i3', direction: 'inbound', messageType: 'TYPE_INSTAGRAM', body: 'Claro, +56 9 6543 2100', attachments: ['https://cdn.ig.test/foto.jpg'], dateAdded: t(40) }],
        em1: [{ id: 'e1', direction: 'inbound', messageType: 'TYPE_EMAIL', body: '<p>Buenas tardes, quiero comprar una casa en La Reina, presupuesto 9000 UF.</p><p>El lun, 20 oct 2026, Corredora escribió:</p><p>texto viejo</p>', meta: { email: { subject: 'Casa La Reina' } }, dateAdded: t(30) }],
        wa1: [],
      } };
    });
    await w.click('#nav [data-view="leads"]'); await w.waitForSelector('#ldCuentas');
    await w.click('#ldCuentas'); await w.waitForSelector('.ld-obs');
    ok(/Apagado/.test(await txt('#ldObs')) && /Instagram/.test(await txt('.ld-obs')) && /Correo/.test(await txt('.ld-obs')), 'panel «En vivo desde wechatia»: apagado, con sus canales');
    await w.click('#ldObsOn'); await w.waitForTimeout(300);
    ok(/autorización/.test(await txt('#ldObsErr')), 'no se activa sin la autorización de la corredora');
    await w.check('#ldObsAut'); await w.click('#ldObsOn'); await w.waitForFunction(() => /llegan solos/.test(document.querySelector('#ldObs')?.textContent || ''));
    ok(/llegan solos/.test(await txt('#ldObs')), 'queda activo (la tarjeta se reemplaza por el aviso de que llega solo)');
    await w.evaluate(() => window.pf.obsRevisar());
    await shot('ob0-panel.png');
    await w.click('#mCancel'); await w.waitForSelector('#ldItems .ld-it', { timeout: 10000 }); await w.waitForTimeout(500);
    const items = await txt('#ldItems');
    ok(/Valentina Paz/.test(items) && /Rodrigo Lagos/.test(items) && !/Cliente WA/.test(items), 'Instagram y correo quedan como leads; el WhatsApp no lo toma el observador');
    await w.click('#ldItems .ld-it:has-text("Valentina Paz")'); await w.waitForTimeout(800);
    const ch = await txt('#ldChB');
    ok(/Providencia/.test(ch) && (await w.$$('#ldChB .ld-m.in')).length === 2 && (await w.$$('#ldChB .ld-m.out')).length === 1 && /cdn\.ig\.test/.test(ch), 'el historial de Instagram con ambos lados y el adjunto');
    ok(/6543/.test(await w.inputValue('#ldFicha [data-k="telefono"]')) && await w.inputValue('#ldFicha [data-k="b_operacion"]') === 'arriendo' && /familia/.test(await txt('#ldFicha .ld-perfil')), 'la IA deja celular, qué busca y perfil');
    ok(/Solo lectura/.test(await txt('.ld-ch-h')) && /Instagram/.test(await txt('.ld-ch-h')), 'solo lectura, origen Instagram');
    await shot('ob1-lead-ig.png');
    await w.click('#ldItems .ld-it:has-text("Rodrigo Lagos")'); await w.waitForTimeout(800);
    const ce = await txt('#ldChB');
    ok(/Casa La Reina/.test(ce) && /9000 UF/.test(ce) && !/texto viejo/.test(ce), 'el correo: asunto y lo nuevo, sin lo citado');
    ok(await w.inputValue('#ldFicha [data-k="email"]') === 'rlagos@empresa.cl', 'el correo del contacto queda en la ficha');
    // un mensaje nuevo: se agrega solo eso
    await app.evaluate(() => { global.__waMock.msgs.ig1.push({ id: 'i4', direction: 'inbound', messageType: 'TYPE_INSTAGRAM', body: '¿Puedo verlo el sábado?', dateAdded: new Date().toISOString() }); });
    const r = (await w.evaluate(() => window.pf.obsRevisar())).data;
    ok(r.mensajes === 1 && r.nuevos === 0, 'en la siguiente revisión agrega solo el mensaje nuevo');
    // nunca se responde por Instagram ni correo, y Fernanda no toma esas conversaciones
    await w.evaluate(() => window.pf.waRevisar?.()).catch(() => {}); await w.waitForTimeout(800);
    const env = await app.evaluate(() => global.__waMock.enviados.map((e) => e.contactId));
    ok(!env.includes('c-ig1') && !env.includes('c-em1'), 'no se envió nada a Instagram ni al correo');
    ok(!errs.length, 'sin errores en la pantalla ' + errs.join(' | '));
    console.log('\nOK observador-e2e');
  } catch (e) { console.error(e.message); await shot('ob-error.png').catch(() => {}); process.exitCode = 1; }
  finally { await app.close(); }
})();
