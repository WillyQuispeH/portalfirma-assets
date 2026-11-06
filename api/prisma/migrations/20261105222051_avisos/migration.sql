-- CreateTable
CREATE TABLE "avisos" (
    "id" BIGSERIAL NOT NULL,
    "corredora_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "datos" JSONB NOT NULL DEFAULT '{}',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tomado_en" TIMESTAMP(3),

    CONSTRAINT "avisos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "avisos_usuario_id_tomado_en_idx" ON "avisos"("usuario_id", "tomado_en");

-- CreateIndex
CREATE INDEX "avisos_creado_en_idx" ON "avisos"("creado_en");

-- AddForeignKey
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_corredora_id_fkey" FOREIGN KEY ("corredora_id") REFERENCES "corredoras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

