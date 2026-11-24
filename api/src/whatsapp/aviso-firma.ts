// Aviso por WhatsApp al corredor que envió un documento a firmar, cada vez que alguien lo firma y cuando queda firmado por todos.
// Lo llama la revisión de firmas (firmas/ronda.ts) con lo que cambió; solo se avisa a quien lo envió (no al firmante ni a otros).
//  · Va a su celular vinculado, como texto libre, si él le escribió al número de la empresa en las últimas 24 h.
//  · Fuera de esa ventana no se manda nada (hace falta una plantilla de Meta, que aún no existe): el aviso queda igual en su app
//    (la ronda ya lo crea en la tabla avisos).
// Nunca lanza error: un fallo de WhatsApp no debe frenar la revisión de firmas.
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { enlaceOperacion } from '../documentos/envio-firma';
import { WechatiaError, WechatiaService } from './wechatia';
import { EnviadosService } from './enviados';

export interface FirmaAvisada {
  corredoraId: string;
  enviadoPorId: string | null;
  operacion: number | null;
  documento: string;
  firmados: number;
  total: number;
  /** quienes faltan por firmar (vacío si ya firmaron todos) */
  faltan: string[];
  /** los hechos nuevos: «Juan (visitante) firmó «Orden de visita»», ««Orden de visita» quedó firmado por todos» */
  cambios: string[];
  completo: boolean;
}

/** el texto del aviso (WhatsApp: *negrita*) */
export function textoAvisoFirma(f: FirmaAvisada): string {
  const lineas = f.cambios.map((c) => (f.completo && /qued[óo] firmado por todos/.test(c) ? `✅ ${c}` : `✍️ ${c}`));
  if (!f.completo) {
    lineas.push('', `Han firmado ${f.firmados} de ${f.total}.`);
    if (f.faltan.length) lineas.push(`Falta: ${f.faltan.join(', ')}.`);
  }
  if (f.operacion) lineas.push('', `Seguimiento de la operación: ${enlaceOperacion(f.operacion)}`);
  return lineas.join('\n').slice(0, 3500);
}

@Injectable()
export class AvisoFirmaService {
  private readonly log = new Logger('AvisoFirma');

  constructor(
    private readonly db: PrismaService,
    private readonly wa: WechatiaService,
    private readonly enviados: EnviadosService,
  ) {}

  /** 'texto' si salió por WhatsApp; 'app' si no se pudo (queda solo en la app) */
  async avisar(f: FirmaAvisada): Promise<'texto' | 'app'> {
    try {
      if (!f.enviadoPorId || !f.cambios.length) return 'app';
      const v = await this.db.waVinculo.findUnique({ where: { usuarioId: f.enviadoPorId } });
      if (!v?.activo || !v.telefono) return 'app';
      const cli = await this.wa.cliente(f.corredoraId);
      if (!cli) return 'app';
      const u = await this.db.usuario.findUnique({ where: { id: f.enviadoPorId }, select: { nombre: true } });
      const texto = textoAvisoFirma(f);
      const r = await cli.enviar({ telefono: v.telefono, nombre: u?.nombre ?? '', texto, revisiones: 2 });
      await this.enviados.registrar(f.corredoraId, v.telefono, { messageId: r.messageId, texto, enHilo: false });
      return 'texto';
    } catch (e) {
      // FUERA_24H es lo esperado cuando firman días después: queda en la app
      if (!(e instanceof WechatiaError && e.codigo === 'FUERA_24H')) this.log.warn(`aviso de firma por WhatsApp: ${(e as Error).message}`);
      return 'app';
    }
  }
}
