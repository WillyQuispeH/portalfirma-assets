// Asistente de postventa por WhatsApp, en el servidor (antes desktop/src/postventa.js › revisarWhatsApp, en el equipo
// que activaba la respuesta automática). Identifica al propietario (por su celular o su RUT), pregunta la unidad, pide
// la descripción y las fotos, y registra el reclamo con su folio (PV-0001…) y la garantía legal calculada; responde
// «estado» y la encuesta del 1 al 5. Usa las colecciones pv_* de la corredora (registros), las mismas que ve la app.
//  · Solo si la corredora tiene la respuesta automática encendida (pv_config › auto).
//  · La voz (trato, tono, emojis, firma…) es la configurada en Postventa › Asistente; si hay instrucciones propias, la
//    IA retoca el texto sin tocar folios, fechas ni palabras clave (si cambia algo de eso, o tarda, va el texto normal).
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-base-to-string, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return --
   los registros de postventa son JSON de la app y se leen campo a campo */
import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { IaService } from './ia';
import { EnviadosService } from './enviados';
import type { Conversacion, MensajeWa, Wechatia } from './wechatia';
import { norm, telNorm } from './comun';

type J = Record<string, any>;
const now = () => new Date().toISOString();
const uid = (p: string) => p + Date.now().toString(36) + randomBytes(2).toString('hex');
const cleanRut = (r: unknown) =>
  String(r ?? '')
    .replace(/[^0-9kK]/g, '')
    .toUpperCase();
const primer = (n: unknown) => {
  const x =
    String(n ?? '')
      .trim()
      .split(/\s+/)[0] || '';
  return x ? x[0].toUpperCase() + x.slice(1).toLowerCase() : '';
};

const ESTADO_TXT: Record<string, string> = {
  recibido: 'Recibido',
  triage: 'Por revisar',
  visita: 'Visita de diagnóstico',
  orden: 'Orden al contratista',
  reparacion: 'En reparación',
  validacion: 'Por validar',
  cerrado: 'Cerrado',
  no_procede: 'No procede',
};
const TIPOS: Record<string, [string, number, 'cbr' | 'dom']> = {
  terminacion: ['Terminaciones', 3, 'cbr'],
  instalacion: ['Instalaciones', 5, 'dom'],
  estructura: ['Estructura', 10, 'dom'],
  otro: ['Otro', 5, 'dom'],
};
const RECINTOS: [string, RegExp][] = [
  ['Baño', /bano|ducha|tina|wc|inodoro|lavamanos/],
  ['Cocina', /cocina|lavaplatos|encimera|campana|horno/],
  ['Dormitorio', /dormitorio|pieza|habitacion|closet/],
  ['Living-comedor', /living|comedor|estar/],
  ['Terraza', /terraza|balcon/],
  ['Logia', /logia|lavadero|calefont|termo/],
  ['Bodega', /bodega/],
  ['Estacionamiento', /estacionamiento/],
];
const REGLAS: [string, RegExp][] = [
  [
    'estructura',
    /grieta (en|de) (la )?(losa|viga|muro estructural|pilar|columna)|fisura estructural|estructura|losa|viga|pilar|asentamiento/,
  ],
  [
    'instalacion',
    /filtra|gotea|goteo|humedad|cañeria|caneria|agua|desague|desagüe|alcantarill|tapad|electric|enchufe|interruptor|luz|automatico|tablero|gas|calefont|termo|presion/,
  ],
  [
    'terminacion',
    /pintura|ceramic|porcelanato|piso|flotante|alfombra|puerta|chapa|bisagra|ventana|vidrio|sello|silicona|mueble|cajon|closet|zocalo|guardapolvo|quincalleria|grieta|fisura|desprend|mancha|rayad/,
  ],
];
const URGENTE =
  /filtracion activa|se esta filtrando|inunda|sin agua|sin luz|olor a gas|fuga de gas|cortocircuito|chispa/;
