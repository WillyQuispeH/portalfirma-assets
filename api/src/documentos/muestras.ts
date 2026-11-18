// Datos de EJEMPLO (inventados) para cada plantilla de documento de src/documentos/plantillas/*.html.
// Sirven para la vista previa: llenan todas las variables y todos los bloques condicionales, así se ve el documento completo.
// Nada de esto es real: personas, RUT, direcciones y montos son ficticios.
import type { DatosCorredora } from './corredora-doc';

export const PLANTILLAS_DOC: { nombre: string; titulo: string; descripcion: string }[] = [
  {
    nombre: 'orden-visita',
    titulo: 'Orden de visita',
    descripcion:
      'La firma el interesado antes de visitar una o más propiedades; fija la comisión y la multa por saltarse a la corredora.',
  },
  {
    nombre: 'carta-oferta',
    titulo: 'Carta oferta',
    descripcion: 'La oferta formal del comprador o arrendatario por una propiedad, que el dueño acepta al firmarla.',
  },
  {
    nombre: 'contrato-arriendo',
    titulo: 'Contrato de arriendo',
    descripcion:
      'El contrato de arrendamiento entre arrendador y arrendatario, con codeudor, garantía y cláusulas especiales.',
  },
  {
    nombre: 'mandato-arriendo',
    titulo: 'Mandato de gestión de arriendo',
    descripcion: 'El encargo del propietario a la corredora para publicar y arrendar su propiedad.',
  },
  {
    nombre: 'mandato-venta',
    titulo: 'Mandato de gestión de venta',
    descripcion:
      'El encargo del propietario a la corredora para publicar y vender su propiedad, con precio y comisión.',
  },
  {
    nombre: 'acta-entrega',
    titulo: 'Acta de entrega e inventario',
    descripcion:
      'La constancia de la entrega de la propiedad al arrendatario: llaves, medidores, inventario por espacio y fotos.',
  },
  {
    nombre: 'acta-visita',
    titulo: 'Acta de visita',
    descripcion:
      'La constancia de que la visita se realizó, con lo conversado y el interés del visitante; la firma el visitante.',
  },
];

/** una imagen PNG de 1×1 px (las fotos de ejemplo) */
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const corredora = (): DatosCorredora => ({
  nombre: 'Inmobiliaria Ejemplo SpA',
  nombreFantasia: 'Inmobiliaria Ejemplo',
  razonSocial: 'Inmobiliaria Ejemplo SpA',
  rut: '76.123.456-7',
  domicilio: 'Av. Ejemplo 1234, oficina 501, Las Condes',
  representanteNombre: 'don Juan Pérez',
  representanteRut: '1.111.111-1',
  representante: 'don Juan Pérez, cédula de identidad número 1.111.111-1',
  representanteVentaNombre: '',
  representanteVentaRut: '',
  representanteVenta: 'don Juan Pérez, cédula de identidad número 1.111.111-1',
  logo: '',
});

const corredor = () => ({ nombre: 'Ana Corredora', email: 'ana@ejemplo.cl', telefono: '+56 9 0000 1111' });

