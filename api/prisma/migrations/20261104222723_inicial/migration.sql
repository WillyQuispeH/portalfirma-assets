-- CreateEnum
CREATE TYPE "rol" AS ENUM ('ADMIN', 'CORREDOR');

-- CreateTable
CREATE TABLE "corredoras" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "rut" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "corredoras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "corredora_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "hash_clave" TEXT NOT NULL,
    "rol" "rol" NOT NULL DEFAULT 'CORREDOR',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "ultimo_ingreso" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sesiones" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "hash_renovar" TEXT NOT NULL,
    "dispositivo" TEXT,
    "ip" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_en" TIMESTAMP(3) NOT NULL,
    "revocada_en" TIMESTAMP(3),

    CONSTRAINT "sesiones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "corredoras_rut_key" ON "corredoras"("rut");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "usuarios_corredora_id_idx" ON "usuarios"("corredora_id");

-- CreateIndex
CREATE INDEX "sesiones_usuario_id_idx" ON "sesiones"("usuario_id");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_corredora_id_fkey" FOREIGN KEY ("corredora_id") REFERENCES "corredoras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

