// 0.7 · Asset con el Agente al centro: abre en el chat, conversaciones guardadas a la izquierda, lienzo en vivo a la derecha,
// botones fijos (Agendar nunca genera documentos) y «Siguiente paso» después de cada acción.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfch-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfch-db-'));
  const launch = () => electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir } });
  let app = await launch(); let w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const txt = (s) => w.textContent(s).then((t) => t || '');
  const shot = (n) => w.screenshot({ path: path.resolve(__dirname, n) });
  const lz = () => txt('#agCanvas');
  const ultimoBot = () => w.$$eval('.ag-msg.bot', (x) => x.map((e) => e.textContent).pop() || '');
  try {
    await w.setViewportSize({ width: 1500, height: 920 });
    await w.waitForSelector('#view-agente .ag.ag-full', { timeout: 15000 });
    ok(await w.isVisible('#agSide') && !(await w.isVisible('#agCanvas')), 'con sesión, Asset abre en el Agente: conversaciones y chat, sin lienzo en la portada');
    await w.evaluate(() => window.Inmo.importar()); await w.waitForSelector('text=Cartera actualizada', { timeout: 15000 }); await w.click('#mOk');
    await w.click('#nav [data-view="agente"]'); await w.waitForSelector('#view-agente .ag.ag-full'); await w.waitForTimeout(500);

    // Agendar: tarjeta fija, nunca un documento
    await w.click('#agMas'); await w.click('[data-rapida="visita"]'); await w.waitForSelector('.ga-agd [data-ok]');
    await w.selectOption('.ga-agd [data-f="prop"]', { label: 'CV-9002 · Departamento en Providencia' });
    await w.selectOption('.ga-agd [data-f="per"]', { label: 'JUAN PEREZ SOTO · 11.111.111-1' }); await w.fill('.ga-agd [data-f="hora"]', '11:30');
    await shot('ch1-agendar.png');
    await w.click('.ga-agd [data-ok]'); await w.waitForSelector('.ga.hecha:has-text("agendada")');
    const ord = await app.evaluate(() => (global.__pfMock._ordenes || []).length);
    ok(ord === 0 && /Visita agendada/.test(await txt('.ag-body')), 'Agendar una visita solo agenda (no se generó ningún documento)');
    await w.waitForSelector('.ga-est'); await w.waitForFunction(() => /11:30/.test(document.querySelector('#agCanvas')?.textContent || ''));
    ok(/CV-9002/.test(await lz()) && /11:30/.test(await txt('.ga-est')), 'tras agendar vuelve al flujo de la propiedad: la visita aparece en su estado y en el lienzo');
    ok(/Orden de visita para el/.test(await txt('.ga-est .ga-sugs')), 'propone el siguiente paso: generar la orden de visita');
    await shot('ch2-agendada.png');
    await w.click('.ga-est .ga-sugs button:has-text("Orden de visita")'); await w.waitForSelector('text=Generar y enviar a firmar'); await w.click('#mOk');
    await w.waitForFunction(() => /Operación \d+/.test(document.querySelector('#agCanvas')?.textContent || ''), null, { timeout: 15000 });
    ok((await app.evaluate(() => (global.__pfMock._ordenes || []).length)) === 1 && /firmaron/.test(await lz()), 'la orden sale solo al pedirla, y el lienzo pasa al seguimiento de la firma');

    // Por chat: crear un negocio no saca al usuario del chat; el lienzo lo muestra al instante
    await w.fill('#agQ', 'Crea un negocio de arriendo de CV-9002 con Juan'); await w.press('#agQ', 'Enter'); await w.waitForTimeout(250); if (await w.isVisible('#mOk').catch(() => false)) await w.click('#mOk');
    await w.waitForFunction(() => /Negocio de arriendo creado/.test([...document.querySelectorAll('.ag-msg.bot')].pop()?.textContent || ''), null, { timeout: 15000 });
    await w.waitForFunction(() => /Etapa \d de \d/.test(document.querySelector('#agCanvas')?.textContent || ''));
    ok(await w.isVisible('#view-agente') && /Negocio de arriendo/.test(await lz()), 'el negocio aparece de inmediato en el lienzo, sin salir del chat');
    await w.waitForFunction(() => /Agendar una visita/.test([...document.querySelectorAll('.ag-sig')].pop()?.textContent || ''), null, { timeout: 10000 }); ok(true, 'siguiente paso tras crear el negocio');
    await shot('ch3-negocio.png');
    const etapa0 = await w.$eval('.lz-steps li.ahora b', (e) => e.textContent);
    await w.click('[data-lz="avanzar"]'); await w.waitForFunction((e0) => document.querySelector('.lz-steps li.ahora b')?.textContent !== e0, etapa0, { timeout: 10000 });
    ok(/Negocio en «/.test(await ultimoBot()), `un toque en el lienzo mueve el negocio (${etapa0} → ${await w.$eval('.lz-steps li.ahora b', (e) => e.textContent)})`);
    await w.click('#nav [data-view="negocios"]'); await w.waitForSelector('.ng-board'); ok(/Arriendos 1/.test((await w.innerText('#ngTipo')).replace(/\s+/g, ' ')) && (await w.$$('.ng-card')).length === 1, 'el tablero de Negocios ya lo tiene, en su pestaña');
    await w.click('#nav [data-view="agente"]'); await w.waitForSelector('#view-agente .ag.ag-full');

    // Conversaciones
    await w.waitForSelector('.ag-ci'); ok(/Agendar una visita/.test(await txt('#agConvs')), 'la conversación queda guardada a la izquierda con un título automático');
    await w.hover('.ag-ci'); await w.click('.ag-ci [data-ren]'); await w.fill('#cvN', 'Depto Providencia · Juan'); await w.click('#mOk');
    await w.waitForSelector('.ag-ci:has-text("Depto Providencia · Juan")'); ok(true, 'cambiar nombre');
    await w.click('#agNewC'); await w.waitForSelector('.ag-hola'); ok(/Tu día/.test(await lz()), 'nueva conversación: chat limpio y lienzo en «Tu día»');
    await w.fill('#agQ', '¿Qué tengo hoy?'); await w.press('#agQ', 'Enter'); await w.waitForFunction(() => /negocios abiertos/.test([...document.querySelectorAll('.ag-msg.bot')].pop()?.textContent || ''), null, { timeout: 15000 });
    await w.waitForFunction(() => document.querySelectorAll('.ag-ci').length === 2); ok(true, 'dos conversaciones');
    await shot('ch4-conversaciones.png');
    await w.click('.ag-ci:has-text("Depto Providencia") [data-abrir]'); await w.waitForSelector('.ga.hecha:has-text("agendada")');
    ok(/Negocio de arriendo creado/.test(await txt('.ag-body')) && /Negocio de arriendo/.test(await lz()), 'al abrir una conversación vuelven sus mensajes y su lienzo');
    await w.fill('#agConvQ', 'qué tengo'); await w.waitForFunction(() => document.querySelectorAll('.ag-ci').length === 1); ok(true, 'buscar conversaciones'); await w.fill('#agConvQ', ''); await w.waitForFunction(() => document.querySelectorAll('.ag-ci').length === 2);
    await w.hover('.ag-ci:has-text("Qué tengo")'); await w.click('.ag-ci:has-text("Qué tengo") [data-del]'); await w.click('#mOk');
    await w.waitForFunction(() => document.querySelectorAll('.ag-ci').length === 1); ok(true, 'eliminar una conversación');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    await app.close();
    app = await launch(); w = await app.firstWindow(); await w.setViewportSize({ width: 1500, height: 920 }); await w.waitForSelector('.ag-ci', { timeout: 15000 });
    ok(/Depto Providencia · Juan/.test(await txt('#agConvs')), 'las conversaciones siguen ahí al volver a abrir Asset');
    console.log('OK chat');
  } catch (e) { console.error(e.message); await shot('ch-error.png').catch(() => {}); process.exitCode = 1; } finally { await app.close().catch(() => {}); }
})();