export function clasificar(texto: string) {
  const t = norm(texto);
  const tipo = (REGLAS.find(([, re]) => re.test(t)) || ['otro'])[0];
  const r = RECINTOS.find(([, re]) => re.test(t));
  return {
    tipo,
    recinto: r ? r[0] : null,
    urgente: URGENTE.test(t) || (/filtra|gotea|inunda/.test(t) && /ahora|activa|todavia|sigue/.test(t)),
  };
}
function garantia(unidad: J | null, tipo: string) {
  const [, anos, base] = TIPOS[tipo] || TIPOS.otro;
  const desde = base === 'cbr' ? unidad?.inscripcionCBR : unidad?.recepcionDOM;
  if (!desde) return { vigente: null as boolean | null, txt: '' };
  const v = new Date(desde + 'T12:00');
  v.setFullYear(v.getFullYear() + anos);
  const vence = v.toISOString().slice(0, 10);
  const vigente = new Date().toISOString().slice(0, 10) <= vence;
  return { vigente, txt: vigente ? `vigente hasta ${vence.split('-').reverse().join('/')}` : '' };
}
const PALABRAS_PV =
  /postventa|post venta|garantia|reclamo|falla|filtra|gotea|humedad|grieta|fisura|se rompio|no funciona|desprend|mancha|problema en mi (depto|departamento|casa)|reparacion/;
const PERSONA = {
  nombre: '',
  empresa: '',
  trato: 'tu',
  tono: 'neutro',
  emojis: false,
  largo: 'normal',
  horario: '',
  firma: '',
  instrucciones: '',
};
type Persona = typeof PERSONA;
const DATOS = /PV-\d+|\d{1,2}\/\d{1,2}\/\d{4}|\b\d{1,2}:\d{2}\b|«[^»]+»|\b\d\/5\b|^\d+\. .+$/gm;
const sinEsp = (x: string) => x.replace(/\s+/g, ' ').trim();

