// Herramientas de DOCUMENTOS del equipo, en el servidor (el corredor las usa por WhatsApp con la app cerrada): mandatos de venta y de arriendo,
// carta oferta, contrato de arriendo (con su revisión y aprobación), promesa de compraventa, borrador de escritura, acta de entrega y el PDF del
// acta de visita. Cada herramienta es una capa delgada sobre los servicios que ya arman el PDF y lo envían a firmar (src/negocios/*.ts):
//   · preparar_X  guarda los datos que da el corredor (en su lugar: ficha, negocio o persona), valida, arma el PDF de vista previa (enlace de
//                 descarga) y devuelve el resumen y lo que FALTA; si está todo, deja anotado lo que se le mostró (confirmar.ts);
//   · enviar_X    sin `confirmado` hace lo mismo; con `confirmado: true` solo envía si lo mostrado es lo mismo y el corredor dijo «sí»
//                 (la confirmación la exige el servidor): cobra del saldo de Portalfirma y registra la firma ligada al negocio.
// Firmas (seguimiento, reenvío), plantillas de la Notaría virtual y saldo: documentos-firmas.ts. Convenciones: LEEME.md.
import { Injectable } from '@nestjs/common';
import type { Negocio, Persona, Prisma, Propiedad } from '@prisma/client';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { PrismaService } from '../../prisma/prisma.service';
import { ActividadService } from '../../comun/actividad.service';
import { igualJson } from '../../comun/asignados';
import { normalizar, rutValido, formatearRut } from '../../comun/texto';
import { AlmacenamientoService } from '../../archivos/almacenamiento.service';
import { PersonasService } from '../../personas/personas.service';
import { MandatoVentaService } from '../../negocios/mandato-venta';
import { MandatoArriendoService } from '../../negocios/mandato-arriendo';
import { CartaOfertaService } from '../../negocios/carta-oferta';
import { ContratoArriendoService } from '../../negocios/contrato-arriendo';
import { PromesaCompraventaService } from '../../negocios/promesa-compraventa';
import { EscrituraCompraventaService } from '../../negocios/escritura-compraventa';
import { ActaEntregaService } from '../../negocios/acta-entrega';
import { FOTOS_POR_ESPACIO, MEDIDORES, faltaEnEntrega, type EntregaDatos } from '../../negocios/acta-entrega-datos';
import { ActaPdfService } from '../acta-pdf';
import { EnviadosService } from '../enviados';
import { norm } from '../comun';
import { AyudasHerramientas, pesos, ddmmaaaa } from './ayudas';
import { Confirmaciones } from './confirmar';
import { HerramientasFirmas } from './documentos-firmas';
import {
  ErrorDoc,
  emailOk,
  fechaEntrada,
  hay,
  mensajeError,
  numero,
  opcion,
  positivo,
  primerNombre,
  siNo,
  telefonoOk,
  tokenDe,
  txt,
  type Rec,
} from './docs-util';
import { esquema, type CtxHerr, type Herramienta, type ProveedorHerramientas } from './tipos';

// ------------------------------------------------------------------ tipos internos
interface Objetivo {
  id: string;
  prop: Propiedad | null;
  n: Negocio | null;
}
type Quien = 'propietarios' | 'cliente' | 'avales';
interface Firmante {
  persona: Persona;
  rol: string;
  /** los datos del propietario solo los ve quien captó la propiedad (o un administrador) */
  reservado: boolean;
}
interface Evaluacion {
  firmantes: Firmante[];
  faltan: string[];
  lineas: string[];
  opcionales: string[];
}
interface Doc {
  id: string;
  nombre: string;
  sobre: 'propiedad' | 'negocio';
  tipo?: 'venta' | 'arriendo';
  /** la herramienta que lo envía a firmar (la que se confirma) */
  enviarHerr: string;
  quienes: (o: Objetivo, a: Rec) => [Quien, string][];
  /** guarda lo que dio el corredor en su lugar; devuelve qué quedó anotado */
  guardar: (c: CtxHerr, o: Objetivo, a: Rec) => Promise<string[]>;
  /** los datos propios del documento que faltan */
  falta: (o: Objetivo, a: Rec) => string[];
  /** lo que lleva el documento, en líneas cortas */
  lineas: (o: Objetivo, a: Rec) => string[];
  /** más condiciones antes de enviar (p. ej. la aprobación del contrato) */
  extra?: (o: Objetivo) => { faltan: string[]; lineas: string[] };
  previa: (c: CtxHerr, o: Objetivo, a: Rec) => Promise<Rec>;
  enviar: (c: CtxHerr, o: Objetivo, a: Rec) => Promise<Rec>;
  /** avisos que no impiden enviar (el borrador de escritura puede ir con espacios en blanco) */
  opcionales?: (o: Objetivo, previa: Rec | null) => string[];
}

const COBRO = 'Se cobra del saldo de Portalfirma y cada firmante recibe el enlace para firmar en su correo.';
const L = (etiqueta: string, v: unknown) => (hay(v) ? `${etiqueta}: ${txt(v, 300)}` : '');
const dat = (n: Negocio | null) => ((n?.datos ?? {}) as Rec) || {};
const sub = (o: Rec, k: string): Rec => ((o[k] ?? {}) as Rec) || {};
const monto = (n: Negocio | null) => {
  const v = sub(dat(n), 'valor');
  return numero(v.valor) && numero(v.valor)! > 0 ? pesos(numero(v.valor), String(v.moneda || 'UF')) : '';
};
const si = (b: unknown) => (b === true || b === 'true' || b === 'si' ? 'sí' : b === false || b === 'false' || b === 'no' ? 'no' : '');
/** «el propietario», «la arrendataria», «el aval»…: a qué grupo de firmantes se refiere el corredor (sin importar cómo se llame el rol en cada documento) */
const grupoDeTexto = (t: unknown): Quien | null => {
  const k = norm(t);
  if (/^(propietari[oa]s?|due[nñ][oa]s?|mandantes?|arrendadore?s?|vendedore?s?)$/.test(k)) return 'propietarios';
  if (/^(arrendatari[oa]s?|compradore?s?|oferentes?|clientes?|interesad[oa]s?)$/.test(k)) return 'cliente';
  if (/^(codeudore?s?|avales?|fiadore?s?)$/.test(k)) return 'avales';
  return null;
};
const ESTADOS = ['bueno', 'regular', 'malo', 'na'];
const estadoEntrega = (v: unknown, que: string) => {
  const t = norm(v).replace(/\s+/g, '_').replace(/^no_aplica$/, 'na');
  if (!ESTADOS.includes(t)) throw new ErrorDoc(`${que}: el estado debe ser bueno, regular, malo o no aplica.`);
  return t;
};

@Injectable()
export class HerramientasDocumentos implements ProveedorHerramientas {
  readonly herramientas: Herramienta[];
  private readonly conf = new Confirmaciones();
  private readonly docs: Record<string, Doc>;

  constructor(
    private readonly db: PrismaService,
    private readonly ayudas: AyudasHerramientas,
    private readonly actividad: ActividadService,
    private readonly personas: PersonasService,
    private readonly r2: AlmacenamientoService,
    private readonly mandatoVenta: MandatoVentaService,
    private readonly mandatoArriendo: MandatoArriendoService,
    private readonly carta: CartaOfertaService,
    private readonly contrato: ContratoArriendoService,
    private readonly promesa: PromesaCompraventaService,
    private readonly escritura: EscrituraCompraventaService,
    private readonly entrega: ActaEntregaService,
    private readonly actaPdf: ActaPdfService,
    private readonly enviados: EnviadosService,
    firmas: HerramientasFirmas,
  ) {
    const lista = [this.defMandato(true), this.defMandato(false), this.defCarta(), this.defContrato(), this.defPromesa(), this.defEscritura(), this.defEntrega()];
    this.docs = Object.fromEntries(lista.map((d) => [d.id, d]));
    this.herramientas = [...this.definir(), ...firmas.herramientas];
  }

  // ================================================================== los documentos
  /** guarda cambios en la ficha de una propiedad (y columnas sueltas) con su historial */
  private async guardarPropiedad(c: CtxHerr, p: Propiedad, cols: Prisma.PropiedadUncheckedUpdateInput, ficha: Rec, nota: string) {
    if (!Object.keys(cols).length && !Object.keys(ficha).length) return;
    const unidad = 'unidad' in cols ? String(cols.unidad ?? '') : p.unidad;
    await this.db.propiedad.update({
      where: { id: p.id },
      data: {
        ...cols,
        ficha: { ...((p.ficha ?? {}) as Rec), ...ficha } as Prisma.InputJsonValue,
        ...('unidad' in cols ? { busqueda: normalizar(p.codigo, p.titulo, p.direccion, unidad, p.comuna) } : {}),
        version: { increment: 1 },
      },
    });
    await this.actividad.registrar({ corredoraId: c.corredoraId, entidadTipo: 'propiedad', entidadId: p.id, texto: `${nota} (por WhatsApp)`, usuarioId: c.usuarioId });
  }

  /** cambia datos del negocio con control de versión (la app los trae en su próxima sincronización) */
  private async mezclarNegocio(c: CtxHerr, id: string, fn: (d: Rec) => void, nota?: string): Promise<Negocio> {
    for (let i = 0; i < 4; i++) {
      const n = await this.db.negocio.findUnique({ where: { id } });
      if (!n || n.corredoraId !== c.corredoraId || n.eliminadoEn) throw new ErrorDoc('El negocio ya no existe.');
      const d = structuredClone(((n.datos ?? {}) as Rec) || {});
      fn(d);
      d.actualizado = new Date().toISOString();
      const r = await this.db.negocio.updateMany({ where: { id, version: n.version }, data: { datos: d as Prisma.InputJsonValue, version: { increment: 1 } } });
      if (r.count) {
        if (nota)
          await this.actividad.registrar({ corredoraId: c.corredoraId, entidadTipo: 'negocio', entidadId: id, ref2: n.propiedadId, texto: `${nota} (por WhatsApp)`, usuarioId: c.usuarioId });
        return (await this.db.negocio.findUnique({ where: { id } }))!;
      }
    }
    throw new ErrorDoc('Otra persona está cambiando este negocio en este momento: intenta de nuevo.');
  }

  /** la inscripción de dominio y datos legales que da el corredor (van en la ficha de la propiedad) */
  private async guardarInscripcion(c: CtxHerr, o: Objetivo, a: Rec, notas: string[]) {
    if (!o.prop) return;
    const ficha: Rec = {};
    const m: [string, string][] = [['fojas', 'fojas'], ['numero_inscripcion', 'numeroInscripcion'], ['anio_inscripcion', 'anioInscripcion'], ['conservador', 'conservador']];
    for (const [k, f] of m) if (hay(a[k])) ficha[f] = txt(a[k], 80);
    const cols: Prisma.PropiedadUncheckedUpdateInput = {};
    if (hay(a.rol_propiedad)) cols.rol = txt(a.rol_propiedad, 60);
    if (Object.keys(ficha).length || cols.rol) {
      await this.guardarPropiedad(c, o.prop, cols, ficha, 'Datos legales del inmueble para el documento');
      notas.push(`inscripción de dominio / rol: ${[...Object.values(ficha), cols.rol].filter(Boolean).join(' · ')}`);
    }
  }

