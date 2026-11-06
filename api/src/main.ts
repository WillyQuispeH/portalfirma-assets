import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import type { Env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.use(helmet());
  // los documentos que se suben a Portalfirma van en base64 dentro del JSON (hasta 20 MB → ~27 MB); el resto, 100 kB
  app.use('/v1/portalfirma/herramientas', json({ limit: '30mb' }));
  // una conversación del Agente completa (hasta 3 MB) y el lote que se sube al iniciar sesión
  app.use('/v1/agente/conversaciones', json({ limit: '8mb' }));
  // las reglas de la plataforma (hasta 2 MB) y los casos corregidos (lotes de hasta 50)
  app.use('/v1/reglas-notariales', json({ limit: '4mb' }));
  // la IA de la app manda páginas de documentos como imágenes y el dictado manda audio
  app.use('/v1/ia', json({ limit: '30mb' }));
  app.use(json({ limit: '100kb' }));
  app.use(urlencoded({ extended: true, limit: '100kb' }));
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  // detrás de nginx en el servidor: la IP real del cliente viene en X-Forwarded-For
  app.set('trust proxy', 1);
  app.enableShutdownHooks();
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  // en producción solo la ve nginx (mismo servidor); en desarrollo, todas las interfaces
  await app.listen(
    config.get('PORT', { infer: true }),
    config.get('NODE_ENV', { infer: true }) === 'production' ? '127.0.0.1' : '0.0.0.0',
  );
}
void bootstrap();
