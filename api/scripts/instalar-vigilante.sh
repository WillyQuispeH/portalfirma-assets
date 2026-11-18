#!/usr/bin/env bash
# Instala (o actualiza) el vigilante de Asset en el servidor: cron cada minuto + celular que recibe los avisos.
#   bash api/scripts/instalar-vigilante.sh [+56982597210]
# El script de avisos (dist/alertas/alertar.js, compilado con `yarn build`) se copia al servidor y se monta en el contenedor:
# no hace falta desplegar la API para instalarlo.
set -euo pipefail
CELULAR="${1:-+56982597210}"
SERVIDOR="${ASSET_SERVIDOR:-root@172.233.16.21}"
CLAVE="${ASSET_CLAVE_SSH:-$HOME/.ssh/id_ed25519}"
SSH=(ssh -o IdentitiesOnly=yes -i "$CLAVE" -o BatchMode=yes "$SERVIDOR")
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"

test -f "$RAIZ/api/dist/alertas/alertar.js" || { echo "Falta compilar: cd api && yarn build"; exit 1; }
"${SSH[@]}" "cat > /home/asset/vigilar.sh && chmod 700 /home/asset/vigilar.sh" < "$RAIZ/api/scripts/vigilar.sh"
"${SSH[@]}" "cat > /home/asset/alertar.js && chmod 644 /home/asset/alertar.js" < "$RAIZ/api/dist/alertas/alertar.js"
"${SSH[@]}" bash -s -- "$CELULAR" <<'EOF'
set -euo pipefail
ENV=/home/asset/api/.env
grep -q '^ALERTA_WHATSAPP=' $ENV && sed -i "s|^ALERTA_WHATSAPP=.*|ALERTA_WHATSAPP=$1|" $ENV || echo "ALERTA_WHATSAPP=$1" >> $ENV
command -v openssl >/dev/null || { echo "Falta openssl en el servidor"; exit 1; }
echo '* * * * * root /home/asset/vigilar.sh' > /etc/cron.d/asset-vigilar
chmod 644 /etc/cron.d/asset-vigilar
touch /var/log/asset-vigilar.log
echo "✓ vigilante instalado (cada minuto) · avisos a $1"
EOF
