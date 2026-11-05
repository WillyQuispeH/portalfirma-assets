// Reglas de Firmas presenciales (trámites notariales). El motor notarial sigue en src/renderer/notarial.js
// (window.Notarial) y la planilla de materias y precios en src/renderer/materias.js (window.Materias):
// también corren en Node para las pruebas. Aquí está lo que la pantalla calcula a partir del estado:
// la materia, los actos ocultos y su cobro, los comparecientes, la cotización, lo que falta y la ficha del trámite.
// La lectura y la revisión ocurren en el computador, sin IA (salvo los PDF o fotos de documentos privados).
/* eslint-disable @typescript-eslint/no-explicit-any -- el motor notarial no tiene tipos en la app */
import type { ICotizacion, IDatosPrivado, IDocPrivado, IEscrituraDatos, TTramite } from '../store/interfaces/escritura.interface';

export const motor = () => ({ N: (window as any).Notarial, MT: (window as any).Materias });

export const TRAMITES: Record<TTramite, { t: string; d: () => string; ic: string; presencial: boolean }> = {
  escritura: { t: 'Escritura pública', d: () => 'Compraventas, promesas, mandatos, sociedades, rectificaciones… Subes la minuta; la revisamos, le damos formato notarial y la notaría coordina la firma presencial.', ic: 'notary', presencial: true },
  protocolizacion: { t: 'Protocolización', d: () => `Cualquier documento (firmado o no, incluso una fotocopia) se incorpora al registro público del notario y obtiene fecha cierta. Sin cita presencial. Tarifa fija de ${motor().MT.clp(motor().MT.TARIFAS.protocolizacion)}.`, ic: 'bookmark', presencial: false },
  reduccion: { t: 'Reducción a escritura pública', d: () => `Un documento privado ya firmado pasa a ser público: se transcribe íntegro en una escritura. Debes llevar el original firmado el día de la firma. Tarifa fija de ${motor().MT.clp(motor().MT.TARIFAS.reduccion)}.`, ic: 'fileOut', presencial: true },
};
export const SEVERIDAD: Record<string, [string, string]> = { error: ['Error', '#c0362c'], warn: ['Revisar', '#b26a00'], info: ['Nota', '#3f4fe6'] };
export const COLOR_ESTADO: Record<string, string> = { cotizacion: '#b26a00', pagado: '#3f4fe6', aceptado: '#3f4fe6', pausado_ajuste_tarifa: '#c0362c', citado: '#0d9488', firmado: '#13804b', cerrado: '#13804b' };
export const SERVICIOS: Record<TTramite, string> = { escritura: 'Escrituras', protocolizacion: 'Protocolizaciones', reduccion: 'Reducciones' };

export const clp = (n: number | null | undefined): string => motor().MT.clp(n);
export const fechaIso = (d: Date | null | undefined) => (d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : '');
const deIso = (iso: string) => (iso ? new Date(iso + 'T12:00:00') : null);
const correoOk = (s?: string) => /^\S+@\S+\.\S+$/.test(String(s || '').trim());
const telOk = (s?: string) => String(s || '').replace(/\D/g, '').length >= 8;
// iniciales para el avatar: nombre + primer apellido
export const iniciales = (n: string) => { const p = String(n || '').replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ ]/g, ' ').trim().split(/\s+/).filter((x) => x.length > 2); if (!p.length) return '·'; const ult = p.length >= 4 ? p[p.length - 2] : p[p.length - 1]; return (p[0][0] + (p.length > 1 ? ult[0] : '')).toUpperCase(); };
export const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });

