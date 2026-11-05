import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class IngresarDto {
  @IsEmail({}, { message: 'email inválido' })
  email!: string;

  @IsString()
  @MinLength(1, { message: 'falta la clave' })
  @MaxLength(200)
  clave!: string;

  /** Nombre del equipo, para que el usuario reconozca sus sesiones abiertas. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  dispositivo?: string;
}

export class RenovarDto {
  @IsString()
  @MinLength(10)
  @MaxLength(300)
  tokenRenovar!: string;
}
