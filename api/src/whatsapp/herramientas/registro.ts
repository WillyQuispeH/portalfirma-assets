// Registro de las herramientas del servidor: reúne las de cada módulo (negocios, propiedades y personas, documentos y firmas) para que el equipo
// (equipo.ts) las ofrezca a la IA y las ejecute. Para sumar un módulo: su clase implementa ProveedorHerramientas y se agrega aquí y en app.module.ts.
import { Injectable } from '@nestjs/common';
import { HerramientasNegocios } from './negocios';
import { HerramientasPropiedades } from './propiedades';
import { HerramientasDocumentos } from './documentos';
import type { Herramienta } from './tipos';

@Injectable()
export class HerramientasRegistro {
  constructor(
    private readonly negocios: HerramientasNegocios,
    private readonly propiedades: HerramientasPropiedades,
    private readonly documentos: HerramientasDocumentos,
  ) {}

  todas(): Herramienta[] {
    return [...this.negocios.herramientas, ...this.propiedades.herramientas, ...this.documentos.herramientas];
  }

  buscar(nombre: string): Herramienta | undefined {
    return this.todas().find((h) => h.name === nombre);
  }
}