function voz(p: Persona) {
  const u = p.trato === 'usted';
  const T = (tu: string, ud: string) => (u ? ud : tu);
  const breve = p.largo === 'breve';
  const E = (x: string) => (p.emojis ? ' ' + x : '');
  const cap = (x: string) => x[0].toUpperCase() + x.slice(1);
  const h = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Santiago', hour: '2-digit', hourCycle: 'h23' }).format(
      new Date(),
    ),
  );
  const momento = h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
  const abre = (n: string, resto: string) =>
    p.tono === 'formal'
      ? `${momento}${n ? ', ' + n : ''}. ${cap(resto)}`
      : p.tono === 'cercano'
        ? `¡Hola${n ? ' ' + n : ''}!${E('👋')} ${cap(resto)}`
        : `Hola${n ? ' ' + n : ''}, ${resto}`;
  const soy = `soy ${p.nombre ? p.nombre + ', ' : 'el '}asistente de postventa${p.empresa ? ' de ' + p.empresa : ''}`;
  const gracias = p.tono === 'formal' ? 'Muchas gracias' : 'Gracias';
  const perfecto = ({ formal: 'Muy bien.', cercano: '¡Perfecto!' } as Record<string, string>)[p.tono] || 'Perfecto.';
  const fotos =
    T(
      '¿Puedes enviarme 1 a 3 fotos de la falla? Si no tienes, escribe «sin fotos».',
      '¿Puede enviarme 1 a 3 fotos de la falla? Si no tiene, escriba «sin fotos».',
    ) + E('📸');
  const cuenta =
    T('Cuéntame qué falla encontraste y en qué recinto', 'Cuénteme qué falla encontró y en qué recinto') +
    (breve ? '.' : ' (baño, cocina, dormitorio…).');
  const firma = (t: string) => t + (p.firma ? `\n\n${p.firma}` : '');
  return {
    estado: (lineas: string[]) =>
      lineas.length
        ? `${T('Tus', 'Sus')} solicitudes:\n${lineas.join('\n')}`
        : T(
            'No tienes solicitudes abiertas. Si quieres reportar algo, cuéntame qué pasó.',
            'No tiene solicitudes abiertas. Si quiere reportar algo, cuénteme qué pasó.',
          ),
    encuesta: (n: string, folio: string) =>
      `¡${gracias}! Registramos ${T('tu', 'su')} nota ${n}/5 para ${folio}.${E('🙏')}`,
    hola: (n: string, unidad: string, conDesc: boolean) =>
      abre(n, `${soy}. ${T('Veo tu unidad', 'Veo su unidad')} ${unidad}.`) +
      `\n${conDesc ? `${T('Recibí tu descripción.', 'Recibí su descripción.')} ${fotos}` : cuenta}`,
    holaElegir: (n: string, lista: string) =>
      abre(
        n,
        `${soy}. ${T('¿Sobre cuál de tus unidades es la solicitud?', '¿Sobre cuál de sus unidades es la solicitud?')}`,
      ) + `\n${lista}\n${T('Responde', 'Responda')} con el número.`,
    holaRut: () =>
      abre(
        '',
        `${soy}. ${T('Para encontrar tu vivienda, ¿me indicas el RUT del propietario?', 'Para encontrar su vivienda, ¿me indica el RUT del propietario?')}`,
      ),
    rutNoFotos: () =>
      `No encontré ese RUT en nuestras entregas. Igual registraremos ${T('tu', 'su')} solicitud y un ejecutivo la revisará. ${T('¿Puedes', '¿Puede')} enviarme 1 a 3 fotos y el proyecto y número de ${T('tu', 'su')} departamento? Si no ${T('tienes', 'tiene')} fotos, ${T('escribe', 'escriba')} «sin fotos».`,
    rutNoDesc: () =>
      `No encontré ese RUT en nuestras entregas. Igual registraremos ${T('tu', 'su')} solicitud y un ejecutivo la revisará: ${T('cuéntame qué falla encontraste', 'cuénteme qué falla encontró')}, en qué proyecto y número de departamento.`,
    rutOtra: () =>
      `No encontré ese RUT. ${T('Revísalo y escríbelo', 'Revíselo y escríbalo')} de nuevo (por ejemplo 12.345.678-5).`,
    rutOk: (n: string, unidad: string, conDesc: boolean) =>
      `${gracias} ${n}. Encontré ${T('tu', 'su')} unidad ${unidad}. ${conDesc ? `Ya tengo ${T('tu', 'su')} descripción. ${fotos}` : cuenta}`,
    rutVarias: (lista: string) =>
      `Encontré estas unidades a ${T('tu', 'su')} nombre:\n${lista}\n¿Sobre cuál es la solicitud? ${T('Responde', 'Responda')} con el número.`,
    elegirMal: () => `${T('Responde', 'Responda')} con el número de la lista, por favor.`,
    elegirOk: (conDesc: boolean) => `${perfecto} ${conDesc ? fotos : cuenta}`,
    describirCorto: () => `${T('Cuéntame', 'Cuénteme')} con un poco más de detalle qué pasó, por favor.`,
    describirConFotos: () =>
      `¡${gracias}! Recibí las fotos. ${T('¿Quieres', '¿Quiere')} agregar algo más? Si no, ${T('escribe', 'escriba')} «listo».`,
    describirPideFotos: () => `${gracias}. ${fotos}`,
    fotosRecibidas: () => `Recibí las fotos. ¿Algo más? Si no, ${T('escribe', 'escriba')} «listo».`,
    fotosAnotado: () =>
      `Anotado. ${T('¿Puedes', '¿Puede')} enviarme 1 a 3 fotos? Si no ${T('tienes', 'tiene')}, ${T('escribe', 'escriba')} «sin fotos».`,
    registrado: (o: { folio: string; unidad: string; tipo: string; garantia: string; urgente: boolean }) =>
      firma(
        `${p.tono === 'formal' ? 'Hemos registrado' : p.tono === 'cercano' ? '¡Listo! Registré' : 'Listo, registré'} ${T('tu', 'su')} solicitud ${o.folio}${o.unidad && !breve ? ' para ' + o.unidad : ''}.${E('✅')}\nTipo: ${o.tipo}${o.garantia ? ` (garantía ${o.garantia})` : ''}.\n${o.urgente ? 'La marcamos como urgente. ' : ''}${
          breve
            ? `${T('Te', 'Le')} escribiremos por aquí para agendar la visita. ${T('Escribe', 'Escriba')} «estado» para ver cómo va.`
            : `Un ejecutivo la revisará y ${T('te', 'le')} escribiremos por aquí para agendar la visita. Para saber cómo va, ${T('escribe', 'escriba')} «estado».`
        }${p.horario ? `\nHorario de atención: ${p.horario.replace(/\.$/, '')}.` : ''}`,
      ),
  };
}

/** lo de postventa de una corredora, leído una vez por ronda */
interface Datos {
  config: J;
  proyectos: J[];
  unidades: J[];
  reclamos: J[];
  chats: Map<string, J>;
}