  private defMandato(venta: boolean): Doc {
    const svc = venta ? this.mandatoVenta : this.mandatoArriendo;
    return {
      id: venta ? 'mandato_venta' : 'mandato_arriendo',
      nombre: venta ? 'Mandato de gestión de venta' : 'Mandato de gestión de arriendo',
      sobre: 'propiedad',
      enviarHerr: 'enviar_mandato',
      quienes: () => [['propietarios', 'Mandante']],
      guardar: async (c, o, a) => {
        const p = o.prop!;
        const notas: string[] = [];
        const ficha: Rec = {};
        const cols: Prisma.PropiedadUncheckedUpdateInput = {};
        const ex = siNo(a.exclusividad);
        if (ex !== undefined) { ficha.exclusividad = ex; notas.push(`exclusividad: ${ex ? 'sí' : 'no'}`); }
        const pub = siNo(a.publicar_portales);
        if (pub !== undefined) { ficha.publicarPortales = pub; notas.push(`publicar en portales: ${pub ? 'sí' : 'no'}`); }
        if (venta) {
          const pct = positivo(a.comision_pct, 'Comisión', 20);
          if (pct) { ficha.comisionVentaPct = pct; notas.push(`comisión de venta: ${pct} %`); }
          if (hay(a.condiciones)) { ficha.condicionesMandatoVenta = txt(a.condiciones); notas.push('otras condiciones'); }
        } else {
          const mas = siNo(a.mascotas);
          if (mas !== undefined) { ficha.mascotas = mas; notas.push(`mascotas: ${mas ? 'sí' : 'no'}`); }
          const g = positivo(a.meses_garantia, 'Meses de garantía', 24);
          if (g) { ficha.mesesGarantia = g; notas.push(`garantía: ${g} mes(es)`); }
          if (hay(a.condiciones)) { ficha.condicionesMandato = txt(a.condiciones); notas.push('otras condiciones'); }
        }
        const precio = positivo(a.precio, venta ? 'Precio de venta' : 'Canon de arriendo');
        if (precio) {
          const mon = (opcion(a.moneda, ['UF', 'CLP', 'USD'].map((x) => x.toLowerCase()), 'Moneda') ?? '').toUpperCase();
          if (venta) { cols.precioVenta = precio; if (mon) cols.monedaVenta = mon as 'UF'; }
          else { cols.precioArriendo = precio; if (mon) cols.monedaArriendo = mon as 'UF'; }
          notas.push(`${venta ? 'precio' : 'canon'}: ${pesos(precio, mon || (venta ? p.monedaVenta : p.monedaArriendo) || 'UF')}`);
        }
        if (hay(a.unidad)) { cols.unidad = txt(a.unidad, 40); notas.push(`unidad: ${txt(a.unidad, 40)}`); }
        if (hay(a.rol_propiedad)) { cols.rol = txt(a.rol_propiedad, 60); notas.push(`rol: ${txt(a.rol_propiedad, 60)}`); }
        await this.guardarPropiedad(c, p, cols, ficha, `Datos del ${venta ? 'mandato de venta' : 'mandato de arriendo'}: ${notas.join(', ')}`);
        return notas;
      },
      falta: (o) => {
        const p = o.prop!;
        const out: string[] = [];
        if (venta && !p.venta) out.push('La propiedad no está en venta: el mandato de venta es solo para propiedades que se venden.');
        if (!venta && !p.arriendo) out.push('La propiedad no está en arriendo: el mandato de arriendo es solo para propiedades que se arriendan.');
        if (!Number(venta ? p.precioVenta : p.precioArriendo)) out.push(venta ? 'Falta el precio de venta de la propiedad.' : 'Falta el canon de arriendo de la propiedad.');
        return out;
      },
      lineas: (o) => {
        const p = o.prop!;
        const f = (p.ficha ?? {}) as Rec;
        return [
          L('Propiedad', `${p.codigo} · ${[p.direccion, p.unidad ? 'depto. ' + p.unidad : '', p.comuna].filter(Boolean).join(', ')}`),
          L(venta ? 'Precio' : 'Canon', pesos(venta ? p.precioVenta : p.precioArriendo, venta ? p.monedaVenta : p.monedaArriendo)),
          L('Rol de avalúo', p.rol),
          L('Exclusividad', si(f.exclusividad) || 'no (si no se dijo)'),
          L('Publicar en portales', si(f.publicarPortales) || 'sí (si no se dijo)'),
          ...(venta
            ? [L('Comisión', `${hay(f.comisionVentaPct) ? f.comisionVentaPct : 2} % + IVA`), L('Otras condiciones', f.condicionesMandatoVenta)]
            : [L('Mascotas', si(f.mascotas)), L('Meses de garantía', f.mesesGarantia), L('Otras condiciones', f.condicionesMandato)]),
        ].filter(Boolean);
      },
      previa: (c, o) => svc.vistaPrevia(tokenDe(c), o.id),
      enviar: (c, o) => svc.enviar(tokenDe(c), o.id),
    };
  }

  private defCarta(): Doc {
    return {
      id: 'carta_oferta',
      nombre: 'Carta oferta',
      sobre: 'negocio',
      enviarHerr: 'enviar_carta_oferta',
      quienes: (o, a) => {
        const venta = o.n!.tipo === 'venta';
        return [['cliente', venta ? 'Comprador' : 'Arrendatario'], ...(venta || siNo(a.con_propietario) === true ? ([['propietarios', venta ? 'Vendedor' : 'Arrendador']] as [Quien, string][]) : [])];
      },
      guardar: async (c, o, a) => {
        const notas: string[] = [];
        const m = positivo(a.monto, 'Monto de la oferta');
        const mon = opcion(a.moneda, ['uf', 'clp', 'usd'], 'Moneda')?.toUpperCase();
        const cambios: [string, string, unknown, (v: unknown) => unknown][] = [
          ['garantia', 'garantía', a.garantia, (v) => txt(v, 200)],
          ['plazo', 'plazo', a.plazo, (v) => txt(v, 200)],
          ['vigencia', 'vigencia (días)', positivo(a.vigencia_dias, 'Vigencia', 120), (v) => v],
          ['condiciones', 'condiciones', a.condiciones, (v) => txt(v, 3000)],
          ['piePct', 'pie (%)', positivo(a.pie_pct, 'Pie', 99), (v) => v],
          ['promesaDias', 'días para la promesa', positivo(a.promesa_dias, 'Días para la promesa', 720), (v) => v],
          ['escrituraDias', 'días para la escritura', positivo(a.escritura_dias, 'Días para la escritura', 720), (v) => v],
          ['seriedadUF', 'seriedad (UF)', positivo(a.seriedad_uf, 'Seriedad', 100000), (v) => v],
          ['comisionPct', 'comisión (%)', positivo(a.comision_pct, 'Comisión', 20), (v) => v],
        ];
        const hechos = cambios.filter(([, , v]) => hay(v));
        if (!m && !mon && !hechos.length) return notas;
        await this.mezclarNegocio(c, o.id, (d) => {
          if (m || mon) {
            const v = sub(d, 'valor');
            if (m) v.valor = m;
            if (mon) v.moneda = mon;
            if (!v.moneda) v.moneda = 'UF';
            d.valor = v;
          }
          const of = sub(d, 'oferta');
          for (const [k, , v, f] of hechos) of[k] = f(v);
          d.oferta = of;
        }, `Condiciones de la carta oferta: ${[m ? `monto ${pesos(m, mon || 'UF')}` : '', ...hechos.map(([, e, v]) => `${e} ${txt(v, 60)}`)].filter(Boolean).join(', ')}`);
        if (m) notas.push(`monto: ${pesos(m, mon || String(sub(dat(o.n), 'valor').moneda || 'UF'))}`);
        for (const [, e, v] of hechos) notas.push(`${e}: ${txt(v, 80)}`);
        return notas;
      },
      falta: (o) => (monto(o.n) ? [] : ['Falta el monto de la oferta (en UF o pesos).']),
      lineas: (o, a) => {
        const venta = o.n!.tipo === 'venta';
        const of = sub(dat(o.n), 'oferta');
        return [
          L('Propiedad', `${o.prop!.codigo} · ${[o.prop!.direccion, o.prop!.comuna].filter(Boolean).join(', ')}`),
          L(venta ? 'Oferta de compra' : 'Canon ofrecido', monto(o.n)),
          L('Garantía', of.garantia),
          L('Plazo', of.plazo),
          L('Vigencia', `${hay(of.vigencia) ? of.vigencia : 3} días`),
          L('Condiciones', of.condiciones),
          ...(venta
            ? [
                L('Pie', `${hay(of.piePct) ? of.piePct : 20} %`),
                L('Promesa en', `${hay(of.promesaDias) ? of.promesaDias : 7} días`),
                L('Escritura en', `${hay(of.escrituraDias) ? of.escrituraDias : 90} días`),
                L('Seriedad', `UF ${hay(of.seriedadUF) ? of.seriedadUF : 50}`),
                L('Comisión', `${hay(of.comisionPct) ? of.comisionPct : 2} %`),
              ]
            : [L('Firma también el propietario', siNo(a.con_propietario) === true ? 'sí' : 'no')]),
        ].filter(Boolean);
      },
      previa: (c, o) => this.carta.vistaPrevia(tokenDe(c), o.id),
      enviar: (c, o, a) => this.carta.enviar(tokenDe(c), o.id, siNo(a.con_propietario) === true),
    };
  }

  private defContrato(): Doc {
    const ultima = (n: Negocio | null) => {
      const vs = ((sub(sub(dat(n), 'ciclo'), 'contrato').versiones ?? []) as Rec[]).filter((v) => v && typeof v === 'object');
      return vs.length ? vs[vs.length - 1] : null;
    };
    return {
      id: 'contrato_arriendo',
      nombre: 'Contrato de arriendo',
      sobre: 'negocio',
      tipo: 'arriendo',
      enviarHerr: 'enviar_contrato_arriendo',
      quienes: () => [['propietarios', 'Arrendador'], ['cliente', 'Arrendatario'], ['avales', 'Codeudor']],
      guardar: async (c, o, a) => {
        const notas: string[] = [];
        const m = positivo(a.monto, 'Renta mensual');
        const mon = opcion(a.moneda, ['uf', 'clp', 'usd'], 'Moneda')?.toUpperCase();
        const k: Rec = {};
        const inicio = fechaEntrada(a.inicio, 'Inicio del contrato');
        if (inicio) { k.inicio = inicio; notas.push(`inicio: ${ddmmaaaa(inicio)}`); }
        const plazo = positivo(a.plazo_meses, 'Plazo (meses)', 600);
        if (plazo) { k.plazoMeses = plazo; notas.push(`plazo: ${plazo} meses`); }
        const reaj = opcion(a.reajuste, ['ipc_anual', 'ipc_semestral', 'uf', 'sin'], 'Reajuste');
        if (reaj) { k.reajuste = reaj; notas.push(`reajuste: ${reaj}`); }
        const uso = opcion(a.uso, ['habitacional', 'comercial', 'oficina', 'bodega', 'estacionamiento'], 'Uso');
        if (uso) { k.uso = uso; notas.push(`uso: ${uso}`); }
        const aviso = positivo(a.aviso_dias, 'Días de aviso', 365);
        if (aviso) { k.avisoDias = aviso; notas.push(`aviso de término: ${aviso} días`); }
        const dia = positivo(a.dia_pago, 'Día de pago', 31);
        if (dia) { k.diaPago = dia; notas.push(`día de pago: ${dia}`); }
        const gar = positivo(a.garantia_meses, 'Meses de garantía', 24);
        if (gar) { k.garantiaMeses = gar; notas.push(`garantía: ${gar} mes(es)`); }
        if (hay(a.cuenta)) { k.cuenta = txt(a.cuenta, 300); notas.push('cuenta de pago'); }
        if (hay(a.clausulas)) { k.clausulas = txt(a.clausulas, 4000); notas.push('cláusulas adicionales'); }
        if (!m && !mon && !Object.keys(k).length) return notas;
        await this.mezclarNegocio(c, o.id, (d) => {
          if (m || mon) {
            const v = sub(d, 'valor');
            if (m) v.valor = m;
            if (mon) v.moneda = mon;
            if (!v.moneda) v.moneda = 'CLP';
            d.valor = v;
          }
          const ciclo = sub(d, 'ciclo');
          const con = sub(ciclo, 'contrato');
          con.datos = { ...sub(con, 'datos'), ...k };
          ciclo.contrato = con;
          d.ciclo = ciclo;
        }, `Condiciones del contrato de arriendo: ${notas.join(', ')}`);
        if (m) notas.unshift(`renta: ${pesos(m, mon || String(sub(dat(o.n), 'valor').moneda || 'CLP'))}`);
        return notas;
      },
      falta: (o) => {
        const k = sub(sub(sub(dat(o.n), 'ciclo'), 'contrato'), 'datos');
        const out: string[] = [];
        if (!monto(o.n)) out.push('Falta la renta mensual.');
        if (!fechaOk2(k.inicio)) out.push('Falta la fecha de inicio del contrato.');
        if (!(numero(k.plazoMeses) && numero(k.plazoMeses)! > 0)) out.push('Falta el plazo del contrato (en meses).');
        return out;
      },
      lineas: (o) => {
        const k = sub(sub(sub(dat(o.n), 'ciclo'), 'contrato'), 'datos');
        return [
          L('Propiedad', `${o.prop!.codigo} · ${[o.prop!.direccion, o.prop!.unidad ? 'depto. ' + o.prop!.unidad : '', o.prop!.comuna].filter(Boolean).join(', ')}`),
          L('Renta mensual', monto(o.n)),
          L('Inicio', fechaOk2(k.inicio) ? ddmmaaaa(txt(k.inicio, 10)) : ''),
          L('Plazo', hay(k.plazoMeses) ? `${k.plazoMeses} meses` : ''),
          L('Reajuste', k.reajuste),
          L('Uso', k.uso),
          L('Aviso de término', hay(k.avisoDias) ? `${k.avisoDias} días` : ''),
          L('Día de pago', k.diaPago),
          L('Garantía', hay(k.garantiaMeses) ? `${k.garantiaMeses} mes(es) de renta` : ''),
          L('Cuenta de pago', k.cuenta),
          L('Cláusulas adicionales', k.clausulas),
        ].filter(Boolean);
      },
      extra: (o) => {
        const con = sub(sub(dat(o.n), 'ciclo'), 'contrato');
        const v = ultima(o.n);
        const faltan: string[] = [];
        const lineas: string[] = [];
        if (!v) {
          faltan.push('Falta guardar la versión del contrato que revisarán las partes (herramienta guardar_version_contrato): se genera con estas condiciones.');
          return { faltan, lineas };
        }
        lineas.push(`Versión del contrato: ${v.n}`);
        const archivo = sub(v, 'archivo');
        if (!txt(archivo.clave)) faltan.push(`La versión ${v.n} no tiene su PDF guardado: guarda una versión nueva.`);
        if (!igualJson(v.condiciones ?? {}, con.datos ?? {}) || !igualJson(v.valor ?? null, dat(o.n).valor ?? null))
          faltan.push(`Las condiciones cambiaron después de la versión ${v.n}: guarda una versión nueva (guardar_version_contrato) y pide de nuevo la aprobación.`);
        const firm = ((v.firmantes ?? []) as Rec[]).filter((f) => f?.personaId);
        const ap = sub(con, 'aprobado');
        const sin = firm.filter((f) => !ap[String(f.personaId)]);
        lineas.push(`Aprobaron: ${firm.length - sin.length} de ${firm.length}`);
        if (!firm.length) faltan.push('La versión no registró quiénes firman: guarda una versión nueva.');
        else if (sin.length) faltan.push(`Falta la aprobación de ${sin.map((f) => `${txt(f.nombre)} (${txt(f.rol)})`).join(', ')} (enviar_contrato_a_revision y aprobar_contrato).`);
        return { faltan, lineas };
      },
      previa: (c, o) => this.contrato.vistaPrevia(tokenDe(c), o.id),
      enviar: async (c, o) => {
        const v = ultima(o.n);
        const clave = txt(sub(sub(v ?? {}, 'archivo'), 'clave'), 400);
        if (!clave) return { error: 'No hay una versión aprobada del contrato con su PDF.' };
        return this.contrato.enviar(tokenDe(c), o.id, clave);
      },
    };
  }

