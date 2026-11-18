#!/usr/bin/env bash
# Instala (o actualiza) el respaldo diario de asset_prod en el servidor y corre uno de inmediato para probarlo.
#   bash api/scripts/instalar-respaldo.sh
set -euo pipefail
SERVIDOR="${ASSET_SERVIDOR:-root@172.233.16.21}"
CLAVE="${ASSET_CLAVE_SSH:-$HOME/.ssh/id_ed25519}"
SSH=(ssh -o IdentitiesOnly=yes -i "$CLAVE" -o BatchMode=yes "$SERVIDOR")
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"

"${SSH[@]}" "cat > /home/asset/respaldo-db.sh && chmod 700 /home/asset/respaldo-db.sh" < "$RAIZ/api/scripts/respaldo-db.sh"
"${SSH[@]}" bash -s <<'EOF'
set -euo pipefail
command -v pg_dump >/dev/null || { echo "Falta pg_dump en el servidor (paquete postgresql-client)"; exit 1; }
echo '15 4 * * * root /home/asset/respaldo-db.sh >> /var/log/asset-respaldo.log 2>&1' > /etc/cron.d/asset-respaldo
chmod 644 /etc/cron.d/asset-respaldo
/home/asset/respaldo-db.sh
ls -lh /home/asset/respaldos | tail -3
EOF
