-- Sofía (asistente de leads por WhatsApp) se puede apagar por corredora; encendida por defecto, como antes
ALTER TABLE "wa_ajustes" ADD COLUMN "leads_activo" BOOLEAN NOT NULL DEFAULT true;