  private defPromesa(): Doc {
    return {
      id: 'promesa_compraventa',
      nombre: 'Promesa de compraventa',
      sobre: 'negocio',
      tipo: 'venta',
      enviarHerr: 'enviar_promesa',
      quienes: () => [['cliente', 'Comprador'], ['propietarios', 'Vendedor']],
      guardar: async (c, o, a) => {
        const notas: string[] = [];
        const m = positivo(a.precio, 'Precio de la compraventa');
        const mon = opcion(a.moneda, ['uf', 'clp', 'usd'], 'Moneda')?.toUpperCase();
        const pie = positivo(a.pie_pct, 'Pie', 99);
        const k: Rec = {};
        const esc = positivo(a.escritura_dias, 'Días para la escritura', 720);
        if (esc) { k.escrituraDias = esc; notas.push(`escritura en ${esc} días`); }
        const ent = fechaEntrada(a.fecha_entrega, 'Fecha de entrega');
        if (ent) { k.fechaEntrega = ent; notas.push(`entrega: ${ddmmaaaa(ent)}`); }
        const sf = opcion(a.saldo_forma, ['hipotecario', 'contado'], 'Forma de pago del saldo');
        if (sf) { k.saldoForma = sf; notas.push(`saldo: ${sf}`); }
        if (hay(a.pago_nota)) { k.pagoNota = txt(a.pago_nota, 1000); notas.push('modalidad de pago'); }
        if (hay(a.condiciones)) { k.condiciones = txt(a.condiciones, 3000); notas.push('condiciones adicionales'); }
        if (hay(a.notaria)) { k.notaria = txt(a.notaria, 160); notas.push(`notaría: ${txt(a.notaria, 160)}`); }
        if (m || mon || pie || Object.keys(k).length)
          await this.mezclarNegocio(c, o.id, (d) => {
            if (m || mon) {
              const v = sub(d, 'valor');
              if (m) v.valor = m;
              if (mon) v.moneda = mon;
              if (!v.moneda) v.moneda = 'UF';
              d.valor = v;
            }
            if (pie) d.oferta = { ...sub(d, 'oferta'), piePct: pie };
            const ciclo = sub(d, 'ciclo');
            ciclo.promesa = { ...sub(ciclo, 'promesa'), ...k };
            d.ciclo = ciclo;
          }, `Datos de la promesa de compraventa: ${[m ? `precio ${pesos(m, mon || 'UF')}` : '', pie ? `pie ${pie} %` : '', ...notas].filter(Boolean).join(', ')}`);
        if (m) notas.unshift(`precio: ${pesos(m, mon || 'UF')}`);
        if (pie) notas.push(`pie: ${pie} %`);
        await this.guardarInscripcion(c, o, a, notas);
        return notas;
      },
      falta: (o) => {
        const f = (o.prop!.ficha ?? {}) as Rec;
        const out: string[] = [];
        if (!monto(o.n)) out.push('Falta el precio de la compraventa.');
        if (!(hay(f.fojas) && hay(f.numeroInscripcion))) out.push('Falta la inscripción de dominio del inmueble (fojas y número de inscripción; también el año y el conservador si los tiene).');
        return out;
      },
      lineas: (o) => {
        const d = dat(o.n);
        const of = sub(d, 'oferta');
        const k = sub(sub(d, 'ciclo'), 'promesa');
        const f = (o.prop!.ficha ?? {}) as Rec;
        return [
          L('Propiedad', `${o.prop!.codigo} · ${[o.prop!.direccion, o.prop!.unidad ? 'depto. ' + o.prop!.unidad : '', o.prop!.comuna].filter(Boolean).join(', ')}`),
          L('Precio', monto(o.n)),
          L('Pie', `${hay(of.piePct) ? of.piePct : 20} %`),
          L('Saldo', k.saldoForma === 'contado' ? 'al contado' : 'crédito hipotecario'),
          L('Escritura en', `${hay(k.escrituraDias) ? k.escrituraDias : hay(of.escrituraDias) ? of.escrituraDias : 90} días`),
          L('Entrega', k.fechaEntrega ? ddmmaaaa(txt(k.fechaEntrega, 10)) : 'al inscribirse la compraventa'),
          L('Notaría', k.notaria || 'la que designen las partes'),
          L('Inscripción de dominio', [f.fojas ? `fojas ${f.fojas}` : '', f.numeroInscripcion ? `n° ${f.numeroInscripcion}` : '', f.anioInscripcion, f.conservador].filter(Boolean).join(' · ')),
          L('Modalidad de pago', k.pagoNota),
          L('Condiciones adicionales', k.condiciones),
        ].filter(Boolean);
      },
      previa: (c, o) => this.promesa.vistaPrevia(tokenDe(c), o.id),
      enviar: (c, o) => this.promesa.enviar(tokenDe(c), o.id),
    };
  }

  private defEscritura(): Doc {
    return {
      id: 'escritura_compraventa',
      nombre: 'Borrador de escritura de compraventa',
      sobre: 'negocio',
      tipo: 'venta',
      enviarHerr: 'enviar_escritura',
      quienes: () => [['cliente', 'Comprador'], ['propietarios', 'Vendedor']],
      guardar: async (c, o, a) => {
        const notas: string[] = [];
        const k: Rec = {};
        const t: [string, string, string][] = [
          ['notaria', 'notaria', 'notaría'], ['ciudad', 'ciudad', 'ciudad'], ['banco', 'banco', 'banco'], ['deslindes', 'deslindes', 'deslindes'],
          ['incluye', 'incluye', 'lo que incluye'], ['personerias', 'personerias', 'personerías'], ['rep_vendedor', 'repVendedor', 'representante del vendedor'],
          ['rep_comprador', 'repComprador', 'representante del comprador'], ['promesa_notaria', 'promesaNotaria', 'notaría de la promesa'],
        ];
        for (const [e, f, n] of t) if (hay(a[e])) { k[f] = txt(a[e], 1500); notas.push(n); }
        for (const [e, f, n] of [['fecha', 'fecha', 'fecha de la escritura'], ['fecha_entrega', 'entregaFecha', 'entrega material'], ['promesa_fecha', 'promesaFecha', 'fecha de la promesa']] as const) {
          const v = fechaEntrada(a[e], n);
          if (v) { k[f] = v; notas.push(`${n}: ${ddmmaaaa(v)}`); }
        }
        const mp = opcion(a.modo_pago, ['credito', 'contado'], 'Modo de pago');
        if (mp) { k.modoPago = mp; notas.push(`pago: ${mp}`); }
        const m = positivo(a.precio, 'Precio de la compraventa');
        const mon = opcion(a.moneda, ['uf', 'clp', 'usd'], 'Moneda')?.toUpperCase();
        if (m || mon || Object.keys(k).length)
          await this.mezclarNegocio(c, o.id, (d) => {
            if (m || mon) {
              const v = sub(d, 'valor');
              if (m) v.valor = m;
              if (mon) v.moneda = mon;
              if (!v.moneda) v.moneda = 'UF';
              d.valor = v;
            }
            const ciclo = sub(d, 'ciclo');
            ciclo.escritura = { ...sub(ciclo, 'escritura'), ...k };
            d.ciclo = ciclo;
          }, `Datos del borrador de escritura: ${notas.join(', ')}`);
        if (m) notas.unshift(`precio: ${pesos(m, mon || 'UF')}`);
        await this.guardarInscripcion(c, o, a, notas);
        return notas;
      },
      falta: (o) => (monto(o.n) ? [] : ['Falta el precio de la compraventa.']),
      lineas: (o) => {
        const k = sub(sub(dat(o.n), 'ciclo'), 'escritura');
        return [
          L('Propiedad', `${o.prop!.codigo} · ${[o.prop!.direccion, o.prop!.comuna].filter(Boolean).join(', ')}`),
          L('Precio', monto(o.n)),
          L('Notaría', k.notaria),
          L('Fecha de la escritura', k.fecha ? ddmmaaaa(txt(k.fecha, 10)) : ''),
          L('Pago', k.modoPago === 'contado' ? 'al contado' : k.banco ? `crédito (${k.banco})` : k.modoPago === 'credito' ? 'crédito hipotecario' : ''),
          L('Entrega material', k.entregaFecha ? ddmmaaaa(txt(k.entregaFecha, 10)) : 'en el acto de la escritura'),
          L('Deslindes', k.deslindes),
          L('Incluye', k.incluye),
        ].filter(Boolean);
      },
      opcionales: (_o, previa) => ((previa?.faltan as string[] | undefined) ?? []).filter(Boolean),
      previa: (c, o) => this.escritura.vistaPrevia(tokenDe(c), o.id),
      enviar: (c, o) => this.escritura.enviar(tokenDe(c), o.id),
    };
  }

