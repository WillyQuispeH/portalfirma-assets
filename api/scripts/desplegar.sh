#!/usr/bin/env bash
# Despliega la API de Asset en la Linode, en Docker (/home/asset), desde Git Bash en el equipo de desarrollo:
#   bash api/scripts/desplegar.sh
# Sube el código (sin .env, node_modules, dist ni pruebas), construye la imagen EN el servidor, aplica las migraciones
# pendientes y reemplaza el contenedor. Si la nueva no queda sana, vuelve a levantar la imagen anterior.
# Las variables salen de api/.env.production y en el servidor quedan como /home/asset/api/.env.
set -euo pipefail

SERVIDOR="${ASSET_SERVIDOR:-root@172.233.16.21}"
CLAVE="${ASSET_CLAVE_SSH:-$HOME/.ssh/id_ed25519}"
DESTINO=/home/asset
SSH=(ssh -o IdentitiesOnly=yes -i "$CLAVE" -o BatchMode=yes "$SERVIDOR")

RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$RAIZ"

echo "› subiendo el código a $SERVIDOR:$DESTINO"
tar -czf - docker-compose.yml \
  api/Dockerfile api/.dockerignore api/package.json api/yarn.lock \
  api/tsconfig.json api/tsconfig.build.json api/nest-cli.json api/src api/prisma \
  | "${SSH[@]}" "mkdir -p $DESTINO/api && rm -rf $DESTINO/api/src $DESTINO/api/prisma && tar -xzf - --no-same-owner -C $DESTINO"

echo "› variables: api/.env.production → $DESTINO/api/.env"
"${SSH[@]}" "umask 077 && cat > $DESTINO/api/.env && chmod 600 $DESTINO/api/.env" < api/.env.production

"${SSH[@]}" bash -s <<EOF
set -euo pipefail
cd $DESTINO
test -f api/.env || { echo "Falta $DESTINO/api/.env"; exit 1; }

echo "› construyendo la imagen"
docker image tag asset/api:latest asset/api:anterior 2>/dev/null || true
docker compose build api migrar < /dev/null

echo "› migraciones"
docker compose run --rm -T migrar < /dev/null

echo "› reemplazando el contenedor"
docker compose up -d api < /dev/null

echo "› esperando que quede sana"
for i in \$(seq 1 30); do
  estado=\$(docker inspect -f '{{.State.Health.Status}}' asset-api 2>/dev/null || echo nada)
  [ "\$estado" = healthy ] && break
  sleep 3
done
if [ "\$estado" != healthy ]; then
  echo "✗ la API nueva no quedó sana (\$estado). Últimas líneas:"; docker logs --tail 40 asset-api
  if docker image inspect asset/api:anterior >/dev/null 2>&1; then
    echo "› volviendo a la imagen anterior"
    docker image tag asset/api:anterior asset/api:latest
    docker compose up -d --no-build api < /dev/null
  fi
  exit 1
fi
docker image prune -f >/dev/null
echo "✓ API desplegada: \$(curl -s http://127.0.0.1:4570/v1/salud)"
EOF
