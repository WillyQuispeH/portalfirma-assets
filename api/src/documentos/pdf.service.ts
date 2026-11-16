// HTML → PDF en el servidor, con Chromium (puppeteer-core: no descarga nada, usa el Chromium del servidor).
//  · PDF_CHROMIUM: ruta del ejecutable (en Docker alpine: /usr/bin/chromium, que se instala en el Dockerfile).
//  · Un solo navegador compartido, que se abre al primer PDF y se cierra con la API; cada PDF usa su propia pestaña.
import { Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { existsSync } from 'node:fs';
import puppeteer, { type Browser } from 'puppeteer-core';

const RUTAS = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];

@Injectable()
export class PdfService implements OnModuleDestroy {
  private readonly log = new Logger('Pdf');
  private nav: Promise<Browser> | null = null;

  private ruta() {
    const r = process.env.PDF_CHROMIUM || RUTAS.find((x) => existsSync(x));
    if (!r || !existsSync(r))
      throw new ServiceUnavailableException(
        'El servidor no tiene Chromium para generar el PDF (variable PDF_CHROMIUM).',
      );
    return r;
  }

  private navegador() {
    this.nav ??= puppeteer
      .launch({
        executablePath: this.ruta(),
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      })
      .then((b) => {
        b.on('disconnected', () => (this.nav = null));
        return b;
      })
      .catch((e: Error) => {
        this.nav = null;
        this.log.error(`no abrió Chromium: ${e.message}`);
        throw new ServiceUnavailableException(`No pude abrir Chromium para el PDF: ${e.message}`);
      });
    return this.nav;
  }

  /** el PDF (A4) de un HTML ya lleno */
  async pdf(html: string): Promise<Buffer> {
    const b = await this.navegador();
    const p = await b.newPage();
    try {
      await p.setJavaScriptEnabled(false); // el documento es solo texto y estilo
      await p.setContent(html, { waitUntil: 'load', timeout: 30_000 });
      const bytes = await p.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
      return Buffer.from(bytes);
    } finally {
      await p.close().catch(() => null);
    }
  }

  async onModuleDestroy() {
    const b = await this.nav?.catch(() => null);
    await b?.close().catch(() => null);
  }
}
