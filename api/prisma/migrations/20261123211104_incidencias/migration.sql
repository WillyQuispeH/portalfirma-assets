-- CreateTable
CREATE TABLE "incidencias" (
    "id" SERIAL NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL DEFAULT '',
    "modulo" TEXT NOT NULL DEFAULT 'otro',
    "estado" TEXT NOT NULL DEFAULT 'nueva',
    "prioridad" TEXT NOT NULL DEFAULT 'media',
    "origen" TEXT NOT NULL DEFAULT 'manual',
    "corredora_id" UUID,
    "corredora_nombre" TEXT NOT NULL DEFAULT '',
    "usuario_id" UUID,
    "usuario_nombre" TEXT NOT NULL DEFAULT '',
    "enlace" TEXT NOT NULL DEFAULT '',
    "responsable" TEXT,
    "creada_por" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "resuelta_en" TIMESTAMP(3),

    CONSTRAINT "incidencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidencia_notas" (
    "id" BIGSERIAL NOT NULL,
    "incidencia_id" INTEGER NOT NULL,
    "autor" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "sistema" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incidencia_notas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "incidencias_estado_prioridad_actualizado_en_idx" ON "incidencias"("estado", "prioridad", "actualizado_en");

-- CreateIndex
CREATE INDEX "incidencias_corredora_id_estado_idx" ON "incidencias"("corredora_id", "estado");

-- CreateIndex
CREATE INDEX "incidencia_notas_incidencia_id_creado_en_idx" ON "incidencia_notas"("incidencia_id", "creado_en");

-- AddForeignKey
ALTER TABLE "incidencia_notas" ADD CONSTRAINT "incidencia_notas_incidencia_id_fkey" FOREIGN KEY ("incidencia_id") REFERENCES "incidencias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

