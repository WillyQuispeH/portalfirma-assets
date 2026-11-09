// 0.9.4 · Visualización más ordenada: Actividad en su propia pantalla, «Lo último» con 3 a la vista, historial plegable,
// negocios por cliente con sus etapas, «¿Qué sigue?» guiado y la vista que baja sola a la tarjeta nueva.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfvs-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfvs-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir, PF_START: 'inicio' } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const txt = (s) => w.textContent(s).then((t) => (t || '').replace(/\s+/g, ' '));
  const shot = (n) => w.screenshot({ path: path.resolve(__dirname, n) });
  try {
    await w.setViewportSize({ width: 1500, height: 940 }); await w.waitForSelector('#view-inicio [data-cabecera]');
    await w.click('#view-inicio [data-do="importar"]'); await w.waitForSelector('text=Cartera actualizada', { timeout: 15000 }); await w.click('#mOk');
    const ids = await w.evaluate(async () => { const d = (await window.pf.inmoListar()).data; const p = d.propiedades.find((x) => x.codigo === 'CV-9002').id; const ana = (await window.pf.inmoPerGuardar({ nombre: 'ANA ROJAS VERA', rut: '12.345.678-5', telefono: '+56 9 5555 1111' })).data; const ps = [d.personas.find((x) => /JUAN PEREZ/.test(x.nombre)), ana];
      const n1 = (await window.pf.negGuardar({ tipo: 'arriendo', propId: p, clienteId: ps[0].id })).data; const n2 = (await window.pf.negGuardar({ tipo: 'arriendo', propId: p, clienteId: ps[1].id })).data;
      for (let i = 0; i < 6; i++) await window.pf.inmoNota(p, 'Nota de prueba ' + (i + 1));
      await window.pf.assetEjecutar('asset_crear_evento', { tipo: 'visita', fecha: '2037-10-22', hora: '11:00', propiedad: p, personas: [ps[0].id], negocio: n1.id });
      return { p, n1: n1.id, n2: n2.id }; });

    // 1. «Hoy» → pantalla Actividad
    await w.evaluate(() => window.Hoy.abrir()); await w.waitForSelector('#hoyNuevo');
    await w.click('#view-inicio [data-cabecera] button[aria-label="Más acciones"]'); await w.waitForSelector('#hoyActividad'); await w.click('#hoyActividad'); await w.waitForSelector('#view-actividad .ac-it');
    ok(await w.isVisible('#view-actividad') && /Hoy/.test(await txt('.ac-dia')) && (await w.$$('.ac-it')).length >= 8, `pantalla Actividad propia, agrupada por día (${await txt('#acCont')})`);
    await w.click('#acCl [data-c="negocio"]'); await w.waitForFunction(() => [...document.querySelectorAll('.ac-it')].every((x) => x.dataset.clase === 'negocio'));
    ok((await w.$$('.ac-it')).length >= 2, 'filtra por negocios');
    await w.click('#acCl [data-c=""]'); await w.fill('#acQ', 'prueba 3'); await w.waitForFunction(() => document.querySelectorAll('.ac-it').length === 1);
    ok(/Nota de prueba 3/.test(await txt('#acLista')), 'busca en la actividad');
    await shot('vs1-actividad.png');

    // 2. Agente: tarjeta con «Lo último» de 3 a la vista y negocios por cliente
    await w.click('#nav [data-view="agente"]'); await w.waitForSelector('#view-agente .ag.ag-full');
    for (let i = 0; i < 3; i++) { await w.fill('#agQ', 'CV-9002'); await w.press('#agQ', 'Enter'); await w.waitForFunction((n) => document.querySelectorAll('.ga-est').length === n, i + 1); }
    const h = await w.evaluate(() => { const u = [...document.querySelectorAll('.ga-hist.scroll')].pop(); return { alto: u.clientHeight, total: u.scrollHeight, items: u.children.length }; });
    ok(h.items > 3 && h.alto < 90 && h.total > h.alto, `«Lo último» muestra 3 y el resto con scroll (${h.items} en total)`);
    ok(await w.evaluate(() => [...document.querySelectorAll('.ga-est')].pop().querySelectorAll('.ga-ng .ga-pipe').length) === 2, 'cada cliente con sus etapas como puntos');
    const top = await w.evaluate(() => { const c = [...document.querySelectorAll('.ga-est')].pop(); const b = document.querySelector('#agBody'); return c.getBoundingClientRect().top - b.getBoundingClientRect().top; });
    ok(top > -60 && top < 200, `la vista baja sola a la tarjeta nueva (queda a ${Math.round(top)} px del borde)`);
    await shot('vs2-tarjeta.png');

    // 3. Lienzo: clientes, ¿Qué sigue?, historial plegable
    await w.evaluate((n) => { const b = [...document.querySelectorAll('.ga-est')].pop().querySelector(`[data-neg="${n}"]`); b.click(); }, ids.n1);
    await w.waitForSelector('#agCanvas .lz-clis .lz-cli.on'); await w.waitForSelector('#agCanvas .lz-guia');
    ok((await w.$$('#agCanvas .lz-cli')).length === 2, 'el lienzo lista los clientes; tocar uno muestra su estado');
    ok(/¿Cómo le fue/.test(await txt('#agCanvas .lz-guia')) && /22\/10 a las 11:00/.test(await txt('#agCanvas .lz-guia')), '«¿Qué sigue?» en Visita: la visita agendada y «¿Cómo le fue?»');
    ok(!(await w.getAttribute('#agCanvas .lz-det', 'open') !== null) && /Historial/.test(await txt('#agCanvas .lz-det summary')), 'el historial parte plegado (una línea con lo último)');
    await w.click('#agCanvas .lz-det summary'); await w.waitForSelector('#agCanvas .lz-det[open] .lz-hist li');
    ok(true, 'un clic lo abre');
    await shot('vs3-lienzo.png');
    await w.click('#agCanvas .lz-cli:not(.on)'); await w.waitForFunction(() => /Primer contacto/.test(document.querySelector('#agCanvas .lz-guia')?.textContent || ''));
    ok(true, 'el otro cliente (Interesado): «Lo natural es coordinar la visita»');
    await w.click('#agCanvas .lz-cli:not(.on)'); await w.waitForFunction(() => /¿Cómo le fue/.test(document.querySelector('#agCanvas .lz-guia')?.textContent || ''));
    await w.click('#agCanvas [data-lz="perdido"]'); await w.fill('#lzMot', 'No le gustó la ubicación'); await w.click('#lzConf [data-csi]');
    await w.waitForFunction(() => document.querySelectorAll('#agCanvas .lz-cli').length === 0);
    const n1 = await w.evaluate((id) => window.pf.negObtener(id).then((r) => r.data), ids.n1);
    ok(n1.estado === 'perdido' && /ubicación/.test(n1.motivoPerdida), '«No siguió» cierra el negocio con su motivo');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK vista');
  } catch (er) { console.error(er.message); await shot('vs-error.png').catch(() => {}); process.exitCode = 1; } finally { await app.close(); }
})();
