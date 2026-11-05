// Prueba de punta a punta de fotos y documentos en R2, contra la API corriendo (yarn dev), asset_dev y el bucket real.
// Crea una propiedad E2E, sube una foto y un documento, los baja, los quita y revisa que se borren de R2. Al final
// borra todo lo que creó (también los archivos). Uso: node test/archivos-e2e.js [url]
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/).map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2].trim()]),
);
const B = (process.argv[2] || 'http://localhost:3000') + '/v1';
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
const req = async (metodo, ruta, cuerpo, token) => {
  const r = await fetch(B + ruta, { method: metodo, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { s: r.status, j };
};
const put = (url, buf, tipo) => fetch(url, { method: 'PUT', headers: { 'content-type': tipo }, body: buf });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
// el borrado en R2 va en segundo plano: se reintenta un rato
async function hasta(fn, ms = 8000) { const fin = Date.now() + ms; while (Date.now() < fin) { if (await fn()) return true; await esperar(400); } return false; }

// una imagen JPEG mínima válida (1×1)
const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

(async () => {
  const db = new PrismaClient();
  const creados = { props: [], claves: [] };
  try {
    const adm = (await req('POST', '/auth/ingresar', { email: env.SEMBRAR_ADMIN_EMAIL, clave: env.SEMBRAR_ADMIN_CLAVE })).j.tokenAcceso;
    ok(adm, 'ingresa el administrador');
    let r = await req('POST', '/propiedades', { titulo: `E2E Archivos ${Date.now().toString(36)}`, tipo: 'casa', venta: true }, adm);
    ok(r.s === 201, 'crea una propiedad de prueba');
    const p = r.j; creados.props.push(p.id);

    // ---- fotos
    ok((await req('POST', `/propiedades/${p.id}/fotos/subidas`, { archivos: [{ tipo: 'image/gif', tamano: 10 }] }, adm)).s === 400, 'rechaza un tipo de imagen no permitido');
    ok((await req('POST', `/propiedades/${p.id}/fotos/subidas`, { archivos: [{ tipo: 'image/jpeg', tamano: 99e6 }] }, adm)).s === 400, 'rechaza una foto demasiado grande');
    r = await req('POST', `/propiedades/${p.id}/fotos/subidas`, { archivos: [{ tipo: 'image/jpeg', tamano: JPG.length }] }, adm);
    ok(r.s === 201 && r.j.subidas.length === 1, 'entrega la subida firmada de la foto');
    const foto = r.j.subidas[0];
    ok(foto.url.startsWith(env.R2_DOMAIN.replace(/\/+$/, '') + '/c/'), 'la foto tendrá una URL pública del bucket');
    creados.claves.push(foto.url.slice(env.R2_DOMAIN.replace(/\/+$/, '').length + 1));
    ok((await put(foto.subida, Buffer.concat([JPG, Buffer.from('x')]), 'image/jpeg')).status >= 400, 'R2 rechaza un archivo de otro tamaño que el declarado');
    let s = await put(foto.subida, JPG, 'image/jpeg');
    ok(s.ok, `sube la foto directo a R2 (${s.status})`);
    r = await req('PATCH', `/propiedades/${p.id}`, { fotos: [foto.url, 'https://ejemplo.cl/externa.jpg'] }, adm);
    ok(r.s === 200 && r.j.fotos[0] === foto.url, 'la foto queda en la propiedad');
    const pub = await hasta(async () => (await fetch(foto.url)).ok, 15000);
    ok(pub, 'la foto se ve en la URL pública');
    r = await req('PATCH', `/propiedades/${p.id}`, { fotos: [env.R2_DOMAIN.replace(/\/+$/, '') + '/c/00000000-0000-0000-0000-000000000000/p/x/fotos/y.jpg'] }, adm);
    ok(r.s === 400, 'no acepta una foto del bucket que sea de otra corredora');
    r = await req('PATCH', `/propiedades/${p.id}`, { fotos: ['https://ejemplo.cl/externa.jpg'] }, adm);
    ok(r.s === 200 && r.j.fotos.length === 1, 'quitar la foto la saca de la propiedad');
    ok(await hasta(async () => (await fetch(foto.url, { cache: 'no-store' })).status === 404, 20000), 'y se borra de R2');

    // ---- documentos
    const nombre = 'Mandato de venta – Ñuñoa.pdf';
    r = await req('POST', `/propiedades/${p.id}/documentos/subida`, { nombre, tipoArchivo: 'application/pdf', tamano: PDF.length }, adm);
    ok(r.s === 201 && r.j.clave.includes(`/p/${p.id}/docs/`) && r.j.clave.endsWith('.pdf'), 'entrega la subida firmada del documento');
    const { clave, subida } = r.j; creados.claves.push(clave);
    r = await req('POST', `/propiedades/${p.id}/documentos`, { clave, nombre, tipo: 'mandato', tamano: PDF.length }, adm);
    ok(r.s === 400, 'no confirma un documento que no se subió');
    s = await put(subida, PDF, 'application/pdf');
    ok(s.ok, 'sube el documento directo a R2');
    r = await req('POST', `/propiedades/${p.id}/documentos`, { clave, nombre, tipo: 'mandato', tamano: PDF.length + 1 }, adm);
    ok(r.s === 400, 'no confirma si el tamaño no calza');
    const antes = (await req('GET', `/propiedades/${p.id}`, null, adm)).j;
    const marca = new Date().toISOString(); await esperar(30);
    r = await req('POST', `/propiedades/${p.id}/documentos`, { clave, nombre, tipo: 'mandato', tamano: PDF.length }, adm);
    ok(r.s === 201 && r.j.documentos.length === 1 && r.j.documentos[0].nombre === nombre && r.j.documentos[0].size === PDF.length, 'el documento queda en la propiedad');
    ok(r.j.version === antes.version, 'agregar un documento no cambia la versión (no choca con ediciones)');
    ok(!JSON.stringify(r.j.documentos).includes(clave), 'la respuesta no expone la clave del archivo');
    const doc = r.j.documentos[0];
    ok((await req('GET', `/propiedades?desde=${encodeURIComponent(marca)}`, null, adm)).j.items.some((x) => x.id === p.id), 'la sincronización informa el cambio');
    ok((await req('POST', `/propiedades/${p.id}/documentos`, { clave, nombre, tipo: 'mandato', tamano: PDF.length }, adm)).s === 400, 'no agrega dos veces el mismo archivo');
    ok((await req('POST', `/propiedades/${p.id}/documentos`, { clave: clave.replace(p.id, '00000000-0000-0000-0000-000000000000'), nombre, tamano: PDF.length }, adm)).s === 400, 'no acepta un archivo de otra propiedad');
    r = await req('GET', `/propiedades/${p.id}/documentos/${doc.id}/descarga`, null, adm);
    ok(r.s === 200 && r.j.nombre === nombre, 'entrega el link de descarga');
    const baj = await fetch(r.j.url);
    const cuerpo = Buffer.from(await baj.arrayBuffer());
    ok(baj.ok && cuerpo.equals(PDF), 'el documento se baja igual');
    ok(/filename\*=UTF-8''Mandato/.test(baj.headers.get('content-disposition') || ''), 'con su nombre original');
    const act = await req('GET', `/actividad?entidadTipo=propiedad&entidadId=${p.id}`, null, adm);
    if (act.s === 200) ok(JSON.stringify(act.j).includes('Documento agregado'), 'queda en el historial');
    r = await req('DELETE', `/propiedades/${p.id}/documentos/${doc.id}`, null, adm);
    ok(r.s === 200 && r.j.documentos.length === 0, 'quita el documento');
    ok((await req('GET', `/propiedades/${p.id}/documentos/${doc.id}/descarga`, null, adm)).s === 404, 'y ya no se puede bajar');
    console.log('OK archivos');
  } catch (e) {
    console.error(e.message); process.exitCode = 1;
  } finally {
    await db.actividad.deleteMany({ where: { entidadId: { in: creados.props } } });
    await db.propiedad.deleteMany({ where: { id: { in: creados.props } } });
    await db.$disconnect();
    // los archivos de prueba que hayan quedado en R2
    if (creados.claves.length) {
      const { S3Client, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
      const s3 = new S3Client({ region: 'auto', endpoint: env.R2_ENDPOINT, credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY } });
      await s3.send(new DeleteObjectsCommand({ Bucket: env.R2_BUCKET, Delete: { Objects: creados.claves.map((Key) => ({ Key })), Quiet: true } })).catch((e) => console.warn('limpieza R2:', e.message));
    }
  }
})();
