// Los datos de la corredora que llevan sus documentos (orden de visita, carta oferta, contratos, mandatos, actas):
// razón social, RUT, domicilio, representante legal y logo. Los edita el administrador en Configuración › Corredora.
//  · GET /v1/corredora/datos — todos (la app los muestra); PUT — solo el administrador.
//  · El RUT vive en corredoras.rut; lo demás en registros › corredora_config › «documentos» (aparte de «corredora»,
//    que la app de escritorio reescribe completo: así nunca pisa estos datos).
//  · El logo es una imagen pequeña (PNG/JPG, máx. ~400 KB) guardada como data URL: entra directo al PDF.
import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Put } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { ZodPipe } from '../comun/zod.pipe';

const CONFIG = { coleccion: 'corredora_config', id: 'documentos' } as const;
/** el texto antiguo del representante (escrito a mano) vivía en corredora_config › corredora */
const CONFIG_ANTIGUA = { coleccion: 'corredora_config', id: 'corredora' } as const;
const LOGO_MAX = 550_000; // caracteres del data URL (~400 KB de imagen)

export interface DatosCorredora {
  /** el nombre que se usa en el texto (razón social si existe; si no, el nombre de la corredora) */
  nombre: string;
  nombreFantasia: string;
  razonSocial: string;
  rut: string;
  domicilio: string;
  representanteNombre: string;
  representanteRut: string;
  /** texto para los comparecientes: «don Fulano, cédula de identidad número 1.111.111-1» */
  representante: string;
  logo: string;
}

/** «12.345.678-9» desde cualquier forma de escribir el RUT */
const formatoRut = (r: string) => {
  const l = r.replace(/[^\dkK]/g, '').toUpperCase();
  if (l.length < 2) return r.trim();
  const cuerpo = l.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${cuerpo}-${l.slice(-1)}`;
};

/** los datos de la corredora para llenar un documento */
export async function datosCorredora(db: PrismaService, corredoraId: string): Promise<DatosCorredora> {
  const [c, cfg, antigua] = await Promise.all([
    db.corredora.findUnique({ where: { id: corredoraId }, select: { nombre: true, rut: true } }),
    db.registro.findUnique({ where: { corredoraId_coleccion_id: { corredoraId, ...CONFIG } } }),
    db.registro.findUnique({ where: { corredoraId_coleccion_id: { corredoraId, ...CONFIG_ANTIGUA } } }),
  ]);
  const d = (cfg?.datos ?? {}) as Record<string, unknown>;
  const s = (k: string) => (typeof d[k] === 'string' ? d[k] : '').trim();
  const repNombre = s('representanteNombre');
  const repRut = s('representanteRut');
  const representante = repNombre
    ? `${repNombre}${repRut ? `, cédula de identidad número ${formatoRut(repRut)}` : ''}`
    : String(((antigua?.datos ?? {}) as { representante?: string }).representante ?? '').trim(); // texto antiguo
  const razonSocial = s('razonSocial');
  return {
    nombre: razonSocial || c?.nombre || 'la corredora',
    nombreFantasia: c?.nombre ?? '',
    razonSocial,
    rut: c?.rut ? formatoRut(c.rut) : '',
    domicilio: s('domicilio'),
    representanteNombre: repNombre,
    representanteRut: repRut ? formatoRut(repRut) : '',
    representante,
    logo: s('logo'),
  };
}

const rutOk = (r: string) => {
  const l = r.replace(/[^\dkK]/g, '').toUpperCase();
  if (l.length < 2) return false;
  let suma = 0;
  let m = 2;
  for (let i = l.length - 2; i >= 0; i--) {
    suma += Number(l[i]) * m;
    m = m === 7 ? 2 : m + 1;
  }
  const dv = 11 - (suma % 11);
  return (dv === 11 ? '0' : dv === 10 ? 'K' : String(dv)) === l.slice(-1);
};
const texto = (max: number) => z.string().trim().max(max).optional();
const rut = z
  .string()
  .trim()
  .max(20)
  .refine((r) => r === '' || rutOk(r), 'Ese RUT no es válido (revisa el dígito verificador).')
  .optional();
const guardarEsquema = z.object({
  razonSocial: texto(200),
  rut,
  domicilio: texto(300),
  representanteNombre: texto(160),
  representanteRut: rut,
  logo: z
    .string()
    .max(LOGO_MAX, 'El logo es muy pesado: usa una imagen de menos de 400 KB.')
    .refine(
      (l) => l === '' || /^data:image\/(png|jpe?g);base64,[A-Za-z0-9+/=]+$/.test(l),
      'El logo tiene que ser PNG o JPG.',
    )
    .optional(),
});

@Injectable()
export class CorredoraDocService {
  constructor(private readonly db: PrismaService) {}

  async ver(u: UsuarioToken) {
    return { ...(await datosCorredora(this.db, u.corredoraId)), puedeEditar: u.rol === 'ADMIN' };
  }

  async guardar(u: UsuarioToken, b: z.infer<typeof guardarEsquema>) {
    if (u.rol !== 'ADMIN') throw new ForbiddenException('Los datos de la corredora los edita el administrador.');
    if (b.rut !== undefined) {
      const limpio = b.rut ? formatoRut(b.rut) : null;
      try {
        await this.db.corredora.update({ where: { id: u.corredoraId }, data: { rut: limpio } });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
          throw new BadRequestException('Ese RUT ya está registrado en otra corredora.');
        throw e;
      }
    }
    const donde = { corredoraId_coleccion_id: { corredoraId: u.corredoraId, ...CONFIG } };
    const previo = await this.db.registro.findUnique({ where: donde });
    const datos = { ...((previo?.datos ?? {}) as Record<string, unknown>) };
    for (const k of ['razonSocial', 'domicilio', 'representanteNombre', 'representanteRut', 'logo'] as const)
      if (b[k] !== undefined) datos[k] = b[k];
    await this.db.registro.upsert({
      where: donde,
      create: { corredoraId: u.corredoraId, ...CONFIG, creadoPorId: u.sub, datos: datos as Prisma.InputJsonObject },
      update: { datos: datos as Prisma.InputJsonObject, version: { increment: 1 } },
    });
    return this.ver(u);
  }
}

@Controller('corredora/datos')
export class CorredoraDocController {
  constructor(private readonly s: CorredoraDocService) {}

  @Get()
  ver(@UsuarioActual() u: UsuarioToken) {
    return this.s.ver(u);
  }

  @Put()
  guardar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(guardarEsquema)) b: z.infer<typeof guardarEsquema>) {
    return this.s.guardar(u, b);
  }
}
