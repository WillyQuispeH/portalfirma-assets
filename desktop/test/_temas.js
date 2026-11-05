// capturas en claro y oscuro (revisión visual)
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const OUT = process.env.SHOTS || __dirname;
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pftm-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pftm-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir, PF_START: 'inicio' } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const shot = (n) => w.screenshot({ path: path.join(OUT, n) });
  try {
    await w.setViewportSize({ width: 1440, height: 900 }); await w.waitForSelector('#view-inicio [data-cabecera]');
    await w.click('#view-inicio [data-do="importar"]'); await w.waitForSelector('text=Cartera actualizada', { timeout: 15000 }); await w.click('#mOk');
    await w.evaluate(async () => { const d = (await window.pf.inmoListar()).data; const hoy = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
      for (const [i, p] of d.propiedades.slice(0, 6).entries()) await window.pf.assetEjecutar('asset_crear_evento', { tipo: 'visita', fecha: hoy, hora: `1${i}:00`, propiedad: p.id }); });
    const modos = (process.env.TEMAS || 'light,dark').split(',');
    for (const t of modos) {
      await w.evaluate((x) => window.Tema.set(x), t); await w.waitForTimeout(300);
      await w.click('#nav [data-view="agente"]'); await w.waitForSelector('#view-agente .ag.ag-full'); await w.waitForTimeout(700); await shot(`${t}-1-agente.png`);
      if (t === 'light' && modos.length > 1) continue;
      for (const [v, n] of [['inicio', 2], ['cartera', 3], ['negocios', 4], ['agenda', 5], ['publicaciones', 6], ['home', 8]]) { await w.click(`#nav [data-view="${v}"]`); await w.waitForTimeout(800); await shot(`${t}-${n}-${v}.png`); }
      await w.evaluate(() => window.Postventa.abrir('asistente')); await w.waitForSelector('#asPrev .pv-chat'); await w.waitForTimeout(300); await shot(`${t}-7-postventa.png`);
      await w.click('#userBtn'); await w.waitForSelector('#umTema'); await w.waitForTimeout(300); await shot(`${t}-9-menu.png`); await w.click('#userBtn');
    }
    console.log(errs.length ? 'ERRORES: ' + errs.join(' | ') : 'OK capturas');
  } catch (e) { console.log('ERROR', e.message); await shot('tm-error.png'); } finally { await app.close(); }
})();
