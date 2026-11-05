// Guías paso a paso de la Ayuda (por nivel y por pantalla) y recorridos guiados por pantalla.
// Se suman las de «Aprende» (una guía por lección, al principio, y su recorrido de cada panel).
// Los selectores de los recorridos apuntan a id y clases de otras pantallas: no se deben cambiar allá.
import { LECCIONES, PANTALLAS_APRENDE, RECORRIDOS_APRENDE } from '../aprende/lecciones';
import type { IGuia, TNivelAyuda, TPasoRecorrido } from '../../../store/interfaces/ayuda.interface';

export const NIVELES_AYUDA: Record<TNivelAyuda, string> = { inmo: 'Gestión inmobiliaria', esencial: 'Lo esencial', ahorro: 'Para ahorrar tiempo', avanzado: 'Avanzado' };

// screens: vistas donde la guía aparece en «En esta pantalla»
const GUIAS_BASE: IGuia[] = [
  { id: 'abrir', level: 'esencial', screens: ['home', 'editor'], title: 'Abrir o crear un documento', kw: 'abrir crear nuevo archivo pdf word excel imagen arrastrar drive',
    steps: ['Arrastra el archivo a la ventana de la app, o usa «Abrir PDF» en el inicio.', 'Word, Excel e imágenes se convierten a PDF automáticamente.', 'Para un documento en blanco usa «Crear PDF» y elige carta, oficio o A4.', 'También puedes traer archivos desde Google Drive.'] },
  { id: 'enviar', level: 'esencial', screens: ['home', 'editor', 'send'], title: 'Enviar un documento a firmar', kw: 'enviar firmar firma firmantes correo telefono rut legalizar notario avanzada simple',
    steps: ['Abre el documento y presiona «Enviar a firmar» (arriba a la derecha).', 'La app detecta los firmantes; revisa nombre, RUT, correo y teléfono de cada uno.', 'Elige el tipo de firma: simple, avanzada, visada o con legalización ante notario.', 'Confirma el envío: cada firmante recibe su enlace por correo y WhatsApp.', 'El avance lo ves en «Mis operaciones».'] },
  { id: 'ops', level: 'esencial', screens: ['home', 'ops'], title: 'Ver el estado de mis firmas y descargar el firmado', kw: 'operaciones estado firmas firmado descargar documento firmado pendiente reenviar enlace',
    steps: ['Abre «Mis operaciones» e inicia sesión con el correo y la contraseña de tu cuenta.', 'Usa los filtros (En firma, Firmadas, Legalizadas, Requieren acción) o busca por nombre o número.', 'Al elegir una operación ves el documento, las etapas y quién firmó.', '«Descargar documento» guarda el PDF; «Abrir en el editor» lo abre en el editor.', 'A un firmante pendiente le puedes reenviar el enlace.'] },
  { id: 'editar', level: 'esencial', screens: ['editor'], title: 'Corregir el texto de un PDF', kw: 'editar corregir texto cambiar palabra fuente parrafo error',
    steps: ['En el editor elige «Editar texto».', 'Haz clic en el párrafo que quieres cambiar: se abre con la misma fuente y tamaño.', 'Escribe la corrección; puedes cambiar formato en el panel derecho.', 'Presiona Esc para terminar y guarda con ⌘S / Ctrl+S.'] },
  { id: 'texto', level: 'esencial', screens: ['editor'], title: 'Agregar texto, títulos y párrafos', kw: 'agregar texto titulo parrafo escribir recuadro modelo nota clausula fuente tamaño',
    steps: ['Elige «Agregar texto» y dibuja en la página el recuadro donde irá el texto.', 'Al soltar ya estás escribiendo dentro; la herramienta vuelve a «Seleccionar».', 'Para un formato listo, en el panel derecho usa «Agregar texto con formato»: Título y párrafo, Título, Subtítulo, Párrafo, Cláusula o Nota.', 'El texto de ejemplo («Agrega un título aquí») se reemplaza al empezar a escribir.'] },
  { id: 'mover', level: 'esencial', screens: ['editor'], title: 'Mover textos, campos e imágenes', kw: 'mover mano arrastrar seleccionar area imagen logo varios objetos desplazar',
    steps: ['«Mover» (la mano, o mantén la barra espaciadora) arrastra textos, imágenes y campos sin entrar a editarlos.', 'Con la mano, arrastrar la página desplaza la vista (útil con zoom).', 'Con «Seleccionar», arrastra en un espacio vacío para dibujar un área: entran los objetos que queden completos dentro.', 'Las imágenes del PDF (por ejemplo un logo) también se pueden tomar así: enciérralas completas y quedan movibles.', 'Con varios seleccionados, arrástralos juntos o presiona Supr para quitarlos.'] },
  { id: 'combinar', level: 'esencial', screens: ['home', 'editor'], title: 'Combinar, convertir y ordenar páginas', kw: 'combinar unir juntar convertir paginas ordenar rotar eliminar dividir extraer',
    steps: ['«Combinar archivos» une PDF, Word, Excel e imágenes en un solo PDF.', 'En el editor, la columna izquierda muestra las páginas: arrástralas para reordenar.', 'Los botones de arriba de las miniaturas rotan, insertan, extraen, dividen o eliminan páginas.'] },
  { id: 'ocr', level: 'esencial', screens: ['home', 'editor'], title: 'Hacer buscable una fotocopia (Reconocer texto)', kw: 'ocr escaneo fotocopia escaneado reconocer texto buscar copiar',
    steps: ['Abre el PDF escaneado y presiona «Reconocer texto».', 'Elige si reconocer solo las páginas sin texto, la actual o todas.', 'Después podrás buscar, copiar y editar el texto. Funciona sin internet.'] },
  { id: 'plantilla', level: 'ahorro', screens: ['home', 'editor'], title: 'Convertir un contrato en plantilla con campos', kw: 'plantilla campos variables contrato modelo reutilizar nombre rut fecha',
    steps: ['Abre el contrato y elige la pestaña «Plantilla» del panel derecho.', 'Selecciona las palabras que cambian en cada uso (nombre, RUT, fecha…) y presiona «Convertir en campo».', 'O usa «Detectar con IA» para que proponga los campos.', 'Guarda la plantilla: queda en el inicio, en «Plantillas con campos».'] },
  { id: 'llenar', level: 'ahorro', screens: ['home'], title: 'Llenar una plantilla y enviarla', kw: 'llenar plantilla formulario completar datos generar documento',
    steps: ['En el inicio, en «Plantillas con campos», abre la plantilla.', 'Completa el formulario del panel derecho.', 'Presiona «Generar documento» y luego «Enviar a firmar».'] },
  { id: 'ia', level: 'ahorro', screens: ['home', 'editor'], title: 'Revisar o redactar con el asistente legal', kw: 'asistente ia inteligencia artificial revisar redactar borrador tokens corregir',
    steps: ['Con un documento abierto, elige la pestaña «Asistente» del panel derecho.', '«Revisar» busca errores y cláusulas que conviene corregir; aplicas cada sugerencia con un clic.', '«Redactar» primero busca un modelo de Portalfirma (sin costo) y, si no hay, lo redacta con IA.', 'Cada uso con IA indica cuántos tokens consume antes de hacerlo.'] },
  { id: 'notaria', level: 'ahorro', screens: ['home', 'tpl'], title: 'Notaría virtual: poderes, declaraciones y contratos', kw: 'notaria virtual poder declaracion jurada mandato tramite municipal',
    steps: ['Abre «Notaría virtual» y busca el trámite (por ejemplo, «poder simple» o «declaración jurada»).', 'Completa los datos del formulario.', 'Revisa la vista previa y envíalo a firmar.'] },
  { id: 'plazos', level: 'ahorro', screens: ['home', 'plazos'], title: 'Controlar plazos y vencimientos', kw: 'plazos vencimientos vencer renovacion aviso termino contrato arriendo calendario',
    steps: ['Abre «Plazos y vencimientos» y agrega tus contratos (desde el computador, Drive o «Traer de Portalfirma»).', 'El informe básico (gratis) detecta fechas, plazos, renovación y avisos.', 'Los colores muestran la urgencia: rojo, amarillo o verde.', 'El informe inteligente (1 token) sugiere qué hacer y puede redactar el documento.', 'Con «Calendario» agregas un recordatorio a tu agenda.'] },
  { id: 'exp', level: 'ahorro', screens: ['home', 'expedientes'], title: 'Ordenar un caso en un expediente', kw: 'expediente carpeta caso propiedad cliente cedula fotos historial',
    steps: ['Abre «Expedientes» y crea uno (propiedad, persona, empresa o trámite).', 'Elige dónde se guarda: en este computador o en Google Drive.', 'Agrega contratos, cédulas, fotos y planillas arrastrándolos.', 'Desde ahí puedes abrirlos, combinarlos, enviarlos a firmar o llevarlos a Plazos.', 'El historial registra todo lo que se hizo, con número de operación.'] },
  { id: 'escrituras', level: 'avanzado', screens: ['home', 'escrituras'], title: 'Iniciar un trámite notarial (escritura pública)', kw: 'escritura minuta notaria notario formatear revisar comparecientes materia precio pagar saldo firma presencial reduccion',
    steps: ['Abre «Gestión de firmas presenciales» y elige Escritura pública (o Reducción a escritura pública).', 'Sube la minuta: revisamos comparecientes, RUT, firmas y redacción, e identificamos la materia y su valor según la planilla de la notaría.', 'Corrige con «Corregir» o «Corregir todo» y completa el correo y teléfono de quienes firman.', 'Revisa la vista previa con formato notarial (oficio, 30 líneas, cifras en palabras).', 'Paga con el saldo de tu cuenta (o recarga); la notaría recibe los archivos y te contacta para la firma presencial.'] },
  { id: 'protocolizar', level: 'avanzado', screens: ['escrituras'], title: 'Protocolizar un documento', kw: 'protocolizar protocolizacion caratula documento privado fotocopia escaneo foto fecha cierta registro publico requirente hojas',
    steps: ['En «Gestión de firmas presenciales» pulsa «Nuevo trámite» y elige Protocolización.', 'Sube el documento, de preferencia en Word (lectura exacta). Si solo tienes PDF, foto o escaneo, se lee con IA, incluido en el valor.', 'La app detecta qué es, cuántas hojas tiene, quiénes participan y si tiene firmas, y arma la carátula. Esos datos no se editan.', 'Elige la notaría y paga la tarifa fija. El requirente, el repertorio y el número los completa el ejecutivo de la notaría.'] },
  { id: 'reducir', level: 'avanzado', screens: ['escrituras'], title: 'Reducir un documento privado a escritura pública', kw: 'reduccion reducir escritura publica documento privado firmado original',
    steps: ['Elige Reducción a escritura pública y sube el documento privado ya firmado.', 'La app lo reescribe como escritura pública: comparecen las mismas partes y el texto se transcribe a continuación.', 'Revisa «Cómo llegó» y «Cómo va a la notaría»; con «Modificar el escrito» puedes corregirlo.', 'Declara que el documento está firmado, elige la notaría y paga. El día de la firma lleva el original.'] },
  { id: 'elegirNotaria', level: 'avanzado', screens: ['escrituras'], title: 'Elegir la notaría', kw: 'notaria elegir red notarias comuna horario asignacion automatica',
    steps: ['Antes de pagar, todo trámite pide elegir la notaría (columna derecha, «Elegir notaría»).', 'Filtra por comuna; cada notaría muestra notario, dirección, horario, en cuánto tiempo toma el caso y qué trámites realiza.', 'Los datos de la notaría elegida quedan en la escritura o la carátula. Repertorio y fecha los pone la notaría.', 'Si te da lo mismo, usa «Asignación automática»: la primera notaría disponible toma el caso.'] },
  { id: 'ocultas', level: 'avanzado', screens: ['escrituras'], title: 'Materias ocultas en un escrito', kw: 'materia oculta acto adicional compraventa hipoteca prenda poder cesion donacion revision cobro',
    steps: ['Además de la materia del título, la app lee el texto completo buscando más de 25 tipos de actos (compraventas, hipotecas, prendas, poderes, cesiones, donaciones, alzamientos…).', 'Cada hallazgo muestra la cláusula y la cita exacta que lo prueba.', 'Si el contenido no coincide con la materia declarada (por ejemplo, un «mandato» que vende), se avisa y puedes cambiar la materia principal con un clic.', 'Los actos adicionales se cobran según la planilla; si desmarcas uno, la notaría recibe el aviso y puede pedir un ajuste.', 'Si falta un acto, pulsa «Agregar un acto que no detectamos», elígelo y copia la frase del escrito donde aparece. Se suma al cobro y nos ayuda a detectarlo solos la próxima vez.'] },
  { id: 'agente', level: 'esencial', screens: ['home', 'editor', 'ops'], title: 'Agente Portalfirma', kw: 'agente ia chat herramientas mcp enviar firmar operacion saldo recarga plantilla propiedad certificado cds reenviar',
    steps: ['Pulsa «Agente» arriba a la derecha (o escribe en el buscador del inicio) y pide lo que necesitas en tus palabras.', 'Para trabajar con un documento, usa el clip: adjunta el documento abierto o un PDF/Word. El agente lo sube a Portalfirma.', 'Las consultas se hacen solas. Lo que cobra, envía o notifica muestra una tarjeta con el detalle: revisa y pulsa Confirmar o Cancelar.', 'Para firmar con certificado, escribe la clave y el código en los campos protegidos de la tarjeta, nunca en el chat.', 'El botón de lista muestra la actividad del agente. Cuesta 1 token del asistente cada 3 mensajes.'] },
  { id: 'reglas', level: 'avanzado', screens: ['escrituras'], title: 'Reglas de detección (interno Portalfirma)', kw: 'reglas aprendizaje ia propuesta aprobar casos corregidos deteccion materia acto excepcion exportar',
    steps: ['Cada vez que un cliente cambia la materia, descarta un acto oculto o agrega uno que faltaba, queda un caso sin RUT, correos ni teléfonos.', 'En «Reglas de detección» (solo administradores) pulsa «Proponer reglas con IA»: el modelo más económico revisa los casos y propone reglas.', 'Cada propuesta se prueba contra todos los casos: cuántos detecta y si coincide en otros (posible falso positivo). Puedes editar el patrón y volver a probar.', 'Aprueba o descarta. Las aprobadas funcionan al instante y sin IA; puedes desactivarlas o exportarlas para publicarlas desde el servidor.'] },
  { id: 'materias', level: 'avanzado', screens: ['escrituras'], title: '¿Cómo se calcula el valor de un trámite notarial?', kw: 'precio valor cobro materia tarifa planilla cotizacion acto adicional hipoteca ajuste',
    steps: ['El valor sale de la planilla de materias de la notaría. Toda protocolización tiene tarifa fija ($40.000). Los valores pueden cambiar; la pantalla de pago muestra su fecha de vigencia.', 'Si el texto contiene otro acto (por ejemplo, una hipoteca dentro de una compraventa), se cobra aparte; puedes desmarcarlo si no corresponde.', 'La reducción a escritura pública tiene tarifa fija.', 'Si la materia no tiene precio en la planilla, se solicita una cotización y no se cobra hasta que la apruebes.'] },
  { id: 'flujos', level: 'avanzado', screens: ['home', 'flujos'], title: 'Flujos documentales: muchos documentos desde una nómina', kw: 'flujo nomina excel masivo muchos documentos pagare receta plantilla',
    steps: ['Abre «Flujos documentales» y crea una receta.', 'Elige la plantilla y sube la nómina (Excel o CSV, una fila por documento).', 'Relaciona cada campo con una columna de la nómina.', 'Revisa los datos marcados (RUT, correos, duplicados) y genera los documentos.', 'Se envían a firmar en la carga masiva.'] },
  { id: 'masiva', level: 'avanzado', screens: ['home', 'bulk', 'ops'], title: 'Carga masiva y firma con certificado', kw: 'carga masiva muchos documentos firma masiva certificado cds clave',
    steps: ['«Carga masiva» sube muchos documentos y los analiza en paralelo.', 'Completa los firmantes que falten (puedes usar los mismos en todos).', 'Envía todos con una sola confirmación.', 'Para firmar con tu certificado varios documentos a la vez, usa «Firma masiva»: la clave del certificado nunca se guarda.'] },
  { id: 'plano', level: 'avanzado', screens: ['home'], title: 'Firmar un plano arquitectónico', kw: 'plano arquitectura lamina a0 a1 hoja de firmas',
    steps: ['Elige «Firmar plano arquitectónico».', 'La app arma las láminas y agrega una hoja de firmas tamaño carta.', 'Revisa y envía a firmar como cualquier documento.'] },
  { id: 'cuenta', level: 'esencial', screens: ['home', 'ops', 'login'], title: 'Conectar mi cuenta de Portalfirma', kw: 'cuenta iniciar sesion login contraseña correo conectar cerrar sesion saldo',
    steps: ['Las funciones de firma necesitan tu cuenta de empresa de Portalfirma.', 'En «Mis operaciones» inicia sesión con tu correo y contraseña: La app guarda solo la sesión, cifrada.', 'Si olvidaste la contraseña, recupérala en empresa.portalfirma.cl.'] },
];

