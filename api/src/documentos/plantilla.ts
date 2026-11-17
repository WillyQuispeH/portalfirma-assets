/* eslint-disable @typescript-eslint/no-base-to-string -- los datos de la plantilla llegan sin tipo */
// Plantillas HTML de documentos de Asset (src/documentos/plantillas/*.html). Son HTML normales con variables entre
// llaves dobles que se reemplazan solas:
//   {{visitante.nombre}}            un dato (se escapa: nunca entra HTML de afuera al documento)
//   {{#propiedades}}…{{/propiedades}}  repite el bloque por cada elemento de la lista (dentro se ven sus campos y los de afuera)
//   {{#foto}}…{{/foto}}             el bloque solo aparece si «foto» tiene valor
// Los comentarios HTML se quitan antes de llenar, así se puede documentar la plantilla dentro de su archivo.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Contexto = Record<string, unknown>;

const escapar = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

/** busca «a.b.c» en el contexto más interno primero (dentro de una lista se ven también los datos de afuera) */
function buscar(ctx: Contexto[], ruta: string): unknown {
  for (let i = ctx.length - 1; i >= 0; i--) {
    let v: unknown = ctx[i];
    for (const k of ruta.split('.')) {
      if (v == null || typeof v !== 'object') {
        v = undefined;
        break;
      }
      v = (v as Contexto)[k];
    }
    if (v !== undefined) return v;
  }
  return undefined;
}

function llenarCon(t: string, ctx: Contexto[]): string {
  return t
    .replace(/\{\{#([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, k: string, dentro: string) => {
      const v = buscar(ctx, k);
      if (Array.isArray(v)) return v.map((it) => llenarCon(dentro, [...ctx, it as Contexto])).join('');
      if (v && typeof v === 'object') return llenarCon(dentro, [...ctx, v as Contexto]);
      return v ? llenarCon(dentro, ctx) : '';
    })
    .replace(/\{\{([\w.]+)\}\}/g, (_, k: string) => escapar(buscar(ctx, k)));
}

/** reemplaza las variables de un HTML */
export const llenar = (html: string, datos: Contexto) => llenarCon(html.replace(/<!--[\s\S]*?-->/g, ''), [datos]);

/** lee una plantilla de src/documentos/plantillas (en dist se copia al compilar, ver nest-cli.json) */
export const cargarPlantilla = (nombre: string) => {
  const dir = join(__dirname, 'plantillas');
  // el estilo común (_base.css) se mete donde la plantilla escribe  /*@base*/  dentro de su <style>
  return readFileSync(join(dir, `${nombre}.html`), 'utf8').replace('/*@base*/', () =>
    readFileSync(join(dir, '_base.css'), 'utf8'),
  );
};
