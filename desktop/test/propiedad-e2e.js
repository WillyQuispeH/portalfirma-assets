// 0.9 · «La propiedad primero»: al elegir una propiedad se ve cómo está (negocios, lo último, sugerencias opcionales),
// se anota lo que pasó fuera de Asset y el lienzo muestra el negocio con sus etapas para avanzar a mano. Continuidad al retomar.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pfpr-')); const inmoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfpr-db-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: inmoDir } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const txt = (s) => w.textContent(s).then((t) => (t || '').replace(/\s+/g, ' '));
  const shot = (n) => w.screenshot({ path: path.resolve(__dirname, n) });
  const lz = () => txt('#agCanvas');
  const ultima = (s) => w.$$eval(s, (x) => (x.pop()?.textContent || '').replace(/\s+/g, ' '));
  const neg = () => w.evaluate(() => window.pf.negListar().then((r) => r.data.negocios.find((n) => n.estado === 'abierto')));
  try {
    await w.setViewportSize({ width: 1500, height: 940 });
    await w.waitForSelector('#view-agente .ag.ag-full', { timeout: 15000 });
    await w.evaluate(() => window.Inmo.importar()); await w.waitForSelector('text=Cartera actualizada', { timeout: 15000 }); await w.click('#mOk');
    await w.click('#nav [data-view="agente"]'); await w.waitForSelector('#view-agente .ag.ag-full'); await w.waitForTimeout(400);
    const ids = await w.evaluate(async () => { const d = (await window.pf.inmoListar()).data; return { p: d.propiedades.find((x) => x.codigo === 'CV-9002').id, c: d.personas.find((x) => /JUAN PEREZ/.test(x.nombre)).id }; });
    await w.evaluate((o) => window.pf.negGuardar({ tipo: 'arriendo', propId: o.p, clienteId: o.c }), ids);

    // 1. Solo el código → cómo está la propiedad (sin pasar por la IA)
    await w.fill('#agQ', 'cv-9002'); await w.press('#agQ', 'Enter'); await w.waitForSelector('.ga-est');
    const est = await txt('.ga-est');
    ok(/Negocio en curso/.test(est) && /JUAN PEREZ/.test(est) && /Interesado/.test(await txt('.ga-est .ga-ngh em')) && (await w.$$('.ga-est .ga-pipe i')).length === 6 && (await w.$$('.ga-est .ga-pipe i.a')).length === 1, 'escribir «cv-9002» muestra la propiedad con su negocio en curso y la etapa');
    ok((await w.$$('.ga-est .ga-sugs button')).length >= 1 && /opcional/.test(est), `sugerencias opcionales: ${await w.$$eval('.ga-est .ga-sugs button', (x) => x.map((b) => b.textContent).join(' | '))}`);
    ok(/Anotar lo que pasó/.test(est) && /Documento/.test(est) && /Agendar/.test(est) && /Publicar/.test(est), 'acciones libres: anotar, documento, agendar, publicar… (nada obligatorio)');
    await w.waitForSelector('#agCanvas .lz-steps.clic'); ok(/Ahora: Interesado/.test(await lz()) && /Historial/.test(await lz()), 'el lienzo sigue a la propiedad y muestra el negocio con sus etapas e historial');
    await shot('pr1-estado.png');

    // 1b. Tocar «Anotar» por error: se cierra sin dejar nada
    await w.click('.ga-est [data-a="anotar"]'); await w.waitForSelector('.ga-anot'); await w.click('.ga-anot [data-cancel]');
    ok(!(await w.$('.ga-anot')) && !/Anotar · CV-9002/.test(await txt('.ag-body')), '«Cancelar» cierra Anotar sin dejar rastro');
    await w.click('.ga-est [data-a="agendar"]'); await w.waitForSelector('.ga-agd'); await w.click('.ga-agd .ga-x');
    ok(!(await w.$('.ga-agd')), 'la X cierra cualquier tarjeta (aquí, Agendar)');

    // 2. Anotar lo que pasó por teléfono → sugiere el siguiente paso
    await w.click('.ga-est [data-a="anotar"]'); await w.waitForSelector('.ga-anot');
    await w.fill('.ga-anot [data-f="txt"]', 'quiere visitar el jueves a las 11'); await shot('pr2-anotar.png');
    await w.click('.ga-anot [data-ok]'); await w.waitForSelector('.ga.hecha:has-text("Anotado")');
    ok(/Anotado en el negocio de Juan/i.test(await ultima('.ga.hecha')), 'queda anotado en el negocio de Juan');
    await w.waitForSelector('.ag-sig.sug2'); const sg = await txt('.ag-sig.sug2');
    ok(/Agendar visita \d\d\/\d\d 11:00 con Juan/i.test(sg) && /Pasar a «Visita»/.test(sg) && /Ahora no/.test(sg), `propone (sin hacerlo): ${sg.replace('Siguiente paso · opcional', '').trim()}`);
    await shot('pr3-sugerencias.png');
    await w.click('.ag-sig.sug2 button:has-text("Agendar visita")'); await w.waitForSelector('.ga-agd [data-ok]');
    const f = await w.evaluate(() => ({ fecha: document.querySelector('.ga-agd [data-f="fecha"]').value, hora: document.querySelector('.ga-agd [data-f="hora"]').value, prop: document.querySelector('.ga-agd [data-f="prop"]').selectedOptions[0].textContent, per: document.querySelector('.ga-agd [data-f="per"]').selectedOptions[0].textContent }));
    ok(new Date(f.fecha + 'T12:00').getDay() === 4 && f.hora === '11:00' && /CV-9002/.test(f.prop) && /JUAN/.test(f.per), `la tarjeta de agendar viene lista: jueves ${f.fecha} 11:00, CV-9002 con Juan`);
    await w.click('.ga-agd [data-ok]'); await w.waitForSelector('.ga.hecha:has-text("agendada")');
    await w.waitForFunction(() => document.querySelectorAll('.ga-est').length === 2);
    const n3 = await neg(); ok(n3.etapa === 'visita' && n3.tareas.visita[0] === true, 'agendar la visita es un hito: el negocio pasa a «Visita» y la tarea «Agendar la visita» queda hecha');
    ok(/Hito registrado: el negocio de Juan pasó a «Visita»/.test(await txt('.ag-body')) && /Dejarlo en «Interesado»/.test(await ultima('.ag-sig.sug2')), 'lo dice en el chat, con la opción de deshacer');
    ok(/Visita/.test(await ultima('.ga-est .ga-ngh em')) && (await w.evaluate(() => [...document.querySelectorAll('.ga-est')].pop().querySelectorAll('.ga-pipe i.h').length)) === 1, 'y vuelve solo al flujo de la propiedad, ya actualizado');
    await shot('pr3b-hito.png');

    // 3. Volver a la propiedad: lo último y la visita; el negocio abre el lienzo
    await w.fill('#agQ', 'CV-9002'); await w.press('#agQ', 'Enter'); await w.waitForFunction(() => document.querySelectorAll('.ga-est').length === 3);
    const e2 = await ultima('.ga-est'); ok(/11:00/.test(e2) && /sin orden aún/.test(e2) && /Visita agendada/.test(e2), 'el estado muestra la visita agendada (sin orden) y el hito');
    ok(/quiere visitar el jueves/.test(await lz()), 'la nota queda en el historial del lienzo');
    ok(/Orden de visita para el/.test(e2), 'y ahora sugiere la orden de visita');
    await w.click('.ga-est:last-of-type [data-neg]').catch(() => w.$$('.ga-est [data-neg]').then((b) => b.pop().click()));
    await w.waitForSelector('#agCanvas .lz-steps.clic');

    // 4. Lienzo: tareas, saltar etapa con confirmación, firmado fuera de Asset
    await w.check('#agCanvas [data-tarea="1"]'); await w.waitForTimeout(500);
    ok((await neg()).tareas.visita[1] === true && await w.isChecked('#agCanvas [data-tarea="1"]'), 'marcar una tarea de la etapa desde el lienzo');
    await w.click('#agCanvas [data-etapa="reserva"]'); await w.waitForSelector('#lzConf:not(.hidden)');
    ok(/¿Pasar a «Reserva»\?/.test(await txt('#lzConf')), 'tocar una etapa pide confirmación');
    await shot('pr4-saltar.png');
    await w.click('#lzConf [data-csi]'); await w.waitForFunction(() => /Ahora: Reserva/.test(document.querySelector('#agCanvas')?.textContent || ''));
    ok((await neg()).etapa === 'reserva', 'el negocio pasó a Reserva (lo hizo por teléfono)');
    ok(await w.isVisible('#agCanvas [data-lz="fuera"]'), 'la etapa con firma ofrece generar el documento o marcarlo firmado fuera de Asset');
    await w.click('#agCanvas [data-lz="fuera"]'); await w.waitForFunction(() => /firmado fuera de Asset/.test(document.querySelector('#agCanvas')?.textContent || ''));
    const n4 = await neg(); ok(n4.firmas.reserva.fuera && n4.firmas.reserva.estado === 'firmado', 'reserva marcada como firmada fuera de Asset');
    await shot('pr5-lienzo.png');

    // 5. Por chat: «hablé con…» → anota y sugiere (no mueve nada solo)
    await w.fill('#agQ', 'Hablé con Juan, mandó las liquidaciones de sueldo'); await w.press('#agQ', 'Enter'); await w.waitForTimeout(250); if (await w.isVisible('#mOk').catch(() => false)) await w.click('#mOk');
    await w.waitForFunction(() => document.querySelectorAll('.ag-sig.sug2').length && !document.querySelector('.ag-think'), null, { timeout: 15000 });
    ok(/Pasar a «Evaluación»/.test(await ultima('.ag-sig.sug2')) && (await neg()).etapa === 'reserva', 'el agente anota lo que contaste y propone «Pasar a Evaluación», sin moverlo solo');
    await w.click('.ag-sig.sug2 button:has-text("Evaluación")'); await w.waitForFunction(() => /Ahora: Evaluación/.test(document.querySelector('#agCanvas')?.textContent || ''));
    ok((await neg()).etapa === 'evaluacion', 'un toque en la sugerencia lo mueve');

    // 6. Continuidad: conversación nueva → «Retomar»; abrir la anterior → vuelve el estado de la propiedad
    await w.waitForTimeout(500); await w.click('#agNewC'); await w.waitForSelector('.ag-rec [data-rec]');
    ok(/CV-9002/.test(await txt('.ag-rec')), 'el chat vacío ofrece retomar las propiedades recientes');
    await shot('pr6-retomar.png');
    await w.click('.ag-rec [data-rec]'); await w.waitForSelector('.ga-est'); ok(/Evaluación/.test(await txt('.ga-est')), 'retomar muestra cómo está hoy (ya en Evaluación)');
    await w.waitForTimeout(500); await w.click('#agConvs .ag-ci:nth-of-type(2) [data-abrir]').catch(async () => { const b = await w.$$('#agConvs [data-abrir]'); await b[1].click(); });
    await w.waitForSelector('.ga.hecha [data-verp]'); await w.waitForSelector('.ga-est');
    ok(/Evaluación/.test(await ultima('.ga-est')), 'al abrir una conversación anterior aparece el estado actual de su propiedad, y las tarjetas pasadas tienen «Ver estado»');

    // 6b. Varias visitas: dos clientes, cada uno con su visita y su orden
    await w.evaluate(async (o) => { const d = (await window.pf.inmoListar()).data; const otra = d.personas.find((x) => x.id !== o.c && !/MARIA GONZALEZ/.test(x.nombre)) || d.personas.find((x) => x.id !== o.c);
      const n2 = (await window.pf.negGuardar({ tipo: 'arriendo', propId: o.p, clienteId: otra.id })).data; window.__n2 = n2.id; window.__otra = otra.nombre; }, ids);
    let e6 = await w.evaluate((id) => window.pf.estEstado(id).then((r) => r.data), ids.p);
    ok(e6.negocios.length === 2 && e6.sugerencias.some((x) => /Agendar visita con/.test(x.label)), 'con un segundo interesado sin visita, sugiere agendarle la suya aunque ya haya otra visita');
    await w.evaluate(async (o) => { const man = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10); const n2 = (await window.pf.negObtener(window.__n2)).data; await window.pf.assetEjecutar('asset_crear_evento', { tipo: 'visita', fecha: man, hora: '16:00', propiedad: o.p, personas: [n2.clienteId], negocio: n2.id }); }, ids);
    e6 = await w.evaluate((id) => window.pf.estEstado(id).then((r) => r.data), ids.p);
    const vis = e6.proximos.filter((e) => e.tipo === 'visita'); const ords = e6.sugerencias.filter((x) => x.accion.tipo === 'orden');
    ok(vis.length === 2 && e6.totalProximos >= 2 && ords.length === 2 && new Set(ords.map((x) => x.accion.eventoId)).size === 2, `dos visitas agendadas, cada una con su sugerencia de orden: ${ords.map((x) => x.label).join(' | ')}`);
    await w.fill('#agQ', 'CV-9002'); await w.press('#agQ', 'Enter'); await w.waitForFunction(() => /2 negocios en curso/.test([...document.querySelectorAll('.ga-est')].pop()?.textContent || ''));
    await w.waitForSelector('#agCanvas .lz-clis'); ok(/Próximas visitas\s*2/.test(await lz()) && (await w.$$('#agCanvas .lz-cli')).length === 2, 'la tarjeta muestra los 2 negocios; el lienzo, las 2 visitas y una pestaña por negocio');
    await shot('pr7-varias-visitas.png');

    // 7. Desde la ficha: «Ver en el Agente»
    await w.evaluate((id) => window.Inmo.abrirFicha(id), ids.p); await w.waitForSelector('.im-ficha [data-mas]'); await w.click('.im-ficha [data-mas]'); await w.click('#fAg');
    await w.waitForSelector('#view-agente .ag.ag-full'); await w.waitForFunction(() => /¿Cómo va CV-9002\?/.test(document.querySelector('#agBody')?.textContent || ''));
    ok(await w.isVisible('.ga-est'), 'la ficha abre la propiedad en el Agente');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK propiedad primero');
  } catch (e) { console.error(e.message); console.error(await w.evaluate(() => JSON.stringify(window.Agente._a.items.slice(-6).map((x) => x.k + (x.lista ? ':' + JSON.stringify(x.lista) : '') + (x.usado ? '(usado)' : ''))))); await shot('pr-error.png').catch(() => {}); process.exitCode = 1; } finally { await app.close(); }
})();
