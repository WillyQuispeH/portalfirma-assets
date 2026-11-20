// Prueba del adaptador de KONVER (src/portales/konver.js) sin Electron ni servidor de Asset: se simulan electron, inmo, asset y
// wa-servidor; asset.llamar('POST', '/konver/api') responde como KONVER. Con KONVER_LLAVE en el entorno, además valida (sin
// publicar) una propiedad contra la API real de KONVER.   node test/konver-unit.js
const assert = require('assert');
const Module = require('module');
const path = require('path');
const src = path.join(__dirname, '..', 'src');
const LLAVE = process.env.KONVER_LLAVE || '';
const URL_K = 'https://konver-portales-76790408323.us-central1.run.app';

const props = [{ id: 'p1', codigo: 'AS-101', titulo: 'Departamento luminoso de 3 dormitorios con vista despejada en Las Condes', tipo: 'departamento', venta: true, arriendo: false,
  precioVenta: { valor: 8500, moneda: 'UF' }, direccion: 'Av. Apoquindo 4500, Las Condes', unidad: '1202', comuna: 'Las Condes', region: 'Región Metropolitana de Santiago',
  lat: -33.41, lng: -70.58, supTotal: 110, supUtil: 98, dormitorios: 3, banos: 2, estacionamientos: 1, bodegas: 1, gastosComunes: 180000,
  descripcion: 'Amplio departamento con living comedor, cocina equipada y terraza con vista a la cordillera. Cerca del metro.',
  fotos: ['https://picsum.photos/id/10/800/600.jpg', 'https://picsum.photos/id/11/800/600.jpg', 'https://picsum.photos/id/12/800/600.jpg'], ficha: { mascotas: true, pisoUnidad: 12 }, portales: {} }];