// ---- Recorridos guiados ----
const RECORRIDOS_BASE: Record<string, TPasoRecorrido[]> = {
  home: [
    ['#hubDrop', 'Empieza aquí', 'Arrastra a la ventana cualquier PDF, Word, Excel o imagen, o haz clic para elegirlo.'],
    ['.hub-card[data-act="send"]', 'Enviar a firmar', 'Prepara el documento y lo envía a los firmantes con Portalfirma.'],
    ['.hub-card[data-act="ops"]', 'Mis operaciones', 'El estado de cada firma y los documentos firmados, listos para descargar.'],
    ['.tool-chips', 'Herramientas de PDF', 'Editar, reconocer texto, dividir, comprimir y más, siempre a mano.'],
    ['.hub-col:last-child .lvl-h', 'Para ahorrar tiempo y avanzado', 'Cuando ya envías documentos seguido: plantillas, asistente con IA, plazos, expedientes y flujos masivos.'],
    ['#helpFab', '¿Dudas? Aquí', 'Este botón abre las guías paso a paso, el buscador de dudas y el contacto con soporte, en cualquier pantalla.'],
  ],
  editor: [
    ['.tool[data-tool="select"]', 'Seleccionar', 'Clic en un objeto para moverlo; arrastra en un espacio vacío para elegir un área completa.'],
    ['.tool[data-tool="hand"]', 'Mover', 'La mano solo mueve: textos, imágenes y campos, o la página cuando hay zoom. Atajo: barra espaciadora.'],
    ['.tool[data-tool="text"]', 'Agregar texto', 'Dibuja el recuadro y escribe dentro. En el panel derecho hay modelos con título y párrafo.'],
    ['#edOcr', 'Reconocer texto', 'Convierte fotocopias y escaneos en texto buscable y editable.'],
    ['#edPanelTabs', 'Panel derecho', 'Cambia entre Edición, Asistente y Plantilla cuando quieras. Arrastra su borde izquierdo para ensancharlo.'],
    ['#edSend', 'Enviar a firmar', 'Cuando el documento esté listo, envíalo desde aquí.'],
  ],
  ops: [
    ['#opsFilters', 'Filtros', 'Separa lo que está en firma, lo firmado, lo legalizado y lo que requiere tu acción.'],
    ['#opsList', 'Tus operaciones', 'Elige una para ver el documento, sus etapas y quién falta por firmar.'],
    ['#opsSync', 'Sincronizar', 'Trae los cambios recientes de Portalfirma (también se hace solo cada 5 minutos).'],
  ],
  plazos: [
    ['#plAdd', 'Agrega contratos', 'Desde el computador, Google Drive o directamente desde Portalfirma.'],
    ['#plTable', 'Ordenados por urgencia', 'Rojo: actúa ya · Amarillo: pronto · Verde: sin apuro. Haz clic en uno para ver el detalle.'],
  ],
  expedientes: [
    ['#xpNew', 'Nuevo expediente', 'Una carpeta por caso: una propiedad, un cliente o un trámite.'],
    ['#xpList', 'Tus expedientes', 'Cada uno guarda sus documentos y el historial de lo que se hizo.'],
  ],
  escrituras: [
    ['.es-list', 'Tus trámites', 'El que estás preparando y los enviados, con su estado.'],
    ['.es-cards', 'Elige el trámite', 'Escritura pública, protocolización o reducción a escritura pública.'],
    ['#esNuevo', 'Nuevo trámite', 'Empieza otro trámite cuando quieras.'],
  ],
  flujos: [
    ['#flNew', 'Nueva receta', 'Una plantilla + una nómina = muchos documentos listos para firmar.'],
  ],
};

// Una guía por lección de Aprende. Van primero y en orden inverso, como cuando aprende.js las agregaba con unshift:
// el orden decide cuál gana en el buscador cuando dos guías empatan.
const GUIAS_APRENDE: IGuia[] = LECCIONES.map((l): IGuia => ({
  id: 'ap-' + l.id, level: 'inmo', screens: PANTALLAS_APRENDE[l.id] || [], title: `${l.t}: ${l.sub.toLowerCase()}`, kw: [l.t, l.sub, l.para].join(' '), steps: l.pasos,
})).reverse();

// Son la API pública window.Ayuda.GUIDES y window.Ayuda.TOURS: otro módulo las puede ampliar y el panel las lee al dibujarse.
export const GUIAS: IGuia[] = [...GUIAS_APRENDE, ...GUIAS_BASE];
export const RECORRIDOS: Record<string, TPasoRecorrido[]> = { ...RECORRIDOS_BASE, ...RECORRIDOS_APRENDE };