@Injectable()
export class PostventaWaService {
  private readonly log = new Logger('PostventaWA');
  constructor(
    private readonly db: PrismaService,
    private readonly ia: IaService,
    private readonly enviados: EnviadosService,
  ) {}

  private async lista(corredoraId: string, coleccion: string) {
    const l = await this.db.registro.findMany({ where: { corredoraId, coleccion, eliminadoEn: null } });
    return l.map((r) => ({ ...((r.datos ?? {}) as J), id: r.id }));
  }

  /** lo de postventa de la corredora (null si la respuesta automática está apagada) */
  async cargar(corredoraId: string): Promise<Datos | null> {
    const cfg = await this.db.registro.findUnique({
      where: { corredoraId_coleccion_id: { corredoraId, coleccion: 'pv_config', id: 'config' } },
    });
    const config = (cfg?.datos ?? {}) as J;
    if (!config.auto || cfg?.eliminadoEn) return null;
    const [proyectos, unidades, reclamos, chats] = await Promise.all(
      ['pv_proyectos', 'pv_unidades', 'pv_reclamos', 'pv_chats'].map((c) => this.lista(corredoraId, c)),
    );
    return { config, proyectos, unidades, reclamos, chats: new Map(chats.map((c) => [c.id, c])) };
  }

  /** guarda un registro de postventa (la app lo ve al sincronizar) */
  private async guardar(corredoraId: string, coleccion: string, o: J) {
    const { id, ...datos } = o;
    for (const k of ['version', 'creado', 'actualizado']) delete datos[k];
    await this.db.registro.upsert({
      where: { corredoraId_coleccion_id: { corredoraId, coleccion, id } },
      create: { corredoraId, coleccion, id, datos: datos },
      update: { datos: datos, version: { increment: 1 }, eliminadoEn: null },
    });
  }

  private persona(d: Datos): Persona {
    const p = { ...PERSONA, ...(d.config.persona || {}) } as Persona;
    for (const k of ['nombre', 'empresa', 'horario', 'firma', 'instrucciones'] as const)
      p[k] = String(p[k] || '').trim();
    return p;
  }

  /** ¿esta conversación es de postventa en curso? (va antes que los demás asistentes) */
  enCurso(d: Datos, convId: string) {
    const c = d.chats.get(convId);
    if (!c?.pv) return false;
    if (!['nuevo', 'listo'].includes(c.paso)) return true;
    return d.reclamos.some((r) => r.chatId === convId && r.encuesta?.pendiente);
  }

  private async pulir(corredoraId: string, texto: string, p: Persona) {
    if (!p.instrucciones || !texto || !(await this.ia.disponible(corredoraId))) return { texto, ia: false };
    try {
      const sys = `Eres ${p.nombre || 'el asistente'} de postventa${p.empresa ? ' de ' + p.empresa : ''} y escribes por WhatsApp a propietarios de viviendas nuevas. Reescribe el mensaje que te paso siguiendo estas instrucciones del equipo:\n"""${p.instrucciones.slice(0, 1500)}"""\nReglas obligatorias: trata a la persona de ${p.trato === 'usted' ? 'usted' : 'tú'}; conserva EXACTAMENTE los folios (PV-…), fechas, horas, números de lista y las palabras entre « » (son las que la persona debe escribir); no inventes datos ni promesas; responde solo con el mensaje final, sin comillas.`;
      const out = (
        await this.ia.redactar({ corredoraId, uso: 'postventa', sistema: sys, usuario: texto, ms: 8000 })
      ).trim();
      const faltan = (texto.match(DATOS) || []).filter((x) => !sinEsp(out).includes(sinEsp(x)));
      if (!out || faltan.length || out.length > Math.max(400, texto.length * 2.5)) return { texto, ia: false };
      return { texto: out, ia: true };
    } catch {
      return { texto, ia: false };
    }
  }

  private nomUnidad(d: Datos, u: J | null) {
    if (!u) return 'Sin unidad';
    const p = d.proyectos.find((x) => x.id === u.proyectoId);
    return `${p?.nombre || 'Proyecto'} · ${u.torre ? 'Torre ' + u.torre + ' · ' : ''}${u.numero}`;
  }

