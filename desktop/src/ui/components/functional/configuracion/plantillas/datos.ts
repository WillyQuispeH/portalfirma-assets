// Los datos que se pueden poner en una cláusula, con su nombre legible: el editor nunca muestra el código del dato
// (p. ej. «corredora.rut»), sino su etiqueta («RUT de la corredora»). Lista armada desde las 7 plantillas base de la API
// (variablesDe de api/src/documentos/bloques.ts). Un dato que no esté aquí recibe una etiqueta automática legible.

export type TGrupoDato = 'Corredora' | 'Corredor' | 'Propiedad' | 'Personas' | 'Condiciones' | 'Documento' | 'Otros';

const ETIQUETAS: Record<string, string> = {
  // corredora
  'corredora.nombre': 'Nombre de la corredora',
  'corredora.rut': 'RUT de la corredora',
  'corredora.representante': 'Representante de la corredora',
  'corredora.domicilio': 'Domicilio de la corredora',
  // corredor
  'corredor.nombre': 'Nombre del corredor',
  'corredor.email': 'Correo del corredor',
  'corredor.telefono': 'Teléfono del corredor',
  // propiedad
  'propiedad.direccion': 'Dirección de la propiedad',
  'propiedad.comuna': 'Comuna de la propiedad',
  'propiedad.tipo': 'Tipo de propiedad',
  'propiedad.tipoMin': 'Tipo de propiedad (en minúscula)',
  'propiedad.descripcion': 'Descripción de la propiedad',
  'propiedad.dominio': 'Inscripción de dominio',
  'propiedad.rol': 'Rol de avalúo',
  'propiedad.codigo': 'Código de la propiedad',
  'propiedad.precio': 'Precio de la propiedad',
  'propiedad.precioLista': 'Precio de lista',
  'propiedad.canon': 'Arriendo mensual de la propiedad',
  'propiedad.supUtil': 'Superficie útil',
  'propiedad.supTotal': 'Superficie total',
  'propiedad.bodega': 'Bodega',
  'propiedad.estacionamientos': 'Estacionamientos',
  direccion: 'Dirección',
  // personas
  'visitante.nombre': 'Nombre del visitante',
  'visitante.rut': 'RUT del visitante',
  'visitante.nacionalidad': 'Nacionalidad del visitante',
  'visitante.email': 'Correo del visitante',
  'visitante.telefono': 'Teléfono del visitante',
  'oferente.nombre': 'Nombre de quien ofrece',
  'oferente.rut': 'RUT de quien ofrece',
  'oferente.perfil': 'Profesión o estado civil de quien ofrece',
  'oferente.domicilio': 'Domicilio de quien ofrece',
  'oferente.email': 'Correo de quien ofrece',
  'oferente.telefono': 'Teléfono de quien ofrece',
  'rol.oferente': 'Rol de quien ofrece (comprador o arrendatario)',
  'rol.contraparte': 'Rol de la contraparte (vendedor o arrendador)',
  'contraparte.texto': 'Datos de la contraparte',
  'contraparte.firma': 'Nombre de la contraparte',
  arrendador: 'Nombre del arrendador',
  'arrendador.texto': 'Datos del arrendador',
  'arrendador.cuentaTxt': 'Cuenta bancaria del arrendador',
  'arrendador.domicilio': 'Domicilio del arrendador',
  'arrendador.email': 'Correo del arrendador',
  'arrendador.firma': 'Firma del arrendador',
  'arrendatario.texto': 'Datos del arrendatario',
  'arrendatario.nombre': 'Nombre del arrendatario',
  'arrendatario.rut': 'RUT del arrendatario',
  'arrendatario.domicilio': 'Domicilio del arrendatario',
  'arrendatario.email': 'Correo del arrendatario',
  codeudor: 'Codeudor',
  'codeudor.texto': 'Datos del codeudor',
  'codeudor.nombres': 'Nombres de los codeudores',
  'codeudor.etiqueta': 'Cómo se nombra al codeudor',
  'codeudor.titulo': 'Calidad del codeudor',
  'codeudor.verbo': 'Comparece / comparecen (codeudor)',
  'codeudor.obliga': 'Se obliga / se obligan (codeudor)',
  'mandante.texto': 'Nombre y RUT del propietario',
  'mandante.telefono': 'Teléfono del propietario',
  'mandante.email': 'Correo del propietario',
  'entrega.nombre': 'Quien entrega la propiedad',
  'entrega.rut': 'RUT de quien entrega',
  interesado: 'Interesado',
  // condiciones del negocio
  'oferta.monto': 'Monto ofrecido',
  'oferta.montoLargo': 'Monto ofrecido (en palabras)',
  'oferta.plazo': 'Plazo ofrecido',
  'oferta.garantia': 'Garantía ofrecida',
  'oferta.vigencia': 'Vigencia de la oferta',
  'oferta.vence': 'Vencimiento de la oferta',
  'oferta.condiciones': 'Condiciones de la oferta',
  'venta.pie': 'Pie',
  'venta.piePct': 'Porcentaje del pie',
  'venta.saldo': 'Saldo de precio',
  'venta.saldoPct': 'Porcentaje del saldo',
  'venta.promesaDias': 'Días para la promesa',
  'venta.escrituraDias': 'Días para la escritura',
  'venta.seriedad': 'Garantía de seriedad (venta)',
  'venta.comisionPct': 'Comisión de venta (%)',
  'comision.pct': 'Comisión (%)',
  'comision.indemnizacion': 'Indemnización (%)',
  'contrato.renta': 'Renta mensual',
  'contrato.destino': 'Destino del arriendo',
  'contrato.diaPago': 'Días para pagar la renta',
  'contrato.garantia': 'Garantía del arriendo',
  'contrato.inicio': 'Inicio del arriendo',
  'contrato.termino': 'Término del arriendo',
  'contrato.plazo': 'Plazo del arriendo',
  'contrato.multaMora': 'Multa por atraso',
  'contrato.reajuste': 'Reajuste de la renta',
  'contrato.aviso': 'Aviso de término',
  'contrato.avisoDias': 'Días de aviso de término',
  'condiciones.garantiaMeses': 'Meses de garantía',
  'condiciones.mascotas': 'Mascotas',
  'condiciones.otras': 'Otras condiciones',
  garantiaSeriedad: 'Garantía de seriedad',
  'operacion.txt': 'Operación (compra o arriendo)',
  precio: 'Precio',
  // documento
  fechaEmision: 'Fecha del documento',
  fechaEntrega: 'Fecha de entrega',
  fechaVisita: 'Fecha de la visita',
  'visita.fecha': 'Fecha de la visita',
  'visita.hora': 'Hora de la visita',
  numero: 'Número del documento',
  codigo: 'Código del documento',
  ciudad: 'Ciudad',
  vigenciaDias: 'Días de vigencia',
};

