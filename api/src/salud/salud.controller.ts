// GET /v1/salud: la API está arriba y llega a la base de datos (para el monitoreo y para la app de escritorio).
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Publico } from '../auth/usuario-actual';

@Controller('salud')
export class SaludController {
  constructor(private readonly db: PrismaService) {}

  @Publico()
  @Get()
  async salud() {
    try {
      await this.db.$queryRaw`SELECT 1`;
      return { ok: true, db: true };
    } catch {
      throw new ServiceUnavailableException({ ok: false, db: false });
    }
  }
}
