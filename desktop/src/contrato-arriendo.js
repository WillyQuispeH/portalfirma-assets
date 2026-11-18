// Contrato de arriendo de un negocio. El flujo (etapa 2 · Cierre del arriendo):
//  (La aprobación es POR FIRMANTE: propietarios, arrendatario y codeudores. Cada versión guarda quiénes son (versiones[].firmantes) y la
//   aprobación de cada uno (aprobado[personaId]); el contrato se puede enviar a firmar cuando todos aprobaron la última versión.)
//  1. «Revisión del contrato»: Asset arma el contrato en el servidor (api/src/negocios/contrato-arriendo.ts, plantilla HTML
//     contrato-arriendo.html) y cada VERSIÓN queda guardada como PDF en los archivos del negocio (R2) con sus condiciones. La versión se
//     envía por WhatsApp (con el PDF adjunto) al propietario y al arrendatario pidiéndoles que la aprueben o la comenten; el corredor
//     registra comentarios y aprobaciones (n.ciclo.contrato). Una versión nueva anula las aprobaciones.
//  2. «Contrato firmado»: se envía a firmar EXACTAMENTE el PDF de la última versión, ya aprobada por ambos (con el tipo de firma y el
//     trámite que elige el corredor). Sin aprobación de ambos no se puede enviar.
// Los mensajes por WhatsApp nunca salen solos: el corredor los ve, los edita y decide. Sin cuenta de Asset no está disponible, salvo en
// PF_MOCK, donde se simula con un PDF mínimo y una operación inventada.
const asset = () => require('./asset');
const err = (m) => new Error(m);
const api = async (m, r, c, ms) => { try { return await asset().llamar(m, r, c, ms); } catch (e) { throw err(e.message); } };
const revisar = (r) => { if (r?.error) throw err(r.error); return r; };
const ESPERA = 90000;
const PDF_MINIMO = Buffer.from('%PDF-1.1 1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj trailer<</Root 1 0 R>> %%EOF').toString('base64');
const primer = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const telWa = (t) => { let d = String(t || '').replace(/\D/g, ''); if (!d) return null; if (d.length === 8) d = '569' + d; else if (d.length === 9) d = '56' + d; return d.length >= 10 ? d : null; };
const fdmy = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '');

