-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateEnum
CREATE TYPE "tipo_propiedad" AS ENUM ('casa', 'departamento', 'oficina', 'sitio', 'local_comercial', 'industrial', 'agricola', 'parcela', 'estacionamiento', 'terreno_construccion', 'bodega');

-- CreateEnum
CREATE TYPE "estado_operacion" AS ENUM ('disponible', 'reservada', 'vendida', 'arrendada', 'no_disponible');

-- CreateEnum
CREATE TYPE "moneda" AS ENUM ('UF', 'CLP', 'USD');

-- CreateEnum
CREATE TYPE "tipo_persona" AS ENUM ('natural', 'juridica');

-- CreateEnum
CREATE TYPE "rol_vinculo" AS ENUM ('propietario', 'arrendatario', 'comprador', 'codeudor', 'interesado', 'proveedor');

-- AlterTable
ALTER TABLE "corredoras" ADD COLUMN     "siguiente_codigo" INTEGER NOT NULL DEFAULT 1001;

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "telefono" TEXT,
ADD COLUMN     "wechatia_id" TEXT,
ADD COLUMN     "wechatia_nombre" TEXT;

-- CreateTable
CREATE TABLE "propiedades" (
    "id" UUID NOT NULL,
    "corredora_id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "tipo" "tipo_propiedad" NOT NULL DEFAULT 'casa',
    "venta" BOOLEAN NOT NULL DEFAULT false,
    "arriendo" BOOLEAN NOT NULL DEFAULT false,
    "precio_venta" DECIMAL(16,2),
    "moneda_venta" "moneda",
    "precio_arriendo" DECIMAL(16,2),
    "moneda_arriendo" "moneda",
    "estado_venta" "estado_operacion",
    "estado_arriendo" "estado_operacion",
    "direccion" TEXT,
    "unidad" TEXT,
    "comuna" TEXT,
    "region" TEXT,
    "rol" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "place_id" TEXT,
    "sup_total" DECIMAL(12,2),
    "sup_util" DECIMAL(12,2),
    "dormitorios" INTEGER,
    "banos" INTEGER,
    "estacionamientos" INTEGER,
    "bodegas" INTEGER,
    "amoblado" BOOLEAN NOT NULL DEFAULT false,
    "gastos_comunes" DECIMAL(14,2),
    "descripcion" TEXT,
    "notas_internas" TEXT,
    "titulo_portal" TEXT,
    "portal_barrio" TEXT,
    "etiquetas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ficha" JSONB NOT NULL DEFAULT '{}',
    "portales" JSONB NOT NULL DEFAULT '{}',
    "leads_portal" JSONB NOT NULL DEFAULT '[]',
    "captador_id" UUID,
    "corredor_origen" JSONB,
    "archivada" BOOLEAN NOT NULL DEFAULT false,
    "origen_sistema" TEXT,
    "origen_id" TEXT,
    "origen_datos" JSONB,
    "editados" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "busqueda" TEXT NOT NULL DEFAULT '',
    "id_legado" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "creado_por_id" UUID,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "eliminado_en" TIMESTAMP(3),

    CONSTRAINT "propiedades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "propiedad_fotos" (
    "id" UUID NOT NULL,
    "propiedad_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "destacada" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "propiedad_fotos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "propiedad_documentos" (
    "id" UUID NOT NULL,
    "propiedad_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'otro',
    "tamano" INTEGER,
    "clave_almacenamiento" TEXT,
    "subido_por_id" UUID,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "propiedad_documentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personas" (
    "id" UUID NOT NULL,
    "corredora_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "rut" TEXT,
    "rut_formato" TEXT,
    "tipo" "tipo_persona" NOT NULL DEFAULT 'natural',
    "email" TEXT,
    "telefono" TEXT,
    "direccion" TEXT,
    "estado_civil" TEXT,
    "profesion" TEXT,
    "nacionalidad" TEXT DEFAULT 'chilena',
    "roles" "rol_vinculo"[] DEFAULT ARRAY[]::"rol_vinculo"[],
    "notas" TEXT,
    "extra" JSONB NOT NULL DEFAULT '{}',
    "busqueda" TEXT NOT NULL DEFAULT '',
    "id_legado" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "eliminado_en" TIMESTAMP(3),

    CONSTRAINT "personas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "propiedad_personas" (
    "propiedad_id" UUID NOT NULL,
    "persona_id" UUID NOT NULL,
    "rol" "rol_vinculo" NOT NULL,
    "desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "propiedad_personas_pkey" PRIMARY KEY ("propiedad_id","persona_id","rol")
);

-- CreateTable
CREATE TABLE "actividad" (
    "id" BIGSERIAL NOT NULL,
    "corredora_id" UUID NOT NULL,
    "entidad_tipo" TEXT NOT NULL,
    "entidad_id" TEXT NOT NULL,
    "ref2" TEXT,
    "tipo" TEXT,
    "texto" TEXT NOT NULL,
    "usuario_id" UUID,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "actividad_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "propiedades_corredora_id_actualizado_en_idx" ON "propiedades"("corredora_id", "actualizado_en");

-- CreateIndex
CREATE INDEX "propiedades_corredora_id_archivada_tipo_idx" ON "propiedades"("corredora_id", "archivada", "tipo");

-- CreateIndex
CREATE INDEX "propiedades_corredora_id_comuna_idx" ON "propiedades"("corredora_id", "comuna");

-- CreateIndex
CREATE INDEX "propiedades_corredora_id_captador_id_idx" ON "propiedades"("corredora_id", "captador_id");

-- CreateIndex
CREATE INDEX "propiedades_corredora_id_venta_estado_venta_idx" ON "propiedades"("corredora_id", "venta", "estado_venta");

-- CreateIndex
CREATE INDEX "propiedades_corredora_id_arriendo_estado_arriendo_idx" ON "propiedades"("corredora_id", "arriendo", "estado_arriendo");

-- CreateIndex
CREATE INDEX "propiedades_busqueda_idx" ON "propiedades" USING GIN ("busqueda" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "propiedades_ficha_idx" ON "propiedades" USING GIN ("ficha" jsonb_path_ops);

-- CreateIndex
CREATE UNIQUE INDEX "propiedades_corredora_id_codigo_key" ON "propiedades"("corredora_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "propiedades_corredora_id_origen_sistema_origen_id_key" ON "propiedades"("corredora_id", "origen_sistema", "origen_id");

-- CreateIndex
CREATE UNIQUE INDEX "propiedades_corredora_id_id_legado_key" ON "propiedades"("corredora_id", "id_legado");

-- CreateIndex
CREATE INDEX "propiedad_fotos_propiedad_id_orden_idx" ON "propiedad_fotos"("propiedad_id", "orden");

-- CreateIndex
CREATE INDEX "propiedad_documentos_propiedad_id_idx" ON "propiedad_documentos"("propiedad_id");

-- CreateIndex
CREATE INDEX "personas_corredora_id_actualizado_en_idx" ON "personas"("corredora_id", "actualizado_en");

-- CreateIndex
CREATE INDEX "personas_corredora_id_telefono_idx" ON "personas"("corredora_id", "telefono");

-- CreateIndex
CREATE INDEX "personas_corredora_id_email_idx" ON "personas"("corredora_id", "email");

-- CreateIndex
CREATE INDEX "personas_busqueda_idx" ON "personas" USING GIN ("busqueda" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "personas_corredora_id_rut_key" ON "personas"("corredora_id", "rut");

-- CreateIndex
CREATE UNIQUE INDEX "personas_corredora_id_id_legado_key" ON "personas"("corredora_id", "id_legado");

-- CreateIndex
CREATE INDEX "propiedad_personas_persona_id_idx" ON "propiedad_personas"("persona_id");

-- CreateIndex
CREATE INDEX "actividad_corredora_id_entidad_id_fecha_idx" ON "actividad"("corredora_id", "entidad_id", "fecha" DESC);

-- CreateIndex
CREATE INDEX "actividad_corredora_id_ref2_fecha_idx" ON "actividad"("corredora_id", "ref2", "fecha" DESC);

-- CreateIndex
CREATE INDEX "actividad_corredora_id_fecha_idx" ON "actividad"("corredora_id", "fecha" DESC);

-- AddForeignKey
ALTER TABLE "propiedades" ADD CONSTRAINT "propiedades_corredora_id_fkey" FOREIGN KEY ("corredora_id") REFERENCES "corredoras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "propiedades" ADD CONSTRAINT "propiedades_captador_id_fkey" FOREIGN KEY ("captador_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "propiedad_fotos" ADD CONSTRAINT "propiedad_fotos_propiedad_id_fkey" FOREIGN KEY ("propiedad_id") REFERENCES "propiedades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "propiedad_documentos" ADD CONSTRAINT "propiedad_documentos_propiedad_id_fkey" FOREIGN KEY ("propiedad_id") REFERENCES "propiedades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personas" ADD CONSTRAINT "personas_corredora_id_fkey" FOREIGN KEY ("corredora_id") REFERENCES "corredoras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "propiedad_personas" ADD CONSTRAINT "propiedad_personas_propiedad_id_fkey" FOREIGN KEY ("propiedad_id") REFERENCES "propiedades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "propiedad_personas" ADD CONSTRAINT "propiedad_personas_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actividad" ADD CONSTRAINT "actividad_corredora_id_fkey" FOREIGN KEY ("corredora_id") REFERENCES "corredoras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