  private async folio(corredoraId: string) {
    const [r] = await this.db.$queryRaw<{ valor: number }[]>`
      INSERT INTO contadores (corredora_id, serie, valor) VALUES (${corredoraId}::uuid, 'PV', 1)
      ON CONFLICT (corredora_id, serie) DO UPDATE SET valor = contadores.valor + 1
      RETURNING valor`;
    return `PV-${String(Number(r.valor)).padStart(4, '0')}`;
  }

  /** responde UN mensaje del propietario; devuelve el texto a enviar (o null si no es de postventa) */
  private async responder(corredoraId: string, d: Datos, chat: J, msg: MensajeWa): Promise<string | null> {
    const V = voz(this.persona(d));
    const t = norm(msg.texto);
    const fotos = msg.adjuntos;
    const s = chat.paso || 'nuevo';
    const unidad = (id: unknown) => d.unidades.find((u) => u.id === id) ?? null;
    const lista = (us: J[]) => us.map((u, i) => `${i + 1}. ${this.nomUnidad(d, u)}`).join('\n');
    if (/^estado\b|como va|mi solicitud/.test(t) && chat.unidadId) {
      const rs = d.reclamos.filter((r) => r.unidadId === chat.unidadId).slice(0, 3);
      return V.estado(rs.map((r) => `• ${r.folio}: ${ESTADO_TXT[r.estado] || r.estado}`));
    }
    const enc = d.reclamos.find((r) => r.chatId === chat.id && r.encuesta?.pendiente);
    if (enc && /^[1-5]$/.test(t)) {
      enc.encuesta = { nota: Number(t), fecha: now() };
      enc.historial = [{ fecha: now(), texto: `Encuesta: ${t}/5`, quien: 'Propietario' }, ...(enc.historial || [])];
      enc.actualizado = now();
      await this.guardar(corredoraId, 'pv_reclamos', enc);
      return V.encuesta(t, enc.folio);
    }
    const tel = telNorm(chat.telefono);
    const porTelefono = () => d.unidades.filter((u) => tel && telNorm(u.propietario?.telefono) === tel);
    const porRut = (rut: string) =>
      d.unidades.filter((u) => cleanRut(u.propietario?.rut) && cleanRut(u.propietario.rut) === cleanRut(rut));
    if (s === 'nuevo' || s === 'listo') {
      let us = porTelefono();
      if (!us.length && chat.unidadId && unidad(chat.unidadId)) us = [unidad(chat.unidadId)!];
      if (!us.length && !PALABRAS_PV.test(t)) return null; // no es postventa: lo atiende el equipo comercial
      chat.borrador = { texto: PALABRAS_PV.test(t) && t.length > 25 ? msg.texto : '', fotos: [...fotos] };
      if (us.length === 1) {
        chat.unidadId = us[0].id;
        chat.paso = chat.borrador.texto ? 'fotos' : 'describir';
        return V.hola(primer(us[0].propietario?.nombre), this.nomUnidad(d, us[0]), !!chat.borrador.texto);
      }
      if (us.length > 1) {
        chat.opciones = us.map((u) => u.id);
        chat.paso = 'elegir';
        return V.holaElegir(primer(us[0].propietario?.nombre), lista(us));
      }
      chat.paso = 'rut';
      return V.holaRut();
    }
    if (s === 'rut') {
      const us = porRut(msg.texto);
      if (!us.length) {
        chat.intentos = (chat.intentos || 0) + 1;
        if (chat.intentos >= 2) {
          chat.paso = chat.borrador?.texto ? 'fotos' : 'describir';
          chat.unidadId = null;
          return chat.paso === 'fotos' ? V.rutNoFotos() : V.rutNoDesc();
        }
        return V.rutOtra();
      }
      if (us.length === 1) {
        chat.unidadId = us[0].id;
        chat.paso = chat.borrador?.texto ? 'fotos' : 'describir';
        return V.rutOk(primer(us[0].propietario?.nombre), this.nomUnidad(d, us[0]), chat.paso === 'fotos');
      }
      chat.opciones = us.map((u) => u.id);
      chat.paso = 'elegir';
      return V.rutVarias(lista(us));
    }
    chat.borrador ||= { texto: '', fotos: [] };
    if (s === 'elegir') {
      const n = Number(t.replace(/\D/g, ''));
      const id = chat.opciones?.[n - 1];
      if (!id) return V.elegirMal();
      chat.unidadId = id;
      chat.paso = chat.borrador.texto ? 'fotos' : 'describir';
      return V.elegirOk(chat.paso === 'fotos');
    }
    if (s === 'describir') {
      if (fotos.length) chat.borrador.fotos.push(...fotos);
      if (t.length < 4 && !fotos.length) return V.describirCorto();
      if (t) chat.borrador.texto = [chat.borrador.texto, msg.texto].filter(Boolean).join('. ');
      chat.paso = 'fotos';
      return chat.borrador.fotos.length ? V.describirConFotos() : V.describirPideFotos();
    }
    if (s === 'fotos') {
      if (fotos.length) {
        chat.borrador.fotos.push(...fotos);
        if (!/listo|eso es todo|nada mas|enviar/.test(t)) return V.fotosRecibidas();
      } else if (!/sin fotos|no tengo|listo|eso es todo|nada mas|no$/.test(t)) {
        chat.borrador.texto = [chat.borrador.texto, msg.texto].filter(Boolean).join('. ');
        return V.fotosAnotado();
      }
      // el reclamo
      const c = clasificar(chat.borrador.texto);
      const u = unidad(chat.unidadId);
      const g = garantia(u, c.tipo);
      const r: J = {
        id: uid('r'),
        folio: await this.folio(corredoraId),
        unidadId: chat.unidadId ?? null,
        canal: 'whatsapp',
        contacto: { contactId: chat.contactId, nombre: chat.nombre, telefono: chat.telefono },
        chatId: chat.id,
        estado: 'triage',
        urgente: c.urgente,
        items: [
          {
            id: uid('i'),
            descripcion: chat.borrador.texto,
            recinto: c.recinto,
            tipo: c.tipo,
            fotos: chat.borrador.fotos,
            auto: true,
          },
        ],
        visitas: [],
        contratista: null,
        historial: [{ fecha: now(), texto: 'Reclamo recibido por WhatsApp', quien: 'Asset' }],
        creado: now(),
        actualizado: now(),
      };
      await this.guardar(corredoraId, 'pv_reclamos', r);
      d.reclamos.unshift(r);
      chat.paso = 'listo';
      chat.borrador = null;
      chat.ultimoReclamo = r.id;
      return V.registrado({
        folio: r.folio,
        unidad: u ? this.nomUnidad(d, u) : '',
        tipo: `${TIPOS[c.tipo]?.[0] || 'Otro'}${c.recinto ? ' · ' + c.recinto : ''}`,
        garantia: g.vigente === true ? g.txt : '',
        urgente: c.urgente,
      });
    }
    return null;
  }

