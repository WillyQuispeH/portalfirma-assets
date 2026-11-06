// GitHub no deja crear versiones (releases) en un repositorio vacío. Si el repositorio de los instaladores
// (build.publish de package.json) no tiene archivos, le crea un README. Lo usa .github/workflows/instaladores.yml
// antes de publicar. Sin GH_TOKEN no hace nada (los instaladores se arman sin publicar).
const pub = [].concat(require('../package.json').build.publish)[0];
const token = process.env.GH_TOKEN;

(async () => {
  if (!token) return console.log('Sin RELEASES_TOKEN: se arma sin publicar');
  const base = `https://api.github.com/repos/${pub.owner}/${pub.repo}`;
  const h = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'portalfirma-asset-ci' };
  const repo = await (await fetch(base, { headers: h })).json();
  if (repo.size !== 0) return console.log(`${pub.repo}: ya tiene archivos`);
  const texto = '# PortalFirma Asset\n\nInstaladores para Windows y Mac. Descarga la última versión en **Releases**.\n';
  const r = await fetch(`${base}/contents/README.md`, {
    method: 'PUT', headers: h,
    body: JSON.stringify({ message: 'Instaladores de PortalFirma Asset', content: Buffer.from(texto).toString('base64') }),
  });
  if (!r.ok) throw new Error(`No se pudo crear el README en ${pub.repo}: HTTP ${r.status} ${await r.text()}`);
  console.log(`${pub.repo}: README creado`);
})().catch((e) => { console.error(e.message); process.exit(1); });
