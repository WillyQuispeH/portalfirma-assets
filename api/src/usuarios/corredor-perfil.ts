// Los datos del corredor que van en los documentos (orden de visita, mandatos, contratos…): su nombre, teléfono y correo. En el servidor
// los documentos los toman de la cuenta del usuario, así que «configurar el corredor» cambia su cuenta.
//  · PUT /v1/usuarios/yo/corredor  { nombre?, telefono?, email?, confirmado? }
// El nombre y el teléfono se cambian directo. El correo es también el de entrar a Asset: se cambia solo con `confirmado: true` y no puede estar
// en uso por otra cuenta.
import { BadRequestException, Body, ConflictException, Controller, Injectable, Put } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ActividadService } from '../comun/actividad.service';
import { ZodPipe } from '../comun/zod.pipe';
import { Roles, UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { emailValido } from '../personas/personas-acciones';

@Injectable()
export class CorredorPerfilService {
  constructor(
    private readonly db: PrismaService,
    private readonly actividad: ActividadService,
  ) {}

  /** nombre, teléfono y correo del corredor; devuelve lo que quedó y, si el correo exige confirmación, `confirmar` */
  async guardar(u: UsuarioToken, o: { nombre?: string; telefono?: string; email?: string; confirmado?: boolean }) {
    const x = await this.db.usuario.findUnique({ where: { id: u.sub } });
    if (!x) throw new BadRequestException('No encontré tu cuenta.');
    const nombre = String(o.nombre ?? '').trim().replace(/\s+/g, ' ');
    const telefono = String(o.telefono ?? '').trim();
    const email = String(o.email ?? '').trim().toLowerCase();
    if (!nombre && !telefono && !email) throw new BadRequestException('Indica el nombre, el teléfono o el correo que quieres guardar.');
    if (nombre && nombre.length < 2) throw new BadRequestException('El nombre es muy corto.');
    if (email && !emailValido(email)) throw new BadRequestException(`El correo «${email}» no es válido.`);
    if (telefono && telefono.replace(/\D/g, '').length < 8) throw new BadRequestException('El teléfono no es válido.');
    const cambiaCorreo = !!email && email !== x.email;
    if (cambiaCorreo && !o.confirmado)
      return {
        ok: false as const,
        confirmar: `Tu correo en los documentos es el mismo con el que entras a Asset: pasaría de ${x.email} a ${email}. ¿Lo cambio?`,
        usuario: { nombre: x.nombre, telefono: x.telefono ?? '', email: x.email },
      };
    try {
      const n = await this.db.usuario.update({
        where: { id: u.sub },
        data: { ...(nombre ? { nombre } : {}), ...(telefono ? { telefono } : {}), ...(cambiaCorreo ? { email } : {}) },
      });
      await this.actividad.registrar({
        corredoraId: u.corredoraId,
        entidadTipo: 'otro',
        entidadId: u.sub,
        texto: `Datos del corredor actualizados (${[nombre && 'nombre', telefono && 'teléfono', cambiaCorreo && 'correo'].filter(Boolean).join(', ')})`,
        usuarioId: u.sub,
      });
      return { ok: true as const, usuario: { nombre: n.nombre, telefono: n.telefono ?? '', email: n.email } };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Ya existe una cuenta con ese correo.');
      throw e;
    }
  }
}

const esquema = z.object({
  nombre: z.string().max(120).optional(),
  telefono: z.string().max(40).optional(),
  email: z.string().max(200).optional(),
  confirmado: z.boolean().optional(),
});

@Controller('usuarios/yo/corredor')
export class CorredorPerfilController {
  constructor(private readonly s: CorredorPerfilService) {}

  @Put()
  @Roles('ADMIN', 'CORREDOR')
  guardar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(esquema)) b: z.infer<typeof esquema>) {
    return this.s.guardar(u, b);
  }
}
