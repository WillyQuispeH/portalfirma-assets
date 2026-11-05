-- CreateTable
CREATE TABLE "agente_conversaciones" (
    "usuario_id" UUID NOT NULL,
    "id" TEXT NOT NULL,
    "corredora_id" UUID NOT NULL,
    "titulo" TEXT NOT NULL DEFAULT '',
    "fijada" BOOLEAN NOT NULL DEFAULT false,
    "datos" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "eliminado_en" TIMESTAMP(3),

    CONSTRAINT "agente_conversaciones_pkey" PRIMARY KEY ("usuario_id","id")
);

-- CreateTable
CREATE TABLE "agente_registro" (
    "id" BIGSERIAL NOT NULL,
    "corredora_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canal" TEXT NOT NULL DEFAULT 'app',
    "herramienta" TEXT NOT NULL,
    "accion" TEXT,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "resumen" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "agente_registro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agente_conversaciones_usuario_id_actualizado_en_idx" ON "agente_conversaciones"("usuario_id", "actualizado_en");

-- CreateIndex
CREATE INDEX "agente_conversaciones_corredora_id_actualizado_en_idx" ON "agente_conversaciones"("corredora_id", "actualizado_en");

-- CreateIndex
CREATE INDEX "agente_registro_usuario_id_fecha_idx" ON "agente_registro"("usuario_id", "fecha");

-- CreateIndex
CREATE INDEX "agente_registro_corredora_id_fecha_idx" ON "agente_registro"("corredora_id", "fecha");

-- AddForeignKey
ALTER TABLE "agente_conversaciones" ADD CONSTRAINT "agente_conversaciones_corredora_id_fkey" FOREIGN KEY ("corredora_id") REFERENCES "corredoras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agente_conversaciones" ADD CONSTRAINT "agente_conversaciones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agente_registro" ADD CONSTRAINT "agente_registro_corredora_id_fkey" FOREIGN KEY ("corredora_id") REFERENCES "corredoras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agente_registro" ADD CONSTRAINT "agente_registro_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