let config = { contacto: { nombre: 'Corredora Prueba', email: 'prueba@correo.cl', whatsapp: '+56 9 1234 5678' }, ml: { tipoAviso: 'silver' } };
const llamadas = [];
const LEADS = [
  { id: 124, portal: 'toctoc', fecha: '2026-11-18T16:18:36Z', tipo: 'Contactar con mensaje', propiedad_id: 'AS-101-V', referencia: 'AS-101-V', nombre: 'María Pérez', email: 'maria@correo.cl', telefono: '+56912345678', mensaje: '¿Sigue disponible?' },
  { id: 125, portal: 'portal_inmobiliario', fecha: '2026-11-18T17:00:00Z', tipo: 'whatsapp', propiedad_id: 'MLC999', referencia: '', nombre: 'Juan Soto', telefono: '+56987654321' },
  { id: 126, portal: 'portal_inmobiliario', tipo: 'question', propiedad_id: 'MLC000', referencia: '', nombre: 'Otro' },
];
function konverFalso(c) {
  const k = `${c.metodo} ${c.ruta.split('?')[0]}`;
  const pi = { publicado: true, id: 'MLC999', estado: 'active', url: 'https://departamento.mercadolibre.cl/MLC-999', tipo_publicacion: 'silver' };
  switch (k) {
    case 'GET /v1/ubicaciones/regiones': return { status: 200, cuerpo: [{ id: 'x', nombre: 'Metropolitana' }, { id: 'y', nombre: 'Valparaíso' }] };
    case 'POST /v1/propiedades/validar': return { status: 200, cuerpo: { referencia: c.cuerpo.referencia, destinos: Object.fromEntries(c.cuerpo.destinos.map((d) => [d, { valido: true }])) } };
    case 'POST /v1/propiedades': return { status: 201, cuerpo: { referencia: c.cuerpo.referencia, destinos: c.cuerpo.destinos.includes('toctoc') ? { toctoc: { publicado: true, http: 200 } } : { portal_inmobiliario: pi } } };
    case 'PATCH /v1/portal-inmobiliario/propiedades/MLC999': return { status: 200, cuerpo: { id: 'MLC999', estado: 'active', url: pi.url } };
    case 'POST /v1/portal-inmobiliario/propiedades/MLC999/pausar': return { status: 200, cuerpo: { id: 'MLC999', estado: 'paused' } };
    case 'DELETE /v1/toctoc/propiedades/AS-101-V': return { status: 200, cuerpo: { ok: true } };
    case 'DELETE /v1/cuenta/mercadolibre': return { status: 200, cuerpo: { conectado: false, usuario_ml: '1', permiso_revocado_en_mercadolibre: true } };
    case 'DELETE /v1/cuenta/toctoc': return { status: 200, cuerpo: { conectado: false } };
    case 'GET /v1/portal-inmobiliario/propiedades': return { status: 200, cuerpo: [] };
    case 'GET /v1/portal-inmobiliario/propiedades/MLC999': return { status: 200, cuerpo: { id: 'MLC999', estado: 'paused' } };
    case 'GET /v1/leads': {
      const desde = Number(new URLSearchParams(c.ruta.split('?')[1]).get('despues_de') || 0);
      const l = LEADS.filter((x) => x.id > desde);
      return { status: 200, cuerpo: { leads: l, siguiente: l.length ? l[l.length - 1].id : desde, hay_mas: false } };
    }
    default: return { status: 404, cuerpo: { detail: { error: 'no_existe', mensaje: k } } };
  }
}
const falso = {
  electron: { shell: { openExternal: async () => {} } },
  '../inmo': {
    obtener: (id) => props.find((p) => p.id === id), todas: () => props, config: () => config, guardarConfig: (c) => { config = { ...config, ...c }; }, guardar: () => {},
    parchear: (id, fn) => { const p = props.find((x) => x.id === id); fn(p); return p; },
    registrarLead: (id, l) => { const p = props.find((x) => x.id === id); p.leads ||= []; if (p.leads.some((x) => x.id === l.id)) return false; p.leads.push(l); return true; },
  },
  '../wa-servidor': { enApi: () => true },
  '../asset': {
    llamar: async (m, ruta, cuerpo) => {
      llamadas.push({ m, ruta, cuerpo });
      if (ruta === '/konver/conexion') return { conectado: true, propia: true, admin: true, cuenta: { cliente: 'Prueba', portal_inmobiliario: { conectado: true, usuario_ml: '1', nickname: 'PRUEBA', tipos_publicacion: [{ id: 'silver', restantes: 5 }] }, toctoc: { conectado: true, plan_activo: true } } };
      if (ruta !== '/konver/api') throw new Error('ruta inesperada ' + ruta);
      if (LLAVE && /^\/v1\/(ubicaciones|propiedades\/validar)/.test(cuerpo.ruta)) { // la API real (solo lectura y validación)
        const r = await fetch(URL_K + cuerpo.ruta, { method: cuerpo.metodo, headers: { 'x-api-key': LLAVE, 'content-type': 'application/json' }, body: cuerpo.cuerpo ? JSON.stringify(cuerpo.cuerpo) : undefined });
        return { status: r.status, cuerpo: await r.json().catch(() => null) };
      }
      return konverFalso(cuerpo);
    },
  },
};
const orig = Module._load;
Module._load = function (req, parent, isMain) { if (falso[req]) return falso[req]; return orig.call(this, req, parent, isMain); };
const kv = require(path.join(src, 'portales', 'konver'));

