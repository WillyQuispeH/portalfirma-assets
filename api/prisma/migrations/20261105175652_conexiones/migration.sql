-- CreateTable
CREATE TABLE "conexiones" (
    "id" UUID NOT NULL,
    "corredora_id" UUID NOT NULL,
    "usuario_id" UUID,
    "proveedor" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'oauth',
    "estado" TEXT NOT NULL DEFAULT 'activa',
    "cuenta_id" TEXT,
    "cuenta_nombre" TEXT,
    "alcance" TEXT,
    "acceso_cif" TEXT,
    "renovar_cif" TEXT,
    "expira_en" TIMESTAMP(3),
    "datos" JSONB NOT NULL DEFAULT '{}',
    "ultimo_error" TEXT,
    "conectado_por" UUID,
    "conectado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "renovado_en" TIMESTAMP(3),
    "usado_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conexiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_pendientes" (
    "state" TEXT NOT NULL,
    "corredora_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "proveedor" TEXT NOT NULL,
    "de_corredora" BOOLEAN NOT NULL DEFAULT false,
    "verificador_cif" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_pendientes_pkey" PRIMARY KEY ("state")
);

-- CreateTable
CREATE TABLE "oauth_clientes" (
    "proveedor" TEXT NOT NULL,
    "redirect_uri" TEXT NOT NULL,
    "cliente_cif" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_clientes_pkey" PRIMARY KEY ("proveedor","redirect_uri")
);

-- CreateIndex
CREATE INDEX "conexiones_corredora_id_proveedor_idx" ON "conexiones"("corredora_id", "proveedor");

-- CreateIndex
CREATE INDEX "conexiones_proveedor_estado_expira_en_idx" ON "conexiones"("proveedor", "estado", "expira_en");

-- CreateIndex
CREATE INDEX "oauth_pendientes_expira_en_idx" ON "oauth_pendientes"("expira_en");

-- AddForeignKey
ALTER TABLE "conexiones" ADD CONSTRAINT "conexiones_corredora_id_fkey" FOREIGN KEY ("corredora_id") REFERENCES "corredoras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conexiones" ADD CONSTRAINT "conexiones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

