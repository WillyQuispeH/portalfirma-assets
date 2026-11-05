// 0.16.15 · Formatos propios (mandatos de The Living): salen de la ficha, piden solo lo que falta (y lo guardan en
// su lugar), sin pies de firma, se envían a firmar con Portalfirma y marcan el hito «Mandato firmado» de la captación.
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
(async () => {
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'pffm-'))}`], cwd: path.join(__dirname, '..'), env: { ...process.env, PF_MOCK: '1', PF_MOCK_LOGGED: '1', PF_INMO_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'pffm-db-')), PF_NO_TOURS: '1', PF_START: 'inicio' } });
  const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
  const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
  const ultimo = () => w.$$eval('.ag-msg.bot', (x) => x.map((e) => e.textContent).pop() || '');
  const decir = async (t) => { const n = (await w.$$('.ag-msg.bot')).length; await w.fill('#agQ', t); await w.press('#agQ', 'Enter'); await w.waitForTimeout(150); if (await w.isVisible('#mOk').catch(() => false)) await w.click('#mOk'); return n; };
  const respuesta = async (n) => { await w.waitForFunction((k) => document.querySelectorAll('.ag-msg.bot').length > k, n, { timeout: 15000 }); await w.waitForTimeout(250); return ultimo(); };
  const paso = async (id) => (await call('etPasos', { propId: id, ambito: 'captacion' })).etapas[0].pasos.find((x) => x.id === 'mandato');
  try {
    await w.setViewportSize({ width: 1480, height: 960 }); await w.waitForSelector('#view-inicio', { timeout: 15000 });
    const p = await call('inmoPropGuardar', { titulo: 'Depto en Vitacura', tipo: 'departamento', venta: true, arriendo: true, precioVenta: { valor: 9800, moneda: 'UF' }, precioArriendo: { valor: 32, moneda: 'UF' },
      comuna: 'Vitacura', direccion: 'Av. Vitacura 5250', unidad: '1201', supUtil: 98, ficha: { supTerraza: 12, propietarioNombre: 'María José Silva', propietarioCelular: '+56 9 8765 4321' } });
    let e = await call('fmtEstado'); ok(!e.paquete && e.disponibles.some((d) => d.id === 'the-living'), 'sin formatos activos se ofrece el paquete de The Living');
    ok(!/Para el mandato/.test((await paso(p.id)).d || ''), 'sin formatos el paso del mandato sigue como antes');
    e = await call('fmtConfigurar', { paquete: 'the-living' }); ok(e.paquete === 'the-living' && e.formatos.length === 3, 'se activan los formatos de The Living (mandatos de venta y de arriendo, orden de visita)');

    let m = await paso(p.id);
    ok(m.e === 'pend' && /Para el mandato falta: .*RUT/.test(m.d), `el hito dice qué falta para el mandato (${m.d})`);
    let r = await call('fmtPreparar', { formatoId: 'mandato_venta', propId: p.id });
    const fv = r.faltan.map((x) => x.id);
    ok(['duenoRut', 'duenoEmail', 'rol', 'exclusividad'].every((x) => fv.includes(x)) && !fv.some((x) => /^rep/.test(x)) && !fv.includes('duenoNombre') && !fv.includes('supTotal') && !fv.includes('ubicacion'),
      'solo pide lo que no está (RUT y correo del dueño, rol, exclusividad); The Living no firma, así que no pide datos del representante');
    ok(r.datos.find((d) => d.id === 'supTotal').txt === '110' && r.datos.find((d) => d.id === 'ubicacion').txt === 'Av. Vitacura 5250, depto. 1201' && r.datos.find((d) => d.id === 'publicar').porDefecto, 'la superficie total sale de útil + terraza, la ubicación lleva el depto y publicar va «sí» por defecto');

    // por WhatsApp / chat: se pide el mandato, se dan los datos y quedan guardados donde corresponde
    await w.click('#agBtn'); await w.waitForSelector('#agDrawer:not(.hidden)');
    let n = await decir(`Envía el mandato de ${p.codigo}`); let t = await respuesta(n);
    ok(/Para el mandato me falta: .*RUT o Rol Único Tributario del propietario.*Meses de garantía/.test(t), 'el agente pide en una lista corta solo lo que falta (incluye los meses de garantía del arriendo)');
    n = await decir(`Completa el mandato de ${p.codigo} con {"duenoRut":"11.111.111-1","duenoEmail":"mjsilva@correo.cl","rol":"1520-33","exclusividad":"sí","mascotas":"no","mesesGarantia":"1"}`); t = await respuesta(n);
    ok(/Listo para enviar: Mandato de gestión de venta y Mandato de gestión de arriendo/.test(t), `con esos datos ambos mandatos quedan listos (${t.slice(0, 90)})`);
    const f = await call('inmoFicha', p.id); const per = (await call('inmoListar')).personas.find((x) => x.rut === '11.111.111-1');
    ok(f.prop.rol === '1520-33' && f.prop.ficha.exclusividad === true && f.prop.ficha.mesesGarantia === 1 && f.prop.ficha.mascotas === false, 'rol, exclusividad, mascotas y garantía quedan en la ficha');
    ok(per && /María José Silva/.test(per.nombre) && f.prop.vinculos.some((v) => v.rol === 'propietario' && v.personaId === per.id) && (per.email === 'mjsilva@correo.cl' || f.prop.ficha.propietarioEmail === 'mjsilva@correo.cl'), 'con el RUT la dueña entra al CRM vinculada como propietaria');
    r = await call('fmtPreparar', { formatoId: 'mandato_arriendo', propId: p.id }); ok(r.listo && r.firmantes.length === 1 && r.firmantes[0].calidad === 'mandante', 'solo firma el mandante (el propietario)');
    m = await paso(p.id); ok(m.e === 'pend' && /Listo para enviar/.test(m.d), 'el hito pasa a «Listo para enviar»');

    // 0.16.16 · un correo mal escrito no deja enviar: el enlace de firma no llegaría
    r = await call('fmtCompletar', { propId: p.id, formatoId: 'mandato_venta', valores: { duenoEmail: 'mjsilva@gmial.com' } }).catch((e) => ({ error: e.message }));
    ok(/gmail\.com/.test(r.error || ''), 'un correo con el dominio mal escrito (gmial.com) se rechaza y sugiere gmail.com');
    r = await call('fmtPreparar', { formatoId: 'mandato_venta', propId: p.id });
    ok(r.firma.tipo === 'simple' && r.firma.tramite === 'none' && r.firmantes.map((s) => s.calidad).join(',') === 'mandante', 'firma solo el mandante, con su calidad, y la firma por defecto es simple, sin legalizar');
    await call('fmtConfigurar', { firma: { mandato_venta: { tipo: 'avanzada', tramite: 'legalization' } } });
    r = await call('fmtPreparar', { formatoId: 'mandato_venta', propId: p.id }); ok(r.firma.tipo === 'avanzada' && r.firma.tramite === 'legalization', 'se puede fijar el tipo de firma y el trámite de cada documento');
    await call('fmtConfigurar', { firma: { mandato_venta: { tipo: 'simple', tramite: 'none' } } });
    // el documento: texto de The Living con los datos, sin pies de firma
    const h = await call('fmtHtml', 'mandato_venta', p.id);
    ok(/MANDATO DE GESTIÓN DE VENTA/.test(h) && /María José Silva/.test(h) && /1520-33/.test(h) && /9\.800/.test(h) && /Aníbal Ignacio Cortés Fernández/.test(h) && /☒ SÍ ☐ NO<\/td><td>Quiero Exclusividad/.test(h), 'el mandato de venta sale con los datos de la ficha y las casillas marcadas');
    ok(!/p\.p\. THE LIVING SpA/.test(h) && !/MANDANTE:<\/?/.test(h) && /data:image\/jpeg/.test(h), 'sin pies de firma (firman en Portalfirma) y con el logo de The Living');
    const ha = await call('fmtHtml', 'mandato_arriendo', p.id); ok(/Se aceptan mascotas: <span class="u">No/.test(ha) && /garantía de solicitarán: <span class="u">1/.test(ha), 'el de arriendo lleva mascotas y meses de garantía en las condiciones especiales');

    // la ventana del hito en la app
    await w.click('#agClose').catch(() => {});
    await w.evaluate((id) => window.Formatos.abrir(id, { hito: 'mandato' }), p.id); await w.waitForSelector('.fm-ok');
    ok((await w.$$('#fmCuerpo .fb-tab')).length === 2 && !(await w.$('#fmEnviar[disabled]')), 'la ventana del mandato muestra los dos documentos y deja enviar');
    await w.click('#fmVer'); await w.waitForSelector('iframe.fm-prev'); await w.screenshot({ path: path.resolve(__dirname, 'fm1-mandato.png') });
    await w.click('#fmCerrar');

    // se envía a firmar (confirmación porque cobra) y el hito queda esperando la firma
    await w.click('#agBtn').catch(() => {}); await w.waitForSelector('#agDrawer:not(.hidden)');
    n = await decir(`Firma el mandato de venta de ${p.codigo}`); await w.waitForSelector('[data-conf]');
    ok(/Enviar «Mandato de gestión de venta» a firmar/.test(await w.textContent('[data-conf]')) && /saldo/.test(await w.textContent('[data-conf]')), 'pide confirmar antes de enviar (cobra del saldo)');
    await w.click('[data-conf] [data-si]'); t = await respuesta(n); ok(/Mandato de gestión de venta enviado a firmar: operación \d+/.test(t), 'envía el mandato de venta a firmar');
    const p2 = (await call('inmoFicha', p.id)).prop; const doc = p2.firmas[0];
    ok(doc.formato === 'mandato_venta' && doc.firmantes.length === 1 && fs.existsSync(doc.archivo) && fs.statSync(doc.archivo).size > 5000, 'queda en la ficha con el PDF y su firmante (el mandante)');
    m = await paso(p.id); ok(m.e === 'pend' && /Listo para enviar: mandato de gestión de arriendo/.test(m.d), 'el hito recuerda que falta enviar el de arriendo');
    const ops = await call('opsList'); const it = ops.items.find((x) => x.operation === doc.operacion);
    ok(it && it.asset?.codigo === p.codigo && it.asset.firmantes.some((s) => s.calidad === 'mandante'), 'la operación aparece en «Mis operaciones» con su propiedad y la calidad de cada firmante');
    const pend = await call('firPendientes', {}); ok(pend.some((x) => x.operacion === doc.operacion), 'queda en la lista de firmas en curso que sigue el agente');
    n = await decir(`¿Cómo van las firmas de ${p.codigo}?`); t = await respuesta(n);
    ok(new RegExp(`peración ${doc.operacion}`).test(t) && /firmaron/.test(t), `el agente encuentra la operación sin que le den el número (${t.slice(0, 100)})`);
    const rv = await call('firRevisar', doc.operacion); ok(rv.firmantes.length && rv.pendientes.length >= 1, 'la revisión trae quién falta por firmar');
    { const it2 = (await call('opsList')).items.find((x) => x.operation === doc.operacion); ok(it2 && it2.signed === 1 && it2.signers === 2, '0.16.25 · lo que detecta el seguimiento (1 de 2 firmó) se ve al tiro en «Mis operaciones»'); }
    const co = await call('firCorregir', { operacion: doc.operacion, firmante: rv.pendientes[0].nombre, email: 'correcto@correo.cl' });
    ok(co.ok && co.email === 'correcto@correo.cl' && co.enlace === 'reenviado', 'se corrige el correo de un firmante en Portalfirma y se le reenvía el enlace');
    // 0.16.17 · orden de visita con el formato de The Living: sale del CRM y de la ficha; firma solo el visitante
    const vis = await call('inmoPerGuardar', { nombre: 'Pedro Visitante Soto', rut: '15.555.555-6', email: 'pedro@correo.cl', telefono: '', roles: ['interesado'] });
    let ov = await call('fmtPreparar', { formatoId: 'orden_visita', propId: p.id, personaId: vis.id });
    ok(!ov.listo && ov.faltan.some((x) => x.id === 'visitTelefono') && ov.faltan.some((x) => x.id === 'operacion') && ov.faltan.some((x) => /^ejec/.test(x.id)), 'pide solo lo que falta: celular del visitante, venta o arriendo (va en ambas) y tus datos de ejecutivo');
    ov = await call('fmtCompletar', { formatoId: 'orden_visita', propId: p.id, personaId: vis.id, valores: { visitTelefono: '+56 9 5555 4444', operacion: 'venta', ejecNombre: 'Matías Serrano', ejecEmail: 'matias@theliving.cl' } });
    ok(ov.listo && ov.op === 'venta' && ov.firmantes.length === 1 && ov.firmantes[0].calidad === 'visitante', 'con eso queda lista; firma solo el visitante');
    const hv = await call('fmtHtml', 'orden_visita', p.id, { personaId: vis.id, op: 'venta' });
    ok(/Orden de visita nº 1/.test(hv) && /Pedro Visitante Soto \| RUT: 15\.555\.555-6 \| pedro@correo\.cl/.test(hv) && /Venta: UF 9\.800/.test(hv) && /\$ 387\.100\.000/.test(hv) && /Matías Serrano/.test(hv) && /Cód:<br>PF-/.test(hv) && /<div class="ft"><\/div>/.test(hv), 'la orden sale con el visitante, la propiedad, el precio en UF y en pesos, el ejecutivo; sin foto queda en blanco');
    const env = await call('fmtEnviar', { formatoId: 'orden_visita', propId: p.id, personaId: vis.id, op: 'venta' });
    const p3 = (await call('inmoFicha', p.id)).prop;
    ok(env.numero === 1 && (await call('fmtEstado')) && p3.firmas[0].plantilla === 'Orden de visita' && p3.firmas[0].firmantes.length === 1, `se envía la orden nº 1 (operación ${env.operacion}) y queda en la ficha`);
    ov = await call('fmtPreparar', { formatoId: 'orden_visita', propId: p.id, personaId: vis.id, op: 'venta' }); const hv2 = await call('fmtHtml', 'orden_visita', p.id, { personaId: vis.id, op: 'venta' });
    ok(/Orden de visita nº 2/.test(hv2), 'la siguiente orden lleva el número 2');
    n = await decir(`Hazme la orden de visita en ${p.codigo} para mañana`); t = await respuesta(n);
    ok(/falta: ¿Venta o arriendo\?/.test(t), `por chat, con el formato propio pide solo lo que falta: venta o arriendo (${t.slice(0, 120)})`);
    const nc = (await w.$$('.ag-conf')).length; n = await decir(`Hazme la orden de visita en ${p.codigo} en venta para mañana`); await w.waitForFunction((k) => document.querySelectorAll('.ag-conf').length > k, nc, { timeout: 15000 });
    const conf = (await w.$$('.ag-conf')).pop(); ok(/Formato: The Living/.test(await conf.textContent()), 'con la operación indicada pide confirmar el envío con el formato de The Living');
    await (await conf.$('[data-si]')).click(); t = await respuesta(n);
    ok(/Orden de visita nº 2 enviada a firmar a MARÍA JOSÉ SILVA|Orden de visita nº 2 enviada a firmar a María José Silva/i.test(t) && /agendada/.test(t), `la envía (nº 2) y agenda la visita (${t.slice(0, 120)})`);
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('OK formatos');
  } catch (er) { console.error(er.message); console.error(await w.$$eval(".ag-msg", (x) => x.map((e) => e.className + ": " + e.textContent.slice(0, 300)).join("\n")).catch(() => "")); await w.screenshot({ path: path.resolve(__dirname, "formatos-error.png") }).catch(() => {}); process.exitCode = 1; } finally { await app.close(); }
})();
