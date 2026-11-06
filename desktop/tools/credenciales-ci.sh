#!/usr/bin/env bash
# Escribe en build/ las credenciales que van dentro del instalador, desde los secretos de GitHub Actions
# (.github/workflows/instaladores.yml). Las que no estén se omiten: la app abre igual, sin esa integración
# (ver RESUMEN-TECNICO.md, «Credenciales»). Nunca se imprimen. Mercado Libre y la clave de IA ya no van en el
# instalador: viven en el servidor (conexiones y IA_CLAVE).
set -euo pipefail
escribir() { # $1 = contenido, $2 = ruta
  if [ -n "${1:-}" ]; then mkdir -p "$(dirname "$2")"; printf '%s' "$1" > "$2"; echo "✔ $2"; else echo "· sin $2"; fi
}
escribir "${GOOGLE_OAUTH_JSON:-}" build/google/oauth.json
escribir "${PORTALFIRMA_API_JSON:-}" build/portalfirma/api.json
