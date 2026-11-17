// Texto de un PDF con pdf.js (lo carga index.html como pdfjsLib): hasta 40 páginas o 60.000 caracteres.
/* eslint-disable @typescript-eslint/no-explicit-any -- pdf.js no tiene tipos en la app */
export async function textoDePdf(bytes: Uint8Array): Promise<string> {
  const doc = await (window as any).pdfjsLib.getDocument({ data: bytes, isEvalSupported: false, standardFontDataUrl: 'vendor/standard_fonts/', cMapUrl: 'vendor/cmaps/', cMapPacked: true }).promise;
  let txt = '';
  for (let i = 1; i <= Math.min(doc.numPages, 40); i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    txt += c.items.map((x: any) => x.str + (x.hasEOL ? '\n' : ' ')).join('') + '\n\n';
    if (txt.length > 60000) break;
  }
  doc.destroy();
  return txt.replace(/[ \t]+/g, ' ').trim();
}

/** guarda en el computador un PDF que está en memoria (base64), con el diálogo «Guardar como»: para quien no quiere firmar en Asset */
export async function descargarPdf(base64: string, nombre: string): Promise<string | null> {
  const bin = atob(base64); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const pf = window.pf as unknown as { edSave: (b: Uint8Array, n: string) => Promise<{ ok: boolean; data?: string | null; error?: string }> };
  const r = await pf.edSave(bytes, nombre.replace(/[\/:*?"<>|]+/g, '-'));
  if (!r.ok) throw new Error(r.error || 'No pude guardar el PDF.');
  return r.data ?? null;
}
