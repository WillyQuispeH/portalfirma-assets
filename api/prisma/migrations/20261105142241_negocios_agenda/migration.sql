-- CreateTable
CREATE TABLE "negocios" (
    "id" TEXT NOT NULL,
    "corredora_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'abierto',
    "etapa" TEXT NOT NULL,
    "propiedad_id" UUID,
    "cliente_id" UUID,
    "corredor_id" UUID,
    "proxima_fecha" DATE,
    "datos" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "creado_por_id" UUID,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "eliminado_en" TIMESTAMP(3),

    CONSTRAINT "negocios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos" (
    "id" TEXT NOT NULL,
    "corredora_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'programado',
    "fecha" DATE NOT NULL,
    "hora" TEXT,
    "propiedad_id" UUID,
    "negocio_id" TEXT,
    "persona_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "corredor_id" UUID,
    "datos" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "creado_por_id" UUID,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "eliminado_en" TIMESTAMP(3),

    CONSTRAINT "eventos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "negocios_corredora_id_actualizado_en_idx" ON "negocios"("corredora_id", "actualizado_en");

-- CreateIndex
CREATE INDEX "negocios_corredora_id_corredor_id_estado_idx" ON "negocios"("corredora_id", "corredor_id", "estado");

-- CreateIndex
CREATE INDEX "negocios_corredora_id_propiedad_id_idx" ON "negocios"("corredora_id", "propiedad_id");

-- CreateIndex
CREATE INDEX "negocios_corredora_id_cliente_id_idx" ON "negocios"("corredora_id", "cliente_id");

-- CreateIndex
CREATE INDEX "eventos_corredora_id_actualizado_en_idx" ON "eventos"("corredora_id", "actualizado_en");

-- CreateIndex
CREATE INDEX "eventos_corredora_id_corredor_id_fecha_idx" ON "eventos"("corredora_id", "corredor_id", "fecha");

-- CreateIndex
CREATE INDEX "eventos_corredora_id_propiedad_id_idx" ON "eventos"("corredora_id", "propiedad_id");

-- CreateIndex
CREATE INDEX "eventos_corredora_id_negocio_id_idx" ON "eventos"("corredora_id", "negocio_id");

-- CreateIndex
CREATE INDEX "eventos_persona_ids_idx" ON "eventos" USING GIN ("persona_ids");

-- AddForeignKey
ALTER TABLE "negocios" ADD CONSTRAINT "negocios_corredora_id_fkey" FOREIGN KEY ("corredora_id") REFERENCES "corredoras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negocios" ADD CONSTRAINT "negocios_propiedad_id_fkey" FOREIGN KEY ("propiedad_id") REFERENCES "propiedades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negocios" ADD CONSTRAINT "negocios_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "personas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negocios" ADD CONSTRAINT "negocios_corredor_id_fkey" FOREIGN KEY ("corredor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_corredora_id_fkey" FOREIGN KEY ("corredora_id") REFERENCES "corredoras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_propiedad_id_fkey" FOREIGN KEY ("propiedad_id") REFERENCES "propiedades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_corredor_id_fkey" FOREIGN KEY ("corredor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

