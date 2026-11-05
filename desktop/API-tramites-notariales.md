# PortalFirma Studio: rutas de la API para trámites notariales

**Para:** el técnico de Portalfirma
**Versión de Studio:** 0.36.0

## Para qué sirven

Studio ya hace estas tareas en el computador del cliente:

1. Lee el documento.
2. Identifica la materia según la planilla «Materias y valores».
3. Calcula el valor.
4. Revisa el documento.
5. Formatea la escritura o arma la carátula.

Para cobrar y entregar el trámite a la notaría faltan las rutas de abajo. Mientras no existan, Studio avisa que la función no está disponible y **no cobra nada**.

Todas las rutas siguen las mismas reglas que el resto de la API:

- Base: `https://api.portalfirma.cl/api`
- Cabecera `id`.
- Cookie `auth-token`.
- Respuesta con la forma `{ success, data }`.

Las rutas propuestas están en `src/notarias.js`. Si en el servidor tienen otros nombres o formatos, se ajustan ahí.

## 1. Crear la operación

`POST /notarial/operation`

Studio envía la ficha del trámite (JSON):

```json
{
  "tramite": "escritura | protocolizacion | reduccion",
  "materia": "promesa_de_compraventa",
  "materiaLabel": "Promesa de Compraventa",
  "materiaAutomatica": true,
  "confianza": "alta | media | baja | elegida por el cliente",
  "actos": ["hipoteca"],
  "materiasOcultas": [{ "codigo": "hipoteca", "nombre": "Hipoteca", "clausula": "SEGUNDO", "cita": "…constituye primera hipoteca a favor…", "principal": false, "cobrado": true, "descartadoPorCliente": false }],
  "hojas": 5,
  "cobro": [{ "concepto": "Promesa de Compraventa", "detalle": "$15.000 + $1.000 por hoja × 5", "monto": 20000 }],
  "total": 20000,
  "cotizacion": false,
  "titulo": "…",
  "partes": ["…", "…"],
  "comparecientes": [{ "nombre": "…", "rut": "6.375.107-3", "rutValido": true, "estadoCivil": "…", "profesion": "…", "domicilio": "…", "calidad": "…", "representa": null, "representadoPor": null, "asiste": true, "email": "…", "tel": "…" }],
  "protocolizacion": { "requirente": "…", "descripcion": "…", "firmante": "…", "fechaFirma": "2023-01-23", "patente": "SKDD91-7", "email": "…", "firmasElectronicas": [{ "nombre": "…", "fecha": "…" }] },
  "observaciones": [{ "nivel": "error | warn", "texto": "…" }],
  "origen": "PortalFirma Studio"
}
```

Respuesta esperada: `{ "operation": "…" }`

`actosAgregadosPorCliente` lista los actos que Studio no detectó y el cliente agregó, con la frase del escrito: `[{ "codigo": "cesion_de_derechos" | null, "nombre": "…", "frase": "…", "cobrado": true }]`. Si `codigo` es `null`, el acto no está en la planilla y va solo como información.

`materiasOcultas` lista los actos que Studio encontró en el texto además de la materia declarada, con la cláusula y la cita que lo prueban. Si `descartadoPorCliente` es `true`, el cliente lo desmarcó: la notaría debe revisarlo y, si corresponde, pedir un ajuste de tarifa.

**Seguridad:** el servidor debe recalcular el `total` con su propia planilla. No debe confiar en el monto que manda la aplicación.

## 2. Subir los archivos

`POST /notarial/operation/:operation/file`

Studio envía un archivo por llamada:

```json
{ "name": "…", "kind": "…", "base64": "…" }
```

Valores posibles de `kind`:

| `kind` | Qué es | Se envía en |
|---|---|---|
| `original` | Minuta en Word, tal como la subió el cliente | Escritura |
| `escritura_docx` | Escritura formateada en Word | Escritura |
| `escritura_pdf` | Escritura formateada en PDF | Escritura |
| `caratula_docx` | Carátula de protocolización en Word | Protocolización |
| `caratula_pdf` | Carátula de protocolización en PDF | Protocolización |
| `documento` | Documento privado, convertido a PDF | Protocolización y reducción |
| `documento_word` | Documento privado en Word, tal como lo subió el cliente | Protocolización y reducción |
| `para_notaria` | Carátula seguida de los documentos, en un solo PDF | Protocolización |
| `reduccion_docx` | Escritura de reducción en Word | Reducción |
| `reduccion_pdf` | Escritura de reducción en PDF | Reducción |
| `ficha` | La ficha del punto 1, en JSON | Siempre |

En los documentos formateados quedan marcados en amarillo con `[ ]` los datos que completa la notaría:

- repertorio y número;
- fecha;
- nombre del notario, número de la notaría, dirección y ciudad.

Si conviene, también se puede enviar como `multipart/form-data`.

## 3. Pagar con el saldo

`POST /notarial/operation/:operation/pay` con el cuerpo `{ "method": "wallet" }`

- Descuenta el total del saldo de la cuenta (`walletPartner`).
- Deja la operación en el estado `pagado`.
- Si el saldo no alcanza, debe responder con un error que lo indique.

Para recargar saldo, Studio usa la recarga que ya existe (pasarela con tarjeta o transferencia).

## 4. Solicitar una cotización

`POST /notarial/operation/:operation/quote`

Se usa para las materias sin precio en la planilla (nueve materias, más «Otro»). No se cobra nada. La operación queda en el estado `cotizacion` hasta que la notaría informe el valor y el cliente lo pague.

## 5. Consultar el estado

`GET /notarial/operation/:operation`

Estados que Studio ya sabe mostrar:

