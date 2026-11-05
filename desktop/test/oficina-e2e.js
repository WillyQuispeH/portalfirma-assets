// 0.16 · «La oficina»: el inicio con el equipo (Pedro · Captación, Juanita · Documentos, Diego · Seguimiento,
// Fernanda · Leads) caminando por la oficina, con lo de hoy repartido entre ellos con datos reales, la sala de
// reuniones (firmas en curso), tu mesa (pedir algo), la luz según la hora y la vuelta a la vista «Hoy».
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfof-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfof-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir, PF_NO_TOURS: '1', PF_OFICINA: '1' } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const txt = (s) => w.textContent(s).then((t) => (t || '').replace(/\s+/g, ' '));
  const shot = (n) => w.screenshot({ path: path.resolve(__dirname, n) });
  const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
  try {
    await w.setViewportSize({ width: 1480, height: 960 });
    await w.waitForSelector('#view-agente .ag.ag-full', { timeout: 15000 });
    await w.evaluate(() => window.Inmo.importar()); await w.waitForSelector('text=Cartera actualizada', { timeout: 15000 }); await w.click('#mOk');
    const d = await call('inmoListar'); const pA = d.propiedades.find((p) => p.arriendo); const pV = d.propiedades.find((p) => p.venta && p.id !== pA.id);
    const c = await call('inmoPerGuardar', { nombre: 'Carla Ruiz', rut: '7.654.321-6', roles: ['interesado'] });
    await call('negGuardar', { tipo: 'arriendo', propId: pA.id, clienteId: c.id });
    const n2 = await call('negGuardar', { tipo: 'venta', propId: pV.id, clienteId: c.id });
    await call('etMarcar', { negocioId: n2.id, paso: 'visita', estado: 'fail', d: 'Carla canceló la visita.' });
    await w.click('#nav [data-view="inicio"]'); await w.waitForSelector('#view-inicio .of .of-escena');
    ok((await w.$$('.of-pj')).length === 4 && /Pedro/.test(await txt('.of-dock')) && /Juanita/.test(await txt('.of-dock')) && /Diego/.test(await txt('.of-dock')) && /Fernanda/.test(await txt('.of-dock')), 'el inicio es la oficina: Pedro, Juanita, Diego y Fernanda, con la barra del equipo');
    const p1 = await w.evaluate(() => window.OfLienzo.estado('fernanda')); await w.waitForTimeout(1200); const p2 = await w.evaluate(() => window.OfLienzo.estado('fernanda'));
    ok(await w.$('.of-escena canvas.of-lienzo') && p2.tl > p1.tl, 'los personajes caminan por la oficina (se dibujan en un canvas con su propio reloj)');
    ok(/Buenas|Buenos/.test(await txt('.of-cab')) && /Te toca hoy · \d+/.test(await txt('#ofToca')) && !(await w.$('.of-toca')), 'arriba solo el saludo y «Te toca hoy · N» (minimizado)');
    const g = await txt('.of-pj-diego .of-globo');
    ok(/No logrado/i.test(g) && /Visita agendada/.test(g), 'Diego muestra en una nube lo no logrado (la visita cancelada)');
    await w.click('#ofToca'); await w.waitForSelector('.of-toca'); ok((await w.$$('.of-toca')).length >= 2, 'al desplegar «Te toca hoy» aparece la lista, lo urgente primero');
    await shot('of1-oficina.png');
    await w.click('.of-toca >> nth=0'); await w.waitForSelector('.of-panel');
    const pd = await txt('.of-panel');
    ok(/Diego/.test(pd) && /Seguimiento/.test(pd) && /Reprogramar/.test(pd) && /canceló la visita/.test(pd), 'tocar un pendiente abre a quien le toca (Diego) con su lista real y la acción «Reprogramar»');
    ok(await w.evaluate(() => document.querySelector('.of-pj-diego').classList.contains('sel') && window.OfLienzo.pausado('diego')), 'el personaje elegido se detiene y se ilumina');
    await w.waitForTimeout(600); ok(await w.$('.of-panel'), 'el panel sigue abierto'); await shot('of2-diego.png');
    await w.click('.of-panel button:has-text("Reprogramar")'); await w.waitForSelector('#rpF'); ok(true, '«Reprogramar» abre su ventana, sin pasar por el Agente'); await w.click('#mCancel');
    // escritorios clicables: el de Pedro
    await w.$eval('[data-esc="pedro"]', (b) => b.click()); await w.waitForFunction(() => /Pedro/.test(document.querySelector('.of-panel')?.textContent || ''));
    ok(/Captación/.test(await txt('.of-panel')) && /Ver la cartera/.test(await txt('.of-panel')), 'el escritorio de Pedro abre su panel (Captación)');
    // la sala de reuniones y tu mesa
    await w.$eval('[data-esc="sala"]', (b) => b.click()); await w.waitForFunction(() => /Firmas en curso/.test(document.querySelector('.of-panel')?.textContent || ''));
    ok(true, 'la sala de reuniones muestra las firmas en curso');
    await w.click('.of-dock [data-p="yo"]'); await w.waitForSelector('#ofPide'); ok(/Tu mesa/.test(await txt('.of-panel')), '«Pedir algo» abre tu mesa para pedirle algo al Agente');
    await w.click('#ofCerrar'); await w.waitForSelector('.of-panel', { state: 'detached' }); ok(true, 'el panel se cierra y la oficina queda despejada');
    // la luz
    await w.click('[data-luz="noche"]'); ok(/fondo_noche\.jpg/.test(await w.getAttribute('.of-fondo', 'src')) && await w.$('.of.l-noche'), 'la luz cambia a noche');
    await shot('of3-noche.png');
    await w.click('[data-luz="dia"]');
    // WhatsApp: cómo hablarle a cada uno
    await w.click('.of-dock [data-p="fernanda"]'); await w.waitForSelector('.of-panel'); ok(/Leads/.test(await txt('.of-panel')) && /WhatsApp/.test(await txt('.of-panel')), 'Fernanda (Leads) explica cómo hablarle por WhatsApp');
    // vista lista y vuelta a la oficina
    await w.click('#ofClasica'); await w.waitForSelector('#view-inicio .hoy'); ok(true, '«Vista lista» vuelve a la pantalla «Hoy» de siempre');
    await w.click('#hoyOficina'); await w.waitForSelector('#view-inicio .of'); ok(true, 'y «Ver la oficina» vuelve a la oficina');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK oficina');
  } catch (er) { console.error(er.message); await shot('of-error.png').catch(() => {}); process.exitCode = 1; } finally { await app.close(); }
})();
