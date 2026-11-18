// Envío de un PDF que armó Asset a firmar con Portalfirma: lo sube (ingest) y crea la operación (send_to_sign) con los
// firmantes. Lo usan la orden de visita y la carta oferta. La firma la agrega Portalfirma en su propia hoja: el PDF no
// lleva cajas ni coordenadas de firma.
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PortalfirmaService } from '../conexiones/portalfirma';
import { GoogleService, type IRefDrive } from '../conexiones/google';

export interface FirmanteEnvio {
  rut: string;
  fullName: string;
  email: string;
  phone?: string;
  /** el rol en el documento (visitante, oferente…) */
  alias: string;
  typeSign?: 'simple' | 'avanzada' | 'visada' | 'enrolada';
}

/** el número de operación que devuelve Portalfirma al enviar a firmar (en JSON o dentro del texto) */
export function operacionDe(r: unknown): number | null {
  if (r == null) return null;
  if (typeof r === 'number') return r;
  if (typeof r === 'string') {
    try {
      return operacionDe(JSON.parse(r));
    } catch {
      const m = /operaci[oó]n\D{0,12}(\d{3,})/i.exec(r) || /operation\D{0,12}(\d{3,})/i.exec(r);
      return m ? Number(m[1]) : null;
    }
  }
  if (typeof r === 'object') {
    const o = r as Record<string, unknown>;
    const v = o.operation ?? o.operacion ?? o.operationNumber ?? o.numberOperation ?? o.operation_number;
    if (v != null && Number(v)) return Number(v);
    for (const k of Object.keys(o)) {
      const x = o[k];
      if (typeof x === 'object' && x) {
        const d = operacionDe(x);
        if (d) return d;
      }
    }
    if (typeof o.message === 'string') return operacionDe(o.message);
    if (typeof o.text === 'string') return operacionDe(o.text);
  }
  return null;
}

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

@Injectable()
export class EnvioFirmaService {
  private readonly log = new Logger('EnvioFirma');
  constructor(
    private readonly db: PrismaService,
    private readonly pf: PortalfirmaService,
    private readonly google: GoogleService,
  ) {}

  private async herramienta(corredoraId: string, args: Record<string, unknown>, nombre: string) {
    const r = await this.pf.llamarComo({ corredoraId, usuarioId: null }, nombre, args);
    const texto = (r.content || [])
      .map((c) => (c.type === 'text' ? (c.text ?? '') : ''))
      .join('\n')
      .trim();
    return { texto, error: !!r.isError || /^\s*Error\b/.test(texto) };
  }

  /** el correo del pagador de Portalfirma: el de la configuración de la corredora, o el de quien envía */
  private async pagadorDe(corredoraId: string, respaldo: string) {
    const f = await this.db.registro.findUnique({
      where: { corredoraId_coleccion_id: { corredoraId, coleccion: 'corredora_config', id: 'corredora' } },
    });
    const e = String(((f?.datos ?? {}) as { payerEmail?: string }).payerEmail ?? '').trim();
    return emailOk(e) ? e : respaldo;
  }

  /** sube el PDF y lo envía a firmar (cobra del saldo de Portalfirma); devuelve la operación o qué falló */
  async enviar(o: {
    corredoraId: string;
    /** si la corredora no tiene correo de pagos configurado, el de quien envía */
    pagadorRespaldo: string;
    /** quien lo envía: si conectó su Google Drive, ahí también queda una copia (y en el Drive de la empresa, si está conectado) */
    usuarioId?: string;
    /** de qué es el documento (tipo, propiedad y negocio): decide en qué carpetas de Drive queda la copia; sin esto, «Documentos enviados a firmar» */
    drive?: IRefDrive;
    bytes: Buffer;
    nombreArchivo: string;
    firmantes: FirmanteEnvio[];
    /** trámite notarial: none (por defecto) o legalization (legalizado) */
    protocolizacion?: 'none' | 'legalization';
  }): Promise<{ operacion: number } | { error: string }> {
    try {
      const ing = await this.herramienta(
        o.corredoraId,
        { source: 'base64', base64: o.bytes.toString('base64'), filename: o.nombreArchivo },
        'ingest_document_tools',
      );
      let docId: string | null = null;
      try {
        const j = JSON.parse(ing.texto) as { document_id?: string; fileId?: string; id?: string };
        docId = j.document_id || j.fileId || j.id || null;
      } catch {
        /* sin JSON */
      }
      if (ing.error || !docId)
        return { error: `Portalfirma no recibió el PDF${ing.texto ? `: ${ing.texto.slice(0, 200)}` : '.'}` };
      const r = await this.herramienta(
        o.corredoraId,
        {
          document_id: docId,
          email: await this.pagadorDe(o.corredoraId, o.pagadorRespaldo),
          protocolization: o.protocolizacion ?? 'none',
          signatories: o.firmantes.map((f) => ({
            rut: f.rut,
            fullName: f.fullName,
            email: f.email,
            ...(f.phone ? { phone: f.phone } : {}),
            alias: f.alias,
            typeSign: f.typeSign ?? 'simple',
          })),
        },
        'send_to_sign_document_tools',
      );
      if (r.error) return { error: `Portalfirma no pudo enviarla a firmar: ${r.texto.slice(0, 240)}` };
      const operacion = operacionDe(r.texto);
      if (operacion == null)
        return {
          error: `Portalfirma no devolvió el número de operación${r.texto ? `: ${r.texto.slice(0, 200)}` : '.'} Revisa «Mis operaciones» antes de reintentar.`,
        };
      // una copia en Drive (empresa y usuario, si los conectaron): sin esperar y sin que un fallo afecte el envío
      void this.google
        .subirDocumento({
          corredoraId: o.corredoraId,
          usuarioId: o.usuarioId,
          nombre: o.nombreArchivo,
          bytes: o.bytes,
          ref: o.drive,
        })
        .catch(() => null);
      return { operacion };
    } catch (e) {
      const m = (e as { response?: { codigo?: string } }).response;
      if (m?.codigo === 'NECESITA_CONEXION')
        return {
          error:
            'La corredora no tiene Portalfirma conectado: el administrador debe conectarlo en Asset › Integraciones.',
        };
      this.log.error(`envío a firmar: ${(e as Error).message}`);
      return { error: `No pude enviar el documento a firmar: ${(e as Error).message}` };
    }
  }
}