// ---- de qué se trata
export const esPrivado = (S: Pick<IEscrituraDatos, 'tramite'>) => S.tramite === 'protocolizacion' || S.tramite === 'reduccion'; // documentos privados: no los edita el cliente
export const hayDocumento = (S: IEscrituraDatos) => (esPrivado(S) ? S.proto.docs.length > 0 : !!S.a);
export const tituloDoc = (S: IEscrituraDatos) => (esPrivado(S) ? (S.proto.info?.titulo || 'Documento') : (S.o?.titulo || S.name || 'Minuta'));
export const totalHojas = (S: IEscrituraDatos) => S.proto.docs.reduce((s, x) => s + x.pages, 0);
const usoIA = (x: IDocPrivado) => (x.ia || []).reduce((a, r) => ({ modelo: r._uso?.modelo || a.modelo, tokens: a.tokens + (r._uso?.entrada || 0) + (r._uso?.salida || 0) }), { modelo: '', tokens: 0 });
export const origenDoc = (x: IDocPrivado) => { if (x.origen === 'Word') return 'Word · lectura exacta'; const u = usoIA(x); return `${x.origen === 'Imagen' ? 'imagen' : 'PDF'} · leído con IA${u.modelo ? ` (${u.modelo} · ${u.tokens.toLocaleString('es-CL')} tokens)` : ''}`; };
export const origenes = (S: IEscrituraDatos) => S.proto.docs.map(origenDoc).filter((v, i, a) => a.indexOf(v) === i).join(' · ');
export const sinPrefijo = (s: string) => s.replace(/^(Protocolizaci[oó]n|Prot\.)\s+/i, '');

// ---- la minuta (escritura pública): analizarla de nuevo después de cada cambio del texto
export function analizarMinuta(S: IEscrituraDatos, raw: string, fresca: boolean): Partial<IEscrituraDatos> {
  const { N, MT } = motor();
  const a = N.analyze(raw);
  const auto = { titulo: a.title, partes: [(a.parties[0] || '').replace(/,(?=\s)/g, ''), (a.parties[1] || '').replace(/,(?=\s)/g, '')] };
  const prev = S.o;
  const o = prev && !fresca ? { ...prev, ...(prev._tp ? {} : auto) } : { ...auto, convertir: true, cierre: true };
  const out: Partial<IEscrituraDatos> = { raw, a, o, hojasEsc: 0 };
  if (fresca || !S.materia) {
    const sug = MT.clasificar(a.title, a.body.join(' '), 'escritura');
    Object.assign(out, { sug, materia: sug[0]?.value || 'otro', descartados: new Set<string>(), agregados: [] });
  }
  return out;
}
// aplica todas las correcciones sugeridas (algunas aparecen después de aplicar otras)
export function corregirTodo(raw: string) {
  const { N } = motor();
  for (let k = 0; k < 4; k++) { const fx = N.analyze(raw).alerts.filter((x: any) => x.fix && x.fix.type !== 'cierre'); if (!fx.length) break; fx.forEach((x: any) => { raw = N.applyFix(raw, x.fix); }); }
  return raw;
}

