-- CreateTable
CREATE TABLE "enlaces_cortos" (
    "token" TEXT NOT NULL,
    "corredora_id" UUID NOT NULL,
    "clave" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "expira_en" TIMESTAMP(3) NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enlaces_cortos_pkey" PRIMARY KEY ("token")
);

-- CreateIndex
CREATE INDEX "enlaces_cortos_expira_en_idx" ON "enlaces_cortos"("expira_en");