  private defEntrega(): Doc {
    return {
      id: 'acta_entrega',
      nombre: 'Acta de entrega e inventario',
      sobre: 'negocio',
      tipo: 'arriendo',
      enviarHerr: 'enviar_acta_entrega',
      quienes: () => [['propietarios', 'Arrendador'], ['cliente', 'Arrendatario']],
      guardar: async (c, o, a) => this.guardarEntrega(c, o, a),
      falta: (o) => {
        const k = sub(sub(dat(o.n), 'ciclo'), 'entrega') as EntregaDatos;
        const f = faltaEnEntrega(k);
        return f ? [f.replace(/\.$/, '') + '.'] : [];
      },
      lineas: (o) => {
        const k = sub(sub(dat(o.n), 'ciclo'), 'entrega') as EntregaDatos;
        const esp = (k.inventario ?? []).filter((e) => txt(e?.espacio));
        const items = esp.reduce((s, e) => s + (e.items?.length ?? 0), 0);
        const fotos = esp.reduce((s, e) => s + (e.fotos?.length ?? 0), 0);
        const med = MEDIDORES.filter(([id]) => k.medidores?.[id] && (txt(k.medidores[id]?.numero) || txt(k.medidores[id]?.lectura))).map(([, n]) => n);
        return [
          L('Propiedad', `${o.prop!.codigo} · ${[o.prop!.direccion, o.prop!.unidad ? 'depto. ' + o.prop!.unidad : '', o.prop!.comuna].filter(Boolean).join(', ')}`),
          L('Fecha de entrega', k.fecha ? ddmmaaaa(txt(k.fecha, 10)) : ''),
          L('Entrega', k.entregadoPor?.nombre),
          L('Accesos', (k.accesos ?? []).map((x) => `${x.cantidad} ${x.nombre}`).join(', ')),
          L('Llaves', k.llaves),
          L('Estacionamientos', k.estacionamientos),
          L('Bodega', k.bodega),
          L('Medidores', med.join(', ')),
          esp.length ? `Inventario: ${esp.length} espacios (${esp.map((e) => `${e.espacio}: ${e.estado || 'sin estado'}`).join('; ')}), ${items} ítems, ${fotos} fotos` : '',
          L('Observaciones', k.observaciones),
        ].filter(Boolean);
      },
      previa: (c, o) => this.entrega.vistaPrevia(tokenDe(c), o.id),
      enviar: (c, o) => this.entrega.enviar(tokenDe(c), o.id),
    };
  }

  /** guarda lo dictado del acta de entrega: se suma a lo que ya había (un espacio nuevo se agrega; uno repetido se reemplaza) */
  private async guardarEntrega(c: CtxHerr, o: Objetivo, a: Rec): Promise<string[]> {
    const notas: string[] = [];
    const cambios: ((k: EntregaDatos) => void)[] = [];
    const fecha = fechaEntrada(a.fecha, 'Fecha de entrega');
    if (fecha) { cambios.push((k) => { k.fecha = fecha; }); notas.push(`fecha: ${ddmmaaaa(fecha)}`); }
    const gc = fechaEntrada(a.gastos_comunes_desde, 'Gastos comunes desde');
    if (gc) { cambios.push((k) => { k.gastosComunesDesde = gc; }); notas.push(`gastos comunes desde ${ddmmaaaa(gc)}`); }
    if (hay(a.entregado_por)) { const nom = txt(a.entregado_por, 160); const rut = hay(a.entregado_por_rut) ? txt(a.entregado_por_rut, 20) : undefined; cambios.push((k) => { k.entregadoPor = { nombre: nom, ...(rut ? { rut } : k.entregadoPor?.rut ? { rut: k.entregadoPor.rut } : {}) }; }); notas.push(`entrega: ${nom}`); }
    for (const [e, f, n] of [['llaves', 'llaves', 'llaves'], ['estacionamientos', 'estacionamientos', 'estacionamientos'], ['bodega', 'bodega', 'bodega'], ['observaciones', 'observaciones', 'observaciones']] as const)
      if (hay(a[e])) { const v = txt(a[e], 3000); cambios.push((k) => { (k as Rec)[f] = v; }); notas.push(n); }
    if (Array.isArray(a.accesos) && a.accesos.length) {
      const ac = (a.accesos as Rec[]).filter((x) => hay(x?.nombre)).map((x) => ({ nombre: txt(x.nombre, 80), cantidad: txt(x.cantidad ?? 1, 10) }));
      cambios.push((k) => {
        const l = [...(k.accesos ?? [])];
        for (const n of ac) { const i = l.findIndex((x) => norm(x.nombre) === norm(n.nombre)); if (i >= 0) l[i] = n; else l.push(n); }
        k.accesos = l;
      });
      notas.push(`accesos: ${ac.map((x) => `${x.cantidad} ${x.nombre}`).join(', ')}`);
    }
    if (Array.isArray(a.aspectos) && a.aspectos.length) {
      const asp = (a.aspectos as unknown[]).map((x) => txt(x, 200)).filter(Boolean);
      cambios.push((k) => { k.aspectos = [...new Set([...(k.aspectos ?? []), ...asp])]; });
      notas.push(`${asp.length} aspecto(s) general(es)`);
    }
    if (a.medidores && typeof a.medidores === 'object') {
      const med = a.medidores as Rec;
      const ids = MEDIDORES.map(([id]) => id);
      const hechos: [string, { numero?: string; lectura?: string }][] = [];
      for (const [id, v] of Object.entries(med)) {
        const clave = ids.find((x) => norm(x) === norm(id)) ?? MEDIDORES.find(([, n]) => norm(n) === norm(id))?.[0];
        if (!clave) throw new ErrorDoc(`Medidor «${id}» desconocido: usa ${ids.join(', ')}.`);
        const x = (v ?? {}) as Rec;
        hechos.push([clave, { ...(hay(x.numero) ? { numero: txt(x.numero, 40) } : {}), ...(hay(x.lectura) ? { lectura: txt(x.lectura, 40) } : {}) }]);
      }
      if (hechos.length) {
        cambios.push((k) => { k.medidores = { ...(k.medidores ?? {}) }; for (const [id, v] of hechos) k.medidores[id] = { ...(k.medidores[id] ?? {}), ...v }; });
        notas.push(`medidores: ${hechos.map(([id]) => id).join(', ')}`);
      }
    }
    if (Array.isArray(a.inventario) && a.inventario.length) {
      const esps = (a.inventario as Rec[]).map((e, i) => {
        if (!hay(e?.espacio)) throw new ErrorDoc(`Inventario: el espacio n.º ${i + 1} no tiene nombre.`);
        const items = (Array.isArray(e.items) ? (e.items as Rec[]) : []).filter((x) => hay(x?.nombre)).map((x) => ({
          nombre: txt(x.nombre, 120),
          cantidad: hay(x.cantidad) ? txt(x.cantidad, 10) : '1',
          estado: hay(x.estado) ? estadoEntrega(x.estado, `Ítem «${txt(x.nombre, 40)}»`) : 'bueno',
          ...(hay(x.nota) ? { nota: txt(x.nota, 300) } : {}),
        }));
        return { espacio: txt(e.espacio, 80), ...(hay(e.estado) ? { estado: estadoEntrega(e.estado, `Espacio «${txt(e.espacio, 40)}»`) } : {}), ...(hay(e.nota) ? { nota: txt(e.nota, 400) } : {}), items };
      });
      cambios.push((k) => {
        const l = [...(k.inventario ?? [])];
        for (const e of esps) {
          const i = l.findIndex((x) => norm(x.espacio) === norm(e.espacio));
          if (i >= 0) l[i] = { ...l[i], ...e, items: e.items.length ? e.items : l[i].items, fotos: l[i].fotos };
          else l.push(e);
        }
        k.inventario = l;
      });
      notas.push(`inventario: ${esps.map((e) => e.espacio).join(', ')}`);
    }
    // fotos que mandó el corredor en este mensaje: van al espacio que nombró
    if (hay(a.foto_espacio)) {
      const imgs = c.adjuntos.filter((x) => x.mime.startsWith('image/'));
      if (!imgs.length) throw new ErrorDoc('Dijiste a qué espacio van las fotos, pero en este mensaje no llegó ninguna foto: mándalas junto con el pedido.');
      const espacio = txt(a.foto_espacio, 80);
      const subidas: { clave: string; nombre: string }[] = [];
      for (const f of imgs.slice(0, FOTOS_POR_ESPACIO)) {
        const jpg = await sharp(f.bytes).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();
        const clave = `c/${c.corredoraId}/r/archivos_negocio/todos/${o.id}/${randomUUID()}.jpg`;
        await this.r2.subir(clave, jpg, 'image/jpeg');
        subidas.push({ clave, nombre: `${espacio}.jpg` });
      }
      cambios.push((k) => {
        const l = [...(k.inventario ?? [])];
        let i = l.findIndex((x) => norm(x.espacio) === norm(espacio));
        if (i < 0) { l.push({ espacio, items: [], fotos: [] }); i = l.length - 1; }
        l[i] = { ...l[i], fotos: [...(l[i].fotos ?? []), ...subidas].slice(0, FOTOS_POR_ESPACIO) };
        k.inventario = l;
      });
      notas.push(`${subidas.length} foto(s) en «${espacio}»`);
    }
    if (!cambios.length) return notas;
    await this.mezclarNegocio(c, o.id, (d) => {
      const ciclo = sub(d, 'ciclo');
      const k = sub(ciclo, 'entrega') as EntregaDatos;
      for (const f of cambios) f(k);
      ciclo.entrega = k;
      d.ciclo = ciclo;
    }, `Acta de entrega: ${notas.join('; ')}`);
    return notas;
  }

  // ================================================================== flujo común (preparar / enviar)
  /** la propiedad o el negocio al que se refiere el pedido, con lo que puede ver este usuario */
  private async resolver(c: CtxHerr, d: Doc, a: Rec): Promise<{ error: string } | Objetivo> {
    if (d.sobre === 'propiedad') {
      const p = await this.ayudas.propiedad(c, a.propiedad);
      if (!p) return { error: hay(a.propiedad) ? `No encontré la propiedad «${txt(a.propiedad, 40)}».` : 'Falta indicar la propiedad (su código, por ejemplo CV-9001).' };
      if (!c.admin && p.captadorId !== c.usuarioId)
        return { error: `La propiedad ${p.codigo} la captó otro corredor: solo él o un administrador puede armar su ${d.nombre.toLowerCase()}.` };
      return { id: p.id, prop: p, n: null };
    }
    const r = await this.ayudas.negocio(c, a.negocio);
    if (!r.ok) return { error: r.error };
    const n = r.v;
    if (d.tipo && n.tipo !== d.tipo) return { error: `El ${d.nombre.toLowerCase()} es solo para negocios de ${d.tipo}; ${dat(n).codigo ?? n.id} es de ${n.tipo}.` };
    if (!n.propiedadId || !n.clienteId) return { error: 'El negocio no tiene propiedad o interesado: vincúlalos primero (todo negocio los necesita).' };
    const prop = await this.db.propiedad.findFirst({ where: { id: n.propiedadId, corredoraId: c.corredoraId, eliminadoEn: null } });
    if (!prop) return { error: 'La propiedad del negocio ya no existe.' };
    return { id: n.id, prop, n };
  }

  /** la persona del documento según su rol, o error si no se indicó */
  private async firmantes(c: CtxHerr, d: Doc, o: Objetivo, a: Rec): Promise<Firmante[]> {
    const veDuenos = c.admin || o.prop?.captadorId === c.usuarioId;
    const out: Firmante[] = [];
    const meter = (p: Persona, rol: string, reservado: boolean) => {
      if (!out.some((x) => x.persona.id === p.id && x.rol === rol)) out.push({ persona: p, rol, reservado });
    };
    for (const [q, rol] of d.quienes(o, a)) {
      if (q === 'propietarios') {
        const l = await this.db.propiedadPersona.findMany({ where: { propiedadId: o.prop!.id, rol: 'propietario' }, include: { persona: true }, orderBy: { desde: 'asc' } });
        for (const x of l) if (!x.persona.eliminadoEn) meter(x.persona, rol, !veDuenos);
      } else if (q === 'cliente' && o.n?.clienteId) {
        const p = await this.db.persona.findFirst({ where: { id: o.n.clienteId, corredoraId: c.corredoraId, eliminadoEn: null } });
        if (p) meter(p, rol, false);
      } else if (q === 'avales' && o.n) {
        const ev = await this.db.registro.findUnique({ where: { corredoraId_coleccion_id: { corredoraId: c.corredoraId, coleccion: 'evaluaciones', id: o.n.id } } });
        const ids = (((ev && !ev.eliminadoEn ? ev.datos : null) as { personas?: { personaId: string; rol: string }[] } | null)?.personas ?? []).filter((p) => p.rol === 'aval').map((p) => p.personaId);
        const l = ids.length ? await this.db.persona.findMany({ where: { id: { in: ids }, corredoraId: c.corredoraId, eliminadoEn: null } }) : [];
        for (const p of l) meter(p, rol, false);
      }
    }
    return out;
  }