// ---- documentos privados (protocolización y reducción): lo que se deduce del texto y lo que leyó la IA
export function analizarPrivados(S: IEscrituraDatos, docs: IDocPrivado[]): Partial<IEscrituraDatos> {
  const { N, MT } = motor();
  const primero = docs[0];
  const todo = docs.map((x) => x.text).join('\n\n');
  const hojas = docs.reduce((s, x) => s + x.pages, 0);
  const info = N.analizarPrivado(todo, { pages: hojas, name: primero.name });
  // lo que leyó la IA (PDF o imagen) manda sobre lo deducido del texto
  const ias = docs.flatMap((x) => x.ia || []);
  if (ias.length) {
    info.ia = true;
    const tit = ias.find((x) => x.titulo)?.titulo; if (tit) info.titulo = String(tit).toUpperCase();
    const fe = ias.find((x) => x.fecha)?.fecha; if (fe && /^\d{4}-\d{2}-\d{2}$/.test(fe)) info.fechaDocumento = new Date(fe + 'T12:00:00');
    const pa = ias.find((x) => x.patente)?.patente; if (pa) info.patente = String(pa).toUpperCase();
    info.participantes = [
      ...ias.flatMap((x) => x.participantes || []).filter((p: any) => p?.nombre).map((p: any) => ({ nombre: String(p.nombre).toUpperCase(), rut: p.rut || '', rol: p.rol || '' })).filter((p: any, i: number, a: any[]) => a.findIndex((q) => N.fold(q.nombre) === N.fold(p.nombre)) === i),
      ...info.participantes.filter((p: any) => !ias.some((x) => (x.participantes || []).some((q: any) => q?.nombre && (N.fold(q.nombre).includes(N.fold(p.nombre)) || N.fold(p.nombre).includes(N.fold(q.nombre)))))),
    ];
    const fs = ias.flatMap((x) => x.firmas || []);
    fs.filter((f: any) => f.tipo === 'electronica' && f.nombre).forEach((f: any) => { if (!info.firmas.electronicas.some((e: any) => N.fold(e.nombre) === N.fold(f.nombre))) info.firmas.electronicas.push({ nombre: String(f.nombre).toUpperCase(), fecha: f.fecha ? new Date(f.fecha + 'T12:00:00') : null }); });
    fs.filter((f: any) => f.tipo !== 'electronica').forEach((f: any) => { const nm = f.nombre ? String(f.nombre).toUpperCase() : `Firma ${f.tipo === 'timbre' ? 'con timbre' : 'manuscrita'} (sin nombre legible)`; if (!info.firmas.lineas.includes(nm)) info.firmas.lineas.push(nm); });
    info.firmas.hay = !!(info.firmas.electronicas.length || info.firmas.lineas.length || info.firmas.otras);
    const ileg = ias.flatMap((x) => x.ilegible || []).filter(Boolean);
    if (ileg.length) info.alertas.push({ sev: 'warn', text: `La IA no pudo leer algunas partes: ${ileg.slice(0, 3).join(' · ')}${ileg.length > 3 ? '…' : ''}. La notaría revisará el original.` });
    info.alertas = info.alertas.filter((a: any) => !/campos vacíos/.test(a.text) || /undefined|null|NaN/.test(todo));
  }
  if (S.tramite === 'protocolizacion' && !info.firmas.hay) info.alertas.push({ sev: 'info', text: 'El documento no muestra firmas en el texto. Se puede protocolizar igual: la protocolización le da fecha cierta y lo incorpora al registro público.' });
  const prev = S.proto.d;
  const titulo = info.titulo + (info.ley && !/ley/i.test(info.titulo) ? ` LEY Nº ${info.ley}` : '');
  const cap = (t: string) => (t.charAt(0) + t.slice(1).toLowerCase()).replace(/\bley n[º°]\s*/g, 'Ley Nº ');
  const d: IDatosPrivado = {
    email: prev?.email || '', tel: prev?.tel || '', nota: prev?.nota || '', declara: !!prev?.declara,
    titulo, partes: info.partes, requirente: '', descripcion: docs.length > 1 ? `${cap(titulo)} (${docs.length} archivos)` : cap(titulo),
    firmante: info.firmas.electronicas.map((f: any) => f.nombre).join(', ').replace(/, ([^,]*)$/, ' y $1'),
    fechaFirma: info.firmas.electronicas[0]?.fecha ? fechaIso(info.firmas.electronicas[0].fecha) : '', patente: info.patente, calidad: '',
  };
  const sug = MT.clasificar(info.titulo, todo, S.tramite === 'protocolizacion' ? 'protocolizacion' : 'escritura');
  return {
    proto: { docs, info, d }, sug, materia: sug[0]?.value || (S.tramite === 'protocolizacion' ? 'protocolizacion_privado' : 'otro'),
    descartados: new Set<string>(), agregados: [],
    red: S.tramite === 'reduccion' ? N.reduccionTexto(info, todo) : null, redCuerpo: null, // la reducción: el escrito base
  };
}

// ---- revisión: materias ocultas (se revisa todo el texto cada vez: dependen de la materia elegida)
export const textoDoc = (S: IEscrituraDatos) => (esPrivado(S) ? S.proto.docs.map((x) => x.text).join(' ') : (S.a ? [S.a.title, ...S.a.body].join(' ') : ''));
export const ocultos = (S: IEscrituraDatos): any[] => motor().MT.detectarActos(textoDoc(S), S.materia, { tipo: S.tramite === 'escritura' ? 'escritura' : 'otro' });
export const actosCobro = (S: IEscrituraDatos): string[] => {
  const { MT } = motor();
  return [...new Set([
    ...ocultos(S).filter((x) => x.cobra && !S.descartados.has(x.value)).map((x) => x.value as string),
    ...S.agregados.filter((x) => x.value && MT.BY[x.value] && x.value !== S.materia).map((x) => x.value as string),
  ])];
};
export const tarifaTexto = (x: any) => { const { MT } = motor(); const t = MT.tarifaDe(x); return t.tipo === 'fija' ? MT.clp(t.monto) : t.tipo === 'hoja' ? `${MT.clp(t.base)} + ${MT.clp(t.porHoja)}/hoja` : 'por cotizar'; };
export const asistentes = (S: IEscrituraDatos): any[] => (S.a?.comparecientes || []).map((c: any) => ({ ...c, asiste: !c.representadoPor, motivo: c.representadoPor ? `Representado por ${c.representadoPor}: firma su representante.` : c.representa ? `Firma por sí y en representación de ${c.representa}.` : 'Debe concurrir a firmar.' }));
export const observaciones = (S: IEscrituraDatos): any[] => (esPrivado(S) ? S.proto.info?.alertas : S.a?.alerts) || [];

