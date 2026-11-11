-- Puente corredor ↔ interesado: cada mensaje del interesado reenviado al celular del corredor queda ligado a su lead,
-- para que «responder citando» ese mensaje llegue al interesado correcto
CREATE TABLE "wa_puente" (
    "id" BIGSERIAL NOT NULL,
    "corredora_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "lead_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wa_puente_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "wa_puente_corredora_id_message_id_idx" ON "wa_puente"("corredora_id", "message_id");
CREATE INDEX "wa_puente_creado_en_idx" ON "wa_puente"("creado_en");
ALTER TABLE "wa_puente" ADD CONSTRAINT "wa_puente_corredora_id_fkey" FOREIGN KEY ("corredora_id") REFERENCES "corredoras"("id") ON DELETE CASCADE ON UPDATE CASCADE;
