// Avisos del postarriendo por WhatsApp (reajuste, renovación o término, devolución de la garantía): el mensaje sale armado con los datos del
// contrato y del negocio, el corredor lo ve, lo edita y decide si lo envía (nunca se manda solo). Con wechatia conectado se envía desde Asset;
// si no, o si la persona no escribió en las últimas 24 h (WhatsApp no deja texto libre), se abre WhatsApp con el mensaje listo.
// Cada aviso enviado queda en el historial del negocio y en n.ciclo.postarriendo.avisos (qué, a quién y cuándo).
const err = (m) => new Error(m);
const primer = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const telWa = (t) => { let d = String(t || '').replace(/\D/g, ''); if (!d) return null; if (d.length === 8) d = '569' + d; else if (d.length === 9) d = '56' + d; return d.length >= 10 ? d : null; };
const monto = (v, mo) => (!v ? '' : mo === 'UF' ? `UF ${Number(v).toLocaleString('es-CL')}` : mo === 'USD' ? `US$ ${Number(v).toLocaleString('es-CL')}` : `$${Number(v).toLocaleString('es-CL')}`);
const fdmy = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '');
const mas = (f, m, d = 0) => { const x = new Date(f + 'T12:00:00'); x.setMonth(x.getMonth() + m); x.setDate(x.getDate() + d); return new Date(x.getTime() - x.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const TIPOS = ['reajuste', 'renovacion', 'devolucion'];
const DESTINOS = ['arrendatario', 'propietario'];

function crear({ inmo, negocios, reservas, abrir }) {
  // las fechas del contrato: término (con la renovación, si la hay), límite para avisar y próximo reajuste por IPC
  function fechas(n) {
    const k = n.ciclo?.contrato?.datos; const po = n.ciclo?.postarriendo || {};
    if (!k?.inicio || !k.plazoMeses) throw err('Faltan las condiciones del contrato (inicio y plazo): se llenan en el paso «Contrato firmado».');
    const extra = po.renovacion?.decision === 'renovar' ? Number(po.renovacion.meses) || 0 : 0;
    const termino = mas(k.inicio, Number(k.plazoMeses) + extra); const limite = mas(termino, 0, -(Number(k.avisoDias) || 0));
    const periodo = { ipc_semestral: 6, ipc_anual: 12 }[k.reajuste] || 0; const rs = po.reajustes || [];
    return { k, po, termino, limite, periodo, reajustes: rs, proximo: periodo ? mas(rs.length ? rs[rs.length - 1].desde : k.inicio, periodo) : '' };
  }
  const personasDe = (n, p) => ({
    propietario: (p.vinculos || []).filter((v) => v.rol === 'propietario').map((v) => inmo.personaPorId(v.personaId)).filter(Boolean),
    arrendatario: n.clienteId ? [inmo.personaPorId(n.clienteId)].filter(Boolean) : [],
  });

  function preparar({ negocioId, tipo, destino }) {
    if (!TIPOS.includes(tipo)) throw err('Aviso desconocido.'); if (!DESTINOS.includes(destino)) throw err('Indica a quién se le avisa.');
    const n = negocios.ver(negocioId); if (n.tipo !== 'arriendo') throw err('Los avisos del postarriendo son de arriendos.');
    const p = inmo.todas().find((x) => x.id === n.propId); if (!p) throw err('El negocio no tiene propiedad.');
    const gente = personasDe(n, p)[destino]; const d = gente.find((x) => telWa(x.telefono)) || gente[0] || null; const quienTxt = destino === 'propietario' ? 'el propietario' : 'el arrendatario';
    if (!d) throw err(`La propiedad no tiene ${quienTxt} en su ficha: agrégalo para avisarle.`);
    if (!telWa(d.telefono)) throw err(`${d.nombre} no tiene celular en su ficha: agrégalo para avisarle por WhatsApp.`);
    const f = fechas(n); const cfg = inmo.config() || {}; const corredor = cfg.contacto?.nombre || cfg.corredor?.nombre || '';
    const dir = [p.direccion, p.unidad ? 'depto. ' + p.unidad : '', p.comuna].filter(Boolean).join(', ');
    const hola = `Hola ${primer(d.nombre)}, te escribe ${corredor || 'tu corredor'} por el arriendo de ${p.codigo}${dir ? ' (' + dir + ')' : ''}.`;
    const moneda = n.valor?.moneda || 'CLP'; const renta = f.po.rentaActual || n.valor?.valor; const arr = primer(personasDe(n, p).arrendatario[0]?.nombre);
    const ult = f.reajustes[f.reajustes.length - 1]; const dev = f.po.devolucion; const reno = f.po.renovacion;
    let L;
    if (tipo === 'reajuste') {
      const yaAvisado = !!ult && (f.po.avisos || []).some((x) => x.tipo === 'reajuste' && x.destino === destino && x.fecha >= (ult.registrado || ''));
      const proxQueda = !!f.periodo && f.proximo < f.termino;
      if (ult && (!yaAvisado || !proxQueda)) L = destino === 'arrendatario'
        ? [hola, '', `Te informo el reajuste de la renta según el contrato: a partir del ${fdmy(ult.desde)} la renta pasa de ${monto(ult.rentaAntes, moneda)} a ${monto(ult.rentaNueva, moneda)} (IPC ${String(ult.ipc).replace('.', ',')}%).`, '¿Me confirmas que lo recibiste?']
        : [hola, '', `Te aviso que se aplicó el reajuste de la renta${arr ? ' de ' + arr : ''}: desde el ${fdmy(ult.desde)} pasa de ${monto(ult.rentaAntes, moneda)} a ${monto(ult.rentaNueva, moneda)} (IPC ${String(ult.ipc).replace('.', ',')}%).`];
      else if (!proxQueda) throw err('Este contrato no se reajusta por IPC: no hay aviso de reajuste.');
      else L = destino === 'arrendatario'
        ? [hola, '', `Según el contrato, el ${fdmy(f.proximo)} corresponde reajustar la renta por IPC (cada ${f.periodo} meses). La renta actual es ${monto(renta, moneda)}; te enviaré el monto nuevo con el IPC vigente.`]
        : [hola, '', `Te aviso que el ${fdmy(f.proximo)} corresponde reajustar la renta${arr ? ' de ' + arr : ''} por IPC (cada ${f.periodo} meses). La renta actual es ${monto(renta, moneda)}; te confirmo el monto nuevo en cuanto lo calcule.`];
    } else if (tipo === 'renovacion') {
      if (reno) L = [hola, '', reno.decision === 'renovar' ? `Quedamos en renovar el contrato por ${reno.meses} meses, hasta el ${fdmy(f.termino)}. Gracias.` : `Dejamos registrado que el contrato no se renueva y termina el ${fdmy(f.termino)}. Coordinemos la entrega de la propiedad.`];
      else L = destino === 'arrendatario'
        ? [hola, '', `El contrato vence el ${fdmy(f.termino)}. Para renovarlo o terminarlo hay que avisar hasta el ${fdmy(f.limite)}.`, '¿Quieres renovarlo? Respóndeme por aquí.']
        : [hola, '', `El contrato${arr ? ' con ' + arr : ''} vence el ${fdmy(f.termino)} y hay que avisar hasta el ${fdmy(f.limite)} si no se renueva.`, '¿Lo renovamos o prefieres terminarlo? Respóndeme por aquí.'];
    } else {
      if (dev) L = destino === 'arrendatario'
        ? [hola, '', `Te informo la devolución de la garantía: se devuelven ${monto(dev.devuelto, dev.moneda)} el ${fdmy(dev.fechaDevolucion)}${dev.descuento ? `, con un descuento de ${monto(dev.descuento, dev.moneda)}${dev.motivo ? ' (' + dev.motivo + ')' : ''}` : ''}.`]
        : [hola, '', `Te aviso que se devolvió la garantía${arr ? ' a ' + arr : ''}: ${monto(dev.devuelto, dev.moneda)}${dev.descuento ? `, con un descuento de ${monto(dev.descuento, dev.moneda)}${dev.motivo ? ' (' + dev.motivo + ')' : ''}` : ''}.`];
      else L = destino === 'arrendatario'
        ? [hola, '', `El contrato termina el ${fdmy(f.termino)}. Coordinemos la entrega de la propiedad: la revisamos contra el inventario de la entrega y, según su estado, te devolvemos la garantía.`, '¿Qué día te acomoda?']
        : [hola, '', `El contrato termina el ${fdmy(f.termino)}. Coordinemos la recepción de la propiedad${arr ? ' con ' + arr : ''} para revisarla contra el inventario de la entrega y definir la devolución de la garantía.`, '¿Qué día te acomoda?'];
    }
    const texto = L.join('\n');
    return { texto, persona: { id: d.id, nombre: d.nombre, telefono: d.telefono || '' }, whatsapp: `https://wa.me/${telWa(d.telefono)}?text=${encodeURIComponent(texto)}` };
  }

  async function enviar({ negocioId, tipo, destino, texto, modo }) {
    const r = preparar({ negocioId, tipo, destino }); const t = String(texto || '').trim().slice(0, 1500) || r.texto; const n = negocios.ver(negocioId);
    let automatico = false;
    if (modo === 'abrir') abrir(`https://wa.me/${telWa(r.persona.telefono)}?text=${encodeURIComponent(t)}`);
    else { await reservas.enviarWhatsApp({ telefono: r.persona.telefono, nombre: r.persona.nombre, texto: t, revisar24: true }); automatico = true; }   // si WhatsApp no deja enviarlo, el error lo explica y queda «Abrir en WhatsApp»
    const ciclo = JSON.parse(JSON.stringify(n.ciclo || {})); ciclo.postarriendo ||= {};
    ciclo.postarriendo.avisos = [...(ciclo.postarriendo.avisos || []), { tipo, destino, persona: r.persona.nombre, fecha: new Date().toISOString(), automatico }].slice(-60);
    negocios.guardarCiclo(n.id, ciclo);
    const que = { reajuste: 'el reajuste', renovacion: 'la renovación o término', devolucion: 'la devolución de la garantía' }[tipo];
    inmo.registrar(n.id, `Aviso de ${que} enviado por WhatsApp a ${r.persona.nombre}${automatico ? '' : ' (abierto en WhatsApp)'}`, { ref2: n.propId }); inmo.guardar();
    return { ok: true, automatico, persona: r.persona };
  }
  return { preparar, enviar, fechas };
}
module.exports = { crear };
