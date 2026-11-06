-- CreateTable
CREATE TABLE "wa_ajustes" (
    "corredora_id" UUID NOT NULL,
    "clientes_activo" BOOLEAN NOT NULL DEFAULT true,
    "observador" JSONB NOT NULL DEFAULT '{}',
    "lector_hasta" TIMESTAMP(3),
    "lector_en" TIMESTAMP(3),
    "lector_error" TEXT,
    "rapido_hasta" TIMESTAMP(3),
    "observador_en" TIMESTAMP(3),
    "observador_res" JSONB NOT NULL DEFAULT '{}',
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wa_ajustes_pkey" PRIMARY KEY ("corredora_id")
);

-- CreateTable
CREATE TABLE "wa_conversaciones" (
    "corredora_id" UUID NOT NULL,
    "conv_id" TEXT NOT NULL,
    "canal" TEXT NOT NULL DEFAULT 'whatsapp',
    "telefono_norm" TEXT,
    "contact_id" TEXT,
    "marca" TEXT,
    "ultimo_msg_id" TEXT,
    "desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lead_id" TEXT,
    "dueno" TEXT,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wa_conversaciones_pkey" PRIMARY KEY ("corredora_id","conv_id")
);

-- CreateTable
CREATE TABLE "wa_hilos" (
    "corredora_id" UUID NOT NULL,
    "telefono_norm" TEXT NOT NULL,
    "mensajes" JSONB NOT NULL DEFAULT '[]',
    "pausa_hasta" TIMESTAMP(3),
    "visto" TIMESTAMP(3),
    "ultimo" TIMESTAMP(3),
    "ult_envio" TIMESTAMP(3),
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wa_hilos_pkey" PRIMARY KEY ("corredora_id","telefono_norm")
);

-- CreateTable
CREATE TABLE "wa_enviados" (
    "id" BIGSERIAL NOT NULL,
    "corredora_id" UUID NOT NULL,
    "telefono_norm" TEXT NOT NULL,
    "message_id" TEXT,
    "huella" TEXT NOT NULL DEFAULT '',
    "plantilla" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_enviados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_vinculos" (
    "usuario_id" UUID NOT NULL,
    "corredora_id" UUID NOT NULL,
    "telefono" TEXT,
    "telefono_norm" TEXT,
    "contact_id" TEXT,
    "codigo" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT false,
    "datos" JSONB NOT NULL DEFAULT '{}',
    "vinculado_en" TIMESTAMP(3),
    "senal_en" TIMESTAMP(3),
    "aviso_cerrado_en" TIMESTAMP(3),
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wa_vinculos_pkey" PRIMARY KEY ("usuario_id")
);

-- CreateTable
CREATE TABLE "wa_entrantes" (
    "id" BIGSERIAL NOT NULL,
    "corredora_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "mensaje" JSONB NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tomado_en" TIMESTAMP(3),

    CONSTRAINT "wa_entrantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ia_consumo" (
    "id" BIGSERIAL NOT NULL,
    "corredora_id" UUID NOT NULL,
    "uso" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "entrada" INTEGER NOT NULL DEFAULT 0,
    "salida" INTEGER NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ia_consumo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wa_conversaciones_corredora_id_telefono_norm_idx" ON "wa_conversaciones"("corredora_id", "telefono_norm");

-- CreateIndex
CREATE INDEX "wa_enviados_corredora_id_telefono_norm_creado_en_idx" ON "wa_enviados"("corredora_id", "telefono_norm", "creado_en");

-- CreateIndex
CREATE INDEX "wa_enviados_message_id_idx" ON "wa_enviados"("message_id");

-- CreateIndex
CREATE INDEX "wa_enviados_creado_en_idx" ON "wa_enviados"("creado_en");

-- CreateIndex
CREATE UNIQUE INDEX "wa_vinculos_corredora_id_telefono_norm_key" ON "wa_vinculos"("corredora_id", "telefono_norm");

-- CreateIndex
CREATE UNIQUE INDEX "wa_vinculos_corredora_id_codigo_key" ON "wa_vinculos"("corredora_id", "codigo");

-- CreateIndex
CREATE INDEX "wa_entrantes_usuario_id_tomado_en_idx" ON "wa_entrantes"("usuario_id", "tomado_en");

-- CreateIndex
CREATE INDEX "wa_entrantes_creado_en_idx" ON "wa_entrantes"("creado_en");

-- CreateIndex
CREATE INDEX "ia_consumo_corredora_id_creado_en_idx" ON "ia_consumo"("corredora_id", "creado_en");

-- AddForeignKey
ALTER TABLE "wa_ajustes" ADD CONSTRAINT "wa_ajustes_corredora_id_fkey" FOREIGN KEY ("corredora_id") REFERENCES "corredoras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_conversaciones" ADD CONSTRAINT "wa_conversaciones_corredora_id_fkey" FOREIGN KEY ("corredora_id") REFERENCES "corredoras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_hilos" ADD CONSTRAINT "wa_hilos_corredora_id_fkey" FOREIGN KEY ("corredora_id") REFERENCES "corredoras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_enviados" ADD CONSTRAINT "wa_enviados_corredora_id_fkey" FOREIGN KEY ("corredora_id") REFERENCES "corredoras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_vinculos" ADD CONSTRAINT "wa_vinculos_corredora_id_fkey" FOREIGN KEY ("corredora_id") REFERENCES "corredoras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_vinculos" ADD CONSTRAINT "wa_vinculos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_entrantes" ADD CONSTRAINT "wa_entrantes_corredora_id_fkey" FOREIGN KEY ("corredora_id") REFERENCES "corredoras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_entrantes" ADD CONSTRAINT "wa_entrantes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ia_consumo" ADD CONSTRAINT "ia_consumo_corredora_id_fkey" FOREIGN KEY ("corredora_id") REFERENCES "corredoras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