function crear({ inmo, negocios, abrir, reservas }) {
  const simulada = () => !inmo.API && process.env.PF_MOCK === '1';
  // los firmantes: los propietarios de la propiedad, el arrendatario y los avales de la evaluación (codeudores)
  async function firmantesDe(n) {
    const p = inmo.todas().find((x) => x.id === n.propId); const out = []; const visto = new Set();
    const meter = (per, rol) => { if (per && !visto.has(per.id)) { visto.add(per.id); out.push({ personaId: per.id, rol, nombre: per.nombre }); } };
    for (const v of (p?.vinculos || []).filter((x) => x.rol === 'propietario')) meter(inmo.personaPorId(v.personaId), 'Arrendador');
    if (n.clienteId) meter(inmo.personaPorId(n.clienteId), 'Arrendatario');
    try { const ev = await require('./evaluacion').ver(n.id); for (const q of (ev && !ev.vacia ? ev.personas || [] : []).filter((x) => x.rol === 'aval')) meter(inmo.personaPorId(q.personaId) || { id: q.personaId, nombre: q.nombre }, 'Codeudor'); } catch { /* sin evaluación: sin codeudores */ }
    return out;
  }
  const aprobada = (n) => { const k = n.ciclo?.contrato || {}; const v = (k.versiones || []).slice(-1)[0]; const fs = v?.firmantes || []; return v && fs.length && fs.every((q) => k.aprobado?.[q.personaId]) ? v : null; };
  return {
    /** quiénes firman (propietarios, arrendatario y avales de la evaluación): la panel de revisión lo usa para las versiones guardadas antes de que se registraran */
    async firmantes({ negocioId }) { return { firmantes: await firmantesDe(negocios.ver(negocioId)) }; },
    /** el PDF del contrato armado con lo que hay guardado en el negocio (para la vista previa mientras se edita) */
    async vistaPrevia({ negocioId }) {
      if (simulada()) return { ok: true, pdf: PDF_MINIMO, archivo: 'Contrato de arriendo (simulado).pdf', firmantes: [] };
      return revisar(await api('POST', '/contratos-arriendo/vista-previa', { negocioId: String(negocioId) }, ESPERA));
    },
    /** el PDF de una versión guardada, para verlo antes de enviarlo a firmar */
    async versionPdf({ negocioId, clave }) {
      if (simulada()) return { ok: true, pdf: PDF_MINIMO };
      return revisar(await api('POST', '/contratos-arriendo/version', { negocioId: String(negocioId), clave: String(clave || '') }, ESPERA));
    },
    /**
     * Guarda el contrato como una versión nueva: genera el PDF con lo guardado, lo sube a los archivos del negocio y lo registra en
     * n.ciclo.contrato.versiones (con las condiciones de ese momento). Las aprobaciones anteriores se anulan.
     */
    async versionGuardar({ negocioId, de, nota }) {
      const n = negocios.ver(negocioId); const vp = await this.vistaPrevia({ negocioId });
      const nombre = `Contrato de arriendo ${n.prop?.codigo || ''} - V${((n.ciclo?.contrato?.versiones || []).length) + 1}.pdf`.replace(/\s+/g, ' ');
      let archivo;
      if (simulada()) archivo = { clave: 'simulada/' + Date.now() + '.pdf', nombre };
      else { const buf = Buffer.from(vp.pdf, 'base64'); const clave = await inmo.subirArchivoRegistro('archivos_negocio', String(negocioId), nombre, buf, 'application/pdf'); archivo = { clave, nombre }; }
      const ciclo = JSON.parse(JSON.stringify(n.ciclo || {})); const k = (ciclo.contrato ||= {}); const vs = (k.versiones ||= []);
      vs.push({ n: vs.length + 1, fecha: new Date().toISOString(), de: de || 'corredora', nota: String(nota || '').trim().slice(0, 400), archivo, condiciones: JSON.parse(JSON.stringify(k.datos || {})), firmantes: await firmantesDe(n), generada: true });
      k.aprobado = {};
      negocios.guardarCiclo(negocioId, ciclo);
      inmo.registrar(negocioId, `Contrato de arriendo: versión ${vs.length} guardada`, { ref2: n.propId }); inmo.guardar();
      return { ok: true, version: vs.length, archivo };
    },
    /** el mensaje (editable) para pedirle a UN firmante (propietario, arrendatario o codeudor) que revise la versión */
    revisionPreparar({ negocioId, personaId, neutro = false }) {
      const n = negocios.ver(negocioId); const p = inmo.todas().find((x) => x.id === n.propId); if (!p) throw err('El negocio no tiene propiedad.');
      const v = (n.ciclo?.contrato?.versiones || []).slice(-1)[0]; if (!v?.archivo) throw err('Primero guarda el contrato como una versión (con su PDF).');
      const f = (v.firmantes || []).find((x) => x.personaId === personaId); const d = inmo.personaPorId(personaId);
      if (!f || !d) throw err('Esa persona no es firmante de este contrato.');
      if (!telWa(d.telefono)) throw err(`${d.nombre} no tiene celular en su ficha: agrégalo para mandarle el contrato por WhatsApp.`);
      const cfg = inmo.config() || {}; const corredor = cfg.contacto?.nombre || cfg.corredor?.nombre || '';
      const dir = [p.direccion, p.unidad ? 'depto. ' + p.unidad : '', p.comuna].filter(Boolean).join(', ');
      const como = !neutro && f.rol === 'Codeudor' ? ', en el que figuras como codeudor' : '';
      const texto = [`Hola ${primer(d.nombre)}, te escribe ${corredor || 'tu corredor'} por el arriendo de ${p.codigo}${dir ? ' (' + dir + ')' : ''}.`, '',
        `Te envío el contrato de arriendo (versión ${v.n})${como} para tu revisión. Léelo con calma y dime si lo apruebas o si quieres cambios o comentarios.`, '',
        'Cuando todos lo aprueben, lo dejamos listo para la firma. Respóndeme por aquí.'].join('\n');
      return { texto, version: v.n, archivo: v.archivo, rol: f.rol, persona: { id: d.id, nombre: d.nombre, telefono: d.telefono || '' } };
    },
    /** envía la versión (con el PDF adjunto) por WhatsApp a UN firmante, o abre WhatsApp con el mensaje (modo 'abrir': el PDF se adjunta a mano) */
    async revisionEnviar({ negocioId, personaId, texto, modo }) {
      const r = this.revisionPreparar({ negocioId, personaId }); const t = String(texto || '').trim().slice(0, 3500) || r.texto; const n = negocios.ver(negocioId);
      let automatico = false; let plantilla = false;
      if (modo === 'abrir') abrir(`https://wa.me/${telWa(r.persona.telefono)}?text=${encodeURIComponent(t)}`);
      else if (simulada()) { await reservas.enviarWhatsApp({ telefono: r.persona.telefono, nombre: r.persona.nombre, texto: t, revisar24: true }); automatico = true; }
      else { const x = revisar(await api('POST', '/contratos-arriendo/revision/enviar', { negocioId: String(negocioId), personaId, clave: r.archivo.clave, nombre: r.archivo.nombre, texto: t, documento: `el contrato de arriendo (versión ${r.version})` }, ESPERA)); automatico = true; plantilla = !!x?.plantilla; }   // fuera de 24 h el servidor manda la plantilla y el PDF sale cuando responda
      const ciclo = JSON.parse(JSON.stringify(n.ciclo || {})); const k = (ciclo.contrato ||= {});
      k.envios = [...(k.envios || []), { version: r.version, personaId, rol: r.rol, persona: r.persona.nombre, fecha: new Date().toISOString(), automatico, ...(plantilla ? { plantilla } : {}) }].slice(-80);
      negocios.guardarCiclo(negocioId, ciclo);
      inmo.registrar(negocioId, `Contrato (versión ${r.version}) enviado a ${r.persona.nombre} para su revisión${plantilla ? ' (plantilla de WhatsApp: el PDF le llega cuando responda)' : automatico ? '' : ' (abierto en WhatsApp)'}`, { ref2: n.propId }); inmo.guardar();
      return { ok: true, automatico, plantilla, persona: r.persona, fecha: fdmy(new Date().toISOString().slice(0, 10)) };
    },
    /** envía a firmar el contrato APROBADO por ambos: el PDF de la última versión */
    async enviar({ negocioId }) {
      const n = negocios.ver(negocioId); const v = aprobada(n);
      if (!v) throw err('Primero hay que aprobar el contrato: todos los firmantes deben aprobar la última versión en el paso «Revisión del contrato».');
      if (!v.archivo) throw err('La versión aprobada no tiene su PDF: guárdala con su archivo en el paso «Revisión del contrato».');
      const cuerpo = { negocioId: String(negocioId), clave: v.archivo.clave };   // cómo se firma (tipo y trámite) lo define la plantilla en el servidor: no se manda
      if (simulada()) {
        const op = 920000 + Math.floor(Math.random() * 9999);
        negocios.vincularFirma(negocioId, 'contrato', op);
        inmo.agregarFirma({ operacion: op, plantilla: 'Contrato de arriendo nº 1', origen: 'asset', fecha: new Date().toISOString(), estado: 'en_firma', firmantes: [{ nombre: n.cliente?.nombre, rut: n.cliente?.rut, rol: 'Arrendatario', personaId: n.cliente?.id }], negocioId, versionClave: cuerpo.clave }, [n.prop?.id], `Contrato de arriendo enviado a firmar (operación ${op})`);
        return { ok: true, enviada: true, operacion: op, numero: 1, indicacion: 'Contrato simulado (pruebas).', simulada: true, version: v.n, ...cuerpo };
      }
      const r = revisar(await api('POST', '/contratos-arriendo/enviar', cuerpo, ESPERA));
      try { await inmo.sincronizar(); } catch { /* se trae en la próxima sincronización */ }
      return { ...r, version: v.n };
    },
    // acta de entrega e inventario: la firma es «entrega_acta» (fuera del embudo: al firmarse la propiedad queda arrendada, el negocio sigue abierto)
    async entregaVistaPrevia({ negocioId }) {
      if (simulada()) return { ok: true, pdf: PDF_MINIMO, archivo: 'Acta de entrega (simulada).pdf', firmantes: [] };
      return revisar(await api('POST', '/actas-entrega/vista-previa', { negocioId: String(negocioId) }, ESPERA));
    },
    async entregaEnviar({ negocioId }) {
      if (simulada()) {
        const n = negocios.ver(negocioId); const op = 930000 + Math.floor(Math.random() * 9999);
        negocios.vincularFirma(negocioId, 'entrega_acta', op);
        inmo.agregarFirma({ operacion: op, plantilla: 'Acta de entrega e inventario nº 1', origen: 'asset', fecha: new Date().toISOString(), estado: 'en_firma', firmantes: [{ nombre: n.cliente?.nombre, rut: n.cliente?.rut, rol: 'Arrendatario', personaId: n.cliente?.id }], negocioId }, [n.prop?.id], `Acta de entrega enviada a firmar (operación ${op})`);
        return { ok: true, enviada: true, operacion: op, numero: 1, indicacion: 'Acta simulada (pruebas).', simulada: true };
      }
      const r = revisar(await api('POST', '/actas-entrega/enviar', { negocioId: String(negocioId) }, ESPERA));
      try { await inmo.sincronizar(); } catch { /* se trae en la próxima sincronización */ }
      return r;
    },
  };
}
module.exports = { crear };
