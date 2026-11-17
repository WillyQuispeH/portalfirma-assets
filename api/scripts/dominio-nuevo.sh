#!/usr/bin/env bash
# Habilita api-asset.portalfirma.cl en el nginx del servidor de Asset, junto a asset.matchoncard.cl (que NO se toca):
#   bash api/scripts/dominio-nuevo.sh
# Antes de nada comprueba que el DNS ya apunte a este servidor; si no, no hace nada. Después:
#   1) deja un sitio solo-HTTP para el desafío de Let's Encrypt,
#   2) pide el certificado con certbot (webroot, el mismo método que los otros sitios; se renueva solo),
#   3) instala el sitio completo (api/scripts/nginx/api-asset.portalfirma.cl.conf) y recarga nginx.
# Si algo falla, quita el archivo nuevo y recarga nginx: los demás sitios no se ven afectados. Se puede repetir sin riesgo.
# Después de esto (y solo después) se cambia API_URL_PUBLICA en api/.env.production y se despliega con desplegar.sh.
set -euo pipefail

DOMINIO="${ASSET_DOMINIO:-api-asset.portalfirma.cl}"
IP_ESPERADA="${ASSET_IP:-172.233.16.21}"
SERVIDOR="${ASSET_SERVIDOR:-root@$IP_ESPERADA}"
CLAVE="${ASSET_CLAVE_SSH:-$HOME/.ssh/id_ed25519}"
SSH=(ssh -o IdentitiesOnly=yes -i "$CLAVE" -o BatchMode=yes "$SERVIDOR")
AQUI="$(cd "$(dirname "$0")" && pwd)"
CONF_COMPLETA="$AQUI/nginx/$DOMINIO.conf"
test -f "$CONF_COMPLETA" || { echo "✗ Falta $CONF_COMPLETA"; exit 1; }

echo "› DNS de $DOMINIO (consultado en dns.google)"
RESUELVE="$(curl -s "https://dns.google/resolve?name=$DOMINIO&type=A" | grep -oE '"data":"[0-9.]+"' | head -1 | grep -oE '[0-9.]+' || true)"
if [ "$RESUELVE" != "$IP_ESPERADA" ]; then
  echo "✗ $DOMINIO resuelve a «${RESUELVE:-nada}», no a $IP_ESPERADA. Pídele a quien gestiona el DNS el registro A y vuelve a correr esto."
  exit 1
fi
echo "  ✓ apunta a $IP_ESPERADA"

"${SSH[@]}" "mkdir -p /var/www/certbot"
echo "› sitio solo-HTTP para el desafío"
"${SSH[@]}" "cat > /etc/nginx/sites-enabled/$DOMINIO.conf" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMINIO;
    include snippets/matchoncard-acme.conf;
    location / { return 404; }
}
EOF
"${SSH[@]}" "nginx -t && systemctl reload nginx" || { "${SSH[@]}" "rm -f /etc/nginx/sites-enabled/$DOMINIO.conf"; echo "✗ nginx rechazó el sitio HTTP"; exit 1; }

if "${SSH[@]}" "test -f /etc/letsencrypt/live/$DOMINIO/fullchain.pem"; then
  echo "› el certificado ya existe"
else
  echo "› pidiendo el certificado"
  "${SSH[@]}" "certbot certonly --webroot -w /var/www/certbot -d $DOMINIO --key-type ecdsa --non-interactive --agree-tos --deploy-hook 'systemctl reload nginx'" \
    || { "${SSH[@]}" "rm -f /etc/nginx/sites-enabled/$DOMINIO.conf && systemctl reload nginx"; echo "✗ certbot no pudo emitir el certificado"; exit 1; }
fi

echo "› instalando el sitio completo"
"${SSH[@]}" "cat > /etc/nginx/sites-enabled/$DOMINIO.conf" < "$CONF_COMPLETA"
"${SSH[@]}" "nginx -t && systemctl reload nginx" || { "${SSH[@]}" "rm -f /etc/nginx/sites-enabled/$DOMINIO.conf && systemctl reload nginx"; echo "✗ nginx rechazó el sitio completo; se quitó"; exit 1; }

echo "› comprobando"
curl -s -m 15 "https://$DOMINIO/v1/salud" && echo
echo "✓ $DOMINIO listo. Siguiente: API_URL_PUBLICA=https://$DOMINIO en api/.env.production y bash api/scripts/desplegar.sh"
