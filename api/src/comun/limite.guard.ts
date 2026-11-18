// Límite de peticiones por PERSONA, no por IP: todos los equipos de una oficina salen a internet con la misma IP, y
// con el límite por IP 6 o más Asset abiertos (avisos cada pocos segundos + sincronización) se quedaban sin cupo.
//  · con sesión (SesionGuard ya dejó req.usuario): un cupo por usuario;
//  · ingreso: por IP + correo (10 personas pueden entrar a la vez desde la misma oficina; adivinar claves de UNA cuenta
//    sigue limitado a 5 por minuto);
//  · lo demás sin sesión: por IP, como antes.
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard } from '@nestjs/throttler';

interface Peticion {
  ip?: string;
  ips?: string[];
  url?: string;
  originalUrl?: string;
  headers?: { authorization?: string };
  body?: { email?: unknown };
  usuario?: { sub?: string };
}

@Injectable()
export class LimiteGuard extends ThrottlerGuard {
  // inyección por propiedad: el constructor de ThrottlerGuard ya recibe lo suyo
  @Inject(JwtService) private readonly jwt!: JwtService;

  /** el usuario del token (verificado: firma y vencimiento), sin depender del orden de los guardias globales */
  private async usuarioDe(req: Peticion): Promise<string | null> {
    if (req.usuario?.sub) return String(req.usuario.sub);
    const [tipo, token] = (req.headers?.authorization ?? '').split(' ');
    if (tipo !== 'Bearer' || !token) return null;
    try {
      return String((await this.jwt.verifyAsync<{ sub: string }>(token)).sub || '') || null;
    } catch {
      return null;
    }
  }

  protected async getTracker(r: Record<string, unknown>): Promise<string> {
    const req = r as Peticion;
    const ip = String(req.ips?.length ? req.ips[0] : (req.ip ?? ''));
    const sub = await this.usuarioDe(req);
    if (sub) return `u:${sub}`;
    const correo = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (correo && /\/auth\/ingresar$/.test((req.originalUrl ?? req.url ?? '').split('?')[0]))
      return `i:${ip}:${correo}`;
    return `ip:${ip}`;
  }
}
