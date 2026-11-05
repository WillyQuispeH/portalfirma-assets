/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument -- base simulada en memoria, sin tipos */
// Login, renovación con rotación y detección de reutilización, con una base de datos simulada en memoria.
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { AuthService } from './auth.service';
import { hashClave } from './clave';
import type { PrismaService } from '../prisma/prisma.service';
import type { Env } from '../config/env';

type Fila = Record<string, any>;

function baseFalsa() {
  const usuarios: Fila[] = [];
  const sesiones: Fila[] = [];
  const db = {
    usuario: {
      findUnique: ({ where, include }: Fila) => {
        const u = usuarios.find((x) => (where.email ? x.email === where.email : x.id === where.id));
        return Promise.resolve(
          u && include?.corredora ? { ...u, corredora: { id: u.corredoraId, nombre: 'Demo' } } : (u ?? null),
        );
      },
      update: ({ where, data }: Fila) =>
        Promise.resolve(
          Object.assign(
            usuarios.find((x) => x.id === where.id)!,
            data,
          ),
        ),
    },
    sesion: {
      create: ({ data }: Fila) => {
        const s = { id: randomUUID(), revocadaEn: null, ...data };
        sesiones.push(s);
        return Promise.resolve(s);
      },
      findUnique: ({ where }: Fila) => {
        const s = sesiones.find((x) => x.id === where.id);
        return Promise.resolve(s ? { ...s, usuario: usuarios.find((u) => u.id === s.usuarioId) } : null);
      },
      update: ({ where, data }: Fila) =>
        Promise.resolve(
          Object.assign(
            sesiones.find((x) => x.id === where.id)!,
            data,
          ),
        ),
      updateMany: ({ where, data }: Fila) => {
        sesiones.filter((x) => x.id === where.id && !x.revocadaEn).forEach((x) => Object.assign(x, data));
        return Promise.resolve({ count: 1 });
      },
    },
  };
  return { db: db as unknown as PrismaService, usuarios, sesiones };
}

describe('AuthService', () => {
  const jwt = new JwtService({ secret: 'x'.repeat(40), signOptions: { expiresIn: '15m' } });
  const config = { get: () => 30 } as unknown as ConfigService<Env, true>;
  let svc: AuthService;
  let base: ReturnType<typeof baseFalsa>;

  beforeEach(async () => {
    base = baseFalsa();
    base.usuarios.push({
      id: randomUUID(),
      corredoraId: randomUUID(),
      email: 'ana@demo.cl',
      nombre: 'Ana',
      rol: 'ADMIN',
      activo: true,
      hashClave: await hashClave('clave-segura-123'),
    });
    svc = new AuthService(base.db, jwt, config);
  });

  it('ingresa con email (sin importar mayúsculas) y clave correctos', async () => {
    const r = await svc.ingresar(' ANA@demo.cl ', 'clave-segura-123', { dispositivo: 'PC' });
    expect(r.usuario.email).toBe('ana@demo.cl');
    expect(r.usuario).not.toHaveProperty('hashClave');
    const carga = await jwt.verifyAsync<{ sub: string; rol: string }>(r.tokenAcceso);
    expect(carga.rol).toBe('ADMIN');
    expect(base.sesiones[0].hashRenovar).not.toContain(r.tokenRenovar.split('.')[1]);
  });

  it('rechaza clave incorrecta y email inexistente con el mismo mensaje', async () => {
    await expect(svc.ingresar('ana@demo.cl', 'otra', {})).rejects.toThrow('Email o clave incorrectos');
    await expect(svc.ingresar('nadie@demo.cl', 'otra', {})).rejects.toThrow('Email o clave incorrectos');
  });

  it('rechaza una cuenta desactivada', async () => {
    base.usuarios[0].activo = false;
    await expect(svc.ingresar('ana@demo.cl', 'clave-segura-123', {})).rejects.toThrow(/desactivada/);
  });

  it('renueva rotando el token; reutilizar el viejo cierra la sesión', async () => {
    const r1 = await svc.ingresar('ana@demo.cl', 'clave-segura-123', {});
    const r2 = await svc.renovar(r1.tokenRenovar);
    expect(r2.tokenRenovar).not.toBe(r1.tokenRenovar);
    await expect(svc.renovar(r1.tokenRenovar)).rejects.toBeInstanceOf(UnauthorizedException);
    // la sesión quedó cerrada: ni el token nuevo sirve
    await expect(svc.renovar(r2.tokenRenovar)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('no renueva tras salir, ni con tokens mal formados o vencidos', async () => {
    const r = await svc.ingresar('ana@demo.cl', 'clave-segura-123', {});
    await svc.salir(r.tokenRenovar.split('.')[0]);
    await expect(svc.renovar(r.tokenRenovar)).rejects.toThrow('La sesión venció');
    await expect(svc.renovar('basura')).rejects.toThrow('La sesión venció');
    const r2 = await svc.ingresar('ana@demo.cl', 'clave-segura-123', {});
    base.sesiones[1].expiraEn = new Date(Date.now() - 1000);
    await expect(svc.renovar(r2.tokenRenovar)).rejects.toThrow('La sesión venció');
  });
});
