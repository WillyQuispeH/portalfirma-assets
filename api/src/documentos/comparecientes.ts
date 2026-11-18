// Cómo se presenta a una persona en un documento legal: «María López Silva, chilena, soltera, abogada, cédula de identidad
// número 29.417.758-2, con domicilio en Los Leones 567, Providencia». Solo se escribe lo que la ficha tiene (nada se inventa).
// Lo usan la carta oferta, el contrato de arriendo y el mandato.
interface PersonaDoc {
  nombre: string;
  rut: string | null;
  rutFormato: string | null;
  nacionalidad: string | null;
  estadoCivil: string | null;
  profesion: string | null;
  direccion: string | null;
}

const minus = (s: string | null | undefined) =>
  String(s ?? '')
    .trim()
    .toLowerCase();

export const rutDe = (p: { rutFormato: string | null; rut: string | null }) => p.rutFormato || p.rut || '';

/** «chilena, soltera, abogada» (lo que se sepa) */
export const perfilDe = (p: Pick<PersonaDoc, 'nacionalidad' | 'estadoCivil' | 'profesion'>) =>
  [minus(p.nacionalidad), minus(p.estadoCivil), minus(p.profesion)].filter(Boolean).join(', ');

/** el compareciente completo, para la comparecencia del documento */
export function describir(p: PersonaDoc): string {
  const rut = rutDe(p);
  return [
    p.nombre,
    perfilDe(p),
    rut ? `cédula de identidad número ${rut}` : '',
    p.direccion ? `con domicilio en ${p.direccion}` : '',
  ]
    .filter(Boolean)
    .join(', ');
}

/** «Ana Pérez», «Ana Pérez y Juan Soto», «Ana Pérez, Juan Soto y Luis Rojas» */
export function unir(nombres: string[]): string {
  const n = nombres.filter(Boolean);
  return n.length <= 1 ? (n[0] ?? '') : `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}`;
}

/** la inscripción de dominio que haya en la ficha de la propiedad (ficha.fojas, ficha.numeroInscripcion, ficha.anioInscripcion, ficha.conservador) */
export function dominioDe(ficha: unknown): string {
  const f = (ficha ?? {}) as Record<string, unknown>;
  const t = (k: string) => String(f[k] ?? '').trim();
  const [fojas, numero, anio, cbr] = [t('fojas'), t('numeroInscripcion'), t('anioInscripcion'), t('conservador')];
  const insc = [fojas && `a Fojas ${fojas}`, numero && `Número ${numero}`].filter(Boolean).join(' ');
  if (!insc) return 'en el Conservador de Bienes Raíces respectivo.';
  return `${insc}${anio ? `, correspondiente al Registro de Propiedad del año ${anio}` : ''} del Conservador de Bienes Raíces${cbr ? ` de ${cbr}` : ' respectivo'}.`;
}
