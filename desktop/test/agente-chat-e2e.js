// El chat del Agente en React (src/ui/components/functional/agente): herramientas, confirmar y cancelar,
// enlaces, adjuntar el documento abierto, enviar a firmar y firma con certificado con datos protegidos.
// Es el núcleo de agente-e2e.js (que además prueba el Inicio antiguo, que ya no existe).
// Requiere el bundle compilado: yarn build:ui
// Agente Portalfirma: panel lateral con todas las herramientas del MCP (servidor y modelo simulados).
//  · Consultas sin confirmación; lo que cobra/envía pide confirmar; cancelar no ejecuta nada.
//  · Documento abierto → subir → extraer firmantes → enviar a firmar (con confirmación).
//  · Firma CDS: la clave y el código se escriben en campos protegidos y nunca llegan al modelo.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfag-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1' } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const txt = (s) => w.textContent(s).then((t) => t || '');
  const ultimo = () => w.$$eval('.ag-msg.bot', (x) => x.map((e) => e.textContent).pop() || '');
  const decir = async (t) => { const n = (await w.$$('.ag-msg.bot')).length; await w.fill('#agQ', t); await w.press('#agQ', 'Enter'); if (await w.isVisible('#mOk').catch(() => false)) await w.click('#mOk'); return n; };
  const respuesta = async (n) => { await w.waitForFunction((k) => document.querySelectorAll('.ag-msg.bot').length > k, n, { timeout: 15000 }); await w.waitForTimeout(150); return ultimo(); };
  try {
    await w.setViewportSize({ width: 1500, height: 920 });
    await w.waitForFunction(() => window.Agente && window.ReactUI, null, { timeout: 15000 }); await w.waitForTimeout(600);
    // la app parte con el Agente a pantalla completa; desde otra pantalla, el botón lo abre como panel lateral
    ok(!!(await w.$('#view-agente #agDrawer.ag-full')), 'la app parte con el Agente a pantalla completa');
    await w.click('#nav [data-view="cartera"]'); await w.waitForTimeout(300);
    ok(await w.isVisible('#agBtn') && !(await w.isVisible('#agDrawer')), 'al cambiar de pantalla el chat se cierra; queda el botón «Agente»');
    await w.click('#agBtn'); await w.waitForSelector('#agDrawer:not(.hidden) #agQ');
    ok(await w.isVisible('.ag-empty .ag-hola'), 'panel lateral: chat vacío con el saludo');
    await w.click('#agMas'); ok(await w.isVisible('#agQuick') && (await w.$$('#agQuick [data-rapida]')).length === 6, 'menú «Acciones» con las 6 acciones rápidas');
    await w.click('#agBody'); ok(!(await w.isVisible('#agQuick')), 'tocar fuera cierra el menú');

    let n = await decir('¿Cuál es mi saldo?'); let r = await respuesta(n);
    ok(/247\.424/.test(r) && /Saldo/.test(await txt('.ag-tool.ok')), 'consulta: usa la herramienta de saldo sin pedir confirmación');

    await w.click('#agMore'); await w.click('#agTools'); await w.waitForSelector('.ag-tl > div'); const nh = (await w.$$('.ag-tl > div')).length; ok(nh >= 13, `«Lo que puede hacer el Agente»: ${nh} herramientas (las 13 del MCP y las de Asset)`); await w.click('#agOk');

    n = await decir('Haz una recarga de saldo'); await w.waitForSelector('[data-conf]');
    ok(/Recargar saldo por \$10\.000/.test(await txt('[data-conf]')), 'recarga: pide confirmación con el detalle');
    await w.click('[data-conf] [data-no]'); r = await respuesta(n); ok(/no hice nada/.test(r), 'cancelar: no ejecuta la acción');
    n = await decir('Haz una recarga de saldo'); await w.waitForSelector('[data-conf]'); await w.click('[data-conf] [data-si]'); r = await respuesta(n);
    ok(await w.$('.ag-msg.bot a[data-url*="flow.cl"]') && /Pagar en Flow/.test(r), 'confirmar: entrega el enlace de pago de Flow');

    // documento abierto → subir → firmantes → enviar a firmar
    await w.evaluate((p) => window.editor.openPaths([p], true), path.join(__dirname, 'fixtures', 'contrato_prueba.pdf')); await w.waitForTimeout(1500);
    await w.click('#agClip'); await w.waitForSelector('#agDoc'); await w.click('#agDoc'); await w.waitForSelector('.ag-chip');
    ok(/contrato_prueba\.pdf/.test(await txt('#agAtt')), 'adjunta el documento abierto en el editor');
    n = await decir('Sube el documento, extrae los firmantes y envíalo a firmar'); await w.waitForSelector('[data-conf]', { timeout: 15000 });
    const conf = await txt('[data-conf]');
    ok(/Subir documento/.test(await txt('#agBody')) && /Extraer firmantes/.test(await txt('#agBody')), 'subió y extrajo firmantes sin preguntar');
    ok(/Enviar el documento a firmar/.test(conf) && /JUAN PEREZ SOTO \(prestador\)/.test(conf) && /MARIA GONZALEZ ROJAS/.test(conf), 'enviar a firmar: muestra firmantes en orden antes de confirmar');
    
    await w.click('[data-conf] [data-si]'); r = await respuesta(n); ok(/operación \d+/.test(r), 'operación creada tras confirmar');
    ok(/subido/.test(await txt('#agAtt')), 'el adjunto queda marcado como subido');

    // firma con certificado: datos protegidos
    n = await decir('Firma mis documentos pendientes con certificado cds'); await w.waitForSelector('[data-conf] input[data-sec="clave_certificado"]');
    ok(await w.getAttribute('[data-sec="clave_certificado"]', 'type') === 'password', 'la clave del certificado se pide en un campo protegido');
    await w.click('[data-conf] [data-si]'); ok(await w.isVisible('[data-conf] [data-si]'), 'no confirma sin la clave');
    await w.fill('[data-sec="clave_certificado"]', 'clave-demo'); await w.click('[data-conf] [data-si]');
    await w.waitForSelector('[data-conf] input[data-sec="segundo_factor"]', { timeout: 15000 });
    await w.fill('[data-conf] [data-sec="clave_certificado"]', 'clave-demo'); await w.fill('[data-sec="segundo_factor"]', '123456'); await w.click('[data-conf] [data-si]');
    r = await respuesta(n); ok(/signedCount/.test(r) || /Listo/.test(r), 'firma con certificado completada');
    const conv = await app.evaluate(() => JSON.stringify(global.__agente._estado().messages));
    ok(!/clave-demo|\b123456\b/.test(conv) && /••••/.test(conv), 'la clave y el código nunca llegan al modelo (y se tachan del resultado)');
    const logs = await app.evaluate(() => JSON.stringify(global.__agente.actividad()));
    ok(!/clave-demo|\b123456\b/.test(logs) && /Enviar el documento a firmar/.test(logs) && /Cancelado/.test(logs), 'registro de actividad sin datos sensibles');
    ok(!/JVBER/.test(conv), 'el contenido del PDF no pasa por el modelo');
    await w.click('#agMore'); await w.click('#agLog'); await w.waitForSelector('.ag-tl > div'); ok((await w.$$('.ag-tl > div')).length >= 5, 'pantalla de actividad'); await w.click('#agOk');
    

    // a pantalla completa y de vuelta al panel: el chat (React) sigue con la conversación
    const antes = (await w.$$('#agBody .ag-msg')).length;
    await w.click('#agFull'); await w.waitForSelector('#view-agente #agDrawer.ag-full');
    ok((await w.$$('#agBody .ag-msg')).length === antes, 'a pantalla completa conserva la conversación');
    await w.click('#nav [data-view="cartera"]'); await w.waitForTimeout(300);
    ok(!(await w.isVisible('#agDrawer')) && !(await w.$('#view-agente #agDrawer')), 'al cambiar de pantalla, el chat vuelve a ser panel (cerrado)');
    await w.click('#agBtn'); await w.waitForSelector('#agDrawer:not(.hidden)');
    ok((await w.$$('#agBody .ag-msg')).length === antes, 'y al abrirlo sigue la misma conversación');

    // nueva conversación
    await w.click('#agMore'); await w.click('#agReset'); await w.waitForSelector('.ag-empty');
    ok(true, '«Nueva conversación» deja el chat vacío');

    ok(errs.length === 0, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('agente-chat-e2e: todo bien');
  } finally { await app.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
