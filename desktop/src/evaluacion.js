// Evaluación del arrendatario y de sus avales (etapa 2 de un negocio de arriendo). Todo lo hace el servidor de Asset:
// manda la plantilla de WhatsApp, recibe y lee los documentos y calcula el puntaje (api/src/whatsapp/evaluacion.ts).
// La app solo pide, muestra y deja que el corredor decida (por persona: el arrendatario y cada aval se aprueban o rechazan por
// separado; la evaluación se aprueba cuando todos están aprobados). Sin cuenta de Asset no está disponible.
const asset = () => require('./asset');
const err = (m) => new Error(m);
const base = (id) => `/evaluaciones/${encodeURIComponent(String(id || ''))}`;
const api = async (m, r, c) => { try { return await asset().llamar(m, r, c); } catch (e) { throw err(e.message); } };
// Solo pruebas (PF_MOCK): una evaluación de mentira que la prueba deja en global.__pfEval[negocioId]; el servidor real hace esto con la IA
const mock = (id) => (process.env.PF_MOCK === '1' && global.__pfEval && global.__pfEval[id]) || null;
const copia = (x) => JSON.parse(JSON.stringify(x));
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNkYPhfz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC';
const real = {
  ver: (negocioId) => api('GET', base(negocioId)),
  solicitar: ({ negocioId, avales = [], titular = true }) => api('POST', base(negocioId) + '/solicitar', { avales, titular }),
  recalcular: (negocioId) => api('POST', base(negocioId) + '/recalcular', {}),
  /** sin personaId es la decisión global; con personaId, la de esa persona ('pendiente' la deshace) */
  decidir: ({ negocioId, decision, nota = '', personaId }) => api('POST', base(negocioId) + '/decidir', { decision, nota, ...(personaId ? { personaId } : {}) }),
  /** el corredor asigna el tipo de un documento: el servidor lo vuelve a leer con esa premisa y recalcula el puntaje */
  clase: ({ negocioId, personaId, n, clase }) => api('POST', `${base(negocioId)}/archivo/${encodeURIComponent(personaId)}/${Number(n) || 0}/clase`, { clase }),
  archivo: ({ negocioId, personaId, n }) => api('GET', `${base(negocioId)}/archivo/${encodeURIComponent(personaId)}/${Number(n) || 0}`),
  /** el documento recibido (PDF o imagen) en base64, para verlo dentro de la app sin salir a un navegador */
  async archivoBytes({ negocioId, personaId, n }) {
    const { url, nombre } = await real.archivo({ negocioId, personaId, n });
    const r = await fetch(url, { signal: AbortSignal.timeout(60000) }); if (!r.ok) throw err(`No se pudo bajar el documento (${r.status}).`);
    const buf = Buffer.from(await r.arrayBuffer()); const ext = (String(nombre).match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
    const tipo = (r.headers.get('content-type') || '').split(';')[0] || ({ pdf: 'application/pdf', png: 'image/png', webp: 'image/webp' }[ext] || 'image/jpeg');
    return { base64: buf.toString('base64'), tipo: tipo === 'application/octet-stream' ? (ext === 'pdf' ? 'application/pdf' : 'image/jpeg') : tipo, nombre };
  },
};
module.exports = {
  ...real,
  ver: (id) => (mock(id) ? Promise.resolve(copia(mock(id))) : real.ver(id)),
  clase: (o) => { const ev = mock(o.negocioId); if (!ev) return real.clase(o); const a = ev.personas.find((p) => p.personaId === o.personaId)?.archivos.find((x) => x.n === Number(o.n)); if (!a) return Promise.reject(new Error('Ese archivo no existe.')); a.clase = o.clase; a.claseManual = true; return Promise.resolve(copia(ev)); },
  archivoBytes: (o) => (mock(o.negocioId) ? Promise.resolve({ base64: PNG, tipo: 'image/png', nombre: 'documento.png' }) : real.archivoBytes(o)),
  decidir: (o) => {
    const ev = mock(o.negocioId); if (!ev) return real.decidir(o);
    if (!o.personaId) { ev.decision = { estado: o.decision, por: 'Corredor', en: new Date().toISOString(), nota: o.nota || '' }; return Promise.resolve(copia(ev)); }
    const p = ev.personas.find((q) => q.personaId === o.personaId); if (!p) return Promise.reject(new Error('Esa persona no está en la evaluación.'));
    p.decision = o.decision === 'pendiente' ? null : { estado: o.decision, por: 'Corredor', en: new Date().toISOString() };
    const tit = ev.personas.find((q) => q.rol === 'arrendatario');   // misma regla que el servidor
    ev.decision = tit?.decision?.estado === 'rechazada' ? { estado: 'rechazada', por: 'Corredor', en: new Date().toISOString(), nota: 'Arrendatario rechazado' } : ev.personas.every((q) => q.decision?.estado === 'aprobada') ? { estado: 'aprobada', por: 'Corredor', en: new Date().toISOString(), nota: '' } : null;
    return Promise.resolve(copia(ev));
  },
};
