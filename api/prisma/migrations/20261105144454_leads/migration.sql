-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "corredora_id" UUID NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'nuevo',
    "origen" TEXT NOT NULL DEFAULT 'otro',
    "corredor_id" UUID,
    "persona_id" UUID,
    "telefono_norm" TEXT,
    "email" TEXT,
    "conv_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ultimo_en" TEXT,
    "datos" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "creado_por_id" UUID,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "eliminado_en" TIMESTAMP(3),

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_mensajes" (
    "id" BIGSERIAL NOT NULL,
    "lead_id" TEXT NOT NULL,
    "corredora_id" UUID NOT NULL,
    "k" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "de" TEXT,
    "autor" TEXT,
    "texto" TEXT NOT NULL DEFAULT '',
    "tipo" TEXT NOT NULL DEFAULT 'texto',
    "media_url" TEXT,
    "datos" JSONB NOT NULL DEFAULT '{}',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_mensajes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leads_corredora_id_actualizado_en_idx" ON "leads"("corredora_id", "actualizado_en");

-- CreateIndex
CREATE INDEX "leads_corredora_id_corredor_id_estado_idx" ON "leads"("corredora_id", "corredor_id", "estado");

-- CreateIndex
CREATE INDEX "leads_corredora_id_telefono_norm_idx" ON "leads"("corredora_id", "telefono_norm");

-- CreateIndex
CREATE INDEX "leads_conv_ids_idx" ON "leads" USING GIN ("conv_ids");

-- CreateIndex
CREATE INDEX "lead_mensajes_lead_id_actualizado_en_idx" ON "lead_mensajes"("lead_id", "actualizado_en");

-- CreateIndex
CREATE UNIQUE INDEX "lead_mensajes_lead_id_k_key" ON "lead_mensajes"("lead_id", "k");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_corredora_id_fkey" FOREIGN KEY ("corredora_id") REFERENCES "corredoras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_corredor_id_fkey" FOREIGN KEY ("corredor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_mensajes" ADD CONSTRAINT "lead_mensajes_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

