-- AlterTable
ALTER TABLE "registros" ADD COLUMN     "usuario_id" UUID;

-- CreateIndex
CREATE INDEX "registros_corredora_id_coleccion_usuario_id_actualizado_en_idx" ON "registros"("corredora_id", "coleccion", "usuario_id", "actualizado_en");

