// Herramientas de FIRMAS, PLANTILLAS de la Notaría virtual, BÚSQUEDA de documentos y SALDO del equipo, en el servidor (con la app cerrada).
//  · firmas_pendientes_detalle / seguimiento_firma: quién falta por firmar (lee la base y, si se pide una operación, Portalfirma en vivo).
//  · reenviar_firma: vuelve a mandar el enlace de firma a un firmante (API de integración de Portalfirma); dos pasos, escribe a un tercero.
//  · plantillas_notaria / formulario_plantilla / generar_documento_plantilla: las plantillas de la cuenta (MCP template_manage_tools).
//  · buscar_documento: archivos de una propiedad y documentos enviados a firmar.   · saldo: saldo de Portalfirma (MCP wallet).
// La revisión periódica de firmas (ronda.ts) es la que mueve los negocios al firmarse: aquí solo se la apura cuando se nota un cambio.
import { Injectable } from '@nestjs/common';
import type { Firma, Persona, Prisma, Propiedad } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ActividadService } from '../../comun/actividad.service';
import { rutValido } from '../../comun/texto';
import { AlmacenamientoService } from '../../archivos/almacenamiento.service';
import { PortalfirmaService } from '../../conexiones/portalfirma';
import { PortalfirmaApiService } from '../../conexiones/portalfirma-api';
import { FirmasRondaService, leerDetalle } from '../../firmas/ronda';
import { operacionDe } from '../../documentos/envio-firma';
import { norm } from '../comun';
import { AyudasHerramientas } from './ayudas';
import { Confirmaciones } from './confirmar';
import { ErrorDoc, hay, mensajeError, numero, tokenDe, txt, type Rec } from './docs-util';
import { esquema, type CtxHerr, type Herramienta, type ProveedorHerramientas } from './tipos';

const FINALES = ['firmado', 'anulado', 'rechazado', 'finalizada', 'cancelada'];
const DIAS_ATRASO = 3;
const CONSULTAS = ['contrato de arriendo de vivienda', 'promesa de compraventa bien raíz carta oferta', 'corretaje orden de visita acta de visita', 'acta de entrega y recepción de propiedad', 'poder mandato administración de propiedad arriendo'];
const FUERA = /veh[ií]culo|maquinaria|automotr/i;
const RESERVADO = 'Propietario (reservado)';

type Detalle = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- JSON de Portalfirma sin tipo
const nombreDe = (s: Detalle) => [s.name, s.paternalLastName, s.maternalLastName].filter(Boolean).join(' ') || String(s.fullName ?? '');
const dias = (d: Date) => Math.floor((Date.now() - d.getTime()) / 864e5);

// rol de cada grupo firmante de una plantilla y campo de persona de cada variable (lo mismo que hacía documentos.js de la app)
function rolDeGrupo(g: string) {
  const k = norm(g);
  if (/corredor|corredora|agente|inmobiliaria/.test(k)) return 'corredor';
  if (/codeudor|aval|fiador/.test(k)) return 'codeudor';
  if (/mandante|propietari|arrendador|vendedor|dueno|otorgante|promitente-vendedor/.test(k)) return 'propietario';
  if (/arrendatari|comprador|visitante|interesad|oferente|cliente|promitente-comprador|mandatari/.test(k)) return 'cliente';
  return null;
}
function campoPersona(v: Detalle) {
  const k = norm(`${v.name} ${v.label}`);
  if (/\brut\b|^rut/.test(k)) return 'rut';
  if (/correo|email|mail/.test(k)) return 'email';
  if (/telefono|fono|celular|movil/.test(k)) return 'telefono';
  if (/estado-civil|estado civil/.test(k)) return 'estadoCivil';
  if (/profesion|oficio/.test(k)) return 'profesion';
  if (/nacionalidad/.test(k)) return 'nacionalidad';
  if (/direcc|domicilio/.test(k)) return 'direccion';
  if (/razon|corredora|inmobiliaria/.test(k)) return 'razonSocial';
  if (/nombre/.test(k)) return 'nombre';
  return null;
}
const precioTxt = (v: unknown, m?: string | null) => (v == null || !Number(v) ? '' : m === 'CLP' || !m ? '$' + Number(v).toLocaleString('es-CL') : `${m} ${Number(v).toLocaleString('es-CL')}`);

@Injectable()
export class HerramientasFirmas implements ProveedorHerramientas {
  readonly herramientas: Herramienta[];
  private readonly conf = new Confirmaciones();

  constructor(
    private readonly db: PrismaService,
    private readonly ayudas: AyudasHerramientas,
    private readonly actividad: ActividadService,
    private readonly pf: PortalfirmaService,
    private readonly api: PortalfirmaApiService,
    private readonly ronda: FirmasRondaService,
    private readonly r2: AlmacenamientoService,
  ) {
    this.herramientas = this.definir();
  }

  // ================================================================== firmas
  /** las firmas que puede ver este usuario: el administrador, todas; el corredor, las que envió o las de sus negocios */
  private async visibles(c: CtxHerr, f: { propiedad?: unknown; negocio?: unknown; operacion?: unknown; todas?: boolean }): Promise<{ error: string } | { firmas: Firma[]; filtro: string }> {
    let propId: string | null = null;
    let negId: string | null = null;
    let filtro = 'de la corredora';
    if (hay(f.propiedad)) {
      const p = await this.ayudas.propiedad(c, f.propiedad);
      if (!p) return { error: `No encontré la propiedad «${txt(f.propiedad, 40)}».` };
      propId = p.id;
      filtro = `de la propiedad ${p.codigo}`;
    }
    if (hay(f.negocio)) {
      const r = await this.ayudas.negocio(c, f.negocio, false);
      if (!r.ok) return { error: r.error };
      negId = r.v.id;
      filtro = `del negocio ${(r.v.datos as Rec)?.codigo ?? r.v.id}`;
    }
    const op = hay(f.operacion) ? numero(f.operacion) : null;
    const misNegocios = c.admin ? [] : (await this.db.negocio.findMany({ where: { corredoraId: c.corredoraId, corredorId: c.usuarioId, eliminadoEn: null }, select: { id: true } })).map((n) => n.id);
    const firmas = await this.db.firma.findMany({
      where: {
        corredoraId: c.corredoraId,
        eliminadoEn: null,
        ...(op ? { operacion: op } : {}),
        ...(f.todas || op ? {} : { estado: { notIn: FINALES } }),
        ...(propId ? { propiedadIds: { has: propId } } : {}),
        ...(negId ? { negocioId: negId } : {}),
        ...(c.admin ? {} : { OR: [{ enviadoPorId: c.usuarioId }, ...(misNegocios.length ? [{ negocioId: { in: misNegocios } }] : [])] }),
      },
      orderBy: { enviadoEn: 'desc' },
      take: 30,
    });
    return { firmas, filtro };
  }