| Estado | Qué significa |
|---|---|
| `cotizacion` | Cotización solicitada |
| `pagado` | Pagado, pendiente de que una notaría lo tome |
| `aceptado` | Aceptado por la notaría |
| `pausado_ajuste_tarifa` | Pausado hasta que el cliente pague un ajuste de tarifa |
| `citado` | Firma presencial agendada |
| `firmado` | Firmado, pendiente de despacho |
| `cerrado` | Cerrado o despachado |

Para mostrar el ajuste de tarifa al cliente, la respuesta debe incluir `{ "ajuste": { "monto": 0, "motivo": "…" } }`.

## 6. Publicar la red de notarías

`GET /notarial/notarias`

Antes de pagar, el cliente elige la notaría, o deja la asignación automática. Mientras esta ruta no exista, Studio muestra tres notarías de prueba con datos ficticios. La lista que devuelva la API reemplaza esas tres.

Cada notaría usa este formato:

```json
{ "id": "nt-49-stgo", "nombre": "Cuadragésima Novena Notaría de Santiago", "notario": "NOMBRE DEL NOTARIO", "titular": true, "titularDe": null,
  "numero": 49, "ordinal": "Cuadragésimo Novena", "ciudad": "Santiago", "comuna": "Santiago", "region": "Metropolitana",
  "direccion": "calle Hermanos Amunátegui setenta y tres", "dirCorta": "Hermanos Amunátegui 73",
  "telefono": "…", "email": "…", "horario": "Lunes a viernes, 9:00 a 17:00",
  "servicios": ["escritura", "protocolizacion", "reduccion"], "tomaHoras": 24 }
```

- **`direccion` va escrita en palabras**, porque Studio la copia tal cual en la comparecencia de la escritura y en la carátula. `dirCorta` es la versión breve que se muestra en pantalla.
- **`servicios`** indica qué trámites realiza esa notaría. Si una notaría no hace el trámite que el cliente eligió, aparece pero no se puede seleccionar.
- **Notario suplente:** si `titular` es `false`, la escritura dice «Notario Público suplente de don `titularDe`».
- **En la ficha del trámite** se agrega el campo `notaria`, con una de estas dos formas:
  - Si el cliente eligió una notaría: `{ "id": …, "nombre": …, "notario": …, "comuna": …, "direccion": …, "prueba": … }`.
  - Si dejó la asignación automática: `{ "asignacion": "automatica" }`.

## 7. Publicar los valores vigentes

`GET /notarial/tarifas`

Como los precios pueden cambiar, Studio los consulta cada vez que se abre «Trámites notariales». Así se actualizan sin publicar una versión nueva de la app. Si la ruta no responde, Studio usa el último valor que recibió o, si nunca recibió uno, el que trae instalado.

```json
{
  "vigencia": "2026-10-06",
  "protocolizacion": 40000,
  "reduccion": 45500,
  "materias": { "compraventa": 95000, "promesa_de_compraventa": 25000 }
}
```

- `protocolizacion` es una tarifa fija para toda protocolización, sin importar la materia ni las hojas. Hoy es $40.000.
- `materias` reemplaza el valor de la planilla para cada código de materia que incluya. No hace falta enviar las que no cambian.

## 8. Reglas de detección (aprendizaje)

Cuando un cliente corrige la detección (cambia la materia, descarta un acto oculto o agrega uno que faltaba), Studio guarda un **caso**. La IA revisa los casos en lote y propone reglas; una persona de Portalfirma las aprueba; las aprobadas se ejecutan **sin IA** en todas las apps. Hoy todo esto queda en el computador del administrador; con estas rutas se comparte entre todos.

`POST /notarial/reglas/casos`: Studio envía cada caso. Ya viene con RUT, correos y teléfonos tachados.

```json
{ "caso": { "id": "c…", "tramite": "escritura", "titulo": "MANDATO ESPECIAL", "materiaAuto": "mandato_especial", "materiaFinal": "compraventa", "confianza": "alta",
  "descartados": [{ "codigo": "hipoteca", "nombre": "Hipoteca", "cita": "…" }],
  "agregados": [{ "codigo": null, "nombre": "Comodato", "frase": "da en comodato a…" }],
  "texto": "… hasta 6.000 caracteres …" } }
```

`GET /notarial/reglas`: Studio las consulta al abrir «Trámites notariales», igual que las tarifas.

`POST /notarial/reglas` (solo administradores): publica las reglas aprobadas. Es el mismo JSON que hoy exporta el panel «Reglas de detección».

```json
{
  "version": "2026-10-06-1",
  "actos": [{ "id": "r…", "nombre": "Comodato", "codigo": null, "patron": "\\b(?:da|dan)\\s+en\\s+comodato\\b", "incluido": "comodato", "principal": false, "activo": true }],
  "materias": [{ "id": "r…", "materia": "compraventa", "campo": "titulo", "patron": "…", "activo": true }],
  "excepciones": [{ "id": "r…", "acto": "hipoteca", "patron": "…", "activo": true }]
}
```

- `patron` es una expresión regular de JavaScript que se aplica sobre el texto en minúsculas y sin tildes.
- `actos`: un acto nuevo. Si `codigo` está en la planilla, se cobra.
- `materias`: si el título (o el inicio del texto) coincide, se usa esa materia.
- `excepciones`: si el patrón aparece junto al hallazgo de ese acto, no se informa (evita falsos positivos).
- Studio descarta cualquier regla cuya expresión no compile.

## 9. Para activar la conexión

Cuando las rutas existan, Studio se pone en marcha con la variable `PF_NOTARIAL_API=1`. En la próxima versión, la conexión quedará activada de forma fija.
