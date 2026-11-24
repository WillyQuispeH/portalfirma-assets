// Enlaces cortos a archivos privados de R2: en vez de la URL firmada (enorme, con parámetros que asustan), el corredor recibe
//   https://<api>/v1/d/<nombre-legible>-<8 letras al azar>
// que al abrirse redirige a una descarga firmada de 5 minutos. El enlace vale el tiempo que se le dio al crearlo (24 horas por defecto)
// y el sufijo al azar impide adivinarlo. La tabla enlaces_cortos se limpia sola (lo vencido se borra al crear uno nuevo).
import { Controller, Get, Header, Injectable, Logger, NotFoundException, Param, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { Publico } from '../auth/usuario-actual';
import type { Env } from '../config/env';
import { AlmacenamientoService } from './almacenamiento.service';

const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789';

/** «Mandato de arriendo PF-1089.pdf» → «mandato-de-arriendo-pf-1089» */
export function slugDe(nombre: string, max = 36): string {
  const s = nombre
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
  return s || 'documento';
}

export const sufijoAzar = (largo = 8) =>
  Array.from(randomBytes(largo), (b) => ALFABETO[b % ALFABETO.length]).join('');

@Injectable()
export class EnlacesCortosService {
  private readonly log = new Logger('EnlacesCortos');

  constructor(
    private readonly db: PrismaService,
    private readonly r2: AlmacenamientoService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** crea el enlace corto de un archivo de R2 (que vale `segundos`) y devuelve su URL completa */
  async crear(corredoraId: string, clave: string, nombre: string, segundos = 24 * 3600): Promise<string> {
    const base = this.config.get('API_URL_PUBLICA', { infer: true });
    // en desarrollo la API es localhost (no se abre desde un celular): ahí va la descarga firmada directa
    if (/^https?:\/\/(localhost|127\.|192\.168\.)/.test(base)) return this.r2.urlDescarga(clave, nombre, segundos);
    const token = `${slugDe(nombre)}-${sufijoAzar()}`;
    await this.db.enlaceCorto.create({
      data: { token, corredoraId, clave, nombre: nombre.slice(0, 200), expiraEn: new Date(Date.now() + segundos * 1000) },
    });
    // lo vencido se va borrando de a poco (sin esperar y sin que un fallo afecte)
    void this.db.enlaceCorto.deleteMany({ where: { expiraEn: { lt: new Date() } } }).catch(() => null);
    return `${base}/v1/d/${token}`;
  }

  /** la descarga firmada (5 min) de un enlace vigente; null si no existe o ya venció */
  async resolver(token: string): Promise<string | null> {
    if (!/^[a-z0-9-]{9,80}$/.test(token)) return null;
    const e = await this.db.enlaceCorto.findUnique({ where: { token } });
    if (!e || e.expiraEn.getTime() < Date.now()) return null;
    try {
      return await this.r2.urlDescarga(e.clave, e.nombre, 300);
    } catch (err) {
      this.log.warn(`enlace ${token}: ${(err as Error).message}`);
      return null;
    }
  }
}

/** GET /v1/d/:token — sin sesión (el enlace es el permiso): redirige a la descarga */
@Controller('d')
export class EnlacesCortosController {
  constructor(private readonly s: EnlacesCortosService) {}

  @Publico()
  @Get(':token')
  @Header('Cache-Control', 'no-store')
  async abrir(@Param('token') token: string, @Res() res: Response) {
    const url = await this.s.resolver(token);
    if (!url) throw new NotFoundException('Este enlace venció o no existe. Pídele a quien te lo mandó que te envíe uno nuevo.');
    res.redirect(302, url);
  }
}