  /** los dueños de propiedades que este usuario no captó: sus datos no se muestran (igual que en la app) */
  private async reservados(c: CtxHerr, firmas: Firma[]): Promise<{ personas: Set<string>; ruts: Set<string> }> {
    const out = { personas: new Set<string>(), ruts: new Set<string>() };
    if (c.admin) return out;
    const ids = [...new Set(firmas.flatMap((f) => f.propiedadIds))].filter((x) => /^[0-9a-f-]{36}$/i.test(x));
    if (!ids.length) return out;
    const props = await this.db.propiedad.findMany({
      where: { corredoraId: c.corredoraId, id: { in: ids }, NOT: { captadorId: c.usuarioId } },
      select: { vinculos: { where: { rol: 'propietario' }, select: { persona: { select: { id: true, rut: true } } } } },
    });
    for (const p of props) for (const v of p.vinculos) { out.personas.add(v.persona.id); if (v.persona.rut) out.ruts.add(v.persona.rut); }
    return out;
  }

  private async pendientes(c: CtxHerr, a: Rec): Promise<Rec> {
    try {
      const r = await this.visibles(c, a);
      if ('error' in r) return r;
      const res = await this.reservados(c, r.firmas);
      const l = r.firmas.map((f) => {
        const firm = (Array.isArray(f.firmantes) ? f.firmantes : []) as Rec[];
        const ocultos = (x: Rec) => (!!x.personaId && res.personas.has(String(x.personaId))) || res.ruts.has(String(x.rut ?? '').replace(/[^0-9kK]/g, '').toUpperCase());
        const faltan = firm.filter((x) => !x.firmo && !x.signed).map((x) => ({ nombre: ocultos(x) ? RESERVADO : txt(x.nombre), ...(x.rol || x.calidad ? { calidad: txt(x.rol ?? x.calidad) } : {}) }));
        const d = dias(f.enviadoEn);
        return {
          operacion: f.operacion,
          documento: f.documento,
          estado: f.estado,
          firmaron: `${f.firmados} de ${f.total}`,
          enviadoHaceDias: d,
          atrasada: !FINALES.includes(f.estado) && d >= DIAS_ATRASO,
          faltan,
        };
      });
      const en = l.filter((x) => !FINALES.includes(x.estado));
      return {
        ok: true,
        filtro: r.filtro,
        total: l.length,
        atrasadas: l.filter((x) => x.atrasada).length,
        firmas: l,
        indicacion: !l.length
          ? `No hay documentos en firma ${r.filtro}.`
          : en.some((x) => x.atrasada)
            ? `Hay firmas de hace ${DIAS_ATRASO} días o más: ofrece reenviar el enlace (reenviar_firma). Para ver el detalle en vivo de una operación (correo y celular de quien falta) usa seguimiento_firma. Si un correo o celular estaba malo, un proceso ya enviado no se puede corregir: hay que enviarlo de nuevo.`
            : 'Para ver el detalle en vivo de una operación usa seguimiento_firma.',
      };
    } catch (e) {
      return { error: mensajeError(e) };
    }
  }

  private async seguimiento(c: CtxHerr, a: Rec): Promise<Rec> {
    try {
      const r = await this.visibles(c, { ...a, todas: true });
      if ('error' in r) return r;
      if (!hay(a.operacion) && !hay(a.propiedad) && !hay(a.negocio)) return { error: 'Indica el número de operación, el negocio o la propiedad.' };
      const lista = (hay(a.operacion) ? r.firmas : r.firmas.filter((f) => !FINALES.includes(f.estado))).filter((f) => f.operacion).slice(0, 5);
      if (!lista.length) return { error: hay(a.operacion) ? `No encontré la operación ${txt(a.operacion, 20)} entre las que enviaste.` : `No hay documentos en firma ${r.filtro}.` };
      const res = await this.reservados(c, lista);
      const out: Rec[] = [];
      let cambio = false;
      for (const f of lista) {
        try {
          const raw = (await this.api.detallePorOperacion(c.corredoraId, f.operacion!)) as Detalle;
          const previos = (Array.isArray(f.firmantes) ? f.firmantes : []) as Record<string, unknown>[];
          const d = leerDetalle(raw, previos);
          if (d.estado !== f.estado || d.firmados !== f.firmados) cambio = true;
          const sigs = (raw.signatories as Detalle[]) ?? [];
          out.push({
            operacion: f.operacion,
            documento: f.documento,
            estado: { firmado: 'Firmado por todos', pendiente_pago: 'Pendiente de pago', en_firma: 'En firma', anulado: 'Anulada' }[d.estado] ?? d.estado,
            firmaron: `${d.firmados} de ${d.total}`,
            legalizado: d.legalizado,
            enviadoHaceDias: dias(f.enviadoEn),
            firmantes: d.firmantes.map((s, i) => {
              const prev = previos.find((x) => String(x.rut ?? '').replace(/[^0-9kK]/g, '').toUpperCase() === s.rut.replace(/[^0-9kK]/g, '').toUpperCase());
              const oculto = res.ruts.has(s.rut.replace(/[^0-9kK]/g, '').toUpperCase()) || (!!prev?.personaId && res.personas.has(String(prev.personaId)));
              return oculto
                ? { nombre: RESERVADO, firmo: s.firmo, ...(s.calidad ? { calidad: s.calidad } : {}) }
                : { nombre: s.nombre || nombreDe(sigs[i] ?? {}), calidad: s.calidad, firmo: s.firmo, ...(s.firmo ? {} : { correo: s.email || null, celular: s.telefono || null }) };
            }),
            faltan: d.firmantes.filter((s) => !s.firmo).map((s) => s.nombre),
          });
        } catch (e) {
          out.push({ operacion: f.operacion, documento: f.documento, error: mensajeError(e) });
        }
      }
      // si en Portalfirma hay algo nuevo, se apura la revisión que mueve el negocio (sin esperar la respuesta)
      if (cambio) void this.ronda.revisarCorredora(c.corredoraId, 30_000).catch(() => null);
      return { ok: true, filtro: r.filtro, operaciones: out, ...(cambio ? { aviso: 'Hubo cambios en Portalfirma: el negocio se actualiza solo en unos minutos.' } : {}) };
    } catch (e) {
      return { error: mensajeError(e) };
    }
  }

