// 0.11 · Documento a medida: si no hay plantilla con ese nombre, Asset arma el PDF con los datos de la propiedad y la persona,
// lo sube a Portalfirma, lo envía a firmar y lo deja en la ficha de la propiedad y de la persona.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfdg-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfdg-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const txt = (s) => w.textContent(s).then((t) => (t || '').replace(/\s+/g, ' '));
  const shot = (n) => w.screenshot({ path: path.resolve(__dirname, n) });
  const llamadas = () => app.evaluate(() => (global.__pfCalls || []));
  try {
    await w.setViewportSize({ width: 1500, height: 980 });
    await w.waitForSelector('#view-agente .ag.ag-full', { timeout: 15000 });
    await w.evaluate(() => window.Inmo.importar()); await w.waitForSelector('text=Cartera actualizada', { timeout: 15000 }); await w.click('#mOk');
    await w.click('#nav [data-view="agente"]'); await w.waitForSelector('#view-agente .ag.ag-full');
    const ids = await w.evaluate(async () => { const d = (await window.pf.inmoListar()).data; const juan = d.personas.find((x) => /JUAN PEREZ/.test(x.nombre)); await window.pf.inmoPerGuardar({ ...juan, email: 'juan@correo.cl', telefono: '+56 9 8765 4321' });
      const p = d.propiedades.find((x) => x.codigo === 'CV-9002').id; const n = (await window.pf.negGuardar({ tipo: 'arriendo', propId: p, clienteId: juan.id })).data;
      await window.pf.assetEjecutar('asset_mover_negocio', { negocio: n.id, etapa: 'reserva' });
      return { p, c: juan.id, n: n.id }; });

    // 1. el agente busca la plantilla; no hay → ofrece crearla con Asset
    await w.fill('#agQ', 'necesito el comprobante de pago de la reserva de CV-9002'); await w.press('#agQ', 'Enter'); await w.waitForTimeout(300); if (await w.isVisible('#mOk').catch(() => false)) await w.click('#mOk');
    await w.waitForSelector('.ag-sig.sug2 button:has-text("Crear «Comprobante de pago de reserva» con Asset")', { timeout: 20000 });
    ok(true, 'pide el documento por su nombre: no hay plantilla y el agente ofrece «Crear… con Asset»');
    await w.click('.ag-sig.sug2 button:has-text("Crear «Comprobante de pago de reserva»")'); await w.waitForSelector('.ga-dn [data-texto]');
    await w.waitForFunction(() => /recibido de JUAN PEREZ SOTO/.test(document.querySelector('.ga-dn [data-texto]').value));
    const t0 = await w.inputValue('.ga-dn [data-texto]');
    ok(/Departamento en Providencia|Avenida Demo 450/.test(t0) && /código CV-9002/.test(t0) && /para su arriendo/.test(t0), 'el texto usa la propiedad (dirección, código, arriendo) y el cliente del negocio');
    ok(/JUAN PEREZ SOTO/.test(await w.inputValue('.ga-dnf[data-i="0"] [data-k="nombre"]')) && await w.inputValue('.ga-dnf[data-i="0"] [data-k="email"]') === 'juan@correo.cl', 'los firmantes vienen del CRM (cliente) y de tus datos (corredor)');
    await w.fill('.ga-dn [data-d="monto"]', '350000'); await w.fill('.ga-dn [data-d="comprobante"]', 'TRX-88123'); await w.fill('.ga-dn [data-d="banco"]', 'Banco Estado');
    await w.waitForFunction(() => /\$350\.000 \(trescientos cincuenta mil pesos\)/.test(document.querySelector('.ga-dn [data-texto]').value) && /TRX-88123/.test(document.querySelector('.ga-dn [data-texto]').value));
    ok(true, 'el texto se actualiza solo con los datos del pago (monto en palabras, comprobante, banco)');
    // corredor: completar sus datos
    for (const [k, v] of [['nombre', 'Corredora Demo SpA'], ['rut', '76.123.456-0'], ['email', 'pagos@corredora.cl'], ['telefono', '+56 9 1111 2222']]) await w.fill(`.ga-dnf[data-i="1"] [data-k="${k}"]`, v);
    await w.waitForFunction(() => /Corredora Demo SpA, RUT 76\.123\.456-0, declara haber recibido/.test(document.querySelector('.ga-dn [data-texto]').value));
    ok(/Todo completo/.test(await txt('.ga-dn .ga-foot .ga-falta')), 'con todo completo, queda listo');
    await w.click('.ga-dn [data-pdf]'); await w.waitForFunction(() => true); await w.waitForTimeout(1500);
    const ab = await app.evaluate(() => global.__abiertos || []); const borr = ab.find((x) => /\.pdf$/.test(x));
    ok(borr && fs.readFileSync(borr).slice(0, 5).toString() === '%PDF-' && fs.statSync(borr).size > 3000, '«Ver PDF» genera un PDF real de borrador');
    await shot('dg1-form.png');
    await w.click('.ga-dn [data-rev]'); await w.waitForSelector('.ga-dn .ga-conf [data-pag]');
    ok(await w.inputValue('.ga-dn [data-pag]') === 'pagos@corredora.cl' && /Juan|JUAN/.test(await txt('.ga-dn .ga-conf ul')), 'antes de enviar pide confirmación con firmantes y correo del pagador');
    await w.click('.ga-dn [data-send]'); await w.waitForSelector('.ga-res', { timeout: 20000 });
    const res = await txt('.ga-res'); const op = Number((res.match(/Operación (\d+)/) || [])[1]);
    ok(op > 0 && /Comprobante de pago de reserva/.test(res) && /Quedó ligado a la etapa «Reserva»/.test(res), `se sube a Portalfirma y se envía a firmar (operación ${op}), ligado a la etapa Reserva`);
    const data = await w.evaluate(() => window.pf.inmoListar().then((r) => r.data));
    const p = data.propiedades.find((x) => x.codigo === 'CV-9002'); const f = p.firmas[0];
    ok(f.operacion === op && f.origen === 'asset' && f.archivo && fs.existsSync(f.archivo) && f.datos.monto === '350000', 'queda guardado en la ficha de la propiedad, con su PDF');
    const neg = await w.evaluate((id) => window.pf.negObtener(id).then((r) => r.data), ids.n);
    ok(neg.firmas?.reserva?.operacion === op, 'el negocio queda esperando esa firma para avanzar');
    // 2. ficha de la persona: sus documentos
    await w.evaluate((id) => window.Inmo.abrirPersona(id), ids.c); await w.waitForSelector('#pDocs [data-doc]');
    ok(/Comprobante de pago de reserva/.test(await txt('#pDocs')) && /CV-9002/.test(await txt('#pDocs')) && (await w.$$('#pDocs [data-pdf]')).length === 1, 'en la ficha de Juan aparece el comprobante, con su PDF');
    await w.click('#pDocs [data-pdf]'); await w.waitForTimeout(300);
    ok((await app.evaluate(() => global.__abiertos)).includes(f.archivo), 'y se abre el PDF guardado');
    // 3. si hay una plantilla con ese nombre, se ofrece usarla (no crear)
    const b = await w.evaluate(() => window.pf.dgBuscar({ texto: 'orden de visita' }).then((r) => r.data));
    ok(b.coincide && /orden de visita/i.test(b.coincide.nombre), `si existe la plantilla («${b.coincide?.nombre}»), se usa esa`);
    // 4. documento que Asset no conoce: lo redacta la IA con los datos
    await w.click('#nav [data-view="agente"]'); await w.waitForSelector('#view-agente .ag.ag-full');
    await w.evaluate((p) => window.Gestion.docNuevo({ propId: p, titulo: 'Carta de desistimiento de reserva' }), ids.p); await w.waitForSelector('.ga-dn:last-of-type [data-ia]');
    await w.click('.ga-dn [data-ia]'); await w.waitForFunction(() => /Carta de desistimiento de reserva/.test([...document.querySelectorAll('.ga-dn [data-texto]')].pop().value));
    ok(/Avenida Demo 450/.test(await w.evaluate(() => [...document.querySelectorAll('.ga-dn [data-texto]')].pop().value)), 'un documento sin modelo lo redacta la IA con los datos de la propiedad y las personas');
    await shot('dg2-ia.png');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK docgen');
  } catch (er) { console.error(er.message); await shot('dg-error.png').catch(() => {}); process.exitCode = 1; } finally { await app.close(); }
})();