// ---- la notaría elegida → datos para la comparecencia, el membrete y la carátula (repertorio y fecha los pone la notaría)
export function notariaDatos(S: IEscrituraDatos) {
  const n = S.notaria; if (!n || 'auto' in n) return null;
  return { nombre: n.notario, suplente: !n.titular, titular: n.titularDe || '', numero: n.numero, ordinal: n.ordinal, ciudad: n.ciudad, direccion: n.direccion };
}
export const bloquesReduccion = (S: IEscrituraDatos) => motor().N.reduccionBlocks(S.proto.info, '', { red: S.red, cuerpo: S.redCuerpo, notaria: notariaDatos(S) });
export function bloquesEscritura(S: IEscrituraDatos) {
  const o = S.o!; const a = { ...S.a, title: o.titulo, parties: o.partes };
  return motor().N.buildEscritura(a, { notaria: notariaDatos(S), fecha: null, cierre: o.cierre, convertir: o.convertir });
}
export function textoCaratula(S: IEscrituraDatos): string {
  const d = S.proto.d!;
  return motor().N.caratulaTexto({ ...d, requirente: '', fecha: null, fechaFirma: deIso(d.fechaFirma), documentos: S.proto.docs, hojas: totalHojas(S) }, notariaDatos(S));
}
export const datosCaratula = (S: IEscrituraDatos) => ({ ...S.proto.d!, requirente: '', texto: textoCaratula(S) });
// la vista previa cambia cuando cambia cualquiera de estos datos
export const clavePrevia = (S: IEscrituraDatos) => (esPrivado(S) ? JSON.stringify([S.tramite, S.proto.d?.titulo, S.tramite === 'protocolizacion' ? textoCaratula(S) : '', S.proto.docs.length, S.redCuerpo]) : JSON.stringify([S.raw, S.o])) + (S.notaria ? ('id' in S.notaria ? S.notaria.id : 'auto') : '');

// ---- pago
export function cotizacion(S: IEscrituraDatos): ICotizacion {
  const { MT } = motor();
  const hojas = esPrivado(S) ? totalHojas(S) : (S.hojasEsc || 1);
  return MT.cotizar({ tramite: S.tramite, materia: S.materia, actos: S.tramite === 'escritura' ? actosCobro(S).map((v) => MT.BY[v]).filter(Boolean) : [], hojas });
}
export function faltantes(S: IEscrituraDatos): string[] {
  const out: string[] = [];
  if (!S.notaria) out.push('elegir la notaría');
  if (esPrivado(S)) {
    const d = S.proto.d!; if (!correoOk(d.email)) out.push('tu correo de contacto');
    if (S.tramite === 'reduccion') { if (!telOk(d.tel)) out.push('tu teléfono'); if (!d.declara) out.push('declarar que el documento está firmado y que llevarás el original'); }
    return out;
  }
  const sin = asistentes(S).filter((c) => c.asiste).filter((c) => { const ct = S.contactos[c.nombre] || {}; return !correoOk(ct.email) || !telOk(ct.tel); });
  if (sin.length) out.push(sin.length === 1 ? `correo y teléfono de ${sin[0].nombre}` : `correo y teléfono de ${sin.length} comparecientes`);
  return out;
}

