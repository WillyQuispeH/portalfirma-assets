// Agenda (React): días, filtros de rango y tipo, marcar hecho, reprogramar, cancelar,
// «Nuevo evento» y «Generar orden de visita» (formularios de src/renderer/agenda.js).
// Requiere el bundle compilado: yarn build:ui
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };

(async () => {
  const raiz = path.join(__dirname, '..');
  if (!fs.existsSync(path.join(raiz, 'src/renderer/react/react-ui.js'))) throw new Error('Falta el bundle: corre «yarn build:ui» antes');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-agenda-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${path.join(tmp, 'ud')}`], cwd: raiz, env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: path.join(tmp, 'inmo') } });
  const w = await app.firstWindow(); const errs = [];
  w.on('pageerror', (e) => errs.push(e.message)); w.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
  const txt = (s) => w.innerText(s).then((t) => (t || '').replace(/\s+/g, ' '));
  const n = () => w.$$eval('#view-agenda .ag-ev', (x) => x.length);
  const dia = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10); // igual que la app
  const abrir = async () => { await w.click('#nav [data-view="agenda"]'); await w.waitForSelector('#view-agenda #agNew'); await w.waitForTimeout(300); };
  try {
    await w.setViewportSize({ width: 1500, height: 950 });
    await w.waitForSelector('#view-agenda', { state: 'attached', timeout: 15000 });
    await w.waitForSelector('#view-agente .ag.ag-full', { timeout: 15000 });

    await abrir();
    ok(/No hay eventos en este rango/.test(await txt('#view-agenda')), 'sin eventos lo dice');
    ok(await w.evaluate(() => document.querySelector('#nav [data-view="agenda"]').classList.contains('active')), 'la pestaña queda marcada');
    for (const s of ['#agNew', '#agAsk', '#agRango', '#agTipo']) ok(!!(await w.$(s)), `existe ${s} (lo usa el recorrido de Aprende)`);

    const per = await call('inmoPerGuardar', { nombre: 'María González', rut: '22.222.222-2', email: 'maria@correo.cl', telefono: '+56911112222', roles: ['interesado'] });
    const prop = await call('inmoPropGuardar', { titulo: 'Parcela en Pirque', tipo: 'parcela', venta: true, direccion: 'Camino 1', comuna: 'Pirque' });
    const visita = await call('agendaCrear', { tipo: 'visita', fecha: dia(0), hora: '11:00', propId: prop.id, personaIds: [per.id], titulo: 'Visita parcela' });
    const llamada = await call('agendaCrear', { tipo: 'llamada', fecha: dia(1), hora: '09:30', titulo: 'Llamar al banco' });
    const reunion = await call('agendaCrear', { tipo: 'reunion', fecha: dia(20), hora: '15:00', titulo: 'Reunión de equipo' });
    const tarea = await call('agendaCrear', { tipo: 'tarea', fecha: dia(2), hora: '10:00', titulo: 'Pedir certificado' });

    await w.click('#nav [data-view="cartera"]'); await abrir(); // se vuelve a montar con los datos nuevos
    ok(await n() === 3, 'próximos 14 días: 3 eventos (la reunión en 20 días queda fuera)');
    const dias = await w.$$eval('#view-agenda [data-dia] h3', (h) => h.map((x) => x.innerText));
    ok(/^Hoy · /i.test(dias[0]) && /^Mañana · /i.test(dias[1]), 'agrupa por día: «Hoy» y «Mañana»');
    ok(/CV-\d+|PF-\d+/.test(await txt(`[data-ev="${visita.id}"]`)) && /María González/.test(await txt(`[data-ev="${visita.id}"]`)), 'la visita muestra la propiedad y la persona');
    ok(!!(await w.$(`[data-ev="${visita.id}"] [data-orden]`)), 'la visita programada ofrece «Generar orden de visita»');

    await w.click('#agRango button:text("Todo")'); await w.waitForFunction(() => document.querySelectorAll('#view-agenda .ag-ev').length === 4);
    ok(true, 'rango «Todo»: aparece la reunión');
    await w.click('#agTipo button:text("Llamada")'); await w.waitForFunction(() => document.querySelectorAll('#view-agenda .ag-ev').length === 1);
    ok(/Llamar al banco/.test(await txt('#view-agenda .ag-ev')), 'filtro por tipo: solo la llamada');
    await w.click('#agTipo button:text("Todo")'); await w.click('#agRango button:text("Próximos 14 días")'); await w.waitForFunction(() => document.querySelectorAll('#view-agenda .ag-ev').length === 3);

    await w.click(`[data-hecho="${llamada.id}"]`); await w.waitForSelector(`[data-ev="${llamada.id}"] [data-estado="hecho"]`);
    ok((await call('agendaObtener', llamada.id)).estado === 'hecho', 'marcar como hecho lo guarda');

    await w.click(`[data-repro="${tarea.id}"]`); await w.waitForSelector(`[data-reprogramar="${tarea.id}"]`);
    await w.fill(`[data-reprogramar="${tarea.id}"] input[type="date"]`, dia(5)); await w.fill(`[data-reprogramar="${tarea.id}"] input[type="time"]`, '16:45');
    await w.click(`[data-reprogramar="${tarea.id}"] button:text("Guardar")`); await w.waitForSelector(`[data-reprogramar="${tarea.id}"]`, { state: 'detached' });
    const t2 = await call('agendaObtener', tarea.id);
    ok(t2.fecha === dia(5) && t2.hora === '16:45', 'reprogramar guarda la nueva fecha y hora');
    ok(/16:45/.test(await txt(`[data-ev="${tarea.id}"]`)), 'y la lista se actualiza');

    await w.click(`[data-canc="${tarea.id}"]`); await w.waitForSelector(`[data-ev="${tarea.id}"]`, { state: 'detached' });
    ok((await call('agendaObtener', tarea.id)).estado === 'cancelado', 'cancelar lo guarda y lo quita del rango');
    await w.click('#agRango button:text("Todo")'); await w.waitForSelector(`[data-ev="${tarea.id}"] [data-estado="cancelado"]`);
    ok(true, 'en «Todo» aparece como Cancelado');

    // «Nuevo evento»: el formulario sigue en src/renderer/agenda.js y al guardar la lista React se recarga
    await w.click('#agNew'); await w.waitForSelector('#evT');
    await w.selectOption('#evT', 'firma'); await w.fill('#evF', dia(3)); await w.fill('#evH', '12:15'); await w.fill('#evTi', 'Firma de promesa');
    await w.click('#mOk'); await w.waitForSelector('#view-agenda .ag-ev:has-text("Firma de promesa")');
    ok(true, '«Nuevo evento» crea el evento y aparece en la lista');

    // «Generar orden de visita» llama a la herramienta de src/renderer/agenda.js. Con la ficha incompleta avisa
    // qué falta (el envío completo lo prueba agente-asset-e2e).
    await w.click(`[data-ev="${visita.id}"] [data-orden]`); await w.waitForSelector('#toast:has-text("Para la orden de visita faltan")', { timeout: 15000 });
    ok(true, '«Generar orden de visita» revisa la ficha y avisa qué falta');

    // el Agente navega a la agenda
    await w.click('#nav [data-view="cartera"]'); await w.evaluate(() => window.AssetNav('agenda')); await w.waitForSelector('#view-agenda:not(.hidden) #agNew');
    ok(true, 'AssetNav("agenda") abre la agenda en React');
    ok(reunion.id && await n() >= 4, 'los filtros se conservan al volver (sigue en «Todo»)');

    const relevantes = errs.filter((e) => /Content Security Policy|ReactUI|react|Agenda/i.test(e));
    ok(relevantes.length === 0, 'sin errores de React ni de CSP' + (relevantes.length ? ': ' + relevantes.join(' | ') : ''));
    console.log('\nagenda-e2e: todo bien');
  } finally { await app.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exit(1); });