  /** vuelve a mandar el enlace de firma a quien aún no firma (dos pasos: escribe a un tercero) */
  private async reenviar(c: CtxHerr, a: Rec): Promise<Rec> {
    const HERR = 'reenviar_firma';
    if (a.confirmado !== true) this.conf.usar(c);
    try {
      const conf = a.confirmado === true;
      let args = a;
      if (conf) {
        const x = this.conf.exigir(c, HERR);
        if ('error' in x) return x;
        args = x.pend.args;
      }
      if (!hay(args.operacion)) return { error: 'Falta el número de operación (si no lo sabes, mira firmas_pendientes_detalle).' };
      if (!hay(args.firmante)) return { error: 'Falta indicar a quién (su nombre, RUT o su calidad: arrendatario, propietario…).' };
      const v = await this.visibles(c, { operacion: args.operacion });
      if ('error' in v) return v;
      const f = v.firmas[0];
      if (!f?.operacion) return { error: `No encontré la operación ${txt(args.operacion, 20)} entre las que enviaste.` };
      if (FINALES.includes(f.estado)) return { error: `La operación ${f.operacion} ya está ${f.estado === 'firmado' ? 'firmada por todos' : f.estado}: no hay enlace que reenviar.` };
      const res = await this.reservados(c, [f]);
      const raw = (await this.api.detallePorOperacion(c.corredoraId, f.operacion)) as Detalle;
      if (!raw?.processId) return { error: 'Portalfirma no informó el identificador de la operación: no puedo reenviar el enlace.' };
      const sigs = ((raw.signatories as Detalle[]) ?? []).filter((s) => !s.signed);
      const q = norm(args.firmante);
      const rutQ = q.replace(/[^0-9k]/g, '');
      const toks = q.split(/\s+/).filter((t) => t.length > 1);
      const cand = sigs.filter((s) => (rutQ.length > 6 && String(s.rut ?? '').replace(/[^0-9kK]/g, '').toLowerCase() === rutQ) || norm(s.alias) === q || (toks.length > 0 && toks.every((t) => norm(`${nombreDe(s)} ${s.alias ?? ''}`).includes(t))));
      if (!cand.length) return { error: `No encuentro a «${txt(args.firmante, 60)}» entre quienes faltan por firmar en la operación ${f.operacion}: ${sigs.map((s) => `${nombreDe(s)}${s.alias ? ' (' + s.alias + ')' : ''}`).join(', ') || 'nadie falta'}.` };
      if (cand.length > 1) return { error: `«${txt(args.firmante, 60)}» puede ser ${cand.map((s) => `${nombreDe(s)}${s.alias ? ' (' + s.alias + ')' : ''}`).join(' o ')}: pregúntale a cuál se refiere.` };
      const s = cand[0];
      const rutS = String(s.rut ?? '').replace(/[^0-9kK]/g, '').toUpperCase();
      if (res.ruts.has(rutS)) return { error: 'Ese firmante es el propietario de una propiedad que captó otro corredor: el reenvío lo hace quien la captó o un administrador.' };
      if (!s.id) return { error: 'Portalfirma no informó el identificador del firmante: no puedo reenviar el enlace.' };
      if (!s.email && !s.phone) return { error: `${nombreDe(s)} no tiene correo ni celular en Portalfirma: un proceso ya enviado no se puede corregir, hay que enviarlo de nuevo con el dato correcto.` };
      const resumen = { operacion: f.operacion, documento: f.documento, firmante: nombreDe(s), calidad: s.alias ?? null, correo: s.email || null, celular: s.phone || null };
      if (!conf) {
        this.conf.preparar(c, HERR, String(f.operacion), resumen, { ...args, operacion: f.operacion });
        return { ok: true, enviada: false, necesitaConfirmacion: true, ...resumen, indicacion: 'NO se reenvió nada todavía. Dile al corredor a quién se le vuelve a mandar el enlace de firma (Portalfirma lo manda por el correo o celular que tiene) y pregúntale si lo hago. Si dice que sí, llama reenviar_firma con confirmado: true.' };
      }
      const x = this.conf.exigir(c, HERR);
      if ('error' in x) return x;
      if (!this.conf.igual(x.pend, resumen)) return { error: 'Los datos cambiaron desde que se los mostraste al corredor: prepáralo de nuevo.' };
      this.conf.usar(c);
      await this.api.reenviarFirmante(c.corredoraId, String(raw.processId), String(s.id));
      await this.actividad.registrar({
        corredoraId: c.corredoraId,
        entidadTipo: f.negocioId ? 'negocio' : 'propiedad',
        entidadId: f.negocioId ?? f.propiedadIds[0] ?? f.id,
        ref2: f.negocioId ? (f.propiedadIds[0] ?? null) : null,
        texto: `Enlace de firma reenviado a ${nombreDe(s)} (operación ${f.operacion}, por WhatsApp)`,
        usuarioId: c.usuarioId,
      });
      return { ok: true, enviada: true, ...resumen, mensaje: `Portalfirma volvió a mandarle el enlace de firma a ${nombreDe(s)}.` };
    } catch (e) {
      return { error: mensajeError(e) };
    }
  }

