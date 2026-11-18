#!/usr/bin/env bash
# Respaldo diario de la base de producción (asset_prod), en el servidor.
#  · Lee DATABASE_URL de /home/asset/api/.env (sin el «?schema=…», que pg_dump no entiende).
#  · Formato propio de pg_dump (-Fc, comprimido): se restaura con pg_restore, completo o por tabla.
#  · Deja los de los últimos DIAS días en /home/asset/respaldos (carpeta 700, archivos 600: tienen datos de clientes).
# Se instala con api/scripts/instalar-respaldo.sh (cron diario a las 04:15 hora del servidor).
# Restaurar en una base de prueba:  pg_restore --no-owner -d <url_de_prueba> /home/asset/respaldos/asset_prod-AAAAMMDD-HHMM.dump
set -euo pipefail
ENV=/home/asset/api/.env
DESTINO=/home/asset/respaldos
DIAS=${DIAS:-14}

url=$(grep -E '^DATABASE_URL=' "$ENV" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e 's/[?&]schema=[^&]*//')
[ -n "$url" ] || { echo "Falta DATABASE_URL en $ENV" >&2; exit 1; }

umask 077
mkdir -p "$DESTINO"
archivo="$DESTINO/asset_prod-$(date +%Y%m%d-%H%M).dump"
pg_dump -Fc --no-owner --dbname="$url" -f "$archivo.tmp"
mv "$archivo.tmp" "$archivo"
find "$DESTINO" -name 'asset_prod-*.dump' -mtime +"$DIAS" -delete
echo "✓ $(date -Is) $archivo ($(du -h "$archivo" | cut -f1))"