const MUESTRAS: Record<string, () => Record<string, unknown>> = {
  'orden-visita': () => ({
    numero: '12',
    fechaEmision: 'viernes, 13 de noviembre de 2026',
    corredora: corredora(),
    corredor: corredor(),
    visitante: {
      nombre: 'Matías Ejemplo',
      rut: '7.654.321-6',
      email: 'matias@ejemplo.cl',
      telefono: '+56 9 1111 2222',
      nacionalidad: 'chilena',
    },
    visita: { fecha: 'sábado, 14 de noviembre de 2026', hora: '11:00 hrs.' },
    operacion: { txt: 'Arriendo', venta: false, arriendo: true },
    garantiaSeriedad: '$100.000',
    vigenciaDias: '30',
    propiedades: [
      {
        codigo: 'PF-1001',
        tipo: 'Departamento',
        direccion: 'Av. Ejemplo 3000, depto. 504, Las Condes',
        operacion: 'Arriendo',
        precio: '$650.000',
        descripcion: 'Luminoso, con vista despejada y terraza.',
        foto: PIXEL,
        rasgos: [
          { nombre: 'Dormitorios', valor: '2' },
          { nombre: 'Baños', valor: '2' },
          { nombre: 'Superficie', valor: '72 m²' },
        ],
      },
      {
        codigo: 'PF-1002',
        tipo: 'Casa',
        direccion: 'Calle Ficticia 10, Providencia',
        operacion: 'Arriendo',
        precio: '$1.200.000',
        descripcion: 'Casa de dos pisos con patio.',
        foto: PIXEL,
        rasgos: [
          { nombre: 'Dormitorios', valor: '4' },
          { nombre: 'Baños', valor: '3' },
        ],
      },
    ],
  }),

  // la variante de VENTA (la más completa: pie, saldo, promesa, escritura, seriedad y comisión)
  'carta-oferta': () => ({
    numero: '3',
    fechaEmision: 'viernes, 13 de noviembre de 2026',
    ciudad: 'Las Condes',
    operacionVerbo: 'comprar',
    operacionTxt: 'Venta',
    contrato: 'compraventa',
    esVenta: true,
    esArriendo: false,
    rol: { oferente: 'Comprador', contraparte: 'Vendedor' },
    corredora: corredora(),
    corredor: corredor(),
    oferente: {
      nombre: 'Matías Ejemplo',
      rut: '7.654.321-6',
      email: 'matias@ejemplo.cl',
      telefono: '+56 9 1111 2222',
      calidad: 'comprador',
      perfil: 'chileno, soltero, ingeniero',
      domicilio: 'Calle Ficticia 567, Providencia',
    },
    contraparte: {
      nombre: 'Rosa Propietaria',
      firma: 'Rosa Propietaria',
      texto:
        'Rosa Propietaria, chilena, casada, cédula de identidad número 9.876.543-2, domiciliada en Av. Ejemplo 3000, Las Condes',
      lineas: [{ texto: 'RUT 9.876.543-2 · chilena, casada · Av. Ejemplo 3000, Las Condes · rosa@ejemplo.cl' }],
    },
    propietario: 'Rosa Propietaria',
    propiedad: {
      codigo: 'PF-2001',
      tipo: 'Departamento',
      direccion: 'Av. Ejemplo 3000, depto. 504, Las Condes',
      precioLista: 'UF 5.000',
      rol: '1234-56',
      dominio:
        'inscrito a fojas 1234 número 5678 del Registro de Propiedad del Conservador de Bienes Raíces de Santiago del año 2015',
    },
    oferta: {
      monto: 'UF 4.850',
      montoLargo: '4.850 Unidades de Fomento',
      garantia: 'UF 50',
      plazo: '60 días',
      vigencia: '7 días',
      vence: 'viernes, 20 de noviembre de 2026',
      condiciones: 'Se entrega con estacionamiento y bodega.\nSujeto a aprobación del crédito hipotecario.',
    },
    venta: {
      piePct: '20',
      pie: 'UF 970',
      saldoPct: '80',
      saldo: 'UF 3.880',
      promesaDias: '15',
      escrituraDias: '60',
      seriedad: 'UF 100',
      comisionPct: '2',
    },
  }),

  'contrato-arriendo': () => ({
    numero: '1',
    fechaEmision: '13 de noviembre de 2026',
    ciudad: 'Las Condes',
    corredora: corredora(),
    corredor: corredor(),
    arrendador: {
      texto:
        'Rosa Propietaria, cédula de identidad número 9.876.543-2, y Juan Ejemplo, cédula de identidad número 2.222.222-2',
      firma: 'Rosa Propietaria y Juan Ejemplo',
      rut: '9.876.543-2 y 2.222.222-2',
      email: 'rosa@ejemplo.cl',
      domicilio: 'Av. Ejemplo 3000, Las Condes',
      cuentaTxt: 'en la cuenta corriente número 00-000-00000-00 del Banco Ejemplo, a nombre de Rosa Propietaria',
    },
    arrendatario: {
      nombre: 'Matías Ejemplo',
      texto: 'Matías Ejemplo, chileno, soltero, cédula de identidad número 7.654.321-6',
      rut: '7.654.321-6',
      email: 'matias@ejemplo.cl',
      telefono: '+56 9 1111 2222',
      domicilio: 'Calle Ficticia 567, Providencia',
    },
    codeudor: {
      texto:
        'Pedro Aval, cédula de identidad número 9.999.999-3, y Ana Fiadora, cédula de identidad número 8.888.888-8',
      titulo: 'codeudores solidarios',
      etiqueta: 'los «Codeudores»',
      verbo: 'intervienen',
      obliga: 'se obligan solidariamente',
      nombres: 'Pedro Aval y Ana Fiadora',
    },
    propiedad: {
      codigo: 'PF-1001',
      tipo: 'Departamento',
      direccion: 'Av. Ejemplo 3000, depto. 504, Las Condes',
      descripcion: 'departamento 504, estacionamiento 12 y bodega 30',
      dominio:
        'inscrito a fojas 1234 número 5678 del Registro de Propiedad del Conservador de Bienes Raíces de Santiago del año 2015.',
    },
    contrato: {
      inicio: '1 de diciembre de 2026',
      termino: '30 de noviembre de 2027',
      plazo: '12 meses',
      renta: '$650.000',
      diaPago: '5',
      garantia: '2 meses de renta ($1.300.000)',
      multaMora: '0,5 Unidades de Fomento',
      reajuste: 'La renta se reajustará cada seis meses según la variación del IPC.',
      aviso: 'Cualquiera de las partes podrá ponerle término dando aviso con 60 días de anticipación.',
      avisoDias: '60',
      destino: 'vivienda',
      clausulas:
        'Se permite una mascota pequeña.\nEl arrendatario podrá pintar los muros, devolviéndolos en su color original.',
    },
  }),

  'mandato-arriendo': () => ({
    numero: '5',
    fechaEmision: '17 de noviembre de 2026',
    ciudad: 'Las Condes',
    corredora: corredora(),
    corredor: corredor(),
    mandante: {
      nombre: 'Rosa Propietaria',
      texto:
        'Rosa Propietaria, chilena, casada, cédula de identidad número 9.876.543-2, domiciliada en Av. Ejemplo 3000, Las Condes',
      rut: '9.876.543-2',
      email: 'rosa@ejemplo.cl',
      telefono: '+56 9 3333 4444',
    },
    propiedad: {
      codigo: 'PF-1001',
      tipo: 'Departamento',
      direccion: 'Av. Ejemplo 3000, depto. 504',
      comuna: 'Las Condes',
      supTotal: '80 m²',
      supUtil: '72 m²',
      rol: '1234-56',
      canon: '$650.000',
    },
    publicar: { si: true, no: false },
    exclusividad: { si: true, no: false },
    condiciones: {
      mascotas: 'Se aceptan mascotas pequeñas',
      garantiaMeses: '1',
      otras: 'Se arrienda con estacionamiento y bodega.',
    },
  }),

  'mandato-venta': () => ({
    numero: '7',
    fechaEmision: '17 de noviembre de 2026',
    ciudad: 'Vitacura',
    corredora: corredora(),
    corredor: corredor(),
    mandante: {
      nombre: 'Rosa Propietaria',
      texto:
        'Rosa Propietaria, chilena, casada, cédula de identidad número 9.876.543-2, domiciliada en Av. Ejemplo 3000, Las Condes',
      rut: '9.876.543-2',
      email: 'rosa@ejemplo.cl',
      telefono: '+56 9 3333 4444',
    },
    propiedad: {
      codigo: 'PF-2001',
      tipo: 'Departamento',
      direccion: 'Av. Ejemplo 3000, depto. 504',
      comuna: 'Las Condes',
      supTotal: '95 m²',
      supUtil: '80 m²',
      rol: '1234-56',
      precio: 'UF 9.500',
    },
    comision: { pct: '2', indemnizacion: '4' },
    publicar: { si: true, no: false },
    exclusividad: { si: true, no: false },
    condiciones: { otras: 'Se vende con estacionamiento y bodega.' },
  }),

  'acta-entrega': () => ({
    numero: '7',
    ciudad: 'Las Condes',
    fechaEmision: '17 de noviembre de 2026',
    fechaEntrega: '1 de diciembre de 2026',
    gastosComunesDesde: '5 de diciembre de 2026',
    corredora: corredora(),
    entrega: { nombre: 'Ana Corredora', rut: '17.777.777-7' },
    arrendador: 'Rosa Propietaria, RUT 9.876.543-2',
    arrendatario: { nombre: 'Matías Ejemplo', rut: '7.654.321-6' },
    propiedad: {
      codigo: 'PF-1001',
      tipo: 'Departamento',
      tipoMin: 'un departamento',
      direccion: 'Av. Ejemplo 3000, depto. 504, Las Condes',
      estacionamientos: 'E-12',
      bodega: 'B-30',
    },
    hayAccesos: true,
    hayListaAccesos: true,
    accesos: [
      { nombre: 'Llaves puerta principal', cantidad: '2' },
      { nombre: 'Control remoto portón', cantidad: '1' },
      { nombre: 'Tarjeta de acceso', cantidad: '2' },
    ],
    llaves: 'Además, 1 llave del buzón.',
    hayMedidores: true,
    medidores: [
      { nombre: 'Luz', numero: '123456', lectura: '4.500' },
      { nombre: 'Agua', numero: '778899', lectura: '210' },
      { nombre: 'Gas', numero: '445566', lectura: '88' },
    ],
    hayAspectos: true,
    aspectos: [{ texto: 'Grifería completa funcionando' }, { texto: 'Se entrega con aseo profundo realizado' }],
    inventario: [
      {
        espacio: 'Cocina',
        estadoEspacio: 'Regular',
        notaEspacio: 'Mancha en el mesón.',
        hayItems: true,
        items: [
          { nombre: 'Enchufes', cantidad: '4', estado: 'Bueno', nota: 'Todos funcionando' },
          { nombre: 'Horno', cantidad: '1', estado: 'Malo', nota: 'Le falta una perilla' },
        ],
      },
      {
        espacio: 'Living-comedor',
        estadoEspacio: 'Bueno',
        notaEspacio: 'Pintura reciente.',
        hayItems: true,
        items: [
          { nombre: 'Pisos', cantidad: '1', estado: 'Bueno', nota: 'Sin rayas' },
          { nombre: 'Cortinas', cantidad: '3', estado: 'Bueno', nota: 'Roller blackout' },
        ],
      },
    ],
    observaciones: 'El arrendatario recibe conforme. Se acuerda revisar la perilla del horno en la primera semana.',
    hayFotos: true,
    conFotos: [
      { espacio: 'Cocina', fotos: [{ src: PIXEL }, { src: PIXEL }] },
      { espacio: 'Living-comedor', fotos: [{ src: PIXEL }] },
    ],
  }),

  'acta-visita': () => ({
    fechaVisita: 'sábado, 14 de noviembre de 2026',
    fechaEmision: 'lunes, 16 de noviembre de 2026',
    orden: { texto: 'Orden de visita nº 12' },
    corredora: corredora(),
    corredor: { nombre: 'Ana Corredora', email: 'ana@ejemplo.cl' },
    visitante: {
      nombre: 'Matías Ejemplo',
      rut: '7.654.321-6',
      email: 'matias@ejemplo.cl',
      telefono: '+56 9 1111 2222',
    },
    propiedad: { codigo: 'PF-1001', tipo: 'Departamento', direccion: 'Av. Ejemplo 3000, depto. 504, Las Condes' },
    interes: 'Alto',
    observaciones:
      'El visitante recorrió la propiedad completa y le gustó la luz y la ubicación. Pidió los gastos comunes de los últimos meses.',
    notas: 'Volver a llamarlo el lunes.',
    hayInteresado: true,
    interesado: [{ texto: 'Le gusta la terraza y la vista' }, { texto: 'Busca mudarse en diciembre' }],
    hayCorredor: true,
    comentarioCorredor: [
      { texto: 'Se explicó el proceso de evaluación' },
      { texto: 'Se indicó que acepta mascotas pequeñas' },
    ],
    hayObjeciones: true,
    objeciones: [{ texto: 'El estacionamiento es estrecho' }, { texto: 'La renta está un poco sobre su presupuesto' }],
    hayAcuerdos: true,
    acuerdos: [{ texto: 'Enviar los gastos comunes por correo' }, { texto: 'Consultar a la dueña por una rebaja' }],
    hayProximos: true,
    proximosPasos: [{ texto: 'Enviar carta oferta si confirma' }, { texto: 'Agendar segunda visita con su pareja' }],
  }),
};

/** datos de ejemplo completos para llenar la plantilla «nombre» (vacío si no existe) */
export function muestra(nombre: string): Record<string, unknown> {
  return MUESTRAS[nombre]?.() ?? {};
}