  // ================================================================== saldo
  private async saldo(c: CtxHerr): Promise<Rec> {
    try {
      const r = await this.pf.llamar(tokenDe(c), 'wallet_manage_balance_tools', { action: 'get_balance' });
      const texto = (r.content ?? []).map((x) => x.text ?? '').join('\n').trim();
      if (r.isError) return { error: `Portalfirma no entregó el saldo: ${texto.slice(0, 200)}` };
      let j: Rec | null = null;
      try { j = JSON.parse(texto) as Rec; } catch { /* texto plano */ }
      const monto = j ? numero(j.amount ?? j.balance ?? j.saldo) : numero(texto);
      if (monto == null) return { error: 'Portalfirma respondió, pero no pude leer el saldo.' };
      return { ok: true, saldo: monto, saldoTexto: `$${monto.toLocaleString('es-CL')}`, mensaje: `El saldo de Portalfirma es $${monto.toLocaleString('es-CL')}.` };
    } catch (e) {
      return { error: `No pude consultar el saldo de Portalfirma desde el servidor: ${mensajeError(e)}. Revísalo en Portalfirma (Billetera).` };
    }
  }

  // ================================================================== plantillas de la Notaría virtual
  private async mcp(c: CtxHerr, args: Rec): Promise<{ texto: string; error: boolean }> {
    try {
      const r = await this.pf.llamar(tokenDe(c), 'template_manage_tools', args);
      return { texto: (r.content ?? []).map((x) => x.text ?? '').join('\n').trim(), error: !!r.isError };
    } catch (e) {
      throw new ErrorDoc(`No pude hablar con la Notaría virtual de Portalfirma: ${mensajeError(e)} (el administrador conecta Portalfirma en Asset › Integraciones).`);
    }
  }
  private json(t: { texto: string; error: boolean }): unknown {
    if (t.error) throw new ErrorDoc(`Portalfirma: ${t.texto.slice(0, 240)}`);
    try { return JSON.parse(t.texto); } catch { return null; }
  }
  private async buscarPlantillas(c: CtxHerr, q: string, k = 10) {
    const j = this.json(await this.mcp(c, { action: 'search', query: q, top_k: k })) as Detalle[] | { results?: Detalle[] } | null;
    return (Array.isArray(j) ? j : j?.results ?? []).filter((t) => t.template_version_id && !FUERA.test(`${t.name} ${t.description ?? ''}`));
  }
  private corta = (t: Detalle) => ({ id: String(t.template_version_id), nombre: String(t.name ?? '').trim(), descripcion: String(t.description ?? '').replace(/\s+/g, ' ').slice(0, 160) });

  private async plantillas(c: CtxHerr, a: Rec): Promise<Rec> {
    try {
      let l: Detalle[];
      if (hay(a.texto) && txt(a.texto).length > 1) l = await this.buscarPlantillas(c, txt(a.texto, 120), 12);
      else {
        let todas: Detalle[] | null = null;
        try {
          const j = this.json(await this.mcp(c, { action: 'list' })) as Detalle[] | { data?: Detalle[]; results?: Detalle[]; templates?: Detalle[] } | null;
          const x = Array.isArray(j) ? j : j?.data ?? j?.results ?? j?.templates ?? [];
          todas = x.filter((t) => t.template_version_id && !FUERA.test(`${t.name} ${t.description ?? ''}`));
          if (!todas.length) todas = null;
        } catch { todas = null; }
        if (!todas) {
          const rs = await Promise.all(CONSULTAS.map((q) => this.buscarPlantillas(c, q, 10).catch(() => [] as Detalle[])));
          const vistos = new Map<string, Detalle>();
          for (const r of rs) for (const t of r) if (!vistos.has(String(t.template_version_id))) vistos.set(String(t.template_version_id), t);
          todas = [...vistos.values()];
        }
        l = todas;
        const p = hay(a.propiedad) ? await this.ayudas.propiedad(c, a.propiedad) : null;
        if (p) {
          const puntaje = (t: Detalle) => {
            const n = norm(t.name);
            let s = 0;
            if (p.arriendo && /arriendo|entrega/.test(n)) s += 2;
            if (p.venta && /compraventa|promesa|oferta/.test(n)) s += 2;
            if (/visita|corretaje/.test(n)) s += 1;
            return s;
          };
          l = [...l].sort((x, y) => puntaje(y) - puntaje(x));
        }
      }
      return { ok: true, total: l.length, plantillas: l.slice(0, 15).map(this.corta), indicacion: l.length ? 'Para llenar una usa formulario_plantilla con su id; muéstrale al corredor solo los nombres.' : 'No hay plantillas con ese nombre en la cuenta.' };
    } catch (e) {
      return { error: mensajeError(e) };
    }
  }

