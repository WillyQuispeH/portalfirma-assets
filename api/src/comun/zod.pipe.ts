// Valida el cuerpo o la consulta con un esquema de zod. Los errores salen en español y con el campo que falló.
import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly esquema: ZodType<T>) {}

  transform(valor: unknown): T {
    const r = this.esquema.safeParse(valor);
    if (r.success) return r.data;
    const detalle = r.error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message));
    throw new BadRequestException(detalle);
  }
}
