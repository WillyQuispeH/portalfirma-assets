# Instaladores y actualizaciones automáticas

PortalFirma Asset se instala en Windows y Mac y se actualiza sola. Los instaladores se publican en
**GitHub Releases** de un repositorio aparte y público: [`WillyQuispeH/portalfirma-asset-release`](https://github.com/WillyQuispeH/portalfirma-asset-release).
Solo tiene los instaladores; el código sigue en el repositorio privado.

## Cómo funciona

| Pieza | Dónde |
|---|---|
| Empaquetado (Windows NSIS, Mac dmg + zip) | `package.json` › `build` (electron-builder) |
| A dónde se publica y de dónde se actualiza | `package.json` › `build.publish` (GitHub, `portalfirma-asset-release`) |
| Armado y publicación en la nube | `.github/workflows/instaladores.yml` (GitHub Actions: Windows y Mac) |
| Actualización dentro de la app | `src/actualizaciones.js` (electron-updater) |
| Aviso «Reiniciar para actualizar» | `src/ui/components/functional/cuenta/Actualizacion.tsx` |

- Al abrir la app (a los 15 s) y cada 4 horas, revisa si hay una versión nueva y la descarga en segundo plano.
- Con la ventana abierta aparece **«Reiniciar para actualizar»** junto al usuario. En el menú del usuario está «Buscar actualizaciones».
- Con la app en segundo plano («siempre activo»), si la versión nueva está lista y la ventana lleva 30 minutos oculta sin documentos sin guardar, se instala sola y vuelve a quedar oculta.
- **Mac sin firmar:** macOS no deja que se instale sola. La app avisa con «Descargar versión X», que abre la página de la versión para instalarla a mano. Cuando la app esté firmada, se actualiza sola sin cambiar nada.

## Publicar una versión

1. Sube la versión en `desktop/package.json` (p. ej. `0.17.0` → `0.17.1`) y haz commit.
2. Crea el tag con la misma versión y súbelo:
   ```bash
   git tag v0.17.1
   git push origin v0.17.1
   ```
3. GitHub Actions arma Windows y después Mac, y los publica en `portalfirma-asset-release`. Tarda unos 15 a 25 minutos (pestaña **Actions** del repositorio).
4. Las apps instaladas lo ven en la siguiente revisión (máximo 4 horas, o «Buscar actualizaciones»).

El tag tiene que coincidir con `package.json`; si no, el flujo se detiene. También se puede lanzar a mano desde Actions › Instaladores › Run workflow.

## Configuración (una vez)

1. **Repositorio de versiones:** `portalfirma-asset-release` tiene que ser **público**. La app lee las versiones sin token.
2. **Token para publicar:** en GitHub › Settings › Developer settings › Fine-grained tokens, crea uno con
   *Repository access: only portalfirma-asset-release* y *Contents: Read and write*.
3. **Secretos** en el repositorio del código (Settings › Secrets and variables › Actions):

   | Secreto | Qué es |
   |---|---|
   | `RELEASES_TOKEN` | el token del paso 2 (obligatorio) |
   | `GOOGLE_OAUTH_JSON` | contenido de `build/google/oauth.json` (Google Drive) |
   | `PORTALFIRMA_API_JSON` | contenido de `build/portalfirma/api.json` |

   Los dos últimos van dentro del instalador; si falta uno, la app abre igual, sin esa integración.
   Mercado Libre y la IA ya **no** van en el instalador: sus claves viven en el servidor (`ML_CLIENT_ID`/`ML_CLIENT_SECRET`
   e `IA_CLAVE` en `/etc/asset/api.env`).

## Firma

- **Windows:** sin firma por ahora. Se actualiza sola igual. La primera instalación muestra «Windows protegió su PC»: *Más información → Ejecutar de todas formas*. Para quitar ese aviso se puede agregar Azure Trusted Signing o un certificado de firma de código.
- **Mac:** sin firma por ahora. Al abrirla la primera vez, clic derecho sobre la app → *Abrir*. Si macOS dice que «está dañada» (pasa con apps sin firmar descargadas), en la Terminal:
  `xattr -cr "/Applications/PortalFirma Asset.app"`.
  Cuando exista la cuenta **Apple Developer** (USD 99 al año):
  1. Crea un certificado «Developer ID Application», expórtalo como `.p12` y guárdalo en base64 en el secreto `MAC_CERT_P12_BASE64`, con su clave en `MAC_CERT_PASSWORD`.
  2. Agrega `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` (de appleid.apple.com) y `APPLE_TEAM_ID`.

  Con eso, el flujo firma y notariza solo, y la app de Mac se actualiza sola.

## Primera vez

Las apps instaladas antes de la **0.17.0** no tienen actualización automática: hay que instalar la 0.17.0 a mano en cada equipo. Desde ahí, las siguientes llegan solas.

## Probar en local (sin publicar)

```bash
yarn dist:win     # dist/PortalFirma-Asset-Setup-<versión>.exe + latest.yml
yarn dist:mac     # solo en un Mac
```
