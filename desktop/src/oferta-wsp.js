// Aceptación del propietario: el corredor registra la respuesta en Asset, y además puede mandarle al propietario los detalles de
// la oferta vigente por WhatsApp (el texto sale armado y se puede editar). Con wechatia conectado se envía solo; si no, o si el
// propietario no escribió en las últimas 24 h (WhatsApp no deja texto libre), se abre WhatsApp con el mensaje listo.
const err = (m) => new Error(m);
const primer = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const telWa = (t) => { let d = String(t || '').replace(/\D/g, ''); if (!d) return null; if (d.length === 8) d = '569' + d; else if (d.length === 9) d = '56' + d; return d.length >= 10 ? d : null; };
const monto = (v, mo) => (!v ? '' : mo === 'UF' ? `UF ${Number(v).toLocaleString('es-CL')}` : mo === 'USD' ? `US$ ${Number(v).toLocaleString('es-CL')}` : `$${Number(v).toLocaleString('es-CL')}`);

function crear({ inmo, negocios, reservas, abrir }) {
  // la oferta vigente: la última ronda con condiciones, o la carta oferta del negocio
  function vigente(n) {
    const rs = (n.aceptacion?.rondas || []).filter((r) => r.tipo !== 'rechazada'); const u = rs[rs.length - 1];
    if (u && u.monto) return { monto: u.monto, moneda: u.moneda || 'UF', garantia: u.garantia || '', plazo: u.plazo || '', condiciones: u.condiciones || '', vigencia: n.oferta?.vigencia || '' };
    return { monto: n.valor?.valor || null, moneda: n.valor?.moneda || 'UF', garantia: n.oferta?.garantia || '', plazo: n.oferta?.plazo || '', condiciones: n.oferta?.condiciones || '', vigencia: n.oferta?.vigencia || '' };
  }
  function preparar(negocioId) {
    const n = negocios.ver(negocioId); const p = inmo.todas().find((x) => x.id === n.propId); if (!p) throw err('El negocio no tiene propiedad.');
    const dueno = (p.vinculos || []).filter((v) => v.rol === 'propietario').map((v) => inmo.personaPorId(v.personaId)).filter(Boolean);
    const d = dueno.find((x) => telWa(x.telefono)) || dueno[0] || null;
    if (!d) throw err('La propiedad no tiene propietario en su ficha: agrégalo para mandarle la oferta.');
    if (!telWa(d.telefono)) throw err(`${d.nombre} no tiene celular en su ficha: agrégalo para mandarle la oferta por WhatsApp.`);
    const v = vigente(n); if (!v.monto) throw err('Todavía no hay una oferta con monto: arma la carta oferta primero.');
    const cfg = inmo.config() || {}; const corredor = cfg.contacto?.nombre || cfg.corredor?.nombre || '';
    const dir = [p.direccion, p.unidad ? 'depto. ' + p.unidad : '', p.comuna].filter(Boolean).join(', ');
    const quien = n.cliente?.nombre ? ` de ${primer(n.cliente.nombre)}` : '';
    const L = [`Hola ${primer(d.nombre)}, te escribe ${corredor || 'tu corredor'}. Tenemos una oferta${quien} por tu propiedad ${p.codigo}${dir ? ' (' + dir + ')' : ''}:`, '',
      `• ${n.tipo === 'venta' ? 'Precio' : 'Renta'} ofrecido: ${monto(v.monto, v.moneda)}`, ...(v.garantia ? [`• ${n.tipo === 'venta' ? 'Reserva' : 'Garantía'}: ${v.garantia}`] : []), ...(v.plazo ? [`• Plazo: ${v.plazo}`] : []), ...(v.vigencia ? [`• Vigencia de la oferta: ${v.vigencia} días`] : []), ...(v.condiciones ? [`• Condiciones: ${v.condiciones}`] : []), '',
      '¿La aceptas, la rechazas o quieres hacer una contraoferta? Respóndeme por aquí.'];
    return { texto: L.join('\n'), persona: { id: d.id, nombre: d.nombre, telefono: d.telefono || '' }, whatsapp: `https://wa.me/${telWa(d.telefono)}?text=${encodeURIComponent(L.join('\n'))}` };
  }
  async function enviar({ negocioId, texto, modo }) {
    const r = preparar(negocioId); const t = String(texto || '').trim().slice(0, 1500) || r.texto; const n = negocios.ver(negocioId);
    let automatico = false;
    if (modo === 'abrir') abrir(`https://wa.me/${telWa(r.persona.telefono)}?text=${encodeURIComponent(t)}`);
    else { await reservas.enviarWhatsApp({ telefono: r.persona.telefono, nombre: r.persona.nombre, texto: t, revisar24: true }); automatico = true; }   // si WhatsApp no deja enviarlo, el error lo explica y queda «Abrir en WhatsApp»
    inmo.registrar(n.id, `Detalles de la oferta enviados por WhatsApp a ${r.persona.nombre}${automatico ? '' : ' (abierto en WhatsApp)'}`, { ref2: n.propId }); inmo.guardar();
    return { ok: true, automatico, persona: r.persona };
  }
  return { preparar, enviar, vigente };
}
module.exports = { crear };
