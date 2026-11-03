// Direcciones: autocompletado de Google (Places API «New») con la clave de la corredora, para cargar unidades rápido
// y guardar sus coordenadas (geolocalización). Sin clave, búsqueda con OpenStreetMap (Nominatim), solo al pedirla
// con un botón: su política no permite autocompletar letra a letra (máx. 1 consulta por segundo).
const GOOGLE = 'https://places.googleapis.com/v1';
const OSM = 'https://nominatim.openstreetmap.org/search';
const UA = 'PortalFirmaAsset/0.9 (+https://portalfirma.cl)';
const err = (m, code) => Object.assign(new Error(m), code ? { code } : {});

// respuestas de prueba (PF_MOCK)
const MOCK_SUG = [
  { placeId: 'mock-prov-1234', principal: 'Avenida Providencia 1234', secundario: 'Providencia, Región Metropolitana' },
  { placeId: 'mock-prov-1240', principal: 'Avenida Providencia 1240', secundario: 'Providencia, Región Metropolitana' },
];
const MOCK_DET = { 'mock-prov-1234': { direccion: 'Avenida Providencia 1234', comuna: 'Providencia', region: 'Región Metropolitana', lat: -33.4295, lng: -70.6162, completa: 'Av. Providencia 1234, Providencia, Región Metropolitana, Chile' },
  'mock-prov-1240': { direccion: 'Avenida Providencia 1240', comuna: 'Providencia', region: 'Región Metropolitana', lat: -33.4293, lng: -70.6158, completa: 'Av. Providencia 1240, Providencia, Región Metropolitana, Chile' } };

function crear({ store, mock = false, fetchFn = (...a) => fetch(...a) }) {
  const clave = () => store.getSecret('googleMapsKey') || null;
  let ultimaOSM = 0;

  async function google(path, { method = 'GET', body, campos, k = clave() } = {}) {
    const r = await fetchFn(GOOGLE + path, { method, headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': k, ...(campos ? { 'X-Goog-FieldMask': campos } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(12000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const m = j.error?.message || `HTTP ${r.status}`;
      if (/API key not valid|API_KEY_INVALID/i.test(m)) throw err('La clave de Google no es válida. Revísala en Google Cloud.', 'CLAVE');
      if (/not been used|disabled|SERVICE_DISABLED|Places API \(New\)/i.test(m) || j.error?.status === 'PERMISSION_DENIED') throw err('La clave no tiene habilitada la «Places API (New)». Actívala en Google Cloud (APIs y servicios) y vuelve a intentar.', 'CLAVE');
      if (/billing/i.test(m)) throw err('El proyecto de Google no tiene la facturación activa. Actívala en Google Cloud.', 'CLAVE');
      throw err('Google: ' + m);
    }
    return j;
  }

  const estado = () => ({ google: mock ? !!store.get('googleMapsMock') || !!clave() : !!clave() });

  async function configurar(k) {
    k = String(k || '').trim();
    if (!k) { store.setSecret('googleMapsKey', undefined); store.set('googleMapsMock', undefined); return estado(); }
    if (!/^[A-Za-z0-9_-]{30,60}$/.test(k)) throw err('Eso no parece una clave de Google (empieza con «AIza…»).');
    if (mock) { store.set('googleMapsMock', true); store.setSecret('googleMapsKey', k); return estado(); }
    await google('/places:autocomplete', { method: 'POST', body: { input: 'Providencia', includedRegionCodes: ['cl'] }, k }); // prueba la clave antes de guardarla
    store.setSecret('googleMapsKey', k); return estado();
  }

  // sugerencias mientras se escribe (Google). `sesion` agrupa las consultas de una búsqueda con su detalle (así cobra Google)
  async function sugerir(texto, sesion) {
    texto = String(texto || '').trim(); if (texto.length < 3) return [];
    if (!estado().google) throw err('Sin clave de Google.', 'SIN_CLAVE');
    if (mock) return MOCK_SUG;
    const j = await google('/places:autocomplete', { method: 'POST', body: { input: texto, includedRegionCodes: ['cl'], languageCode: 'es', regionCode: 'cl', sessionToken: sesion || undefined } });
    return (j.suggestions || []).map((s) => s.placePrediction).filter(Boolean).slice(0, 6)
      .map((p) => ({ placeId: p.placeId, principal: p.structuredFormat?.mainText?.text || p.text?.text || '', secundario: p.structuredFormat?.secondaryText?.text || '' }));
  }

  // detalle de la dirección elegida: calle y número, comuna, región y coordenadas
  async function detalle(placeId, sesion) {
    if (mock) { const d = MOCK_DET[placeId]; if (!d) throw err('Dirección no encontrada.'); return { ...d, placeId, fuente: 'google' }; }
    const j = await google(`/places/${encodeURIComponent(placeId)}?languageCode=es&regionCode=cl${sesion ? '&sessionToken=' + encodeURIComponent(sesion) : ''}`, { campos: 'addressComponents,location,formattedAddress' });
    const c = (t) => (j.addressComponents || []).find((x) => (x.types || []).includes(t))?.longText || '';
    const calle = c('route'); const num = c('street_number');
    return { direccion: [calle, num].filter(Boolean).join(' ') || (j.formattedAddress || '').split(',')[0], comuna: c('administrative_area_level_3') || c('locality') || c('sublocality') || c('administrative_area_level_2'),
      region: c('administrative_area_level_1'), lat: j.location?.latitude ?? null, lng: j.location?.longitude ?? null, completa: j.formattedAddress || '', placeId, fuente: 'google' };
  }

  // sin clave: OpenStreetMap, una búsqueda al apretar el botón
  async function buscarLibre(texto) {
    texto = String(texto || '').trim(); if (texto.length < 4) throw err('Escribe la calle y el número.');
    if (mock) return [{ ...MOCK_DET['mock-prov-1234'], fuente: 'osm' }];
    const espera = 1100 - (Date.now() - ultimaOSM); if (espera > 0) await new Promise((r) => setTimeout(r, espera)); ultimaOSM = Date.now();
    const u = `${OSM}?format=jsonv2&addressdetails=1&countrycodes=cl&limit=5&accept-language=es&q=${encodeURIComponent(texto)}`;
    const r = await fetchFn(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12000) }); if (!r.ok) throw err(`OpenStreetMap no respondió (HTTP ${r.status}).`);
    return (await r.json()).map((x) => { const a = x.address || {};
      return { direccion: [a.road, a.house_number].filter(Boolean).join(' ') || String(x.display_name || '').split(',')[0], comuna: a.city || a.town || a.village || a.municipality || a.suburb || '', region: a.state || '',
        lat: Number(x.lat), lng: Number(x.lon), completa: x.display_name || '', fuente: 'osm' }; });
  }

  return { estado, configurar, sugerir, detalle, buscarLibre };
}

module.exports = { crear };
