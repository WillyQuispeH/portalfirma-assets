# API de PortalFirma Asset (NestJS + Prisma) · producción en la Linode, junto a matchoncard.
# Se construye en el servidor con docker compose (ver ../docker-compose.yml y scripts/desplegar.sh).

# --- base: Prisma necesita openssl en alpine ---
FROM node:22-alpine AS base
RUN apk add --no-cache openssl
WORKDIR /app

# --- builder: todas las dependencias, cliente de Prisma y compilación ---
# también sirve para las migraciones: `docker compose run --rm migrar` usa esta etapa (trae el CLI de prisma)
FROM base AS builder
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY prisma ./prisma
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npx prisma generate && yarn build

# --- deps: solo lo de producción (argon2 trae binarios ya compilados para alpine) ---
FROM base AS deps
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production --ignore-scripts --prefer-offline

# --- runner ---
FROM base AS runner
ENV NODE_ENV=production TZ=UTC
USER node
COPY --chown=node:node package.json ./
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
# el cliente de Prisma generado (motor para linux-musl) va aparte: la instalación de producción no lo genera
COPY --from=builder --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=node:node /app/dist ./dist
EXPOSE 4570
CMD ["node", "dist/main.js"]
