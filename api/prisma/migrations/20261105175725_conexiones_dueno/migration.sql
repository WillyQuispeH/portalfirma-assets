-- DropIndex
DROP INDEX "conexiones_corredora_id_proveedor_idx";

-- AlterTable
ALTER TABLE "conexiones" ADD COLUMN     "dueno" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "conexiones_corredora_id_proveedor_dueno_key" ON "conexiones"("corredora_id", "proveedor", "dueno");

