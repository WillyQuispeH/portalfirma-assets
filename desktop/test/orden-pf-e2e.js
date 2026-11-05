// Orden de visita con la plantilla real de Portalfirma (13/10/2026: requires_property y grupo «propiedad» con
// código, comuna, corredor, dirección, dormitorios, imagen, precio y tipo). Si la propiedad no está asignada al
// usuario en Portalfirma, se pide el formulario sin ella y se llena con la ficha de Asset.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'pfor-'))}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'pfor-db-')), PF_START: 'inicio' } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const man = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const orden = (cod) => w.evaluate(async ([c, f]) => { const d = (await window.pf.inmoListar()).data; const p = d.propiedades.find((x) => x.codigo === c); const juan = d.personas.find((x) => x.rut === '11.111.111-1');
    const pre = await window.pf.assetPreparar('asset_orden_visita', { propiedad: p.id, visitante: juan.id, fecha: f, hora: '10:00' }); if (!pre.ok) return { error: pre.error };
    const r = await window.pf.assetEjecutar('asset_orden_visita', { propiedad: p.id, visitante: juan.id, fecha: f, hora: '10:00' }); return { pre: pre.data, r: r.ok ? r.data : null, error: r.error }; }, [cod, man]);
  const ultima = () => app.evaluate(() => { const l = global.__pfMock._ordenes || []; return JSON.parse(JSON.stringify(l[l.length - 1] || null)); });
  try {
    await w.waitForSelector('#view-inicio [data-cabecera]'); await w.click('#view-inicio [data-do="importar"]'); await w.waitForSelector('text=Cartera actualizada', { timeout: 15000 }); await w.click('#mOk');
    let x = await orden('CV-9002');
    ok(x.r?.operacion && (await ultima()).property_id === '00000000-0000-4000-8000-000000000002' && !(await ultima()).values.codigo_propiedad_nosigner, 'propiedad asignada en Portalfirma: va con property_id y Portalfirma llena los datos de la propiedad');
    x = await orden('CV-9001'); const o = await ultima();
    ok(/no está asignada/.test(x.pre?.aviso || '') && x.r?.operacion, 'propiedad NO asignada al usuario: avisa y la genera igual con la ficha de Asset');
    ok(!o.property_id && o.values.codigo_propiedad_nosigner === 'CV-9001' && o.values.comuna_propiedad_nosigner === 'Colina' && o.values.dormitorios_propiedad_nosigner === '4' && /^https:\/\//.test(o.values.imagen_propiedad_nosigner) && o.values['corredor-nombre_propiedad_nosigner'] === 'Agente Demo' && /UF 18/.test(o.values['precio-venta_propiedad_nosigner']) && /casa/i.test(o.values.tipo_propiedad_nosigner), 'datos de la propiedad, foto y corredor completados desde la ficha');
    const fo = await w.evaluate(async () => { const d = (await window.pf.inmoListar()).data; const p = d.propiedades.find((x) => x.codigo === 'CV-9001'); return window.pf.docFormulario({ plantilla: '97262941-c079-49a0-9348-fd35bc63adaa', propId: p.id }); });
    ok(fo.ok && /no está asignada/.test(fo.data.aviso) && fo.data.grupos.some((g) => g.grupo === 'propiedad'), 'flujo «Generar un documento»: con la propiedad no asignada también arma el formulario (antes: «Portalfirma no devolvió el formulario»)');
    await w.evaluate(() => window.pf.inmoPropGuardar({ titulo: 'Depto sin fotos', tipo: 'departamento', arriendo: true, venta: false, precioArriendo: { valor: 500000, moneda: 'CLP' }, comuna: 'Ñuñoa', direccion: 'Calle 1', dormitorios: 1 }));
    x = await orden('PF-1001');
    ok(/faltan: .*una foto de la propiedad/.test(x.error || '') , `sin foto, el error dice exactamente qué falta: «${x.error}»`);
    ok(!errs.length, 'sin errores de JavaScript');
    console.log('OK orden pf');
  } catch (e) { console.error(e.message); process.exitCode = 1; } finally { await app.close(); }
})();
