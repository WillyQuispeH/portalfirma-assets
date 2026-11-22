# Herramientas del equipo en el servidor (administrar todo desde WhatsApp)

## Para qué
El corredor administra TODO desde WhatsApp en terreno, con la app de escritorio cerrada. El equipo (Pedro · Captación, Juanita · Documentos,
Diego · Seguimiento, Fernanda · Leads) vive en el servidor (`../equipo.ts`): lee el mensaje (texto, nota de voz, PDF, foto), conversa con la IA
(`IaService.conversar`) y ejecuta herramientas. **La lógica de negocio vive solo en el servidor**; la app de escritorio es la parte visual y
usa esa misma lógica (por la API REST) cuando el usuario tiene el computador a mano. Por eso cada regla se escribe UNA vez, en un servicio
Nest reutilizable con su endpoint REST, y la herramienta de WhatsApp es una capa delgada encima.

## Cómo se suma una herramienta
1. Tu clase (`negocios.ts`, `propiedades.ts` o `documentos.ts` de esta carpeta) implementa `ProveedorHerramientas` y llena `herramientas: Herramienta[]`
   (`name`, `description`, `input_schema`, `ejecutar(ctx, args)`). `registro.ts` ya las junta y `equipo.ts` ya las ofrece a la IA.
2. Inyecta lo que necesites por constructor (PrismaService, servicios de documentos, etc.). `AyudasHerramientas` (ayudas.ts) resuelve propiedad,
   negocio (por su código `NG-XXX`, su id o un texto) y persona respetando lo que ve cada usuario, y da formato (`pesos`, `fechaIso`, `ddmmaaaa`).
3. Si hace falta, agrega tus providers a `app.module.ts` (no toques otras secciones).

## Convenciones (obligatorias)
- Nombre en español con guion bajo (`mover_negocio`, `registrar_pago`), sin prefijo `asset_`. Descripción clara para la IA: cuándo usarla, qué
  preguntar antes (SOLO lo que falte: si el dato ya está en el contexto o en el documento leído, no se pregunta) y qué NO hacer.
- Lo que **cobra, publica fuera, envía a firmar, cierra o borra** se hace en DOS pasos con el parámetro `confirmado` (boolean): sin él, la herramienta
  solo ARMA y devuelve un resumen para que la IA se lo muestre al corredor y pida el SÍ; con `confirmado: true` (solo después de que el corredor
  dijo que sí) ejecuta. Modelo: `OrdenVisitaService.ejecutar` (../orden-visita.ts). Lo reversible y local (marcar una tarea, anotar) se ejecuta directo.
- Devuelve `{ ok: true, mensaje, ... }` o `{ error: 'texto claro para el corredor' }`. No lances excepciones por errores del usuario (dato faltante,
  no existe, sin permiso): devuelve `{ error }`. Si el negocio, la propiedad o la persona no es única, el error lista las opciones y la IA pregunta.
- Permisos: el corredor ve lo suyo (`ayudas.mio(c)`); el administrador, todo. Los datos del propietario de una propiedad solo si la captó o es admin.
- Todo cambio queda en el historial (`ActividadService.registrar`) con el usuario, igual que en la app. Los cambios de un negocio suben su `version`
  (la app de escritorio los trae en su próxima sincronización).
- REGLA DE NEGOCIOS: todo negocio tiene propiedad e interesado; el código `NG-XXX` lo asigna el servidor (`datos.codigo`) y se pregunta SIEMPRE a qué
  negocio se refiere el corredor si hay más de uno posible (o si no lo nombró).
- Respuestas pensadas para WhatsApp: cortas. La IA arma el texto; tú devuelves datos, no prosa larga.
- Estilo del código: TypeScript estricto, comentarios en español, sin duplicar lo que ya existe en `src/` (servicios de documentos, firmas, etc.).

## Reglas que hoy están en la app de escritorio y hay que llevar al servidor (UNA vez, reutilizable por REST)
Léelas en `desktop/src/` (son la especificación; **no las edites**, el reemplazo del escritorio lo hace el integrador después): `negocios.js`
(etapas, tareas, mover, cerrar, estado de la propiedad), `etapas.js` (pasos y su estado), `asset-tools.js` (las herramientas del Agente: qué parámetros
y reglas tiene cada una), `inmo.js` y `ficha-campos.js` (propiedades y la ficha por bloques), `leads.js`, `agenda.js`, `docgen.js`, `formatos.js`,
`firmas.js`, `ml.js`.

## Pruebas
- Un archivo `api/test/<módulo>-herramientas-e2e.js` por módulo, contra la API corriendo (yarn dev) y asset_dev, con IA falsa y WhatsApp falso como
  `api/test/asistentes-wa-e2e.js` (`herramienta(name, input)` arma una respuesta `tool_use`). Crea su propia corredora de prueba y al final la borra.
- Antes de correr: `npx tsc --noEmit` limpio. La API se recarga sola al guardar (espera a que `/v1/health` responda 404, que es lo normal).
- No hay que probar con WhatsApp real: se prueba con los falsos.

## Reparto
- `negocios.ts` + `src/negocios/negocio-acciones.ts` (reglas y endpoints REST de negocios): negocios, etapas, tareas, pagos, comprobantes, aceptación,
  evaluación del arrendatario, postarriendo, cierre.
- `propiedades.ts`: propiedades (crear, ficha por bloques, estado, fotos), personas, leads (y el chat exportado), agenda, portales.
- `documentos.ts`: documentos (mandatos, carta oferta, contrato, promesa, escritura, acta de entrega, orden y acta de visita), plantillas de la
  Notaría virtual, firmas (seguimiento, reenvío), saldo.
