// 0.16.23 · Corredores de la cuenta (lista propia de Asset): a quién pertenece cada lead. Se vinculan con su usuario de
// wechatia para tomar el «Propietario» que allá tenga cada contacto.
'use strict';
const err = (m, code) => Object.assign(new Error(m), code ? { code } : {});
const dig = (t) => String(t || '').replace(/\D/g, '');
function crear({ store, res = null }) {
  const lista = () => store.get('corredores') || [];
  function guardar(o = {}) {
    const l = lista(); const nombre = String(o.nombre || '').trim().replace(/\s+/g, ' ');
    if (!nombre) throw err('Indica el nombre del corredor.');
    const celular = String(o.celular || '').trim(); if (celular && (dig(celular).length < 8 || dig(celular).length > 15)) throw err('El celular no es válido.');
    const email = String(o.email || '').trim().toLowerCase(); if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw err('El correo no es válido.');
    const datos = { nombre, celular, email, wechatiaId: String(o.wechatiaId || '').trim() || null, wechatiaNombre: String(o.wechatiaNombre || '').trim() || null };
    if (o.id) { const c = l.find((x) => x.id === o.id); if (!c) throw err('Ese corredor ya no existe.'); Object.assign(c, datos); store.set('corredores', l); return c; }
    if (l.some((x) => x.nombre.toLowerCase() === nombre.toLowerCase())) throw err('Ya hay un corredor con ese nombre.');
    const c = { id: 'co' + Date.now().toString(36), ...datos, creado: new Date().toISOString() }; l.push(c); store.set('corredores', l); return c;
  }
  function borrar(id) { store.set('corredores', lista().filter((x) => x.id !== id)); return true; }
  const porWechatia = (uid) => (uid ? lista().find((c) => c.wechatiaId === uid) || null : null);
  // usuarios de wechatia (para vincular); si la clave no tiene permiso de usuarios, se avisa
  async function usuariosWechatia() {
    if (!res) return { usuarios: [], error: 'wechatia no está disponible.' };
    try { const j = await res.api('GET', `/users/?locationId=${encodeURIComponent(res.locationId() || '')}`);
      const us = (j.users || []).map((u) => ({ id: u.id, nombre: u.name || [u.firstName, u.lastName].filter(Boolean).join(' '), email: (u.email || '').toLowerCase(), telefono: u.phone || '' }));
      // vínculo automático por correo
      const l = lista(); let cambio = false; for (const c of l) if (!c.wechatiaId && c.email) { const u = us.find((x) => x.email === c.email); if (u) { c.wechatiaId = u.id; c.wechatiaNombre = u.nombre; cambio = true; } } if (cambio) store.set('corredores', l);
      return { usuarios: us };
    } catch (e) { return { usuarios: [], error: /permiso|CLAVE|401|403/i.test(e.message + (e.code || '')) ? 'La clave de wechatia no tiene permiso para ver usuarios: agrega «Ver usuarios» a la integración privada, o escribe a mano el ID de usuario.' : e.message }; }
  }
  return { lista, guardar, borrar, porWechatia, usuariosWechatia };
}
module.exports = { crear };