  /** completa la ficha de los firmantes de ESTE documento con lo que dio el corredor (RUT, correo, celular, domicilio…) */
  private async aplicarPersonas(c: CtxHerr, firm: Firmante[], aportes: unknown): Promise<{ notas: string[] }> {
    const notas: string[] = [];
    if (!Array.isArray(aportes)) return { notas };
    for (const ap of aportes as Rec[]) {
      const q = txt(ap?.persona, 160);
      if (!q) throw new ErrorDoc('En «personas» cada dato lleva el nombre, el RUT o el rol de la persona (propietario, arrendatario, comprador…).');
      const rutQ = q.replace(/[^0-9kK]/g, '').toUpperCase();
      const cand = firm.filter((f) => {
        const rut = (f.persona.rut ?? '').toUpperCase();
        if (rutQ.length > 6 && rut === rutQ) return true;
        if (grupoDeTexto(q) !== null && grupoDeTexto(q) === grupoDeTexto(f.rol)) return true;
        const toks = norm(q).split(/\s+/).filter((t) => t.length > 1);
        return toks.length > 0 && toks.every((t) => norm(f.persona.nombre).includes(t));
      });
      const unicos = [...new Map(cand.map((f) => [f.persona.id, f])).values()];
      if (!unicos.length) throw new ErrorDoc(`«${q}» no es firmante de este documento. Firman: ${[...new Set(firm.map((f) => `${f.persona.nombre} (${f.rol})`))].join(', ') || 'nadie todavía'}.`);
      if (unicos.length > 1) throw new ErrorDoc(`«${q}» puede ser ${unicos.map((f) => `${f.persona.nombre} (${f.rol})`).join(' o ')}: pregúntale a cuál se refiere.`);
      const f = unicos[0];
      if (f.reservado) throw new ErrorDoc(`Los datos de ${f.persona.nombre} (propietario) los completa quien captó la propiedad o un administrador.`);
      const par: Rec = {};
      if (hay(ap.rut)) {
        if (!rutValido(txt(ap.rut, 20))) throw new ErrorDoc(`El RUT «${txt(ap.rut, 20)}» no es válido (el dígito verificador no calza): pídele que lo confirme.`);
        par.rut = formatearRut(txt(ap.rut, 20));
      }
      if (hay(ap.email)) {
        if (!emailOk(ap.email)) throw new ErrorDoc(`El correo «${txt(ap.email, 80)}» no es válido.`);
        par.email = txt(ap.email, 200).toLowerCase();
      }
      if (hay(ap.telefono)) {
        if (!telefonoOk(ap.telefono)) throw new ErrorDoc(`El teléfono «${txt(ap.telefono, 40)}» no es válido.`);
        par.telefono = txt(ap.telefono, 40);
      }
      for (const [e, k] of [['direccion', 'direccion'], ['estado_civil', 'estadoCivil'], ['profesion', 'profesion'], ['nacionalidad', 'nacionalidad']] as const) if (hay(ap[e])) par[k] = txt(ap[e], 200);
      if (!Object.keys(par).length) continue;
      try {
        await this.personas.actualizar(tokenDe(c), f.persona.id, par);
      } catch (e) {
        throw new ErrorDoc(`No pude guardar los datos de ${f.persona.nombre}: ${mensajeError(e)}`);
      }
      notas.push(`${f.persona.nombre}: ${Object.keys(ap).filter((k) => k !== 'persona' && hay(ap[k])).join(', ')}`);
    }
    return { notas };
  }

  private async recargar(c: CtxHerr, d: Doc, id: string): Promise<Objetivo> {
    if (d.sobre === 'propiedad') {
      const p = await this.db.propiedad.findFirstOrThrow({ where: { id, corredoraId: c.corredoraId } });
      return { id, prop: p, n: null };
    }
    const n = await this.db.negocio.findFirstOrThrow({ where: { id, corredoraId: c.corredoraId } });
    const prop = await this.db.propiedad.findFirstOrThrow({ where: { id: n.propiedadId!, corredoraId: c.corredoraId } });
    return { id, prop, n };
  }

  /** qué lleva el documento y qué le falta (sin guardar nada ni armar el PDF) */
  private async evaluar(c: CtxHerr, d: Doc, o: Objetivo, a: Rec): Promise<Evaluacion> {
    const firmantes = await this.firmantes(c, d, o, a);
    const faltan: string[] = [];
    const duenos = firmantes.filter((f) => f.rol === 'Mandante' || f.rol === 'Arrendador' || f.rol === 'Vendedor');
    if ((d.quienes(o, a).some(([q]) => q === 'propietarios')) && !duenos.length)
      faltan.push(`La propiedad ${o.prop!.codigo} no tiene propietario en su ficha: vincúlalo (con su nombre y RUT) antes de armar el documento.`);
    for (const f of firmantes) {
      const rut = f.persona.rutFormato || f.persona.rut || '';
      const quien = f.reservado ? `el propietario de ${o.prop!.codigo} (lo completa quien captó la propiedad o un administrador)` : `${f.persona.nombre} (${f.rol})`;
      if (!rut) faltan.push(`Falta el RUT de ${quien}.`);
      else if (!rutValido(rut)) faltan.push(`El RUT de ${quien} no es válido.`);
      if (!f.persona.email || !emailOk(f.persona.email)) faltan.push(`Falta el correo de ${quien}: ahí recibe el enlace para firmar.`);
    }
    faltan.push(...d.falta(o, a));
    const ex = d.extra?.(o);
    if (ex) faltan.push(...ex.faltan);
    return { firmantes, faltan, lineas: [...d.lineas(o, a), ...(ex?.lineas ?? [])], opcionales: [] };
  }

  private snapshot(d: Doc, o: Objetivo, ev: Evaluacion) {
    return { doc: d.id, id: o.id, lineas: ev.lineas, firmantes: ev.firmantes.map((f) => [f.persona.id, f.rol, f.persona.nombre, f.persona.rutFormato ?? f.persona.rut, f.persona.email]), faltan: ev.faltan };
  }

  private async enlacePdf(c: CtxHerr, d: Doc, o: Objetivo, p: Rec): Promise<string | undefined> {
    try {
      if (typeof p.pdf !== 'string' || !p.pdf) return undefined;
      const clave = `c/${c.corredoraId}/vistas/${c.usuarioId}/${d.id}-${o.id}.pdf`;
      await this.r2.subir(clave, Buffer.from(p.pdf, 'base64'), 'application/pdf');
      return await this.r2.urlDescarga(clave, txt(p.archivo, 160) || `${d.nombre}.pdf`, 24 * 3600);
    } catch {
      return undefined;
    }
  }

  private encabezado(o: Objetivo, cliente?: string) {
    const cod = txt(dat(o.n).codigo);
    return o.n ? `${cod || 'Negocio'} · ${o.prop!.codigo}${cliente ? ' · ' + cliente : ''}` : `Propiedad ${o.prop!.codigo}`;
  }

  /** guarda lo que dio el corredor, arma la vista previa y devuelve el resumen y lo que falta */
  private async preparar(c: CtxHerr, d: Doc, a: Rec): Promise<Rec> {
    // un pedido nuevo (aunque falle) deja sin efecto lo que se había mostrado antes: el «sí» siguiente no puede ser de otra cosa
    this.conf.usar(c);
    try {
      const r = await this.resolver(c, d, a);
      if ('error' in r) return r;
      let o = r;
      const guardado: string[] = [];
      // 1. datos de las personas (RUT, correo…) y 2. datos del documento, guardados en su lugar
      let firm = await this.firmantes(c, d, o, a);
      const p = await this.aplicarPersonas(c, firm, a.personas);
      guardado.push(...p.notas.map((x) => `ficha de ${x}`));
      guardado.push(...(await d.guardar(c, o, a)));
      o = await this.recargar(c, d, o.id);
      const ev = await this.evaluar(c, d, o, a);
      firm = ev.firmantes;
      // 3. vista previa (el PDF tal como se firmaría); si el servicio rechaza algo que no vimos, queda como falta
      let previa: Rec | null = null;
      try {
        previa = await d.previa(c, o, a);
      } catch (e) {
        previa = { error: mensajeError(e) };
      }
      if (previa && 'error' in previa) {
        if (!ev.faltan.length) ev.faltan.push(txt(previa.error, 400));
        previa = null;
      }
      const enlace = previa ? await this.enlacePdf(c, d, o, previa) : undefined;
      const opcionales = d.opcionales?.(o, previa) ?? [];
      const cliente = o.n?.clienteId ? firm.find((f) => f.persona.id === o.n!.clienteId)?.persona.nombre : undefined;
      const resumen: Rec = {
        documento: d.nombre,
        para: this.encabezado(o, cliente),
        firmantes: firm.map((f) => ({ rol: f.rol, nombre: f.persona.nombre, ...(f.reservado ? {} : { rut: f.persona.rutFormato ?? f.persona.rut ?? null, correo: f.persona.email ?? null }) })),
        datos: ev.lineas,
        ...(guardado.length ? { guardado } : {}),
        ...(opcionales.length ? { sinCompletarOpcional: opcionales } : {}),
        ...(enlace ? { enlaceVistaPrevia: enlace, nota: 'El enlace descarga el PDF tal como se firmaría (vale 24 horas).' } : {}),
      };
      if (ev.faltan.length)
        return {
          ok: true,
          listo: false,
          ...resumen,
          faltan: ev.faltan,
          indicacion: `NO se envió nada. Pídele al corredor SOLO lo que falta (en una frase) y vuelve a llamar ${d.enviarHerr.replace('enviar_', 'preparar_')} con esos datos (los datos de personas van en «personas»).`,
        };
      this.conf.preparar(c, d.enviarHerr, o.id, this.snapshot(d, o, ev), { ...a, _doc: d.id });
      return {
        ok: true,
        listo: true,
        enviada: false,
        necesitaConfirmacion: true,
        ...resumen,
        indicacion: `El documento está listo, pero NO se envió ni se cobró. Muéstrale al corredor el resumen (datos, firmantes y el enlace para revisar el PDF) y pregúntale si lo envías a firmar. ${COBRO} Si contesta que sí, llama ${d.enviarHerr} con confirmado: true. Si pide un cambio, vuelve a llamar ${d.enviarHerr.replace('enviar_', 'preparar_')} con el cambio.`,
      };
    } catch (e) {
      return { error: mensajeError(e) };
    }
  }

  /** sin `confirmado` prepara; con él, envía a firmar lo que se mostró */
  private async enviar(c: CtxHerr, herramienta: string, elegir: (a: Rec) => Doc | { error: string }, a: Rec): Promise<Rec> {
    try {
      if (a.confirmado !== true) {
        const d = elegir(a);
        return 'error' in d ? d : this.preparar(c, d, a);
      }
      const x = this.conf.exigir(c, herramienta);
      if ('error' in x) return x;
      const args = x.pend.args;
      const d = this.docs[txt(args._doc, 60)];
      if (!d) return { error: 'Prepara el documento de nuevo.' };
      // si el modelo nombró otro documento, no se envía el que se había preparado
      if (hay(a.propiedad) || hay(a.negocio)) {
        const otro = await this.resolver(c, d, { ...a });
        if ('error' in otro) return otro;
        if (otro.id !== x.pend.ref) return { error: 'Lo que se preparó y se le mostró al corredor es otro documento: prepáralo de nuevo.' };
      }
      const r = await this.resolver(c, d, args);
      if ('error' in r) return r;
      const ev = await this.evaluar(c, d, r, args);
      if (ev.faltan.length) return { error: `Ya no se puede enviar: ${ev.faltan.join(' ')}`, faltan: ev.faltan };
      if (!this.conf.igual(x.pend, this.snapshot(d, r, ev)))
        return { error: 'Los datos cambiaron desde que se los mostraste al corredor: prepáralo de nuevo y muéstraselos otra vez.' };
      this.conf.usar(c);
      const env = await d.enviar(c, r, args);
      if ('error' in env) return { error: txt(env.error, 500) };
      const { pdf: _pdf, ...resto } = env;
      return { ok: true, enviada: true, documento: d.nombre, ...resto };
    } catch (e) {
      return { error: mensajeError(e) };
    }
  }

