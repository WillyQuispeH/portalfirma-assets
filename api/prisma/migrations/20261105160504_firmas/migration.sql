-- CreateTable
CREATE TABLE "firmas" (
    "id" TEXT NOT NULL,
    "corredora_id" UUID NOT NULL,
    "operacion" INTEGER,
    "documento" TEXT NOT NULL,
    "origen" TEXT NOT NULL DEFAULT 'asset',
    "estado" TEXT NOT NULL DEFAULT 'en_firma',
    "legalizado" BOOLEAN NOT NULL DEFAULT false,
    "firmados" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "propiedad_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "negocio_id" TEXT,
    "enviado_por_id" UUID,
    "enviado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firmado_en" TIMESTAMP(3),
    "revisado_en" TIMESTAMP(3),
    "firmantes" JSONB NOT NULL DEFAULT '[]',
    "datos" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "eliminado_en" TIMESTAMP(3),

    CONSTRAINT "firmas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "firmas_corredora_id_actualizado_en_idx" ON "firmas"("corredora_id", "actualizado_en");

-- CreateIndex
CREATE INDEX "firmas_corredora_id_estado_idx" ON "firmas"("corredora_id", "estado");

-- CreateIndex
CREATE INDEX "firmas_corredora_id_negocio_id_idx" ON "firmas"("corredora_id", "negocio_id");

-- CreateIndex
CREATE INDEX "firmas_propiedad_ids_idx" ON "firmas" USING GIN ("propiedad_ids");

-- CreateIndex
CREATE UNIQUE INDEX "firmas_corredora_id_operacion_key" ON "firmas"("corredora_id", "operacion");

-- AddForeignKey
ALTER TABLE "firmas" ADD CONSTRAINT "firmas_corredora_id_fkey" FOREIGN KEY ("corredora_id") REFERENCES "corredoras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "firmas" ADD CONSTRAINT "firmas_enviado_por_id_fkey" FOREIGN KEY ("enviado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

