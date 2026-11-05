-- CreateTable
CREATE TABLE "reglas_casos" (
    "id" TEXT NOT NULL,
    "corredora_id" UUID NOT NULL,
    "usuario_id" UUID,
    "clave" TEXT NOT NULL,
    "datos" JSONB NOT NULL DEFAULT '{}',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reglas_casos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plataforma_documentos" (
    "clave" TEXT NOT NULL,
    "datos" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "actualizado_por" UUID,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plataforma_documentos_pkey" PRIMARY KEY ("clave")
);

-- CreateIndex
CREATE INDEX "reglas_casos_creado_en_idx" ON "reglas_casos"("creado_en");

-- CreateIndex
CREATE UNIQUE INDEX "reglas_casos_corredora_id_clave_key" ON "reglas_casos"("corredora_id", "clave");

-- AddForeignKey
ALTER TABLE "reglas_casos" ADD CONSTRAINT "reglas_casos_corredora_id_fkey" FOREIGN KEY ("corredora_id") REFERENCES "corredoras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