  // ================================================================== contrato: versiones y revisión de las partes
  private ultimaVersion(n: Negocio) {
    const vs = ((sub(sub(dat(n), 'ciclo'), 'contrato').versiones ?? []) as Rec[]).filter((v) => v && typeof v === 'object');
    return vs.length ? vs[vs.length - 1] : null;
  }

  private async negocioContrato(c: CtxHerr, a: Rec): Promise<{ error: string } | Objetivo> {
    return this.resolver(c, this.docs.contrato_arriendo, a);
  }

  /** guarda el contrato como una versión: su PDF queda en los archivos del negocio y las aprobaciones anteriores se anulan */
  private async guardarVersion(c: CtxHerr, a: Rec): Promise<Rec> {
    try {
      const d = this.docs.contrato_arriendo;
      const r = await this.negocioContrato(c, a);
      if ('error' in r) return r;
      let o = r;
      const firm0 = await this.firmantes(c, d, o, a);
      const ap = await this.aplicarPersonas(c, firm0, a.personas);
      const g = await d.guardar(c, o, a);
      o = await this.recargar(c, d, o.id);
      const ev = await this.evaluar(c, d, o, a);
      const sinAprobacion = (s: string) => /guardar_version_contrato|aprobaci[oó]n|versi[oó]n/.test(s);
      const faltan = ev.faltan.filter((x) => !sinAprobacion(x));
      if (faltan.length) return { ok: true, listo: false, faltan, indicacion: 'No se guardó la versión: pídele al corredor SOLO lo que falta y vuelve a llamar guardar_version_contrato con esos datos.' };
      const vp = await this.contrato.vistaPrevia(tokenDe(c), o.id);
      if ('error' in vp || typeof vp.pdf !== 'string') return { error: txt(vp.error, 400) || 'No pude armar el PDF del contrato.' };
      const prev = sub(sub(dat(o.n), 'ciclo'), 'contrato');
      const numeroV = (((prev.versiones ?? []) as unknown[]).length || 0) + 1;
      const nombre = `Contrato de arriendo ${o.prop!.codigo} - V${numeroV}.pdf`;
      const clave = `c/${c.corredoraId}/r/archivos_negocio/todos/${o.id}/${randomUUID()}.pdf`;
      await this.r2.subir(clave, Buffer.from(vp.pdf, 'base64'), 'application/pdf');
      const firmantes = ev.firmantes.map((f) => ({ personaId: f.persona.id, rol: f.rol, nombre: f.persona.nombre }));
      await this.mezclarNegocio(c, o.id, (dd) => {
        const ciclo = sub(dd, 'ciclo');
        const con = sub(ciclo, 'contrato');
        const vs = [...((con.versiones ?? []) as Rec[])];
        vs.push({
          n: vs.length + 1,
          fecha: new Date().toISOString(),
          de: 'corredora',
          nota: txt(a.nota, 400),
          archivo: { clave, nombre },
          condiciones: structuredClone(sub(con, 'datos')),
          valor: structuredClone(dd.valor ?? null),
          firmantes,
          generada: true,
        });
        con.versiones = vs;
        con.aprobado = {};
        ciclo.contrato = con;
        dd.ciclo = ciclo;
      }, `Contrato de arriendo: versión ${numeroV} guardada`);
      const enlace = await this.r2.urlDescarga(clave, nombre, 24 * 3600).catch(() => undefined);
      return {
        ok: true,
        version: numeroV,
        archivo: nombre,
        ...(enlace ? { enlaceVersion: enlace } : {}),
        firmantes: firmantes.map((f) => `${f.nombre} (${f.rol})`),
        ...(g.length || ap.notas.length ? { guardado: [...ap.notas.map((x) => `ficha de ${x}`), ...g] } : {}),
        indicacion: `Versión ${numeroV} guardada (anula las aprobaciones anteriores). Siguiente: mandársela por WhatsApp a las partes para que la revisen (enviar_contrato_a_revision) y registrar quién la aprueba (aprobar_contrato).`,
      };
    } catch (e) {
      return { error: mensajeError(e) };
    }
  }

  /** a quién de los firmantes de la versión se refiere el corredor («el propietario», «Ana», «todos») */
  private elegirFirmantes(v: Rec, quien: unknown, soloPendientes: Rec | null): { error: string } | { l: Rec[] } {
    const firm = ((v.firmantes ?? []) as Rec[]).filter((f) => f?.personaId);
    const q = norm(quien);
    let l = firm;
    if (q && !/^(todos|todas|las partes|ambos)$/.test(q)) {
      const toks = q.split(/\s+/).filter((t) => t.length > 1);
      const g = grupoDeTexto(q);
      l = firm.filter((f) => (g !== null && g === grupoDeTexto(f.rol)) || norm(f.rol) === q || (g === null && toks.length > 0 && toks.every((t) => norm(f.nombre).includes(t))));
      if (!l.length) return { error: `«${txt(quien, 60)}» no es firmante de este contrato. Firman: ${firm.map((f) => `${txt(f.nombre)} (${txt(f.rol)})`).join(', ')}.` };
      // un nombre que coincide con varias personas distintas: se pregunta a cuál (un rol sí puede ser de varias: todos los propietarios)
      if (g === null && new Set(l.map((f) => f.personaId)).size > 1) return { error: `«${txt(quien, 60)}» puede ser ${l.map((f) => `${txt(f.nombre)} (${txt(f.rol)})`).join(' o ')}: pregúntale a cuál se refiere.` };
    } else if (soloPendientes) l = firm.filter((f) => !soloPendientes[String(f.personaId)]);
    return { l };
  }

  /** manda la versión del contrato por WhatsApp a las partes para que la revisen (dos pasos: escribe a terceras personas) */
  private async enviarARevision(c: CtxHerr, a: Rec): Promise<Rec> {
    const HERR = 'enviar_contrato_a_revision';
    if (a.confirmado !== true) this.conf.usar(c);
    try {
      const d = this.docs.contrato_arriendo;
      const conf = a.confirmado === true;
      let args = a;
      let pendRef = '';
      if (conf) {
        const x = this.conf.exigir(c, HERR);
        if ('error' in x) return x;
        args = x.pend.args;
        pendRef = x.pend.ref;
      }
      const r = await this.negocioContrato(c, args);
      if ('error' in r) return r;
      if (conf && r.id !== pendRef) return { error: 'Lo que se preparó es otro negocio: prepáralo de nuevo.' };
      const o = r;
      const v = this.ultimaVersion(o.n!);
      if (!v || !txt(sub(sub(v, 'archivo'), 'clave'))) return { error: 'Primero guarda el contrato como una versión con guardar_version_contrato.' };
      const con = sub(sub(dat(o.n), 'ciclo'), 'contrato');
      const el = this.elegirFirmantes(v, args.persona, sub(con, 'aprobado'));
      if ('error' in el) return el;
      if (!el.l.length) return { error: 'Todos los firmantes ya aprobaron esta versión: no hay a quién enviarla.' };
      const ids = el.l.map((f) => String(f.personaId));
      const pers = await this.db.persona.findMany({ where: { id: { in: ids }, corredoraId: c.corredoraId, eliminadoEn: null } });
      const sinCel = pers.filter((p) => !telefonoOk(p.telefono));
      if (sinCel.length) return { error: `${sinCel.map((p) => p.nombre).join(' y ')} no tiene${sinCel.length > 1 ? 'n' : ''} celular en su ficha: agrégalo (en «personas» de preparar_contrato_arriendo) para mandarle el contrato por WhatsApp.` };
      const usuario = await this.db.usuario.findUnique({ where: { id: c.usuarioId } });
      const dir = [o.prop!.direccion, o.prop!.unidad ? 'depto. ' + o.prop!.unidad : '', o.prop!.comuna].filter(Boolean).join(', ');
      const mensajes = el.l.map((f) => {
        const p = pers.find((x) => x.id === f.personaId)!;
        const como = txt(f.rol) === 'Codeudor' ? ', en el que figuras como codeudor' : '';
        const texto = hay(args.texto)
          ? txt(args.texto, 3500)
          : [`Hola ${primerNombre(p.nombre)}, te escribe ${usuario?.nombre || 'tu corredor'} por el arriendo de ${o.prop!.codigo}${dir ? ' (' + dir + ')' : ''}.`, '', `Te envío el contrato de arriendo (versión ${v.n})${como} para tu revisión. Léelo con calma y dime si lo apruebas o si quieres cambios o comentarios.`, '', 'Cuando todos lo aprueben, lo dejamos listo para la firma. Respóndeme por aquí.'].join('\n');
        return { f, p, texto };
      });
      const resumen = mensajes.map((m) => ({ para: `${m.p.nombre} (${txt(m.f.rol)})`, celular: m.p.telefono, mensaje: m.texto }));
      const snap = { id: o.id, version: v.n, para: mensajes.map((m) => [m.p.id, m.texto]) };
      if (!conf) {
        this.conf.preparar(c, HERR, o.id, snap, { ...args, _doc: d.id });
        return {
          ok: true,
          enviada: false,
          necesitaConfirmacion: true,
          version: v.n,
          mensajes: resumen,
          indicacion: 'NO se envió nada todavía. Muéstrale al corredor a quién se le escribirá y el mensaje (el PDF va adjunto) y pregúntale si lo envías. Si contesta que sí, llama enviar_contrato_a_revision con confirmado: true. Si quiere cambiar el texto, vuelve a llamarla con «texto».',
        };
      }
      const x = this.conf.exigir(c, HERR);
      if ('error' in x) return x;
      if (!this.conf.igual(x.pend, snap)) return { error: 'Los datos cambiaron desde que se los mostraste al corredor: prepáralo de nuevo.' };
      this.conf.usar(c);
      const u = tokenDe(c);
      const enviados: string[] = [];
      const fallidos: string[] = [];
      const envios: Rec[] = [];
      for (const m of mensajes) {
        try {
          const rv = await this.contrato.revisionEnviar(u, {
            negocioId: o.id,
            personaId: m.p.id,
            clave: txt(sub(sub(v, 'archivo'), 'clave'), 400),
            nombre: txt(sub(sub(v, 'archivo'), 'nombre'), 200) || 'Contrato de arriendo.pdf',
            texto: m.texto,
            documento: `el contrato de arriendo (versión ${v.n})`,
          });
          if ('error' in rv) fallidos.push(`${m.p.nombre}: ${txt(rv.error, 200)}`);
          else {
            enviados.push(rv.plantilla ? `${m.p.nombre} (no había escrito en 24 h: le llegó la plantilla y el PDF le llega cuando responda)` : m.p.nombre);
            envios.push({ version: v.n, personaId: m.p.id, rol: txt(m.f.rol), persona: m.p.nombre, fecha: new Date().toISOString(), automatico: true, ...(rv.plantilla ? { plantilla: true } : {}) });
          }
        } catch (e) {
          fallidos.push(`${m.p.nombre}: ${mensajeError(e)}`);
        }
      }
      if (envios.length)
        await this.mezclarNegocio(c, o.id, (dd) => {
          const ciclo = sub(dd, 'ciclo');
          const cc = sub(ciclo, 'contrato');
          cc.envios = [...((cc.envios ?? []) as Rec[]), ...envios].slice(-80);
          ciclo.contrato = cc;
          dd.ciclo = ciclo;
        });
      return { ok: enviados.length > 0, enviada: enviados.length > 0, version: v.n, enviadoA: enviados, ...(fallidos.length ? { fallaron: fallidos } : {}), ...(!enviados.length ? { error: `No se pudo enviar: ${fallidos.join(' | ')}` } : {}) };
    } catch (e) {
      return { error: mensajeError(e) };
    }
  }

