// Archivos en Cloudflare R2 (API compatible con S3). La API nunca recibe los bytes: entrega una URL firmada de corta
// duración y la app sube directo a R2; después confirma, y la API revisa que el archivo exista y pese lo declarado.
//
// Claves: c/<corredora>/p/<propiedad>/<fotos|docs>/<uuid>.<ext>. El bucket es público (por R2_DOMAIN), así que la
// protección de los documentos es que su clave es un UUID imposible de adivinar y que solo la API la entrega (con un
// link firmado). Las fotos se guardan con su URL pública completa.
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import type { Env } from '../config/env';

export const SUBIDA_SEGUNDOS = 15 * 60;
export const DESCARGA_SEGUNDOS = 5 * 60;

@Injectable()
export class AlmacenamientoService {
  private readonly s3: S3Client;
  private readonly bucket: string;
  readonly dominio: string;

  constructor(config: ConfigService<Env, true>) {
    this.s3 = new S3Client({
      region: 'auto',
      endpoint: config.get('R2_ENDPOINT', { infer: true }),
      credentials: {
        accessKeyId: config.get('R2_ACCESS_KEY_ID', { infer: true }),
        secretAccessKey: config.get('R2_SECRET_ACCESS_KEY', { infer: true }),
      },
      // R2 no acepta los checksums que el SDK nuevo agrega por defecto en las URLs firmadas
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    this.bucket = config.get('R2_BUCKET', { infer: true });
    this.dominio = config.get('R2_DOMAIN', { infer: true });
  }

  nuevaClave(corredoraId: string, propiedadId: string, carpeta: 'fotos' | 'docs', ext: string, ref?: string) {
    const e = ext
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 8);
    const r = ref ? ref.replace(/[^\w-]/g, '').slice(0, 48) + '_' : '';
    return `c/${corredoraId}/p/${propiedadId}/${carpeta}/${r}${randomUUID()}${e ? '.' + e : ''}`;
  }

  /** Clave de un archivo de la conversación de un lead (foto, audio, video o documento que mandó el cliente). */
  claveLead(corredoraId: string, leadId: string, ext: string) {
    const e = ext
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 8);
    return `c/${corredoraId}/l/${leadId.replace(/[^\w-]/g, '')}/${randomUUID()}${e ? '.' + e : ''}`;
  }

  /** URL firmada para un PUT con ese tipo y tamaño exactos (R2 rechaza otro tamaño). */
  urlSubida(clave: string, tipo: string, tamano: number) {
    return getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.bucket, Key: clave, ContentType: tipo, ContentLength: tamano }),
      { expiresIn: SUBIDA_SEGUNDOS, signableHeaders: new Set(['content-type', 'content-length']) },
    );
  }

  /** URL firmada para bajar un documento con su nombre original. */
  urlDescarga(clave: string, nombre: string) {
    const ascii = nombre.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '');
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: clave,
        ResponseContentDisposition: `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      }),
      { expiresIn: DESCARGA_SEGUNDOS },
    );
  }

  /** Tamaño del archivo en R2, o null si no está. */
  async tamano(clave: string): Promise<number | null> {
    try {
      const r = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: clave }));
      return r.ContentLength ?? 0;
    } catch (e) {
      const st = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (st === 404 || (e as Error).name === 'NotFound') return null;
      throw e;
    }
  }

  urlPublica(clave: string) {
    return `${this.dominio}/${clave}`;
  }

  /** La clave de una URL pública de este bucket (null si la foto está en otro lado, p. ej. importada). */
  claveDeUrl(url: string) {
    return url.startsWith(this.dominio + '/') ? decodeURIComponent(url.slice(this.dominio.length + 1)) : null;
  }

  /** Borra en segundo plano: si falla, el archivo queda huérfano pero no rompe la operación del usuario. */
  borrar(claves: string[]) {
    const l = [...new Set(claves.filter(Boolean))];
    if (!l.length) return;
    void (async () => {
      for (let i = 0; i < l.length; i += 1000)
        await this.s3.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: l.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
          }),
        );
    })().catch((e) => console.warn('[almacenamiento] no se pudieron borrar archivos:', (e as Error).message));
  }
}