  /** el formulario de la plantilla, prellenado con la propiedad, las personas y el corredor */
  private async formulario(c: CtxHerr, a: Rec, valores: Rec) {
    if (!hay(a.plantilla)) throw new ErrorDoc('Falta la plantilla (su id: usa plantillas_notaria).');
    const p: Propiedad | null = hay(a.propiedad) ? await this.ayudas.propiedad(c, a.propiedad) : null;
    if (hay(a.propiedad) && !p) throw new ErrorDoc(`No encontré la propiedad «${txt(a.propiedad, 40)}».`);
    let negocio = null as Awaited<ReturnType<AyudasHerramientas['negocio']>> | null;
    if (hay(a.negocio)) {
      negocio = await this.ayudas.negocio(c, a.negocio);
      if (!negocio.ok) throw new ErrorDoc(negocio.error);
    }
    const prop = p ?? (negocio?.ok && negocio.v.propiedadId ? await this.db.propiedad.findFirst({ where: { id: negocio.v.propiedadId, corredoraId: c.corredoraId } }) : null);
    const veDuenos = c.admin || !prop || prop.captadorId === c.usuarioId;
    const pfId = prop?.origenSistema === 'portalfirma' ? prop.origenId : null;
    let t = await this.mcp(c, { action: 'get_forms', template_version_id: txt(a.plantilla, 80), ...(pfId ? { property_id: pfId } : {}) });
    if (pfId && (t.error || !/^\s*[[{]/.test(t.texto))) t = await this.mcp(c, { action: 'get_forms', template_version_id: txt(a.plantilla, 80) });
    const f = this.json(t) as Detalle | null;
    if (!f?.groups) throw new ErrorDoc(`Portalfirma no devolvió el formulario de la plantilla${t.texto ? ': «' + t.texto.slice(0, 200) + '»' : ''}.`);
    const nombrePlantilla = String(f.name ?? '');
    const op = /arriendo|arrendamiento|entrega y recepcion/.test(norm(nombrePlantilla)) ? 'arriendo' : /compraventa|promesa|carta oferta|venta/.test(norm(nombrePlantilla)) ? 'venta' : prop?.arriendo && !prop?.venta ? 'arriendo' : 'venta';
    // personas sugeridas por rol (de la propiedad y el negocio)
    const vinculos = prop ? await this.db.propiedadPersona.findMany({ where: { propiedadId: prop.id } }) : [];
    const por = (roles: string[]) => vinculos.filter((x) => roles.includes(x.rol)).map((x) => x.personaId);
    const sug: Record<string, string | null> = {
      propietario: por(['propietario'])[0] ?? null,
      cliente: (negocio?.ok ? negocio.v.clienteId : null) ?? por(['arrendatario', 'comprador'])[0] ?? por(['interesado']).slice(-1)[0] ?? null,
      codeudor: por(['codeudor'])[0] ?? null,
    };
    const usuario = await this.db.usuario.findUnique({ where: { id: c.usuarioId } });
    const pedidas = (a.personas ?? {}) as Rec;
    const resolverPersona = async (ref: unknown): Promise<Persona | null> => {
      if (!hay(ref)) return null;
      const r = await this.ayudas.persona(c, ref);
      if (!r.ok) throw new ErrorDoc(r.error);
      return r.v;
    };
    const grupos: { grupo: string; rol: string | null; persona: Persona | null; firmante: boolean; campos: { id: string; etiqueta: string; requerido: boolean; valor: string; campo: string | null }[] }[] = [];
    for (const g of f.groups as Detalle[]) {
      const tieneFirmante = g.type === 'signer' || ((g.variables ?? []) as Detalle[]).some((v) => v.type === 'signer');
      const rol = tieneFirmante ? rolDeGrupo(String(g.group)) : null;
      let per: Persona | null = null;
      if (tieneFirmante && rol && rol !== 'corredor') {
        per = hay(pedidas[g.group]) ? await resolverPersona(pedidas[g.group]) : sug[rol] ? await this.db.persona.findFirst({ where: { id: sug[rol]!, corredoraId: c.corredoraId, eliminadoEn: null } }) : null;
        if (per && rol === 'propietario' && !veDuenos) per = null; // datos del propietario de una propiedad ajena: no se usan
      }
      const campos = ((g.variables ?? []) as Detalle[]).map((v) => {
        let val = '';
        const k = norm(`${v.name} ${v.label}`);
        const cp = tieneFirmante ? campoPersona(v) : null;
        if (tieneFirmante) {
          if (rol === 'corredor') val = cp === 'nombre' ? usuario?.nombre ?? '' : cp === 'email' ? usuario?.email ?? '' : cp === 'telefono' ? usuario?.telefono ?? '' : '';
          else if (per && cp) val = cp === 'nombre' ? per.nombre : cp === 'rut' ? per.rutFormato ?? per.rut ?? '' : String((per as unknown as Rec)[cp] ?? '');
          if (!val && /fecha/.test(norm(v.name))) val = new Date().toISOString().slice(0, 10);
        } else if (/fecha/.test(k)) val = new Date().toISOString().slice(0, 10);
        else if (prop) {
          if (/corredor/.test(k)) val = /mail|correo/.test(k) ? usuario?.email ?? '' : /telefono|fono|celular/.test(k) ? usuario?.telefono ?? '' : /nombre/.test(k) ? usuario?.nombre ?? '' : '';
          else if (/ciudad/.test(k)) val = prop.comuna ? 'Santiago' : 'Santiago';
          else if (/comuna/.test(k)) val = prop.comuna ?? '';
          else if (/region/.test(k)) val = prop.region ?? '';
          else if (/\brol\b|rol-de|avaluo/.test(k)) val = prop.rol ?? '';
          else if (/codigo/.test(k)) val = prop.codigo;
          else if (/tipo-de-gestion|operacion|gestion/.test(k)) val = op;
          else if (/tipo-de-(inmueble|propiedad)|tipo de (inmueble|propiedad)|^tipo\b/.test(k)) val = String(prop.tipo).replace(/_/g, ' ');
          else if (/gastos-comunes|gastos comunes/.test(k)) val = prop.gastosComunes ? '$' + Number(prop.gastosComunes).toLocaleString('es-CL') : '';
          else if (/canon|renta|arriendo-mensual|monto-del-arriendo/.test(k)) val = precioTxt(prop.precioArriendo, prop.monedaArriendo);
          else if (/precio-venta|precio venta/.test(k)) val = precioTxt(prop.precioVenta, prop.monedaVenta) || precioTxt(prop.precioArriendo, prop.monedaArriendo);
          else if (/precio-arriendo|precio arriendo/.test(k)) val = precioTxt(prop.precioArriendo, prop.monedaArriendo) || precioTxt(prop.precioVenta, prop.monedaVenta);
          else if (/precio|valor-de-venta|valor/.test(k)) val = (op === 'arriendo' ? precioTxt(prop.precioArriendo, prop.monedaArriendo) : precioTxt(prop.precioVenta, prop.monedaVenta)) || precioTxt(prop.precioVenta ?? prop.precioArriendo, prop.monedaVenta ?? prop.monedaArriendo);
          else if (/superficie|m2|metros/.test(k)) val = prop.supTotal || prop.supUtil ? `${prop.supTotal || prop.supUtil} m²` : '';
          else if (/dormitorio/.test(k)) val = prop.dormitorios != null ? String(prop.dormitorios) : '';
          else if (/bano/.test(k)) val = prop.banos != null ? String(prop.banos) : '';
          else if (/estacionamiento/.test(k)) val = prop.estacionamientos != null ? String(prop.estacionamientos) : '';
          else if (/bodega/.test(k)) val = prop.bodegas != null ? String(prop.bodegas) : '';
          else if (/direcc|domicilio|ubicacion/.test(k)) val = [prop.direccion, prop.unidad ? 'depto. ' + prop.unidad : ''].filter(Boolean).join(', ');
        }
        const dado = valores[String(v.id)];
        return { id: String(v.id), etiqueta: String(v.label ?? v.name), requerido: !!v.required, valor: hay(dado) ? txt(dado, 1000) : val, campo: cp };
      });
      grupos.push({ grupo: String(g.group), rol, persona: per, firmante: tieneFirmante, campos });
    }
    const faltan = grupos.flatMap((g) => g.campos.filter((x) => x.requerido && !x.valor).map((x) => `${x.etiqueta} (${g.grupo.replace(/-/g, ' ')})`));
    // los RUT de los firmantes deben ser válidos
    for (const g of grupos) for (const x of g.campos) if (g.firmante && x.campo === 'rut' && x.valor && !rutValido(x.valor)) faltan.push(`RUT válido de ${g.grupo.replace(/-/g, ' ')} («${x.valor}»)`);
    return { f, nombre: nombrePlantilla, prop, negocio: negocio?.ok ? negocio.v : null, pfId, grupos, faltan, op };
  }

  private async verFormulario(c: CtxHerr, a: Rec): Promise<Rec> {
    try {
      const x = await this.formulario(c, a, (a.valores ?? {}) as Rec);
      return {
        ok: true,
        plantilla: x.nombre,
        propiedad: x.prop?.codigo ?? null,
        listo: !x.faltan.length,
        faltan: x.faltan,
        grupos: x.grupos.map((g) => ({
          grupo: g.grupo,
          rol: g.rol,
          persona: g.persona?.nombre ?? null,
          // lo que ya tiene (corto) y los ids de lo que falta: así la IA sabe qué pasar en «valores»
          completos: g.campos.filter((f) => f.valor).map((f) => `${f.etiqueta}: ${f.valor.slice(0, 60)}`).slice(0, 14),
          pendientes: g.campos.filter((f) => !f.valor).map((f) => ({ id: f.id, etiqueta: f.etiqueta, requerido: f.requerido })),
        })),
        indicacion: x.faltan.length
          ? 'Pídele al corredor SOLO lo que falta y pásalo en «valores» (id del campo → valor) a generar_documento_plantilla. Las personas se eligen en «personas» (grupo firmante → nombre o RUT del CRM).'
          : 'Está todo: llama generar_documento_plantilla para mostrarle el resumen y pedir su sí.',
      };
    } catch (e) {
      return { error: mensajeError(e) };
    }
  }

  private async generar(c: CtxHerr, a: Rec): Promise<Rec> {
    const HERR = 'generar_documento_plantilla';
    if (a.confirmado !== true) this.conf.usar(c);
    try {
      const conf = a.confirmado === true;
      let args = a;
      if (conf) {
        const p = this.conf.exigir(c, HERR);
        if ('error' in p) return p;
        args = p.pend.args;
      }
      const x = await this.formulario(c, args, (args.valores ?? {}) as Rec);
      const values: Rec = {};
      for (const g of x.grupos) for (const f of g.campos) if (f.valor) values[f.id] = f.valor;
      const firmantes = x.grupos.filter((g) => g.firmante && g.rol !== 'corredor').map((g) => {
        const val = (k: string) => g.campos.find((f) => f.campo === k)?.valor ?? '';
        return { grupo: g.grupo, nombre: val('nombre') || g.persona?.nombre || '', rut: val('rut'), email: val('email'), personaId: g.persona?.id ?? null };
      });
      const resumen = {
        plantilla: x.nombre,
        propiedad: x.prop?.codigo ?? null,
        negocio: x.negocio ? String((x.negocio.datos as Rec)?.codigo ?? x.negocio.id) : null,
        firmantes: firmantes.map((s) => `${s.grupo.replace(/-/g, ' ')}: ${s.nombre}${s.rut ? ' · ' + s.rut : ''}${s.email ? ' · ' + s.email : ''}`),
        datos: x.grupos.flatMap((g) => g.campos.filter((f) => f.valor && !g.firmante).map((f) => `${f.etiqueta}: ${f.valor.slice(0, 60)}`)).slice(0, 20),
      };
      if (x.faltan.length) return { ok: true, listo: false, ...resumen, faltan: x.faltan, indicacion: 'NO se generó nada. Pídele al corredor SOLO lo que falta y vuelve a llamar con «valores» (id del campo → valor) y «personas».' };
      if (!conf) {
        this.conf.preparar(c, HERR, x.f.template_version_id ? String(x.f.template_version_id) : txt(args.plantilla, 80), { resumen, values }, { ...args, confirmado: false });
        return { ok: true, listo: true, enviada: false, necesitaConfirmacion: true, ...resumen, indicacion: 'NO se generó ni se cobró. Muéstrale al corredor el documento, los firmantes y los datos y pregúntale si lo genero y envío a firmar (se cobra del saldo de Portalfirma y cada firmante recibe su enlace). Si dice que sí, llama generar_documento_plantilla con confirmado: true.' };
      }
      const p = this.conf.exigir(c, HERR);
      if ('error' in p) return p;
      if (!this.conf.igual(p.pend, { resumen, values })) return { error: 'Los datos cambiaron desde que se los mostraste al corredor: prepáralo de nuevo.' };
      this.conf.usar(c);
      const t = await this.mcp(c, { action: 'send_sign', template_version_id: txt(args.plantilla, 80), values, ...(x.pfId ? { property_id: x.pfId } : {}) });
      if (t.error) return { error: `Portalfirma no generó el documento: ${t.texto.slice(0, 240)}` };
      const op = operacionDe(t.texto);
      if (op) {
        const total = firmantes.length;
        await this.db.firma.upsert({
          where: { corredoraId_operacion: { corredoraId: c.corredoraId, operacion: op } },
          create: {
            id: `op${op}`,
            corredoraId: c.corredoraId,
            operacion: op,
            documento: x.nombre,
            origen: 'plantilla',
            estado: 'en_firma',
            propiedadIds: x.prop ? [x.prop.id] : [],
            negocioId: x.negocio?.id ?? null,
            enviadoPorId: c.usuarioId,
            total,
            firmantes: firmantes.map((s) => ({ nombre: s.nombre, rut: s.rut, rol: s.grupo, personaId: s.personaId, email: s.email, firmo: false })) as Prisma.InputJsonValue,
            datos: { plantillaId: txt(args.plantilla, 80), formato: 'plantilla_notaria' },
          },
          update: {},
        });
        const texto = `Documento «${x.nombre}» enviado a firmar (operación ${op}, por WhatsApp)`;
        await this.actividad.registrar([
          ...(x.prop ? [{ corredoraId: c.corredoraId, entidadTipo: 'propiedad' as const, entidadId: x.prop.id, ref2: x.negocio?.id ?? null, texto, usuarioId: c.usuarioId }] : []),
          ...(x.negocio ? [{ corredoraId: c.corredoraId, entidadTipo: 'negocio' as const, entidadId: x.negocio.id, ref2: x.prop?.id ?? null, texto, usuarioId: c.usuarioId }] : []),
        ]);
      }
      return { ok: true, enviada: true, operacion: op, plantilla: x.nombre, mensaje: op ? `«${x.nombre}» se envió a firmar (operación ${op}). Se cobró del saldo de Portalfirma.` : t.texto.slice(0, 300), ...(op ? {} : { aviso: 'Portalfirma no informó el número de operación: revísalo en «Mis operaciones».' }) };
    } catch (e) {
      return { error: mensajeError(e) };
    }
  }

  // ================================================================== buscar un documento
  private async buscarDocumento(c: CtxHerr, a: Rec): Promise<Rec> {
    try {
      if (!hay(a.documento)) return { error: 'Falta el nombre del documento que se busca (por ejemplo «mandato», «carta oferta», «contrato»).' };
      const q = norm(a.documento).split(/\s+/).filter((t) => t.length > 2);
      const coincide = (s: string) => !q.length || q.some((t) => norm(s).includes(t));
      let prop: Propiedad | null = null;
      if (hay(a.propiedad)) {
        prop = await this.ayudas.propiedad(c, a.propiedad);
        if (!prop) return { error: `No encontré la propiedad «${txt(a.propiedad, 40)}».` };
      }
      let negocio = null as { id: string; propiedadId: string | null } | null;
      if (hay(a.negocio)) {
        const r = await this.ayudas.negocio(c, a.negocio, false);
        if (!r.ok) return { error: r.error };
        negocio = r.v;
        if (!prop && r.v.propiedadId) prop = await this.db.propiedad.findFirst({ where: { id: r.v.propiedadId, corredoraId: c.corredoraId } });
      }
      if (!prop && !negocio) return { error: 'Indica la propiedad (código) o el negocio (NG-XXX) donde buscar.' };
      const ve = !prop || c.admin || prop.captadorId === c.usuarioId || !!negocio;
      const archivos: Rec[] = [];
      if (prop && ve) {
        const l = await this.db.propiedadDocumento.findMany({ where: { propiedadId: prop.id }, orderBy: { creadoEn: 'desc' }, take: 60 });
        for (const d of l.filter((x) => coincide(`${x.nombre} ${x.tipo}`)).slice(0, 8)) {
          const enlace = d.claveAlmacenamiento ? await this.r2.urlDescarga(d.claveAlmacenamiento, d.nombre, 24 * 3600).catch(() => null) : null;
          archivos.push({ nombre: d.nombre, tipo: d.tipo, subido: d.creadoEn.toISOString().slice(0, 10), ...(enlace ? { enlace } : {}) });
        }
      }
      // documentos enviados a firmar de esa propiedad o negocio
      const v = await this.visibles(c, { propiedad: negocio ? undefined : prop?.codigo, negocio: negocio?.id, todas: true });
      const firmas = 'error' in v ? [] : v.firmas.filter((f) => coincide(f.documento)).slice(0, 8);
      const firmasSal = [];
      for (const f of firmas) {
        let enlace: string | null = null;
        if (f.estado === 'firmado' && f.operacion) {
          try {
            const raw = (await this.api.detallePorOperacion(c.corredoraId, f.operacion)) as Detalle;
            if (raw?.processId) {
              const arch = await this.api.archivo(c.corredoraId, String(raw.processId));
              const clave = `c/${c.corredoraId}/vistas/${c.usuarioId}/firma-${f.operacion}.pdf`;
              await this.r2.subir(clave, Buffer.from(arch.base64, 'base64'), 'application/pdf');
              enlace = await this.r2.urlDescarga(clave, arch.nombre || `${f.documento}.pdf`, 24 * 3600);
            }
          } catch { /* sin enlace: igual se informa el estado */ }
        }
        firmasSal.push({ documento: f.documento, operacion: f.operacion, estado: f.estado, firmaron: `${f.firmados} de ${f.total}`, enviado: f.enviadoEn.toISOString().slice(0, 10), ...(enlace ? { enlaceFirmado: enlace } : {}) });
      }
      const hallado = archivos.length + firmasSal.length > 0;
      return {
        ok: true,
        propiedad: prop?.codigo ?? null,
        archivos,
        enviadosAFirmar: firmasSal,
        indicacion: hallado
          ? 'Dile al corredor lo que hay (los enlaces valen 24 horas). No generes nada.'
          : 'No hay un documento con ese nombre en la propiedad ni entre lo enviado a firmar. Ofrece armarlo: mandato (preparar_mandato), carta oferta, contrato, promesa, acta de entrega, o una plantilla de la Notaría virtual (plantillas_notaria). No lo generes sin que el corredor lo pida.',
      };
    } catch (e) {
      return { error: mensajeError(e) };
    }
  }

  // ================================================================== las herramientas
  private definir(): Herramienta[] {
    const REF_PROP = { type: 'string', description: 'código de la propiedad (CV-9001)' };
    const REF_NEG = { type: 'string', description: 'código del negocio (NG-014)' };
    const CONFIRMADO = { type: 'boolean', description: 'true SOLO después de que el corredor vio el resumen y dijo que sí' };
    return [
      {
        name: 'firmas_pendientes_detalle',
        description:
          'Los documentos enviados a firmar desde Asset que siguen en curso: operación, documento, quién falta (con su calidad: arrendador, mandante…), hace cuántos días y si está atrasada. Úsala para «¿qué falta por firmar?», «¿quién no ha firmado?». Se puede acotar a una propiedad o un negocio.',
        input_schema: esquema({ propiedad: REF_PROP, negocio: REF_NEG, todas: { type: 'boolean', description: 'incluir también las ya firmadas o anuladas' } }),
        ejecutar: (c, a) => this.pendientes(c, a),
      },
      {
        name: 'seguimiento_firma',
        description:
          'El estado EN VIVO de la firma de una operación en Portalfirma: quién firmó, quién falta (con su calidad, correo y celular) y si está legalizada. Pasa el número de operación o, si no lo sabes, el negocio o la propiedad (revisa las que siguen en curso).',
        input_schema: esquema({ operacion: { type: 'number', description: 'número de operación' }, negocio: REF_NEG, propiedad: REF_PROP }),
        ejecutar: (c, a) => this.seguimiento(c, a),
      },
      {
        name: 'reenviar_firma',
        description:
          'Reenvía el enlace de firma de Portalfirma a un firmante que aún no firma (Portalfirma lo manda por el correo o celular que tiene). Escribe a una persona: va en DOS pasos (sin confirmado dice a quién; con confirmado: true, solo tras el sí del corredor, lo reenvía). No puede corregir un correo malo de un proceso ya enviado.',
        input_schema: esquema({ operacion: { type: 'number', description: 'número de operación' }, firmante: { type: 'string', description: 'nombre, RUT o calidad del firmante (arrendatario, propietario…)' }, confirmado: CONFIRMADO }, ['operacion', 'firmante']),
        ejecutar: (c, a) => this.reenviar(c, a),
      },
      {
        name: 'saldo',
        description: 'El saldo de Portalfirma de la corredora (con él se pagan las firmas). Úsala si el corredor pregunta cuánto saldo queda o antes de enviar varios documentos.',
        input_schema: esquema({}),
        ejecutar: (c) => this.saldo(c),
      },
      {
        name: 'plantillas_notaria',
        description:
          'Lista las plantillas de documentos de la cuenta en la Notaría virtual de Portalfirma útiles para el rubro (arriendo, compraventa, promesa, corretaje, actas, mandatos). Con «texto» busca una en particular. Úsala cuando pidan un documento que no es uno de los de Asset (mandato, carta oferta, contrato de arriendo, promesa, escritura, acta de entrega).',
        input_schema: esquema({ texto: { type: 'string', description: 'qué documento se busca (opcional)' }, propiedad: REF_PROP }),
        ejecutar: (c, a) => this.plantillas(c, a),
      },
      {
        name: 'formulario_plantilla',
        description:
          'Arma el formulario de una plantilla de la Notaría virtual prellenado con la propiedad, las personas (propietario, arrendatario/comprador, codeudor) y los datos del corredor, y dice qué falta. Pídele al corredor SOLO lo que falta antes de generar.',
        input_schema: esquema({ plantilla: { type: 'string', description: 'id de la plantilla (de plantillas_notaria)' }, propiedad: REF_PROP, negocio: REF_NEG, personas: { type: 'object', description: 'grupo firmante → persona del CRM (nombre o RUT), p. ej. {"arrendatario":"Ana Rojas"}', additionalProperties: { type: 'string' } }, valores: { type: 'object', description: 'id del campo → valor, para probar lo que falta', additionalProperties: { type: 'string' } } }, ['plantilla']),
        ejecutar: (c, a) => this.verFormulario(c, a),
      },
      {
        name: 'generar_documento_plantilla',
        description:
          'Genera un documento desde una plantilla de la Notaría virtual con los datos de la propiedad y las personas y lo envía a firmar (cobra del saldo de Portalfirma). DOS pasos: sin confirmado llena el formulario y devuelve el resumen o lo que falta; con confirmado: true, solo tras el sí del corredor, lo genera. «valores» lleva solo los campos que faltaban o que el corredor quiere cambiar.',
        input_schema: esquema({ plantilla: { type: 'string', description: 'id de la plantilla' }, propiedad: REF_PROP, negocio: REF_NEG, personas: { type: 'object', description: 'grupo firmante → persona del CRM (nombre o RUT)', additionalProperties: { type: 'string' } }, valores: { type: 'object', description: 'id del campo → valor', additionalProperties: { type: 'string' } }, confirmado: CONFIRMADO }, ['plantilla']),
        ejecutar: (c, a) => this.generar(c, a),
      },
      {
        name: 'buscar_documento',
        description:
          'Busca un documento ya existente de una propiedad o un negocio por su nombre («mandato», «carta oferta», «contrato», «comprobante»): archivos guardados en la propiedad y documentos enviados a firmar (con el enlace del firmado). Úsala ANTES de armar un documento nuevo cuando pidan «el contrato de…» o «el mandato de…». No genera nada.',
        input_schema: esquema({ documento: { type: 'string', description: 'nombre del documento, como lo dijo el corredor' }, propiedad: REF_PROP, negocio: REF_NEG }, ['documento']),
        ejecutar: (c, a) => this.buscarDocumento(c, a),
      },
    ];
  }
}
