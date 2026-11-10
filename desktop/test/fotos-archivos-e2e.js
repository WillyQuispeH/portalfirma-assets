// Ficha › «Subir fotos»: fotos desde este computador (se pasan a JPG de hasta 2048 px y quedan en la galería), una que no
// es imagen se informa, y la misma foto no se carga dos veces. PF_MOCK (las fotos quedan en este computador).
// El diálogo de archivos se reemplaza desde el proceso principal. Requiere el bundle compilado (yarn dev o yarn build:ui).
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };

(async () => {
  const raiz = path.join(__dirname, '..');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-fotos-'));
  const foto = path.join(raiz, 'src/renderer/img/inicio-propiedades.jpg');
  const noFoto = path.join(tmp, 'notas.jpg'); fs.writeFileSync(noFoto, 'esto no es una imagen');
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${path.join(tmp, 'ud')}`], cwd: raiz, env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: path.join(tmp, 'inmo') } });
  const w = await app.firstWindow(); const errs = [];
  w.on('pageerror', (e) => errs.push(e.message));
  const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
  const elegir = (archivos) => app.evaluate(({ dialog }, l) => { dialog.showOpenDialog = async () => ({ canceled: !l.length, filePaths: l }); }, archivos);
  const fotosDe = async (id) => ((await call('inmoFicha', id)) || {}).fotos || ((await call('inmoFicha', id))?.prop || {}).fotos || [];
  try {
    await w.setViewportSize({ width: 1500, height: 950 });
    await w.waitForFunction(() => window.Inmo && window.ReactUI, null, { timeout: 15000 }); await w.waitForTimeout(500);
    const p = await call('inmoPropGuardar', { titulo: 'Depto Ñuñoa', tipo: 'departamento', venta: true, precioVenta: { valor: 6900, moneda: 'UF' }, direccion: 'Irarrázaval 3450', unidad: '804', comuna: 'Ñuñoa' });

    await w.click('#nav [data-view="cartera"]'); await w.waitForSelector('#view-cartera:not(.hidden) #imQ');
    await w.click(`.im-card[data-id="${p.id}"]`); await w.waitForSelector('#view-cartera .im-ficha #fSubir');
    ok(await w.isVisible('#fDrive'), 'la ficha tiene «Subir fotos» y «Desde Drive»');

    await elegir([foto, noFoto]);
    await w.click('#fSubir');
    await w.waitForFunction(() => /fotos? cargadas?/.test(document.body.innerText), null, { timeout: 20000 });
    const f1 = await fotosDe(p.id);
    ok(f1.length === 1 && /^pffoto:\/\//.test(f1[0]), `queda una foto en la galería (${f1[0]})`);
    ok(/1 foto cargada \(la propiedad tiene 1\)\. 1 sin cargar: notas\.jpg \(no es una imagen legible\)/.test(await w.innerText('body')), 'avisa la que no es imagen');
    const archivo = path.join(tmp, 'inmo', 'fotos', p.id, decodeURIComponent(f1[0].split('/').pop()));
    ok(fs.existsSync(archivo) && fs.readFileSync(archivo).slice(0, 2).toString('hex') === 'ffd8', 'se guardó como JPG');
    await w.waitForSelector('#view-cartera .im-ficha .im-gmain img');
    ok(true, 'la ficha muestra la foto');

    await elegir([foto]);
    await w.click('#fSubir'); await w.waitForTimeout(1500);
    ok((await fotosDe(p.id)).length === 1, 'la misma foto no se carga dos veces');

    await elegir([]);
    await w.click('#fSubir'); await w.waitForTimeout(800);
    ok((await fotosDe(p.id)).length === 1, 'si cancela, no pasa nada');
    ok(!errs.length, 'sin errores en la ventana' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('fotos-archivos-e2e: OK');
  } finally { await app.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
