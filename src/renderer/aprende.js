/* global $, esc, icon, toast, ir, IM */
'use strict';
// «Aprende»: enseña a usar PortalFirma Asset panel por panel. Cada lección explica para qué sirve el panel,
// los pasos para usarlo y consejos; con «Verlo en vivo» abre el panel y recorre sus partes con globos guiados.
// El avance queda guardado en el equipo.
(() => {
const ESPERA = (sel, ms = 4000) => new Promise((res) => { const t0 = Date.now(); const f = () => { const el = document.querySelector(sel); if (el && el.getBoundingClientRect().width) return res(el); if (Date.now() - t0 > ms) return res(null); setTimeout(f, 120); }; f(); });
const primeraFicha = async () => { await window.Inmo.cartera({ especial: '', op: 'todas' }); const c = await ESPERA('.im-card'); if (!c) { toast('Primero importa o crea una propiedad para ver su ficha.', 5000); return false; } c.click(); return !!(await ESPERA('.im-ficha')); };
const primerNegocio = async () => { await window.Negocios.abrir(); const c = await ESPERA('.ng-card', 2500); if (!c) { toast('Aún no hay negocios. Crea uno con «Nuevo negocio» y vuelve a esta lección.', 5000); return false; } c.click(); return !!(await ESPERA('.ng-steps')); };

const L = [
  { id: 'inicio', ic: 'home', t: 'Inicio', sub: 'Tu día en una mirada',
    para: 'Es lo primero que ves al abrir la app. Resume la cartera y te dice qué requiere tu atención hoy, para que no se te escape nada.',
    pasos: ['Mira los indicadores: propiedades activas, en venta, en arriendo y negocios abiertos. Haz clic en cualquiera para ir a ese listado.', 'Revisa «Requieren atención»: propiedades sin propietario, reservadas, sin fotos, con interesados nuevos y negocios con acciones vencidas o esperando firmas.', 'Usa los atajos para crear una propiedad, una persona, enviar a firmar, actualizar desde Portalfirma o ir a Portales.', 'En «Actividad reciente» ves lo último que pasó; un clic abre la propiedad o la persona.', 'Pregúntale al Agente en lenguaje natural, por ejemplo «¿qué departamentos tengo en arriendo en Providencia?».'],
    tips: ['Si un número de «Requieren atención» está en cero, ese punto desaparece: un inicio limpio es un día al día.', 'El inicio se actualiza cada vez que vuelves a él.'],
    ir: async () => { await window.Inmo.inicio(); return !!(await ESPERA('#view-inicio .im-hero')); }, tour: 'inicio' },
  { id: 'cartera', ic: 'house', t: 'Cartera', sub: 'Todas tus propiedades',
    para: 'El listado de propiedades de la corredora, con foto, precio, estado y datos clave. Desde aquí se importa, se crea y se busca.',
    pasos: ['Pulsa «Importar desde Portalfirma» para traer tu cartera (incluye lo que venía de Convecta). Puedes repetirlo: no duplica y respeta lo que editaste aquí.', 'Busca por código, dirección, comuna, rol o el RUT del propietario.', 'Filtra por Venta o Arriendo, por tipo, estado o comuna.', 'Pulsa «Nueva propiedad» para crear una ficha a mano: título, tipo, precios, dirección y características.', 'Haz clic en una tarjeta para abrir su ficha. La etiqueta amarilla «PI» indica que está publicada en Portal Inmobiliario.'],
    tips: ['Las propiedades que ya no trabajas se archivan desde su ficha; «Ver archivadas» las muestra de nuevo.'],
    ir: async () => { await window.Inmo.cartera({ especial: '', op: 'todas' }); return !!(await ESPERA('#imQ')); }, tour: 'cartera' },
  { id: 'ficha', ic: 'key', t: 'Ficha de la propiedad', sub: 'Todo sobre una propiedad',
    para: 'Reúne fotos, características, precios y estados, personas vinculadas, documentos, negocios, publicación en portales e historial de la propiedad.',
    pasos: ['Cambia el estado comercial (disponible, reservada, vendida, arrendada) desde «Comercialización». Si está publicada, el aviso se pausa o reactiva solo.', 'En «Personas» vincula al propietario y a otros interesados. El propietario es necesario para firmar el mandato.', 'Arrastra documentos a la ventana o usa «Agregar»: quedan guardados en la carpeta de la propiedad y se abren en el editor para enviarlos a firmar.', 'En «Portal Inmobiliario» publica, actualiza, pausa o finaliza el aviso.', 'En «Negocios» crea una venta o un arriendo para esta propiedad.', 'Deja notas en el historial: visitas, llamadas, acuerdos.'],
    tips: ['«Editar ficha» abre todos los campos; puedes escribir un título especial para el portal al publicar.', 'Los interesados que llegan desde el portal aparecen en su propio bloque y entran al CRM cuando traen RUT.'],
    ir: primeraFicha, tour: 'ficha' },
  { id: 'personas', ic: 'users', t: 'Personas', sub: 'Tu CRM con RUT único',
    para: 'Propietarios, compradores, arrendatarios, codeudores, interesados y proveedores. Cada persona se registra una sola vez por RUT y se reutiliza en cada negocio y contrato.',
    pasos: ['Busca por nombre, RUT o correo y filtra por rol.', 'Pulsa «Nueva persona»: nombre, RUT (se valida y da formato solo), contacto, estado civil, profesión y roles.', 'Abre una persona para ver sus propiedades, contactarla por WhatsApp o correo y dejar notas.', 'Para vincularla a una propiedad, hazlo desde la ficha de la propiedad con «Vincular».'],
    tips: ['Si intentas crear un RUT que ya existe, la app te avisa quién es.', 'No se puede eliminar una persona vinculada a una propiedad: primero quita el vínculo.'],
    ir: async () => { await window.Inmo.personas(); return !!(await ESPERA('#cQ')); }, tour: 'personas' },
  { id: 'negocios', ic: 'briefcase', t: 'Negocios', sub: 'El tablero de ventas y arriendos',
    para: 'Cada venta o arriendo avanza por etapas, de interesado a entrega. El tablero muestra en qué está cada negocio y qué falta.',
    pasos: ['Elige Ventas o Arriendos arriba a la izquierda.', 'Pulsa «Nuevo negocio»: propiedad, cliente (o créalo ahí mismo), precio acordado, comisión, etapa inicial y próxima acción.', 'Arrastra una tarjeta a otra columna para mover el negocio. Al llegar a la reserva, la propiedad queda reservada sola.', 'Cada tarjeta dice lo que falta («Falta firmar: promesa»), la próxima acción y el avance de firmas.', 'Los indicadores muestran negocios abiertos, esperando firmas, acciones vencidas, cerrados del mes y comisión en curso.', '«Cerrados» muestra los negocios ganados y perdidos.'],
    tips: ['Una tarjeta con borde rojo tiene la próxima acción vencida.', 'Las firmas pendientes se revisan solas al abrir el panel: si algo se firmó, el negocio ya avanzó.'],
    ir: async () => { await window.Negocios.abrir(); return !!(await ESPERA('.ng-board, .ng-cerrados')); }, tour: 'negocios' },
  { id: 'negocio', ic: 'sign', t: 'Ficha del negocio', sub: 'Etapas, tareas y firmas',
    para: 'Todo lo de un negocio: en qué etapa está, qué tareas faltan, qué documento hay que firmar, la próxima acción, las condiciones y el historial.',
    pasos: ['La barra de etapas muestra el avance; haz clic en una etapa para mover el negocio.', 'Marca las tareas de la etapa a medida que las haces.', 'Si la etapa requiere firma, pulsa «Enviar a firmar» (documento de la propiedad, otro archivo o Notaría virtual) o «Ya lo envié» para vincular el número de operación.', 'Cuando el documento queda firmado, el negocio pasa solo a la etapa siguiente.', 'Define la próxima acción con fecha: aparecerá en el tablero y en el inicio si se vence.', 'Ajusta precio y comisión en «Condiciones». Al final, «Cerrar negocio con éxito» deja la propiedad vendida o arrendada.'],
    tips: ['Si el negocio se cae, «Marcar como perdido» pide el motivo y libera la propiedad.', 'Un negocio cerrado se puede reabrir.'],
    ir: primerNegocio, tour: 'negocio' },
  { id: 'agenda', ic: 'calendar', t: 'Agenda', sub: 'Visitas, reuniones y firmas',
    para: 'Todos tus eventos con fecha y hora, ligados a la propiedad, las personas y el negocio. Las visitas generan su orden de visita con un clic.',
    pasos: ['Pulsa «Nuevo evento» y elige el tipo (visita, reunión, firma, llamada o tarea), la fecha, la hora, la propiedad y la persona.', 'En cada visita, «Generar orden de visita» completa la plantilla de la Notaría virtual con los datos de la propiedad y del visitante y la envía a firmar.', 'Marca los eventos como hechos, reprográmalos o cancélalos desde su fila.', 'Filtra por los próximos 14 días, el próximo mes o todo, y por tipo.', 'El inicio muestra la agenda de hoy.'],
    tips: ['Más rápido: pídeselo al Agente, por ejemplo «agenda una visita mañana a las 11 en CV-5514 con Ana y genera la orden de visita».'],
    ir: async () => { await window.Agenda.abrir(); return !!(await ESPERA('#agNew')); }, tour: 'agenda' },
  { id: 'portales', ic: 'link', t: 'Portales', sub: 'Portal Inmobiliario y más',
    para: 'Conecta la cuenta de la corredora en Mercado Libre para publicar en Portal Inmobiliario desde cada ficha, recibir interesados y mantener los avisos al día.',
    pasos: ['Completa el contacto que aparece en los avisos. El WhatsApp es obligatorio.', 'Pulsa «Conectar cuenta de la corredora» y autoriza en la ventana de Mercado Libre.', 'Si ya tenías avisos publicados (por ejemplo, con Convecta), usa «Vincular avisos existentes» antes de publicar, para no duplicarlos.', 'Publica desde la ficha de cada propiedad: la app revisa todo antes y te dice qué falta.', '«Sincronizar avisos e interesados» trae el estado de cada aviso y los contactos nuevos.'],
    tips: ['Los cambios de precio, fotos o descripción en la ficha actualizan el aviso solos.', 'TOCTOC, Chilepropiedades, Yapo y Goplaceit se sumarán a medida que se firmen los acuerdos.'],
    ir: async () => { await window.Inmo.portales(); return !!(await ESPERA('#coWa')); }, tour: 'portales' },
  { id: 'documental', ic: 'files', t: 'Gestión documental', sub: 'Firma, notaría y PDF',
    para: 'Todas las herramientas de documentos de PortalFirma: editor PDF, enviar a firmar, Notaría virtual, firmas presenciales, plazos, expedientes, flujos y carga masiva.',
    pasos: ['Abre un PDF o Word, o arrástralo a la ventana.', '«Enviar a firmar» detecta los firmantes; revisa sus datos y confirma.', '«Mis operaciones» muestra el estado de cada firma y los documentos firmados.', 'La Notaría virtual tiene poderes, declaraciones y contratos listos para completar.', 'Gestión de firmas presenciales coordina escrituras y protocolizaciones en notaría.'],
    tips: ['Lo que envías a firmar desde un negocio queda ligado a él automáticamente.'],
    ir: async () => { window.studio.goHome(); return !!(await ESPERA('.hub-card')); }, tour: 'home' },
  { id: 'agente', ic: 'sparkle', t: 'Agente Asset', sub: 'Todo por chat',
    para: 'El Agente hace por ti lo mismo que los botones: sube propiedades, crea personas y negocios, agenda visitas, genera órdenes de visita, mueve negocios de etapa, publica en Portal Inmobiliario y envía a firmar. La Ayuda tiene guías, buscador y soporte.',
    pasos: ['Abre la pestaña «Agente» para trabajar a pantalla completa, o el botón de la barra superior para tenerlo al lado de cualquier pantalla.', 'Usa las acciones rápidas: «Gestionar una propiedad» te guía paso a paso (propiedad → qué hacer → plantilla → datos → firma) y llena solo los datos que ya conoce.', 'A la izquierda quedan tus conversaciones: retómalas, cámbiales el nombre, fíjalas o elimínalas. A la derecha, el lienzo muestra en vivo lo que estás trabajando (tu día, la propiedad, el negocio con sus etapas, la firma) y sus botones hacen la acción al toque.', 'Después de cada acción aparece «Siguiente paso» con lo que normalmente sigue: un toque y listo.', 'Pídele cosas como «sube una propiedad nueva: depto en Ñuñoa, arriendo $650.000, 2D 1B», «agenda una visita mañana a las 11 en CV-5514 con Ana y genera la orden de visita» o «pasa el negocio de Ana a reserva».', 'Encadena pasos solo: busca la propiedad y la persona, crea lo que falta y te dice qué quedó hecho; si conviene, abre la pantalla.', 'Lo que cobra o envía siempre pide tu confirmación antes.', 'El botón «Ayuda» (abajo a la derecha) abre las guías de la pantalla en que estás y el recorrido guiado.', 'Si no encuentras la respuesta, «Hablar con soporte» abre WhatsApp.'],
    tips: ['Las claves del certificado y los códigos se escriben en campos protegidos: nunca llegan al modelo de IA.'],
    ir: async () => { await window.Inmo.inicio(); return !!(await ESPERA('#helpFab')); }, tour: 'agente' },
];

// Recorridos guiados (globos sobre cada parte de la pantalla). Solo se muestran los pasos visibles.
const TOURS = {
  inicio: [['#view-inicio .im-hero', 'Tu inicio', 'Saludo, fecha y el Agente: pregúntale por tu cartera en lenguaje natural.'], ['.im-kpis', 'Indicadores', 'Haz clic en cualquiera para ir a ese listado.'], ['#view-inicio .im-cols .im-box', 'Requieren atención', 'Lo que necesita acción hoy: firmas, acciones vencidas, propiedades sin propietario y más.'], ['.im-quick', 'Atajos', 'Crea, importa, envía a firmar o ve a Portales con un clic.'], ['.im-act', 'Actividad reciente', 'Lo último que pasó; un clic abre la propiedad o la persona.']],
  cartera: [['#imImp', 'Importar desde Portalfirma', 'Trae tu cartera. Puedes repetirlo: no duplica y respeta lo editado aquí.'], ['#imNew', 'Nueva propiedad', 'Crea una ficha a mano.'], ['#imQ', 'Buscar', 'Por código, dirección, comuna, rol o RUT del propietario.'], ['#imOp', 'Venta o arriendo', 'Filtra por operación; a la derecha, por tipo, estado y comuna.'], ['.im-card', 'Tarjetas', 'Foto, precio, estado y datos clave. Un clic abre la ficha.'], ['#imPort', 'Portales', 'Conecta Portal Inmobiliario y configura el contacto de los avisos.']],
  ficha: [['.im-ft', 'La propiedad', 'Código, tipo, rol, dirección y de dónde se importó.'], ['#fEdit', 'Editar ficha', 'Todos los campos: precios, superficies, descripción y notas internas.'], ['.im-com', 'Comercialización', 'Precio y estado. Cambiar el estado ajusta solo el aviso del portal.'], ['#fPI', 'Portal Inmobiliario', 'Publica, actualiza, pausa o finaliza el aviso.'], ['#fVinc', 'Personas', 'Vincula al propietario y otros roles.'], ['#fDocs', 'Documentos', 'Arrastra aquí mandatos, escrituras o certificados; se abren en el editor para firmar.'], ['#fNota', 'Historial', 'Anota visitas, llamadas y acuerdos.']],
  personas: [['#cNew', 'Nueva persona', 'Una sola vez por RUT; se reutiliza en cada negocio.'], ['#cQ', 'Buscar', 'Por nombre, RUT o correo.'], ['#cRol', 'Roles', 'Filtra propietarios, compradores, arrendatarios y más.'], ['.im-table', 'Tu CRM', 'Un clic abre la persona con sus propiedades e historial.']],
  negocios: [['#ngTipo', 'Ventas o arriendos', 'Cada uno tiene sus propias etapas.'], ['#ngNew', 'Nuevo negocio', 'Propiedad, cliente, precio, comisión y próxima acción.'], ['.ng-kpis', 'Indicadores', 'Abiertos, esperando firmas, acciones vencidas, cerrados del mes y comisión en curso.'], ['.ng-board', 'Tablero', 'Una columna por etapa. Arrastra una tarjeta para mover el negocio.'], ['.ng-card', 'Tarjeta', 'Qué falta, la próxima acción y el avance de firmas. Un clic abre el negocio.'], ['#ngVer', 'Cerrados', 'Negocios ganados y perdidos.']],
  negocio: [['.ng-steps', 'Etapas', 'El avance del negocio. Haz clic en una etapa para moverlo.'], ['.ng-tasks', 'Tareas', 'Márcalas a medida que las haces.'], ['.ng-fb', 'Firma de la etapa', 'Envía el documento o vincula la operación; al firmarse, el negocio avanza solo.'], ['.ng-acts', 'Avanzar o cerrar', 'Pasa a la siguiente etapa, cierra con éxito o márcalo como perdido.'], ['#ngPa', 'Próxima acción', 'Qué hay que hacer y cuándo; avisa si se vence.'], ['.ng-prop', 'Propiedad', 'Vuelve a la ficha de la propiedad.']],
  agenda: [['#agNew', 'Nuevo evento', 'Visita, reunión, firma, llamada o tarea, con fecha, hora, propiedad y persona.'], ['#agAsk', 'Pedírselo al Agente', 'Escribe lo que necesitas y el Agente lo agenda por ti.'], ['#agRango', 'Rango', 'Próximos 14 días, el próximo mes o todo.'], ['.ag-ev', 'Cada evento', 'Márcalo como hecho, reprográmalo o cancélalo. En las visitas, genera la orden de visita.']],
  portales: [['#coWa', 'Contacto del aviso', 'El WhatsApp es obligatorio para publicar.'], ['#poCon', 'Conectar la cuenta', 'Autoriza a PortalFirma en Mercado Libre.'], ['#poSync', 'Sincronizar', 'Trae el estado de los avisos y los interesados nuevos.'], ['#poExist', 'Avisos existentes', 'Asocia los avisos que ya tenías publicados, sin duplicarlos.'], ['.im-otros', 'Otros portales', 'Se suman cuando se firmen los acuerdos.']],
  agente: [['#agBtn', 'Agente PortalFirma', 'Pregunta y pide tareas con tu cuenta; lo que cobra o envía pide confirmación.'], ['#helpFab', 'Ayuda', 'Guías de esta pantalla, recorrido guiado, buscador y soporte.']],
};
Object.assign(window.Ayuda.TOURS, TOURS);
// Guías para la Ayuda (buscador y «En esta pantalla»)
const SCREEN = { agenda: ['agenda'], inicio: ['inicio'], cartera: ['cartera'], ficha: ['ficha', 'cartera'], personas: ['personas'], negocios: ['negocios'], negocio: ['negocio', 'negocios'], portales: ['portales'], documental: ['home'], agente: ['inicio', 'home'] };
for (const l of L) window.Ayuda.GUIDES.unshift({ id: 'ap-' + l.id, level: 'inmo', screens: SCREEN[l.id] || [], title: `${l.t}: ${l.sub.toLowerCase()}`, kw: [l.t, l.sub, l.para].join(' '), steps: l.pasos });

const hecho = (id) => { try { return localStorage.getItem('pf.aprende.' + id) === '1'; } catch { return false; } };
const marcar = (id, v) => { try { v ? localStorage.setItem('pf.aprende.' + id, '1') : localStorage.removeItem('pf.aprende.' + id); } catch {} };

function abrir() {
  ir('aprende'); const n = L.filter((l) => hecho(l.id)).length;
  $('#view-aprende').innerHTML = `<div class="im-wrap">
    <div class="im-head fx-aprende"><div><h1>Aprende a usar PortalFirma Asset</h1><p class="muted">Panel por panel: para qué sirve, cómo se usa y un recorrido guiado en vivo. Te toma unos 10 minutos.</p>
      <div class="ap-prog"><span style="width:${Math.round(n / L.length * 100)}%"></span></div><small class="muted">${n} de ${L.length} lecciones completadas</small></div>
      <button class="primary" id="apStart">${icon('compass', 15)} ${n ? 'Seguir donde quedé' : 'Empezar'}</button></div>
    <div class="ap-grid">${L.map((l, i) => `<button class="ap-card ${hecho(l.id) ? 'ok' : ''}" data-l="${l.id}"><span class="ap-n">${hecho(l.id) ? icon('check', 14) : i + 1}</span><span class="ap-ic">${icon(l.ic, 22)}</span><b>${esc(l.t)}</b><small>${esc(l.sub)}</small></button>`).join('')}</div></div>`;
  $('#view-aprende').querySelectorAll('[data-l]').forEach((b) => (b.onclick = () => leccion(b.dataset.l)));
  $('#apStart').onclick = () => leccion((L.find((l) => !hecho(l.id)) || L[0]).id);
}
function leccion(id) {
  ir('aprende'); const i = L.findIndex((l) => l.id === id); const l = L[i]; const prev = L[i - 1], next = L[i + 1];
  $('#view-aprende').innerHTML = `<div class="im-wrap ap-lec">
    <div class="im-fh"><button class="ghost" id="apBack">${icon('chevL', 16)} Todas las lecciones</button><span class="spacer"></span><small class="muted">Lección ${i + 1} de ${L.length}</small></div>
    <div class="ap-hero"><span class="ap-ic big">${icon(l.ic, 30)}</span><div><small class="im-code">${esc(l.sub)}</small><h1>${esc(l.t)}</h1><p>${esc(l.para)}</p></div></div>
    <div class="im-fcols">
      <div class="im-box"><h3>Paso a paso</h3><ol class="ap-pasos">${l.pasos.map((p) => `<li>${esc(p)}</li>`).join('')}</ol></div>
      <div><div class="im-box ap-vivo"><h3>${icon('compass', 16)} Verlo en vivo</h3><p class="muted">Abrimos el panel y te mostramos cada parte con globos. Avanza con «Siguiente» o con la tecla →.</p><button class="primary" id="apVivo">Empezar el recorrido</button></div>
        <div class="im-box"><h3>Consejos</h3><ul class="ap-tips">${l.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
        <label class="ap-done"><input type="checkbox" id="apDone" ${hecho(l.id) ? 'checked' : ''} /> Ya lo aprendí</label></div></div>
    <div class="actions">${prev ? `<button class="secondary" data-go="${prev.id}">${icon('chevL', 15)} ${esc(prev.t)}</button>` : ''}<span class="spacer"></span>${next ? `<button class="primary" data-go="${next.id}">Siguiente: ${esc(next.t)} ${icon('chevR', 15)}</button>` : '<button class="primary" id="apFin">Terminar</button>'}</div></div>`;
  $('#apBack').onclick = abrir;
  $('#apDone').onchange = (e) => marcar(l.id, e.target.checked);
  $('#view-aprende').querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => { marcar(l.id, true); leccion(b.dataset.go); }));
  if ($('#apFin')) $('#apFin').onclick = () => { marcar(l.id, true); toast('¡Listo! Puedes volver a estas lecciones desde Ayuda → Aprende.', 5000); abrir(); };
  $('#apVivo').onclick = async () => { marcar(l.id, true); const ok = await l.ir(); if (ok) setTimeout(() => window.Ayuda.startTour(l.tour), 350); };
}
window.Aprende = { abrir, leccion, LECCIONES: L };
})();
