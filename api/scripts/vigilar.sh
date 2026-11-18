#!/usr/bin/env bash
# Vigilante de Asset en el servidor: corre cada minuto (cron) y avisa por WhatsApp si algo anda mal.
#  · API caída: /v1/salud no responde 3 minutos seguidos (en el servidor y por internet). Avisa cuando vuelve.
#  · El contenedor asset-api no está sano o se reinicia solo.
#  · Disco lleno (más de 85 %) o poca memoria libre.
#  · Certificado de api-asset.portalfirma.cl por vencer (menos de 10 días).
#  · Respaldo de la base atrasado (el último tiene más de 27 horas).
# Cada tipo de aviso se repite como máximo cada 6 horas. Sin API/Docker/Postgres no hay WhatsApp posible: en ese caso (o si el
# celular no le ha escrito al número de la empresa en 24 h) el aviso queda en /var/log/asset-vigilar.log.
# Se instala con api/scripts/instalar-vigilante.sh.
set -uo pipefail
ESTADO=/var/lib/asset-vigilar
LOG=/var/log/asset-vigilar.log
DOMINIO=api-asset.portalfirma.cl
mkdir -p "$ESTADO"
ahora=$(date +%s)

# ---- aviso (con límite de repetición por tipo)
avisar() { # tipo mensaje [forzar]
  local tipo=$1 msg=$2 forzar=${3:-}
  local f="$ESTADO/aviso-$tipo"
  if [ -z "$forzar" ] && [ -f "$f" ] && [ $((ahora - $(cat "$f"))) -lt 21600 ]; then return; fi
  echo "$(date -Is) [$tipo] $msg" >> "$LOG"
  if docker run --rm --network host --env-file /home/asset/api/.env -v /home/asset/alertar.js:/app/dist/alertas/alertar.js:ro asset/api node dist/alertas/alertar.js "⚠️ Asset: $msg" >> "$LOG" 2>&1 < /dev/null; then
    echo "$ahora" > "$f"
  else
    echo "$(date -Is) [$tipo] no se pudo mandar el WhatsApp (queda en este registro)" >> "$LOG"
    echo "$ahora" > "$f" # igual se respeta el intervalo: no insistir cada minuto
  fi
}
limpiar() { rm -f "$ESTADO/aviso-$1"; }

# ---- 1. la API responde
ok_local=0; ok_publica=0
curl -fsS -m 8 http://127.0.0.1:4570/v1/salud 2>/dev/null | grep -q '"ok":true' && ok_local=1
curl -fsS -m 12 "https://$DOMINIO/v1/salud" 2>/dev/null | grep -q '"ok":true' && ok_publica=1
fallos=$(cat "$ESTADO/fallos" 2>/dev/null || echo 0)
if [ $ok_local = 1 ] && [ $ok_publica = 1 ]; then
  if [ "$fallos" -ge 3 ]; then
    cayo=$(cat "$ESTADO/cayo-desde" 2>/dev/null || echo "$ahora")
    avisar recuperada "✅ la API volvió a responder (estuvo caída unos $(( (ahora - cayo) / 60 )) min)." forzar
  fi
  echo 0 > "$ESTADO/fallos"; rm -f "$ESTADO/cayo-desde"; limpiar api
else
  fallos=$((fallos + 1)); echo "$fallos" > "$ESTADO/fallos"
  [ "$fallos" = 1 ] && echo "$ahora" > "$ESTADO/cayo-desde"
  if [ "$fallos" -ge 3 ]; then
    que="en el servidor"; [ $ok_local = 1 ] && que="desde internet (el servidor sí responde: revisa nginx o el certificado)"
    avisar api "la API de Asset NO responde ($que) desde hace $fallos minutos."
  fi
fi

# ---- 2. el contenedor
estado=$(docker inspect -f '{{.State.Health.Status}}' asset-api 2>/dev/null || echo ausente)
if [ "$estado" != healthy ] && [ "$estado" != starting ]; then
  avisar contenedor "el contenedor asset-api está «$estado»."
else
  limpiar contenedor
fi
reinicios=$(docker inspect -f '{{.RestartCount}}' asset-api 2>/dev/null || echo 0)
previos=$(cat "$ESTADO/reinicios" 2>/dev/null || echo "$reinicios")
[ "$reinicios" -gt "$previos" ] && avisar reinicio "la API se reinició sola ($((reinicios - previos)) vez/veces). Revisa: docker logs --tail 80 asset-api"
echo "$reinicios" > "$ESTADO/reinicios"

# ---- 3. disco y memoria
uso=$(df --output=pcent / | tail -1 | tr -dc '0-9')
[ "${uso:-0}" -ge 85 ] && avisar disco "el disco del servidor está al ${uso} %." || limpiar disco
libre=$(awk '/MemAvailable/ {printf "%d", $2/1024}' /proc/meminfo)
[ "${libre:-9999}" -lt 150 ] && avisar memoria "quedan solo ${libre} MB de memoria libre en el servidor." || limpiar memoria

# ---- 4. certificado y respaldo (una vez por hora alcanza)
if [ $((ahora / 60 % 60)) -eq 7 ]; then
  fin=$(echo | openssl s_client -servername "$DOMINIO" -connect "$DOMINIO:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  if [ -n "$fin" ]; then
    dias=$(( ($(date -d "$fin" +%s) - ahora) / 86400 ))
    [ "$dias" -lt 10 ] && avisar certificado "el certificado de $DOMINIO vence en $dias días (renovar con certbot)." || limpiar certificado
  fi
  ultimo=$(ls -t /home/asset/respaldos/asset_prod-*.dump 2>/dev/null | head -1)
  if [ -z "$ultimo" ] || [ $((ahora - $(stat -c %Y "$ultimo"))) -gt 97200 ]; then
    avisar respaldo "el respaldo de la base de datos está atrasado (más de 27 horas sin uno nuevo)."
  else
    limpiar respaldo
  fi
fi
exit 0
