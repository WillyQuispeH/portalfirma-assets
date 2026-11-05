-- CreateTable
CREATE TABLE "wa_programados" (
    "corredora_id" UUID NOT NULL,
    "id" TEXT NOT NULL,
    "usuario_id" UUID NOT NULL,
    "telefono" TEXT NOT NULL,
    "nombre" TEXT NOT NULL DEFAULT '',
    "persona_id" TEXT,
    "texto" TEXT NOT NULL,
    "cuando" TIMESTAMP(3) NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'programado',
    "plantilla" JSONB,
    "resultado" JSONB NOT NULL DEFAULT '{}',
    "enviado_en" TIMESTAMP(3),
    "revisar_hasta" TIMESTAMP(3),
    "avisado_en" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wa_programados_pkey" PRIMARY KEY ("corredora_id","id")
);

-- CreateIndex
CREATE INDEX "wa_programados_estado_cuando_idx" ON "wa_programados"("estado", "cuando");

-- CreateIndex
CREATE INDEX "wa_programados_revisar_hasta_idx" ON "wa_programados"("revisar_hasta");

-- CreateIndex
CREATE INDEX "wa_programados_usuario_id_actualizado_en_idx" ON "wa_programados"("usuario_id", "actualizado_en");

-- AddForeignKey
ALTER TABLE "wa_programados" ADD CONSTRAINT "wa_programados_corredora_id_fkey" FOREIGN KEY ("corredora_id") REFERENCES "corredoras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