// La ficha del trámite que recibe la notaría (va como «Ficha del trámite.json»)
export function fichaTramite(S: IEscrituraDatos, q: ICotizacion) {
  const { N, MT } = motor();
  const priv = esPrivado(S); const top = S.sug[0]; const info = S.proto.info; const n = S.notaria;
  return {
    tramite: S.tramite, materia: S.materia, materiaLabel: MT.BY[S.materia || '']?.label, materiaAutomatica: top?.value === S.materia, confianza: top?.value === S.materia ? top.confianza : 'elegida por el cliente',
    actos: S.tramite === 'escritura' ? actosCobro(S) : [],
    materiasOcultas: ocultos(S).map((x) => ({ codigo: x.value, nombre: x.nombre, clausula: x.clausula, cita: x.cita, principal: x.principal, cobrado: S.tramite === 'escritura' && x.cobra && !S.descartados.has(x.value), descartadoPorCliente: S.descartados.has(x.value) })),
    hojas: priv ? totalHojas(S) : S.hojasEsc, cobro: q.lineas, total: q.total, totalTexto: MT.clp(q.total), cotizacion: q.cotizacion,
    actosAgregadosPorCliente: S.agregados.map((x) => ({ codigo: x.value, nombre: x.nombre, frase: x.frase, cobrado: S.tramite === 'escritura' && !!x.value && actosCobro(S).includes(x.value) })),
    titulo: priv ? S.proto.d!.titulo : S.o!.titulo, partes: priv ? S.proto.d!.partes : S.o!.partes,
    comparecientes: priv ? [] : asistentes(S).map((c) => ({ nombre: c.nombre, rut: c.rut ? N.fmtRut(c.rut, c.dv) : null, rutValido: c.rutOk, estadoCivil: c.estadoCivil, profesion: c.profesion, domicilio: c.domicilio, calidad: c.calidad, representa: c.representa || null, representadoPor: c.representadoPor || null, asiste: c.asiste, ...(S.contactos[c.nombre] || {}) })),
    documentoPrivado: priv ? {
      titulo: info.titulo, descripcion: S.proto.d!.descripcion, hojas: totalHojas(S),
      archivos: S.proto.docs.map((x) => ({ nombre: x.name, hojas: x.pages, lectura: origenDoc(x), ...(x.ia ? { ia: usoIA(x) } : {}) })),
      leidoConIA: !!info.ia, participantes: info.participantes, firmasElectronicas: info.firmas.electronicas.map((f: any) => ({ nombre: f.nombre, fecha: fechaIso(f.fecha) })), lineasDeFirma: info.firmas.lineas,
      fechaDocumento: fechaIso(info.fechaDocumento), patente: info.patente, requirente: null, declaracionOriginalFirmado: S.tramite === 'reduccion' ? !!S.proto.d!.declara : undefined,
    } : null,
    contacto: priv ? { email: S.proto.d!.email, telefono: S.proto.d!.tel, nota: S.proto.d!.nota } : null,
    observaciones: observaciones(S).filter((x) => x.sev !== 'info').map((x) => ({ nivel: x.sev, texto: x.text })),
    notaria: n ? ('auto' in n ? { asignacion: 'automatica' } : { id: n.id, nombre: n.nombre, notario: n.notario, comuna: n.comuna, direccion: n.dirCorta || n.direccion, prueba: !!n.prueba }) : null,
    origen: 'PortalFirma Asset',
  };
}

// Caso para el aprendizaje de reglas: solo si el cliente corrigió algo de la detección automática
export function casoParaReglas(S: IEscrituraDatos) {
  const top = S.sug[0]; const desc = ocultos(S).filter((x) => S.descartados.has(x.value));
  const cambio = !!top && top.value !== S.materia;
  if (!cambio && !desc.length && !S.agregados.length) return null;
  const texto = textoDoc(S); let h = 0; for (let i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) | 0;
  return {
    clave: `${S.tramite}:${h}`, tramite: S.tramite, titulo: tituloDoc(S), materiaAuto: top?.value || null, materiaFinal: S.materia, confianza: top?.confianza || null,
    descartados: desc.map((x) => ({ codigo: x.value, nombre: x.nombre, cita: x.cita })), agregados: S.agregados.map((x) => ({ codigo: x.value, nombre: x.nombre, frase: x.frase })), texto,
  };
}

// ¿La frase está en el documento? (para agregar un acto que no se detectó)
export const fraseEnDocumento = (S: IEscrituraDatos, frase: string) => { const { MT } = motor(); return MT.fold(textoDoc(S)).replace(/\s+/g, ' ').includes(MT.fold(frase)); };
