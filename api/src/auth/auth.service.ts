// Login propio de Asset.
//  · Token de acceso (JWT, corto: JWT_DURACION) para cada llamada.
//  · Token de renovación «<idSesión>.<secreto>» (largo: REFRESH_DIAS) para pedir otro acceso; se rota en cada uso y,
//    si alguien reutiliza uno ya rotado, se cierra esa sesión (señal de que lo copiaron).
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Usuario } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { Env } from '../config/env';
import { gastarTiempo, igualesHex, nuevoSecreto, sha256, verificarClave } from './clave';
import type { UsuarioToken } from './usuario-actual';

const DIA = 24 * 60 * 60 * 1000;
const NO_VALIDO = 'Email o clave incorrectos';

export const usuarioPublico = (u: Usuario) => ({
  id: u.id,
  email: u.email,
  nombre: u.nombre,
  rol: u.rol,
  corredoraId: u.corredoraId,
});

@Injectable()
export class AuthService {
  constructor(
    private readonly db: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async ingresar(email: string, clave: string, extra: { dispositivo?: string; ip?: string }) {
    const u = await this.db.usuario.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!u) {
      await gastarTiempo(clave);
      throw new UnauthorizedException(NO_VALIDO);
    }
    if (!(await verificarClave(u.hashClave, clave))) throw new UnauthorizedException(NO_VALIDO);
    if (!u.activo) throw new UnauthorizedException('Tu cuenta está desactivada. Habla con el administrador.');

    const secreto = nuevoSecreto();
    const sesion = await this.db.sesion.create({
      data: {
        usuarioId: u.id,
        hashRenovar: sha256(secreto),
        dispositivo: extra.dispositivo,
        ip: extra.ip,
        expiraEn: this.vence(),
      },
    });
    await this.db.usuario.update({ where: { id: u.id }, data: { ultimoIngreso: new Date() } });
    return this.respuesta(u, sesion.id, secreto);
  }

  async renovar(token: string) {
    const [sid, secreto] = token.split('.');
    const sesion = sid && secreto ? await this.buscarSesion(sid) : null;
    if (!sesion || sesion.revocadaEn || sesion.expiraEn < new Date())
      throw new UnauthorizedException('La sesión venció');
    if (!igualesHex(sesion.hashRenovar, sha256(secreto))) {
      await this.db.sesion.update({ where: { id: sesion.id }, data: { revocadaEn: new Date() } });
      throw new UnauthorizedException('La sesión venció');
    }
    if (!sesion.usuario.activo)
      throw new UnauthorizedException('Tu cuenta está desactivada. Habla con el administrador.');

    const nuevo = nuevoSecreto();
    await this.db.sesion.update({
      where: { id: sesion.id },
      data: { hashRenovar: sha256(nuevo), usadoEn: new Date(), expiraEn: this.vence() },
    });
    return this.respuesta(sesion.usuario, sesion.id, nuevo);
  }

  async salir(sid: string) {
    await this.db.sesion.updateMany({ where: { id: sid, revocadaEn: null }, data: { revocadaEn: new Date() } });
  }

  async yo(id: string) {
    const u = await this.db.usuario.findUnique({ where: { id }, include: { corredora: true } });
    if (!u || !u.activo) throw new UnauthorizedException('Inicia sesión');
    return { ...usuarioPublico(u), corredora: { id: u.corredora.id, nombre: u.corredora.nombre } };
  }

  private buscarSesion(id: string) {
    // los id son UUID: si no tiene esa forma, ni se consulta (Postgres rechazaría el valor)
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    return this.db.sesion.findUnique({ where: { id }, include: { usuario: true } });
  }

  private vence() {
    return new Date(Date.now() + this.config.get('REFRESH_DIAS', { infer: true }) * DIA);
  }

  private async respuesta(u: Usuario, sid: string, secreto: string) {
    const carga: UsuarioToken = { sub: u.id, corredoraId: u.corredoraId, rol: u.rol, sid };
    return {
      tokenAcceso: await this.jwt.signAsync(carga),
      tokenRenovar: `${sid}.${secreto}`,
      usuario: usuarioPublico(u),
    };
  }
}
