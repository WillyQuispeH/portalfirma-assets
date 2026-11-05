// Lo que ofrece el inicio de Gestión documental, ordenado por niveles (los mismos de src/renderer/home.js).
// Cada acción la ejecuta homeAction() de home.js (abre el editor, la Notaría virtual, los plazos…).

// [clave, ícono, título, descripción, clase de color]
export const ACCIONES: [string, string, string, string, string][] = [
  ['open', 'folderOpen', 'Abrir PDF', 'Abre un PDF para verlo y editarlo', 'c-blue'],
  ['new', 'filePlus', 'Crear PDF', 'Documento en blanco carta, oficio o A4', 'c-indigo'],
  ['combine', 'files', 'Combinar archivos', 'Une PDF, Word, Excel e imágenes en uno', 'c-violet'],
  ['convert', 'convert', 'Convertir a PDF', 'Word, Excel o imágenes a PDF listo para firmar', 'c-teal'],
  ['edittext', 'textEdit', 'Editar texto e imágenes', 'Corrige el texto respetando la fuente original', 'c-blue'],
  ['ocr', 'scanText', 'Reconocer texto (OCR)', 'Fotocopias y escaneos: texto buscable y editable', 'c-red'],
  ['organize', 'grid', 'Organizar páginas', 'Reordena, rota, inserta, elimina o extrae', 'c-green'],
  ['split', 'scissors', 'Dividir PDF', 'Separa en varios archivos por páginas o rangos', 'c-pink'],
  ['compress', 'compress', 'Comprimir PDF', 'Reduce el peso para enviarlo (máx. 20 MB)', 'c-amber'],
  ['export', 'export', 'Exportar PDF', 'A Word, imágenes PNG/JPG o texto', 'c-cyan'],
  ['print', 'print', 'Imprimir', 'Imprime el documento abierto', 'c-slate'],
  ['ai', 'sparkle', 'Asistente legal (IA)', 'Revisa y corrige tus documentos o redacta un borrador nuevo', 'c-ai'],
  ['tpls', 'template', 'Plantillas con campos', 'Tus contratos como plantillas: llenas los datos y envías a firmar', 'c-violet'],
  ['plan', 'plan', 'Firmar plano arquitectónico', 'Láminas + hoja de firmas tamaño carta', 'c-indigo'],
  ['send', 'sign', 'Enviar a firmar', 'Firma simple, avanzada, visada o legalización', 'pf'],
  ['tpl', 'notary', 'Notaría virtual', 'Poderes, declaraciones y contratos de Portalfirma', 'pf'],
  ['ops', 'listCheck', 'Mis operaciones', 'Estado de firmas y documentos firmados', 'pf'],
  ['plazos', 'calendar', 'Plazos y vencimientos', 'Tus contratos ordenados por vencimiento, con sugerencias de la IA', 'c-amber'],
  ['escr', 'users', 'Gestión de firmas presenciales', 'Escrituras públicas, protocolizaciones y reducciones: revisamos el documento, calculamos el valor y coordinamos la firma en la notaría', 'c-slate'],
  ['exp', 'folderOpen', 'Expedientes', 'Una carpeta por caso con sus documentos, fotos de cédulas e historial', 'c-amber'],
  ['flows', 'flow', 'Flujos documentales', 'Recetas: una plantilla + una nómina → muchos documentos enviados a firmar', 'c-teal'],
  ['bulk', 'files', 'Carga masiva', 'Sube muchos documentos y envíalos a firmar de una vez; firma masiva con certificado', 'c-indigo'],
];
export const ACCION = Object.fromEntries(ACCIONES.map((a) => [a[0], a]));

export const NIVELES = [
  { clave: 'esencial', titulo: 'Lo esencial', sub: 'Para empezar: abrir, preparar y enviar a firmar', grandes: ['send', 'ops'], chicas: ['open', 'new', 'combine', 'convert'], filas: [] as string[] },
  { clave: 'ahorro', titulo: 'Para ahorrar tiempo', sub: 'Cuando ya envías documentos seguido', grandes: [], chicas: [], filas: ['tpls', 'ai', 'plazos', 'exp'] },
  { clave: 'avanzado', titulo: 'Avanzado', sub: 'Volúmenes grandes y casos especiales', grandes: [], chicas: [], filas: ['flows', 'bulk', 'plan'] },
];
export const HERRAMIENTAS_PDF = ['edittext', 'ocr', 'organize', 'split', 'compress', 'export', 'print'];
// solo para clientes de Portalfirma (IA y firma)
export const DE_MIEMBROS = new Set(['send', 'tpl', 'ops', 'ai', 'plan', 'bulk', 'flows', 'plazos']);
// llevan «Nuevo» hasta que se abren por primera vez
export const NUEVAS = new Set(['escr', 'exp', 'flows', 'plazos']);

export const visto = (k: string) => { try { return localStorage.getItem('pf.seen.' + k) === '1'; } catch { return true; } };
export const marcarVisto = (k: string) => { try { localStorage.setItem('pf.seen.' + k, '1'); } catch { /* sin almacenamiento: no pasa nada */ } };