  // ================================================================== acta de visita en PDF
  private async compartirActaVisita(c: CtxHerr, a: Rec): Promise<Rec> {
    const HERR = 'compartir_acta_visita';
    if (a.confirmado !== true) this.conf.usar(c);
    try {
      const conf = a.confirmado === true;
      let args = a;
      if (conf) {
        const x = this.conf.exigir(c, HERR);
        if ('error' in x) return x;
        args = x.pend.args;
      }
      // el acta: por su id, o la última del negocio (o de la propiedad)
      let negocio: Negocio | null = null;
      if (hay(args.negocio)) {
        const r = await this.ayudas.negocio(c, args.negocio, false);
        if (!r.ok) return { error: r.error };
        negocio = r.v;
      }
      let prop: Propiedad | null = null;
      if (!negocio && hay(args.propiedad)) {
        prop = await this.ayudas.propiedad(c, args.propiedad);
        if (!prop) return { error: `No encontré la propiedad «${txt(args.propiedad, 40)}».` };
      }
      if (!negocio && !prop && !hay(args.acta)) return { error: 'Falta indicar de qué visita: el negocio (NG-XXX) o la propiedad.' };
      const filas = await this.db.registro.findMany({
        where: {
          corredoraId: c.corredoraId,
          coleccion: 'actas_visita',
          eliminadoEn: null,
          ...(hay(args.acta) ? { id: txt(args.acta, 80) } : negocio ? { datos: { path: ['negocioId'], equals: negocio.id } } : { datos: { path: ['propiedadId'], equals: prop!.id } }),
        },
        orderBy: { actualizadoEn: 'desc' },
        take: 20,
      });
      // el corredor solo comparte actas de sus negocios; el administrador, todas
      const visibles: typeof filas = [];
      for (const f of filas) {
        const nid = String((f.datos as Rec)?.negocioId ?? '');
        const n = nid ? await this.db.negocio.findFirst({ where: { id: nid, corredoraId: c.corredoraId, eliminadoEn: null, ...this.ayudas.mio(c) } }) : null;
        if (n) visibles.push(f);
      }
      if (!visibles.length) return { error: 'No encontré un acta de visita (entre las de tus negocios). Se arma con los audios y fotos de la visita.' };
      if (visibles.length > 1 && !hay(args.acta) && !negocio) {
        const fechas = visibles.slice(0, 5).map((f) => `${(f.datos as Rec).fecha} (id ${f.id})`);
        return { error: `Hay ${visibles.length} actas de esa propiedad: ${fechas.join(' | ')}. Pregúntale al corredor de cuál visita (pasa «negocio» o el id del acta).` };
      }
      const acta = visibles[0];
      const aVisitante = siNo(args.a_visitante) === true;
      const u = tokenDe(c);
      // 1. el PDF y su enlace (7 días); queda anotado en el historial del negocio
      const prepSnap = { acta: acta.id, aVisitante };
      if (aVisitante && !conf) {
        const r = await this.actaPdf.compartir(u, acta.id);
        this.conf.preparar(c, HERR, acta.id, prepSnap, { ...args, acta: acta.id, _doc: 'acta_visita' });
        return {
          ok: true,
          enviada: false,
          necesitaConfirmacion: true,
          visitante: r.visitante,
          celular: r.telefono,
          enlace: r.enlace,
          mensaje: r.texto,
          indicacion: 'NO se le envió nada al visitante todavía. Muéstrale al corredor el mensaje y pregúntale si se lo mando por WhatsApp al visitante (solo puedo si el visitante escribió en las últimas 24 horas; si no, le doy el enlace para que lo reenvíe él). Si dice que sí, llama compartir_acta_visita con confirmado: true.',
        };
      }
      if (aVisitante && conf) {
        const x = this.conf.exigir(c, HERR);
        if ('error' in x) return x;
        if (!this.conf.igual(x.pend, prepSnap)) return { error: 'Prepárala de nuevo: lo que se mostró cambió.' };
        this.conf.usar(c);
      }
      const r = await this.actaPdf.compartir(u, acta.id);
      if (!aVisitante) return { ok: true, enlace: r.enlace, archivo: r.archivo, vigencia: '7 días', visitante: r.visitante, celularVisitante: r.telefono, indicacion: 'Dale el enlace al corredor (descarga el PDF del acta). Si quiere que se lo mandes al visitante, vuelve a llamar con a_visitante: true.' };
      if (!r.telefono) return { ok: true, enviada: false, enlace: r.enlace, aviso: 'El visitante no tiene celular en su ficha: te dejo el enlace para que se lo reenvíes tú.', mensaje: r.texto };
      try {
        await this.enviados.enviar(u, { telefono: r.telefono, nombre: r.visitante ?? '', texto: r.texto, revisar24: true });
        return { ok: true, enviada: true, a: r.visitante, celular: r.telefono, enlace: r.enlace };
      } catch (e) {
        // fuera de las 24 h WhatsApp no deja escribirle a quien no escribió: se entrega el enlace al corredor
        return { ok: true, enviada: false, enlace: r.enlace, mensaje: r.texto, aviso: `No pude mandárselo al visitante por WhatsApp (${mensajeError(e)}). Te dejo el enlace y el mensaje para que se lo reenvíes tú.` };
      }
    } catch (e) {
      return { error: mensajeError(e) };
    }
  }

