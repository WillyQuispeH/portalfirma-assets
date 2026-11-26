// Configuración › Documentos (modo de prueba, tipos en memoria: src/tipos-documento-mock.js) y el autollenado al enviar a firmar:
//  · la lista con los tipos por defecto, agregar, editar (firma y trámite) y borrar con confirmación;
//  · un documento de un tipo reconocido llega con el tipo de firma y el trámite llenos (y por firmante), y se puede cambiar;
//  · uno de un tipo desconocido se envía como siempre y, al FINAL, pregunta «¿Guardas configuración por defecto?» (una sola vez).
// Requiere el bundle compilado: yarn build:ui
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
const FX = path.join(__dirname, 'fixtures');
(async () => {
  const raiz = path.join(__dirname, '..');
  if (!fs.existsSync(path.join(raiz, 'src/renderer/react/react-ui.js'))) throw new Error('Falta el bundle: corre «yarn build:ui» antes');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-tipos-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${path.join(tmp, 'ud')}`], cwd: raiz, env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: path.join(tmp, 'inmo'), PF_SAVE_DIR: tmp } });
  const w = await app.firstWindow(); const errs = [];
  w.on('pageerror', (e) => errs.push('PAGE: ' + e.message));
  const txt = (s) => w.innerText(s).then((t) => (t || '').replace(/\s+/g, ' '));
  const clave = () => w.getAttribute('#modalCard', 'data-clave');
  const tipos = () => w.evaluate(() => window.pf.tiposLista().then((r) => r.data.items));
  try {
    await w.setViewportSize({ width: 1500, height: 950 });
    await w.waitForFunction(() => window.ReactUI && window.Inmo && window.__envio, null, { timeout: 20000 }); await w.waitForTimeout(500);

    // ===== la pestaña
    await w.click('#userBtn'); await w.click('[data-um="config"]'); await w.waitForSelector('#view-integraciones:not(.hidden) #cfgTabs');
    await w.click('#cfgTabs [data-t="documentos"]'); await w.waitForSelector('#cfgDocumentos [data-tipo="carta-oferta"]');
    ok(/Carta oferta/.test(await txt('#cfgDocumentos')) && /Mandato de gestión de venta/.test(await txt('#cfgDocumentos')), 'la lista trae los tipos por defecto (carta oferta, mandatos…)');
    ok((await w.$$('#cfgDocumentos [data-tipo]')).length === 12, 'son 12, como en el servidor');
    ok(await w.getAttribute('[data-tipo="carta-oferta"]', 'data-firma') === 'simple', 'parten con firma simple y sin trámite');

    // ===== agregar
    await w.click('#tdAgregar'); await w.waitForSelector('#tdForm');
    ok(await clave() === 'modal-156', 'la ventana es modal-156');
    await w.click('#mOk'); ok(/Escribe el nombre/.test(await txt('#tdForm')), 'sin nombre no guarda');
    await w.fill('#tdNombre', 'Finiquito de arriendo'); await w.selectOption('#tdTipoFirma', 'visada', { force: true }); await w.selectOption('#tdTramite', 'legalization', { force: true });
    await w.fill('#tdPalabras', 'finiquito, termino de contrato');
    await w.click('#mOk'); await w.waitForSelector('#cfgDocumentos [data-tipo="finiquito-de-arriendo"]');
    ok(await w.getAttribute('[data-tipo="finiquito-de-arriendo"]', 'data-firma') === 'visada' && await w.getAttribute('[data-tipo="finiquito-de-arriendo"]', 'data-tramite') === 'legalization', 'queda con firma visada y legalización');
    ok(/con legalización/.test(await txt('[data-tipo="finiquito-de-arriendo"]')) && /finiquito/.test(await txt('[data-tipo="finiquito-de-arriendo"]')), 'la lista lo muestra con su trámite y sus otros nombres');

    // ===== editar y borrar
    await w.click('[data-tipo="finiquito-de-arriendo"]'); await w.waitForSelector('#tdForm');
    ok(await w.inputValue('#tdNombre') === 'Finiquito de arriendo' && await w.inputValue('#tdTipoFirma') === 'visada', 'al editar, trae sus valores');
    await w.selectOption('#tdTipoFirma', 'avanzada', { force: true }); await w.selectOption('#tdTramite', 'none', { force: true }); await w.click('#mOk');
    await w.waitForFunction(() => document.querySelector('[data-tipo="finiquito-de-arriendo"]')?.getAttribute('data-firma') === 'avanzada');
    ok(await w.getAttribute('[data-tipo="finiquito-de-arriendo"]', 'data-tramite') === 'none', 'editar cambia la firma y el trámite');
    await w.click('[data-tipo="finiquito-de-arriendo"]'); await w.waitForSelector('#tdBorrar'); await w.click('#tdBorrar');
    await w.waitForSelector('#modal:not(.hidden) #mOk'); ok(await clave() === 'modal-158' && /Borrar/.test(await txt('#modalCard')), 'borrar pide confirmación (modal-158)');
    await w.click('#mOk'); await w.waitForFunction(() => !document.querySelector('[data-tipo="finiquito-de-arriendo"]'));
    ok(!(await tipos()).some((t) => t.id === 'finiquito-de-arriendo'), 'borrado');

    // ===== un documento de un tipo reconocido llega con la firma y el trámite llenos
    await app.evaluate(() => { globalThis.__tipoConocido = { id: 'carta-oferta', nombre: 'Carta oferta', tipoFirma: 'visada', tramite: 'legalization' }; });
    const llenar = async () => {
      const n = await w.$$eval('#signers .signer', (x) => x.length);
      for (let i = 0; i < n; i++) for (const [k, v] of [['fullName', `Persona ${i + 1}`], ['rut', ['11.111.111-1', '22.222.222-2', '33.333.333-3'][i % 3]], ['alias', ['oferente', 'propietario', 'aval'][i % 3]], ['email', `p${i}@correo.cl`], ['phone', '912345678']]) {
        const s = `input[data-i="${i}"][data-k="${k}"]`; await w.fill(s, v); await w.locator(s).blur();
      }
    };
    await w.evaluate(() => window.show('drop')); await w.waitForSelector('#dropzone:visible');
    await w.evaluate((f) => startAnalysis({ name: 'carta_oferta.pdf', size: 2000, path: f }), path.join(FX, 'contrato_prueba.pdf'));
    await w.waitForSelector('#view-review:visible', { timeout: 20000 });
    ok(/Carta oferta/.test(await txt('#tipoConocido')), 'revisar: avisa que es una «Carta oferta»');
    ok(await w.inputValue('#tipoFirmaDoc') === 'visada' && await w.inputValue('#protocolization') === 'legalization', 'la firma (visada) y el trámite (legalización) vienen llenos');
    ok((await w.$$eval('#signers select[data-k="typeSign"]', (s) => s.map((x) => x.value))).every((v) => v === 'visada'), 'y cada firmante hereda la firma del documento');
    await w.selectOption('#tipoFirmaDoc', 'simple', { force: true });
    ok((await w.$$eval('#signers select[data-k="typeSign"]', (s) => s.map((x) => x.value))).every((v) => v === 'simple'), 'se puede cambiar a mano y los firmantes siguen');
    await w.selectOption('#tipoFirmaDoc', 'visada', { force: true });
    await llenar(); await w.click('#sendBtn'); await w.waitForSelector('#modal:not(.hidden) #mOk');
    ok(/Visada/.test(await txt('#modalCard')) && /Legalización/.test(await txt('#modalCard')), 'la confirmación muestra firma visada y legalización');
    await w.click('#mOk'); await w.waitForSelector('#view-done:visible', { timeout: 20000 }); await w.waitForTimeout(600);
    ok(await clave() !== 'modal-157', 'un tipo reconocido no pregunta si se guarda la configuración');
    const enviado = await app.evaluate(() => (globalThis.__llamadasIntegracion || []).filter((l) => l.ruta === '/firmas-envio/pdf').at(-1));
    ok(enviado.cuerpo.tramite === 'legalization' && enviado.cuerpo.firmantes.every((f) => f.tipoFirma === 'visada'), 'se envió con firma visada y legalización');

    // ===== un documento de un tipo desconocido: se envía como siempre y, al final, pregunta una vez
    await app.evaluate(() => { globalThis.__tipoConocido = null; });
    await w.click('#newDocBtn'); await w.waitForSelector('#dropzone:visible');
    await w.evaluate((f) => startAnalysis({ name: 'contrato_servicios.pdf', size: 2000, path: f }), path.join(FX, 'contrato_prueba.pdf'));
    await w.waitForSelector('#view-review:visible', { timeout: 20000 });
    ok(!(await w.$('#tipoConocido')) && await w.inputValue('#tipoFirmaDoc') === 'avanzada' && await w.inputValue('#protocolization') === 'none', 'sin tipo reconocido: firma avanzada y sin trámite, como siempre');
    await llenar(); await w.click('#sendBtn'); await w.waitForSelector('#modal:not(.hidden) #mOk'); await w.click('#mOk');
    await w.waitForSelector('#view-done:visible', { timeout: 20000 });
    await w.waitForFunction(() => document.getElementById('modalCard')?.dataset.clave === 'modal-157', null, { timeout: 8000 });
    ok(/Guardas configuración por defecto/.test(await txt('#modalCard')) && /Contrato de prestación de servicios/.test(await txt('#tdPregunta, #modalCard')), 'al final pregunta «¿Guardas configuración por defecto?»');
    await w.click('#mOk'); await w.waitForFunction(() => document.getElementById('modal')?.classList.contains('hidden'), null, { timeout: 8000 });
    const nuevo = (await tipos()).find((t) => /Contrato de prestación de servicios/.test(t.nombre));
    ok(nuevo && nuevo.tipoFirma === 'avanzada' && nuevo.tramite === 'none', 'guardar deja el tipo con la firma y el trámite que se usaron');

    // ===== el mismo tipo, ahora reconocido
    await app.evaluate(() => { globalThis.__tipoConocido = null; });
    await w.click('#newDocBtn'); await w.waitForSelector('#dropzone:visible');
    await w.evaluate((f) => startAnalysis({ name: 'otro.pdf', size: 2000, path: f }), path.join(FX, 'contrato_prueba.pdf'));
    await w.waitForSelector('#view-review:visible', { timeout: 20000 });
    await llenar(); await w.click('#sendBtn'); await w.waitForSelector('#modal:not(.hidden) #mOk'); await w.click('#mOk');
    await w.waitForSelector('#view-done:visible', { timeout: 20000 }); await w.waitForTimeout(800);
    ok(await clave() !== 'modal-157', 'si dice que no (o ya lo preguntó), no insiste con el mismo tipo en la sesión');

    ok(errs.length === 0, 'sin errores en la consola: ' + errs.slice(0, 3).join(' | '));
    console.log('OK');
  } catch (e) { await w.screenshot({ path: path.resolve(__dirname, 'documentos-tipos-error.png') }).catch(() => {}); console.error(e.message, errs.slice(0, 3)); process.exitCode = 1; } finally { await app.close(); }
})();