(async () => {
  assert.deepStrictEqual(kv._calleNumero('Av. Apoquindo 4500, Las Condes'), { calle: 'Av. Apoquindo', numero: '4500' });
  assert.deepStrictEqual(kv._calleNumero('Los Leones N° 123 depto 5'), { calle: 'Los Leones', numero: '123' });
  assert.strictEqual(kv._calleNumero('Camino sin número').numero, '');
  assert.strictEqual(kv._referencia({ codigo: 'AS 101/b' }, 'arriendo'), 'AS-101-b-A');
  assert.strictEqual(kv._motivo({ detail: [{ loc: ['body', 'ubicacion', 'numero'], msg: 'Field required' }] }, 422), 'ubicacion.numero: Field required');

  await kv.estado();
  const a = await kv._armar(props[0], 'venta', ['portal_inmobiliario', 'toctoc']);
  assert.deepStrictEqual(a.errores, [], a.errores.join(' | '));
  assert.match(a.cuerpo.ubicacion.region, /Metropolitana/);
  assert.strictEqual(a.cuerpo.contacto.telefono, '+56912345678');
  assert.strictEqual(a.cuerpo.tipo, 'departamento'); assert.ok(a.cuerpo.titulo.length <= 60);
  assert.deepStrictEqual(a.cuerpo.precio, { monto: 8500, moneda: 'UF' }); assert.strictEqual(a.cuerpo.admite_mascotas, true);

  if (LLAVE) { // la validación real (no publica): la cuenta aún no conecta los portales, así que se revisa el formato
    const r = await fetch(URL_K + '/v1/propiedades/validar', { method: 'POST', headers: { 'x-api-key': LLAVE, 'content-type': 'application/json' }, body: JSON.stringify(a.cuerpo) });
    const j = await r.json(); console.log('KONVER validar →', r.status, JSON.stringify(j).slice(0, 700));
    assert.ok(!Array.isArray(j.detail), 'KONVER rechazó el formato: ' + JSON.stringify(j.detail));
    console.log('barrios de Las Condes →', JSON.stringify((await kv.barrios('Las Condes', 'Región Metropolitana de Santiago')).slice(0, 3)));
  } else { // publicar, actualizar, pausar, TOCTOC y leads con KONVER simulado
    const p = await kv.publicar('p1', 'venta', {});
    assert.strictEqual(p.portales.pi.venta.itemId, 'MLC999');
    await kv.publicar('p1', 'venta', {}); // ya publicado: PATCH, no otro aviso
    assert.ok(llamadas.some((l) => l.cuerpo?.metodo === 'PATCH'));
    assert.strictEqual(llamadas.filter((l) => l.cuerpo?.metodo === 'POST' && l.cuerpo.ruta === '/v1/propiedades').length, 1);
    await kv.cambiarEstado('p1', 'venta', 'paused');
    assert.strictEqual(props[0].portales.pi.venta.status, 'paused');
    await kv.toctocPublicar('p1', 'venta');
    assert.strictEqual(props[0].portales.toctoc.venta.status, 'active');
    await kv.toctocRetirar('p1', 'venta', 'pausada');
    assert.strictEqual(props[0].portales.toctoc.venta.status, 'pausada');
    const s = await kv.sincronizar();
    assert.strictEqual(s.leads, 2); assert.strictEqual(config.konver.leadsCursor, 126);
    assert.deepStrictEqual(props[0].leads.map((l) => l.portal).sort(), ['Portal Inmobiliario', 'TOCTOC']);
    assert.strictEqual(await kv.traerLeads(), 0); // no se repiten
    props[0].direccion = 'Av. Apoquindo';
    const r2 = await kv.revisar('p1', 'venta');
    assert.ok(r2.errores.some((e) => /número/.test(e)));
    // desconectar cada portal por separado (DELETE /v1/cuenta/mercadolibre y /v1/cuenta/toctoc), sin tocar la llave de KONVER
    const d1 = await kv.desconectar();
    assert.ok(llamadas.some((l) => l.cuerpo?.metodo === 'DELETE' && l.cuerpo?.ruta === '/v1/cuenta/mercadolibre'), 'desconectar pide DELETE /v1/cuenta/mercadolibre');
    assert.ok(d1 && 'conectada' in d1, 'desconectar devuelve el estado');
    await kv.toctocDesconectar();
    assert.ok(llamadas.some((l) => l.cuerpo?.metodo === 'DELETE' && l.cuerpo?.ruta === '/v1/cuenta/toctoc'), 'toctocDesconectar pide DELETE /v1/cuenta/toctoc');
    assert.ok(!llamadas.some((l) => l.m === 'DELETE' && l.ruta === '/konver/conexion'), 'la llave de KONVER no se quita');
  }
  console.log('konver-unit OK');
})().catch((e) => { console.error(e); process.exit(1); });
