// API de Mercado Libre simulada para pruebas (PF_ML_MOCK=1). Usa los ids reales de categorías y ubicaciones de Chile
// consultados el 12/10/2026 y valida lo mismo que exige la API real para inmuebles.
const S = { items: {}, n: 3000000000, uid: 999001, refresh: 0, leadsEntregados: false };
const cat = (id, name, children = [], extra = {}) => ({ id, name, children_categories: children.map(([i, n]) => ({ id: i, name: n })), settings: { max_title_length: 60, currencies: ['CLP', 'USD', 'CLF'] }, ...extra });
const CATS = {
  MLC1459: cat('MLC1459', 'Inmuebles', [['MLC1466', 'Casas'], ['MLC1472', 'Departamentos'], ['MLC1478', 'Oficinas'], ['MLC1496', 'Parcelas'], ['MLC50610', 'Locales']]),
  MLC1466: cat('MLC1466', 'Casas', [['MLC6406', 'Arriendo'], ['MLC116364', 'Arriendo Temporal'], ['MLC5628', 'Venta']]),
  MLC1472: cat('MLC1472', 'Departamentos', [['MLC6407', 'Arriendo'], ['MLC116367', 'Arriendo Temporal'], ['MLC1480', 'Venta']]),
  MLC1478: cat('MLC1478', 'Oficinas', [['MLC1479', 'Arriendo'], ['MLC1481', 'Venta']]),
  MLC1496: cat('MLC1496', 'Parcelas', [['MLC1497', 'Arriendo'], ['MLC1498', 'Venta']]),
  MLC50610: cat('MLC50610', 'Locales', [['MLC50611', 'Arriendo'], ['MLC50612', 'Venta']]),
  MLC1480: cat('MLC1480', 'Venta', [['MLC157522', 'Propiedades usadas'], ['MLC157523', 'Proyectos']]),
  MLC5628: cat('MLC5628', 'Venta', [['MLC157520', 'Propiedades usadas'], ['MLC157521', 'Proyectos']]),
};
for (const id of ['MLC6406', 'MLC6407', 'MLC1479', 'MLC1481', 'MLC1497', 'MLC1498', 'MLC50611', 'MLC50612', 'MLC157522', 'MLC157520']) CATS[id] ||= cat(id, 'Hoja');
const A = (id, name, req) => ({ id, name, tags: req ? { required: true } : {} });
const ATTRS_VIV = [A('TOTAL_AREA', 'Superficie total', 1), A('COVERED_AREA', 'Superficie útil', 1), A('BEDROOMS', 'Dormitorios', 1), A('FULL_BATHROOMS', 'Baños', 1), A('PARKING_LOTS', 'Estacionamientos', 1), A('WAREHOUSES', 'Bodegas'), A('FURNISHED', 'Amoblado'), A('MAINTENANCE_FEE', 'Gastos comunes'), A('PROPERTY_CODE', 'Código'), A('CMG_SITE', 'Site de origen')];
const ATTRS_OTRO = [A('TOTAL_AREA', 'Superficie total', 1), A('COVERED_AREA', 'Superficie útil'), A('FULL_BATHROOMS', 'Baños'), A('PARKING_LOTS', 'Estacionamientos'), A('PROPERTY_CODE', 'Código'), A('CMG_SITE', 'Site de origen')];
const RM = 'TUxDUE1FVEExM2JlYg';
const CITIES = { TUxDQ0NPTGNkMWZj: 'Colina', TUxDQ0xBUzU2MTEz: 'Las Condes', TUxDQ0xPIGUzZDM3: 'Lo Barnechea', TUxDQ1BST2NhYjU3: 'Providencia', TUxDQ1BJUmQ1ZTk1: 'Pirque', TUxDQ8ORVTEzNTk: 'Ñuñoa' };
const ok = (json) => ({ status: 200, json }); const bad = (status, message, cause = []) => ({ status, json: { message, error: 'bad_request', status, cause } });
let LEAD_N = 0;
module.exports = async function http(method, url, { token, body, form } = {}) {
  await new Promise((r) => setTimeout(r, 40));
  const u = new URL(url); const p = u.pathname;
  if (p === '/oauth/token') {
    if (form.grant_type === 'authorization_code' && form.code !== 'mock-code') return bad(400, 'invalid_grant');
    S.refresh++; return ok({ access_token: 'APP_USR-mock-' + S.refresh, refresh_token: 'TG-mock-' + S.refresh, expires_in: 21600, user_id: S.uid, scope: 'offline_access read write' });
  }
  if (p.startsWith('/categories/')) { const m = p.match(/^\/categories\/(\w+)(\/attributes)?$/); const c = CATS[m[1]]; if (!c) return bad(404, 'Category not found'); if (m[2]) return ok(['MLC157522', 'MLC157520', 'MLC6406', 'MLC6407'].includes(m[1]) ? ATTRS_VIV : ATTRS_OTRO); return ok(c); }
  if (p === '/classified_locations/countries/CL') return ok({ id: 'CL', states: [{ id: 'TUxDUFZBTE84MDVj', name: 'Valparaíso' }, { id: RM, name: 'RM (Metropolitana)' }, { id: 'TUxDUENISTI1Y2hpMg', name: 'China' }] });
  if (p === '/classified_locations/states/' + RM) return ok({ id: RM, cities: Object.entries(CITIES).map(([id, name]) => ({ id, name })) });
  if (p.startsWith('/classified_locations/states/')) return ok({ cities: [{ id: 'TUxDQ1ZJ', name: 'Viña del Mar' }] });
  if (p.startsWith('/classified_locations/cities/')) return ok({ id: p.split('/').pop(), neighborhoods: p.endsWith('TUxDQ0xBUzU2MTEz') ? [{ id: 'TVhYQmFycmlvIEVsIEdvbGY', name: 'Barrio El Golf' }, { id: 'TVhYRXN0b3JpbA', name: 'Estoril' }] : [] });
  // desde aquí, con token
  if (!/^APP_USR-mock-/.test(token || '')) return { status: 401, json: { message: 'invalid access token' } };
  { const mv = p.match(/^\/items\/(\w+)\/(visits|contacts\/phone_views)\/time_window$/); if (mv) { const seed = [...mv[1]].reduce((x, c) => x + c.charCodeAt(0), 0); const dias = Number(u.searchParams.get('last')) || 30; const serie = Array.from({ length: dias }, (_, i) => ({ date: new Date(Date.now() - (dias - 1 - i) * 864e5).toISOString(), total: (seed + i * 7) % (mv[2] === 'visits' ? 9 : 2) })); const tot = serie.reduce((x, y) => x + y.total, 0); return ok(mv[2] === 'visits' ? { item_id: mv[1], total_visits: tot, last: dias, unit: 'day', results: serie } : { item_id: mv[1], total: tot, results: serie }); } }
  if (p === '/users/me') return ok({ id: S.uid, nickname: 'CORREDORA_DEMO', email: 'corredora@demo.cl' });
  if (p.startsWith(`/users/${S.uid}/classifieds_promotion_packs/`)) return ok([{ listing_type_id: p.split('/').pop(), remaining_listings: p.endsWith('silver') ? 25 : 0, used_listings: 5 }]);
  if (p === `/users/${S.uid}/items/search`) { const ids = ['MLC1999000001', ...Object.keys(S.items)]; return ok({ results: ids, paging: { total: ids.length } }); }
  if (p === '/items' && method === 'POST') {
    const b = body; const sc = b.seller_contact || {};
    if (!sc.country_code2) return bad(400, 'Validation error', [{ code: 'seller_contact.country_code2.required', message: 'country_code2 es obligatorio' }]);
    if (!/^\d+$/.test(sc.phone2 || '')) return bad(400, 'Validation error', [{ code: 'seller_contact.phone2.invalid', message: 'phone2 inválido' }]);
    if (!(b.attributes || []).some((a) => a.id === 'CMG_SITE' && a.value_name === 'POI')) return bad(400, 'falta CMG_SITE');
    if (!b.pictures?.length) return bad(400, 'Validation error', [{ code: 'item.pictures.required', message: 'Se requiere al menos una imagen' }]);
    if (String(b.title).length > 60) return bad(400, 'Validation error', [{ code: 'item.title.length', message: 'Título demasiado largo' }]);
    if (!b.location?.city?.id) return bad(400, 'location.city requerido');
    const id = 'MLC' + (++S.n); S.items[id] = { ...b, id, status: 'active', permalink: `https://www.portalinmobiliario.com/MLC-${S.n}-${String(b.title).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-_JM` };
    return ok(S.items[id]);
  }
  const mi = p.match(/^\/items\/(MLC\d+)(\/description)?$/);
  if (mi && method === 'PUT') { const it = S.items[mi[1]] || (mi[1] === 'MLC1999000001' ? (S.items[mi[1]] = existente()) : null); if (!it) return bad(404, 'item not found'); if (mi[2]) { it.description = body; return ok(it); } if (it.status === 'closed' && body.status) return bad(400, 'Item closed'); Object.assign(it, body); return ok(it); }
  if (p === '/items' && method === 'GET') { const ids = u.searchParams.get('ids').split(','); return ok(ids.map((id) => (S.items[id] ? { code: 200, body: S.items[id] } : id === 'MLC1999000001' ? { code: 200, body: existente() } : { code: 404 }))); }
  if (p === `/vis/users/${S.uid}/leads/buyers`) {
    const pub = Object.values(S.items).filter((i) => i.id !== 'MLC1999000001');
    if (Number(u.searchParams.get('offset')) > 0 || !pub.length) return ok({ results: [] });
    const it = pub[0];
    return ok({ results: [
      { id: 1914813422, item_id: it.id, name: 'Rosa Fuentes Lara', email: 'rosa@demo.cl', phone: '+56 9 7777 6666', identification_number: '15.555.555-6', identification_type: 'RUT', leads: [{ id: 'lead-1', channel: 'whatsapp', created_at: new Date().toISOString(), item_id: it.id, status: 'active' }, { id: 'lead-2', channel: 'schedule', created_at: new Date().toISOString(), item_id: it.id }] },
      { id: 1554225116, item_id: it.id, name: 'Pedro Guest', email: 'pedro@demo.cl', phone: '+56 9 5555 4444', leads: [{ id: 'lead-' + (3 + LEAD_N), channel: 'question', created_at: new Date().toISOString(), item_id: it.id }] },
    ] });
  }
  return bad(404, 'mock: ruta no simulada ' + method + ' ' + p);
};
// Aviso que la corredora ya tenía publicado desde Convecta (para probar la vinculación sin duplicar).
function existente() { return S.items.MLC1999000001 || { id: 'MLC1999000001', title: 'Depto amoblado Providencia', price: 950000, currency_id: 'CLP', status: 'active', permalink: 'https://www.portalinmobiliario.com/MLC-1999000001-depto-_JM', seller_custom_field: '', attributes: [{ id: 'PROPERTY_CODE', value_name: 'CV-9002' }, { id: 'OPERATION', value_name: 'Arriendo' }] }; }
module.exports._state = S;
