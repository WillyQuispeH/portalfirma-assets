-- CreateTable
CREATE TABLE "registros" (
    "corredora_id" UUID NOT NULL,
    "coleccion" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "datos" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "creado_por_id" UUID,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "eliminado_en" TIMESTAMP(3),

    CONSTRAINT "registros_pkey" PRIMARY KEY ("corredora_id","coleccion","id")
);

-- CreateTable
CREATE TABLE "contadores" (
    "corredora_id" UUID NOT NULL,
    "serie" TEXT NOT NULL,
    "valor" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "contadores_pkey" PRIMARY KEY ("corredora_id","serie")
);

-- CreateIndex
CREATE INDEX "registros_corredora_id_coleccion_actualizado_en_idx" ON "registros"("corredora_id", "coleccion", "actualizado_en");

-- AddForeignKey
ALTER TABLE "registros" ADD CONSTRAINT "registros_corredora_id_fkey" FOREIGN KEY ("corredora_id") REFERENCES "corredoras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contadores" ADD CONSTRAINT "contadores_corredora_id_fkey" FOREIGN KEY ("corredora_id") REFERENCES "corredoras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

