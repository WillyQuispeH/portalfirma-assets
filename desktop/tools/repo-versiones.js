// GitHub no deja crear versiones (releases) en un repositorio vacío. Si el repositorio de los instaladores
// (build.publish de package.json) no tiene README, se lo crea. Lo usa .github/workflows/instaladores.yml antes de
// publicar. Sin GH_TOKEN no hace nada (los instaladores se arman sin publicar).
// Ojo: no se mira `size` del repositorio: GitHub lo calcula con atraso y sigue en 0 aunque ya tenga archivos.
const pub = [].concat(require('../package.json').build.publish)[0];
const token = process.env.GH_TOKEN;

(async () => {
  if (!token) return console.log('Sin RELEASES_TOKEN: se arma sin publicar');
  const base = `https://api.github.com/repos/${pub.owner}/${pub.repo}`;
  const h = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'portalfirma-asset-ci' };
  const hay = await fetch(`${base}/contents/README.md`, { headers: h });
  if (hay.ok) return console.log(`${pub.repo}: ya tiene README`);
  // 404 = no existe el archivo (o el repositorio está vacío): se crea
  if (hay.status !== 404) throw new Error(`No se pudo revisar ${pub.repo}: HTTP ${hay.status} ${await hay.text()}`);
  const texto = '# PortalFirma Asset\n\nInstaladores para Windows y Mac. Descarga la última versión en **Releases**.\n';
  const r = await fetch(`${base}/contents/README.md`, {
    method: 'PUT', headers: h,
    body: JSON.stringify({ message: 'Instaladores de PortalFirma Asset', content: Buffer.from(texto).toString('base64') }),
  });
  // 422: otro proceso lo creó recién; está bien
  if (!r.ok && r.status !== 422) throw new Error(`No se pudo crear el README en ${pub.repo}: HTTP ${r.status} ${await r.text()}`);
  console.log(`${pub.repo}: README listo`);
})().catch((e) => { console.error(e.message); process.exit(1); });