  /**
   * Los mensajes nuevos de una conversación. Devuelve true si era de postventa (entonces nadie más la atiende);
   * false si no lo es (la atienden Sofía o Tomás).
   */
  async manejar(wa: Wechatia, corredoraId: string, d: Datos, cv: Conversacion, nuevos: MensajeWa[]) {
    const chat: J = d.chats.get(cv.id) ?? {
      id: cv.id,
      contactId: cv.contactId,
      telefono: cv.telefono || '',
      nombre: cv.nombre,
      paso: 'nuevo',
      desde: now(),
    };
    chat.contactId = cv.contactId || chat.contactId;
    chat.telefono = cv.telefono || chat.telefono;
    chat.nombre = cv.nombre || chat.nombre;
    let era = false;
    for (const m of nuevos) {
      const resp = await this.responder(corredoraId, d, chat, m);
      if (!resp && !chat.pv) continue;
      era = true;
      chat.pv = true;
      chat.actualizado = now();
      chat.mensajes = [...(chat.mensajes || []), { dir: 'in', texto: m.texto, fotos: m.adjuntos, fecha: m.fecha }];
      if (resp && chat.contactId) {
        const pr = await this.pulir(corredoraId, resp, this.persona(d));
        const r = await wa.enviarAContacto(chat.contactId, pr.texto);
        await this.enviados.registrar(corredoraId, chat.telefono, {
          messageId: r.messageId,
          texto: pr.texto,
          enHilo: false,
        });
        chat.mensajes.push({ dir: 'out', texto: pr.texto, fecha: now(), ...(pr.ia ? { ia: true } : {}) });
      }
      chat.mensajes = chat.mensajes.slice(-60);
    }
    if (era) {
      d.chats.set(chat.id, chat);
      await this.guardar(corredoraId, 'pv_chats', chat);
      d.config.ultimaRevision = now();
    }
    return era;
  }
}