const GRUPO_PREFIJO: Record<string, TGrupoDato> = {
  corredora: 'Corredora', corredor: 'Corredor', propiedad: 'Propiedad', direccion: 'Propiedad',
  visitante: 'Personas', oferente: 'Personas', rol: 'Personas', contraparte: 'Personas', arrendador: 'Personas', arrendatario: 'Personas',
  codeudor: 'Personas', mandante: 'Personas', entrega: 'Personas', interesado: 'Personas',
  oferta: 'Condiciones', venta: 'Condiciones', comision: 'Condiciones', contrato: 'Condiciones', condiciones: 'Condiciones',
  garantiaSeriedad: 'Condiciones', operacion: 'Condiciones', precio: 'Condiciones',
  fechaEmision: 'Documento', fechaEntrega: 'Documento', fechaVisita: 'Documento', visita: 'Documento', numero: 'Documento',
  codigo: 'Documento', ciudad: 'Documento', vigenciaDias: 'Documento',
};

export const ORDEN_GRUPOS: TGrupoDato[] = ['Corredora', 'Corredor', 'Propiedad', 'Personas', 'Condiciones', 'Documento', 'Otros'];

const PALABRAS: Record<string, string> = {
  sup: 'superficie', pct: '%', txt: 'texto', util: 'útil', direccion: 'dirección', telefono: 'teléfono', email: 'correo',
  dias: 'días', codigo: 'código', numero: 'número', descripcion: 'descripción', comision: 'comisión', operacion: 'operación',
  garantia: 'garantía', fecha: 'fecha',
};

/** «supUtil» → «superficie útil» */
function legible(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[\s_]+/)
    .map((w) => PALABRAS[w] ?? w)
    .join(' ');
}

const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** el nombre legible de un dato (nunca el código crudo) */
export function etiquetaDato(nombre: string): string {
  if (ETIQUETAS[nombre]) return ETIQUETAS[nombre];
  const partes = nombre.split('.');
  return partes.map((p, i) => (i === 0 ? mayuscula(legible(p)) : legible(p))).join(' · ');
}

/** si el dato tiene un nombre escrito a mano (los demás no se ofrecen en «Insertar dato») */
export const datoConocido = (nombre: string) => !!ETIQUETAS[nombre];

export function grupoDato(nombre: string): TGrupoDato {
  return GRUPO_PREFIJO[nombre] ?? GRUPO_PREFIJO[nombre.split('.')[0]] ?? 'Otros';
}

/** vista previa legible del interior de una parte condicional dentro de un párrafo */
export function vistaInterior(interior: string): string {
  return interior
    .replace(/\{\{[#^/][\w.]+\}\}/g, '')
    .replace(/\{\{([\w.]+)\}\}/g, (_, n: string) => `‹${etiquetaDato(n)}›`)
    .replace(/\*\*|__/g, '')
    .replace(/\s*\n\s*/g, ' ');
}