  // ================================================================== las herramientas
  private definir(): Herramienta[] {
    const REF_PROP = { type: 'string', description: 'código de la propiedad (por ejemplo CV-9001)' };
    const REF_NEG = { type: 'string', description: 'código del negocio (NG-014). Si el corredor no lo dijo y hay más de uno posible, pregúntale cuál' };
    const CONFIRMADO = { type: 'boolean', description: 'true SOLO después de que el corredor vio el resumen y dijo que sí' };
    const MONEDA = { type: 'string', enum: ['UF', 'CLP', 'USD'] };
    const PERSONAS = {
      type: 'array',
      description:
        'Datos que faltan de quienes FIRMAN este documento, para completar su ficha en el CRM (RUT, correo, celular, domicilio…). «persona» es su nombre, su RUT o su rol (propietario, arrendatario, comprador, codeudor). Pásalos en cuanto el corredor los diga; no se vuelven a pedir.',
      items: {
        type: 'object',
        properties: {
          persona: { type: 'string', description: 'nombre, RUT o rol de quien firma' },
          rut: { type: 'string' },
          email: { type: 'string' },
          telefono: { type: 'string' },
          direccion: { type: 'string', description: 'domicilio' },
          estado_civil: { type: 'string' },
          profesion: { type: 'string' },
          nacionalidad: { type: 'string' },
        },
        required: ['persona'],
      },
    };
    const NOTA_PREPARAR = ' Pregunta SOLO lo que falte (los datos del CRM ya los tengo). Guarda los datos que des en su lugar y arma el PDF de vista previa; NO envía ni cobra.';
    const NOTA_ENVIAR = ' Va SIEMPRE en dos pasos: sin confirmado arma el resumen (igual que preparar); cuando el corredor responda que sí, llámala con confirmado: true. El servidor rechaza el envío si no hubo ese paso previo o si el corredor no dijo que sí. Cobra del saldo de Portalfirma.';
    const mandatoDe = async (c: CtxHerr, a: Rec): Promise<Doc | { error: string }> => {
      const op = txt(a.operacion).toLowerCase();
      if (op === 'venta' || op === 'arriendo') return this.docs[`mandato_${op}`];
      const p = await this.ayudas.propiedad(c, a.propiedad);
      if (!p) return { error: hay(a.propiedad) ? `No encontré la propiedad «${txt(a.propiedad, 40)}».` : 'Falta indicar la propiedad (su código, por ejemplo CV-9001).' };
      if (p.venta && p.arriendo) return { error: `La propiedad ${p.codigo} va en venta y en arriendo: pregúntale al corredor si el mandato es de venta o de arriendo (parámetro operacion).` };
      return this.docs[p.arriendo && !p.venta ? 'mandato_arriendo' : 'mandato_venta'];
    };
    const propsMandato = {
      propiedad: REF_PROP,
      operacion: { type: 'string', enum: ['venta', 'arriendo'], description: 'qué mandato (si la propiedad va en venta y arriendo, pregunta cuál; si no, se deduce)' },
      exclusividad: { type: 'boolean', description: 'si el mandato es con exclusividad' },
      publicar_portales: { type: 'boolean', description: 'si se publica en portales y redes (por defecto sí)' },
      comision_pct: { type: 'number', description: 'solo venta: comisión en % (por defecto 2 % + IVA)' },
      mascotas: { type: 'boolean', description: 'solo arriendo: si se aceptan mascotas' },
      meses_garantia: { type: 'number', description: 'solo arriendo: meses de garantía que se pedirán' },
      condiciones: { type: 'string', description: 'otras condiciones del mandato, tal como las dijo el corredor' },
      precio: { type: 'number', description: 'precio de venta o canon de arriendo, si falta en la ficha' },
      moneda: MONEDA,
      unidad: { type: 'string', description: 'N.º de departamento u oficina' },
      rol_propiedad: { type: 'string', description: 'rol de avalúo del inmueble' },
      personas: PERSONAS,
    };
    const propsInscripcion = {
      fojas: { type: 'string', description: 'inscripción de dominio: fojas' },
      numero_inscripcion: { type: 'string', description: 'inscripción de dominio: número' },
      anio_inscripcion: { type: 'string', description: 'inscripción de dominio: año' },
      conservador: { type: 'string', description: 'Conservador de Bienes Raíces (comuna), p. ej. Santiago' },
      rol_propiedad: { type: 'string', description: 'rol de avalúo del inmueble' },
    };
    const propsPromesa = {
      negocio: REF_NEG,
      precio: { type: 'number', description: 'precio de la compraventa (si no está en el negocio)' },
      moneda: MONEDA,
      pie_pct: { type: 'number', description: 'pie en % del precio' },
      escritura_dias: { type: 'number', description: 'días corridos para firmar la escritura' },
      fecha_entrega: { type: 'string', description: 'AAAA-MM-DD, entrega del inmueble (si no, al inscribirse la compraventa)' },
      saldo_forma: { type: 'string', enum: ['hipotecario', 'contado'] },
      pago_nota: { type: 'string', description: 'otras modalidades de pago' },
      condiciones: { type: 'string', description: 'condiciones adicionales' },
      notaria: { type: 'string', description: 'notaría donde se firmará la escritura' },
      ...propsInscripcion,
      personas: PERSONAS,
    };
    return [
      // ---------------------------------------------------------------- mandatos
      {
        name: 'preparar_mandato',
        description:
          'Prepara el MANDATO DE GESTIÓN de venta o de arriendo de una propiedad (documento que firma el propietario): usa los datos de la ficha y del propietario, guarda lo que falte y arma el PDF para revisarlo.' + NOTA_PREPARAR,
        input_schema: esquema(propsMandato, ['propiedad']),
        ejecutar: async (c, a) => {
          const d = await mandatoDe(c, a);
          return 'error' in d ? d : this.preparar(c, d, a);
        },
      },
      {
        name: 'enviar_mandato',
        description: 'Envía a firmar al propietario el MANDATO de venta o de arriendo de una propiedad (firma electrónica con Portalfirma).' + NOTA_ENVIAR,
        input_schema: esquema({ ...propsMandato, confirmado: CONFIRMADO }, ['propiedad']),
        ejecutar: async (c, a) => {
          if (a.confirmado === true) return this.enviar(c, 'enviar_mandato', () => ({ error: '' }), a);
          const d = await mandatoDe(c, a);
          return 'error' in d ? d : this.preparar(c, d, a);
        },
      },
      // ---------------------------------------------------------------- carta oferta
      ...(() => {
        const props = {
          negocio: REF_NEG,
          monto: { type: 'number', description: 'monto de la oferta (compra) o canon ofrecido (arriendo)' },
          moneda: MONEDA,
          garantia: { type: 'string', description: 'garantía (arriendo), como la dijo el corredor' },
          plazo: { type: 'string', description: 'plazo del contrato propuesto' },
          vigencia_dias: { type: 'number', description: 'días de vigencia de la oferta (por defecto 3)' },
          condiciones: { type: 'string', description: 'condiciones de la oferta, tal cual' },
          pie_pct: { type: 'number', description: 'venta: pie en % (modelo 20)' },
          promesa_dias: { type: 'number', description: 'venta: días para firmar la promesa (modelo 7)' },
          escritura_dias: { type: 'number', description: 'venta: días para la escritura (modelo 90)' },
          seriedad_uf: { type: 'number', description: 'venta: garantía de seriedad en UF (modelo 50)' },
          comision_pct: { type: 'number', description: 'venta: comisión en % (modelo 2)' },
          con_propietario: { type: 'boolean', description: 'arriendo: que también firme el propietario (en una venta siempre firma el vendedor)' },
          personas: PERSONAS,
        };
        const d = () => this.docs.carta_oferta;
        return [
          {
            name: 'preparar_carta_oferta',
            description: 'Prepara la CARTA OFERTA de un negocio (la firma el oferente: comprador o arrendatario; en una venta también el vendedor): guarda las condiciones que da el corredor, usa los datos del negocio y arma el PDF para revisarlo.' + NOTA_PREPARAR,
            input_schema: esquema(props, ['negocio']),
            ejecutar: (c: CtxHerr, a: Rec) => this.preparar(c, d(), a),
          },
          {
            name: 'enviar_carta_oferta',
            description: 'Envía a firmar la CARTA OFERTA de un negocio. Al firmarse, el negocio avanza solo (la revisión de firmas lo mueve).' + NOTA_ENVIAR,
            input_schema: esquema({ ...props, confirmado: CONFIRMADO }, ['negocio']),
            ejecutar: (c: CtxHerr, a: Rec) => this.enviar(c, 'enviar_carta_oferta', d, a),
          },
        ];
      })(),
      // ---------------------------------------------------------------- contrato de arriendo
      ...(() => {
        const props = {
          negocio: REF_NEG,
          monto: { type: 'number', description: 'renta mensual (si no está en el negocio)' },
          moneda: MONEDA,
          inicio: { type: 'string', description: 'AAAA-MM-DD, inicio del contrato' },
          plazo_meses: { type: 'number', description: 'plazo en meses' },
          reajuste: { type: 'string', enum: ['ipc_anual', 'ipc_semestral', 'uf', 'sin'] },
          uso: { type: 'string', enum: ['habitacional', 'comercial', 'oficina', 'bodega', 'estacionamiento'], description: 'para qué se arrienda (por defecto habitacional)' },
          aviso_dias: { type: 'number', description: 'días de aviso para terminar el contrato' },
          dia_pago: { type: 'number', description: 'día del mes en que se paga la renta' },
          cuenta: { type: 'string', description: 'cuenta donde se paga la renta («corriente nº 00-123 del Banco de Chile»)' },
          garantia_meses: { type: 'number', description: 'meses de renta de garantía' },
          clausulas: { type: 'string', description: 'cláusulas adicionales, tal como las dijo el corredor' },
          personas: PERSONAS,
        };
        const d = () => this.docs.contrato_arriendo;
        return [
          {
            name: 'preparar_contrato_arriendo',
            description:
              'Prepara el CONTRATO DE ARRIENDO de un negocio (lo firman el/los propietario(s), el arrendatario y los codeudores de la evaluación). Guarda las condiciones, arma el PDF para revisarlo y dice en qué va la revisión de las partes. Flujo completo: preparar_contrato_arriendo → guardar_version_contrato → enviar_contrato_a_revision → aprobar_contrato (herramienta de negocios: registra cuándo aprueba cada parte) → enviar_contrato_arriendo.' + NOTA_PREPARAR,
            input_schema: esquema(props, ['negocio']),
            ejecutar: (c: CtxHerr, a: Rec) => this.preparar(c, d(), a),
          },
          {
            name: 'guardar_version_contrato',
            description: 'Guarda el contrato de arriendo con las condiciones de ahora como una VERSIÓN (queda su PDF en los archivos del negocio) para que las partes la revisen y aprueben. Una versión nueva anula las aprobaciones anteriores. No envía nada a nadie. Acepta los mismos datos de las condiciones que preparar_contrato_arriendo.',
            input_schema: esquema({ ...props, nota: { type: 'string', description: 'qué cambió en esta versión (opcional)' } }, ['negocio']),
            ejecutar: (c: CtxHerr, a: Rec) => this.guardarVersion(c, a),
          },
          {
            name: 'enviar_contrato_a_revision',
            description: 'Manda por WhatsApp la última versión del contrato (con el PDF) a las partes que aún no la aprueban —o a una en particular— para que la revisen y aprueben o comenten. Escribe a terceras personas: va en DOS pasos (sin confirmado muestra a quién y el mensaje; con confirmado: true, solo tras el sí del corredor, lo envía). El celular sale de la ficha de cada persona.',
            input_schema: esquema({ negocio: REF_NEG, persona: { type: 'string', description: 'nombre o rol de una parte (propietario, arrendatario, codeudor); sin esto, todas las que faltan por aprobar' }, texto: { type: 'string', description: 'mensaje propio (si no, se usa el modelo de Asset)' }, confirmado: CONFIRMADO }, ['negocio']),
            ejecutar: (c: CtxHerr, a: Rec) => this.enviarARevision(c, a),
          },
          {
            name: 'enviar_contrato_arriendo',
            description: 'Envía a firmar el CONTRATO DE ARRIENDO ya APROBADO por todas las partes (el PDF de la última versión aprobada). Sin aprobación de todos no se puede.' + NOTA_ENVIAR,
            input_schema: esquema({ negocio: REF_NEG, confirmado: CONFIRMADO }, ['negocio']),
            ejecutar: (c: CtxHerr, a: Rec) => this.enviar(c, 'enviar_contrato_arriendo', d, a),
          },
        ];
      })(),
      // ---------------------------------------------------------------- promesa y escritura
      {
        name: 'preparar_promesa',
        description: 'Prepara la PROMESA DE COMPRAVENTA de un negocio de venta (la firman el comprador y los vendedores): guarda precio, pie, plazos, notaría e inscripción de dominio que dé el corredor y arma el PDF para revisarlo.' + NOTA_PREPARAR,
        input_schema: esquema(propsPromesa, ['negocio']),
        ejecutar: (c, a) => this.preparar(c, this.docs.promesa_compraventa, a),
      },
      {
        name: 'enviar_promesa',
        description: 'Envía a firmar la PROMESA DE COMPRAVENTA de un negocio de venta. Al firmarse avanzan el paso «Promesa firmada» y el negocio.' + NOTA_ENVIAR,
        input_schema: esquema({ ...propsPromesa, confirmado: CONFIRMADO }, ['negocio']),
        ejecutar: (c, a) => this.enviar(c, 'enviar_promesa', () => this.docs.promesa_compraventa, a),
      },
      ...(() => {
        const props = {
          negocio: REF_NEG,
          precio: { type: 'number', description: 'precio de la compraventa (si no está en el negocio)' },
          moneda: MONEDA,
          notaria: { type: 'string', description: 'notaría donde se otorga' },
          ciudad: { type: 'string' },
          fecha: { type: 'string', description: 'AAAA-MM-DD, fecha de la escritura' },
          fecha_entrega: { type: 'string', description: 'AAAA-MM-DD, entrega material (si no, en el acto)' },
          modo_pago: { type: 'string', enum: ['credito', 'contado'] },
          banco: { type: 'string', description: 'banco del crédito hipotecario' },
          deslindes: { type: 'string' },
          incluye: { type: 'string', description: 'lo que viene con el inmueble (estacionamiento, bodega…)' },
          personerias: { type: 'string', description: 'poderes o personerías de quienes comparecen representados' },
          rep_vendedor: { type: 'string' },
          rep_comprador: { type: 'string' },
          promesa_fecha: { type: 'string', description: 'AAAA-MM-DD, fecha de la promesa' },
          promesa_notaria: { type: 'string' },
          ...propsInscripcion,
          personas: PERSONAS,
        };
        return [
          {
            name: 'preparar_escritura',
            description: 'Prepara el BORRADOR (minuta) de ESCRITURA DE COMPRAVENTA de un negocio de venta, para llevar a la notaría y revisar con las partes. La escritura la otorga siempre una notaría; enviar el borrador a firmar es opcional. Arma el PDF y dice qué datos todavía no tiene (quedan en blanco).' + NOTA_PREPARAR,
            input_schema: esquema(props, ['negocio']),
            ejecutar: (c: CtxHerr, a: Rec) => this.preparar(c, this.docs.escritura_compraventa, a),
          },
          {
            name: 'enviar_escritura',
            description: 'Envía a firmar el BORRADOR de escritura de compraventa al comprador y a los vendedores (solo deja constancia de que aprueban el borrador; es opcional).' + NOTA_ENVIAR,
            input_schema: esquema({ ...props, confirmado: CONFIRMADO }, ['negocio']),
            ejecutar: (c: CtxHerr, a: Rec) => this.enviar(c, 'enviar_escritura', () => this.docs.escritura_compraventa, a),
          },
        ];
      })(),
      // ---------------------------------------------------------------- acta de entrega
      ...(() => {
        const props = {
          negocio: REF_NEG,
          fecha: { type: 'string', description: 'AAAA-MM-DD, fecha de la entrega' },
          entregado_por: { type: 'string', description: 'quien entrega en nombre de la corredora (si no, el corredor que arma el acta)' },
          entregado_por_rut: { type: 'string' },
          accesos: { type: 'array', description: 'llaves, controles y chips entregados', items: { type: 'object', properties: { nombre: { type: 'string', description: 'p. ej. llave puerta principal, control portón' }, cantidad: { type: 'number' } }, required: ['nombre', 'cantidad'] } },
          llaves: { type: 'string', description: 'texto libre sobre las llaves' },
          estacionamientos: { type: 'string', description: 'p. ej. «E-12 y E-13»' },
          bodega: { type: 'string' },
          gastos_comunes_desde: { type: 'string', description: 'AAAA-MM-DD, desde cuándo los gastos comunes son del arrendatario' },
          aspectos: { type: 'array', items: { type: 'string' }, description: 'aspectos generales («Grifería completa funcionando»…)' },
          medidores: { type: 'object', description: 'por medidor (luz, agua, aguaCaliente, gas, calefaccion): { numero, lectura }', additionalProperties: { type: 'object', properties: { numero: { type: 'string' }, lectura: { type: 'string' } } } },
          inventario: { type: 'array', description: 'espacios con su estado e ítems (se suman a lo ya cargado; repetir un espacio lo reemplaza)', items: { type: 'object', properties: { espacio: { type: 'string', description: 'p. ej. Living, Cocina, Baño 1' }, estado: { type: 'string', enum: ['bueno', 'regular', 'malo', 'no aplica'] }, nota: { type: 'string' }, items: { type: 'array', items: { type: 'object', properties: { nombre: { type: 'string' }, cantidad: { type: 'number' }, estado: { type: 'string', enum: ['bueno', 'regular', 'malo', 'no aplica'] }, nota: { type: 'string' } }, required: ['nombre'] } } }, required: ['espacio'] } },
          observaciones: { type: 'string' },
          foto_espacio: { type: 'string', description: 'si el corredor mandó fotos en este mensaje: el espacio del inventario al que pertenecen (hasta 6 por espacio)' },
          personas: PERSONAS,
        };
        return [
          {
            name: 'preparar_acta_entrega',
            description: 'Prepara el ACTA DE ENTREGA E INVENTARIO de un arriendo (la firman el arrendatario y los propietarios). Sirve para ir cargándola de a poco, por texto o nota de voz: cada llamada SUMA lo que dictó el corredor (espacios, ítems, medidores, accesos, fotos). Arma el PDF y dice qué falta (fecha de entrega e inventario).' + NOTA_PREPARAR,
            input_schema: esquema(props, ['negocio']),
            ejecutar: (c: CtxHerr, a: Rec) => this.preparar(c, this.docs.acta_entrega, a),
          },
          {
            name: 'enviar_acta_entrega',
            description: 'Envía a firmar el ACTA DE ENTREGA E INVENTARIO del arriendo. Al firmarse la propiedad queda arrendada.' + NOTA_ENVIAR,
            input_schema: esquema({ ...props, confirmado: CONFIRMADO }, ['negocio']),
            ejecutar: (c: CtxHerr, a: Rec) => this.enviar(c, 'enviar_acta_entrega', () => this.docs.acta_entrega, a),
          },
        ];
      })(),
      // ---------------------------------------------------------------- acta de visita
      {
        name: 'compartir_acta_visita',
        description:
          'Arma el PDF del ACTA DE VISITA (resumen, audios con su transcripción y fotos; no se firma) y entrega un enlace de descarga por 7 días. Por defecto el enlace es para el corredor. Con a_visitante: true se lo manda al visitante por WhatsApp (dos pasos: sin confirmado muestra el mensaje; con confirmado: true tras el sí del corredor lo envía; solo se puede si el visitante escribió en las últimas 24 h, si no se entrega el enlace al corredor).',
        input_schema: esquema({ negocio: REF_NEG, propiedad: REF_PROP, acta: { type: 'string', description: 'id del acta (si hay varias y el corredor eligió una)' }, a_visitante: { type: 'boolean', description: 'mandárselo al visitante por WhatsApp' }, confirmado: CONFIRMADO }),
        ejecutar: (c, a) => this.compartirActaVisita(c, a),
      },
    ];
  }
}

const fechaOk2 = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(txt(v, 10));
